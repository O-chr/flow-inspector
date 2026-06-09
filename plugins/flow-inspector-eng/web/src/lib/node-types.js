// Node type registry (also published on window.NODE_TYPES). Phase 3 module.
// ══════════ DATA ══════════
export const NODE_TYPES = {
  parent:   { label: "Parent agent",     color: "var(--c-parent)",   bg: "var(--c-parent-bg)",   shape: "card", icon: "◆" },
  subagent: { label: "Subagent",         color: "var(--c-subagent)", bg: "var(--c-subagent-bg)", shape: "card", icon: "◇" },
  think:    { label: "Claude call",      color: "var(--c-think)",    bg: "var(--c-think-bg)",    shape: "card", icon: "💭" },
  mcp:      { label: "MCP call",         color: "var(--c-mcp)",      bg: "var(--c-mcp-bg)",      shape: "card", icon: "↗" },
  hook:     { label: "Hook",             color: "var(--c-hook)",     bg: "var(--c-hook-bg)",     shape: "card", icon: "⌘" },
  code:     { label: "Code",             color: "var(--c-code)",     bg: "var(--c-code-bg)",     shape: "card", icon: "▷" },
  user:     { label: "User input",       color: "var(--c-user)",     bg: "var(--c-user-bg)",     shape: "card", icon: "○" },
  decision: { label: "Branch/decision",  color: "var(--c-decision)", bg: "var(--c-decision-bg)", shape: "diamond", icon: "?" },
  skill:    { label: "Skill",            color: "var(--c-skill)",    bg: "var(--c-skill-bg)",    shape: "card", icon: "★" },
  command:  { label: "Command",          color: "var(--c-command)",  bg: "var(--c-command-bg)",  shape: "card", icon: "/" },
  config:   { label: "Settings",         color: "var(--c-config)",   bg: "var(--c-config-bg)",   shape: "card", icon: "⚙" },
  api:      { label: "API",              color: "var(--c-api)",      bg: "var(--c-api-bg)",      shape: "card", icon: "⇄" },
  plugin:   { label: "Plugin",           color: "var(--c-plugin)",   bg: "var(--c-plugin-bg)",   shape: "card", icon: "⚡" },
  agentsdk: { label: "Agent SDK",        color: "var(--c-agentsdk)", bg: "var(--c-agentsdk-bg)", shape: "card", icon: "⊞" },
  trigger:  { label: "Trigger",          color: "#d97706",           bg: "rgba(217,119,6,0.10)", shape: "card", icon: "▶" },
  // Synthetic entry used to show a group (My Functions / group) in the RightPanel
  // while in edit mode. It never appears in the real flow (workflow.nodes) — it
  // only lives in PlanWorkspace's board.items.
  group:    { label: "My function / group", color: "#7c3aed", bg: "rgba(124,58,237,0.10)", shape: "card", icon: "🧩" },
};

window.NODE_TYPES = NODE_TYPES;
