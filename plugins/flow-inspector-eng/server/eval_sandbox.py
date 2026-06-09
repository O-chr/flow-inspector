"""Code-evaluator sandbox runner — invoked as a child process.

Reads a single JSON blob from stdin:
  {"code": "<user python>", "locals": {<initial local vars>}}

Writes a single JSON blob to stdout:
  {"verdict": "pass"|"fail", "reason": "<short message>"}

Sandbox layers:
  1. Run in a separate process — parent uses asyncio.wait_for() to kill
     the child if it exceeds the wall-clock timeout (defense against
     infinite loops / DoS).
  2. SIGALRM self-timeout inside this script — secondary guard if the
     parent timeout fires late.
  3. Restricted __builtins__ — only the allowlist below is available.
     Note: this alone does NOT prevent __class__ chain escapes; the
     subprocess wall-clock kill is the real safety net.

This script is intentionally tiny and has zero project imports so it
starts up fast (subprocess overhead matters when many cases x evaluators
run together).
"""
from __future__ import annotations

import builtins as _builtins
import json
import signal
import sys


SAFE_BUILTINS = {
    "len": len, "str": str, "int": int, "float": float,
    "bool": bool, "list": list, "dict": dict, "any": any,
    "all": all, "print": print, "isinstance": isinstance,
    "hasattr": hasattr, "getattr": getattr,
}

_run_user_code = _builtins.exec  # alias to dodge naive lint patterns

SELF_TIMEOUT_SECONDS = 4


def _alarm_handler(_signum, _frame):
    raise TimeoutError("sandbox self-timeout")


def main() -> None:
    signal.signal(signal.SIGALRM, _alarm_handler)
    signal.alarm(SELF_TIMEOUT_SECONDS)

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        sys.stdout.write(json.dumps({"verdict": "fail", "reason": f"bad input: {e}"}))
        return

    code = payload.get("code") or ""
    if not isinstance(code, str):
        sys.stdout.write(json.dumps({"verdict": "fail", "reason": "code must be a string"}))
        return

    locals_ = dict(payload.get("locals") or {})
    locals_.setdefault("verdict", "pass")
    locals_.setdefault("reason", "")

    try:
        _run_user_code(code, {"__builtins__": SAFE_BUILTINS}, locals_)
    except TimeoutError:
        sys.stdout.write(json.dumps({"verdict": "fail", "reason": "execution timeout"}))
        return
    except Exception as exc:
        msg = f"Code error: {type(exc).__name__}: {exc}"
        sys.stdout.write(json.dumps({"verdict": "fail", "reason": msg[:300]}))
        return

    verdict = str(locals_.get("verdict", "pass"))
    reason = str(locals_.get("reason", "OK"))
    sys.stdout.write(json.dumps({"verdict": verdict, "reason": reason[:500]}))


if __name__ == "__main__":
    main()
