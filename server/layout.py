"""Flow node 座標レイアウト。

parser_convention.py の `_layout_nodes_inplace` を切り出して共通化。
script_flowizer / parser_automation / parser_convention の全てから利用される。

アルゴリズム:
  1. forward edges (back edge 除く) で longest-path rank を計算
  2. 同じ rank に複数あれば左右に展開 (parallel members / decision branches)
  3. detour ノード (decision の yes-branch、parallel の siblings) を右にオフセット
"""
from __future__ import annotations

import re
from collections import defaultdict


DY = 130
DX = 260
DETOUR_DX = 320
BASE_X = 420
BASE_Y = 70


def is_back_edge(src_id: str, dst_id: str) -> bool:
    """target ID 数値 < source ID なら back edge (ループ) として無視。

    ノード ID の prefix は環境により異なる (parser_convention は "n1"、
    script_flowizer は "s1"、GitHub Actions parser は "j1s1" 等) ため、
    prefix を仮定せず数字部分だけを抽出して比較する。これを誤ると
    ループバック辺が forward 扱いされ、longest-path rank が膨張して
    座標が爆発する (例: s3→s2 のループで y が 5000px 超)。
    """
    try:
        f = int(re.sub(r"\D", "", src_id))
        t = int(re.sub(r"\D", "", dst_id))
        return t < f
    except (ValueError, TypeError):
        return False


def layout_nodes_inplace(
    nodes: list[dict],
    edges: list[dict],
    parallels: list[dict] | None = None,
) -> None:
    """各ノードに x, y を埋める (parser_convention の _layout_nodes_inplace 同等)。

    parallels: 現在は未使用。将来 parallel メンバーを明示的に左右展開する
    ロジックを入れる際の予約引数。呼び出し側が flow.get("parallels") を
    そのまま渡せるように受け付けている。
    """
    if not nodes:
        return

    forward_edges = [e for e in edges if not is_back_edge(e["from"], e["to"])]

    # longest-path rank
    rank: dict[str, int] = {n["id"]: 0 for n in nodes}
    for _ in range(len(nodes) + 1):
        changed = False
        for e in forward_edges:
            if e["from"] not in rank or e["to"] not in rank:
                continue
            new_rank = rank[e["from"]] + 1
            if rank[e["to"]] < new_rank:
                rank[e["to"]] = new_rank
                changed = True
        if not changed:
            break

    # group by rank
    by_rank: dict[int, list[dict]] = defaultdict(list)
    node_order = {n["id"]: i for i, n in enumerate(nodes)}
    for n in nodes:
        by_rank[rank[n["id"]]].append(n)
    for r in by_rank:
        by_rank[r].sort(key=lambda n: node_order[n["id"]])

    # detour node 検出 (decision の yes-branch / parallel sibling)
    out_edges = defaultdict(list)
    for e in edges:
        out_edges[e["from"]].append((e["to"], e.get("label", "")))

    detour_node_ids: set[str] = set()
    for src, outs in out_edges.items():
        if len(outs) < 2:
            continue
        labeled = [o for o in outs if o[1]]
        if not labeled:
            continue
        main_target = None
        for t, lbl in outs:
            if lbl == "":
                main_target = t
                break
        if main_target is None:
            for t, lbl in outs:
                if lbl in ("no", "pass"):
                    main_target = t
                    break
        if main_target is None:
            continue
        for t, lbl in outs:
            if t == main_target:
                continue
            stack = [t]
            while stack:
                cur = stack.pop()
                if cur in detour_node_ids or cur == main_target or cur == src:
                    continue
                detour_node_ids.add(cur)
                for nt, _ in out_edges.get(cur, []):
                    if is_back_edge(cur, nt):
                        continue
                    if nt != main_target and nt != src and nt not in detour_node_ids:
                        stack.append(nt)

    # x/y 割り当て
    for r, ns in by_rank.items():
        main_ns = [n for n in ns if n["id"] not in detour_node_ids]
        detour_ns = [n for n in ns if n["id"] in detour_node_ids]

        if main_ns:
            if len(main_ns) == 1:
                main_ns[0]["x"] = BASE_X
                main_ns[0]["y"] = BASE_Y + r * DY
            else:
                total = len(main_ns)
                for i, n in enumerate(main_ns):
                    fx = int((i - (total - 1) / 2) * DX)
                    n["x"] = BASE_X + fx
                    n["y"] = BASE_Y + r * DY
        for j, n in enumerate(detour_ns):
            n["x"] = BASE_X + DETOUR_DX + j * DX
            n["y"] = BASE_Y + r * DY

    # depends 配列も補完 (UI が使う場合がある)
    for n in nodes:
        n.setdefault("depends", [])
        n.setdefault("input", {})
        n.setdefault("output", {})
        n.setdefault("duration", "")
        n.setdefault("io_desc", [])


def layout_flow_recursive(flow_or_subflow: dict) -> None:
    """nodes 内に inner_flow があれば再帰的に layout を適用する。

    flow_or_subflow: {"nodes": [...], "edges": [...], "parallels": [...]}
    """
    layout_nodes_inplace(
        flow_or_subflow.get("nodes", []),
        flow_or_subflow.get("edges", []),
        flow_or_subflow.get("parallels"),
    )
    for n in flow_or_subflow.get("nodes", []):
        inner = n.get("inner_flow")
        if inner and isinstance(inner, dict) and inner.get("nodes"):
            layout_flow_recursive(inner)
