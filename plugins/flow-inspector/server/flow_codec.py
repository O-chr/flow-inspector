"""flow JSON → SKILL.md (規約 v1) encoder / Agent .md encoder / Hook settings.json patch.

parser_convention.py の逆方向。グラフトポロジーを線形化して
frontmatter + マーカー付き見出し + flow 制御マーカーを決定論的に出力する。

各ノードの本文 (見出し以下の Markdown 本文) は body_provider コールバックに委譲する:
  - passthrough_body_provider: node["desc"] をそのまま使う (ラウンドトリップ検証用)
  - make_llm_body_provider(...): 事前に全ノードの本文を LLM 並列生成し sync provider を返す

エントリーポイント:
  - encode_flow_to_skill_md(flow, body_provider=passthrough_body_provider) -> str
  - encode_flow_to_skill_md_async(flow, *, model="sonnet", skill_meta=None,
                                  force_regenerate=False) -> str
  - encode_flow_to_agent_md(flow) -> str
  - encode_flow_to_hook_patch(flow, settings_path) -> str
"""
from __future__ import annotations
import asyncio
import json
import yaml
from collections import defaultdict
from pathlib import Path
from typing import Callable

try:
    from .annotator import _build_marker
except ImportError:  # pragma: no cover
    from annotator import _build_marker  # type: ignore

try:
    from .explain import call_claude_cli
except ImportError:  # pragma: no cover
    from explain import call_claude_cli  # type: ignore

try:
    from .node_settings_codec import encode_settings_comment, EXCLUDED_KEYS
except ImportError:  # pragma: no cover
    from node_settings_codec import encode_settings_comment, EXCLUDED_KEYS  # type: ignore


BodyProvider = Callable[[dict], str]


def passthrough_body_provider(node: dict) -> str:
    """node['desc'] をそのまま本文として返す (ラウンドトリップ検証用)。"""
    return (node.get("desc") or "").rstrip()


_EMPTY_BODY_PLACEHOLDER = "_（未記入 — AI で生成できます）_"


def placeholder_body_provider(node: dict) -> str:
    """本文がある node はそのまま、空なら「未記入」プレースホルダを返す。

    ライブプレビュー用: 構造 (見出し+マーカー) は即出しつつ、本文未記入を明示する。
    desc / meta.desc / config.prompt / meta.prompt のいずれかに本文があれば採用。
    """
    meta = node.get("meta") or {}
    cfg = node.get("config") or {}
    body = (node.get("desc") or meta.get("desc") or cfg.get("prompt") or meta.get("prompt") or "").rstrip()
    return body if body else _EMPTY_BODY_PLACEHOLDER


# フロー共通の開始/終了ノード (UI が自動注入する I/O 契約マーカー)。
# これらは SKILL.md の「ステップ」ではないので本文には書き出さない。
_ENDPOINT_CAPABILITIES = {"flow.start", "flow.end"}


def _node_capability(node: dict) -> str:
    return (node.get("meta") or {}).get("capability") or (node.get("config") or {}).get("capability") or ""


def _strip_flow_endpoints(flow: dict) -> dict:
    """flow.start / flow.end ノードと、それらに接続するエッジを除去した flow を返す。"""
    nodes = flow.get("nodes", [])
    endpoint_ids = {n["id"] for n in nodes if _node_capability(n) in _ENDPOINT_CAPABILITIES}
    if not endpoint_ids:
        return flow
    new_nodes = [n for n in nodes if n["id"] not in endpoint_ids]
    new_edges = [e for e in flow.get("edges", [])
                 if e.get("from") not in endpoint_ids and e.get("to") not in endpoint_ids]
    return {**flow, "nodes": new_nodes, "edges": new_edges}


def _is_back_edge(src: str, dst: str) -> bool:
    """n{N} 形式で target < source なら back edge (ループ)。"""
    try:
        return int(str(dst).lstrip("n")) < int(str(src).lstrip("n"))
    except Exception:
        return False


def _blank_endpoint_node(node_id: str, ntype: str, title: str, subtitle: str,
                         capability: str, x: int, y: int) -> dict:
    """フロー開始/終了マーカーノードを 1 つ作る (他ノードと同じ shape)。"""
    return {
        "id": node_id, "type": ntype, "title": title, "subtitle": subtitle,
        "desc": "", "config": {}, "meta": {"capability": capability},
        "x": x, "y": y, "depends": [], "input": {}, "output": {},
        "duration": "", "io_desc": [],
    }


