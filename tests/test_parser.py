"""Tests for parser against a synthetic .claude tree.

Everything is fabricated under ``tmp_path`` — no real ``~/.claude`` is read.
We force the deterministic rule-based path by setting ``PARSER_MODE=rule`` so
no ``claude`` CLI is ever invoked.
"""
from __future__ import annotations

import json
import textwrap

import pytest

import parser


@pytest.fixture(autouse=True)
def _rule_mode(monkeypatch):
    # Pin the deterministic parser; never dispatch to the LLM path.
    monkeypatch.setattr(parser, "_PARSER_MODE", "rule", raising=False)


def _make_claude_tree(root):
    """Build a synthetic ``.claude`` directory and return its path."""
    claude = root / ".claude"

    # --- skills/<name>/SKILL.md ---
    weather = claude / "skills" / "weather-reporter"
    weather.mkdir(parents=True)
    (weather / "SKILL.md").write_text(
        "---\n"
        "name: weather-reporter\n"
        "description: Reports the local weather forecast.\n"
        "---\n\n"
        "# Weather Reporter\n"
        "## 1. Fetch data\n"
        "Get the forecast.\n"
        "## 2. Format report\n"
        "Format it nicely.\n",
        encoding="utf-8",
    )

    # --- commands/<name>.md ---
    cmds = claude / "commands"
    cmds.mkdir(parents=True)
    (cmds / "deploy.md").write_text(
        "---\nname: deploy\ndescription: Deploy the demo app.\n---\n"
        "Run the bash deploy script.\n",
        encoding="utf-8",
    )

    # --- agents/<name>.md ---
    agents = claude / "agents"
    agents.mkdir(parents=True)
    (agents / "reviewer.md").write_text(
        "---\nname: reviewer\ndescription: Reviews code changes.\n---\n"
        "## Role\nReview the diff carefully.\n",
        encoding="utf-8",
    )

    # --- CLAUDE.md ---
    (claude / "CLAUDE.md").write_text(
        "# Project rules\n## Style\nBe consistent.\n## Testing\nWrite tests.\n",
        encoding="utf-8",
    )

    # --- settings.json with hooks ---
    settings = {
        "hooks": {
            "PreToolUse": [
                {"matcher": "Bash", "hooks": [{"type": "command", "command": "echo before-bash"}]}
            ],
            "PostToolUse": [
                {"matcher": "", "hooks": [
                    {"type": "command", "command": "echo after-1"},
                    {"type": "command", "command": "echo after-2"},
                ]}
            ],
        }
    }
    (claude / "settings.json").write_text(json.dumps(settings), encoding="utf-8")

    return claude


