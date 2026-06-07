"""LLM-based skill parser (Approach C from parser-eval experiment).

実験 (experiments/parser-eval/) で C アプローチが最良 (0.92 vs 現行 rule の 0.42)
だったので、その 2 段階プロンプト戦略を本実装に移植。さらに ハイブリッド設計で:

  1. codebase_scanner で settings.json / .mcp.json / agents/ から実物データ抽出
  2. それを LLM プロンプトに「使える道具リスト」として渡し、幻覚を防ぐ
  3. LLM 出力後、hook / subagent / mcp ノードに **実物の matcher / command /
     file path を bind** する後処理

キャッシュ: ~/.cache/flow-inspector/parser-llm/<sha256>.json
キーは SKILL.md 内容 + codebase_context fingerprint の sha256。

LLM 呼び出しは explain.call_claude_cli を再利用 (sonnet モデル + 180s タイムアウト)。
"""
from __future__ import annotations
import asyncio
import hashlib
import json
import re
from pathlib import Path

try:
    # Package-relative imports (FastAPI でモジュールとして読まれる場合)
    from .codebase_scanner import (
        scan_project_context,
        find_hook_for,
        find_subagent_for,
        find_mcp_server_for,
        find_sibling_skill_for,
    )
    from .explain import call_claude_cli
except ImportError:
    # Standalone fallback (sys.path に server/ を入れて直接読む場合)
    from codebase_scanner import (
        scan_project_context,
        find_hook_for,
        find_subagent_for,
        find_mcp_server_for,
        find_sibling_skill_for,
    )
    from explain import call_claude_cli


CACHE_DIR = Path.home() / ".cache" / "flow-inspector" / "parser-llm"
LLM_TIMEOUT_SEC = 600       # SKILL.md パースは長文 → 余裕を持って 10 分 (X1 でプロンプト膨張)
LLM_MODEL = "sonnet"        # haiku は JSON 構造化で精度が落ちる
SUB_AGENT_MODEL = "haiku"   # 参照ファイル要約は haiku で十分 (X2)
SUB_AGENT_TIMEOUT_SEC = 90  # 参照ファイル要約は短いタスク
MAX_REFERENCED_FILES = 8    # 参照ファイル数の上限 (爆発防止)


# ───────── キャッシュ ─────────

def _cache_key(skill_text: str, context: dict) -> str:
    h = hashlib.sha256()
    h.update(skill_text.encode("utf-8"))
    h.update(json.dumps(context, sort_keys=True, ensure_ascii=False).encode("utf-8"))
    return h.hexdigest()


def _cache_load(key: str) -> dict | None:
    p = CACHE_DIR / f"{key}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _cache_save(key: str, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    (CACHE_DIR / f"{key}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ───────── プロンプト構築 ─────────