def inject_flow_endpoints(flow: dict) -> dict:
    """フローの先頭に「フロー開始」、末尾に「フロー完了」マーカーを注入する。

    - 全フローに共通する I/O 契約 (入力物/トリガー、出力物/通知先) を可視化する。
    - 冪等: 既に flow.start / flow.end があれば何もしない。
    - 開始 → in-degree 0 のノード群、out-degree 0 のノード群 → 完了 にエッジを張る。
    - encode 時は _strip_flow_endpoints で除去されるので SKILL.md には出ない。
    """
    nodes = flow.get("nodes", [])
    if not nodes:
        return flow
    caps = {_node_capability(n) for n in nodes}
    if _ENDPOINT_CAPABILITIES & caps:
        return flow  # 既に注入済み

    edges = flow.get("edges", [])
    ids = [n["id"] for n in nodes]
    indeg = {i: 0 for i in ids}
    outdeg = {i: 0 for i in ids}
    for e in edges:
        f, t = e.get("from"), e.get("to")
        if _is_back_edge(f, t):
            continue
        if t in indeg:
            indeg[t] += 1
        if f in outdeg:
            outdeg[f] += 1
    starts = [n["id"] for n in nodes if indeg.get(n["id"], 0) == 0] or [nodes[0]["id"]]
    ends = [n["id"] for n in nodes if outdeg.get(n["id"], 0) == 0] or [nodes[-1]["id"]]

    xs = [n.get("x", 420) for n in nodes if isinstance(n.get("x"), (int, float))]
    ys = [n.get("y", 70) for n in nodes if isinstance(n.get("y"), (int, float))]
    cx = int(sum(xs) / len(xs)) if xs else 420
    min_y = int(min(ys)) if ys else 70
    max_y = int(max(ys)) if ys else 70
    DY = 130

    start_node = _blank_endpoint_node("flow-start", "trigger", "フロー開始", "入力・トリガー",
                                      "flow.start", cx, min_y - DY)
    end_node = _blank_endpoint_node("flow-end", "parent", "フロー完了", "出力物・通知先",
                                    "flow.end", cx, max_y + DY)
    new_edges = ([{"from": "flow-start", "to": s} for s in starts]
                 + [{"from": e, "to": "flow-end"} for e in ends])
    return {
        **flow,
        "nodes": [start_node] + list(nodes) + [end_node],
        "edges": list(edges) + new_edges,
    }


# ───────── LLM 本文生成 ─────────

# type ごとの本文ガイダンス (LLM プロンプト用)
_BODY_GUIDANCE = {
    "code": (
        "このステップで実行する **完全に動くスクリプト** を書いてください。"
        " ``` で囲んだコードブロック (bash / python / node など適切な言語) に、実際のコマンド・引数・"
        "処理ロジックまで具体的に書くこと（一行で済ませない／要約しない／プレースホルダ禁止）。"
        " 前後に1〜2文で「何を入力に取り何を出力するか」を添える。"
    ),
    "think": (
        "Claude (メイン LLM) に「何を考えて何を出力するか」を指示するプロンプト本文を書いてください。"
        " 入力 / 出力 / 守るべきルールを箇条書きで明確に。"
    ),
    "subagent": (
        "Agent ツール経由でサブエージェントに渡すタスク指示を書いてください。"
        " タスクの目的、入力、期待される出力 (ファイルパスなど) を明示。"
    ),
    "hook": (
        "この hook が何を検知し何をトリガーするかを 2-3 行で説明してください。"
        " 必要なら参照ファイルやチェック項目を箇条書きで。"
    ),
    "mcp": (
        "この MCP ツール呼び出しが何を取得 / 実行するか、引数の意味と期待結果を書いてください。"
    ),
    "decision": (
        "判断基準を明確に書いてください。yes / no それぞれで次に何をするかも 1 行ずつ。"
    ),
    "user": (
        "ユーザーへの確認文 / 入力依頼 / 提示する出力サンプルを書いてください。"
    ),
    "skill": (
        "呼び出す別スキルの目的、渡す入力、期待される成果物を書いてください。"
    ),
    "parallel": "(本文不要)",
    "parent": "(本文不要)",
}


