// Small shared UI helpers. Phase 3 lib module (extracted verbatim from app.jsx).
import React from 'react'

export function formatJSON(obj) { return JSON.stringify(obj, null, 2); }

export function Section({ label, children, dense }) {
  return (<div className={`d-section ${dense ? "is-dense" : ""}`}><div className="d-section-label">{label}</div>{children}</div>);
}