_PROMPT_TEMPLATE = """\
あなたは Claude Code のスキル定義 (SKILL.md) を読んで、実行ワークフローの構造を JSON にする専門家です。

## 出力形式 (厳密)

JSON のみ。前置き・解説・コードフェンス禁止。Schema:

```jsonc
{{
  "id": "skill-<name>",
  "name": "<name>",
  "category": "Skills",
  "nodes": [
    {{
      "id": "n1",
      "type": "parent|subagent|think|code|user|decision|hook|mcp|skill|parallel|trigger",
      "title": "短いタイトル (20-30 char、ファイルパス/矢印は subtitle へ)",
      "subtitle": "出力先ファイル名やサブ条件 (空可)",
      "desc": "本文サマリ (1-3行)",
      "config": {{}}
    }}
  ],
  "edges": [
    {{ "from": "n1", "to": "n2", "label": "yes|no|pass|block|..." }}
  ],
  "parallels": [
    {{ "id": "p1", "fan_out": "n5", "fan_in": "n10", "members": ["n6", "n7"] }}
  ]
}}
```

## ノード型の判別指針 (絶対遵守)

- **parent**: フローの起点・終点・並列の合流点だけに使う「親エージェント本体」マーカー。プロンプトは持たない (config = {{}})。中間ステップに parent を置かない (中間は think を使う)。
- **subagent**: Task / Agent ツールで**別文脈の専門エージェント**に委譲。"Critics Agent" "Researcher" 等の固有名 / "Agent ツールで〜" の delegation 表現がある時のみ。config: {{"subagent_type":"general-purpose|...", "prompt":"..."}}
- **think**: メイン Claude 自身が現在の文脈で**LLM 推論**する個別タスク (執筆・要約・整形・分析・レビュー)。delegation でなければここ。config: {{"prompt":"具体的な指示文"}}
- **code**: bash / python / node 等の**決定論的コマンド実行**。コードブロック・拡張子付ファイル作成等。config: {{"command":"..."}}
- **user**: ユーザーへの確認・入力依頼・最終出力提示。config: {{}}
- **decision**: 条件で次の処理を切り替える分岐点。config: {{"condition":"短い質問形"}}
- **hook**: settings.json で実際に発火する自動介入。**下記 AVAILABLE_HOOKS にある hook のみ作ること**。AVAILABLE_HOOKS が空ならフロー上に hook ノードを置かない。config: {{"hook_type":"PreToolUse|...", "matcher":"...", "handler_type":"command|...", "command":"..."}}
- **mcp**: 外部サービスとの MCP 連携呼び出し。**下記 AVAILABLE_MCP_SERVERS にある MCP のみ**。
- **skill**: 別スキル呼び出し (anthropic-skills:pptx 等)。
- **parallel**: 並列実行ゲート (fan-out / fan-in の 2 ノード)。

## ブロック境界ルール (絶対遵守、粒度の判定はここに従う)

SKILL.md からノードを取り出す粒度は、Markdown 見出しの階層と性質で決める:

1. **`## Phase N: ...` / `## Step N` / `## <動詞句>`** = フロー上の1つの単位ブロック (= 1 ノード以上)
   - 例外: タイトルに「前提条件 / 全体フロー / 最終チェックリスト / 完了報告 / 概要」を含む `##` はメタ情報。フロー上のノードにしない。
2. **`### N-M.` (階層番号、例: 3-1, 3-2, 7-1, 7-2, 7-3)** = 必ず**独立ノード**にする。Phase 内の並列メンバー or 順次サブステップ。
3. **`### <動詞句>` (例: 実装, 実行, 計測, 作成, 整形)** = 独立ノードにする。「**何をする** sub-step か」を表すので物理アクション。
4. **`### <名詞句>` (例: ルール, フォーマット, 仕様, 構成, 注意点)** = 性質で判断:
   - 「**事前に必ず読む**」「最初に X を実行」「X が無い場合はスキップ」系: AVAILABLE_HOOKS にマッチする設定があれば `hook` ノード、無ければ親 `##` ブロックの **desc/prompt に統合** (独立ノード化しない)
   - 「ルール / フォーマット / 仕様」系: 親ブロックの **prompt の中身として統合** (独立ノード化しない)
5. **`#### <任意のタイトル>`** = **常に**親 `###` ブロックの prompt に埋め込み (フロー上の独立ノードにしない、絶対に)
6. **コードブロック (```bash / ```python 等)** を含むセクション = `code` ノード候補。コマンドは `config.command` に。
7. 親 `##` の **説明文 + 列挙 (箇条書きで「これとこれを書く」みたいなリスト)** は親ブロックの prompt/desc に統合 (列挙の各 bullet を別ノードにしない)。

実例 (blog-writer SKILL.md より):

```
## Phase 2: ブリーフ作成
├─ ### 事前に必ず読むファイル     ← 名詞句 + 「事前必読」 → AVAILABLE_HOOKS に対応あれば hook、無ければ parent prompt に統合
├─ ### プロジェクトフォルダ作成    ← 動詞句 「作成」 → 独立 code ノード
└─ ### ブリーフ内容                ← 名詞句 「内容」(= 出力仕様)→ parent prompt に統合

## Phase 4: 構成案 → ドラフト執筆
├─ ### 4-1. 構成案作成     ← 番号 → 独立ノード
└─ ### 4-2. ドラフト執筆    ← 番号 → 独立ノード
   ├─ #### 納品フォーマット   ← #### → 4-2 の prompt に統合
   ├─ #### 絶対に守るルール   ← #### → 4-2 の prompt に統合
   ├─ #### 文体整形ルール     ← #### → 4-2 の prompt に統合
   └─ #### 固有名詞ルール     ← #### → 4-2 の prompt に統合
```

## 重要ルール

- **並列実行**: 本文に「**同時に**」「並列」「並行」とあれば `parallel` 型を fan-out / fan-in の 2 ノード作り `parallels` 配列にも登録。
- **条件分岐**: 「〜場合のみ」「〜があれば」「Yes/No 判定」等は `decision` 型で yes/no エッジを明示。
- **hook の幻覚を作らない**: 「事前に必ず〜を読む」等の本文指示は、AVAILABLE_HOOKS に対応する設定が無いなら hook ノードを作らず、その処理は前段の `user`/`code`/`think` で表現する。AVAILABLE_HOOKS に対応する設定があるならそれを当該タイミングに置く。
- **メイン Claude vs サブエージェント**: 「Agent ツールで〜」「Researcher」「Critics Agent」のように**別文脈エージェント起動が明示**された時のみ subagent。「Claude が書く / 整形する / 分析する」は think。
- **タイトル短く**: 矢印 (`→`) や ファイルパスは subtitle へ。バッククォートとマークダウン装飾は剥がす。

## 2段階パース (思考プロセス)

頭の中で以下の順で進める (出力は最終 JSON のみ):

### パス1: 構造抽出 (頭の中だけ)
1. このスキルの Phase / Step を列挙
2. 各 Phase の依存関係 (順次 or 並列 or 分岐)
3. 並列グループ / 条件分岐 / hook 発火タイミングを特定
4. AVAILABLE_* リストを見て、本文と対応する hook / subagent / mcp を確認

### パス2: ノード化 (JSON 出力)
構造を元に node / edge / parallel を組み立て、JSON だけを出力。

---

## INPUT

### SKILL.md (skill name: {name})

{skill_body}

### AVAILABLE_HOOKS (実物 settings.json で定義済み — 該当タイミングだけに参照すること)

{hooks_block}

### AVAILABLE_MCP_SERVERS (実物 .mcp.json で定義済み)

{mcp_block}

### AVAILABLE_SUBAGENTS (実物 .claude/agents/ で定義済み)

{subagents_block}

### SIBLING_SKILLS (同じプロジェクト内の他スキル — skill ノードで参照可)

{sibling_skills_block}

### REFERENCED_FILES_SUMMARY (SKILL.md から参照されてる外部ファイルを sub-agent が要約済み)

これらは「Claude が当該ファイルを Read した時に何をするか」の事前要約。該当ノードの config.prompt や desc を書く時に**反映すること** (中身を読まずに「writer_prompt.md を読む」だけにしない、要約した観点を prompt に組み込む)。

{referenced_files_block}

---

JSON のみ出力 (前置き禁止)。"""


def _format_list_block(items: list, formatter, empty_msg: str = "(なし)") -> str:
    if not items:
        return empty_msg
    return "\n".join(formatter(it) for it in items)


