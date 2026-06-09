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
  // Notify the palette and related UI
  try { window.dispatchEvent(new CustomEvent("fi-custom-functions-changed")); } catch {}
}
export function removeCustomFunction(id) {
  const list = loadCustomFunctions().filter(fn => fn.id !== id);
  saveCustomFunctions(list);
  try { window.dispatchEvent(new CustomEvent("fi-custom-functions-changed")); } catch {}
}
// My functions → convert to palette items
export function buildMyFunctionsCatalog() {
  return loadCustomFunctions().map(fn => ({
    id: fn.id,
    type: fn.nodeType || "skill",  // display type in the palette (no "custom" type, so default to skill)
    title: fn.name,
    subtitle: fn.category || "My Functions",
    desc: fn.description || "",
    cat: "My Functions",
    meta: { custom: true, fnId: fn.id, items: fn.items, fnIcon: fn.icon, fnColor: fn.color },
  }));
}