def _io_summary(node: dict | None) -> str:
    """node の input/output を短い1行に要約 (本文プロンプトの I/O 契約用)。無ければ空文字。"""
    if not node:
        return ""
    meta = node.get("meta") or {}

    def _one(label, v):
        if not v:
            return None
        s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
        return f"{label}={s[:120]}"

    parts = [p for p in (
        _one("入力", node.get("input") or meta.get("input")),
        _one("出力", node.get("output") or meta.get("output")),
    ) if p]
    return " / ".join(parts)


def _build_body_prompt(
    node: dict,
    *,
    prev_title: str | None,
    next_title: str | None,
    skill_meta: dict | None,
    prev_io: str = "",
    next_io: str = "",
) -> str:
    """1 ノード分の本文を LLM に生成させるプロンプトを組み立てる。"""
    # board 由来フローは設定を node.meta に持つ (config は未生成)。config 優先で meta に
    # フォールバックし、表示専用キー (io/desc/capability 等) は LLM プロンプトから除外する。
    cfg = node.get("config") or node.get("meta") or {}
    _skip = EXCLUDED_KEYS | {"prompt", "desc", "ai_instruction"}
    cfg_lines = [f"  - {k}: {v}" for k, v in cfg.items() if k not in _skip][:8]
    cfg_str = "\n".join(cfg_lines) if cfg_lines else "  (なし)"
    ntype = node.get("type", "think")
    guidance = _BODY_GUIDANCE.get(ntype, "ステップの内容を具体的に説明してください。")

    skill_name = (skill_meta or {}).get("name", "(unknown)")
    skill_desc = (skill_meta or {}).get("description", "")

    title = node.get("title", "")
    subtitle = node.get("subtitle", "")
    head = f"{title} → `{subtitle}`" if subtitle else title
    self_io = _io_summary(node)
    prev_line = (prev_title or "(なし)") + (f"  [{prev_io}]" if prev_io else "")
    next_line = (next_title or "(なし)") + (f"  [{next_io}]" if next_io else "")

    return (
        "あなたは Claude Code Skill の SKILL.md 本文を書くアシスタントです。\n"
        "出力は Markdown 本文のみ。見出し行 (## ...) や <!-- ... --> マーカーは絶対に含めないでください。\n"
        f"\n# スキル\n- 名前: {skill_name}\n- 目的: {skill_desc}\n"
        f"\n# このステップ\n- 見出し: {head}\n- タイプ: {ntype}\n- 設定:\n{cfg_str}\n"
        f"- このステップの入出力: {self_io or '(未定義)'}\n"
        f"- 前のステップ: {prev_line}\n- 次のステップ: {next_line}\n"
        f"\n# 書く内容\n{guidance}\n"
        "SKILL.md として自然に読める日本語で、必要十分に具体的に書いてください"
        "（冗長な一般論は避けるが、中身が要るステップ＝特にコードは実体まで書ききる）。"
        " 前後ステップの入出力と辻褄を合わせること。"
        " 余計な前置きや「以下が本文です」のような枕は不要、本文だけ出力。"
    )


def _adjacency_titles(flow: dict) -> tuple[dict[str, str | None], dict[str, str | None]]:
    """各 node について「前のタイトル」「次のタイトル」(最初の無ラベル隣接) を計算。"""
    nodes = flow["nodes"]
    edges = flow.get("edges", [])
    title_by_id = {n["id"]: (n.get("title") or "") for n in nodes}
    prev_t: dict[str, str | None] = {n["id"]: None for n in nodes}
    next_t: dict[str, str | None] = {n["id"]: None for n in nodes}
    for e in edges:
        f, t = e["from"], e["to"]
        if t in prev_t and prev_t[t] is None:
            prev_t[t] = title_by_id.get(f)
        if f in next_t and next_t[f] is None:
            next_t[f] = title_by_id.get(t)
    return prev_t, next_t


def _adjacency_io(flow: dict) -> tuple[dict[str, str], dict[str, str]]:
    """各 node について「前/次の最初の隣接ノードの I/O 要約」を計算。

    _adjacency_titles と同じ「最初の隣接」を採用し、本文プロンプトにステップ間の
    入出力契約を渡すために使う。
    """
    nodes = flow["nodes"]
    edges = flow.get("edges", [])
    node_by_id = {n["id"]: n for n in nodes}
    prev_io: dict[str, str] = {n["id"]: "" for n in nodes}
    next_io: dict[str, str] = {n["id"]: "" for n in nodes}
    prev_set: set[str] = set()
    next_set: set[str] = set()
    for e in edges:
        f, t = e["from"], e["to"]
        if t in prev_io and t not in prev_set:
            prev_io[t] = _io_summary(node_by_id.get(f)); prev_set.add(t)
        if f in next_io and f not in next_set:
            next_io[f] = _io_summary(node_by_id.get(t)); next_set.add(f)
    return prev_io, next_io