def _build_prompt(skill_name: str, skill_body: str, context: dict, referenced_files_block: str = "(なし)") -> str:
    hooks_block = _format_list_block(
        context.get("hooks", []),
        lambda h: f"  - {h['hook_type']}:{h['matcher']}  handler={h['handler_type']}  cmd={h.get('command','')[:120]}",
    )
    mcp_block = _format_list_block(
        context.get("mcp_servers", []),
        lambda m: f"  - {m['name']}  cmd={m.get('command','')}",
    )
    subagents_block = _format_list_block(
        context.get("subagents", []),
        lambda a: f"  - {a['name']}: {a['description'][:80]}",
    )
    sibling_skills_block = _format_list_block(
        context.get("sibling_skills", []),
        lambda s: f"  - {s['name']}: {s['description'][:80]}",
    )
    return _PROMPT_TEMPLATE.format(
        name=skill_name,
        skill_body=skill_body[:12000],   # 大きすぎる SKILL.md は冒頭で切る (~12 KB)
        hooks_block=hooks_block,
        mcp_block=mcp_block,
        subagents_block=subagents_block,
        sibling_skills_block=sibling_skills_block,
        referenced_files_block=referenced_files_block,
    )


# ───────── 応答のクリーンアップ ─────────

def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _extract_json(text: str) -> dict:
    """Extract the outermost {...} block from LLM response (string-aware)."""
    from io_utils import extract_json_object
    return extract_json_object(text)


# ───────── ハイブリッド bind (LLM 出力に実物 config を埋め込む) ─────────

def _bind_real_configs(flow: dict, context: dict) -> dict:
    """LLM が生成したノードに、codebase_scanner で取れた実物データを bind する。

    - hook ノード: matcher / handler_type / command を実物に上書き
    - subagent ノード: file path / model を補足
    - mcp ノード: 実 mcp_server config を補足
    - skill ノード: sibling skill の実 file path を補足
    """
    for n in flow.get("nodes", []):
        t = n.get("type")
        cfg = n.setdefault("config", {})
        if t == "hook":
            matcher = cfg.get("matcher") or ""
            hook_type = cfg.get("hook_type") or ""
            real = find_hook_for(context, matcher_hint=matcher, hook_type_hint=hook_type)
            if real:
                cfg["matcher"] = real["matcher"]
                cfg["hook_type"] = real["hook_type"]
                cfg["handler_type"] = real["handler_type"] or cfg.get("handler_type", "command")
                cfg["command"] = real["command"] or cfg.get("command", "")
                if real.get("timeout") is not None:
                    cfg["timeout"] = real["timeout"]
                n["_bound_real"] = True
            else:
                n["_hook_hallucination_risk"] = True
        elif t == "subagent":
            name_hint = cfg.get("subagent_type") or n.get("title", "")
            real = find_subagent_for(context, name_hint)
            if real:
                cfg["file"] = real["file"]
                if real.get("model"):
                    cfg["model"] = real["model"]
                n["_bound_real"] = True
        elif t == "mcp":
            name_hint = cfg.get("mcp_server") or ""
            real = find_mcp_server_for(context, name_hint)
            if real:
                cfg["mcp_server"] = real["name"]
                if real.get("env_keys"):
                    cfg["env_keys"] = real["env_keys"]
                n["_bound_real"] = True
        elif t == "skill":
            name_hint = cfg.get("skill_name") or n.get("title", "")
            real = find_sibling_skill_for(context, name_hint)
            if real:
                cfg["file"] = real["file"]
                n["_bound_real"] = True
    return flow


# ───────── エントリーポイント ─────────

def _strip_frontmatter(text: str) -> str:
    if not text.startswith("---"):
        return text
    lines = text.splitlines()
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(lines[i + 1:])
    return text


# ───────── X2: 参照ファイル sub-agent 解析 ─────────

def _extract_referenced_files(skill_body: str, project_dir: str, skill_dir: str | None = None) -> list[str]:
    """SKILL.md 本文から、`backtick で囲まれた` 相対パス参照を抽出。

    - .md / .py / .sh / .js / .json ファイルを対象
    - 解決の起点を **複数試す**: SKILL.md の親ディレクトリ → project_dir → project_dir の親
    - 実在するファイルだけ返す (存在しないパスは無視)
    - 同一ファイルの重複を排除
    - MAX_REFERENCED_FILES で上限カット
    """
    project_dir_p = Path(project_dir)
    skill_dir_p = Path(skill_dir) if skill_dir else None
    pattern = re.compile(r"`([^`\s]+\.(md|py|sh|js|json|ts|rb|yaml|yml|toml))`")
    seen: set = set()
    out: list[str] = []
    for m in pattern.finditer(skill_body):
        rel = m.group(1)
        if rel in seen:
            continue
        seen.add(rel)
        candidates: list[Path] = []
        if rel.startswith("/"):
            candidates.append(Path(rel))
        else:
            # 優先順: SKILL.md 親 → project_dir → project_dir の親
            if skill_dir_p:
                candidates.append(skill_dir_p / rel)
            candidates.append(project_dir_p / rel)
            candidates.append(project_dir_p.parent / rel)
        for c in candidates:
            try:
                if c.exists() and c.is_file():
                    out.append(str(c.resolve()))
                    break
            except OSError:
                continue
        if len(out) >= MAX_REFERENCED_FILES:
            break
    return out


_REF_SUMMARY_PROMPT = """\
以下のファイルは Claude Code のスキル定義から参照されているサポートファイルです。
このファイルの中身を読んで、**Claude が読み込んだ時に何をするべきか**を 100-200 字で要約してください。

要約のフォーマット:
- 一行目: ファイルが Claude に与える役割を 1 文で要約
- 二行目以降: Claude が読み込んで実際に何を考えるか、どんな観点で書くか (具体的に)

前置き・「このファイルは」「要約します」等の文言は禁止。要約本文のみ。

ファイルパス: {path}

内容:
---
{content}
---
"""


