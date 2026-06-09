"""
parser.py — Skill/Command/CLAUDE.md flow parser for Flow Inspector.

PARSER_MODE 環境変数で SKILL.md パース戦略を切り替えられる:
  - PARSER_MODE=rule (default): 本ファイル内の rule-based parse_skill を使う
  - PARSER_MODE=llm or hybrid:  server/parser_llm.py の LLM ベース実装に dispatch
                                 (codebase_scanner で実物 hook/MCP/subagent を bind)

LLM モードでは LLM 呼び出しが ~1-5 分かかるため、
~/.cache/flow-inspector/parser-llm/ に SHA-256 キャッシュされる。
"""

import json
import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# 配信デフォルトは "auto": flow_version:1 付きスキルは決定論パース (parser_convention)、
# 無ければ rule-based。アノテート済みスキルは可逆な round-trip になる。
_PARSER_MODE = os.environ.get("PARSER_MODE", "auto").lower()

# Frontmatter parsing は共有ハイブリッドヘルパに委譲 (server/fi_frontmatter.py)。
# yaml.safe_load → 失敗時は寛容な行パーサにフォールバック。
# 値は str/bool/int/list 混在なので、参照側で fm_str / fm_list を通して正規化する。
try:
    from fi_frontmatter import parse_frontmatter as _parse_frontmatter, fm_str, fm_list
except ImportError:
    from .fi_frontmatter import parse_frontmatter as _parse_frontmatter, fm_str, fm_list  # type: ignore


def _extract_steps(body: str) -> list:
    """Find step-like headings inside a SKILL.md / command body and return
    each step's title + body.

    Supports two common conventions:
      1. **Legacy / 公式 docs 形式**: `### 1. タイトル` / `### 2. タイトル`
         — 番号付き ### 見出しで手順を並べる。
      2. **Phase 形式 (project pipelines に多い)**: `## Phase 0: ...` /
         `## Phase 1: ...` または番号なしの `## セクション名`。

    第1パスで legacy パターンが見つかればそれを優先 (既存挙動を保つ)。
    なければ `## ` レベル見出しを拾う — ただし「前提条件 / 全体フロー /
    最終チェックリスト」等のメタセクションは除外する。
    """
    # ── Pass 1: legacy numbered subsections (existing behavior) ──
    legacy_pattern = re.compile(r"###\s+(\d+)\.\s+(.*?)$", re.MULTILINE)
    legacy_matches = list(legacy_pattern.finditer(body))
    if legacy_matches:
        steps = []
        for idx, match in enumerate(legacy_matches):
            title_raw = match.group(2).strip()
            title, subtitle = _split_title_arrow(title_raw)
            start = match.end()
            end = legacy_matches[idx + 1].start() if idx + 1 < len(legacy_matches) else len(body)
            step_body = body[start:end].strip()
            steps.append({"title": title, "subtitle": subtitle, "body": step_body})
        return steps

    # ── Pass 2: `## ` level headings, with meta sections filtered out ──
    # メタ判定: タイトルが下記いずれかを「含む」場合は除外。
    # (startswith ではなく contains にしてるのは「## 1. 前提条件」みたいに
    # 番号がついても拾えるように)
    META_KEYWORDS = (
        "前提条件", "前提", "インストール", "セットアップ", "環境",
        "最終チェック", "チェックリスト", "完了報告",
        "全体フロー", "フロー図", "概要",
        "prerequisite", "prerequisites", "requirement", "requirements",
        "setup", "installation", "checklist", "overview",
    )
    section_pattern = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
    section_matches = list(section_pattern.finditer(body))
    if not section_matches:
        return []
    # サブステップパターン: `### 7-1. ...` `### 3-2-1. ...` 等
    # 階層番号 (\d+(?:-\d+)+) で「Phase の中の N-M」形式を検出する。
    # 単純な `### 1.` は既に Pass 1 で扱われている。
    sub_pattern = re.compile(r"^###\s+(\d+(?:-\d+)+)\.\s+(.+?)\s*$", re.MULTILINE)

    steps = []
    for idx, match in enumerate(section_matches):
        title_raw = match.group(1).strip()
        title_lower = title_raw.lower()
        if any(kw in title_lower for kw in META_KEYWORDS) or \
           any(kw in title_raw for kw in META_KEYWORDS):
            continue
        start = match.end()
        end = section_matches[idx + 1].start() if idx + 1 < len(section_matches) else len(body)
        step_body = body[start:end].strip()
        if not step_body:
            continue
        # この ## セクション内に `### N-N.` 形式のサブステップが 2 個以上あれば
        # 親ではなくサブステップを展開する (Phase 7 の 7-1 / 7-2 / 7-3 のような構造)
        sub_matches = list(sub_pattern.finditer(step_body))
        if len(sub_matches) >= 2:
            for s_idx, s_match in enumerate(sub_matches):
                sub_num = s_match.group(1)             # "7-1"
                sub_title_raw = s_match.group(2).strip()
                sub_title, sub_subtitle = _split_title_arrow(sub_title_raw)
                s_start = s_match.end()
                s_end = sub_matches[s_idx + 1].start() if s_idx + 1 < len(sub_matches) else len(step_body)
                sub_body = step_body[s_start:s_end].strip()
                steps.append({
                    "title": f"{sub_num}. {sub_title}",
                    "subtitle": sub_subtitle,
                    "body": sub_body,
                })
        else:
            title, subtitle = _split_title_arrow(title_raw)
            steps.append({"title": title, "subtitle": subtitle, "body": step_body})
    return steps


def _split_title_arrow(title: str) -> tuple:
    r"""Split `タイトル → 出力先` style headings into (title, subtitle).

    SKILL.md でよく出る `3-1. サービスリサーチ → \`research/service.md\`` のような
    パターンを「短いタイトル + 補足の subtitle」に分ける。
    `→` (全角矢印) と `->` (半角) の両方に対応。
    バッククォートを subtitle 側から除去する。
    """
    for sep in (" → ", " → ", "→", " -> ", "->"):
        if sep in title:
            head, tail = title.split(sep, 1)
            head = head.strip().rstrip(":：")
            tail = tail.strip().strip("`")
            return head, tail
    return title.strip(), ""


def _extract_condition(title: str) -> str:
    """Extract the condition phrase from a decision-style title.

    タイトル末尾の括弧 `（リファレンスファイルがある場合のみ）` 等を抽出する。
    括弧が無ければタイトル全体を返す (フォールバック)。
    """
    m = re.search(r"[（(]([^）)]+)[）)]\s*$", title)
    if m:
        return m.group(1).strip()
    return title.strip()


def _extract_branch_steps(body: str) -> list:
    """Find numbered list items (`1. xxx` / `2. xxx`) at the top level of `body`.

    decision ノードの本文に書かれた「yes だったらこうする」の手順を抽出する。
    各ステップの末尾に「逆条件のガード文」(例:「学習用リファレンスがない場合は
    スキップする」) が空行を挟んで付いている SKILL.md パターンを想定し、ステップ
    text の末尾は最初の空行 (連続改行) で打ち切る。
    インデントされた行 (` - foo` や `  ...`) は親ステップの本文として含む。
    """
    pattern = re.compile(r"^(\d+)\.\s+(.+?)(?=^\d+\.\s+|\Z)", re.MULTILINE | re.DOTALL)
    matches = pattern.findall(body)
    out = []
    for num, text in matches:
        # 末尾のガード文を分離: 最初の空行 (\n\n) で打ち切る
        trimmed = text.split("\n\n", 1)[0].strip()
        out.append((num, trimmed))
    return out


def _make_branch_title(text: str, max_len: int = 32) -> str:
    """Build a short, readable title from a numbered branch step body.

    バッククォートとマークダウン装飾を除去し、長すぎる場合は自然な区切りで切る。
    """
    first_line = text.strip().split("\n", 1)[0]
    # マークダウン装飾を除去 (タイトル表示用)
    cleaned = first_line.replace("`", "").replace("**", "").rstrip(":：")
    if len(cleaned) <= max_len:
        return cleaned
    for sep in ("（", "(", "。", "、"):
        if sep in cleaned:
            idx = cleaned.index(sep)
            if 6 <= idx <= max_len:
                return cleaned[:idx]
    return cleaned[: max_len - 1] + "…"


