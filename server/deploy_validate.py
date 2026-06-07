"""claude -p によるデプロイ前検証 (差分スコープ)。

new ファイルは全体、modified は live↔staged の unified diff だけを claude -p に渡し、
`VERDICT: OK|ERROR` で判定させる。本文や push には関与しない純粋な検証層。
"""
from __future__ import annotations

import difflib
import re
from pathlib import Path

from explain import call_claude_cli

_VERDICT_RE = re.compile(r"VERDICT:\s*(OK|ERROR)", re.IGNORECASE)


def infer_file_type(path: str) -> str:
    name = Path(path).name
    p = path.replace("\\", "/")
    if name == "SKILL.md":
        return "skill"
    if name in ("CLAUDE.md", "CLAUDE.local.md"):
        return "claude_md"
    if name == "settings.json" or "/hooks" in p:
        return "hooks"
    if "/agents/" in p:
        return "agent"
    return "other"


_TYPE_LABEL = {
    "skill": "Claude Code スキル定義 (SKILL.md)",
    "agent": "Claude Code サブエージェント定義",
    "hooks": "Claude Code 設定/フック (settings.json)",
    "claude_md": "CLAUDE.md 指示ファイル",
    "other": "Claude Code 設定ファイル",
}


def build_validation_prompt(file_type: str, path: str, *, full_text: str = None,
                            diff_text: str = None) -> str:
    label = _TYPE_LABEL.get(file_type, _TYPE_LABEL["other"])
    if diff_text is not None:
        target = f"以下は既存ファイルへの変更 (unified diff) です:\n\n```diff\n{diff_text}\n```"
    else:
        target = f"以下はファイル全文です:\n\n```\n{full_text or ''}\n```"
    return (
        f"あなたは {label} の検証者です。対象ファイル: {path}\n"
        f"{target}\n\n"
        "この内容に、ファイルが壊れて動かなくなるような明確なエラー "
        "(frontmatter の構文崩れ、必須項目欠落、参照パスの明白な誤りなど) があるか判定してください。\n"
        "出力は必ず1行目に `VERDICT: OK` または `VERDICT: ERROR`、2行目以降に理由 (日本語・簡潔)。"
    )


def parse_verdict(raw: str) -> dict:
    m = _VERDICT_RE.search(raw or "")
    if not m:
        return {"ok": False, "message": "判定不能 (VERDICT 不明): " + (raw or "")[:200]}
    ok = m.group(1).upper() == "OK"
    after = (raw[m.end():] or "").strip()
    return {"ok": ok, "message": after or ("OK" if ok else "ERROR")}


async def validate_staged_file(entry: dict, *, timeout: float = 90.0,
                               model: str = "haiku") -> dict:
    """1 件の staged ファイルを claude -p で検証。{ok, message} を返す。

    claude 未検出/タイムアウト/異常終了は ok=False (未検証で push させない)。
    """
    path = entry["path"]
    staged_path = entry["staged_path"]
    status = entry.get("status")
    ftype = infer_file_type(path)
    # CLAUDE.md / CLAUDE.local.md are prose instruction docs — there is no syntax or
    # config that can "break"; the claude -p gate only adds latency + token cost and a
    # silent-block risk (a correct doc rejected on judge-format drift). Skip it so the
    # sync of a CLAUDE.md always pushes. (staging→push + user review still gate it.)
    if ftype == "claude_md":
        return {"ok": True, "message": "CLAUDE.md — 検証不要 (文書) のため push 許可"}
    try:
        if status == "modified" and Path(path).is_file():
            live_text = Path(path).read_text(encoding="utf-8", errors="replace")
            staged_text = Path(staged_path).read_text(encoding="utf-8", errors="replace")
            diff = "".join(difflib.unified_diff(
                live_text.splitlines(keepends=True),
                staged_text.splitlines(keepends=True),
                fromfile="live", tofile="staged", n=3,
            ))
            prompt = build_validation_prompt(ftype, path, diff_text=diff)
        else:
            staged_text = Path(staged_path).read_text(encoding="utf-8", errors="replace")
            prompt = build_validation_prompt(ftype, path, full_text=staged_text)
    except OSError as e:
        return {"ok": False, "message": f"ファイル読込失敗: {e}"}

    try:
        raw = await call_claude_cli(prompt, model=model, timeout=timeout)
    except RuntimeError as e:
        return {"ok": False, "message": f"claude -p 検証を実行できませんでした: {e}"}
    return parse_verdict(raw)