async def _summarize_referenced_file(file_path: str) -> dict:
    """1 ファイルを sub-agent (haiku) で要約。"""
    p = Path(file_path)
    try:
        content = p.read_text(encoding="utf-8")
    except Exception as e:
        return {"path": file_path, "summary": f"(読み込み失敗: {e})", "ok": False}
    # サイズ制限 (~12 KB)
    if len(content) > 12000:
        content = content[:12000] + "\n... (略)"
    prompt = _REF_SUMMARY_PROMPT.format(path=file_path, content=content)
    try:
        summary = await call_claude_cli(prompt, model=SUB_AGENT_MODEL, timeout=SUB_AGENT_TIMEOUT_SEC)
        # コードフェンス剥がし
        if summary.startswith("```"):
            summary = _strip_code_fence(summary)
        return {"path": file_path, "summary": summary.strip(), "ok": True}
    except Exception as e:
        return {"path": file_path, "summary": f"(サブエージェント失敗: {e})", "ok": False}


async def _gather_reference_summaries(referenced_files: list[str]) -> list[dict]:
    """並列で全参照ファイルを要約 (asyncio.gather)。"""
    if not referenced_files:
        return []
    tasks = [_summarize_referenced_file(p) for p in referenced_files]
    return await asyncio.gather(*tasks)


# ───────── X3: Phase ブロック分業 sub-agent ─────────

# Phase の区切り検出: `## Phase N` `## Step N` `## <名詞>` 等
_PHASE_HEADER_RE = re.compile(r"^##\s+(?!#)(.+?)\s*$", re.MULTILINE)
_PHASE_META_KW = (
    "前提条件", "前提", "全体フロー", "概要", "チェックリスト",
    "完了報告", "最終チェック", "セットアップ", "環境", "依存関係",
    "prerequisite", "overview", "checklist", "setup",
)


def _split_phases(skill_body: str) -> list[dict]:
    """SKILL.md 本文を ## 見出しで区切って Phase ブロックのリストにする。
    メタ section (前提条件・全体フロー等) は除外。
    Returns: [{"phase_num": int, "title": str, "body": str}, ...]
    """
    matches = list(_PHASE_HEADER_RE.finditer(skill_body))
    if not matches:
        return []
    phases: list[dict] = []
    phase_num = 0
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        if any(kw in title.lower() or kw in title for kw in _PHASE_META_KW):
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(skill_body)
        body = skill_body[start:end].strip()
        if not body:
            continue
        phases.append({"phase_num": phase_num, "title": title, "body": body})
        phase_num += 1
    return phases


_PHASE_PROMPT_TEMPLATE = """\
あなたは Claude Code スキル定義の **1 つの Phase ブロックだけ**を読んで、フロー上のノードに変換する専門家です。

## 出力形式 (厳密)

JSON のみ。前置き・解説・コードフェンス禁止。

```jsonc
{{
  "phase_num": {phase_num},
  "phase_title": "{phase_title}",
  "entry_node_id": "p{phase_num}_n1",     // この Phase ブロックの最初のノード ID
  "exit_node_id": "p{phase_num}_nK",      // この Phase ブロックの最後のノード ID
  "nodes": [
    {{
      "id": "p{phase_num}_n1",
      "type": "parent|subagent|think|code|user|decision|hook|mcp|skill|parallel",
      "title": "短いタイトル",
      "subtitle": "",
      "desc": "",
      "config": {{}}
    }}
  ],
  "edges": [
    {{ "from": "p{phase_num}_n1", "to": "p{phase_num}_n2", "label": "yes" }}
  ],
  "parallels": [
    {{ "id": "p{phase_num}_par1", "fan_out": "p{phase_num}_nA", "fan_in": "p{phase_num}_nZ", "members": ["p{phase_num}_nB"] }}
  ]
}}
```

## 重要

- **node ID は必ず `p{phase_num}_n<i>` 形式**で連番 (p{phase_num}_n1, p{phase_num}_n2, ...)
- このプロンプトに渡されたのは **Phase {phase_num} の本文だけ**。他の Phase のことは気にしない (parent が後で繋ぐ)
- 1 Phase に複数ノードがあれば entry / exit を明確に
- 1 Phase が単一ノードなら entry == exit
- ノード型の判別指針は通常通り (### N-M = 独立、#### 以下 = 親 prompt 統合、AVAILABLE_HOOKS にあるもののみ hook 化、等)

## ノード型の判別指針 (一部抜粋)

- **think**: メイン Claude の LLM 推論。config.prompt 必須
- **subagent**: 「Agent ツール」「Critics Agent」等 delegation 表現がある時のみ
- **code**: コードブロック (```bash``` ```python```) を含むセクション
- **decision**: 「〜場合のみ」「Yes/No」等
- **hook**: AVAILABLE_HOOKS にあるもののみ
- **parallel**: 「**同時に**」「並列」等
- **#### 以下の見出し** = 独立ノード化禁止、親 prompt に統合

## INPUT

### Phase 本文

{phase_body}

### AVAILABLE_HOOKS

{hooks_block}

### AVAILABLE_MCP_SERVERS

{mcp_block}

### REFERENCED_FILES_SUMMARY (この Phase で参照されるかもしれない外部ファイルの要約)

{referenced_files_block}

---

JSON のみ出力 (前置き禁止)。"""


