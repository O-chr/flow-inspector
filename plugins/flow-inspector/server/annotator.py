"""SKILL.md annotator: 既存 SKILL.md にフロー構造化マーカーを注入する。

仕様: docs/plans/2026-05-28-skill-md-convention-v1.md

入力: マーカー無しの SKILL.md (パス)
処理:
  1. parser_llm で X1+X2 ベースのフロー JSON を取得 (キャッシュ可)
  2. SKILL.md の見出し行とフロー JSON のノードを title でマッチ
  3. 各見出し末尾に `<!-- {type=... attrs} -->` を追加
  4. decision / parallel の境界に `<!-- {flow: yes|no|merge} -->` を行で挿入
  5. frontmatter に `flow_version: 1` を追加
  6. 本文は1文字も変更しない (マーカー追加のみ)

出力: 注釈付き SKILL.md (文字列)。dry_run=True なら書き戻さない、False で .bak.<date> 作成して書き戻し。

エントリーポイント:
   annotate_skill(skill_path, *, dry_run=True) -> AnnotationResult
"""
from __future__ import annotations
import asyncio
import difflib
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from .parser_llm import parse_skill_llm_async, _infer_project_dir
    from .codebase_scanner import scan_project_context
    from .explain import call_claude_cli
except ImportError:
    from parser_llm import parse_skill_llm_async, _infer_project_dir  # type: ignore
    from codebase_scanner import scan_project_context  # type: ignore
    from explain import call_claude_cli  # type: ignore


_HEADING_RE = re.compile(r"^(#{2,3})\s+(.+?)\s*$")
_META_TITLE_KEYS = (
    "前提条件", "前提", "全体フロー", "概要", "チェックリスト",
    "完了報告", "最終チェック", "セットアップ", "環境", "依存関係",
    "ワークフロー", "注意事項", "トラブルシューティング", "メモ", "参考",
    "備考", "TIPS",
    "prerequisite", "overview", "checklist", "setup", "installation",
    "workflow", "note", "tips", "troubleshooting", "reference",
)


@dataclass
class AnnotationResult:
    skill_path: str
    annotated_text: str
    diff: str
    nodes_matched: int
    nodes_total: int
    unmatched_titles: list[str] = field(default_factory=list)
    written: bool = False
    backup_path: str | None = None


# ───────── frontmatter helpers ─────────

def _split_frontmatter(text: str) -> tuple[str, str]:
    """Returns (frontmatter_block_including_dashes, body)."""
    if not text.startswith("---"):
        return "", text
    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            fm_block = "".join(lines[: i + 1])
            body = "".join(lines[i + 1:])
            return fm_block, body
    return "", text


# チャンク分割の境界検出用。適用段の _HEADING_RE (#{2,3}) より広く #{1,6} を境界とする
# (H1/H4-6 は適用段でノードに一致しないが、分割境界として使う分には無害)。
_CHUNK_HEADING_RE = re.compile(r"^#{1,6}\s")


def _split_body_into_chunks(body: str, limit: int) -> list[str]:
    """body を Markdown 見出し境界でセクションに割り、各チャンク <= limit 文字に貪欲パック。

    - 見出し行 (^#{1,6}\\s) で新セクション開始。先頭の前文は最初のセクションに含む。
    - 単独で limit を超えるセクションはそれ単体で 1 チャンク (limit 超過を許す)。
    - 連結すると元の body に戻る (ロスレス)。
    """
    lines = body.splitlines(keepends=True)
    sections: list[str] = []
    cur: list[str] = []
    for ln in lines:
        if _CHUNK_HEADING_RE.match(ln) and cur:
            sections.append("".join(cur))
            cur = [ln]
        else:
            cur.append(ln)
    if cur:
        sections.append("".join(cur))

    chunks: list[str] = []
    buf = ""
    for sec in sections:
        if buf and len(buf) + len(sec) > limit:
            chunks.append(buf)
            buf = sec
        else:
            buf += sec
    if buf:
        chunks.append(buf)
    return chunks


def _merge_v3_plans(plans: list[dict]) -> dict:
    """複数チャンクの挿入プランを 1 つにマージ。heading_exact で dedupe (先勝ち)。

    frontmatter_add は最初の非空値を採用し、無ければ flow_version:1 を補う。
    """
    merged: list[dict] = []
    seen: set[str] = set()
    fm_add: dict = {}
    for plan in plans:
        for fk, fv in (plan.get("frontmatter_add") or {}).items():
            fm_add.setdefault(fk, fv)
        for h in (plan.get("heading_markers") or []):
            he = (h.get("heading_exact") or "").strip()
            if not he or he in seen:
                continue
            seen.add(he)
            merged.append(h)
    fm_add.setdefault("flow_version", 1)
    return {"frontmatter_add": fm_add, "heading_markers": merged}


def _frontmatter_has_flow_version(fm_block: str) -> bool:
    return bool(re.search(r"^\s*flow_version\s*:\s*\d+\s*$", fm_block, re.MULTILINE))