async def _generate_body_one(
    node: dict,
    *,
    prev_title: str | None,
    next_title: str | None,
    skill_meta: dict | None,
    model: str,
    timeout: float,
    prev_io: str = "",
    next_io: str = "",
) -> str:
    ntype = node.get("type", "think")
    if ntype in ("parallel", "parent"):
        return ""  # 本文不要
    prompt = _build_body_prompt(
        node, prev_title=prev_title, next_title=next_title, skill_meta=skill_meta,
        prev_io=prev_io, next_io=next_io,
    )
    body = await call_claude_cli(prompt, model=model, timeout=timeout)
    return body.strip()


async def llm_generate_bodies(
    flow: dict,
    *,
    model: str = "sonnet",
    timeout: float = 120.0,
    skill_meta: dict | None = None,
    force_regenerate: bool = False,
    concurrency: int = 6,
) -> dict[str, str]:
    """flow の全ノードの本文を LLM で生成し {node_id: body} を返す。

    - force_regenerate=False (デフォルト): 既に node.desc があるノードはスキップ (=既存値を使う)
    - force_regenerate=True : 全ノードを再生成
    - 並列度は concurrency でセマフォ制限
    """
    nodes = flow["nodes"]
    if skill_meta is None:
        skill_meta = {"name": flow.get("name", ""), "description": flow.get("description", "")}
    prev_t, next_t = _adjacency_titles(flow)
    prev_io_map, next_io_map = _adjacency_io(flow)
    sem = asyncio.Semaphore(concurrency)

    async def worker(node: dict) -> tuple[str, str]:
        nid = node["id"]
        if not force_regenerate and (node.get("desc") or "").strip():
            return nid, node["desc"]
        async with sem:
            try:
                body = await _generate_body_one(
                    node,
                    prev_title=prev_t.get(nid),
                    next_title=next_t.get(nid),
                    skill_meta=skill_meta,
                    model=model,
                    timeout=timeout,
                    prev_io=prev_io_map.get(nid, ""),
                    next_io=next_io_map.get(nid, ""),
                )
            except Exception as e:  # pragma: no cover
                body = f"<!-- LLM body generation failed: {e} -->"
            return nid, body

    pairs = await asyncio.gather(*[worker(n) for n in nodes])
    return dict(pairs)


def make_llm_body_provider(bodies: dict[str, str]) -> BodyProvider:
    """事前生成済み {node_id: body} から sync な body_provider を作る。"""
    def _provider(node: dict) -> str:
        return bodies.get(node["id"], "").rstrip()
    return _provider


# ───────── ヘルパ ─────────

def _dump_frontmatter(data: dict) -> list[str]:
    """順序付き dict を valid YAML frontmatter ブロックにダンプする。

    yaml.safe_dump に委譲することで name / description の quoting・escaping を
    完全に正しく処理する（bare colon・先頭の ``[``・バックスラッシュ・型強制
    などで safe_load が落ちる/値が壊れる問題を根絶）。

    - allow_unicode=True: 日本語を ``\\uXXXX`` に escape せずそのまま出す
    - sort_keys=False: 挿入順（name → description → flow_version）を保持
    - default_flow_style=False: ブロックスタイルで出力
    - width=4096: 長い行を勝手に折り返さない
    """
    block = yaml.safe_dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=4096,
    )
    return ["---", block.rstrip("\n"), "---"]


def _format_frontmatter(name: str, description: str) -> list[str]:
    """skill 用 frontmatter ブロック (--- で囲まれた YAML) を組み立てる。

    yaml.safe_dump 経由なので name/description の特殊文字・複数行も正しく
    quoting/literal 化され、encode→parse が正確に往復する。
    """
    data: dict = {"name": name}
    desc = (description or "").strip()
    if desc and desc != ">":
        data["description"] = desc
    else:
        data["description"] = ""
    data["flow_version"] = 1
    return _dump_frontmatter(data)


def _heading(level: int, title: str, subtitle: str, marker: str) -> str:
    r"""`## Title → \`subtitle\` <!-- {marker} -->` 形式の見出し行。"""
    head = title.strip()
    if subtitle:
        head = f"{head} → `{subtitle}`"
    return f"{'#' * level} {head} {marker}"


