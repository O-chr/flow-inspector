// Lazy on-demand flowize — module-level job store + polling.
//
// Pressing "▶ Flowize" kicks off a background job. State lives here (at module
// level), so the badge / "View" link survives leaving the dashboard, navigating
// to another page, and coming back (module state — not React component state —
// stays alive for the whole lifetime of the page).
//
// Server contract:
//   POST /api/flows/{id}/flowize  -> {job_id, status:"running"} (returns immediately)
//   GET  /api/flowize/status?ids=a,b -> {jobs:{id:{status,kind,view,error}}}
import { useState, useEffect } from 'react'
import { apiFetch, apiPost } from './api.js'

// id -> { status:"idle"|"running"|"done"|"failed", kind?:1-4|null, view?:"flow"|"card"|null, error?:string|null }
const jobs = {}
const listeners = new Set()      // subscribed hooks (re-render trigger)
const completeCbs = new Set()    // notified on "running -> done/failed" transitions (for bell updates)
let pollTimer = null

function emit() { listeners.forEach(fn => { try { fn() } catch (e) {} }); }

function setJob(id, patch) {
  jobs[id] = { ...(jobs[id] || {}), ...patch };
  emit();
}

export function getJob(id) { return jobs[id]; }

function runningIds() {
  return Object.keys(jobs).filter(id => jobs[id] && jobs[id].status === "running");
}

async function pollOnce() {
  const ids = runningIds();
  if (ids.length === 0) { stopPolling(); return; }
  let data;
  try {
    data = await apiFetch(`/api/flowize/status?ids=${encodeURIComponent(ids.join(","))}`);
  } catch (e) { return; }  // retry transient errors on the next tick
  const map = (data && data.jobs) || {};
  let completed = false;
  Object.keys(map).forEach(id => {
    const j = map[id];
    if (!j) return;
    const prev = jobs[id];
    jobs[id] = { status: j.status, kind: j.kind, view: j.view, error: j.error };
    if (prev && prev.status === "running" && (j.status === "done" || j.status === "failed")) {
      completed = true;
    }
  });
  emit();
  if (completed) completeCbs.forEach(fn => { try { fn() } catch (e) {} });
  if (runningIds().length === 0) stopPolling();
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollOnce, 2500);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// Start a flowize job (optimistically shows "running"). Ignored while already running (re-click).
export async function startFlowize(id, opts = {}) {
  if (!id) return;
  const cur = jobs[id];
  if (cur && cur.status === "running") return;
  setJob(id, { status: "running", kind: null, view: null, error: null });
  startPolling();
  try {
    const r = await apiPost(`/api/flows/${encodeURIComponent(id)}/flowize`, opts.force ? { force: true } : {});
    if (r && (r.status === "running" || r.status === "done")) {
      if (r.status) setJob(id, { status: r.status });
      pollOnce();  // catch the cache-hit "done immediately" case early
    } else {
      // 400 (managed, etc.) doesn't throw in apiPost, so read detail and treat it as a failure
      setJob(id, { status: "failed", error: (r && r.detail) || "Flowize failed" });
    }
  } catch (e) {
    setJob(id, { status: "failed", error: String((e && e.message) || e) });
  }
}

// Subscribe to "running -> done/failed" transitions (App uses this to refetch bell notifications).
export function onFlowizeComplete(fn) {
  completeCbs.add(fn);
  return () => completeCbs.delete(fn);
}

// React hook: re-renders on store updates. Returns the id->job map (stable reference).
export function useFlowizeJobs() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return jobs;
}
