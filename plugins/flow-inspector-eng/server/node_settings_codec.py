"""ノード設定値 (meta) ⇄ SKILL.md の `fi-settings` コメント文字列 の相互変換。

SKILL.md には本文 (desc) しか保存されず、設定値 (宛先/件名/本文/tool 等) が
リロードで消える問題を解消するため、各ステップ見出し直下に
`<!-- fi-settings: {json} -->` の 1 行で meta を埋め込む。

表示・構造用のキー (io / subflow / inner_flow 等) は保存対象から除外する
(再生成可能、または構造マーカー側で管理されるため)。
"""
from __future__ import annotations

import json
import re

# 保存しない (表示・構造・再生成可能) キー
EXCLUDED_KEYS = {
    "io", "subflow", "inner_flow", "depends", "input", "output",
    "duration", "io_desc", "ai_explain", "builtin", "capability",
}

_PREFIX = "<!-- fi-settings: "
_SUFFIX = " -->"
_LINE_RE = re.compile(r"^\s*<!--\s*fi-settings:\s*(\{.*\})\s*-->\s*$")


def _persistable(meta: dict) -> dict:
    """保存対象の設定値だけを抜き出す (除外キーと空値を除く)。"""
    out = {}
    for k, v in (meta or {}).items():
        if k in EXCLUDED_KEYS:
            continue
        if v is None or v == "" or v == [] or v == {}:
            continue
        out[k] = v
    return out


def encode_settings_comment(meta: dict) -> str | None:
    """meta から fi-settings コメント 1 行を作る。保存値が無ければ None。"""
    data = _persistable(meta)
    if not data:
        return None
    body = json.dumps(data, ensure_ascii=False, separators=(", ", ": "), sort_keys=True)
    return f"{_PREFIX}{body}{_SUFFIX}"


def parse_settings_comment(line: str) -> dict | None:
    """fi-settings コメント行を meta dict に戻す。該当しなければ None。"""
    if not line:
        return None
    m = _LINE_RE.match(line)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    return data
