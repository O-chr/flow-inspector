"""Tests for eval_sandbox: the restricted-builtins subprocess code runner.

``eval_sandbox.py`` is a standalone script with a JSON-over-stdio protocol:

    stdin  <- {"code": <python str>, "locals": {<initial vars>}}
    stdout -> {"verdict": "pass"|"fail", "reason": <short str>}

Safety layers (per the module docstring):
  * restricted ``__builtins__`` (only an allowlist) — ``import``/``open``/etc.
    are unavailable, so referencing them raises and is reported as a fail;
  * a SIGALRM self-timeout (``SELF_TIMEOUT_SECONDS`` = 4s) that kills a runaway
    evaluator and returns ``{"verdict": "fail", "reason": "execution timeout"}``.

We drive the script via ``subprocess`` since that is how ``main.py`` runs it.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

import eval_sandbox

SCRIPT = Path(eval_sandbox.__file__).resolve()


def _invoke(payload, timeout: float = 15.0) -> dict:
    proc = subprocess.run(
        [sys.executable, str(SCRIPT)],
        input=payload if isinstance(payload, str) else json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return json.loads(proc.stdout)


class TestVerdictWiring:
    def test_pass_verdict(self):
        out = _invoke({"code": "verdict = 'pass' if value > 5 else 'fail'\nreason = 'big enough'",
                       "locals": {"value": 10}})
        assert out == {"verdict": "pass", "reason": "big enough"}

    def test_fail_verdict(self):
        out = _invoke({"code": "verdict = 'fail'\nreason = 'too small'",
                       "locals": {"value": 1}})
        assert out == {"verdict": "fail", "reason": "too small"}

    def test_defaults_to_pass_when_unset(self):
        # locals seed verdict='pass', reason='' by default.
        out = _invoke({"code": "x = 1"})
        assert out == {"verdict": "pass", "reason": ""}

    def test_locals_are_injected(self):
        out = _invoke({"code": "verdict = 'pass' if total == 42 else 'fail'",
                       "locals": {"total": 42}})
        assert out["verdict"] == "pass"


class TestAllowedBuiltins:
    def test_len_all_isinstance_available(self):
        out = _invoke({
            "code": "verdict = 'pass' if len(items) == 3 and all(isinstance(x, str) for x in items) else 'fail'",
            "locals": {"items": ["a", "b", "c"]},
        })
        assert out["verdict"] == "pass"

    def test_dict_str_int_available(self):
        out = _invoke({"code": "verdict = 'pass' if str(int('7')) == '7' else 'fail'"})
        assert out["verdict"] == "pass"


class TestBlockedBuiltins:
    @pytest.mark.parametrize(
        "code",
        [
            "import os",
            "__import__('os')",
            "open('somefile')",
            "x = eval('1+1')",
            "exec('y = 1')",
            "compile('1', '<s>', 'eval')",
            "x = __builtins__['__import__']",
        ],
    )
    def test_dangerous_names_fail(self, code):
        # The restricted namespace omits these, so they raise inside the sandbox
        # and the script reports a fail (it never crashes / never returns pass).
        out = _invoke({"code": code})
        assert out["verdict"] == "fail"
        assert "error" in out["reason"].lower() or "not" in out["reason"].lower()


class TestProtocolEdgeCases:
    def test_malformed_input_is_fail(self):
        out = _invoke("this is not json")
        assert out["verdict"] == "fail"
        assert "bad input" in out["reason"]

    def test_non_string_code_is_fail(self):
        out = _invoke({"code": 123})
        assert out["verdict"] == "fail"

    def test_runtime_error_reported_as_fail(self):
        out = _invoke({"code": "raise ValueError('boom')"})
        assert out["verdict"] == "fail"
        assert "ValueError" in out["reason"]


class TestTimeout:
    def test_infinite_loop_killed_by_self_timeout(self):
        """A runaway loop is killed by the in-script SIGALRM watchdog (~4s) and
        reported as a timeout fail — the script returns rather than hanging."""
        import time

        start = time.monotonic()
        # Parent timeout is generous; the script's own 4s alarm should fire first.
        out = _invoke({"code": "\nwhile True:\n    pass"}, timeout=15.0)
        elapsed = time.monotonic() - start
        assert out == {"verdict": "fail", "reason": "execution timeout"}
        # Self-timeout is 4s; assert it fired in a bounded window (not instant,
        # not the full parent budget).
        assert elapsed < 10.0
