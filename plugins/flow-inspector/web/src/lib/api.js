// HTTP helpers for same-origin /api calls.
// Phase 3 module — mechanically extracted from app.jsx (logic unchanged).
export const API = ""  // same origin (some streaming call sites use `fetch(API + …)` directly)

export async function apiFetch(path) { const r = await fetch(API + path); if (!r.ok) throw new Error(r.statusText); return r.json(); }
export async function apiPatch(path, body) { const r = await fetch(API + path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }
export async function apiPost(path, body) { const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); }
export async function apiPut(path, body) {
  const r = await fetch(API + path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}
export async function apiDelete(path) { const r = await fetch(API + path, { method: "DELETE" }); return r.json(); }
