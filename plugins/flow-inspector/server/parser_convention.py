"""SKILL.md 構造化規約 v1 の決定論パーサ (annotated markdown → flow JSON)。

仕様: docs/plans/2026-05-28-skill-md-convention-v1.md

入力: HTML コメントマーカーで構造化された SKILL.md
   - frontmatter に `flow_version: 1`
   - 各見出しの末尾に `<!-- {type=... attrs...} -->`
   - 分岐 / 並列の境界に `<!-- {flow: yes|no|merge} -->`

処理: 正規表現 + AST のみ (LLM 不要、数 ms、決定論)

出力: parser.py の parse_skill と同じ shape の dict (x, y 座標含む)

エントリーポイント:
   - is_convention_v1(skill_text) -> bool       規約準拠判定 (flow_version: 1 の有無)
   - parse_skill_convention(path, layer) -> dict  フロー JSON 化
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any

try:
    from .layout import layout_nodes_inplace as _layout_nodes_inplace
    from .layout import is_back_edge as _is_back_edge
except ImportError:  # pragma: no cover
    from layout import layout_nodes_inplace as _layout_nodes_inplace  # type: ignore
    from layout import is_back_edge as _is_back_edge  # type: ignore

try:
    from .node_settings_codec import parse_settings_comment
except ImportError:  # pragma: no cover
    from node_settings_codec import parse_settings_comment  # type: ignore

# Frontmatter は共有ハイブリッドパーサ (server/fi_frontmatter.py) に委譲。
# yaml 値は str/bool/int/list 混在なので、参照側で fm_str を通して正規化する。
try:
    from fi_frontmatter import parse_frontmatter as _shared_parse_fm, fm_str
except ImportError:  # pragma: no cover
    from .fi_frontmatter import parse_frontmatter as _shared_parse_fm, fm_str  # type: ignore


# 見出し末尾のマーカー: `<!-- {type=...} -->` または `<!-- {<type> attrs...} -->`
_MARKER_RE = re.compile(r"<!--\s*\{([^}]+)\}\s*-->\s*$")
# 単独行マーカー: `<!-- {flow: yes} -->` 等
_FLOW_MARKER_RE = re.compile(r"^\s*<!--\s*\{flow:\s*(\w+)\}\s*-->\s*$")
# Markdown 見出し
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*$")


def is_convention_v1(skill_text: str) -> bool:
    """frontmatter に `flow_version: 1` があれば規約準拠と判定。"""
    if not skill_text.startswith("---"):
        return False
    lines = skill_text.splitlines()
    in_fm = False
    for line in lines:
        if line.strip() == "---":
            if in_fm:
                return False
            in_fm = True
            continue
        if in_fm and re.match(r"^\s*flow_version\s*:\s*1\s*$", line):
            return True
    return False


def _parse_marker_attrs(marker_body: str) -> tuple[str, dict]:
    """`type=hook matcher=Write` 形式を (type, attrs dict) に分解。

    最初の単語 (= or 空白前) を type とする。型のみの場合 (例: `code`) は attrs 空。
    """
    parts = marker_body.strip().split(None, 1)
    if not parts:
        return "", {}
    # 最初の token は type (key= 形式でない場合)
    first = parts[0]
    if "=" not in first:
        node_type = first.strip()
        rest = parts[1] if len(parts) > 1 else ""
    else:
        # 全部 key=value 形式 → type は attrs["type"] にあるかも
        node_type = ""
        rest = marker_body.strip()
    attrs: dict[str, str] = {}
    for m in re.finditer(r'(\w[\w-]*)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s]+)', rest):
        k, v = m.group(1), m.group(2)
        if v.startswith(('"', "'")) and v.endswith(('"', "'")):
            v = v[1:-1]
        attrs[k] = v
    if not node_type and "type" in attrs:
        node_type = attrs.pop("type")
    return node_type, attrs


def _strip_frontmatter(text: str) -> tuple[dict, str]:
    """frontmatter と本文を分離。fm は共有ハイブリッドパーサで解析。"""
    if not text.startswith("---"):
        return {}, text
    lines = text.splitlines()
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            body = "\n".join(lines[i + 1:])
            return _shared_parse_fm(text), body
    return {}, text


def parse_skill_convention(path: str, layer: str) -> dict:
    """規約準拠 SKILL.md を決定論パースしてフロー JSON にする。"""
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    fm, body = _strip_frontmatter(text)
    # yaml は name/description を str 以外 (int/bool/list) で返しうるので fm_str で正規化。
    name = fm_str(fm.get("name")) or (p.parent.name if p.stem == "SKILL" else p.stem)
    description = fm_str(fm.get("description"))

    nodes: list[dict] = []
    edges: list[dict] = []
    parallels: list[dict] = []

    # 状態管理: 現在いる分岐 / 並列ブロック
    # decision_stack: [{"node_id": ..., "branches": {"yes": [first_id], "no": [first_id]}}]
    # parallel_stack: [{"fan_out": ..., "members": []}]
    decision_stack: list[dict] = []
    parallel_stack: list[dict] = []

    # 現在の "flow position": マーカー間で次のノードがどの分岐に属するかを追跡
    current_flow_branch: str | None = None  # "yes" / "no" / None (main)

    prev_main_id: str | None = None  # main flow の直前ノード id
    prev_branch_id_map: dict = {}     # 各分岐の直前ノード id を覚える: {("d1","yes"): "n3"}

    # 本文中の現在処理中のノード "buffer": 見出しから次の見出しまでが 1 ノードの desc
    buffer_lines: list[str] = []
    pending_node: dict | None = None

    def _flush_node():
        """pending_node が確定したら nodes に追加し、prev_*_id 系を更新。"""
        nonlocal prev_main_id
        if pending_node is None:
            return
        desc = "\n".join(buffer_lines).strip()
        # ロスレス: local スキルの本文を一切 truncate しない (純粋な本文を保持)
        pending_node["desc"] = desc
        # config に prompt があれば desc を流用 (think / subagent 等)
        ntype = pending_node["type"]
        if ntype in ("think", "subagent") and "prompt" not in pending_node.get("config", {}):
            pending_node.setdefault("config", {})["prompt"] = desc
        nodes.append(pending_node)
        # edge を直前ノードから追加
        nid = pending_node["id"]
        if decision_stack and current_flow_branch in ("yes", "no"):
            dec = decision_stack[-1]
            key = (dec["node_id"], current_flow_branch)
            prev_id = prev_branch_id_map.get(key, dec["node_id"])
            label = current_flow_branch if prev_id == dec["node_id"] else ""
            edge_item: dict = {"from": prev_id, "to": nid}
            if label:
                edge_item["label"] = label
            edges.append(edge_item)
            prev_branch_id_map[key] = nid
            # 分岐 entry を記録
            dec["branches"].setdefault(current_flow_branch, []).append(nid)
        elif parallel_stack and not parallel_stack[-1].get("_merge_pending"):
            # parallel メンバー: parallel section 内の sub-heading
            # fan_out (前の main node) からエッジを張る。prev_main_id は更新しない。
            par = parallel_stack[-1]
            if par.get("fan_out"):
                edges.append({"from": par["fan_out"], "to": nid})
            par["members"].append(nid)
        else:
            # main flow
            if prev_main_id:
                edges.append({"from": prev_main_id, "to": nid})
            prev_main_id = nid

    counter = 0

    for raw_line in body.splitlines():
        # 単独行 flow マーカー
        fm_match = _FLOW_MARKER_RE.match(raw_line)
        if fm_match:
            kind = fm_match.group(1)
            # 前のノードを確定
            _flush_node()
            pending_node = None
            buffer_lines = []
            if kind == "merge":
                # 現在の decision / parallel ブロックを閉じる
                if decision_stack:
                    dec = decision_stack.pop()
                    # 分岐の終端 (各 branch の最後のノード) から、次のメインノードへ繋ぐエッジは
                    # 次のノードが来た時に追加するため、ここでは prev_main_id を「分岐の合流点」マーク
                    # = 次のメインノードは決定ノード後ろではなくこの merge から繋がる
                    # 実装: 「次のノードが来たら、各分岐の最後の id から merge edge を引く」フラグを立てる
                    decision_stack.append({"_merge_pending": dec})
                if parallel_stack:
                    par = parallel_stack.pop()
                    parallels.append({
                        "id": f"par_{len(parallels) + 1}",
                        "label": par.get("label", ""),
                        # UI (静的 demo / ParallelFrame) と同じ schema: nodes = メンバー ID list
                        "nodes": par["members"],
                    })
                    parallel_stack.append({"_merge_pending": par})
                current_flow_branch = None
            elif kind in ("yes", "no"):
                current_flow_branch = kind
            continue

        # 見出し行
        h_match = _HEADING_RE.match(raw_line)
        if h_match:
            level = len(h_match.group(1))
            title_raw = h_match.group(2)
            # 末尾マーカーを抜き出す
            marker_match = _MARKER_RE.search(title_raw)
            if not marker_match:
                # マーカー無し見出し = メタ section (前提条件等) と判定して無視
                # ただし pending_node があれば flush
                _flush_node()
                pending_node = None
                buffer_lines = []
                continue
            marker_body = marker_match.group(1)
            title = _MARKER_RE.sub("", title_raw).strip()
            ntype, attrs = _parse_marker_attrs(marker_body)

            # 前のノードを確定
            _flush_node()

            # ★ parallel section heading は実体ノードを作らない。
            #   前の main node を fan_out に保持し、sub-heading が members になる。
            #   UI 側 (ParallelFrame) は parallels[i].nodes を読んで枠を描画する。
            if ntype == "parallel":
                parallel_stack.append({
                    "fan_out": prev_main_id,  # 直前の main node 。flow 先頭なら None
                    "members": [],
                    "label": title,
                })
                pending_node = None
                buffer_lines = []
                continue

            # merge 待ちの状態だったら、ここで先頭のメインノードへ各分岐から edge を張る
            counter += 1
            new_id = f"n{counter}"

            consumed_prev_main = False
            if decision_stack and decision_stack[-1].get("_merge_pending"):
                dec_pending = decision_stack.pop()["_merge_pending"]
                # 各分岐の最後ノードから new_id へ
                for br_key, last_ids in dec_pending["branches"].items():
                    if last_ids:
                        edges.append({"from": last_ids[-1], "to": new_id})
                # decision ノードから no ブランチに何も登録が無かった場合 = no path 直行
                # → decision_node → new_id (no ラベル) を引く
                if "no" not in dec_pending["branches"]:
                    edges.append({"from": dec_pending["node_id"], "to": new_id, "label": "no"})
                # prev_main_id を consume (merge edges で繋がっているので regular edge は不要)
                prev_main_id = None
                consumed_prev_main = True

            if parallel_stack and parallel_stack[-1].get("_merge_pending"):
                par_pending = parallel_stack.pop()["_merge_pending"]
                if par_pending["members"]:
                    # 各メンバーから new_id へ fan-in
                    for member_id in par_pending["members"]:
                        edges.append({"from": member_id, "to": new_id})
                elif par_pending.get("fan_out"):
                    # メンバー無し (parallel section に sub-heading が無い) → fan_out → next 直結
                    edges.append({"from": par_pending["fan_out"], "to": new_id})
                # prev_main_id を consume
                prev_main_id = None
                consumed_prev_main = True

            # subtitle 抽出 (タイトル中の → 以降を分離)
            subtitle = ""
            for sep in (" → ", " → ", "→", " -> "):
                if sep in title:
                    head, tail = title.split(sep, 1)
                    title = head.strip().rstrip(":：")
                    subtitle = tail.strip().strip("`")
                    break

            config: dict = {**attrs}
            if ntype == "decision" and "condition" in attrs:
                config["condition"] = attrs["condition"]
            pending_node = {
                "id": new_id,
                "type": ntype,
                "title": title,
                "subtitle": subtitle,
                "desc": "",
                "config": config,
            }
            buffer_lines = []

            # ノード固有の状態管理
            if ntype == "decision":
                # decision を stack に登録 → 後続の flow:yes/no でブランチを管理
                decision_stack.append({
                    "node_id": new_id,
                    "branches": {},
                })
            # NOTE: parallel は上で早期 continue 済み (実体ノードを作らない)
            continue

        # 通常の本文行
        if pending_node is not None:
            # fi-settings コメント行ならノードの meta に復元し、本文 (desc) には含めない
            _settings = parse_settings_comment(raw_line)
            if _settings is not None:
                _m = pending_node.setdefault("meta", {})
                for _k, _v in _settings.items():
                    _m.setdefault(_k, _v)  # 既存 (marker 由来) を優先しつつ補完
                continue  # buffer_lines に追加しない
            buffer_lines.append(raw_line)

    # ループ終了時、最後のノードを flush
    _flush_node()

    # x/y 座標を計算 (gold_to_flows.py と同じ layout ロジック: rank ベース)
    _layout_nodes_inplace(nodes, edges, parallels)

    return {
        "id": f"skill-{name}",
        "name": name,
        "category": "Skills",
        "description": description,
        "complexity": "Med",
        "source": {"type": "skill", "path": str(path), "layer": layer, "parser": "convention"},
        "nodes": nodes,
        "edges": edges,
        "parallels": parallels,
    }


# ───────── レイアウト計算 (UI 描画用の x/y 座標を埋める) ─────────
# `_is_back_edge` / `_layout_nodes_inplace` は server/layout.py に切り出し済み。
# 互換性のため上部の import 文で同名のエイリアスにバインドしている。
