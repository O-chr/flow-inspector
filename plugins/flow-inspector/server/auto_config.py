"""AI auto-config — Claude Code CLI 経由でフローメタ or ノード設定値を推論

modes:
- "flow-meta": フロー全体の目的・入力物・出力物を推論 (H)
- "node-fields": 自然文の指示から特定ノードの設定フィールド値を推論 (F)

注意: subprocess は asyncio.create_subprocess_exec を使用 (引数リスト形式の安全な方式、
シェル経由ではない = コマンドインジェクション安全)。explain.py と同じパターン。
"""
import asyncio
import json
import os
import shutil
from pathlib import Path

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse


CLAUDE_BIN = (
    shutil.which("claude")
    or next((p for p in [
        os.path.expanduser("~/.claude/local/claude"),
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
    ] if os.path.isfile(p)), "claude")
)


def _format_node_summary(nodes):
    lines = []
    for i, n in enumerate(nodes):
        nid = n.get("id", f"N{i+1}")
        ntype = n.get("type") or n.get("nodeType") or "?"
        label = n.get("label") or n.get("title") or n.get("name") or ""
        lines.append(f"- {nid}: {ntype} / {label}")
    return "\n".join(lines) if lines else "(ノードなし)"


def _format_edges_summary(edges):
    if not edges:
        return "(接続なし)"
    parts = []
    for e in edges:
        f = e.get("from", "?")
        t = e.get("to", "?")
        lbl = e.get("label") or ""
        if lbl:
            parts.append(f"{f} --({lbl})-> {t}")
        else:
            parts.append(f"{f} -> {t}")
    return "\n".join(parts)


def _format_nodes_meta(nodes):
    lines = []
    for n in nodes:
        nid = n.get("id", "?")
        meta = n.get("meta") or {}
        if meta:
            meta_str = json.dumps(meta, ensure_ascii=False, indent=2)
            lines.append(f"### {nid}\n meta:\n{meta_str}")
    return "\n".join(lines) if lines else "(設定情報なし)"


def _build_flow_meta_prompt(payload):
    nodes = payload.get("nodes") or []
    edges = payload.get("edges") or []
    existing = payload.get("existing") or {}

    system = (
        "あなたは Claude Code ワークフロー設計エキスパートです。\n"
        "与えられたフローのノード構成 (ノード一覧 + 接続関係) から、\n"
        "このフロー全体が「何を目的としているか / 何を入力として受け取るか / 何を出力するか」を\n"
        "推測してください。\n\n"
        "出力フォーマット (JSON only, コードフェンス禁止):\n"
        "{\n"
        '  "purpose": "<フロー全体の目的、1〜3 文>",\n'
        '  "inputs": "<入力物、箇条書き or 文章>",\n'
        '  "outputs": "<出力物、箇条書き or 文章>",\n'
        '  "reasoning": "<なぜそう推測したか、1〜2 文>"\n'
        "}\n\n"
        "制約:\n"
        "- 平易な日本語で書く\n"
        "- 具体的に書く (抽象的すぎない)\n"
        "- 出力は JSON のみ。前置き・後書き・コードフェンス禁止"
    )

    nodes_summary = _format_node_summary(nodes)
    edges_summary = _format_edges_summary(edges)
    nodes_meta = _format_nodes_meta(nodes)

    user = (
        "## フローのノード一覧\n"
        f"{nodes_summary}\n\n"
        "## 接続関係\n"
        f"{edges_summary}\n\n"
        "## 各ノードの設定（参考）\n"
        f"{nodes_meta}\n\n"
        "## 既存メタ（あれば、より良い形に書き直してください）\n"
        f"- 既存 purpose: {existing.get('purpose', '')}\n"
        f"- 既存 inputs: {existing.get('inputs', '')}\n"
        f"- 既存 outputs: {existing.get('outputs', '')}\n"
    )

    return f"{system}\n\n---\n\n{user}"


