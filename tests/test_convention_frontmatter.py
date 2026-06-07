"""convention パーサが複数行 description / 裸コロンを YAML 経由で扱えること。"""
from __future__ import annotations
from pathlib import Path
import parser_convention as PC


def test_block_literal_description_roundtrips(tmp_path):
    text = (
        "---\nname: t\ndescription: |\n  一行目\n  二行目\nflow_version: 1\n---\n"
        "\n## 開始 <!-- type=parent -->\n本文\n"
    )
    p = tmp_path / "SKILL.md"
    p.write_text(text, encoding="utf-8")
    flow = PC.parse_skill_convention(str(p), layer="user")
    assert flow["description"] == "一行目\n二行目"


def test_bare_colon_description_survives(tmp_path):
    text = "---\nname: t\ndescription: Use when X. Triggers: a, b\nflow_version: 1\n---\n\n## s <!-- type=parent -->\n本文\n"
    p = tmp_path / "SKILL.md"
    p.write_text(text, encoding="utf-8")
    flow = PC.parse_skill_convention(str(p), layer="user")
    assert flow["description"] == "Use when X. Triggers: a, b"