def _add_flow_version(fm_block: str, version: int = 1) -> str:
    """frontmatter block の末尾 (前 `---` の上) に flow_version を挿入。

    既に存在すれば書き換え。
    """
    if not fm_block:
        return f"---\nflow_version: {version}\n---\n"
    if _frontmatter_has_flow_version(fm_block):
        return re.sub(
            r"^(\s*flow_version\s*:\s*)\d+\s*$",
            f"\\g<1>{version}",
            fm_block,
            flags=re.MULTILINE,
        )
    # Last `---` 行の前に挿入
    lines = fm_block.splitlines(keepends=True)
    # 最後の "---" 行 index
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == "---":
            lines.insert(i, f"flow_version: {version}\n")
            break
    return "".join(lines)


# ───────── heading <-> node マッチング ─────────

def _normalize_title(s: str) -> str:
    """マッチ用に正規化: backtick / 装飾除去、小文字化、空白圧縮。"""
    s = re.sub(r"<!--.*?-->", "", s)
    s = s.replace("`", "").replace("**", "").replace("*", "")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def _is_meta_heading(title: str) -> bool:
    t = title.lower()
    return any(kw in t or kw in title for kw in _META_TITLE_KEYS)


def _match_score(heading_title: str, node_title: str, node_subtitle: str = "") -> float:
    h = _normalize_title(heading_title)
    n = _normalize_title(node_title)
    if not h or not n:
        return 0.0
    if h == n:
        return 1.0
    if n in h or h in n:
        return 0.8
    # subtitle がパスっぽい時、heading にそのパスが含まれているか
    if node_subtitle:
        sub_norm = _normalize_title(node_subtitle)
        if sub_norm and sub_norm in h:
            return 0.7
    # ratio
    return difflib.SequenceMatcher(None, h, n).ratio()


def _infer_type_from_heading(title: str, body_after: list[str]) -> str:
    """LLM 出力にマッチしなかった見出し用のフォールバック型推論。

    title + 直後の本文 (次の見出しまで) を見て大雑把に type を決める。
    """
    text = title + " " + " ".join(body_after[:30])
    tl = title.lower()
    bl = text.lower()
    # 並列 / 分岐
    if any(kw in tl for kw in ("並列", "並行", "fan-out", "parallel")):
        return "parallel"
    if any(kw in tl for kw in ("分岐", "場合のみ", "ある場合", "ない場合", "あれば", "なければ", "?")):
        return "decision"
    # コード
    if "```bash" in bl or "```python" in bl or "```sh" in bl or re.search(r"`\$\s|`bash |`python3? ", bl):
        return "code"
    # ユーザー
    if any(kw in tl for kw in ("確認", "ヒアリング", "選択", "選ぶ", "出力", "報告", "入力")):
        return "user"
    # 思考
    if any(kw in tl for kw in ("整形", "レビュー", "執筆", "ドラフト", "分析", "リサーチ", "調査", "要約", "構成", "考え")):
        return "think"
    return "think"


def _match_headings_to_nodes(body_lines: list[str], flow: dict) -> tuple[dict[int, tuple[dict, bool]], list[str]]:
    """各見出し行 → 対応するノード (or fallback) を決める。

    Returns:
      line_to_entry: { body_line_index: (node_or_synthetic, is_fallback) }
      unmatched_node_titles: LLM ノードのうち見出しに対応付けできなかったもの (情報用)
    """
    headings: list[tuple[int, int, str]] = []  # (line_idx, level, title)
    for i, line in enumerate(body_lines):
        m = _HEADING_RE.match(line)
        if not m:
            continue
        level = len(m.group(1))
        title = m.group(2).strip()
        if _is_meta_heading(title):
            continue
        headings.append((i, level, title))

    nodes = list(flow.get("nodes", []))
    line_to_entry: dict[int, tuple[dict, bool]] = {}
    used_node_ids: set = set()

    THRESHOLD = 0.30  # マッチ閾値 (低めに設定)
    CLOSE_TIE = 0.15  # スコア差がこれ以下ならタイブレーカ発動

    for hi, (line_idx, _level, htitle) in enumerate(headings):
        # 直後の本文を集める (次の見出しまで) — タイブレーカ用
        next_line_idx = headings[hi + 1][0] if hi + 1 < len(headings) else len(body_lines)
        body_after = body_lines[line_idx + 1 : next_line_idx]
        inferred_type = _infer_type_from_heading(htitle, body_after)

        # 全ノードのスコアを計算
        scored: list[tuple[dict, float]] = []
        for node in nodes:
            if node["id"] in used_node_ids:
                continue
            score = _match_score(htitle, node.get("title", ""), node.get("subtitle", ""))
            scored.append((node, score))
        scored.sort(key=lambda x: -x[1])

        if not scored or scored[0][1] < THRESHOLD:
            # Fallback: 見出し内容から型推論で synthetic node
            synthetic = {
                "id": f"_fallback_{hi}",
                "type": inferred_type,
                "title": htitle,
                "subtitle": "",
                "config": {},
            }
            line_to_entry[line_idx] = (synthetic, True)
            continue

        best, best_score = scored[0]
        # タイブレーカ: top と 2位 のスコア差が小さければ、型が一致するノードを優先
        if len(scored) >= 2 and best_score - scored[1][1] < CLOSE_TIE:
            for node, score in scored:
                if score < THRESHOLD:
                    break
                if node.get("type") == inferred_type:
                    best = node
                    best_score = score
                    break
        line_to_entry[line_idx] = (best, False)
        used_node_ids.add(best["id"])

    unmatched_node_titles = [
        n.get("title", n.get("id", "?"))
        for n in nodes
        if n["id"] not in used_node_ids
    ]
    return line_to_entry, unmatched_node_titles


