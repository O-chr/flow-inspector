"""Tests for layout.layout_nodes_inplace.

The function mutates each node dict in place, assigning integer ``x``/``y``
(and defaulting ``depends``/``input``/``output``/``duration``/``io_desc``). It
does not return anything and does not attach a ``rank`` field — ranks are an
internal longest-path computation reflected only in the ``y`` coordinate.

Geometry constants (from the module): BASE_X=420, BASE_Y=70, DY=130, DX=260,
DETOUR_DX=320. y = BASE_Y + rank*DY.
"""
from __future__ import annotations

import layout


def _nodes(*ids):
    return [{"id": i, "type": "code", "title": i} for i in ids]


class TestLayoutNodesInplace:
    def test_empty_is_noop(self):
        nodes = []
        assert layout.layout_nodes_inplace(nodes, []) is None
        assert nodes == []

    def test_single_node_at_base(self):
        nodes = _nodes("n1")
        layout.layout_nodes_inplace(nodes, [])
        assert nodes[0]["x"] == layout.BASE_X
        assert nodes[0]["y"] == layout.BASE_Y

    def test_every_node_gets_int_coords_and_defaults(self):
        nodes = _nodes("a", "b", "c")
        edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}]
        layout.layout_nodes_inplace(nodes, edges)
        for n in nodes:
            assert isinstance(n["x"], int)
            assert isinstance(n["y"], int)
            # Defaults backfilled by the layout pass.
            assert n["depends"] == []
            assert n["input"] == {}
            assert n["output"] == {}

    def test_linear_chain_y_increases_by_dy(self):
        nodes = _nodes("a", "b", "c")
        edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "c"}]
        layout.layout_nodes_inplace(nodes, edges)
        by_id = {n["id"]: n for n in nodes}
        assert by_id["a"]["y"] == layout.BASE_Y
        assert by_id["b"]["y"] == layout.BASE_Y + layout.DY
        assert by_id["c"]["y"] == layout.BASE_Y + 2 * layout.DY
        # Single node per rank → all share BASE_X.
        assert {n["x"] for n in nodes} == {layout.BASE_X}

    def test_longest_path_ranking(self):
        # a -> b -> d and a -> d ; d's rank is the LONGEST path (2), not 1.
        nodes = _nodes("a", "b", "d")
        edges = [
            {"from": "a", "to": "b"},
            {"from": "b", "to": "d"},
            {"from": "a", "to": "d"},
        ]
        layout.layout_nodes_inplace(nodes, edges)
        by_id = {n["id"]: n for n in nodes}
        assert by_id["a"]["y"] == layout.BASE_Y
        assert by_id["b"]["y"] == layout.BASE_Y + layout.DY
        assert by_id["d"]["y"] == layout.BASE_Y + 2 * layout.DY

    def test_siblings_share_rank_and_spread_horizontally(self):
        # a -> b, a -> c : b and c are both at rank 1 (same y), different x.
        nodes = _nodes("a", "b", "c")
        edges = [{"from": "a", "to": "b"}, {"from": "a", "to": "c"}]
        layout.layout_nodes_inplace(nodes, edges)
        by_id = {n["id"]: n for n in nodes}
        assert by_id["b"]["y"] == by_id["c"]["y"] == layout.BASE_Y + layout.DY
        assert by_id["b"]["x"] != by_id["c"]["x"]

    def test_back_edge_does_not_explode_coordinates(self):
        # A back edge (n2 -> n1, numeric target id < source id) must be ignored
        # for ranking so the chain stays compact. The guard works on the numeric
        # suffix of the id, so ``n``-prefixed ids are required here.
        nodes = _nodes("n1", "n2")
        edges = [{"from": "n1", "to": "n2"}, {"from": "n2", "to": "n1"}]
        layout.layout_nodes_inplace(nodes, edges)
        ys = [n["y"] for n in nodes]
        # Only the forward edge n1->n2 counts: ranks 0 and 1.
        assert max(ys) == layout.BASE_Y + layout.DY


class TestIsBackEdge:
    def test_back_edge_detected(self):
        assert layout.is_back_edge("n3", "n2") is True

    def test_forward_edge_not_back(self):
        assert layout.is_back_edge("n1", "n2") is False

    def test_non_numeric_ids_are_not_back(self):
        assert layout.is_back_edge("start", "end") is False
