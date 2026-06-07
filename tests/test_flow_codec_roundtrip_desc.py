"""複数行 description が encode → parse で正確に往復すること（P2-2）。"""
from __future__ import annotations
from pathlib import Path
import flow_codec as FC
import parser_convention as PC


def test_multiline_description_roundtrip(tmp_path):
    flow = {
        "id": "t", "name": "テスト", "description": "一行目\n二行目の説明",
        "nodes": [{"id": "n1", "type": "parent", "title": "開始"}], "edges": [],
    }
    md = FC.encode_flow_to_skill_md(flow)
    p = tmp_path / "SKILL.md"
    p.write_text(md, encoding="utf-8")
    parsed = PC.parse_skill_convention(str(p), layer="user")
    assert parsed["description"] == "一行目\n二行目の説明"


def test_agent_single_line_colon_description_roundtrips(tmp_path):
    import parser as P
    flow = {
        "id": "a", "name": "エージェント",
        "description": "Use when X. Triggers: a, b",
        "nodes": [{"id": "n1", "type": "parent", "title": "開始"}], "edges": [],
    }
    md = FC.encode_flow_to_agent_md(flow)
    p = tmp_path / "agent.md"
    p.write_text(md, encoding="utf-8")
    meta = P.extract_agent_meta(str(p), layer="user")
    assert meta["description"] == "Use when X. Triggers: a, b"


def test_agent_single_line_colon_description_is_valid_yaml(tmp_path):
    """The agent writer must emit *valid* YAML for a single-line description
    with YAML-special chars (parity with the skill writer). Without quoting,
    a bare colon makes ``yaml.safe_load`` raise and only the tolerant
    line-parser fallback recovers it — fragile and a latent data-loss bug.
    """
    import yaml
    flow = {
        "id": "a", "name": "エージェント",
        "description": "Use when X. Triggers: a, b",
        "nodes": [{"id": "n1", "type": "parent", "title": "開始"}], "edges": [],
    }
    md = FC.encode_flow_to_agent_md(flow)
    # extract the frontmatter block (between the first two `---`)
    lines = md.splitlines()
    block_lines = []
    for ln in lines[1:]:
        if ln.strip() == "---":
            break
        block_lines.append(ln)
    loaded = yaml.safe_load("\n".join(block_lines))
    assert loaded["description"] == "Use when X. Triggers: a, b"


# ── C1/C2/C3: frontmatter must always be valid YAML (safe_dump emission) ──
import yaml as _yaml


def _fm_block(md: str) -> dict:
    # extract the --- frontmatter block and assert it is VALID yaml
    assert md.startswith("---")
    lines = md.splitlines()
    end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    return _yaml.safe_load("\n".join(lines[1:end]))


def test_skill_name_with_colon_is_valid_yaml(tmp_path):
    flow = {"id": "x", "name": "Explore: read-only", "description": "d",
            "nodes": [{"id": "n1", "type": "parent", "title": "s"}], "edges": []}
    md = FC.encode_flow_to_skill_md(flow)
    fm = _fm_block(md)  # must not raise
    assert fm["name"] == "Explore: read-only"


def test_skill_description_bracket_is_valid_yaml(tmp_path):
    flow = {"id": "x", "name": "n", "description": "[draft] do the thing",
            "nodes": [{"id": "n1", "type": "parent", "title": "s"}], "edges": []}
    md = FC.encode_flow_to_skill_md(flow)
    fm = _fm_block(md)
    assert fm["description"] == "[draft] do the thing"


def test_skill_description_backslash_roundtrips(tmp_path):
    flow = {"id": "x", "name": "n", "description": "path C:\\temp and: stuff",
            "nodes": [{"id": "n1", "type": "parent", "title": "s"}], "edges": []}
    md = FC.encode_flow_to_skill_md(flow)
    fm = _fm_block(md)
    assert fm["description"] == "path C:\\temp and: stuff"


def test_agent_name_with_colon_is_valid_yaml(tmp_path):
    flow = {"id": "x", "name": "Plan: deep", "description": "d",
            "nodes": [{"id": "n1", "type": "parent", "title": "s"}], "edges": []}
    md = FC.encode_flow_to_agent_md(flow)
    fm = _fm_block(md)
    assert fm["name"] == "Plan: deep"
