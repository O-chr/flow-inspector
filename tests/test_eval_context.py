"""Tests for eval_context.build_eval_analysis_context.

The Eval "分析・相談" chat used to receive only the flow skeleton plus pass/fail
tallies and case *titles* — so it had to ask the user to paste evaluator prompts
and the expected-vs-actual. This formatter injects the actual content (evaluator
prompts/code, case input+expected, and the latest run's real output + per-
evaluator fail reasons) so the chat can reason about it directly.
"""
from __future__ import annotations

from eval_context import build_eval_analysis_context


_EVALUATORS = [
    {"id": "ev1", "name": "全フォルダ網羅", "type": "llm",
     "prompt": "出力に全フォルダが1行ずつ用途付きで含まれるか"},
    {"id": "ev2", "name": "プレースホルダ禁止", "type": "code",
     "code": "verdict = 'fail' if 'TODO' in case_expected else 'pass'"},
]
_CASES = [
    {"id": "c1", "title": "素直な中規模リポジトリ（基本）",
     "input_text": "api/ static/ flows/ docs/", "expected": "4フォルダ全てに用途"},
]
_RUN = {
    "version_label": "v1", "passed": 0, "failed": 1, "total": 1,
    "results": [{
        "case_title": "素直な中規模リポジトリ（基本）", "pass": False,
        "executed": True, "actual_output": "用途マップを生成しました…",
        "blocked_ops": [{"tool_name": "Write"}],
        "evaluator_results": [
            {"evaluator_name": "全フォルダ網羅", "verdict": "pass", "reason": "4つ揃っている"},
            {"evaluator_name": "既存非破壊", "verdict": "fail", "reason": "マーカー外を書こうとした"},
        ],
    }],
}


def test_includes_evaluator_prompt_body():
    out = build_eval_analysis_context(_EVALUATORS, _CASES, None)
    assert "出力に全フォルダが1行ずつ用途付きで含まれるか" in out


def test_includes_code_evaluator_body():
    out = build_eval_analysis_context(_EVALUATORS, _CASES, None)
    assert "verdict = 'fail' if 'TODO' in case_expected" in out


def test_includes_case_input_and_expected():
    out = build_eval_analysis_context(_EVALUATORS, _CASES, None)
    assert "api/ static/ flows/ docs/" in out
    assert "4フォルダ全てに用途" in out


def test_includes_evaluator_ids_for_apply_targeting():
    # The chat needs the evaluator id to propose an editable change to it.
    out = build_eval_analysis_context(_EVALUATORS, _CASES, None)
    assert "ev1" in out and "c1" in out


def test_includes_latest_run_fail_reason():
    out = build_eval_analysis_context(_EVALUATORS, _CASES, _RUN)
    assert "マーカー外を書こうとした" in out


def test_includes_actual_output_and_blocked_when_executed():
    out = build_eval_analysis_context(_EVALUATORS, _CASES, _RUN)
    assert "用途マップを生成しました" in out
    assert "Write" in out


def test_handles_empty_gracefully():
    assert build_eval_analysis_context([], [], None) == ""