# ───────── マーカー生成 ─────────

def _build_marker(node: dict) -> str:
    """ノードから HTML コメントマーカー文字列を組み立てる。"""
    ntype = node.get("type", "think")
    # board 由来フローは設定を node.meta に持つ (config は未生成) → meta フォールバック。
    cfg = node.get("config") or node.get("meta") or {}
    parts: list[str] = [ntype]

    # type ごとに有意な attrs を選んで載せる (raw prompt 等の長文は除く)
    if ntype == "hook":
        for k in ("matcher", "hook_type", "handler_type"):
            v = cfg.get(k)
            if v:
                parts.append(f'{k}={_quote_attr(v)}')
    elif ntype == "decision":
        cond = cfg.get("condition")
        if cond:
            parts.append(f'condition={_quote_attr(cond)}')
    elif ntype == "subagent":
        st = cfg.get("subagent_type") or cfg.get("agent")
        if st:
            parts.append(f'agent={_quote_attr(st)}')
    elif ntype == "mcp":
        # board meta は server/tool_name、settings.json 由来は mcp_server/mcp_tool_name。
        server = cfg.get("mcp_server") or cfg.get("server")
        tool = cfg.get("mcp_tool_name") or cfg.get("tool_name")
        if server:
            parts.append(f'mcp_server={_quote_attr(server)}')
        if tool:
            parts.append(f'mcp_tool_name={_quote_attr(tool)}')
    elif ntype == "skill":
        sn = cfg.get("skill_name") or cfg.get("skill") or cfg.get("file")
        if sn:
            parts.append(f'name={_quote_attr(sn)}')
    # code / user / parent / parallel / think: attrs 不要 (本文に書く)
    return "<!-- {" + " ".join(parts) + "} -->"


def _quote_attr(v: str) -> str:
    v = str(v).strip()
    if " " in v or "=" in v or '"' in v:
        v = v.replace('"', "'")
        return f'"{v}"'
    return v


# ───────── flow group markers 配置 ─────────

def _plan_flow_group_markers(flow: dict, line_to_node: dict[int, dict]) -> list[tuple[int, str]]:
    """decision / parallel の境界に挿入する <!-- {flow: yes/no/merge} --> を計画。

    Returns: [(insert_before_line_idx, marker_line), ...]
    """
    # ノード id -> 本文 line idx の逆引き
    node_to_line: dict[str, int] = {n["id"]: l for l, n in line_to_node.items()}

    insertions: list[tuple[int, str]] = []
    edges = flow.get("edges", [])

    # decision ノードごと
    for node in flow.get("nodes", []):
        if node.get("type") != "decision":
            continue
        dec_id = node["id"]
        dec_line = node_to_line.get(dec_id)
        if dec_line is None:
            continue

        yes_target = None
        no_target = None
        for e in edges:
            if e["from"] == dec_id and e.get("label") == "yes":
                yes_target = e["to"]
            elif e["from"] == dec_id and e.get("label") == "no":
                no_target = e["to"]

        # yes target が見出しと対応していれば、その行の直前に <!-- {flow: yes} -->
        if yes_target and yes_target in node_to_line:
            yes_line = node_to_line[yes_target]
            insertions.append((yes_line, "<!-- {flow: yes} -->"))

            # merge: no_target が定まっていればその行の直前に <!-- {flow: merge} -->
            if no_target and no_target in node_to_line:
                merge_line = node_to_line[no_target]
                insertions.append((merge_line, "<!-- {flow: merge} -->"))

    # parallel ごと (fan_out / fan_in / members)
    for par in flow.get("parallels", []):
        fan_in = par.get("fan_in")
        if fan_in and fan_in in node_to_line:
            insertions.append((node_to_line[fan_in], "<!-- {flow: merge} -->"))

    return insertions


# ───────── メイン処理 ─────────

# ───────── V2: LLM 直接 annotate (markdown 出力) ─────────

