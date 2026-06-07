"""Round-trip tests for flow_codec.

The encoders are one-directional (flow dict -> markdown). The inverse lives in
the parsers, so a round-trip test pairs:

  * ``encode_flow_to_skill_md``  <->  ``parser_convention.parse_skill_convention``
  * ``encode_flow_to_agent_md``  <->  ``parser.parse_agent``

We assert the load-bearing fields (name, description, node titles/types, edges,
multi-line bodies) survive the trip. Everything is written under ``tmp_path``.
"""
from __future__ import annotations

import flow_codec
import parser
import parser_convention


def _write(tmp_path, name, text):
    p = tmp_path / name
    p.write_text(text, encoding="utf-8")
    return str(p)


SAMPLE_FLOW = {
    "id": "demo-project",
    "name": "demo-project",
    "description": "A short single-line description.",
    "nodes": [
        {"id": "n1", "type": "think", "title": "Plan the work", "subtitle": "", "desc": "first body", "config": {}},
        {"id": "n2", "type": "code", "title": "Run the script", "subtitle": "", "desc": "second body", "config": {}},
        {"id": "n3", "type": "user", "title": "Confirm result", "subtitle": "", "desc": "third body", "config": {}},
    ],
    "edges": [
        {"from": "n1", "to": "n2"},
        {"from": "n2", "to": "n3"},
    ],
    "parallels": [],
}


class TestSkillRoundTrip:
    def _roundtrip(self, tmp_path, flow):
        md = flow_codec.encode_flow_to_skill_md(flow)
        path = _write(tmp_path, "SKILL.md", md)
        return md, parser_convention.parse_skill_convention(path, "user")

    def test_emitted_md_is_convention_v1(self, tmp_path):
        md = flow_codec.encode_flow_to_skill_md(SAMPLE_FLOW)
        assert md.startswith("---")
        assert "flow_version: 1" in md
        assert parser_convention.is_convention_v1(md)

    def test_name_and_description_survive(self, tmp_path):
        _, back = self._roundtrip(tmp_path, SAMPLE_FLOW)
        assert back["name"] == "demo-project"
        assert back["description"] == "A short single-line description."

    def test_titles_and_types_survive(self, tmp_path):
        _, back = self._roundtrip(tmp_path, SAMPLE_FLOW)
        got = [(n["title"], n["type"]) for n in back["nodes"]]
        assert got == [
            ("Plan the work", "think"),
            ("Run the script", "code"),
            ("Confirm result", "user"),
        ]

    def test_node_bodies_survive(self, tmp_path):
        _, back = self._roundtrip(tmp_path, SAMPLE_FLOW)
        descs = [n.get("desc") for n in back["nodes"]]
        assert descs == ["first body", "second body", "third body"]

    def test_linear_edges_survive(self, tmp_path):
        _, back = self._roundtrip(tmp_path, SAMPLE_FLOW)
        pairs = {(e["from"], e["to"]) for e in back["edges"]}
        # ids are reassigned by the parser (n1..nN in walk order); a 3-node
        # linear chain must yield exactly two consecutive edges.
        assert len(pairs) == 2
        froms = sorted(f for f, _ in pairs)
        tos = sorted(t for _, t in pairs)
        assert froms == ["n1", "n2"]
        assert tos == ["n2", "n3"]

    def test_multiline_node_body_survives(self, tmp_path):
        flow = {
            "id": "demo",
            "name": "todo-helper",
            "description": "one line",
            "nodes": [
                {"id": "n1", "type": "think", "title": "Solo step", "subtitle": "",
                 "desc": "line one\nline two\nline three", "config": {}},
            ],
            "edges": [],
            "parallels": [],
        }
        md = flow_codec.encode_flow_to_skill_md(flow)
        back = parser_convention.parse_skill_convention(_write(tmp_path, "SKILL.md", md), "user")
        assert back["nodes"][0]["desc"] == "line one\nline two\nline three"

    def test_multiline_description_roundtrips_exactly(self, tmp_path):
        # A multi-line description must roundtrip EXACTLY (P2-2), preserving its
        # newlines instead of collapsing them to spaces. Emission now goes through
        # yaml.safe_dump, which may pick a quoted or literal/block form depending
        # on the value — the exact YAML marker (``|`` vs quoted with ``\n``) is an
        # implementation detail, so we assert the ROUNDTRIP CONTRACT, not the format:
        # (1) the emitted frontmatter is valid YAML, and (2) the description survives
        # verbatim through the convention parser.
        import yaml as _yaml

        flow = dict(SAMPLE_FLOW)
        flow["description"] = "Line one.\nLine two.\nLine three."
        md = flow_codec.encode_flow_to_skill_md(flow)

        # frontmatter block must be valid YAML
        lines = md.splitlines()
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
        fm = _yaml.safe_load("\n".join(lines[1:end]))
        assert fm["description"] == "Line one.\nLine two.\nLine three."

        back = parser_convention.parse_skill_convention(_write(tmp_path, "SKILL.md", md), "user")
        assert back["description"] == "Line one.\nLine two.\nLine three."

    def test_singleline_description_roundtrips_exactly(self, tmp_path):
        # The common case (single-line description) survives intact.
        flow = dict(SAMPLE_FLOW)
        flow["description"] = "A single concise line."
        md = flow_codec.encode_flow_to_skill_md(flow)
        back = parser_convention.parse_skill_convention(_write(tmp_path, "SKILL.md", md), "user")
        assert back["description"] == "A single concise line."


