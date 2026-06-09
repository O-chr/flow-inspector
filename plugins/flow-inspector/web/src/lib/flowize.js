// Lazy on-demand flowize — module-level job store + polling.
//
// 「▶ フロー化」を押すと裏ジョブが走る。状態はここ(モジュールレベル)に持つので、
// ダッシュボードを離れて別ページへ行って戻ってもバッジ/「見る」が残る
// (React component state ではなくモジュール state = ページ存続中ずっと生きる)。
//
// サーバ契約:
//   POST /api/flows/{id}/flowize  -> {job_id, status:"running"}（即返し）
//   GET  /api/flowize/status?ids=a,b -> {jobs:{id:{status,kind,view,error}}}
import { useState, useEffect } from 'react'
import { apiFetch, apiPost } from './api.js'

// id -> { status:"idle"|"running"|"done"|"failed", kind?:1-4|null, view?:"flow"|"card"|null, error?:string|null }
const jobs = {}
const listeners = new Set()      // 購読中の hook（再描画トリガ）
const completeCbs = new Set()    // 「running -> done/failed」遷移の通知先（ベル更新用）
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
  } catch (e) { return; }  // 一時的なエラーは次の tick で再試行
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

// フロー化ジョブを起動（楽観的に running 表示）。再クリック中（running）は無視。
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
      pollOnce();  // キャッシュ即 done のケースを早めに拾う
    } else {
      // 400(managed等) は apiPost が throw しないので detail を拾って失敗扱い
      setJob(id, { status: "failed", error: (r && r.detail) || "フロー化に失敗しました" });
    }
  } catch (e) {
    setJob(id, { status: "failed", error: String((e && e.message) || e) });
  }
}

// 「running -> done/failed」遷移時に呼ばれる購読（App がベル通知の再取得に使う）。
export function onFlowizeComplete(fn) {
  completeCbs.add(fn);
  return () => completeCbs.delete(fn);
}

// React hook: ストア更新で再描画する。返り値は id->job のマップ（参照は安定）。
export function useFlowizeJobs() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return jobs;
}
