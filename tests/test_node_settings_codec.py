"""Round-trip tests for node_settings_codec.

``encode_settings_comment(meta) -> "<!-- fi-settings: {json} -->" | None``
``parse_settings_comment(line)  -> dict | None``

Notable current behaviour pinned here:
  * keys are emitted sorted (deterministic output);
  * a set of presentation/structure keys (``io``, ``subflow``, ``depends`` …)
    and empty values are excluded from the stored JSON;
  * empty/None meta encodes to ``None`` (no comment line).
"""
from __future__ import annotations

import node_settings_codec as nsc


class TestRoundTrip:
    def test_simple_roundtrip(self):
        meta = {"color": "blue", "pinned": True, "order": 3}
        line = nsc.encode_settings_comment(meta)
        assert line.startswith("<!-- fi-settings: ")
        assert line.endswith(" -->")
        assert nsc.parse_settings_comment(line) == meta

    def test_nested_roundtrip(self):
        meta = {"opts": {"retries": 2, "tags": ["x", "y"]}, "label": "demo"}
        line = nsc.encode_settings_comment(meta)
        assert nsc.parse_settings_comment(line) == meta

    def test_unicode_roundtrip(self):
        meta = {"title": "天気レポート", "note": "メモ"}
        line = nsc.encode_settings_comment(meta)
        assert nsc.parse_settings_comment(line) == meta

    def test_keys_emitted_sorted(self):
        line = nsc.encode_settings_comment({"b": 1, "a": 2})
        assert line.index('"a"') < line.index('"b"')


class TestEncodeFiltering:
    def test_empty_meta_is_none(self):
        assert nsc.encode_settings_comment({}) is None
        assert nsc.encode_settings_comment(None) is None  # type: ignore[arg-type]

    def test_excluded_keys_dropped(self):
        # io / depends / input / output etc. are presentation/structure keys and
        # must not be persisted; a real value alongside them still encodes.
        line = nsc.encode_settings_comment(
            {"io": "x", "depends": ["n1"], "input": {"a": 1}, "color": "red"}
        )
        decoded = nsc.parse_settings_comment(line)
        assert decoded == {"color": "red"}

    def test_only_excluded_keys_yields_none(self):
        assert nsc.encode_settings_comment({"io": "x", "subflow": {"k": 1}}) is None

    def test_empty_values_dropped(self):
        line = nsc.encode_settings_comment({"empty_str": "", "empty_list": [], "kept": "v"})
        assert nsc.parse_settings_comment(line) == {"kept": "v"}


class TestParseEdgeCases:
    def test_non_fi_line_returns_none(self):
        assert nsc.parse_settings_comment("just some text") is None
        assert nsc.parse_settings_comment("<!-- other comment -->") is None

    def test_empty_line_returns_none(self):
        assert nsc.parse_settings_comment("") is None

    def test_malformed_json_returns_none(self):
        assert nsc.parse_settings_comment("<!-- fi-settings: {not json} -->") is None

    def test_surrounding_whitespace_tolerated(self):
        meta = {"k": "v"}
        line = "   " + nsc.encode_settings_comment(meta) + "   "
        assert nsc.parse_settings_comment(line) == meta
