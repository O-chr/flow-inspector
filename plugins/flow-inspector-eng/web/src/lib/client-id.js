// Per-tab client id. Phase 3 module — extracted from app.jsx.
// Stable per-tab client id, used in Phase B PUT /api/drafts to mark which UI
// session wrote a given save. Phase C will use this for last-writer-wins detection.
export function getClientId() {
  let cid = sessionStorage.getItem("fi_client_id");
  if (!cid) {
    cid = "ui-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    try { sessionStorage.setItem("fi_client_id", cid); } catch {}
  }
  return cid;
}