_V2_PROMPT_TEMPLATE = """\
あなたは Claude Code のスキル定義 (SKILL.md) にフロー構造化マーカーを挿入する専門家です。

## あなたの仕事

入力された SKILL.md に **HTML コメントマーカーだけを追加** して出力します。**本文は1文字も変えてはいけません**。

## ルール

### マーカー文法

各見出し (`##` / `###`) の **末尾** に次のいずれかを追加:

- `<!-- {{parent}} -->` — フローの起点・終点・統合点 (Claude 本体マーカー、プロンプト無し)
- `<!-- {{subagent agent=general-purpose}} -->` — Task / Agent ツールで委譲する別文脈エージェント
- `<!-- {{think}} -->` — メイン Claude が LLM 推論する個別タスク (執筆/要約/レビュー/整形)
- `<!-- {{code}} -->` — bash / python / node 等の決定論的コマンド実行
- `<!-- {{user}} -->` — ユーザー確認・入力依頼・出力提示
- `<!-- {{decision condition="質問形"}} -->` — 条件分岐
- `<!-- {{hook matcher=Write hook_type=PreToolUse}} -->` — settings.json の hook (AVAILABLE_HOOKS にあるものだけ)
- `<!-- {{mcp mcp_server=gmail}} -->` — 外部 MCP 連携 (AVAILABLE_MCP_SERVERS にあるものだけ)
- `<!-- {{parallel}} -->` — 並列実行ゲート
- `<!-- {{skill name=anthropic-skills:pptx}} -->` — 別スキル呼び出し

### グループマーカー (単独行で挿入)

`decision` ノードの直後・分岐の境界に行で挿入:

- `<!-- {{flow: yes}} -->` — yes ブランチ開始 (decision の直後)
- `<!-- {{flow: no}} -->` — no ブランチ開始
- `<!-- {{flow: merge}} -->` — 分岐 / 並列の合流、次の見出しから main flow 復帰

### メタ見出し (マーカー無し)

タイトルに以下を含む見出しは**マーカーを付けない** (フロー上のノードにしない):
前提条件 / 全体フロー / 概要 / チェックリスト / 完了報告 / 最終チェック / セットアップ / 環境 /
ワークフロー / 注意事項 / トラブルシューティング / メモ / 参考 / 備考 / TIPS

### ブロック粒度ルール

- `### N-M.` (階層番号 e.g. 3-1, 7-2) = 必ず独立ノード化 (マーカー必須)
- `### <動詞句>` (実装/実行/計測/作成/整形) = 独立ノード化
- `### <名詞句>` (ルール/フォーマット/仕様):
  - 「事前必読」「最初に X」系 + AVAILABLE_HOOKS にマッチあり → `hook` マーカー
  - その他 → 親見出しの内容としてマーカー無しで残す (= 親 prompt に統合の意味)
- `####` 以下の見出しは絶対にマーカー無し (フローのノードにならない)

### frontmatter

`flow_version: 1` を frontmatter に追加 (frontmatter 無しなら新規作成)。

## **絶対遵守**

1. **本文 (見出し以外の段落・コードブロック・箇条書き)** は1文字も変更禁止
2. **既存の見出しテキスト** も変更禁止 (`### 2. Whisperの存在確認` → そのまま)
3. **新しい見出しの追加禁止**
4. マーカー以外 (空白・改行) の挿入も最小限に
5. 出力 = 元の SKILL.md + マーカー (追加のみ)

## INPUT

### SKILL.md (skill: {name})

```markdown
{skill_body}
```

### AVAILABLE_HOOKS (settings.json 実物)

{hooks_block}

### AVAILABLE_MCP_SERVERS (.mcp.json 実物)

{mcp_block}

### AVAILABLE_SUBAGENTS (.claude/agents/ 実物)

{subagents_block}

---

マーカー付き SKILL.md の **全文** を出力 (markdown のみ、前置き禁止、コードフェンス禁止)。frontmatter の `---` から最後まで完全な markdown を返してください。
"""


async def _annotate_via_llm(skill_text: str, skill_name: str, context: dict) -> str:
    """V2: LLM に「マーカー付き markdown」を直接生成させる。"""
    def _fmt(items, fn, empty="(なし)"):
        if not items:
            return empty
        return "\n".join(fn(i) for i in items)

    hooks_block = _fmt(
        context.get("hooks", []),
        lambda h: f"  - {h['hook_type']}:{h['matcher']}  cmd={h.get('command','')[:80]}",
    )
    mcp_block = _fmt(
        context.get("mcp_servers", []),
        lambda m: f"  - {m['name']}",
    )
    subagents_block = _fmt(
        context.get("subagents", []),
        lambda a: f"  - {a['name']}: {a['description'][:60]}",
    )

    prompt = _V2_PROMPT_TEMPLATE.format(
        name=skill_name,
        skill_body=skill_text[:14000],
        hooks_block=hooks_block,
        mcp_block=mcp_block,
        subagents_block=subagents_block,
    )

    raw = await call_claude_cli(prompt, model="sonnet", timeout=600.0)

    # コードフェンス剥がし
    out = raw.strip()
    if out.startswith("```"):
        lines = out.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        out = "\n".join(lines).strip()

    return out


# ───────── V3: LLM は「挿入操作 JSON」を返し、コードが機械的にマーカーを挿入 ─────────