def _expand_decision_branches(nodes: list, edges: list) -> None:
    """Expand decision nodes that have numbered sub-steps in their body into
    a yes-path detour + no-path skip structure.

    変換例:
        before:  n_prev → [n_dec (decision)] → n_next
        after:   n_prev → [n_dec] --no--> n_next
                              |
                              yes
                              ↓
                              n_dec_y1 → n_dec_y2 → ... → n_next

    yes 側ノードは decision の右側 (x + 320) に縦に並べる。後続のメインフローは
    枝の高さ分だけ下に押し下げる。in-place 変更。
    """
    # 既に存在する全ノード ID から数値部分を集めて、新しい branch ノード番号の起点にする
    def _next_id_counter():
        nums = []
        for n in nodes:
            nid = n["id"]
            if nid.startswith("n") and nid[1:].isdigit():
                nums.append(int(nid[1:]))
        return max(nums) + 1 if nums else 1

    # decision ノードを順に処理 (位置が動く可能性があるので id で再取得)
    decision_ids = [n["id"] for n in nodes if n["type"] == "decision"]

    for dec_id in decision_ids:
        # 現在の位置取得
        try:
            dec_idx = next(i for i, n in enumerate(nodes) if n["id"] == dec_id)
        except StopIteration:
            continue
        dec_node = nodes[dec_idx]

        # 直後のメイン後続ノード (今は branch ノードを末尾に append しているので、
        # nodes[dec_idx + 1] は安全に「次の元・main」を指す)
        if dec_idx + 1 >= len(nodes):
            continue
        next_main = nodes[dec_idx + 1]

        branch_steps = _extract_branch_steps(dec_node.get("desc", ""))
        if len(branch_steps) < 2:
            continue

        branch_dy = 100
        x_offset = 320
        branch_x = dec_node["x"] + x_offset
        branch_y0 = dec_node["y"]
        id_counter = _next_id_counter()

        branch_nodes = []
        for b_idx, (_num, text) in enumerate(branch_steps):
            title = _make_branch_title(text)
            b_id = f"n{id_counter}"
            id_counter += 1
            b_type = _infer_node_type(title, text, is_last=False)
            b_config: dict = {}
            if b_type == "think":
                b_config["prompt"] = text
            elif b_type == "decision":
                b_config["condition"] = _extract_condition(title)
            prev_id = dec_id if b_idx == 0 else branch_nodes[b_idx - 1]["id"]
            branch_nodes.append({
                "id": b_id,
                "type": b_type,
                "title": title,
                "subtitle": "",
                "x": branch_x,
                "y": branch_y0 + (b_idx + 1) * branch_dy,
                "summary": text[:100],
                "desc": text,
                "io_desc": [],
                "config": b_config,
                "input": {},
                "output": {},
                "duration": "",
                "depends": [prev_id],
            })

        # 後続のメインフローを枝の高さぶん下に押す (branch ノードは末尾 append なのでスキップ)
        branch_height = len(branch_nodes) * branch_dy
        push_amount = max(0, branch_height + 30 - 130)  # 標準ギャップ 130px を超えた分だけ
        branch_id_set = {bn["id"] for bn in branch_nodes}
        if push_amount > 0:
            for n in nodes[dec_idx + 1:]:
                if n["id"] not in branch_id_set:
                    n["y"] += push_amount

        # branch ノードを末尾に追加
        nodes.extend(branch_nodes)

        # エッジ更新:
        # - dec → next_main の直接エッジを削除
        # - dec → branch[0] (yes)
        # - branch[i] → branch[i+1]
        # - branch[-1] → next_main (merge)
        # - dec → next_main (no, ラベル付きで再追加)
        edges[:] = [
            e for e in edges
            if not (e["from"] == dec_id and e["to"] == next_main["id"])
        ]
        edges.append({"from": dec_id, "to": branch_nodes[0]["id"], "label": "yes"})
        for b_idx in range(len(branch_nodes) - 1):
            edges.append({"from": branch_nodes[b_idx]["id"], "to": branch_nodes[b_idx + 1]["id"]})
        edges.append({"from": branch_nodes[-1]["id"], "to": next_main["id"]})
        edges.append({"from": dec_id, "to": next_main["id"], "label": "no"})


def _infer_node_type(title: str, body: str, is_last: bool = False) -> str:
    """Infer node type from title and body keywords.

    優先順位 (高→低):
      1. body に明示的な delegation 表現 (Task tool / 並列 Agent /
         Critics Agent / サブエージェント) → "subagent"
      2. title からの強い手がかり (確実度: 高)
      3. body からの弱い手がかり (確実度: 中)
      4. is_last → parent (どれにも該当しない最終ノードのみ)
      5. デフォルト: think (メイン Claude の思考ステップ)

    type の使い分け:
      - subagent: Task tool で別 context に delegate された専門エージェント
      - think:    メイン Claude が自分の context で考える / 書く / 設計する
      - code:     Bash/Write 等で実際にスクリプト実行
      - parent:   ワークフロー全体の統括 (典型的にはエントリ / 最終ノード)
    """
    title_lower = title.lower()
    body_lower = body.lower()
    combined = title_lower + " " + body_lower

    # ── (1) Delegation 表現があれば即 subagent ──
    # 「真の」サブエージェント = Task tool で別エージェント起動 (Critics Agent 等)
    delegation_kw = (
        "task tool", "task ツール", "task で起動", "task で並列",
        "並列 agent", "並列agent", "並列 エージェント", "並列エージェント",
        "critics agent", "critics エージェント",
        "agent を起動", "エージェント を起動",
        "サブエージェント", "subagent",
    )
    for kw in delegation_kw:
        if kw in combined:
            return "subagent"

    # ── Title 強い手がかり ─────────────────────────────────────────────
    # 順序: 特異性が高いものから判定 (decision/user/hook → subagent → code → mcp)

    # user: ユーザー確認・承認 (確実)
    for kw in ("確認", "承認", "approve", "選択", "select"):
        if kw in title_lower:
            # ただし「品質チェック」「セルフチェック」等は LLM タスクなので除外
            if "品質" not in title_lower and "セルフ" not in title_lower:
                return "user"

    # decision: 分岐 (タイトルに分岐ワード or 条件付き表現)
    for kw in ("分岐", "判定", "decision", "branch"):
        if kw in title_lower:
            return "decision"
    # 条件付き Phase: 「〜がある場合のみ」「〜がなければスキップ」などタイトル内に
    # 条件が書かれているステップは分岐扱いとする (例: Phase 1: 学習（リファレンスファイルがある場合のみ）)
    conditional_kw = (
        "場合のみ", "場合は", "ある場合", "ない場合",
        "あれば", "なければ",
        "条件付き", "オプション", "optional",
        "if exists", "if available", "if missing",
        "スキップ",
    )
    for kw in conditional_kw:
        if kw in title_lower:
            return "decision"

    # hook: pre/post/session フック系
    for kw in ("フック", "hook", "pretooluse", "posttooluse", "sessionstart", "sessionend"):
        if kw in title_lower:
            return "hook"

    # think: メイン Claude が考える / 書く / リサーチする / レビューする 等
    # (title に出てきたら body が何であれ LLM 思考タスク。delegation でなければ think)
    think_strong = (
        "llm", " ai ", "ai ", " ai", "gpt",
        "プロンプト", "prompt",
        "執筆", "ドラフト", "draft", "writing",
        "リサーチ", "research", "調査",
        "レビュー", "review", "critics", "クリティック",
        "要約", "summarize", "summary",
        "生成", "generate", "creation",
        "構成", "outline", "設計", "design",
        "分析", "analyze", "analysis",
        "ブリーフ", "brief",
        "学習", "learn",
        "解析", "parse",
        "修正", "fix", "refine",
        "整形", "format", "polish",
        "調整", "ブラッシュアップ", "推敲",
        "考える", "思考",
    )

    # code (title 強): タイトルにスクリプトファイル名拡張子があれば code
    # 例: "7-1. generate_docx.js 作成" / "build.sh 実行" / "count_chars.py"
    if re.search(r"\.(js|ts|py|sh|rb|go|rs|java|cpp|c)\b", title_lower):
        return "code"
    for kw in think_strong:
        if kw in title_lower:
            return "think"

    # code: 明示的にコード実行を示す title (出力 / 計測 / 分類 / build 等)
    code_strong = (
        "スクリプト", "script", "bash", "shell",
        "ファイル分類", "ファイル振り分け", "ファイル出力",
        "word出力", "docx出力", "json出力", "pdf出力",
        "文字数実測", "文字数計測", "サイズ計測",
        "ビルド", "build", "コンパイル", "compile",
        "デプロイ", "deploy",
        "コマンド実行", "コマンドを実行",
    )
    for kw in code_strong:
        if kw in title_lower:
            return "code"

    # mcp: 外部サービス連携 (title に具体的 service 名)
    mcp_strong = (
        "mcp", "slack", "github", "notion", "canva", "linear", "google",
        "api連携", "外部連携",
    )
    for kw in mcp_strong:
        if kw in title_lower:
            return "mcp"

    # ── Body 弱い手がかり ─────────────────────────────────────────────
    # (delegation 表現は最初に check 済み。ここでは「メイン Claude の思考」を think に)

    # think: prompt ファイル参照 / Claude 言及 / LLM 言及
    # (delegation でなく、メイン Claude が prompt を読んで考える系)
    for kw in ("_prompt.md", "writer_prompt", "critics_prompt", "system_prompt",
               "claude", " llm "):
        if kw in combined:
            return "think"

    # user: body にユーザー操作を強く示すフレーズ
    for kw in ("ユーザーに確認", "ユーザーが選択", "ユーザーの承認", "承認を待つ"):
        if kw in combined:
            return "user"

    # mcp: body に外部 API / MCP 服務
    for kw in ("mcp-", "api 呼び出し", "外部 api", "http リクエスト", "rest api"):
        if kw in combined:
            return "mcp"

    # decision: body に分岐ロジック
    for kw in ("分岐", "条件分岐", "判定", "場合は", "場合のみ"):
        if kw in combined:
            return "decision"

    # code: body に実際の実行コマンド (厳格判定)
    # 「実行」単体だと文章中の「順番に実行する」みたいな比喩でもヒットしてしまうので
    # 具体的なコマンドキーワードを要求する
    for kw in ("python3 ", "python ", "node ", "npm ", "pip install", "pip3 ",
               "bash ", "sh ", "whisper", "ffmpeg", "git ", "docker ",
               "コマンドを実行", "スクリプトを実行"):
        if kw in combined:
            return "code"

    # ── デフォルト ──
    # ここまで何にも一致しなかった = 「メイン Claude が何かを考える」汎用ステップ。
    # 終端ノード (is_last) のみ parent (= ワークフロー終了の表現)、
    # それ以外は think (= メイン Claude の思考ステップ) にする。
    if is_last:
        return "parent"
    return "think"


