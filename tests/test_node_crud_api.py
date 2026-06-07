"""TestClient tests for the Node CRUD endpoints and their edge-rewiring.

These pin the two documented side effects (CLAUDE.md):
  * insert (POST /api/flows/{id}/nodes, after_node given): nodes strictly
    below ``after_node`` shift down by 140; the new node sits at
    ``after_node.y + 140``; edges leaving ``after_node`` are rewired through
    the new node (after_node -> new -> old_targets), plus after_node -> new.
  * delete (DELETE /api/flows/{id}/nodes/{nid}): every (incoming x outgoing)
    pair is reconnected as a direct pass-through edge; edges touching the
    removed node are dropped.

Flows are seeded by writing a JSON file into the flows dir (see the
``seed_flow`` fixture) — there is no flow-create endpoint; the backend
discovers flows by scanning and overlays saved edits from that dir. The whole
app is HOME-isolated (see conftest) so nothing touches the real machine.

Note: edges are stored with ``from``/``to`` keys.
"""
from __future__ import annotations


def _edge_set(edges):
    return {(e.get("from"), e.get("to")) for e in edges}


def _chain_flow(flow_id="demo-flow"):
    """A simple 3-node vertical chain n1 -> n2 -> n3.

    ``category`` is set to a non-procedure value and ``source.type`` is omitted
    so the backend does NOT inject flow-start/flow-end endpoint nodes (those are
    only added for skill/agent flows), keeping node ids clean for assertions.
    """
    return {
        "id": flow_id,
        "name": flow_id,
        "category": "Plans",
        "description": "",
        "complexity": "Low",
        "nodes": [
            {"id": "n1", "type": "parent", "title": "Root", "x": 80, "y": 60},
            {"id": "n2", "type": "code", "title": "Middle", "x": 80, "y": 200},
            {"id": "n3", "type": "code", "title": "Leaf", "x": 80, "y": 340},
        ],
        "edges": [
            {"from": "n1", "to": "n2"},
            {"from": "n2", "to": "n3"},
        ],
    }


def _get_flow(client, flow_id="demo-flow"):
    r = client.get(f"/api/flows/{flow_id}")
    assert r.status_code == 200, r.text
    return r.json()