_V3_PROMPT_TEMPLATE = """\
あなたは Claude Code のスキル定義 (SKILL.md) を読んで、フロー構造化マーカーを **どこに何を挿入すべきか** を JSON で返す専門家です。

## 出力形式 (JSON only、前置き禁止)

```jsonc
{{
  "frontmatter_add": {{ "flow_version": "1" }},
  "heading_markers": [
    {{
      "heading_exact": "### 1. 入力の確認と意図確認",
      "type": "user",
      "attrs": {{}}
    }},
    {{
      "heading_exact": "### 2. Whisperの存在確認",
      "type": "code",
      "attrs": {{}}
    }},
    {{
      "heading_exact": "## Phase 1: 学習（リファレンスファイルがある場合のみ）",
      "type": "decision",
      "attrs": {{ "condition": "学習用リファレンスが存在するか?" }}
    }}
  ],
  "flow_group_inserts": [
    {{ "before_heading_exact": "### 対応する Claude 生成版を特定", "marker": "yes" }},
    {{ "before_heading_exact": "## Phase 2: ブリーフ作成", "marker": "merge" }}
  ]
}}
```

## 重要

- **`heading_exact`** は SKILL.md の見出し行 (`## ...` or `### ...`) と**完全一致**する文字列。バッククォート・太字・記号も含めて1文字も変えない。
- **メタ見出し** (前提条件 / 全体フロー / 概要 / チェックリスト / ワークフロー / 注意事項 / トラブルシューティング / メモ / 参考 / 備考 / TIPS / 完了報告 / 最終チェック / セットアップ / 環境) は **heading_markers に入れない** (= マーカー付けない = フローのノードにしない)。
- **####** 以下の見出しも heading_markers に入れない (常に親 prompt に統合)。

## ノード型の判定指針

- **parent**: フローの起点・終点・並列の合流点 (Claude 本体マーカー、attrs 空)
- **subagent**: Task / Agent ツールで委譲する別文脈エージェント — 「Agent ツールで」「Critics Agent」「Researcher」等の delegation 表現がある時のみ。attrs: `{{"agent": "general-purpose"}}`
- **think**: メイン Claude が LLM 推論する個別タスク (執筆/要約/レビュー/整形)
- **code**: bash / python / node 等の決定論的コマンド実行 (コードブロックを含むセクション)
- **user**: ユーザー確認・入力依頼・出力提示
- **decision**: 条件分岐。attrs: `{{"condition": "短い質問形"}}`
- **hook**: settings.json で実際に発火する自動介入 — **AVAILABLE_HOOKS にあるものだけ**。attrs: `{{"matcher": "Write", "hook_type": "PreToolUse"}}`
- **mcp**: 外部 MCP 連携 — **AVAILABLE_MCP_SERVERS にあるものだけ**。attrs: `{{"mcp_server": "gmail"}}`
- **parallel**: 並列実行ゲート (「**同時に**」「並列」「並行」)
- **skill**: 別スキル呼び出し (anthropic-skills:pptx 等)

## ブロック粒度ルール (絶対遵守)

1. `## Phase N` / `## Step N` / `## <動詞句>` = 1 ノード単位
2. `### N-M.` (階層番号 e.g. 3-1, 7-2) = 必ず独立ノード化
3. `### <動詞句>` (実装/実行/計測/作成/整形) = 独立ノード化
4. `### <名詞句>` (ルール/フォーマット/仕様):
   - 「事前必読」「最初に X」系 + AVAILABLE_HOOKS にマッチあり → hook
   - その他 → heading_markers に入れない (親見出しの prompt に含める)
5. `####` 以下の見出しは絶対に heading_markers に入れない

## グループマーカー (flow_group_inserts)

- decision の直後で yes ブランチが始まる場合: `{{"before_heading_exact": "<yes ブランチ最初の見出し>", "marker": "yes"}}`
- decision の no ブランチ (or 並列の合流点) で main flow に戻る場合: `{{"before_heading_exact": "<合流先見出し>", "marker": "merge"}}`
- 並列 fan-in の前: 同じく "merge"

heading_exact / before_heading_exact は**必ず元の SKILL.md の文字列と一致** (annotator 側がそれで照合する)。

## INPUT

### SKILL.md (skill: {name})

```markdown
{skill_body}
```

### AVAILABLE_HOOKS (settings.json 実物)

{hooks_block}

### AVAILABLE_MCP_SERVERS (.mcp.json 実物)

{mcp_block}

### AVAILABLE_SUBAGENTS (.claude/agents/ 実物)

{subagents_block}

---

JSON のみ出力 (前置き禁止)。"""


async def _generate_insertion_plan_v3(skill_text: str, skill_name: str, context: dict) -> dict:
    """V3: LLM に挿入操作 JSON を返させる。本文は触らない。"""
    def _fmt(items, fn, empty="(なし)"):
        if not items:
            return empty
        return "\n".join(fn(i) for i in items)

    hooks_block = _fmt(
        context.get("hooks", []),
        lambda h: f"  - {h['hook_type']}:{h['matcher']}  cmd={h.get('command','')[:80]}",
    )
    mcp_block = _fmt(
        context.get("mcp_servers", []),
        lambda m: f"  - {m['name']}",
    )
    subagents_block = _fmt(
        context.get("subagents", []),
        lambda a: f"  - {a['name']}: {a['description'][:60]}",
    )

    prompt = _V3_PROMPT_TEMPLATE.format(
        name=skill_name,
        skill_body=skill_text[:14000],
        hooks_block=hooks_block,
        mcp_block=mcp_block,
        subagents_block=subagents_block,
    )

    raw = await call_claude_cli(prompt, model="sonnet", timeout=600.0)
    from io_utils import extract_json_object
    try:
        return extract_json_object(raw)        # string-aware: braces in strings are safe
    except ValueError:
        raise ValueError("V3: no JSON object found in LLM output")