def parse_skill(path: str, layer: str) -> dict:
    """Parse a skill markdown file into a flow dict.

    PARSER_MODE env で dispatch:
      - "rule" (default): 本関数内の rule-based パース
      - "auto" (推奨): flow_version: 1 なら parser_convention (数 ms)、無ければ rule
      - "llm" or "hybrid":
          1. flow_version: 1 → parser_convention (数 ms)
          2. なければ parser_llm.parse_skill_llm (数十秒~数分、X1+X2)
          3. どちらも失敗 → rule にフォールスルー

    全モードで flow_version: 1 付き SKILL.md は parser_convention に dispatch。
    """
    if _PARSER_MODE in ("auto", "llm", "hybrid", "rule"):
        # 1. 規約準拠 (flow_version: 1) なら **モード問わず** 決定論パスを試す
        try:
            try:
                from parser_convention import is_convention_v1, parse_skill_convention
            except ImportError:
                from .parser_convention import is_convention_v1, parse_skill_convention
            text_check = Path(path).read_text(encoding="utf-8")
            if is_convention_v1(text_check):
                try:
                    return parse_skill_convention(path, layer)
                except Exception as e:
                    logger.warning("parse_skill_convention failed, falling back: %s", e)
        except ImportError:
            pass

    if _PARSER_MODE in ("llm", "hybrid"):
        # 2. LLM パス (H2 = X1 + X2 入り)
        try:
            from parser_llm import parse_skill_llm
        except ImportError:
            from .parser_llm import parse_skill_llm
        try:
            return parse_skill_llm(path, layer)
        except Exception as e:
            logger.warning("parse_skill_llm failed, falling back to rule-based: %s", e)
            # フォールスルー → rule-based 続行

    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")

    # Split frontmatter and body
    frontmatter = _parse_frontmatter(text)
    # yaml may yield non-str name/description (int/bool/list); normalize via fm_str
    # so _slugify and the string fields never choke on a non-str value.
    name = fm_str(frontmatter.get("name")) or (file_path.parent.name if file_path.stem == "SKILL" else file_path.stem)
    description = fm_str(frontmatter.get("description"))

    # Strip frontmatter from body
    lines = text.splitlines()
    body_start = 0
    if lines and lines[0].strip() == "---":
        for i, line in enumerate(lines[1:], start=1):
            if line.strip() == "---":
                body_start = i + 1
                break
    body = "\n".join(lines[body_start:])

    steps = _extract_steps(body)

    # If no numbered steps found, create a single node from description/body
    # ロスレス: 見出し構造の無いスキルでも本文全文を保持 (truncate しない)
    if not steps and body.strip():
        steps = [{"title": name, "subtitle": "", "body": body.strip()}]

    total = len(steps)

    nodes = []
    for i, step in enumerate(steps):
        is_last = (i == total - 1)
        node_type = _infer_node_type(step["title"], step["body"], is_last=is_last)
        summary = step["body"][:100]
        # think (Claude呼び出し) ノードは body をそのままプロンプトとして config に格納する。
        # decision ノードは条件式が title 内にあるのでそれを condition フィールドに入れる。
        config: dict = {}
        if node_type == "think":
            config["prompt"] = step["body"]
        elif node_type == "decision":
            config["condition"] = _extract_condition(step["title"])
        nodes.append({
            "id": f"n{i + 1}",
            "type": node_type,
            "title": step["title"],
            "subtitle": step.get("subtitle", ""),
            "x": 420,
            "y": 70 + i * 130,
            "summary": summary,
            "desc": step["body"],
            "io_desc": [],
            "config": config,
            "input": {},
            "output": {},
            "duration": "",
            "depends": [f"n{i}"] if i > 0 else [],
        })

    edges = [
        {"from": f"n{i + 1}", "to": f"n{i + 2}"}
        for i in range(total - 1)
    ]

    # decision ノードに番号付きステップがあれば、yes-path として展開して
    # 「yes/no で分岐するフロー」に組み替える
    _expand_decision_branches(nodes, edges)

    return {
        "id": f"skill-{name}",
        "name": name,
        "category": "Skills",
        "description": description,
        "complexity": "Med",
        "source": {
            "type": "skill",
            "path": str(path),
            "layer": layer,
        },
        "nodes": nodes,
        "edges": edges,
        "parallels": [],
    }


