"""infer_file_type: file-name → validator/notification category mapping.

The PROJECT (CLAUDE.md) and LOCAL (CLAUDE.local.md) layers are siblings and
must map to the same `claude_md` category so they share the validator rubric
and notification bucket. All test data is synthetic."""
from __future__ import annotations

import asyncio

from deploy_validate import infer_file_type, validate_staged_file


def test_claude_md_and_local_share_claude_md_type():
    assert infer_file_type("/srv/foo/CLAUDE.md") == "claude_md"
    assert infer_file_type("/srv/foo/CLAUDE.local.md") == "claude_md"


def test_claude_md_skips_llm_validation_and_passes():
    """A3: CLAUDE.md pushes without the claude -p gate (prose doc). No file read / no claude."""
    out = asyncio.run(validate_staged_file(
        {"path": "/srv/demo/CLAUDE.md", "staged_path": "/nonexistent/CLAUDE.md", "status": "new"}))
    assert out["ok"] is True
    out2 = asyncio.run(validate_staged_file(
        {"path": "/srv/demo/CLAUDE.local.md", "staged_path": "/nonexistent", "status": "new"}))
    assert out2["ok"] is True


def test_other_known_types_still_classified():
    assert infer_file_type("/x/SKILL.md") == "skill"
    assert infer_file_type("/x/settings.json") == "hooks"
    assert infer_file_type("/x/agents/foo.md") == "agent"
    assert infer_file_type("/x/random.txt") == "other"