_V3_SINGLE_SHOT_LIMIT = 14000   # これ以下は従来どおり単発
_V3_CHUNK_CHAR_LIMIT = 12000    # チャンク 1 つあたりの目安上限


async def _generate_insertion_plan_v3_chunked(skill_text: str, skill_name: str,
                                              context: dict) -> dict:
    """長尺スキルでもマーカーが末尾まで付くよう、プラン生成を見出し境界で分割→マージ。

    本文 (適用対象) は触らない。分割するのは「LLM にプランを作らせる入力」だけ。
    """
    if len(skill_text) <= _V3_SINGLE_SHOT_LIMIT:
        return await _generate_insertion_plan_v3(skill_text, skill_name, context)
    # frontmatter は渡さず body チャンクだけを LLM に見せる: プラン生成は見出し/本文しか
    # 使わず、skill_name は引数で別途渡しているので frontmatter 不在でも欠落情報はない。
    _, body = _split_frontmatter(skill_text)
    chunks = _split_body_into_chunks(body, _V3_CHUNK_CHAR_LIMIT)
    # asyncio.gather は入力順で結果を返すので、_merge_v3_plans の先勝ち dedupe は
    # チャンク順 (= 文書順) で安定する。
    results = await asyncio.gather(*[
        _generate_insertion_plan_v3(chunk, skill_name, context) for chunk in chunks
    ], return_exceptions=True)
    # 1 チャンクのパース失敗/タイムアウトで skill 全体を巻き込まない: 成功したチャンクだけマージ。
    plans = [p for p in results if not isinstance(p, Exception)]
    if not plans:
        raise next(r for r in results if isinstance(r, Exception))   # 全滅時のみ失敗扱い
    return _merge_v3_plans(plans)


def _build_marker_from_v3(spec: dict) -> str:
    """V3 の {type, attrs} → `<!-- {type k=v ...} -->` 文字列。"""
    ntype = spec.get("type", "think")
    attrs = spec.get("attrs", {}) or {}
    parts: list[str] = [ntype]
    for k, v in attrs.items():
        if v is None or v == "":
            continue
        v_str = str(v).strip()
        if " " in v_str or "=" in v_str or '"' in v_str:
            v_str = v_str.replace('"', "'")
            parts.append(f'{k}="{v_str}"')
        else:
            parts.append(f'{k}={v_str}')
    return "<!-- {" + " ".join(parts) + "} -->"


def _apply_insertion_plan_v3(original: str, plan: dict) -> tuple[str, dict]:
    """LLM の挿入操作プランを原文に **機械的に適用**。本文改変ゼロ。

    Returns: (annotated_text, stats)
    """
    # frontmatter と body 分離
    fm_block, body = _split_frontmatter(original)
    body_lines = body.splitlines()

    # frontmatter に flow_version: 1 を追加
    fm_add = plan.get("frontmatter_add", {})
    if "flow_version" in fm_add:
        try:
            v = int(str(fm_add["flow_version"]).strip())
        except Exception:
            v = 1
        fm_block = _add_flow_version(fm_block, version=v)

    # heading 完全一致 → 行末にマーカー追加
    headings = plan.get("heading_markers", []) or []
    heading_to_marker: dict[str, str] = {}
    for h in headings:
        he = h.get("heading_exact", "").strip()
        if not he:
            continue
        marker = _build_marker_from_v3(h)
        heading_to_marker[he] = marker

    # flow group 挿入: before_heading_exact -> marker
    group_inserts = plan.get("flow_group_inserts", []) or []
    group_before: dict[str, list[str]] = defaultdict(list) if False else {}
    for g in group_inserts:
        bhe = g.get("before_heading_exact", "").strip()
        marker_kind = g.get("marker", "")
        if not bhe or not marker_kind:
            continue
        group_before.setdefault(bhe, []).append(f"<!-- {{flow: {marker_kind}}} -->")

    # body_lines を 1 行ずつ走査、heading 行に当たればマーカー追加
    # group_inserts はその heading の **前** に挿入
    out_lines: list[str] = []
    matched_headings = 0
    unmatched_heading_specs = list(heading_to_marker.keys())
    matched_groups = 0
    for line in body_lines:
        stripped = line.strip()
        # group insert (before this heading)
        if stripped in group_before:
            for marker_line in group_before[stripped]:
                out_lines.append(marker_line)
                matched_groups += 1
        # heading marker (append at end of line)
        if stripped in heading_to_marker:
            marker = heading_to_marker[stripped]
            # 既存マーカー除去
            cleaned = re.sub(r"\s*<!--.*?-->\s*$", "", line).rstrip()
            out_lines.append(f"{cleaned} {marker}")
            matched_headings += 1
            if stripped in unmatched_heading_specs:
                unmatched_heading_specs.remove(stripped)
        else:
            out_lines.append(line)

    annotated = fm_block + "\n".join(out_lines)
    if original.endswith("\n") and not annotated.endswith("\n"):
        annotated += "\n"

    stats = {
        "headings_in_plan": len(heading_to_marker),
        "headings_matched": matched_headings,
        "headings_unmatched_in_plan": unmatched_heading_specs,
        "group_inserts_in_plan": sum(len(v) for v in group_before.values()),
        "group_inserts_matched": matched_groups,
    }
    return annotated, stats