# ───────── パラレル / 分岐検出 ─────────

def _build_edge_index(edges: list[dict]) -> tuple[dict, dict]:
    out_edges: dict[str, list[tuple[str, str]]] = defaultdict(list)
    in_edges: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for e in edges:
        out_edges[e["from"]].append((e["to"], e.get("label", "")))
        in_edges[e["to"]].append((e["from"], e.get("label", "")))
    return out_edges, in_edges


def _find_parallel_fanout(par_members: list[str], out_edges: dict, in_edges: dict) -> str | None:
    """並列メンバー全員に出ているノード = fan_out を探す。"""
    if not par_members:
        return None
    cands = {src for src, _ in in_edges[par_members[0]]}
    for m in par_members[1:]:
        cands &= {src for src, _ in in_edges[m]}
    return next(iter(cands), None) if cands else None


def _find_parallel_fanin(par_members: list[str], out_edges: dict) -> str | None:
    """並列メンバー全員から行き先となるノード = fan_in を探す。"""
    if not par_members:
        return None
    cands = {tgt for tgt, _ in out_edges[par_members[0]]}
    for m in par_members[1:]:
        cands &= {tgt for tgt, _ in out_edges[m]}
    return next(iter(cands), None) if cands else None


def _find_start(nodes: list[dict], in_edges: dict) -> str | None:
    """in-degree 0 のノード (= 開始) を探す。複数あれば最初の宣言順を採用。"""
    for n in nodes:
        if not in_edges.get(n["id"]):
            return n["id"]
    return nodes[0]["id"] if nodes else None


# ───────── メインエンコーダ ─────────

def encode_flow_to_skill_md(flow: dict, body_provider: BodyProvider = passthrough_body_provider) -> str:
    """flow JSON を 規約 v1 準拠の SKILL.md テキストに変換する。

    対応する構造:
      - メインフロー (直列)
      - 並列セクション (parallels[i].nodes = members)
      - 分岐 (decision ノード) — 暗黙 no ブランチ (yes ブランチノード無し) のみ対応
    未対応 (現状の MVP):
      - 明示的 yes ブランチノードを含む分岐 → TODO
      - ネストされた並列 → TODO
    """
    flow = _strip_flow_endpoints(flow)  # フロー開始/終了は本文に書き出さない
    name = flow.get("name", "unnamed")
    description = flow.get("description", "")
    nodes = flow["nodes"]
    edges = flow.get("edges", [])
    parallels = flow.get("parallels", [])

    node_by_id = {n["id"]: n for n in nodes}
    out_edges, in_edges = _build_edge_index(edges)

    # 並列情報を index 化
    par_by_fanout: dict[str, dict] = {}
    par_member_set: set[str] = set()
    for par in parallels:
        members = par.get("nodes", [])
        fan_out = _find_parallel_fanout(members, out_edges, in_edges)
        fan_in = _find_parallel_fanin(members, out_edges)
        info = {"par": par, "members": members, "fan_in": fan_in, "label": par.get("label", "並列実行")}
        if fan_out:
            par_by_fanout[fan_out] = info
        for m in members:
            par_member_set.add(m)

    # 出力ライン累積
    out_lines: list[str] = []
    out_lines.extend(_format_frontmatter(name, description))
    out_lines.append("")
    out_lines.append(f"# {name}")
    out_lines.append("")

    visited: set[str] = set()

    def emit_node(node: dict, level: int) -> None:
        marker = _build_marker(node)
        out_lines.append(_heading(level, node.get("title", ""), node.get("subtitle", ""), marker))
        # 見出し直下に設定値 (meta) を fi-settings コメントで保存 (あれば)
        settings_line = encode_settings_comment(node.get("meta", {}))
        if settings_line:
            out_lines.append(settings_line)
        out_lines.append("")
        body = body_provider(node)
        if body:
            out_lines.append(body)
            out_lines.append("")

    def pick_next_main(nid: str, prefer_unlabeled: bool = True) -> str | None:
        """nid から出るエッジの中で次のメイン target を選ぶ。

        prefer_unlabeled=True なら無ラベル優先、無ければ "no" を採用 (分岐の暗黙メイン)。
        """
        outs = out_edges.get(nid, [])
        unlabeled = [t for t, lbl in outs if not lbl]
        if prefer_unlabeled and unlabeled:
            return unlabeled[0]
        no_label = [t for t, lbl in outs if lbl == "no"]
        if no_label:
            return no_label[0]
        return unlabeled[0] if unlabeled else None

    # メインフロー walk
    cur = _find_start(nodes, in_edges)
    while cur and cur not in visited:
        # 並列メンバー単独で来た場合はスキップ (fan_out 側で扱われる)
        if cur in par_member_set:
            cur = pick_next_main(cur)
            continue

        node = node_by_id.get(cur)
        if node is None:
            break

        # このノードが parallel の fan_out なら、ノード自体を出してから並列ブロック出力
        if cur in par_by_fanout:
            emit_node(node, level=2)
            visited.add(cur)
            par_info = par_by_fanout[cur]
            out_lines.append(f"## {par_info['label']} <!-- {{parallel}} -->")
            out_lines.append("")
            for m_id in par_info["members"]:
                m_node = node_by_id.get(m_id)
                if m_node is None:
                    continue
                emit_node(m_node, level=3)
                visited.add(m_id)
            out_lines.append("<!-- {flow: merge} -->")
            out_lines.append("")
            cur = par_info["fan_in"]
            continue

        emit_node(node, level=2)
        visited.add(cur)

        if node.get("type") == "decision":
            # MVP: 暗黙 no ブランチ (= 次のメインノードへ単一エッジ "no" ラベル付き) のみ対応
            # → 見出し直後に <!-- {flow: merge} --> を置いて次のメインに進む
            out_lines.append("<!-- {flow: merge} -->")
            out_lines.append("")
            cur = pick_next_main(cur, prefer_unlabeled=False)
            continue

        cur = pick_next_main(cur)

    # 末尾の空行を1行に正規化
    text = "\n".join(out_lines).rstrip() + "\n"
    return text