async def _analyze_phase_block(phase: dict, context: dict, referenced_files_block: str) -> dict:
    """1 Phase ブロックを sub-agent (sonnet) で JSON 化。"""
    hooks_block = _format_list_block(
        context.get("hooks", []),
        lambda h: f"  - {h['hook_type']}:{h['matcher']}  handler={h['handler_type']}  cmd={h.get('command','')[:120]}",
    )
    mcp_block = _format_list_block(
        context.get("mcp_servers", []),
        lambda m: f"  - {m['name']}",
    )
    prompt = _PHASE_PROMPT_TEMPLATE.format(
        phase_num=phase["phase_num"],
        phase_title=phase["title"].replace('"', "'"),
        phase_body=phase["body"][:8000],
        hooks_block=hooks_block,
        mcp_block=mcp_block,
        referenced_files_block=referenced_files_block,
    )
    try:
        raw = await call_claude_cli(prompt, model=LLM_MODEL, timeout=LLM_TIMEOUT_SEC)
        result = _extract_json(raw)
        result["_phase_meta"] = phase
        return result
    except Exception as e:
        # フォールバック: 単一 think ノードに丸める
        nid = f"p{phase['phase_num']}_n1"
        return {
            "phase_num": phase["phase_num"],
            "phase_title": phase["title"],
            "entry_node_id": nid,
            "exit_node_id": nid,
            "nodes": [{
                "id": nid, "type": "think",
                "title": phase["title"][:30],
                "subtitle": "(Phase 解析失敗)",
                "desc": f"sub-agent failed: {e}",
                "config": {"prompt": phase["body"][:500]},
            }],
            "edges": [],
            "parallels": [],
            "_phase_meta": phase,
            "_error": str(e),
        }


def _stitch_phases(phase_results: list[dict], skill_name: str) -> dict:
    """各 Phase の結果を 1 つのフロー JSON に統合し、Phase 間を順次エッジで繋ぐ。"""
    all_nodes: list[dict] = []
    all_edges: list[dict] = []
    all_parallels: list[dict] = []

    # Phase 内のノード・エッジ・並列を全部集める
    for pr in phase_results:
        all_nodes.extend(pr.get("nodes", []))
        all_edges.extend(pr.get("edges", []))
        all_parallels.extend(pr.get("parallels", []))

    # Phase 間: 前 Phase の exit → 次 Phase の entry を順次接続
    for i in range(len(phase_results) - 1):
        prev = phase_results[i]
        nxt = phase_results[i + 1]
        if prev.get("exit_node_id") and nxt.get("entry_node_id"):
            all_edges.append({
                "from": prev["exit_node_id"],
                "to": nxt["entry_node_id"],
            })

    # ID を整理 (p{N}_n{M} のままだとちょっと見にくいので、グローバルに n{i} に renumber)
    id_map: dict = {}
    for i, node in enumerate(all_nodes, start=1):
        old_id = node["id"]
        new_id = f"n{i}"
        id_map[old_id] = new_id
        node["id"] = new_id
    # parallels の id は変えなくていい (元の p_par_* のままで識別子として使う)
    for e in all_edges:
        e["from"] = id_map.get(e["from"], e["from"])
        e["to"] = id_map.get(e["to"], e["to"])
    for p in all_parallels:
        p["fan_out"] = id_map.get(p.get("fan_out"), p.get("fan_out"))
        p["fan_in"] = id_map.get(p.get("fan_in"), p.get("fan_in"))
        p["members"] = [id_map.get(m, m) for m in p.get("members", [])]

    return {
        "id": f"skill-{skill_name}",
        "name": skill_name,
        "category": "Skills",
        "nodes": all_nodes,
        "edges": all_edges,
        "parallels": all_parallels,
    }


def _format_reference_summaries_block(summaries: list[dict], skill_path: str) -> str:
    """LLM プロンプトに埋め込む REFERENCED_FILES_SUMMARY セクションを生成。"""
    if not summaries:
        return "(なし)"
    skill_dir = str(Path(skill_path).parent)
    project_dir = str(Path(skill_path).parent.parent.parent) if "pipeline" in skill_dir else skill_dir
    lines: list[str] = []
    for s in summaries:
        if not s["ok"]:
            continue
        # 相対パス表示で見やすく
        rel = s["path"]
        try:
            rel = str(Path(s["path"]).relative_to(project_dir))
        except ValueError:
            pass
        lines.append(f"#### `{rel}`")
        lines.append(s["summary"])
        lines.append("")
    return "\n".join(lines) if lines else "(なし)"


_PROJECT_MARKERS = (
    ".claude", ".git", "package.json", "pyproject.toml", "CLAUDE.md",
)


def _infer_project_dir(skill_path: Path) -> str:
    """SKILL.md の祖先でプロジェクト markers が見つかった最初の点を root とする。

    home directory (~/) は **越えない** (~ には .claude が必ずあるが、それは
    ユーザーグローバル設定であって個別プロジェクトではない)。
    home の手前で marker が見つからなければ SKILL.md の2階層上を fallback。
    """
    home = Path.home().resolve()
    cur = skill_path.parent.resolve()
    while cur != cur.parent and cur != home:
        for marker in _PROJECT_MARKERS:
            if (cur / marker).exists():
                return str(cur)
        cur = cur.parent
    # Fallback: SKILL.md のディレクトリ祖父 (skills/<name>/SKILL.md → 祖父が project root の通常パターン)
    fallback = skill_path.parent.parent.parent
    if str(fallback).startswith(str(home)) and fallback != home:
        return str(fallback)
    return str(skill_path.parent.parent)