class TestAgentRoundTrip:
    def test_agent_md_roundtrip(self, tmp_path):
        flow = {
            "id": "agent-reviewer",
            "name": "reviewer",
            "description": "Reviews code changes.",
            "nodes": [
                {"id": "n1", "type": "subagent", "title": "Analyze", "desc": "do the analysis"},
                {"id": "n2", "type": "subagent", "title": "Report", "desc": "write the report"},
            ],
            "edges": [{"from": "n1", "to": "n2"}],
        }
        md = flow_codec.encode_flow_to_agent_md(flow)
        assert md.startswith("---")
        back = parser.parse_agent(_write(tmp_path, "reviewer.md", md), "user")
        assert back["name"] == "reviewer"
        assert [n["title"] for n in back["nodes"]] == ["Analyze", "Report"]
        # Section bodies survive into node desc.
        descs = [n.get("desc", "") for n in back["nodes"]]
        assert "do the analysis" in descs[0]
        assert "write the report" in descs[1]


class TestHookPatchRoundTrip:
    def test_encode_hook_patch_builds_settings_json(self, tmp_path):
        import json

        flow = {
            "id": "hooks-demo",
            "name": "hooks",
            "nodes": [
                {"id": "n1", "type": "hook", "title": "PreToolUse: Bash",
                 "config": {"hook_type": "PreToolUse", "matcher": "Bash", "command": "echo before"}},
            ],
            "edges": [],
        }
        settings_path = tmp_path / "settings.json"
        patched = flow_codec.encode_flow_to_hook_patch(flow, str(settings_path))
        data = json.loads(patched)
        entry = data["hooks"]["PreToolUse"][0]
        assert entry["matcher"] == "Bash"
        assert entry["hooks"][0]["command"] == "echo before"

    def test_hook_patch_preserves_other_settings_keys(self, tmp_path):
        import json

        settings_path = tmp_path / "settings.json"
        settings_path.write_text(json.dumps({"model": "demo", "other": [1, 2]}), encoding="utf-8")
        flow = {"id": "h", "name": "h", "nodes": [], "edges": []}
        data = json.loads(flow_codec.encode_flow_to_hook_patch(flow, str(settings_path)))
        # Non-hook keys are retained; hooks is (re)written.
        assert data["model"] == "demo"
        assert data["other"] == [1, 2]
        assert "hooks" in data