def encode_flow_with_name(flow: dict, display_name: str, description: str = "") -> str:
    """Encode a flow to SKILL.md, forcing frontmatter name/description from the
    user-provided values instead of the board title.

    Fixes the '無題のボード' bug: the skill name (and description) the user typed
    in the save dialog win over flow.name / flow.description (which default to
    the untitled-board title).
    """
    overridden = {
        **flow,
        "name": (display_name or "").strip() or flow.get("name") or "unnamed",
        "description": (description or "").strip() or flow.get("description", ""),
    }
    return encode_flow_to_skill_md(overridden)


def encode_flow_to_command_md(
    flow: dict,
    display_name: str,
    description: str = "",
    *,
    argument_hint: str | None = None,
    allowed_tools: str | None = None,
    body_provider: BodyProvider = passthrough_body_provider,
) -> str:
    """flow を slash command (commands/<name>.md) テキストに変換する。

    frontmatter は command 用 (description / argument-hint / allowed-tools)。本文は
    スキルと同じ手順レンダリングを流用し、SKILL.md の frontmatter と先頭の `# name`
    見出しを取り除いて command 本文として使う。
    """
    name = (display_name or "").strip() or flow.get("name") or "command"
    desc = (description or "").strip() or flow.get("description", "")
    skill_md = encode_flow_to_skill_md({**flow, "name": name, "description": desc}, body_provider)

    # SKILL.md から frontmatter (--- ... ---) と直後の `# name` 見出しを除いて本文を取り出す
    body = skill_md
    if body.startswith("---"):
        idx = body.find("\n---", 3)        # 閉じフェンス手前の改行
        if idx != -1:
            nl = body.find("\n", idx + 1)  # 閉じ '---' 行末の改行
            body = body[(nl + 1):] if nl != -1 else ""
    lines = body.lstrip("\n").split("\n")
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
    body = "\n".join(lines).strip("\n")

    fm: dict = {"description": desc}
    if argument_hint:
        fm["argument-hint"] = argument_hint
    if allowed_tools:
        fm["allowed-tools"] = allowed_tools
    return "\n".join(_dump_frontmatter(fm)) + "\n\n" + body + "\n"


async def encode_flow_to_skill_md_async(
    flow: dict,
    *,
    model: str = "sonnet",
    timeout: float = 120.0,
    force_regenerate: bool = False,
    concurrency: int = 6,
    skill_meta: dict | None = None,
) -> str:
    """LLM で本文を生成してから SKILL.md を組み立てる async バリアント。

    既存 desc があるノードは流用 (force_regenerate=True なら全部再生成)。
    """
    bodies = await llm_generate_bodies(
        flow,
        model=model,
        timeout=timeout,
        skill_meta=skill_meta,
        force_regenerate=force_regenerate,
        concurrency=concurrency,
    )
    return encode_flow_to_skill_md(flow, body_provider=make_llm_body_provider(bodies))