async def parse_skill_llm_async(skill_path: str, layer: str, project_dir: str | None = None, *,
                                enable_ref_subagents: bool = True) -> dict:
    """LLM ベースで SKILL.md をフロー JSON に変換 (非同期)。

    Args:
        enable_ref_subagents: X2 機能。True なら SKILL.md 内で参照される .md/.sh 等の
            ファイルを並列 sub-agent (haiku) で要約し、メインプロンプトに添付して
            ノード prompt の品質を上げる。 False にすると X1 のみ (高速)。
    """
    skill_path_obj = Path(skill_path)
    skill_text = skill_path_obj.read_text(encoding="utf-8")

    if project_dir is None:
        project_dir = _infer_project_dir(skill_path_obj)

    # skill 名 (frontmatter or ディレクトリ名)
    skill_name = skill_path_obj.parent.name if skill_path_obj.stem == "SKILL" else skill_path_obj.stem
    m = re.search(r"^name:\s*(\S+)", skill_text, re.MULTILINE)
    if m:
        skill_name = m.group(1).strip()

    context = scan_project_context(project_dir, exclude_skill_name=skill_name)

    skill_body = _strip_frontmatter(skill_text)

    # X2: 参照ファイル sub-agent 並列要約 (キャッシュキーにも入れる)
    referenced_summaries: list[dict] = []
    if enable_ref_subagents:
        ref_files = _extract_referenced_files(
            skill_body, project_dir, skill_dir=str(skill_path_obj.parent)
        )
        if ref_files:
            referenced_summaries = await _gather_reference_summaries(ref_files)

    # キャッシュキー (skill 本文 + codebase context + 参照ファイル要約まで含めて hash)
    cache_payload = {
        "context": context,
        "ref_summaries": [(s.get("path"), s.get("summary")) for s in referenced_summaries if s.get("ok")],
    }
    key = _cache_key(skill_text, cache_payload)
    cached = _cache_load(key)
    if cached:
        cached["_from_cache"] = True
        return cached

    # メイン LLM プロンプト構築 + 呼び出し
    referenced_files_block = _format_reference_summaries_block(referenced_summaries, str(skill_path_obj))
    prompt = _build_prompt(skill_name, skill_body, context, referenced_files_block=referenced_files_block)
    raw = await call_claude_cli(prompt, model=LLM_MODEL, timeout=LLM_TIMEOUT_SEC)
    flow = _extract_json(raw)

    # スキーマ正規化 + ハイブリッド bind
    flow.setdefault("id", f"skill-{skill_name}")
    flow.setdefault("name", skill_name)
    flow.setdefault("category", "Skills")
    flow.setdefault("parallels", [])
    flow["source"] = {"type": "skill", "path": str(skill_path_obj), "layer": layer}
    flow["_referenced_files"] = [s["path"] for s in referenced_summaries if s.get("ok")]
    flow = _bind_real_configs(flow, context)

    _cache_save(key, flow)
    return flow


def parse_skill_llm(skill_path: str, layer: str, project_dir: str | None = None,
                    *, enable_ref_subagents: bool | None = None) -> dict:
    """同期ラッパー (parser.py の parse_skill と同じシグネチャ)。

    enable_ref_subagents=None なら env PARSER_LLM_REF_SUBAGENTS (default 1) を見る。
    """
    import os
    if enable_ref_subagents is None:
        enable_ref_subagents = os.environ.get("PARSER_LLM_REF_SUBAGENTS", "1") not in ("0", "false", "False", "")
    return asyncio.run(parse_skill_llm_async(skill_path, layer, project_dir,
                                              enable_ref_subagents=enable_ref_subagents))


# ───────── X3 エントリーポイント (Phase 分業) ─────────

async def parse_skill_llm_x3_async(skill_path: str, layer: str, project_dir: str | None = None) -> dict:
    """X3: SKILL.md を Phase 単位に分割し、各 Phase を別 sub-agent (sonnet) で並列処理。

    手順:
      1. SKILL.md frontmatter 剥がし、body から ## Phase 見出しで分割
      2. X2: 参照ファイル要約を sub-agent (haiku) で並列取得
      3. 各 Phase を sub-agent (sonnet) で並列処理 (3-10 並列)
      4. parent が結果を統合: Phase 間に順次エッジ追加、ID を renumber
      5. ハイブリッド bind (実 hook/MCP/subagent)
      6. キャッシュ保存
    """
    skill_path_obj = Path(skill_path)
    skill_text = skill_path_obj.read_text(encoding="utf-8")

    if project_dir is None:
        project_dir = _infer_project_dir(skill_path_obj)

    skill_name = skill_path_obj.parent.name if skill_path_obj.stem == "SKILL" else skill_path_obj.stem
    m = re.search(r"^name:\s*(\S+)", skill_text, re.MULTILINE)
    if m:
        skill_name = m.group(1).strip()

    context = scan_project_context(project_dir, exclude_skill_name=skill_name)
    skill_body = _strip_frontmatter(skill_text)

    # X2: 参照ファイル要約
    ref_files = _extract_referenced_files(skill_body, project_dir, skill_dir=str(skill_path_obj.parent))
    referenced_summaries = await _gather_reference_summaries(ref_files) if ref_files else []
    referenced_files_block = _format_reference_summaries_block(referenced_summaries, str(skill_path_obj))

    # キャッシュキー (X3 用に独立)
    cache_payload = {
        "variant": "X3",
        "context": context,
        "ref_summaries": [(s.get("path"), s.get("summary")) for s in referenced_summaries if s.get("ok")],
    }
    key = _cache_key(skill_text, cache_payload)
    cached = _cache_load(key)
    if cached:
        cached["_from_cache"] = True
        return cached

    # X3: Phase 分割 + 並列処理
    phases = _split_phases(skill_body)
    if not phases:
        # Phase 分割できない短いスキル → 通常の parse_skill_llm にフォールバック
        return await parse_skill_llm_async(
            skill_path, layer, project_dir, enable_ref_subagents=True
        )

    phase_results = await asyncio.gather(*[
        _analyze_phase_block(p, context, referenced_files_block) for p in phases
    ])
    flow = _stitch_phases(phase_results, skill_name)

    # ハイブリッド bind
    flow["source"] = {"type": "skill", "path": str(skill_path_obj), "layer": layer}
    flow["_referenced_files"] = [s["path"] for s in referenced_summaries if s.get("ok")]
    flow["_variant"] = "X3"
    flow = _bind_real_configs(flow, context)

    _cache_save(key, flow)
    return flow


