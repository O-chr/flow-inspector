// JSON tag-block extraction (AI output). Phase 3 module — extracted from app.jsx.
// Robust extraction of a JSON value emitted inside a ```tag fenced block.
// String-aware balanced scan: inner ``` and braces/brackets inside string values
// no longer truncate it (the old /```tag\n([\s\S]*?)\n```/ regex did → silent data loss).
function fiBalancedJson(s) {
  if (!s) return null;
  let i0 = -1, open = "";
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === "{" || c === "[") { i0 = i; open = c; break; } }
  if (i0 < 0) return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = i0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) { if (--depth === 0) { try { return JSON.parse(s.slice(i0, i + 1)); } catch (e) { return null; } } }
  }
  return null;
}
export function extractTaggedJson(text, tag) {
  if (!text) return null;
  const m = text.match(new RegExp("```" + tag + "[ \\t]*\\r?\\n([\\s\\S]*)"));
  if (!m) return null;
  const v = fiBalancedJson(m[1]);
  if (v === null) console.warn("[flow-inspector] Could not parse the " + tag + " block in the AI output");
  return v;
}