def _strip_frontmatter(text: str) -> str:
    """Return text with the --- frontmatter block removed."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return text
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(lines[i + 1:])
    return text


def _make_node(idx: int, node_type: str, title: str, body: str = "") -> dict:
    """Build a standard node dict."""
    summary = body[:100]
    return {
        "id": f"n{idx + 1}",
        "type": node_type,
        "title": title,
        "subtitle": "",
        "x": 420,
        "y": 70 + idx * 130,
        "summary": summary,
        "desc": body,
        "io_desc": [],
        "config": {},
        "input": {},
        "output": {},
        "duration": "",
        "depends": [f"n{idx}"] if idx > 0 else [],
    }


def _make_edges(count: int) -> list:
    """Build linear edge list for `count` nodes."""
    return [{"from": f"n{i + 1}", "to": f"n{i + 2}"} for i in range(count - 1)]


# Claude Code コマンドの実行系: `!`cmd`` インライン bash と ```bash フェンス。
_BASH_INLINE_RE = re.compile(r"^\s*!\s*`([^`]+)`\s*$", re.MULTILINE)
_BASH_FENCE_RE = re.compile(r"```(?:bash|sh|shell)[^\n]*\n(.*?)```", re.DOTALL)


def _extract_bash_commands(body: str) -> list:
    """Collect deterministic shell commands from a command body
    (`!`...`` inline + ```bash fences), in document order."""
    matches = []
    for m in _BASH_INLINE_RE.finditer(body):
        matches.append((m.start(), m.group(1).strip()))
    for m in _BASH_FENCE_RE.finditer(body):
        block = m.group(1).strip()
        if block:
            matches.append((m.start(), block))
    return [cmd for _, cmd in sorted(matches)]


# 極小コマンド = フロー化せず現状維持の閾値。本文(frontmatter除く)が
# 10行未満かつ400字未満なら極小。flow_version:1 付きは常に「大きい」扱い。
_COMMAND_SMALL_MAX_LINES = 10
_COMMAND_SMALL_MAX_CHARS = 400


def _command_body_is_small(text: str) -> bool:
    """Return True if a slash-command is too small to flow-ify."""
    try:
        from parser_convention import is_convention_v1
    except ImportError:
        from .parser_convention import is_convention_v1
    if is_convention_v1(text):
        return False
    body = _strip_frontmatter(text).strip()
    nonempty = [ln for ln in body.splitlines() if ln.strip()]
    return len(nonempty) < _COMMAND_SMALL_MAX_LINES and len(body) < _COMMAND_SMALL_MAX_CHARS


def _command_stub_flow(path, layer, name, description, body):
    """The legacy 3-node stub — used for 極小 commands (現状維持)."""
    nodes = [_make_node(0, "user", f"/{name} コマンド実行", "")]
    body_lower = body.lower()
    ssh_bash_keywords = ["ssh", "bash", "shell", "コマンド実行", "スクリプト"]
    if any(kw in body_lower for kw in ssh_bash_keywords):
        nodes.append(_make_node(len(nodes), "code", "コマンド実行", body[:200]))
    nodes.append(_make_node(len(nodes), "parent", "結果報告", ""))
    return {
        "id": f"cmd-{name}", "name": name, "category": "Commands",
        "description": description, "complexity": "Low",
        "source": {"type": "command", "path": str(path), "layer": layer},
        "nodes": nodes, "edges": _make_edges(len(nodes)), "parallels": [],
    }


def parse_command(path: str, layer: str) -> dict:
    """Parse a slash-command markdown file into a flow dict.

    極小コマンド → 従来の 3 ノードスタブ（現状維持）。
    大きいコマンド → スキルと同じ手順抽出 (_extract_steps) でフロー化し、
    コマンド固有の入口(user)・bash(code)・argument-hint/allowed-tools を足す。
    """
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    frontmatter = _parse_frontmatter(text)
    name = file_path.stem
    # yaml may yield non-str description (list/bool/numeric); normalize via fm_str
    description = fm_str(frontmatter.get("description"))
    body = _strip_frontmatter(text)

    # 極小 → スタブ
    if _command_body_is_small(text):
        return _command_stub_flow(path, layer, name, description, body)

    # 規約準拠 (flow_version:1) → スキルと同じ決定論パスを流用
    try:
        from parser_convention import is_convention_v1, parse_skill_convention
    except ImportError:
        from .parser_convention import is_convention_v1, parse_skill_convention
    if is_convention_v1(text):
        try:
            flow = parse_skill_convention(path, layer)
            flow["id"] = f"cmd-{name}"
            flow["category"] = "Commands"
            flow.setdefault("source", {})["type"] = "command"
            flow["source"].pop("parser", None)
            return flow
        except Exception as e:
            logger.warning("parse_skill_convention failed for command, falling back: %s", e)

    # ヒューリスティック: user 入口 + _extract_steps + bash(code) + 結果報告
    # yaml は argument-hint を非str (bool/int/list) で返しうるので fm_str で正規化
    # (実YAMLパースの plugin 固有。8092 は naive パースで常に str)
    arg_hint = fm_str(frontmatter.get("argument-hint"))
    nodes = [_make_node(0, "user", f"/{name} 実行", arg_hint)]

    steps = _extract_steps(body)
    if steps:
        for step in steps:
            ntype = _infer_node_type(step["title"], step["body"], is_last=False)
            nodes.append(_make_node(len(nodes), ntype, step["title"], step["body"]))
    else:
        # 手順見出しが無い大きいコマンド → bash を code ノード化
        for cmd in _extract_bash_commands(body):
            nodes.append(_make_node(len(nodes), "code", "コマンド実行", cmd))

    nodes.append(_make_node(len(nodes), "parent", "結果報告", ""))

    flow = {
        "id": f"cmd-{name}", "name": name, "category": "Commands",
        "description": description, "complexity": "Med",
        "source": {"type": "command", "path": str(path), "layer": layer},
        "nodes": nodes, "edges": _make_edges(len(nodes)), "parallels": [],
    }
    allowed = frontmatter.get("allowed-tools") or frontmatter.get("allowed_tools")
    if allowed:
        flow["meta"] = {"allowed_tools": allowed}
    return flow


def parse_claude_md(path: str, layer: str, project_name: str = "") -> dict:
    """Parse a CLAUDE.md file into a flow dict with one node per ## section."""
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")

    section_pattern = re.compile(r"^##\s+(.+)$", re.MULTILINE)
    matches = list(section_pattern.finditer(text))

    nodes = []
    for idx, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        section_body = text[start:end].strip()
        nodes.append(_make_node(idx, "parent", title, section_body))

    # If no ## sections found, create a single node from the whole text
    if not nodes and text.strip():
        nodes.append(_make_node(0, "parent", "CLAUDE.md", text.strip()[:500]))

    edges = _make_edges(len(nodes))

    # Generate unique ID using project name if provided
    suffix = f"-{_slugify(project_name)}" if project_name else ""
    flow_id = f"claude-md-{layer}{suffix}"
    display_name = f"CLAUDE.md ({project_name})" if project_name else f"CLAUDE.md ({layer})"

    return {
        "id": flow_id,
        "name": display_name,
        "category": "System",
        "description": f"CLAUDE.md configuration for {layer} layer" + (f" ({project_name})" if project_name else ""),
        "complexity": "Low",
        "source": {
            "type": "claude_md",
            "path": str(path),
            "layer": layer,
        },
        "nodes": nodes,
        "edges": edges,
        "parallels": [],
    }


def _slugify(name: str) -> str:
    """Convert a name to a URL-safe slug."""
    slug = re.sub(r'[^\w\-]', '-', name)
    slug = re.sub(r'-+', '-', slug).strip('-').lower()
    return slug or "unnamed"


def parse_hooks(path: str, layer: str, project_name: str = "") -> dict:
    """Parse a settings.json file into a flow dict of hook nodes."""
    file_path = Path(path)
    data = json.loads(file_path.read_text(encoding="utf-8"))
    hooks_data = data.get("hooks", {})

    nodes = []
    idx = 0
    for hook_type in ("PreToolUse", "PostToolUse", "Notification"):
        entries = hooks_data.get(hook_type, [])
        for entry in entries:
            matcher = entry.get("matcher", "*")
            hook_list = entry.get("hooks", [])
            command = hook_list[0]["command"] if hook_list else ""
            node = _make_node(idx, "hook", f"{hook_type}: {matcher}", command)
            node["config"] = {
                "hook_type": hook_type,
                "matcher": matcher,
                "command": command,
            }
            node["desc"] = command
            nodes.append(node)
            idx += 1

    edges = _make_edges(len(nodes))

    suffix = f"-{_slugify(project_name)}" if project_name else ""
    flow_id = f"hooks-{layer}{suffix}"
    display_name = f"Hooks ({project_name})" if project_name else f"Hooks ({layer})"

    return {
        "id": flow_id,
        "name": display_name,
        "category": "Hooks",
        "description": f"Hook configuration for {layer} layer" + (f" ({project_name})" if project_name else ""),
        "complexity": "Low",
        "source": {
            "type": "hooks",
            "path": str(path),
            "layer": layer,
        },
        "nodes": nodes,
        "edges": edges,
        "parallels": [],
    }


def parse_agent(path: str, layer: str) -> dict:
    """Parse an agent markdown file (e.g. analyst.md) into a flow dict."""
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    name = file_path.stem

    # Extract ## sections as steps
    section_pattern = re.compile(r"^##\s+(.+)$", re.MULTILINE)
    matches = list(section_pattern.finditer(text))

    nodes = []
    for idx, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        section_body = text[start:end].strip()
        nodes.append(_make_node(idx, "subagent", title, section_body))

    # If no sections, create single node
    if not nodes and text.strip():
        nodes.append(_make_node(0, "subagent", name, text.strip()[:500]))

    edges = _make_edges(len(nodes))

    # Extract first line as description (usually # Title)
    first_line = text.strip().splitlines()[0] if text.strip() else ""
    description = first_line.lstrip("# ").strip() if first_line.startswith("#") else ""

    return {
        "id": f"agent-{name}",
        "name": name,
        "category": "Subagents",
        "description": description,
        "complexity": "Med",
        "source": {
            "type": "agent",
            "path": str(path),
            "layer": layer,
        },
        "nodes": nodes,
        "edges": edges,
        "parallels": [],
    }


def scan_claude_dir(dir_path: str, layer: str, project_name: str = "") -> list:
    """Scan a .claude directory and parse all skills, commands, CLAUDE.md, and settings.json."""
    base = Path(dir_path)
    flows = []

    # skills/*/SKILL.md
    for skill_path in sorted(base.glob("skills/*/SKILL.md")):
        try:
            flow = parse_skill(str(skill_path), layer)
            if flow.get("nodes"):
                flows.append(flow)
        except Exception as e:
            logger.warning("parse_skill failed: %s: %s", skill_path, e)

    # commands/*.md
    for cmd_path in sorted(base.glob("commands/*.md")):
        try:
            flow = parse_command(str(cmd_path), layer)
            if flow.get("nodes"):
                flows.append(flow)
        except Exception as e:
            logger.warning("parse_command failed: %s: %s", cmd_path, e)

    # CLAUDE.md
    claude_md_path = base / "CLAUDE.md"
    if claude_md_path.exists():
        try:
            flow = parse_claude_md(str(claude_md_path), layer, project_name=project_name)
            if flow.get("nodes"):
                flows.append(flow)
        except Exception as e:
            logger.warning("parse_claude_md failed: %s: %s", claude_md_path, e)

    # agents/*.md
    agents_dir = base / "agents"
    if agents_dir.exists():
        for agent_path in sorted(agents_dir.glob("*.md")):
            try:
                flow = parse_agent(str(agent_path), layer)
                if flow.get("nodes"):
                    flows.append(flow)
            except Exception as e:
                logger.warning("parse_agent failed: %s: %s", agent_path, e)

    # settings.json
    settings_path = base / "settings.json"
    if settings_path.exists():
        try:
            flow = parse_hooks(str(settings_path), layer, project_name=project_name)
            if flow.get("nodes"):
                flows.append(flow)
        except Exception as e:
            logger.warning("parse_hooks failed: %s: %s", settings_path, e)

    return flows


def discover_and_scan_all(projects_root: str = None) -> list:
    """Discover and scan ALL .claude/ directories and CLAUDE.md files.

    Scans four layers:
    - managed: ~/.claude/plugins/ (installed plugin skills)
    - user: ~/.claude/ (global user config)
    - user-project: ~/.claude/projects/*/ (per-project user overrides)
    - project: ~/projects/*/.claude/ and ~/projects/*/CLAUDE.md (project-level configs)
    """
    home = Path.home()
    flows = []

    # ── 0. Managed layer: installed plugins ──
    # Only scan plugins/cache/ — marketplaces/ contains the same skills as
    # registry metadata and was previously double-counted as ghost duplicates.
    plugins_dir = home / ".claude" / "plugins"
    plugins_cache = plugins_dir / "cache"
    if plugins_cache.exists():
        for skill_md in sorted(plugins_cache.rglob("skills/*/SKILL.md")):
            try:
                # Path shape: cache/<plugin_name>/.../skills/<skill_name>/SKILL.md
                parts = skill_md.relative_to(plugins_cache).parts
                plugin_name = parts[0] if parts else "plugin"
                flow = parse_skill(str(skill_md), "managed")
                if flow.get("nodes"):
                    skill_name = skill_md.parent.name
                    flow["id"] = f"skill-{_slugify(plugin_name)}-{skill_name}"
                    flow["name"] = f"{skill_name} ({plugin_name})"
                    # Phase A+: plugin attribution for Dashboard grouping
                    flow["plugin_source"] = plugin_name
                    flow["skill_name"] = skill_name
                    flows.append(flow)
            except Exception as e:
                logger.warning("parse_skill failed (managed plugin): %s: %s", skill_md, e)

    # ── 1. User layer: ~/.claude/ ──
    global_claude = home / ".claude"
    if global_claude.exists():
        flows.extend(scan_claude_dir(str(global_claude), "user", project_name="global"))

    # ── 2. User-project layer: ~/.claude/projects/*/ ──
    user_projects = global_claude / "projects"
    if user_projects.exists():
        for proj_dir in sorted(user_projects.iterdir()):
            if not proj_dir.is_dir():
                continue
            # Skip internal dirs like .session_logs
            if proj_dir.name.startswith("."):
                continue
            # These dirs may have CLAUDE.md, settings.json, or memory/ subdirs
            project_name = proj_dir.name
            # Check for CLAUDE.md directly
            claude_md = proj_dir / "CLAUDE.md"
            if claude_md.exists():
                try:
                    flow = parse_claude_md(str(claude_md), "user-project", project_name=project_name)
                    if flow.get("nodes"):
                        flows.append(flow)
                except Exception as e:
                    logger.warning("parse_claude_md failed (user-project): %s: %s", claude_md, e)
            # Check memory/CLAUDE.md
            memory_md = proj_dir / "memory" / "CLAUDE.md"
            if memory_md.exists():
                try:
                    flow = parse_claude_md(str(memory_md), "user-project", project_name=f"{project_name}/memory")
                    if flow.get("nodes"):
                        flows.append(flow)
                except Exception as e:
                    logger.warning("parse_claude_md failed (user-project memory): %s: %s", memory_md, e)
            # Check settings.json
            settings = proj_dir / "settings.json"
            if settings.exists():
                try:
                    flow = parse_hooks(str(settings), "user-project", project_name=project_name)
                    if flow.get("nodes"):
                        flows.append(flow)
                except Exception as e:
                    logger.warning("parse_hooks failed (user-project): %s: %s", settings, e)

    # ── 3. Project layer: ~/projects/ (and subdirectories) ──
    if projects_root is None:
        projects_root = str(home / "projects")
    projects_base = Path(projects_root)

    if projects_base.exists():
        # Find all .claude/ directories and root CLAUDE.md under ~/projects/
        for item in sorted(projects_base.iterdir()):
            if not item.is_dir():
                continue
            _scan_project_tree(item, projects_base, flows)

    return flows


def _scan_project_tree(project_dir: Path, projects_base: Path, flows: list, depth: int = 0):
    """Recursively scan a project directory for .claude/ and CLAUDE.md (max depth 3)."""
    if depth > 3:
        return

    project_name = str(project_dir.relative_to(projects_base))

    # Check for .claude/ directory in this project
    claude_dir = project_dir / ".claude"
    if claude_dir.exists() and claude_dir.is_dir():
        project_flows = scan_claude_dir(str(claude_dir), "project", project_name=project_name)
        flows.extend(project_flows)

    # Scan for non-standard SKILL.md files (e.g. pipeline/skills/, custom locations).
    # Only at depth 0 to avoid double-scanning when recursing into sub-projects.
    if depth == 0:
        _scan_extra_skills(project_dir, project_name, flows)

    # Check for root-level CLAUDE.md (not inside .claude/)
    root_claude_md = project_dir / "CLAUDE.md"
    if root_claude_md.exists():
        try:
            flow = parse_claude_md(str(root_claude_md), "project", project_name=project_name)
            if flow.get("nodes"):
                flows.append(flow)
        except Exception as e:
            logger.warning("parse_claude_md failed (project root): %s: %s", root_claude_md, e)

    # Check for AGENTS.md at project root
    agents_md = project_dir / "AGENTS.md"
    if agents_md.exists():
        try:
            flow = parse_agent(str(agents_md), "project")
            flow["id"] = f"agents-md-{_slugify(project_name)}"
            flow["name"] = f"AGENTS.md ({project_name})"
            if flow.get("nodes"):
                flows.append(flow)
        except Exception as e:
            logger.warning("parse_agent failed (AGENTS.md): %s: %s", agents_md, e)

    # Check for agents/ directory at project root (outside .claude/)
    agents_dir = project_dir / "agents"
    if not agents_dir.exists():
        # Also check common locations like org/agents/
        for candidate in ("org/agents", "config/agents", ".agents"):
            candidate_dir = project_dir / candidate
            if candidate_dir.exists() and candidate_dir.is_dir():
                agents_dir = candidate_dir
                break
    if agents_dir.exists() and agents_dir.is_dir():
        for agent_path in sorted(agents_dir.glob("*.md")):
            try:
                flow = parse_agent(str(agent_path), "project")
                # Make ID unique per project
                flow["id"] = f"agent-{_slugify(project_name)}-{agent_path.stem}"
                flow["name"] = f"{agent_path.stem} ({project_name})"
                if flow.get("nodes"):
                    flows.append(flow)
            except Exception as e:
                logger.warning("parse_agent failed (project agents/): %s: %s", agent_path, e)

    # Recurse into subdirectories (for monorepo structures like the-true-works/web)
    if depth < 3:
        try:
            for child in sorted(project_dir.iterdir()):
                if child.is_dir() and not child.name.startswith(".") and child.name != "node_modules":
                    # Only recurse if there's a .claude/ or CLAUDE.md inside
                    has_claude = (child / ".claude").exists() or (child / "CLAUDE.md").exists()
                    if has_claude:
                        _scan_project_tree(child, projects_base, flows, depth + 1)
        except PermissionError as e:
            logger.debug("scan failed for dir: %s: %s", project_dir, e)


# ── Extra skills (Option B) ──────────────────────────────────────────────
# Discovers SKILL.md files OUTSIDE Claude Code's standard locations.
# Use case: project-local conventions like `pipeline/skills/blog-writer/SKILL.md`
# that are referenced by CLAUDE.md but not registered as Claude Code skills.
#
# These are tagged with `plugin_source = "project:<project_name>"` so the
# Dashboard groups them under the originating project, making it clear which
# working directory the skill is meant for.

# Directories that never contain user-authored skills — always skip
_EXTRA_SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "__pycache__", ".pytest_cache",
    "venv", ".venv", "env", "dist", "build", "target", "out",
    ".next", ".nuxt", ".cache", "coverage", ".turbo",
    ".claude",  # already handled by scan_claude_dir
}
# Patterns that look like backup / scratch directories — skip
_EXTRA_SKIP_RE = re.compile(r"^(backup[_-]?\d|backups?$|_backup|tmp$|temp$|old$|archive$|\.bak$)", re.IGNORECASE)
# Test-fixture directories — skip
_EXTRA_TEST_DIRS = {"tests", "test", "__tests__", "fixtures", "spec", "specs", "e2e"}

def _is_extra_skip_path(rel_parts: tuple) -> bool:
    """True if any path component looks like a directory we shouldn't scan."""
    for p in rel_parts:
        if p in _EXTRA_SKIP_DIRS:
            return True
        if _EXTRA_SKIP_RE.match(p):
            return True
        # test dirs at any depth count, but only if combined with skills/ below
        # — fixtures may legitimately contain SKILL.md for testing the parser itself
        if p in _EXTRA_TEST_DIRS:
            return True
    return False

def _scan_extra_skills(project_dir: Path, project_name: str, flows: list):
    """Find SKILL.md files outside .claude/ in a project tree and register them.

    Each is tagged with `plugin_source = "project:<project_name>"` so the
    dashboard groups them per working directory. The relative container path
    (e.g. `pipeline/skills`) is preserved in `meta.container_path` for the
    UI's sub-grouping or display.

    Only scans directories that look like a *real* project — i.e. that contain
    a `.claude/`, a `CLAUDE.md`, or a `.git/`. Without this guard, scanning a
    broad projects root (e.g. `/srv`) would rglob into venvs, archives, and
    unrelated trees that merely happen to contain a SKILL.md sample, surfacing
    them as bogus projects in the dashboard's project selector.
    """
    if not project_dir.is_dir():
        return
    if not (
        (project_dir / ".claude").is_dir()
        or (project_dir / "CLAUDE.md").is_file()
        or (project_dir / ".git").is_dir()
    ):
        return
    try:
        for skill_md in sorted(project_dir.rglob("SKILL.md")):
            try:
                rel = skill_md.relative_to(project_dir)
            except ValueError as e:
                logger.debug("skip skill (relative_to failed): %s: %s", skill_md, e)
                continue
            rel_parts = rel.parts
            # Need at least <something>/SKILL.md — usually <container>/<skill_name>/SKILL.md
            if len(rel_parts) < 2:
                continue
            if _is_extra_skip_path(rel_parts):
                continue
            # parse the skill
            try:
                flow = parse_skill(str(skill_md), "project")
            except Exception as e:
                logger.warning("parse_skill failed (extra): %s: %s", skill_md, e)
                continue
            if not flow.get("nodes"):
                continue
            skill_dirname = skill_md.parent.name             # e.g. "blog-writer"
            container_parts = rel_parts[:-2]                  # drop skill_name & SKILL.md
            container = "/".join(container_parts) if container_parts else "(root)"
            # Make ID unique and stable
            flow["id"] = f"project-skill-{_slugify(project_name)}-{_slugify(container)}-{_slugify(skill_dirname)}"
            flow["name"] = skill_dirname
            # Use plugin_source for top-level Dashboard grouping
            flow["plugin_source"] = f"project:{project_name}"
            flow["skill_name"] = skill_dirname
            # Sub-grouping hint for UI (e.g. "pipeline/skills" under "project:foo")
            flow["meta"] = flow.get("meta", {}) if isinstance(flow.get("meta"), dict) else {}
            flow["meta"]["container_path"] = container
            flow["meta"]["working_dir"] = project_name
            # Make sure source layer is "project" and path is absolute.
            # Preserve source.type (= "skill") + any other keys set by the parser
            # so the flow stays stageable (POST /api/flows/{id}/stage).
            _src = flow.get("source") if isinstance(flow.get("source"), dict) else {}
            flow["source"] = {**_src, "layer": "project", "path": str(skill_md)}
            flow["source"].setdefault("type", "skill")
            flows.append(flow)
    except (PermissionError, OSError) as e:
        logger.warning("scan failed for dir: %s: %s", project_dir, e)


# ══════════════════════════════════════════════════════════════════
# Dashboard data collection — normalized JSON for /api/dashboard
# ══════════════════════════════════════════════════════════════════


def _short_path(p: str) -> str:
    """Shorten absolute path for display."""
    if not p:
        return p
    home = str(Path.home())
    s = p.replace(home, "~") if p.startswith(home) else p
    # Plugin cache: ~/.claude/plugins/cache/X/.../skills/Y/SKILL.md → plugins:X/skills/Y/SKILL.md
    m = re.match(
        r"~/\.claude/plugins/(?:cache|marketplaces)/([^/]+)/(?:[^/]+/)?(?:[^/]+/)?skills/(.+)", s
    )
    if m:
        return f"plugins:{m.group(1)}/skills/{m.group(2)}"
    s = s.replace("~/.claude/projects/", "projects:/")
    return s


def _file_size(path: Path) -> str:
    """Human-readable file size."""
    try:
        n = path.stat().st_size
    except OSError as e:
        logger.debug("stat failed for file: %s: %s", path, e)
        return ""
    if n < 1024:
        return f"{n}B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f}KB"
    return f"{n / (1024 * 1024):.1f}MB"


def _file_entry(path: Path, file_type: str) -> dict:
    """Build a file entry for config_stack."""
    return {
        "name": _short_path(str(path)),
        "exists": path.exists(),
        "size": _file_size(path) if path.exists() else "",
        "type": file_type,
    }


def _extract_sections(path: Path) -> list:
    """Extract ## headings from a markdown file."""
    try:
        text = path.read_text(encoding="utf-8")
        return [m.group(1).strip() for m in re.finditer(r"^##\s+(.+)$", text, re.MULTILINE)]
    except Exception as e:
        logger.warning("read sections failed: %s: %s", path, e)
        return []


def _parse_permission_rule(rule_str: str) -> dict:
    """Parse 'Tool(specifier)' into tool + specifier."""
    m = re.match(r"^(\w+)\((.+)\)$", rule_str)
    if m:
        return {"tool": m.group(1), "specifier": m.group(2)}
    return {"tool": rule_str, "specifier": None}


# ── Individual extractors ──


def extract_skill_meta(path: str, layer: str, plugin_name: str = None) -> dict:
    """Parse SKILL.md → normalized Skill dict."""
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    fm = _parse_frontmatter(text)
    name = fm_str(fm.get("name")) or (file_path.parent.name if file_path.stem == "SKILL" else file_path.stem)
    steps = _extract_steps(_strip_frontmatter(text))

    # Derive invoke_mode (yaml may yield bool; normalize via fm_str)
    if fm_str(fm.get("disable-model-invocation")).lower() == "true":
        invoke_mode = "user-only"
    elif fm_str(fm.get("user-invocable")).lower() == "false":
        invoke_mode = "hidden"
    else:
        invoke_mode = "auto"

    allowed_tools = fm_list(fm.get("allowed-tools"))

    slug = _slugify(plugin_name) + "-" if plugin_name else ""
    return {
        "id": f"skill-{slug}{_slugify(name)}",
        "name": name,
        "plugin": plugin_name,
        "layer": layer,
        "source_path": str(path),
        "description": fm_str(fm.get("description")),
        "invoke_mode": invoke_mode,
        "allowed_tools": allowed_tools,
        "model": fm_str(fm.get("model")) or None,
        "effort": fm_str(fm.get("effort")) or None,
        "context": fm_str(fm.get("context")) or None,
        "agent": fm_str(fm.get("agent")) or None,
        "argument_hint": fm_str(fm.get("argument-hint")) or None,
        "paths": fm_str(fm.get("paths")) or None,
        "node_count": max(len(steps), 1),
        "complexity": "High" if len(steps) > 5 else "Med" if len(steps) > 2 else "Low",
        "has_flow": True,
    }


def extract_command_meta(path: str, layer: str) -> dict:
    """Parse commands/*.md → normalized Command dict."""
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    fm = _parse_frontmatter(text)
    name = fm_str(fm.get("name")) or file_path.stem
    steps = _extract_steps(_strip_frontmatter(text))

    return {
        "id": f"cmd-{_slugify(name)}",
        "name": name,
        "layer": layer,
        "source_path": str(path),
        "description": fm_str(fm.get("description")),
        "argument_hint": fm_str(fm.get("argument-hint")) or None,
        "node_count": max(len(steps), 1),
        "has_flow": True,
    }


def extract_agent_meta(path: str, layer: str, project_name: str = None) -> dict:
    """Parse agents/*.md → normalized Agent dict."""
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    fm = _parse_frontmatter(text)
    name = fm_str(fm.get("name")) or file_path.stem

    # Count ## sections for node_count
    sections = re.findall(r"^##\s+.+$", text, re.MULTILINE)

    # First line description fallback
    first_line = text.strip().splitlines()[0] if text.strip() else ""
    desc_fallback = first_line.lstrip("# ").strip() if first_line.startswith("#") else ""

    slug_proj = f"{_slugify(project_name)}-" if project_name else ""
    return {
        "id": f"agent-{slug_proj}{_slugify(name)}",
        "name": name,
        "project": project_name,
        "layer": layer,
        "source_path": str(path),
        "description": fm_str(fm.get("description")) or desc_fallback,
        "model": fm_str(fm.get("model")) or None,
        "tools": fm_list(fm.get("tools")),
        "disallowed_tools": fm_list(fm.get("disallowedTools")),
        "memory": fm_str(fm.get("memory")) or None,
        "background": fm_str(fm.get("background")).lower() == "true",
        "isolation": fm_str(fm.get("isolation")) or None,
        "color": fm_str(fm.get("color")) or None,
        "max_turns": int(fm["maxTurns"]) if str(fm.get("maxTurns", "")).isdigit() else None,
        "skills": fm_list(fm.get("skills")),
        "mcp_servers": fm_list(fm.get("mcpServers")),
        "node_count": max(len(sections), 1),
        "has_flow": True,
    }


def extract_hooks(path: str, layer: str, project_name: str = None) -> list:
    """Parse settings.json hooks → list of individual Hook dicts."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    hooks_data = data.get("hooks", {})
    results = []

    all_events = [
        "PreToolUse", "PostToolUse", "SessionStart", "SessionEnd",
        "Stop", "Notification", "SubagentStart", "SubagentStop",
        "PreCompact", "PostCompact", "FileChanged", "UserPromptSubmit",
        "Setup", "StopFailure", "PostToolUseFailure", "PostToolBatch",
        "PermissionRequest", "PermissionDenied", "TeammateIdle",
        "TaskCreated", "TaskCompleted", "ConfigChange", "CwdChanged",
        "InstructionsLoaded", "WorktreeCreate", "WorktreeRemove",
    ]

    for event in all_events:
        entries = hooks_data.get(event, [])
        for i, entry in enumerate(entries):
            matcher = entry.get("matcher", "*")
            hook_list = entry.get("hooks", [])
            for j, handler in enumerate(hook_list):
                h_type = handler.get("type", "command")
                results.append({
                    "id": f"hook-{layer}-{_slugify(event)}-{_slugify(matcher)}-{i}-{j}",
                    "event": event,
                    "matcher": matcher,
                    "layer": layer,
                    "source_path": str(path),
                    "project": project_name,
                    "handler_type": h_type,
                    "command": handler.get("command", ""),
                    "url": handler.get("url", ""),
                    "timeout": handler.get("timeout"),
                    "async_flag": handler.get("async", False),
                    "once": handler.get("once", False),
                })
    return results


def extract_mcp_servers(path: str, layer: str, source_label: str) -> list:
    """Parse mcpServers from any config file → list of McpServer dicts."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    servers = data.get("mcpServers", {})
    results = []
    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        results.append({
            "id": f"mcp-{layer}-{_slugify(name)}",
            "name": name,
            "layer": layer,
            "source": source_label,
            "source_path": str(path),
            "type": cfg.get("type", "stdio"),
            "command": cfg.get("command", ""),
            "args": cfg.get("args", []),
            "url": cfg.get("url") or None,
            "env": {k: "***" if "key" in k.lower() or "secret" in k.lower() or "token" in k.lower()
                    else v for k, v in cfg.get("env", {}).items()},
            "active": True,
            "tools": [],
            "error": None,
        })
    return results


def extract_permissions(path: str, layer: str) -> list:
    """Parse permissions from settings.json → list of rule dicts."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    perms = data.get("permissions", {})
    results = []
    for rule_type in ("allow", "deny", "ask"):
        rules = perms.get(rule_type, [])
        if isinstance(rules, list):
            for rule_str in rules:
                parsed = _parse_permission_rule(rule_str)
                results.append({
                    "layer": layer,
                    "type": rule_type,
                    "rule": rule_str,
                    "tool": parsed["tool"],
                    "specifier": parsed["specifier"],
                    "source_path": str(path),
                })
    return results


def extract_settings(path: str) -> dict:
    """Parse settings.json → dashboard-relevant settings dict."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    perms = data.get("permissions", {})
    sb = data.get("sandbox", {})
    wt = data.get("worktree", {})
    return {
        "model": data.get("model"),
        "default_mode": perms.get("defaultMode") or data.get("defaultMode"),
        "editor_mode": data.get("editorMode"),
        "tui": data.get("tui"),
        "effort_level": data.get("effortLevel"),
        "language": data.get("language"),
        "auto_memory": data.get("autoMemoryEnabled", True),
        "sandbox": {
            "enabled": sb.get("enabled", False),
            "filesystem": sb.get("filesystem"),
            "network": sb.get("network"),
        } if sb else None,
        "worktree": {
            "base_ref": wt.get("baseRef"),
            "bg_isolation": wt.get("bgIsolation"),
        } if wt else None,
        "env": data.get("env", {}),
        "attribution": data.get("attribution"),
    }


def extract_plugins(plugins_dir: str) -> list:
    """Read installed_plugins.json → list of Plugin dicts."""
    installed_file = Path(plugins_dir) / "installed_plugins.json"
    if not installed_file.exists():
        return []
    try:
        data = json.loads(installed_file.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("parse installed_plugins.json failed: %s: %s", installed_file, e)
        return []

    results = []
    version = data.get("version", 1)
    plugins_map = data.get("plugins", {})

    for key, entries in plugins_map.items():
        # key format: "name@marketplace" or just plugin id
        parts = key.split("@", 1)
        name = parts[0]
        marketplace = parts[1] if len(parts) > 1 else "unknown"

        if not isinstance(entries, list):
            entries = [entries]

        for entry in entries:
            install_path = entry.get("installPath", "")
            # Count skills under install_path
            skills_count = 0
            agents_count = 0
            commands_count = 0
            if install_path:
                ip = Path(install_path)
                skills_count = len(list(ip.rglob("skills/*/SKILL.md"))) if ip.exists() else 0
                agents_count = len(list(ip.rglob("agents/*.md"))) if ip.exists() else 0
                commands_count = len(list(ip.rglob("commands/*.md"))) if ip.exists() else 0

            results.append({
                "id": key,
                "name": name,
                "marketplace": marketplace,
                "version": entry.get("version", ""),
                "description": "",
                "enabled": True,
                "install_path": install_path,
                "installed_at": entry.get("installedAt", ""),
                "skills_count": skills_count,
                "agents_count": agents_count,
                "commands_count": commands_count,
            })
    return results


# ── Main collector ──


def collect_dashboard_data(projects_root: str = None) -> dict:
    """Collect and normalize ALL dashboard data from the machine.

    Returns the full /api/dashboard response body.
    """
    home = Path.home()
    global_claude = home / ".claude"
    if projects_root is None:
        projects_root = str(home / "projects")
    projects_base = Path(projects_root)

    skills = []
    commands = []
    agents = []
    hooks = []
    mcp_servers = []
    perm_rules = []
    settings_merged = {}
    files_by_layer = {
        "managed": [], "user": [], "user-project": [], "project": [], "local": [],
    }
    sections_by_layer = {}
    perms_by_layer = {}
    layers_found = set()
    project_info = {}  # name -> {has_claude_dir, skills, commands, agents, hooks, has_mcp, has_agents_md}

    def _safe(fn, *args, default=None):
        try:
            return fn(*args)
        except Exception as e:
            logger.warning("dashboard extractor %s failed args=%s: %s", getattr(fn, "__name__", fn), args, e)
            return default if default is not None else []

    def _add_file(layer, path, ftype):
        if Path(path).exists():
            files_by_layer[layer].append(_file_entry(Path(path), ftype))
            layers_found.add(layer)

    # ── 0. Managed: plugin skills ──
    # Only scan plugins/cache/ (skip marketplaces/ to prevent ghost dupes)
    plugins_dir = global_claude / "plugins"
    plugins = _safe(extract_plugins, str(plugins_dir), default=[])

    plugins_cache = plugins_dir / "cache"
    if plugins_cache.exists():
        for skill_md in sorted(plugins_cache.rglob("skills/*/SKILL.md")):
            parts = skill_md.relative_to(plugins_cache).parts
            plugin_name = parts[0] if parts else "plugin"
            meta = _safe(extract_skill_meta, str(skill_md), "managed", plugin_name)
            if meta:
                # Attribute the skill to its plugin so the Dashboard can group
                meta["plugin_source"] = plugin_name
                skills.append(meta)
                _add_file("managed", str(skill_md), "skill")

    # ── 1. User: ~/.claude/ ──
    if global_claude.exists():
        layers_found.add("user")

        # Skills
        for sp in sorted(global_claude.glob("skills/*/SKILL.md")):
            meta = _safe(extract_skill_meta, str(sp), "user")
            if meta:
                skills.append(meta)
            _add_file("user", str(sp), "skill")

        # Commands
        for cp in sorted(global_claude.glob("commands/*.md")):
            meta = _safe(extract_command_meta, str(cp), "user")
            if meta:
                commands.append(meta)
            _add_file("user", str(cp), "command")

        # Agents
        user_agents = global_claude / "agents"
        if user_agents.exists():
            for ap in sorted(user_agents.glob("*.md")):
                meta = _safe(extract_agent_meta, str(ap), "user")
                if meta:
                    agents.append(meta)
                _add_file("user", str(ap), "agent")

        # CLAUDE.md
        user_claude_md = global_claude / "CLAUDE.md"
        if user_claude_md.exists():
            _add_file("user", str(user_claude_md), "claude_md")
            sections_by_layer["user"] = _extract_sections(user_claude_md)

        # settings.json
        user_settings = global_claude / "settings.json"
        if user_settings.exists():
            _add_file("user", str(user_settings), "settings")
            h = _safe(extract_hooks, str(user_settings), "user")
            hooks.extend(h)
            p = _safe(extract_permissions, str(user_settings), "user")
            perm_rules.extend(p)
            perms_by_layer["user"] = [r["rule"] for r in p if r["type"] == "allow"]
            s = _safe(extract_settings, str(user_settings), default={})
            if s:
                settings_merged.update({k: v for k, v in s.items() if v is not None})
            # MCP from settings
            mcp = _safe(extract_mcp_servers, str(user_settings), "user", "settings.json")
            mcp_servers.extend(mcp)

        # settings.local.json
        user_local = global_claude / "settings.local.json"
        if user_local.exists():
            _add_file("user", str(user_local), "settings")
            p = _safe(extract_permissions, str(user_local), "user")
            perm_rules.extend(p)

    # ~/.claude.json — MCP servers
    claude_json = home / ".claude.json"
    if claude_json.exists():
        mcp = _safe(extract_mcp_servers, str(claude_json), "user", ".claude.json")
        mcp_servers.extend(mcp)

    # ── 2. User-project: ~/.claude/projects/*/ ──
    user_projects = global_claude / "projects"
    if user_projects.exists():
        for proj_dir in sorted(user_projects.iterdir()):
            if not proj_dir.is_dir() or proj_dir.name.startswith("."):
                continue
            pn = proj_dir.name
            # CLAUDE.md
            cm = proj_dir / "CLAUDE.md"
            if cm.exists():
                _add_file("user-project", str(cm), "claude_md")
                layers_found.add("user-project")
            # memory/CLAUDE.md
            mem = proj_dir / "memory" / "CLAUDE.md"
            if mem.exists():
                _add_file("user-project", str(mem), "claude_md")
            # settings.json
            st = proj_dir / "settings.json"
            if st.exists():
                _add_file("user-project", str(st), "settings")
                h = _safe(extract_hooks, str(st), "user-project", pn)
                hooks.extend(h)

    # ── 3. Project: ~/projects/ ──
    if projects_base.exists():
        for item in sorted(projects_base.iterdir()):
            if not item.is_dir():
                continue
            _collect_project(item, projects_base, "project",
                             skills, commands, agents, hooks, mcp_servers,
                             perm_rules, files_by_layer, sections_by_layer,
                             perms_by_layer, layers_found, project_info, settings_merged)

    # ── Build config_stack ──
    layer_defs = [
        ("managed", "MANAGED", "~/.claude/plugins/", "Installed plugins", "No plugins"),
        ("user", "USER GLOBAL", "~/.claude/", "Personal settings · shared across all projects", "No global settings"),
        ("user-project", "USER × PROJECT", "~/.claude/projects/", "Per-project user settings", "No project-specific settings"),
        ("project", "PROJECT", "~/projects/*/.claude/", "Project-level settings", "No project settings"),
        ("local", "LOCAL", ".claude.local/", "Local overrides", "No local overrides"),
    ]
    config_stack = []
    for lid, title, path, sub, note in layer_defs:
        config_stack.append({
            "id": lid, "layer": lid, "title": title, "path": path, "sub": sub,
            "note": note,
            "present": lid in layers_found,
            "files": files_by_layer.get(lid, [])[:30],
            "sections": sections_by_layer.get(lid, []),
            "permissions": perms_by_layer.get(lid, []),
        })

    # ── Build permissions ──
    merged_allow = list({r["rule"] for r in perm_rules if r["type"] == "allow"})
    merged_deny = list({r["rule"] for r in perm_rules if r["type"] == "deny"})
    merged_ask = list({r["rule"] for r in perm_rules if r["type"] == "ask"})

    # ── Build projects ──
    projects_list = []
    for pname, info in sorted(project_info.items()):
        projects_list.append({
            "name": pname,
            "path": f"~/projects/{pname}",
            "has_claude_dir": info.get("has_claude_dir", False),
            "has_mcp_json": info.get("has_mcp_json", False),
            "has_agents_md": info.get("has_agents_md", False),
            "skills_count": info.get("skills", 0),
            "commands_count": info.get("commands", 0),
            "agents_count": info.get("agents", 0),
            "hooks_count": info.get("hooks", 0),
        })

    return {
        "config_stack": config_stack,
        "skills": skills,
        "commands": commands,
        "agents": agents,
        "hooks": hooks,
        "mcp_servers": mcp_servers,
        "permissions": {
            "rules": perm_rules,
            "default_mode": settings_merged.get("default_mode", "default"),
            "merged_allow": merged_allow,
            "merged_deny": merged_deny,
            "merged_ask": merged_ask,
        },
        "plugins": plugins,
        "settings": settings_merged,
        "projects": projects_list,
    }


def _collect_project(
    project_dir: Path, projects_base: Path, layer: str,
    skills: list, commands: list, agents: list, hooks: list,
    mcp_servers: list, perm_rules: list, files_by_layer: dict,
    sections_by_layer: dict, perms_by_layer: dict,
    layers_found: set, project_info: dict, settings_merged: dict,
    depth: int = 0,
):
    """Collect dashboard data from a single project directory."""
    if depth > 3:
        return

    pname = str(project_dir.relative_to(projects_base))
    info = project_info.setdefault(pname, {})

    def _safe(fn, *args, default=None):
        try:
            return fn(*args)
        except Exception as e:
            logger.warning("project extractor %s failed args=%s: %s", getattr(fn, "__name__", fn), args, e)
            return default if default is not None else []

    def _add_file(path, ftype):
        if Path(path).exists():
            files_by_layer["project"].append(_file_entry(Path(path), ftype))
            layers_found.add("project")

    claude_dir = project_dir / ".claude"
    if claude_dir.exists() and claude_dir.is_dir():
        info["has_claude_dir"] = True

        # Skills
        for sp in sorted(claude_dir.glob("skills/*/SKILL.md")):
            meta = _safe(extract_skill_meta, str(sp), layer)
            if meta:
                meta["id"] = f"skill-{_slugify(pname)}-{_slugify(meta['name'])}"
                skills.append(meta)
                info["skills"] = info.get("skills", 0) + 1
            _add_file(str(sp), "skill")

        # Commands
        for cp in sorted(claude_dir.glob("commands/*.md")):
            meta = _safe(extract_command_meta, str(cp), layer)
            if meta:
                meta["id"] = f"cmd-{_slugify(pname)}-{_slugify(meta['name'])}"
                commands.append(meta)
                info["commands"] = info.get("commands", 0) + 1
            _add_file(str(cp), "command")

        # Agents
        ad = claude_dir / "agents"
        if ad.exists():
            for ap in sorted(ad.glob("*.md")):
                meta = _safe(extract_agent_meta, str(ap), layer, pname)
                if meta:
                    agents.append(meta)
                    info["agents"] = info.get("agents", 0) + 1
                _add_file(str(ap), "agent")

        # CLAUDE.md
        cm = claude_dir / "CLAUDE.md"
        if cm.exists():
            _add_file(str(cm), "claude_md")
            sections_by_layer.setdefault("project", []).extend(_extract_sections(cm))

        # settings.json
        st = claude_dir / "settings.json"
        if st.exists():
            _add_file(str(st), "settings")
            h = _safe(extract_hooks, str(st), layer, pname)
            hooks.extend(h)
            info["hooks"] = info.get("hooks", 0) + len(h)
            p = _safe(extract_permissions, str(st), layer)
            perm_rules.extend(p)
            mcp = _safe(extract_mcp_servers, str(st), layer, "settings.json")
            mcp_servers.extend(mcp)

    # Root CLAUDE.md
    root_cm = project_dir / "CLAUDE.md"
    if root_cm.exists():
        _add_file(str(root_cm), "claude_md")

    # AGENTS.md
    agents_md = project_dir / "AGENTS.md"
    if agents_md.exists():
        info["has_agents_md"] = True
        meta = _safe(extract_agent_meta, str(agents_md), layer, pname)
        if meta:
            meta["id"] = f"agents-md-{_slugify(pname)}"
            meta["name"] = f"AGENTS.md"
            agents.append(meta)
            info["agents"] = info.get("agents", 0) + 1
        _add_file(str(agents_md), "agent")

    # agents/ at project root (outside .claude/)
    root_agents = project_dir / "agents"
    if not root_agents.exists():
        for cand in ("org/agents", "config/agents"):
            c = project_dir / cand
            if c.exists() and c.is_dir():
                root_agents = c
                break
    if root_agents.exists() and root_agents.is_dir():
        for ap in sorted(root_agents.glob("*.md")):
            meta = _safe(extract_agent_meta, str(ap), layer, pname)
            if meta:
                agents.append(meta)
                info["agents"] = info.get("agents", 0) + 1
            _add_file(str(ap), "agent")

    # .mcp.json at project root
    mcp_json = project_dir / ".mcp.json"
    if mcp_json.exists():
        info["has_mcp_json"] = True
        mcp = _safe(extract_mcp_servers, str(mcp_json), layer, ".mcp.json")
        mcp_servers.extend(mcp)

    # Extra skills: SKILL.md outside .claude/ (Option B)
    # Only at depth 0 to avoid double-scanning when recursing into sub-projects
    if depth == 0:
        for skill_md in sorted(project_dir.rglob("SKILL.md")):
            try:
                rel = skill_md.relative_to(project_dir)
            except ValueError as e:
                logger.debug("skip skill (relative_to failed in collect): %s: %s", skill_md, e)
                continue
            rel_parts = rel.parts
            if len(rel_parts) < 2 or _is_extra_skip_path(rel_parts):
                continue
            meta = _safe(extract_skill_meta, str(skill_md), layer)
            if not meta:
                continue
            skill_dirname = skill_md.parent.name
            container_parts = rel_parts[:-2]
            container = "/".join(container_parts) if container_parts else "(root)"
            meta["id"] = f"project-skill-{_slugify(pname)}-{_slugify(container)}-{_slugify(skill_dirname)}"
            meta["plugin_source"] = f"project:{pname}"
            meta["container_path"] = container
            meta["working_dir"] = pname
            skills.append(meta)
            info["skills"] = info.get("skills", 0) + 1
            _add_file(str(skill_md), "skill")

    # Recurse
    if depth < 3:
        try:
            for child in sorted(project_dir.iterdir()):
                if child.is_dir() and not child.name.startswith(".") and child.name != "node_modules":
                    has_claude = (child / ".claude").exists() or (child / "CLAUDE.md").exists()
                    if has_claude:
                        _collect_project(
                            child, projects_base, layer,
                            skills, commands, agents, hooks,
                            mcp_servers, perm_rules, files_by_layer,
                            sections_by_layer, perms_by_layer,
                            layers_found, project_info, settings_merged,
                            depth + 1,
                        )
        except PermissionError as e:
            logger.debug("recurse failed for dir: %s: %s", project_dir, e)


# ── CLAUDE.md stack (project-scoped hierarchy view) ──────────────────────────


def _claude_sections(text: str) -> list:
    """Headings (# and ##) from a CLAUDE.md body, in order."""
    return [m.group(2).strip()
            for m in re.finditer(r"^(#{1,2})\s+(.+)$", text, re.MULTILINE)]


def _md_preview(text: str, max_lines: int = 12) -> str:
    """First non-trailing lines of a markdown body, for an inline preview."""
    lines = text.strip("\n").splitlines()
    return "\n".join(lines[:max_lines])


def _split_md_sections(text: str) -> list:
    """Split a markdown body into {heading, excerpt} blocks by # / ## headings."""
    parts = []
    cur = None
    body = []
    for line in text.splitlines():
        m = re.match(r"^(#{1,2})\s+(.+)$", line)
        if m:
            if cur is not None:
                parts.append({"heading": cur, "excerpt": "\n".join(body).strip()})
            cur = line.strip()
            body = []
        elif cur is not None:
            body.append(line)
    if cur is not None:
        parts.append({"heading": cur, "excerpt": "\n".join(body).strip()})
    return parts


def _display_path(path: Path, home: Path) -> str:
    """'~/.claude/CLAUDE.md' style display, project files as 'name/CLAUDE.md'."""
    try:
        return "~/" + str(path.relative_to(home))
    except ValueError:
        return f"{path.parent.name}/{path.name}"


def collect_claude_stack(project_path: str, home: Path = None) -> dict:
    """Resolve ONLY the CLAUDE.md chain that applies to one project.

    Layers: managed -> user -> user-project -> project -> local.
    They are concatenated (additive), not overriding. Returns per-layer
    presence/preview/sections plus a merged section list and a summary.
    skills / commands / agents / settings are intentionally excluded.
    """
    import sys as _sys
    home = home or Path.home()
    proj = Path(project_path).expanduser()

    # OS-specific managed policy path
    if _sys.platform == "darwin":
        managed = Path("/Library/Application Support/ClaudeCode/CLAUDE.md")
    elif _sys.platform.startswith("win"):
        managed = Path("C:/ProgramData/ClaudeCode/CLAUDE.md")
    else:
        managed = Path("/etc/claude-code/CLAUDE.md")

    # ~/.claude/projects/<slug>/CLAUDE.md  (slug = abs path with '/' -> '-')
    slug = str(proj).replace("/", "-")
    user_project_md = home / ".claude" / "projects" / slug / "CLAUDE.md"

    defs = [
        ("managed",      "MANAGED",        managed,
         "Organization policy",                   "No managed policy"),
        ("user",         "USER GLOBAL",    home / ".claude" / "CLAUDE.md",
         "Shared across all projects",              "No global CLAUDE.md"),
        ("user-project", "USER × PROJECT", user_project_md,
         "Personal notes for this project",  "No CLAUDE.md (MEMORY.md is managed separately)"),
        ("project",      "PROJECT",        proj / "CLAUDE.md",
         "Git-tracked · shared with the team",             "No project CLAUDE.md"),
        ("local",        "LOCAL",          proj / "CLAUDE.local.md",
         "gitignored (not recommended)",         "No local override — click to create"),
    ]

    layers = []
    merged = []
    total_bytes = 0
    section_count = 0
    effective = 0
    for lid, title, path, sub, note in defs:
        present = path.is_file()
        entry = {
            "id": lid, "title": title, "sub": sub,
            "path": _display_path(path, home),
            "abs_path": str(path),
            "present": present,
        }
        if present:
            text = path.read_text(encoding="utf-8", errors="replace")
            entry["size"] = _file_size(path)
            entry["sections"] = _claude_sections(text)
            entry["preview"] = _md_preview(text)
            total_bytes += path.stat().st_size
            section_count += len(entry["sections"])
            effective += 1
            for blk in _split_md_sections(text):
                merged.append({"source": lid, "abs_path": str(path), **blk})
        else:
            entry["note"] = note
        layers.append(entry)

    return {
        "project": {"name": proj.name, "path": str(proj)},
        "summary": {
            "effective_count": effective,
            "total_bytes": total_bytes,
            "section_count": section_count,
        },
        "layers": layers,
        "merged": merged,
    }