def parse_skill_llm_x3(skill_path: str, layer: str, project_dir: str | None = None) -> dict:
    """X3 同期ラッパー。"""
    return asyncio.run(parse_skill_llm_x3_async(skill_path, layer, project_dir))


def invalidate_cache(skill_path: str | None = None) -> int:
    """キャッシュ削除 (skill_path 指定で部分削除、None で全削除)。戻り値は削除ファイル数。"""
    if not CACHE_DIR.exists():
        return 0
    deleted = 0
    if skill_path is None:
        for f in CACHE_DIR.glob("*.json"):
            f.unlink()
            deleted += 1
    else:
        for f in CACHE_DIR.glob("*.json"):
            try:
                d = json.loads(f.read_text(encoding="utf-8"))
                if d.get("source", {}).get("path") == str(skill_path):
                    f.unlink()
                    deleted += 1
            except Exception:
                continue
    return deleted


# ═════════ kind 分類 (パス0): スキルの構造タイプを 1〜4 に判定 ═════════
# フロー化の前段ゲート。1/2 はフロー生成へ、3/4 はフロー化せず別UI (sections) へ回す。
# 既存の call_claude_cli / _extract_json / _strip_frontmatter を再利用。
# 詳細設計: docs/superpowers/specs/ の skill-kind-classification 仕様参照。

KIND_MODEL = "sonnet"        # 分類は sonnet 既定 (eval で haiku 等と比較可能)
KIND_TIMEOUT_SEC = 120
KIND_LABELS = {1: "process", 2: "single", 3: "ruleset", 4: "reference"}

_KIND_PROMPT_TEMPLATE = """\
あなたは Claude Code のスキル定義 (SKILL.md) を読んで、それが「どんな構造のスキルか」を 1〜4 に分類する専門家です。

## 分類 (必ず1つだけ選ぶ)

1. **process（段階処理）**: **異質で独立した複数のアクション** が **必須の順序** で並ぶ。各ステップが「別々の実行作業」として意味を持ち、順番を入れ替えると成り立たない。分岐・ループを含むものもここ。例: 文字起こし→整形→出力 / 文脈把握→質問→提案→spec作成。
2. **single（単一指示）**: 実質ひとつのアクション。異質な複数ステップが無い。1モード切替 / 1コマンド実行 / **1つの成果物を作る**（その作り方の内訳が書かれていても、正味が単一成果物の生成ならここ）。
3. **ruleset（原則リスト）**: 適用すべき **原則・ルール・基準・チェック項目・フレームワークの構成要素** の集まり。「常にX / 避けるY」「N個のベストプラクティス」「枠組みの各次元」など。各項目を順に当てはめる手順が添えてあっても、**実体が「適用する規範の集合」ならここ**。
4. **reference（参照・知識）**: 背景・定義・データ・資料の提示が主で、実行すべきアクションがほぼ無い。読んで参照するためのもの。

## 判定の指針 (重要 — 順序の"見た目"に釣られない)

スキルの多くは「**何**(規範/枠組み/成果物) ＋ **それを適用する how-to の順番**」の二層構造になっている。**how-to に順番があるだけで process にしてはいけない**。「何」＝そのスキルの正味の価値の方で判定する。

次は process ではない:
- (a) **返答・出力の書式**（挨拶→本文→締め 等のレスポンス構成）→ 中身の実体で 2/3/4。
- (b) **枠組み・テンプレートの各要素を順に記述するだけ**（各次元/各項目を1つずつ埋める）→ **3 (ruleset)**。
- (c) **1つの成果物のための 準備→生成**（情報収集→執筆 等）→ **2 (single)**。

判定順:
1. 異質で独立した複数アクションが必須順序で並ぶ（上の(a)(b)(c)でない）？ → **1**。
2. 実質ひとつのアクション／単一成果物の生成？ → **2**。
3. 適用すべき規範・基準・枠組み要素の集合？ → **3**。
4. アクションでなく知識・資料の提示が主？ → **4**。

混在時は **how-to の順番ではなく「スキルの正味の価値(何を提供するか)」が支配的な方** を選ぶ。

## 出力形式 (厳密)

JSON のみ。前置き・解説・コードフェンス禁止。
{{"kind": <1-4>, "label": "process|single|ruleset|reference", "reason": "40字以内の根拠", "mixed": [<補助的に含む性質の番号、無ければ空配列>]}}

## INPUT

### SKILL.md (skill name: {name})

{skill_body}

JSON のみ出力。"""


def _skill_name_from_path(p: Path, raw_text: str) -> str:
    m = re.search(r"(?m)^name:\s*(.+)$", raw_text[:500])
    if m:
        return m.group(1).strip()
    return p.parent.name if p.stem == "SKILL" else p.stem


def _build_kind_prompt(skill_name: str, skill_body: str) -> str:
    return _KIND_PROMPT_TEMPLATE.format(name=skill_name, skill_body=skill_body[:12000])