def _check_text_preservation(original: str, annotated: str) -> tuple[bool, str]:
    """V2/V3 出力が「本文改変なし」を保証してるか検査。

    マーカー (`<!-- {...} -->`) と frontmatter の `flow_version: 1` 以外の
    差分があれば不正と判定。

    フロンドマターが annotator によって新規追加された場合 (元が no-frontmatter)、
    その `---\\nflow_version: 1\\n---` ブロック 3 行は丸ごと除外する。
    """
    _MARKER_INLINE = re.compile(r"\s*<!--\s*\{[^}]+\}\s*-->\s*")
    _MARKER_LINE_ONLY = re.compile(r"^\s*<!--\s*\{[^}]+\}\s*-->\s*$")

    original_had_frontmatter = original.lstrip().startswith("---")

    def strip_markers(text, is_annotated=False):
        # annotator が frontmatter を新規追加した場合、それを丸ごと取り除く
        if is_annotated and not original_had_frontmatter and text.lstrip().startswith("---"):
            lines = text.splitlines()
            # 最初の `---` の次の `---` までを synthetic frontmatter として削除
            for i, line in enumerate(lines[1:], start=1):
                if line.strip() == "---":
                    text = "\n".join(lines[i + 1:])
                    text = text.lstrip("\n")
                    break
        out_lines: list[str] = []
        for line in text.splitlines():
            if _MARKER_LINE_ONLY.match(line):
                continue
            cleaned = _MARKER_INLINE.sub("", line)
            if re.match(r"^\s*flow_version\s*:\s*\d+\s*$", cleaned):
                continue
            out_lines.append(cleaned.rstrip())
        while len(out_lines) >= 2 and out_lines[-1] == "" and out_lines[-2] == "":
            out_lines.pop()
        return "\n".join(out_lines).strip()

    a = strip_markers(original, is_annotated=False)
    b = strip_markers(annotated, is_annotated=True)
    if a == b:
        return True, ""
    a_lines = a.splitlines()
    b_lines = b.splitlines()
    if len(a_lines) != len(b_lines):
        return False, f"行数が違う: 元={len(a_lines)} 改変後={len(b_lines)}"
    for i, (al, bl) in enumerate(zip(a_lines, b_lines)):
        if al != bl:
            return False, f"line {i + 1} が改変されている:\n  元: {al!r}\n  後: {bl!r}"
    return False, "(差分検出失敗)"


