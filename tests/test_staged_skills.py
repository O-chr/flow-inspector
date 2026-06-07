"""Tests for staged_skills: slugify, publish-target validation, stage flow.

Pinned current behaviour:
  * ``slugify_skill_name`` preserves Unicode word characters (Japanese names
    survive as-is — it does NOT transliterate to ASCII), lowercases ASCII,
    collapses whitespace/separators to ``-``, and rejects ``""`` / ``.`` /
    ``..`` / leading-dot / path-separator names.
  * ``validate_publish_target(folder, *, home=...)`` accepts the home dir or
    anything beneath it and rejects escapes.
"""
from __future__ import annotations

import pytest

import staged_skills as ss


class TestSlugify:
    @pytest.mark.parametrize(
        "name,expected",
        [
            ("Weather Reporter", "weather-reporter"),
            ("todo_helper", "todo_helper"),          # underscore is a word char
            ("  Spaced  Out  ", "spaced-out"),
            ("Mixed-CASE 123", "mixed-case-123"),
            ("multiple   spaces", "multiple-spaces"),
            ("path/like/name", "path-like-name"),    # separators -> hyphens
        ],
    )
    def test_basic_slugs(self, name, expected):
        assert ss.slugify_skill_name(name) == expected

    def test_unicode_preserved_not_transliterated(self):
        # Japanese stays Japanese (Unicode-aware \\w); no ASCII fallback.
        assert ss.slugify_skill_name("天気レポート") == "天気レポート"

    def test_mixed_unicode_and_ascii(self):
        assert ss.slugify_skill_name("天気 weather") == "天気-weather"

    @pytest.mark.parametrize("bad", ["", "   ", ".", "..", ".hidden", "/", "\\"])
    def test_rejects_unusable_names(self, bad):
        with pytest.raises(ValueError):
            ss.slugify_skill_name(bad)

    def test_rejects_non_string(self):
        with pytest.raises(ValueError):
            ss.slugify_skill_name(None)  # type: ignore[arg-type]


class TestValidatePublishTarget:
    def test_home_itself_ok(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        assert ss.validate_publish_target(str(home), home=home) == home.resolve()

    def test_nested_target_ok(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        resolved = ss.validate_publish_target(str(home / ".claude" / "skills"), home=home)
        assert str(resolved).startswith(str(home.resolve()))

    def test_escape_via_dotdot_rejected(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        with pytest.raises(ValueError):
            ss.validate_publish_target(str(home / ".." / "escaped"), home=home)

    def test_sibling_dir_rejected(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        (tmp_path / "other").mkdir()
        with pytest.raises(ValueError):
            ss.validate_publish_target(str(tmp_path / "other"), home=home)

    @pytest.mark.parametrize("subtree", [".ssh", ".aws", ".gnupg", ".config",
                                          ".docker", ".kube", "Library"])
    def test_sensitive_home_subtree_rejected(self, tmp_path, subtree):
        """A crafted publish target into a credential / OS-state subtree under
        HOME must be rejected even though it is technically 'under home'."""
        home = tmp_path / "home"
        home.mkdir()
        with pytest.raises(ValueError):
            ss.validate_publish_target(str(home / subtree / "evil"), home=home)

    @pytest.mark.parametrize("subtree", ["todos", "history", "shell-snapshots",
                                          "ide", "statsig", "logs"])
    def test_claude_live_state_subtree_rejected(self, tmp_path, subtree):
        """Inside ~/.claude, live-state subtrees are off-limits to skill publish."""
        home = tmp_path / "home"
        home.mkdir()
        with pytest.raises(ValueError):
            ss.validate_publish_target(str(home / ".claude" / subtree), home=home)

    def test_claude_skills_still_ok(self, tmp_path):
        """The legitimate target (~/.claude/skills) must still pass."""
        home = tmp_path / "home"
        home.mkdir()
        resolved = ss.validate_publish_target(str(home / ".claude" / "skills"), home=home)
        assert str(resolved).endswith("/.claude/skills")


class TestStagedSkillsStore:
    def test_stage_writes_files_and_returns_meta(self, tmp_path):
        store = ss.StagedSkillsStore(str(tmp_path / "stage"))
        meta = store.stage("Weather Reporter", "A weather skill", "# body\nhello",
                            str(tmp_path / "home" / ".claude" / "skills"))
        assert meta["slug"] == "weather-reporter"
        assert meta["display_name"] == "Weather Reporter"
        assert meta["description"] == "A weather skill"
        d = tmp_path / "stage" / "staged-skills" / "weather-reporter"
        assert (d / "SKILL.md").read_text(encoding="utf-8") == "# body\nhello"
        assert (d / "meta.json").exists()

    def test_list_returns_staged(self, tmp_path):
        store = ss.StagedSkillsStore(str(tmp_path / "stage"))
        store.stage("Alpha Skill", "", "a", "/t")
        store.stage("Beta Skill", "", "b", "/t")
        slugs = sorted(m["slug"] for m in store.list())
        assert slugs == ["alpha-skill", "beta-skill"]

    def test_get_returns_meta_plus_content(self, tmp_path):
        store = ss.StagedSkillsStore(str(tmp_path / "stage"))
        store.stage("Todo Helper", "desc", "body text", "/t")
        got = store.get("todo-helper")
        assert got is not None
        assert got["display_name"] == "Todo Helper"
        assert got["content"] == "body text"

    def test_get_missing_returns_none(self, tmp_path):
        store = ss.StagedSkillsStore(str(tmp_path / "stage"))
        assert store.get("nope") is None

    def test_remove(self, tmp_path):
        store = ss.StagedSkillsStore(str(tmp_path / "stage"))
        store.stage("Temp Skill", "", "x", "/t")
        assert store.remove("temp-skill") is True
        assert store.get("temp-skill") is None
        assert store.remove("temp-skill") is False


class TestPublishSkillMd:
    def test_publish_writes_into_home(self, tmp_path):
        home = tmp_path / "home"
        target = home / ".claude" / "skills"
        out = ss.publish_skill_md("# published", str(target), "Weather Reporter", home=home)
        assert out == target / "weather-reporter" / "SKILL.md"
        assert out.read_text(encoding="utf-8") == "# published"

    def test_publish_outside_home_rejected(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        with pytest.raises(ValueError):
            ss.publish_skill_md("x", str(tmp_path / "elsewhere"), "weather-reporter", home=home)

    def test_read_live_skill_roundtrip(self, tmp_path):
        home = tmp_path / "home"
        target = home / ".claude" / "skills"
        ss.publish_skill_md("# live body", str(target), "weather-reporter", home=home)
        assert ss.read_live_skill(str(target), "weather-reporter") == "# live body"

    def test_read_live_skill_missing_is_none(self, tmp_path):
        assert ss.read_live_skill(str(tmp_path / "skills"), "ghost") is None