def _normalize_kind_result(data: dict, model: str) -> dict:
    """LLM の生 JSON を {kind,label,reason,mixed,_model} に正規化。kind 不正は 0。"""
    try:
        kind = int(data.get("kind", 0))
    except (TypeError, ValueError):
        kind = 0
    if kind not in KIND_LABELS:
        kind = 0
    mixed_raw = data.get("mixed", []) or []
    if not isinstance(mixed_raw, list):
        mixed_raw = [mixed_raw]
    mixed = [int(m) for m in mixed_raw if str(m).strip().isdigit() and int(m) in KIND_LABELS]
    return {
        "kind": kind,
        "label": KIND_LABELS.get(kind, "?"),
        "reason": str(data.get("reason", "")).strip(),
        "mixed": mixed,
        "_model": model,
    }


async def classify_kind_from_text(skill_name: str, skill_body: str, *, model: str = KIND_MODEL) -> dict:
    """SKILL.md 本文を kind 1〜4 に分類 (パス0)。{kind,label,reason,mixed,_model} を返す。

    LLM 1 回 (call_claude_cli)。フロー生成より軽量なので iterate 高速。
    """
    prompt = _build_kind_prompt(skill_name, skill_body)
    raw = await call_claude_cli(prompt, model=model, timeout=KIND_TIMEOUT_SEC)
    data = _extract_json(raw)
    return _normalize_kind_result(data, model)


async def classify_skill_kind_async(skill_path: str, *, model: str = KIND_MODEL) -> dict:
    """SKILL.md ファイルを読んで kind 分類。結果に name / path を付与。"""
    p = Path(skill_path)
    raw_text = p.read_text(encoding="utf-8", errors="ignore")
    skill_name = _skill_name_from_path(p, raw_text)
    body = _strip_frontmatter(raw_text)
    result = await classify_kind_from_text(skill_name, body, model=model)
    result["name"] = skill_name
    result["path"] = str(p)
    return result


def classify_skill_kind(skill_path: str, *, model: str = KIND_MODEL) -> dict:
    """同期ラッパー。"""
    return asyncio.run(classify_skill_kind_async(skill_path, model=model))


def extract_sections(skill_body: str) -> list[dict]:
    """SKILL.md 本文を ## / ### 見出しごとに {heading, level, body} へ分割。
    先頭 H1 + リード文は heading='' の節になる。kind 3/4 のカードUI用。
    """
    body = _strip_frontmatter(skill_body)
    sections: list[dict] = []
    cur = {"heading": "", "level": 0, "body": ""}

    def _flush():
        if cur["heading"] or cur["body"].strip():
            sections.append({"heading": cur["heading"], "level": cur["level"],
                             "body": cur["body"].strip()})

    for line in body.splitlines():
        m = re.match(r"^(#{2,3})\s+(.+)$", line)
        if m:
            _flush()
            cur = {"heading": m.group(2).strip(), "level": len(m.group(1)), "body": ""}
        else:
            cur["body"] += line + "\n"
    _flush()
    return sections


_KIND_CACHE_DIR = Path.home() / ".cache" / "flow-inspector" / "kind"
KIND_PROMPT_VERSION = "2026-05-31-B"   # 判定プロンプト改訂時に上げてキャッシュを無効化


def _kind_cache_key(skill_text: str) -> str:
    raw = (KIND_PROMPT_VERSION + "\n" + skill_text).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:16]


async def classify_skill_kind_cached_async(skill_path: str, *, model: str = KIND_MODEL) -> dict:
    """classify_skill_kind_async のキャッシュ付き版（本番 API 用）。
    キャッシュキーは SKILL.md 本文 + KIND_PROMPT_VERSION のハッシュ。
    """
    p = Path(skill_path)
    raw_text = p.read_text(encoding="utf-8", errors="ignore")
    cache_file = _KIND_CACHE_DIR / f"{_kind_cache_key(raw_text)}.json"
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            pass
    result = await classify_skill_kind_async(skill_path, model=model)
    try:
        _KIND_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
    return result


def peek_kind_cache(skill_path: str) -> dict | None:
    """LLM を呼ばずに kind 分類キャッシュだけを読む（0 トークン）。

    キャッシュ無し／読めない／パス無効なら None。
    一覧（/api/flows）が「フロー化済みか・既知 kind は何か」を
    決定論で返すために使う（クリックして初めて LLM 分類する遅延フロー化の起点）。
    """
    try:
        raw_text = Path(skill_path).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None
    cache_file = _KIND_CACHE_DIR / f"{_kind_cache_key(raw_text)}.json"
    if not cache_file.exists():
        return None
    try:
        return json.loads(cache_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def attach_kind(flow: dict, *, model: str = KIND_MODEL) -> dict:
    """flow に kind / kind_label を付与し、kind>=3 なら sections を生成（カードUI用）。
    source.path の SKILL.md を分類（キャッシュ付き）。path 無し/読めない/分類失敗時は無変更。
    同期（FastAPI の sync ルートから呼ぶ。threadpool 上なので asyncio.run 可）。
    """
    src = (flow.get("source") or {}).get("path")
    if not src or not Path(src).exists():
        return flow
    # 大きいコマンドだけ分類する（極小コマンドは現状維持・LLMコストもゼロ）
    if (flow.get("source") or {}).get("type") == "command":
        try:
            from parser import _command_body_is_small
        except ImportError:
            from .parser import _command_body_is_small
        try:
            if _command_body_is_small(Path(src).read_text(encoding="utf-8", errors="ignore")):
                return flow
        except Exception:
            return flow
    try:
        res = asyncio.run(classify_skill_kind_cached_async(src, model=model))
    except Exception:
        return flow
    kind = res.get("kind", 0)
    if kind not in KIND_LABELS:
        return flow
    flow["kind"] = kind
    flow["kind_label"] = KIND_LABELS[kind]
    if kind >= 3:
        body = Path(src).read_text(encoding="utf-8", errors="ignore")
        flow["sections"] = extract_sections(body)
    return flow