async def annotate_skill_async(skill_path: str, *, dry_run: bool = True, variant: str = "v1") -> AnnotationResult:
    """SKILL.md にマーカーを注入。dry_run=True なら書き戻さず差分のみ返す。

    variant:
      - "v1": flow JSON 経由 (parser_llm + heading match)
      - "v2": LLM に直接 markdown 出力させる (本文改変チェック付き)
    """
    p = Path(skill_path)
    original = p.read_text(encoding="utf-8")
    project_dir = _infer_project_dir(p)

    # V3: LLM が「挿入操作 JSON」だけを返し、コード側が機械的に適用 (本文改変ゼロ)
    if variant == "v3":
        skill_name = p.parent.name if p.stem == "SKILL" else p.stem
        m = re.search(r"^name:\s*(\S+)", original, re.MULTILINE)
        if m:
            skill_name = m.group(1).strip()
        context = scan_project_context(project_dir, exclude_skill_name=skill_name)
        plan = await _generate_insertion_plan_v3_chunked(original, skill_name, context)
        annotated, stats = _apply_insertion_plan_v3(original, plan)

        # Safety: 本文改変チェック (機械的挿入なので原理的に保証されてるが念のため)
        ok, msg = _check_text_preservation(original, annotated)
        if not ok:
            raise RuntimeError(f"V3 annotator: 本文改変検出 ({msg}). aborting.")

        diff = "".join(difflib.unified_diff(
            original.splitlines(keepends=True),
            annotated.splitlines(keepends=True),
            fromfile=f"{p.name} (original)",
            tofile=f"{p.name} (annotated v3)",
            n=3,
        ))
        result = AnnotationResult(
            skill_path=str(p),
            annotated_text=annotated,
            diff=diff,
            nodes_matched=stats["headings_matched"],
            nodes_total=stats["headings_in_plan"],
            unmatched_titles=stats["headings_unmatched_in_plan"],
        )
        result.__dict__["variant"] = "v3"
        result.__dict__["stats"] = stats

        if not dry_run:
            date_tag = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup = p.with_suffix(p.suffix + f".bak.{date_tag}")
            shutil.copy2(p, backup)
            p.write_text(annotated, encoding="utf-8")
            result.written = True
            result.backup_path = str(backup)
        return result

    # V2: LLM 直接 annotate
    if variant == "v2":
        skill_name = p.parent.name if p.stem == "SKILL" else p.stem
        m = re.search(r"^name:\s*(\S+)", original, re.MULTILINE)
        if m:
            skill_name = m.group(1).strip()
        context = scan_project_context(project_dir, exclude_skill_name=skill_name)
        annotated = await _annotate_via_llm(original, skill_name, context)

        # Safety: 本文改変チェック
        ok, msg = _check_text_preservation(original, annotated)
        if not ok:
            raise RuntimeError(f"V2 annotator: 本文改変検出 ({msg}). aborting.")

        # 末尾改行を維持
        if original.endswith("\n") and not annotated.endswith("\n"):
            annotated += "\n"

        diff = "".join(difflib.unified_diff(
            original.splitlines(keepends=True),
            annotated.splitlines(keepends=True),
            fromfile=f"{p.name} (original)",
            tofile=f"{p.name} (annotated v2)",
            n=3,
        ))

        result = AnnotationResult(
            skill_path=str(p),
            annotated_text=annotated,
            diff=diff,
            nodes_matched=annotated.count("<!--"),  # マーカー数
            nodes_total=0,
            unmatched_titles=[],
        )
        result.__dict__["variant"] = "v2"

        if not dry_run:
            date_tag = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup = p.with_suffix(p.suffix + f".bak.{date_tag}")
            shutil.copy2(p, backup)
            p.write_text(annotated, encoding="utf-8")
            result.written = True
            result.backup_path = str(backup)
        return result

    # V1 (現状): parser_llm を呼んでフロー JSON 取得
    flow = await parse_skill_llm_async(
        skill_path, layer="project", project_dir=project_dir,
        enable_ref_subagents=True,
    )

    # frontmatter と body に分離
    fm_block, body = _split_frontmatter(original)
    body_lines = body.splitlines()

    # 見出し ↔ ノード マッチング (fallback 付き)
    line_to_entry, unmatched = _match_headings_to_nodes(body_lines, flow)
    # 互換用: 純粋な node 辞書 (fallback synthetic 含む) も保持
    line_to_node: dict[int, dict] = {li: e[0] for li, e in line_to_entry.items()}

    # 各見出しの末尾に type マーカーを追加
    for line_idx, (node, is_fallback) in line_to_entry.items():
        line = body_lines[line_idx]
        if "<!--" in line:  # 既存マーカーがあれば置き換え (簡易)
            line = re.sub(r"\s*<!--.*?-->\s*$", "", line)
        marker = _build_marker(node)
        suffix = "" if not is_fallback else " "  # fallback 識別子は付けない (将来 attr で追加可)
        body_lines[line_idx] = f"{line}{suffix} {marker}"

    # flow group マーカーを計画 → 行挿入 (line idx を維持するため逆順で挿入)
    group_inserts = _plan_flow_group_markers(flow, line_to_node)
    # 重複削除
    seen_inserts: set = set()
    unique_inserts = []
    for li, mk in group_inserts:
        key = (li, mk)
        if key in seen_inserts:
            continue
        seen_inserts.add(key)
        unique_inserts.append(key)
    for li, mk in sorted(unique_inserts, key=lambda x: x[0], reverse=True):
        body_lines.insert(li, mk)

    # frontmatter に flow_version: 1 を追加
    new_fm = _add_flow_version(fm_block, version=1)

    annotated = new_fm + "\n".join(body_lines)
    # 末尾改行を維持
    if original.endswith("\n") and not annotated.endswith("\n"):
        annotated += "\n"

    diff = "".join(difflib.unified_diff(
        original.splitlines(keepends=True),
        annotated.splitlines(keepends=True),
        fromfile=f"{p.name} (original)",
        tofile=f"{p.name} (annotated)",
        n=3,
    ))

    matched_real = sum(1 for _, is_fb in line_to_entry.values() if not is_fb)
    matched_fallback = sum(1 for _, is_fb in line_to_entry.values() if is_fb)
    result = AnnotationResult(
        skill_path=str(p),
        annotated_text=annotated,
        diff=diff,
        nodes_matched=matched_real,
        nodes_total=len(flow.get("nodes", [])),
        unmatched_titles=unmatched,
    )
    # 補助情報
    result.__dict__["headings_total"] = len(line_to_entry)
    result.__dict__["headings_fallback"] = matched_fallback

    if not dry_run:
        # バックアップ作成
        date_tag = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = p.with_suffix(p.suffix + f".bak.{date_tag}")
        shutil.copy2(p, backup)
        p.write_text(annotated, encoding="utf-8")
        result.written = True
        result.backup_path = str(backup)

    return result


def annotate_skill(skill_path: str, *, dry_run: bool = True, variant: str = "v1") -> AnnotationResult:
    """同期ラッパー。"""
    return asyncio.run(annotate_skill_async(skill_path, dry_run=dry_run, variant=variant))
