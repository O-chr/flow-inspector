"""extract_json_object: string-aware JSON extraction from LLM output.

Guards the bug class where a `}`/`]` inside a string value truncated the scan."""
from __future__ import annotations

import pytest

from io_utils import extract_json_object


def test_brace_inside_string_value():
    out = extract_json_object('{"desc": "use } and { freely", "x": 1}')
    assert out["x"] == 1 and "}" in out["desc"]


def test_escaped_quote_then_brace_in_string():
    out = extract_json_object('{"s": "a \\" } b", "n": 2}')
    assert out["n"] == 2 and out["s"] == 'a " } b'


def test_code_fence_wrapped():
    out = extract_json_object('```json\n{"a": 1}\n```')
    assert out["a"] == 1


def test_array_with_bracket_in_string_value():
    out = extract_json_object('[{"tags": "a]b]c"}, {"k": 2}]')
    assert isinstance(out, list) and len(out) == 2 and out[1]["k"] == 2


def test_prose_around_object():
    out = extract_json_object("Here is the result:\n{\"ok\": true}\nDone.")
    assert out["ok"] is True


def test_nested_objects_kept_whole():
    out = extract_json_object('{"a": {"b": {"c": 1}}, "d": 2}')
    assert out["a"]["b"]["c"] == 1 and out["d"] == 2


def test_no_json_raises():
    with pytest.raises(ValueError):
        extract_json_object("no json here at all")