class TestInsertNode:
    def test_insert_after_shifts_successors_and_rewires(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.post(
            "/api/flows/demo-flow/nodes",
            json={"after_node": "n1", "type": "code", "title": "Inserted"},
        )
        assert r.status_code == 200, r.text
        new_id = r.json()["node"]["id"]

        flow = _get_flow(client)
        by_id = {n["id"]: n for n in flow["nodes"]}

        # New node present, positioned at after_node.y + 140, inheriting x.
        assert new_id in by_id
        assert by_id[new_id]["y"] == 60 + 140
        assert by_id[new_id]["x"] == by_id["n1"]["x"]

        # Successors (y > 60) shifted down by 140; after_node unchanged.
        assert by_id["n1"]["y"] == 60
        assert by_id["n2"]["y"] == 200 + 140
        assert by_id["n3"]["y"] == 340 + 140

        # Edge rewiring: n1->n2 becomes new->n2; plus n1->new. n2->n3 intact.
        edges = _edge_set(flow["edges"])
        assert ("n1", new_id) in edges
        assert (new_id, "n2") in edges
        assert ("n1", "n2") not in edges
        assert ("n2", "n3") in edges

    def test_insert_generates_sequential_id(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.post(
            "/api/flows/demo-flow/nodes",
            json={"after_node": "n1", "type": "code", "title": "X"},
        )
        assert r.status_code == 200
        # 3 existing nodes -> next free id is n4.
        assert r.json()["node"]["id"] == "n4"

    def test_inserted_node_carries_address(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.post(
            "/api/flows/demo-flow/nodes",
            json={"after_node": "n2", "type": "user", "title": "Ask"},
        )
        assert r.status_code == 200
        assert r.json()["address"] == f"flow:demo-flow/{r.json()['node']['id']}"

    def test_insert_persists_to_disk(self, client, seed_flow, app_module):
        seed_flow(_chain_flow())
        client.post("/api/flows/demo-flow/nodes",
                    json={"after_node": "n1", "type": "code", "title": "Persisted"})
        saved = app_module.ws.flows_path / "demo-flow.json"
        import json

        data = json.loads(saved.read_text(encoding="utf-8"))
        assert len(data["nodes"]) == 4

    def test_insert_after_unknown_node_404(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.post(
            "/api/flows/demo-flow/nodes",
            json={"after_node": "does-not-exist", "type": "code", "title": "X"},
        )
        assert r.status_code == 404

    def test_insert_missing_required_field_422(self, client, seed_flow):
        seed_flow(_chain_flow())
        # after_node is required by the NodeInsert model.
        r = client.post("/api/flows/demo-flow/nodes", json={"type": "code", "title": "X"})
        assert r.status_code == 422


class TestDeleteNode:
    def test_delete_reconnects_passthrough(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.delete("/api/flows/demo-flow/nodes/n2")
        assert r.status_code == 200, r.text
        assert r.json()["removed"] == "n2"

        flow = _get_flow(client)
        assert "n2" not in {n["id"] for n in flow["nodes"]}
        edges = _edge_set(flow["edges"])
        # n1->n2->n3 collapses to a direct n1->n3 pass-through.
        assert ("n1", "n3") in edges
        assert ("n1", "n2") not in edges
        assert ("n2", "n3") not in edges

    def test_delete_fan_in_fan_out_cartesian(self, client, seed_flow):
        # a->m, b->m, m->c, m->d : removing m yields the full 2x2 product.
        seed_flow({
            "id": "diamond",
            "name": "diamond",
            "category": "Plans",
            "description": "",
            "complexity": "Low",
            "nodes": [
                {"id": "a", "type": "code", "title": "A", "x": 0, "y": 0},
                {"id": "b", "type": "code", "title": "B", "x": 0, "y": 0},
                {"id": "m", "type": "code", "title": "M", "x": 0, "y": 0},
                {"id": "c", "type": "code", "title": "C", "x": 0, "y": 0},
                {"id": "d", "type": "code", "title": "D", "x": 0, "y": 0},
            ],
            "edges": [
                {"from": "a", "to": "m"},
                {"from": "b", "to": "m"},
                {"from": "m", "to": "c"},
                {"from": "m", "to": "d"},
            ],
        })
        r = client.delete("/api/flows/diamond/nodes/m")
        assert r.status_code == 200
        edges = _edge_set(_get_flow(client, "diamond")["edges"])
        assert edges == {("a", "c"), ("a", "d"), ("b", "c"), ("b", "d")}

    def test_delete_leaf_drops_dangling_edge(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.delete("/api/flows/demo-flow/nodes/n3")
        assert r.status_code == 200
        edges = _edge_set(_get_flow(client)["edges"])
        # n3 has no outgoing, so n2->n3 is simply dropped.
        assert edges == {("n1", "n2")}

    def test_delete_unknown_node_404(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.delete("/api/flows/demo-flow/nodes/ghost")
        assert r.status_code == 404


class TestGetFlowAndAddress:
    def test_get_flow_enriches_addresses(self, client, seed_flow):
        seed_flow(_chain_flow())
        flow = _get_flow(client)
        for n in flow["nodes"]:
            assert n["address"] == f"flow:demo-flow/{n['id']}"

    def test_resolve_address_returns_node_with_edges(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.get("/api/address/demo-flow/n2")
        assert r.status_code == 200
        node = r.json()
        assert node["id"] == "n2"
        assert node["_incoming"] == [{"from": "n1", "to": "n2"}]
        assert node["_outgoing"] == [{"from": "n2", "to": "n3"}]

    def test_resolve_unknown_node_404(self, client, seed_flow):
        seed_flow(_chain_flow())
        assert client.get("/api/address/demo-flow/ghost").status_code == 404

    def test_get_unknown_flow_404(self, client):
        assert client.get("/api/flows/no-such-flow").status_code == 404

    def test_invalid_flow_id_rejected(self, client):
        # path-traversal-ish id is rejected before lookup.
        assert client.get("/api/flows/undefined").status_code in (400, 404)


class TestUpdateNode:
    def test_patch_updates_fields(self, client, seed_flow):
        seed_flow(_chain_flow())
        r = client.patch("/api/flows/demo-flow/nodes/n2",
                         json={"title": "Renamed", "desc": "new body"})
        assert r.status_code == 200, r.text
        assert r.json()["node"]["title"] == "Renamed"
        # Persisted.
        flow = _get_flow(client)
        n2 = next(n for n in flow["nodes"] if n["id"] == "n2")
        assert n2["title"] == "Renamed"
        assert n2["desc"] == "new body"

    def test_patch_unknown_node_404(self, client, seed_flow):
        seed_flow(_chain_flow())
        assert client.patch("/api/flows/demo-flow/nodes/ghost", json={"title": "x"}).status_code == 404