# ───────── Agent .md エンコーダ ─────────

def encode_flow_to_agent_md(flow: dict) -> str:
    """flow JSON を Agent .md ファイルテキストに変換する。

    parser.py の parse_agent の逆方向。

    フォーマット:
      ---
      name: {flow.name}
      description: |
        {flow.description}
      ---

      # {flow.name}

      ## {node.title}
      {node.desc}
      ...

    nodes が 1つで title が flow.name と同じ場合は `##` セクションなし、body のみ。
    """
    flow = _strip_flow_endpoints(flow)  # フロー開始/完了マーカーは書き出さない
    name = flow.get("name", "unnamed")
    description = (flow.get("description") or "").strip()
    nodes = flow.get("nodes", [])

    out_lines: list[str] = []

    # frontmatter (agent: name + description only, no flow_version)
    fm: dict = {"name": name, "description": description if description else ""}
    out_lines.extend(_dump_frontmatter(fm))
    out_lines.append("")

    # title
    out_lines.append(f"# {name}")
    out_lines.append("")

    # nodes → sections
    # 1ノードかつ title == flow.name なら ## セクションなし、body のみ
    if len(nodes) == 1 and nodes[0].get("title", "") == name:
        body = (nodes[0].get("desc") or "").rstrip()
        if body:
            out_lines.append(body)
            out_lines.append("")
    else:
        for node in nodes:
            title = node.get("title", "")
            out_lines.append(f"## {title}")
            out_lines.append("")
            body = (node.get("desc") or "").rstrip()
            if body:
                out_lines.append(body)
                out_lines.append("")

    text = "\n".join(out_lines).rstrip() + "\n"
    return text


# ───────── Hook settings.json パッチ ─────────

def encode_flow_to_hook_patch(flow: dict, settings_path: str) -> str:
    """flow JSON を settings.json の hooks ブロックに書き戻した JSON 文字列を返す。

    parser.py の parse_hooks の逆方向。

    flow.nodes の各 node の config:
      { hook_type: "PreToolUse"|"PostToolUse"|"Notification", matcher: "...", command: "..." }

    settings.json hook 形式:
      {
        "hooks": {
          "PreToolUse": [
            {"matcher": "Bash", "hooks": [{"type": "command", "command": "..."}]}
          ],
          ...
        }
      }

    既存 settings.json を読み込み、hooks キーだけ差し替えて返す (他キーは保持)。
    """
    flow = _strip_flow_endpoints(flow)  # フロー開始/完了マーカーは hooks に含めない
    # 既存 settings.json を読む (ファイルが無い場合は空 dict)
    p = Path(settings_path)
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    else:
        data = {}

    # flow nodes から hooks ブロックを再構築
    # hook_type → list of {matcher, hooks:[{type, command}]}
    # 同じ (hook_type, matcher) の組み合わせは 1エントリにまとめる
    from collections import OrderedDict
    hooks_map: dict[str, OrderedDict] = {}  # hook_type → OrderedDict[matcher → [command, ...]]

    for node in flow.get("nodes", []):
        cfg = node.get("config", {}) or {}
        hook_type = cfg.get("hook_type", "")
        matcher = cfg.get("matcher", "*")
        command = cfg.get("command", "")
        if not hook_type:
            continue
        if hook_type not in hooks_map:
            hooks_map[hook_type] = OrderedDict()
        if matcher not in hooks_map[hook_type]:
            hooks_map[hook_type][matcher] = []
        if command:
            hooks_map[hook_type][matcher].append(command)

    # hooks ブロックを構築
    hooks_block: dict[str, list] = {}
    for hook_type, matcher_map in hooks_map.items():
        entries = []
        for matcher, commands in matcher_map.items():
            hook_list = [{"type": "command", "command": cmd} for cmd in commands]
            entries.append({"matcher": matcher, "hooks": hook_list})
        hooks_block[hook_type] = entries

    # 既存 settings.json の hooks キーだけ差し替え
    data["hooks"] = hooks_block

    return json.dumps(data, indent=2, ensure_ascii=False)
