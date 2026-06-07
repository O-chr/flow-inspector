"""parser.py の frontmatter 依存抽出が YAML/カンマ記法を正しく扱うこと。"""
from __future__ import annotations
from pathlib import Path
import parser as P


def _write(tmp_path: Path, name: str, text: str) -> str:
    d = tmp_path / "skills" / name
    d.mkdir(parents=True, exist_ok=True)
    p = d / "SKILL.md"
    p.write_text(text, encoding="utf-8")
    return str(p)


def test_skill_allowed_tools_comma(tmp_path):
    path = _write(tmp_path, "s1", "---\nname: s1\ndescription: x\nallowed-tools: Read, Write, Bash\n---\n# s1\n本文\n")
    meta = P.extract_skill_meta(path, layer="user")
    assert meta["allowed_tools"] == ["Read", "Write", "Bash"]


def test_skill_bare_colon_description_survives(tmp_path):
    path = _write(tmp_path, "s2", "---\nname: s2\ndescription: Use when X. Triggers: a, b\n---\n# s2\n本文\n")
    meta = P.extract_skill_meta(path, layer="user")
    assert meta["description"] == "Use when X. Triggers: a, b"


def test_agent_tools_yaml_list(tmp_path):
    d = tmp_path / "agents"
    d.mkdir(parents=True, exist_ok=True)
    p = d / "a1.md"
    p.write_text("---\nname: a1\ntools:\n  - Read\n  - Bash\nmaxTurns: 3\n---\n# a1\n本文\n", encoding="utf-8")
    meta = P.extract_agent_meta(str(p), layer="user")
    assert meta["tools"] == ["Read", "Bash"]
    assert meta["max_turns"] == 3


def test_skill_numeric_name_does_not_crash(tmp_path):
    # yaml turns an unquoted numeric/bool name into int/bool; it must be
    # coerced to a string so _slugify doesn't crash and the skill still lists.
    path = _write(tmp_path, "n1", "---\nname: 123\ndescription: x\n---\n# body\n本文\n")
    meta = P.extract_skill_meta(path, layer="user")
    assert meta["name"] == "123"
    assert isinstance(meta["id"], str) and meta["id"]


def test_parse_skill_numeric_name_does_not_crash(tmp_path):
    # yaml turns an unquoted numeric name into int; the rule-parser path of
    # parse_skill (no flow_version:1) must coerce name/description through
    # fm_str so _slugify / the string fields don't choke on a non-str value.
    path = _write(tmp_path, "n2", "---\nname: 42\ndescription: x\n---\n## 開始\n本文\n")
    flow = P.parse_skill(path, layer="user")
    assert isinstance(flow.get("name"), str) and flow["name"]


def test_agent_bool_name_coerced(tmp_path):
    d = tmp_path / "agents"
    d.mkdir(parents=True, exist_ok=True)
    p = d / "a2.md"
    # `name: yes` → yaml bool True → must become a string, not crash
    p.write_text("---\nname: yes\ndescription: x\n---\n# body\n本文\n", encoding="utf-8")
    meta = P.extract_agent_meta(str(p), layer="user")
    assert isinstance(meta["name"], str) and meta["name"]


def test_command_list_description_coerced_to_str(tmp_path):
    d = tmp_path / "commands"
    d.mkdir(parents=True, exist_ok=True)
    p = d / "c1.md"
    # yaml will parse this description as a list; parse_command must coerce to str
    p.write_text("---\nname: c1\ndescription:\n  - a\n  - b\n---\n# c1\n本文\n", encoding="utf-8")
    flow = P.parse_command(str(p), layer="user")
    assert isinstance(flow["description"], str)