def _build_node_fields_prompt(payload):
    """node-fields: 自然文の指示 + ノードの設定フィールド → 各フィールド値を推論。

    payload: {
      mode: "node-fields",
      instruction: "経理部にプロジェクト完了の報告を送る",
      node: { type, title, fields: [{key, label, type, value}] }
    }
    """
    instruction = (payload.get("instruction") or "").strip()
    node = payload.get("node") or {}
    ntype = node.get("type") or node.get("nodeType") or "?"
    title = node.get("title") or node.get("label") or ""
    fields = node.get("fields") or []

    field_lines = []
    for f in fields:
        key = f.get("key", "")
        label = f.get("label") or key
        ftype = f.get("type") or "text"
        val = f.get("value") or ""
        status = f"現在値: {val}" if val else "(空欄)"
        field_lines.append(f'- {key} ("{label}", {ftype}型): {status}')
    fields_str = "\n".join(field_lines) if field_lines else "(フィールドなし)"

    system = (
        "あなたは Claude Code のノード設定を埋めるアシスタントです。\n"
        "ユーザーの指示に沿って、このノードの設定フィールドの値を生成してください。\n\n"
        "ルール:\n"
        "- 空欄のフィールドを優先して埋める。現在値があるフィールドは、指示で明示的に\n"
        "  変更を求められた場合のみ上書きし、そうでなければ現在値を維持する (省略する)\n"
        "- 各フィールドの型 (text / long 等) と用途に合った自然な値を入れる\n"
        "- 平易で具体的に。プレースホルダ ([名前] / xxx 等) は避け、指示から妥当な値を作る\n\n"
        "出力フォーマット (JSON only, コードフェンス禁止):\n"
        "{\n"
        '  "fields": { "<key>": "<value>", ... },\n'
        '  "reasoning": "<どう埋めたか 1〜2 文>"\n'
        "}\n"
        "- fields には埋める / 更新するフィールドの key のみ含める (維持するものは省略)\n"
        "- 出力は JSON のみ。前置き・後書き・コードフェンス禁止"
    )
    user = (
        f"## ノード\n- タイプ: {ntype}\n- 名前: {title}\n\n"
        f"## 設定フィールド\n{fields_str}\n\n"
        f"## ユーザーの指示\n{instruction}\n"
    )
    return f"{system}\n\n---\n\n{user}"


def _build_prompt(payload):
    mode = payload.get("mode", "flow-meta")
    if mode == "flow-meta":
        return _build_flow_meta_prompt(payload)
    if mode == "node-fields":
        return _build_node_fields_prompt(payload)
    raise ValueError(f"unknown mode: {mode}")


async def _call_claude_cli(prompt, model="sonnet"):
    if not CLAUDE_BIN or not Path(CLAUDE_BIN).exists():
        raise RuntimeError(f"claude CLI not found: {CLAUDE_BIN}")
    proc = await asyncio.create_subprocess_exec(
        CLAUDE_BIN, "-p", prompt,
        "--model", model,
        "--output-format", "text",
        "--tools", "",   # 設定推薦の生成のみ。ツール不要＝儀式ノイズ抑制
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ},
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("claude CLI timeout (120s)")
    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"claude CLI error code={proc.returncode}: {err[:200]}")
    return stdout.decode("utf-8", errors="replace").strip()


def _strip_code_fence(text):
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


async def handle_auto_config_request(req: Request):
    try:
        payload = await req.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid json")

    try:
        prompt = _build_prompt(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        text = await _call_claude_cli(prompt, model="sonnet")
    except Exception as e:
        return JSONResponse({"error": f"claude CLI failed: {e}"}, status_code=500)

    text = _strip_code_fence(text)
    try:
        result = json.loads(text)
    except json.JSONDecodeError as e:
        return JSONResponse(
            {"error": f"AI 応答が JSON でなかった: {e}", "raw": text[:500]},
            status_code=500
        )

    return result
