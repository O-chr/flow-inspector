"""Tests for the shared hybrid frontmatter parser (server/fi_frontmatter.py)."""
from __future__ import annotations
import fi_frontmatter as FM   # server/ is on sys.path via conftest
import pytest

requires_yaml = pytest.mark.skipif(not FM._HAS_YAML, reason="needs pyyaml for YAML lists / folded / literal scalars")


def test_plain_single_line():
    fm = FM.parse_frontmatter("---\nname: pdf\ndescription: PDF を扱う\n---\n# body\n")
    assert fm["name"] == "pdf"
    assert FM.fm_str(fm.get("description")) == "PDF を扱う"


def test_bare_colon_description_falls_back():
    text = "---\nname: pdf\ndescription: Use when PDFs. Triggers: fill, merge.\n---\n"
    fm = FM.parse_frontmatter(text)
    assert FM.fm_str(fm.get("description")) == "Use when PDFs. Triggers: fill, merge."


@requires_yaml
def test_yaml_list_tools():
    text = "---\nname: x\ntools:\n  - Read\n  - Write\n---\n"
    fm = FM.parse_frontmatter(text)
    assert FM.fm_list(fm.get("tools")) == ["Read", "Write"]


def test_comma_separated_tools():
    fm = FM.parse_frontmatter("---\nname: x\nallowed-tools: Read, Write, Bash\n---\n")
    assert FM.fm_list(fm.get("allowed-tools")) == ["Read", "Write", "Bash"]


def test_whitespace_separated_tools_legacy():
    fm = FM.parse_frontmatter("---\nname: x\nallowed-tools: Read Write Bash\n---\n")
    assert FM.fm_list(fm.get("allowed-tools")) == ["Read", "Write", "Bash"]


@requires_yaml
def test_folded_scalar_description():
    text = "---\nname: x\ndescription: >\n  一行目\n  二行目\nflow_version: 1\n---\n"
    fm = FM.parse_frontmatter(text)
    assert "一行目" in FM.fm_str(fm.get("description"))
    assert "二行目" in FM.fm_str(fm.get("description"))


@requires_yaml
def test_block_literal_description_preserves_newlines():
    text = "---\nname: x\ndescription: |\n  一行目\n  二行目\nflow_version: 1\n---\n"
    fm = FM.parse_frontmatter(text)
    assert FM.fm_str(fm.get("description")) == "一行目\n二行目"


def test_bool_int_normalized_to_str():
    fm = FM.parse_frontmatter("---\nname: x\nbackground: true\nmaxTurns: 5\n---\n")
    assert FM.fm_str(fm.get("background")) == "true"
    assert FM.fm_str(fm.get("maxTurns")) == "5"


def test_no_frontmatter_returns_empty():
    assert FM.parse_frontmatter("# just a heading\n") == {}


def test_fm_list_none_and_empty():
    assert FM.fm_list(None) is None
    assert FM.fm_list("") is None


def test_fm_str_none():
    assert FM.fm_str(None) == ""


def test_fm_str_preserves_internal_and_surrounding_whitespace():
    """fm_str must NOT mangle a value's content. The chosen contract:
    rstrip ONLY trailing newlines (yaml ``|`` block artifact); everything else
    — internal newlines, leading/trailing spaces — is preserved verbatim."""
    # internal newlines survive
    assert FM.fm_str("a\nb") == "a\nb"
    # a single trailing newline (literal-block artifact) is removed
    assert FM.fm_str("a\nb\n") == "a\nb"
    # trailing / leading spaces are meaningful and preserved (no .strip())
    assert FM.fm_str("  spaced  ") == "  spaced  "
    # internal content with trailing spaces before a newline is preserved
    assert FM.fm_str("line1   \nline2") == "line1   \nline2"


@requires_yaml
def test_safe_dump_quoted_scalar_roundtrips_without_strip():
    """The codec emits quoted scalars via yaml.safe_dump; safe_load round-trips
    them exactly, so fm_str's newline-only rstrip never alters codec output."""
    import yaml
    desc = "trailing spaces   "
    block = yaml.safe_dump(
        {"name": "x", "description": desc, "flow_version": 1},
        allow_unicode=True, sort_keys=False, default_flow_style=False, width=4096,
    )
    fm = FM.parse_frontmatter("---\n" + block.rstrip("\n") + "\n---\n# body\n")
    assert FM.fm_str(fm.get("description")) == desc


def test_line_parser_fallback_when_yaml_absent(monkeypatch):
    """When pyyaml is unavailable, parse_frontmatter must still work via the
    tolerant line parser (the 'pyyaml is optional' contract)."""
    monkeypatch.setattr(FM, "_HAS_YAML", False)
    fm = FM.parse_frontmatter(
        "---\nname: x\ndescription: Use when X. Triggers: a, b\nallowed-tools: Read, Write\n---\n"
    )
    assert fm["name"] == "x"
    # bare-colon description still recovered by the line parser
    assert FM.fm_str(fm.get("description")) == "Use when X. Triggers: a, b"
    # comma list still normalizes via fm_list (which is yaml-independent)
    assert FM.fm_list(fm.get("allowed-tools")) == ["Read", "Write"]