class TestParseSkill:
    def test_name_description_and_steps(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        flow = parser.parse_skill(str(claude / "skills" / "weather-reporter" / "SKILL.md"), "user")
        assert flow["name"] == "weather-reporter"
        assert flow["description"] == "Reports the local weather forecast."
        assert flow["category"] == "Skills"
        titles = [n["title"] for n in flow["nodes"]]
        # Numbered ### / ## headings become steps (the leading number is kept).
        assert any("Fetch data" in t for t in titles)
        assert any("Format report" in t for t in titles)

    def test_name_falls_back_to_dir_when_no_frontmatter(self, tmp_path):
        sk = tmp_path / ".claude" / "skills" / "todo-helper"
        sk.mkdir(parents=True)
        (sk / "SKILL.md").write_text("Just body, no frontmatter.\n", encoding="utf-8")
        flow = parser.parse_skill(str(sk / "SKILL.md"), "user")
        assert flow["name"] == "todo-helper"


class TestParseCommand:
    def test_command_nodes(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        flow = parser.parse_command(str(claude / "commands" / "deploy.md"), "user")
        assert flow["name"] == "deploy"
        assert flow["description"] == "Deploy the demo app."
        assert flow["category"] == "Commands"
        types = [n["type"] for n in flow["nodes"]]
        # user trigger -> code (bash keyword present) -> parent.
        assert types[0] == "user"
        assert types[-1] == "parent"
        assert "code" in types


class TestParseAgent:
    def test_agent_nodes(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        flow = parser.parse_agent(str(claude / "agents" / "reviewer.md"), "user")
        assert flow["name"] == "reviewer"
        assert flow["category"] == "Subagents"
        assert all(n["type"] == "subagent" for n in flow["nodes"])


class TestParseClaudeMd:
    def test_one_node_per_section(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        flow = parser.parse_claude_md(str(claude / "CLAUDE.md"), "user", project_name="demo")
        titles = [n["title"] for n in flow["nodes"]]
        assert titles == ["Style", "Testing"]
        assert flow["category"] == "System"


class TestParseHooks:
    def test_hook_nodes_from_settings(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        flow = parser.parse_hooks(str(claude / "settings.json"), "user", project_name="demo")
        assert flow["category"] == "Hooks"
        # parse_hooks takes the first handler command of each (event, matcher) entry.
        configs = [n["config"] for n in flow["nodes"]]
        events = {c["hook_type"] for c in configs}
        assert events == {"PreToolUse", "PostToolUse"}
        pre = next(c for c in configs if c["hook_type"] == "PreToolUse")
        assert pre["matcher"] == "Bash"
        assert pre["command"] == "echo before-bash"


class TestExtractHooks:
    def test_flattens_every_handler(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        hooks = parser.extract_hooks(str(claude / "settings.json"), "user", project_name="demo")
        # 1 PreToolUse handler + 2 PostToolUse handlers = 3 flat entries.
        assert len(hooks) == 3
        assert {h["event"] for h in hooks} == {"PreToolUse", "PostToolUse"}
        pre = [h for h in hooks if h["event"] == "PreToolUse"]
        assert len(pre) == 1
        assert pre[0]["matcher"] == "Bash"
        assert pre[0]["command"] == "echo before-bash"
        assert pre[0]["handler_type"] == "command"
        post_cmds = sorted(h["command"] for h in hooks if h["event"] == "PostToolUse")
        assert post_cmds == ["echo after-1", "echo after-2"]

    def test_no_hooks_key_yields_empty(self, tmp_path):
        p = tmp_path / "settings.json"
        p.write_text(json.dumps({"other": 1}), encoding="utf-8")
        assert parser.extract_hooks(str(p), "user") == []


class TestExtractSkillMeta:
    def test_meta_fields(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        meta = parser.extract_skill_meta(str(claude / "skills" / "weather-reporter" / "SKILL.md"), "user")
        assert meta["name"] == "weather-reporter"
        assert meta["description"] == "Reports the local weather forecast."
        assert meta["layer"] == "user"
        assert meta["node_count"] >= 2
        assert meta["has_flow"] is True


class TestScanClaudeDir:
    def test_scans_all_artifact_types(self, tmp_path):
        claude = _make_claude_tree(tmp_path)
        flows = parser.scan_claude_dir(str(claude), "user", project_name="demo")
        categories = {f["category"] for f in flows}
        # skill, command, CLAUDE.md, agent, hooks all discovered.
        assert {"Skills", "Commands", "System", "Subagents", "Hooks"} <= categories
        ids = {f["id"] for f in flows}
        assert "skill-weather-reporter" in ids
        assert "cmd-deploy" in ids
        assert "agent-reviewer" in ids

    def test_empty_dir_yields_nothing(self, tmp_path):
        empty = tmp_path / ".claude"
        empty.mkdir()
        assert parser.scan_claude_dir(str(empty), "user") == []


# ─────────────────────────────────────────────────────────────────────────────
# Helpers for command flow-ization tests (Task 6 mirror from 8092)
# ─────────────────────────────────────────────────────────────────────────────

def _write_cmd(tmpdir, name, text):
    p = tmpdir / f"{name}.md"
    p.write_text(textwrap.dedent(text).lstrip(), encoding="utf-8")
    return str(p)


# --- _command_body_is_small tests (Task 1) ---

def test_command_body_is_small_true_for_tiny():
    from parser import _command_body_is_small
    tiny = "---\ndescription: x\n---\nRun the deploy and report back.\n"
    assert _command_body_is_small(tiny) is True


def test_command_body_is_small_false_for_long():
    from parser import _command_body_is_small
    long_body = "---\ndescription: x\n---\n" + ("これは十分に長い本文です。\n" * 20)
    assert _command_body_is_small(long_body) is False


def test_command_body_is_small_false_when_flow_version():
    from parser import _command_body_is_small
    conv = "---\nflow_version: 1\ndescription: x\n---\nshort\n"
    assert _command_body_is_small(conv) is False


# --- _extract_bash_commands tests (Task 2) ---

def test_extract_bash_inline():
    from parser import _extract_bash_commands
    body = "Run this:\n!`git status`\nand then report.\n"
    assert _extract_bash_commands(body) == ["git status"]


def test_extract_bash_fenced():
    from parser import _extract_bash_commands
    body = "Step:\n```bash\nnpm test\nnpm run build\n```\n"
    assert _extract_bash_commands(body) == ["npm test\nnpm run build"]


def test_extract_bash_none():
    from parser import _extract_bash_commands
    assert _extract_bash_commands("just prose, no commands") == []


# --- parse_command large-flow tests (Task 3) ---

def test_parse_command_small_stays_stub(tmp_path):
    path = _write_cmd(tmp_path, "tiny", """
        ---
        description: deploy
        ---
        Run the deploy and report back.
    """)
    flow = parser.parse_command(path, "user")
    assert flow["id"] == "cmd-tiny"
    assert flow["category"] == "Commands"
    # stub: user trigger + (maybe code) + 結果報告, no extracted steps
    assert flow["nodes"][0]["type"] == "user"
    assert flow["nodes"][-1]["title"] == "結果報告"
    assert len(flow["nodes"]) <= 3


def test_parse_command_large_extracts_steps(tmp_path):
    path = _write_cmd(tmp_path, "release", """
        ---
        description: release flow
        argument-hint: <version>
        ---
        # リリースコマンド

        ## テストを実行する
        全テストを走らせる。

        ## ビルドする
        本番ビルドを作る。

        ## デプロイして通知する
        本番に出して Slack へ通知。

        ## タグを打つ
        git タグを作成して push。

        ## リリースノートを書く
        変更点をまとめる。
    """)
    flow = parser.parse_command(path, "user")
    titles = [n["title"] for n in flow["nodes"]]
    # user trigger root first
    assert flow["nodes"][0]["type"] == "user"
    # each ## step became a node
    assert "テストを実行する" in titles
    assert "リリースノートを書く" in titles
    # more than the 3-node stub
    assert len(flow["nodes"]) > 3
    # argument-hint surfaced on the trigger node
    assert "<version>" in (flow["nodes"][0].get("subtitle", "") + flow["nodes"][0].get("desc", ""))


def test_parse_command_nonstring_argument_hint(tmp_path):
    # plugin parses frontmatter with real YAML, so argument-hint may be a
    # non-str scalar/list. parse_command must coerce via fm_str and not crash
    # on the heuristic large path (regression).
    path = _write_cmd(tmp_path, "weirdhint", """
        ---
        description: cmd with numeric hint
        argument-hint: 12345
        ---
        # 大きめコマンド

        ## 準備する
        下ごしらえをする。

        ## 取得する
        データを集める。

        ## 実行する
        本処理を走らせる。

        ## 検証する
        結果を確かめる。

        ## 後始末する
        片付けと通知。
    """)
    # must not raise on a non-string argument-hint
    flow = parser.parse_command(path, "user")
    assert flow["id"] == "cmd-weirdhint"
    assert flow["nodes"][0]["type"] == "user"
    trig = flow["nodes"][0]
    assert "12345" in (trig.get("subtitle", "") + trig.get("desc", ""))


def test_parse_command_large_bash_only(tmp_path):
    path = _write_cmd(tmp_path, "checks", """
        ---
        description: run checks
        ---
        まとめてチェックを走らせるコマンド。十分に長い説明文をここに置いておく。
        以下のコマンドを順番に実行する。結果は最後に報告する。
        コードの品質を保つために静的解析とテストを必ず実行する。
        リポジトリのルートで実行すること。エラーが出たら修正してから再実行する。
        CIと同じチェックをローカルで事前に確認するためのコマンドである。
        型チェック・lint・テストの三種類を順番に実施する。
        問題なく通過したらコミット・プッシュを行う。
        失敗した場合は詳細を確認して修正する。
        定期的に実行してコードベースの健全性を維持する。
        チームの全員がこのコマンドを使って品質を統一する。

        !`ruff check .`

        !`pytest -q`

        !`mypy server`
    """)
    flow = parser.parse_command(path, "user")
    code_nodes = [n for n in flow["nodes"] if n["type"] == "code"]
    cmds = " ".join(n.get("desc", "") for n in code_nodes)
    assert "ruff check ." in cmds
    assert "pytest -q" in cmds


# --- attach_kind command size-gate tests (Task 4) ---

def test_attach_kind_skips_small_command(tmp_path, monkeypatch):
    import parser_llm
    called = {"n": 0}
    async def _boom(*a, **k):
        called["n"] += 1
        return {"kind": 3, "label": "ruleset"}
    monkeypatch.setattr(parser_llm, "classify_skill_kind_cached_async", _boom)

    path = _write_cmd(tmp_path, "tiny", "---\ndescription: x\n---\nrun it.\n")
    flow = {"id": "cmd-tiny", "source": {"type": "command", "path": path}, "nodes": []}
    out = parser_llm.attach_kind(flow)
    assert "kind" not in out          # small command → not classified
    assert called["n"] == 0           # classifier never invoked


def test_attach_kind_classifies_large_command(tmp_path, monkeypatch):
    import parser_llm
    async def _stub(*a, **k):
        return {"kind": 3, "label": "ruleset"}
    monkeypatch.setattr(parser_llm, "classify_skill_kind_cached_async", _stub)

    big = "---\ndescription: x\n---\n" + ("ルール項目をたくさん並べる行。\n" * 20)
    path = _write_cmd(tmp_path, "rules", big)
    flow = {"id": "cmd-rules", "source": {"type": "command", "path": path}, "nodes": []}
    out = parser_llm.attach_kind(flow)
    assert out["kind"] == 3
    assert out["kind_label"] == "ruleset"
    assert "sections" in out          # kind>=3 attaches sections


# --- TEST A (Minor 5): steps win over bash in large command ---

def test_parse_command_steps_win_over_bash(tmp_path):
    """When a large command has both ## steps and !`inline bash`, the flow nodes
    come from the step headings (## titles), NOT from the bash lines."""
    path = _write_cmd(tmp_path, "hybrid", """
        ---
        description: hybrid command with steps and bash
        ---
        このコマンドはステップも持ち、インラインbashも含む大きなコマンド。
        ステップ構造があるときはステップが優先されbashは個別コードノードにならない。
        複数のステップを実行して最終的に結果をまとめる。

        ## 依存関係を確認する
        必要なパッケージがインストール済みか確認する。

        !`pip list`

        ## テストを実行する
        全テストスイートを実行して品質を確認する。

        !`pytest -q`

        ## レポートを生成する
        テスト結果のレポートを生成してまとめる。
    """)
    flow = parser.parse_command(path, "user")
    titles = [n["title"] for n in flow["nodes"]]
    types = [n["type"] for n in flow["nodes"]]

    # Steps from ## headings must appear as node titles
    assert "依存関係を確認する" in titles
    assert "テストを実行する" in titles
    assert "レポートを生成する" in titles

    # The flow ends with 結果報告
    assert flow["nodes"][-1]["title"] == "結果報告"

    # Total node count: user-trigger + 3 steps + 結果報告 = 5
    # Bash lines must NOT each become separate extra code nodes
    assert len(flow["nodes"]) == 5

    # First node is user trigger
    assert types[0] == "user"


# --- TEST B (Minor 6): large command with only prose → minimal 2-node flow ---

def test_parse_command_large_prose_only(tmp_path):
    """A command large enough to skip the stub (≥10 non-empty lines) but with only
    prose (no ## steps, no bash) should fall through to a minimal 2-node flow:
    [user-trigger, 結果報告]."""
    prose_lines = "\n".join(
        f"これは説明文の {i + 1} 行目である。コマンドの使い方を詳しく説明している。"
        for i in range(12)
    )
    path = _write_cmd(tmp_path, "prose_only", f"""
        ---
        description: prose only command
        ---
        {prose_lines}
    """)
    flow = parser.parse_command(path, "user")
    assert len(flow["nodes"]) == 2
    assert flow["nodes"][0]["type"] == "user"
    assert flow["nodes"][1]["title"] == "結果報告"
    assert flow["nodes"][1]["type"] == "parent"


# --- TEST C (Minor 7): extend large bash-only test to assert third command ---

def test_parse_command_large_bash_only_includes_third_cmd(tmp_path):
    """The large bash-only command must also expose the third command (mypy server)
    as a code node — not just ruff and pytest."""
    path = _write_cmd(tmp_path, "checks3", """
        ---
        description: run checks
        ---
        まとめてチェックを走らせるコマンド。十分に長い説明文をここに置いておく。
        以下のコマンドを順番に実行する。結果は最後に報告する。
        コードの品質を保つために静的解析とテストを必ず実行する。
        リポジトリのルートで実行すること。エラーが出たら修正してから再実行する。
        CIと同じチェックをローカルで事前に確認するためのコマンドである。
        型チェック・lint・テストの三種類を順番に実施する。
        問題なく通過したらコミット・プッシュを行う。
        失敗した場合は詳細を確認して修正する。
        定期的に実行してコードベースの健全性を維持する。
        チームの全員がこのコマンドを使って品質を統一する。

        !`ruff check .`

        !`pytest -q`

        !`mypy server`
    """)
    flow = parser.parse_command(path, "user")
    code_nodes = [n for n in flow["nodes"] if n["type"] == "code"]
    cmds = " ".join(n.get("desc", "") for n in code_nodes)
    assert "ruff check ." in cmds
    assert "pytest -q" in cmds
    assert "mypy server" in cmds


# --- TEST D (Minor 4): convention path — flow_version:1 command ---

def test_parse_command_convention_path(tmp_path):
    """A command with flow_version:1 is routed through parse_skill_convention.
    The returned flow must have id=cmd-<name>, category=Commands,
    source.type=command, and source must NOT contain 'parser' (FIX 3)."""
    body = textwrap.dedent("""\
        ---
        name: myconv
        flow_version: 1
        description: convention command test
        ---

        ## ステップA <!-- {think} -->
        最初のステップ。

        ## ステップB <!-- {code} -->
        二番目のステップ。
    """)
    path = tmp_path / "myconv.md"
    path.write_text(body, encoding="utf-8")

    flow = parser.parse_command(str(path), "user")

    assert flow["id"] == "cmd-myconv"
    assert flow["category"] == "Commands"
    assert flow["source"]["type"] == "command"
    assert "parser" not in flow["source"], (
        "source.parser leaked from parse_skill_convention — FIX 3 not applied"
    )
