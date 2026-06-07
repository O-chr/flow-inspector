"""Tests for eval_judge.build_judge_prompt.

The LLM judge prompt used by ``run_eval`` is built here so it can be unit
tested without spinning up a subprocess. Step 2 of the Eval-safe-execution
work (``docs/superpowers/specs/2026-06-05-eval-safe-execution-design.md``)
adds an ``actual_output`` slot: when the flow has actually been run its real
output is judged; when it has not, the prompt says so explicitly.
"""
from __future__ import annotations

from eval_judge import build_judge_prompt


def test_prompt_includes_flow_case_and_criteria():
    case = {"title": "T", "input_text": "IN", "expected": "EXP"}
    p = build_judge_prompt("FLOWDESC", case, "CRITERIA")
    assert "FLOWDESC" in p
    assert "IN" in p
    assert "EXP" in p
    assert "CRITERIA" in p
    assert '"verdict"' in p  # still asks for the JSON verdict


def test_prompt_without_output_marks_not_executed():
    case = {"title": "T", "input_text": "IN", "expected": "EXP"}
    p = build_judge_prompt("FLOWDESC", case, "CRITERIA")
    assert "まだ実行されていません" in p


def test_prompt_with_output_includes_real_output_and_drops_not_executed():
    case = {"title": "T", "input_text": "IN", "expected": "EXP"}
    p = build_judge_prompt("FLOWDESC", case, "CRITERIA",
                           actual_output="REAL_RESULT_TEXT")
    assert "REAL_RESULT_TEXT" in p
    assert "実際の出力" in p
    assert "まだ実行されていません" not in p


def test_prompt_supports_legacy_case_keys():
    # run_eval accepts both new (title/input_text) and old (name/input) shapes.
    case = {"name": "T", "input": "LEGACY_IN", "expected": "EXP"}
    p = build_judge_prompt("F", case, "C")
    assert "LEGACY_IN" in p


def test_prompt_expected_defaults_when_missing():
    p = build_judge_prompt("F", {"title": "T", "input_text": "IN"}, "C")
    assert "(未定義)" in p


# --- 穴1: 一貫性・厳密さのルーブリック（verdict のブレ防止）-----------------

def test_prompt_has_consistency_rubric_both_modes():
    case = {"title": "T", "input_text": "IN", "expected": "EXP"}
    for ao in (None, "REAL_OUTPUT"):
        p = build_judge_prompt("F", case, "C", actual_output=ao)
        assert "厳密" in p          # 厳密に判定するよう指示
        assert "FAIL" in p          # 迷ったら FAIL の指針
        assert "根拠" in p          # 理由は根拠を挙げる


# --- 穴2: 安全ゲートでブロックされた操作を judge に伝える -------------------

def test_prompt_notes_blocked_ops_when_given():
    case = {"title": "T", "input_text": "IN", "expected": "EXP"}
    p = build_judge_prompt("F", case, "C", actual_output="OUT",
                           blocked_ops=[{"tool_name": "mcp__gmail__send_message"}])
    assert "mcp__gmail__send_message" in p
    assert "未実行" in p   # 未実行が原因かを区別させる指示


def test_prompt_no_block_section_without_blocked_ops():
    case = {"title": "T", "input_text": "IN", "expected": "EXP"}
    p = build_judge_prompt("F", case, "C", actual_output="OUT")
    assert "ブロックされた操作" not in p  # 後方互換: 無ければ節を出さない
