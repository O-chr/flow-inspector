// Node type registry (also published on window.NODE_TYPES). Phase 3 module.
// ══════════ DATA ══════════
export const NODE_TYPES = {
  parent:   { label: "親エージェント",   color: "var(--c-parent)",   bg: "var(--c-parent-bg)",   shape: "card", icon: "◆" },
  subagent: { label: "サブエージェント", color: "var(--c-subagent)", bg: "var(--c-subagent-bg)", shape: "card", icon: "◇" },
  think:    { label: "Claude呼び出し",   color: "var(--c-think)",    bg: "var(--c-think-bg)",    shape: "card", icon: "💭" },
  mcp:      { label: "MCP連携",         color: "var(--c-mcp)",      bg: "var(--c-mcp-bg)",      shape: "card", icon: "↗" },
  hook:     { label: "フック",           color: "var(--c-hook)",     bg: "var(--c-hook-bg)",     shape: "card", icon: "⌘" },
  code:     { label: "コード実行",       color: "var(--c-code)",     bg: "var(--c-code-bg)",     shape: "card", icon: "▷" },
  user:     { label: "ユーザー操作",     color: "var(--c-user)",     bg: "var(--c-user-bg)",     shape: "card", icon: "○" },
  decision: { label: "分岐判定",         color: "var(--c-decision)", bg: "var(--c-decision-bg)", shape: "diamond", icon: "?" },
  skill:    { label: "スキル",           color: "var(--c-skill)",    bg: "var(--c-skill-bg)",    shape: "card", icon: "★" },
  command:  { label: "コマンド",         color: "var(--c-command)",  bg: "var(--c-command-bg)",  shape: "card", icon: "/" },
  config:   { label: "設定",             color: "var(--c-config)",   bg: "var(--c-config-bg)",   shape: "card", icon: "⚙" },
  api:      { label: "API",              color: "var(--c-api)",      bg: "var(--c-api-bg)",      shape: "card", icon: "⇄" },
  plugin:   { label: "プラグイン",       color: "var(--c-plugin)",   bg: "var(--c-plugin-bg)",   shape: "card", icon: "⚡" },
  agentsdk: { label: "Agent SDK",        color: "var(--c-agentsdk)", bg: "var(--c-agentsdk-bg)", shape: "card", icon: "⊞" },
  trigger:  { label: "トリガー",         color: "#d97706",           bg: "rgba(217,119,6,0.10)", shape: "card", icon: "▶" },
  // 編集モードで group (マイ関数 / グループ) を RightPanel に表示するための合成エントリ。
  // 実フロー (workflow.nodes) には現れず、PlanWorkspace の board.items にのみ存在する。
  group:    { label: "マイ関数 / グループ", color: "#7c3aed", bg: "rgba(124,58,237,0.10)", shape: "card", icon: "🧩" },
};

window.NODE_TYPES = NODE_TYPES;
