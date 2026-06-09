"""Deploy オーケストレーション: staged 差分 → claude -p 検証 → OK だけ push → 通知記録。

WorkspaceManager はダックタイプ (list_staged_files / push_files のみ使用) なのでテスト容易。
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from deploy_validate import validate_staged_file, infer_file_type


async def run_deploy(ws, notif_store, *, paths=None, concurrency: int = 4,
                     timeout: float = 90.0) -> dict:
    staged = [s for s in ws.list_staged_files() if s.get("status") in ("new", "modified")]
    if paths is not None:
        wanted = set(paths)
        staged = [s for s in staged if s["path"] in wanted]
    if not staged:
        return {"pushed": [], "failed": [], "skipped": []}

    sem = asyncio.Semaphore(concurrency)

    async def _validate(entry):
        async with sem:
            try:
                return entry, await validate_staged_file(entry, timeout=timeout)
            except Exception as exc:  # 1 ファイルの想定外例外でバッチ全体を巻き込まない
                return entry, {"ok": False, "message": f"検証中に予期せぬ例外: {exc}"}

    results = await asyncio.gather(*[_validate(e) for e in staged])
    ok_entries = [e for e, v in results if v["ok"]]
    bad = [(e, v) for e, v in results if not v["ok"]]

    push_res = ws.push_files(paths=[e["path"] for e in ok_entries]) if ok_entries else \
        {"pushed": [], "skipped": [], "backup_dir": None}
    pushed_paths = {p["path"] for p in push_res.get("pushed", [])}
    skipped_paths = {s["path"]: s.get("reason", "skipped") for s in push_res.get("skipped", [])}

    pushed, failed, skipped = [], [], []
    for e in ok_entries:
        if e["path"] in pushed_paths:
            notif_store.append({"path": e["path"], "name": _name(e), "type": _type(e),
                                "status": "success",
                                "detail": f"反映完了 (backup: {push_res.get('backup_dir')})"})
            pushed.append({"path": e["path"]})
        else:
            reason = skipped_paths.get(e["path"], "push でスキップ")
            notif_store.append({"path": e["path"], "name": _name(e), "type": _type(e),
                                "status": "skipped", "detail": reason})
            skipped.append({"path": e["path"], "reason": reason})
    for e, v in bad:
        notif_store.append({"path": e["path"], "name": _name(e), "type": _type(e),
                            "status": "error", "detail": v["message"]})
        failed.append({"path": e["path"], "message": v["message"]})

    return {"pushed": pushed, "failed": failed, "skipped": skipped}


def _name(entry: dict) -> str:
    p = Path(entry["path"])
    return p.parent.name if p.name == "SKILL.md" else p.name


def _type(entry: dict) -> str:
    return infer_file_type(entry["path"])
