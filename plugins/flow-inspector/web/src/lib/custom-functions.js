// Custom "my functions" — palette items saved to localStorage. Phase 3 lib module
// (extracted verbatim; shared by ElementsPalette and PlanWorkspace).
const CUSTOM_FN_KEY = "fi_custom_functions_v1";

export function loadCustomFunctions() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FN_KEY) || "[]"); }
  catch { return []; }
}
export function saveCustomFunctions(list) {
  try { localStorage.setItem(CUSTOM_FN_KEY, JSON.stringify(list)); } catch {}
}
export function addCustomFunction(fn) {
  const list = loadCustomFunctions();
  list.push(fn);
  saveCustomFunctions(list);
  // パレットや関連 UI に通知
  try { window.dispatchEvent(new CustomEvent("fi-custom-functions-changed")); } catch {}
}
export function removeCustomFunction(id) {
  const list = loadCustomFunctions().filter(fn => fn.id !== id);
  saveCustomFunctions(list);
  try { window.dispatchEvent(new CustomEvent("fi-custom-functions-changed")); } catch {}
}
// マイ関数 → パレット用 item に変換
export function buildMyFunctionsCatalog() {
  return loadCustomFunctions().map(fn => ({
    id: fn.id,
    type: fn.nodeType || "skill",  // パレット上の表示タイプ (custom はないのでデフォルト skill)
    title: fn.name,
    subtitle: fn.category || "マイ関数",
    desc: fn.description || "",
    cat: "マイ関数",
    meta: { custom: true, fnId: fn.id, items: fn.items, fnIcon: fn.icon, fnColor: fn.color },
  }));
}
