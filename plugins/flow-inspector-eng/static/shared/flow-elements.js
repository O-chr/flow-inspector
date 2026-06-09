/**
 * Flow Inspector — Shared Element Design System
 *
 * Master definition: finalized in 8093 (whiteboard) → referenced by 8092/8091
 * Bundled with the plugin on distribution.
 *
 * Contains:
 *   - NODE_TYPES (NT): colors, labels, and icons for all node types
 *   - CSS Variables: theme color definitions
 *   - shapeMeta(): type → geometry parameters
 *   - ShapeEl: SVG shape rendering (React component)
 *   - AccentBar: node decoration (React component)
 *   - NodeCard: full node card (React component)
 *   - ELEMENTS: all element data (Tier 1-3)
 *
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════
// DIMENSIONS
// ═══════════════════════════════════════════════════════

const FI_NODE_W = 220;
const FI_NODE_H = 78;
const FI_DIAMOND_W = 170;
const FI_DIAMOND_H = 110;

// ═══════════════════════════════════════════════════════
// CSS VARIABLES (inject into :root)
// ═══════════════════════════════════════════════════════

const FI_CSS_VARS = `
  --c-parent:   #2563eb;
  --c-subagent: #7c3aed;
  --c-think:    #7c3aed;
  --c-mcp:      #15803d;
  --c-hook:     #c2410c;
  --c-code:     #525252;
  --c-user:     #a16207;
  --c-decision: #1f2937;
  --c-skill:    #0891b2;
  --c-command:  #6d28d9;
  --c-config:   #78716c;
  --c-api:      #0d9488;
  --c-plugin:   #4f46e5;
  --c-agentsdk: #be185d;
`;

// ═══════════════════════════════════════════════════════
// NODE TYPES — Master Definition
// ═══════════════════════════════════════════════════════

const FI_NODE_TYPES = {
  parent:   { label: "Parent Agent",   color: "var(--c-parent)",   raw: "#2563eb", icon: "◆" },
  subagent: { label: "Subagent",       color: "var(--c-subagent)", raw: "#7c3aed", icon: "◇" },
  think:    { label: "Claude Call",    color: "var(--c-think)",    raw: "#7c3aed", icon: "💭" },
  mcp:      { label: "MCP",            color: "var(--c-mcp)",      raw: "#15803d", icon: "↗" },
  hook:     { label: "Hook",           color: "var(--c-hook)",     raw: "#c2410c", icon: "⌘" },
  code:     { label: "Code",           color: "var(--c-code)",     raw: "#525252", icon: "▷" },
  user:     { label: "User Action",    color: "var(--c-user)",     raw: "#a16207", icon: "○" },
  decision: { label: "Decision",       color: "var(--c-decision)", raw: "#1f2937", icon: "?" },
  skill:    { label: "Skill",          color: "var(--c-skill)",    raw: "#0891b2", icon: "★" },
  command:  { label: "Command",        color: "var(--c-command)",  raw: "#6d28d9", icon: "/" },
  config:   { label: "Config",         color: "var(--c-config)",   raw: "#78716c", icon: "⚙" },
  api:      { label: "API",            color: "var(--c-api)",      raw: "#0d9488", icon: "⇄" },
  plugin:   { label: "Plugin",         color: "var(--c-plugin)",   raw: "#4f46e5", icon: "⚡" },
  agentsdk: { label: "Agent SDK",      color: "var(--c-agentsdk)", raw: "#be185d", icon: "⊞" },
  trigger:  { label: "Trigger",        color: "#d97706",           raw: "#d97706", icon: "▶" },
};

// ═══════════════════════════════════════════════════════
// SHAPE META — type → geometry parameters
// ═══════════════════════════════════════════════════════

function fiShapeMeta(type) {
  switch (type) {
    case "parent":   return { kind: "rect",    rx: 10,            padL: 16 };
    case "code":     return { kind: "sharp",   rx: 2,             padL: 14 };
    case "mcp":      return { kind: "pill",                       padL: 26 };
    case "subagent": return { kind: "hex",     inset: 16,         padL: 28 };
    case "think":    return { kind: "rect",    rx: 14,            padL: 16 };
    case "hook":     return { kind: "para",    skew: 14,          padL: 22 };
    case "user":     return { kind: "octa",    chamfer: 16,       padL: 22 };
    case "decision": return { kind: "diamond",                    padL: 0  };
    case "skill":    return { kind: "rect",    rx: 10,            padL: 16 };
    case "command":  return { kind: "sharp",   rx: 2,             padL: 14 };
    case "config":   return { kind: "rect",    rx: 9,             padL: 16 };
    case "api":      return { kind: "pill",                       padL: 26 };
    case "plugin":   return { kind: "tab",     notch: 10,         padL: 18 };
    case "agentsdk": return { kind: "trap",    inset: 12,         padL: 20 };
    default:         return { kind: "rect",    rx: 9,             padL: 16 };
  }
}

// ═══════════════════════════════════════════════════════
// SHAPE RENDERING — SVG React Components
// ═══════════════════════════════════════════════════════

function FIShapeEl({ type, x, y, w, h, stroke, strokeWidth, className }) {
  const m = fiShapeMeta(type);
  const p = { className, stroke, strokeWidth };
  if (m.kind === "rect" || m.kind === "sharp") return React.createElement("rect", { ...p, x, y, width: w, height: h, rx: m.rx });
  if (m.kind === "pill") return React.createElement("rect", { ...p, x, y, width: w, height: h, rx: h / 2 });
  if (m.kind === "hex") { const i = m.inset; const pts = [[x+i,y],[x+w-i,y],[x+w,y+h/2],[x+w-i,y+h],[x+i,y+h],[x,y+h/2]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "para") { const s = m.skew; const pts = [[x+s,y],[x+w,y],[x+w-s,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "octa") { const c = m.chamfer; const pts = [[x+c,y],[x+w-c,y],[x+w,y+c],[x+w,y+h-c],[x+w-c,y+h],[x+c,y+h],[x,y+h-c],[x,y+c]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "tab") { const n = m.notch; const pts = [[x,y+n],[x+n,y],[x+w,y],[x+w,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "trap") { const i = m.inset; const pts = [[x+i,y],[x+w-i,y],[x+w,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  if (m.kind === "diamond") { const pts = [[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { ...p, points: pts }); }
  return null;
}

function FIAccentBar({ type, x, y, w, h, color }) {
  const m = fiShapeMeta(type);
  if (m.kind === "pill") return React.createElement("circle", { cx: x + 14, cy: y + h/2, r: 5, fill: color });
  if (m.kind === "para") { const s = m.skew; const pts = [[x+s,y],[x+s+4,y],[x+4,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  if (m.kind === "hex") { const pts = [[x+4,y+h/2-6],[x+12,y+h/2],[x+4,y+h/2+6],[x-2,y+h/2]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  if (m.kind === "octa") return React.createElement("rect", { x, y: y+14, width: 4, height: h-28, rx: 2, fill: color });
  if (m.kind === "sharp") return React.createElement("text", { x: x+8, y: y+h/2+4, className: "sharp-prompt", style: { fill: color } }, "$_");
  if (m.kind === "tab") { const n = m.notch; const pts = [[x,y+n],[x+4,y+n],[x+4,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  if (m.kind === "trap") { const i = m.inset; const pts = [[x+i,y],[x+i+4,y],[x+4,y+h],[x,y+h]].map(q=>q.join(",")).join(" "); return React.createElement("polygon", { points: pts, fill: color }); }
  return React.createElement("rect", { x, y, width: 4, height: h, rx: 2, fill: color });
}

// ═══════════════════════════════════════════════════════
// NODE BOUNDS HELPER
// ═══════════════════════════════════════════════════════

function fiNodeBounds(node) {
  const isDiamond = fiShapeMeta(node.type).kind === "diamond";
  const w = isDiamond ? FI_DIAMOND_W : FI_NODE_W;
  const h = isDiamond ? FI_DIAMOND_H : FI_NODE_H;
  return { x: node.x - w / 2, y: node.y - h / 2, w, h };
}

// ═══════════════════════════════════════════════════════
// EXPORT to global scope
// ═══════════════════════════════════════════════════════

window.FI = {
  NODE_W: FI_NODE_W,
  NODE_H: FI_NODE_H,
  DIAMOND_W: FI_DIAMOND_W,
  DIAMOND_H: FI_DIAMOND_H,
  CSS_VARS: FI_CSS_VARS,
  NODE_TYPES: FI_NODE_TYPES,
  shapeMeta: fiShapeMeta,
  ShapeEl: FIShapeEl,
  AccentBar: FIAccentBar,
  nodeBounds: fiNodeBounds,
  version: "1.0.0",
};

// Also export as individual globals for backward compatibility
window.FI_NODE_TYPES = FI_NODE_TYPES;
window.fiShapeMeta = fiShapeMeta;
window.FIShapeEl = FIShapeEl;
window.FIAccentBar = FIAccentBar;

// ═══════════════════════════════════════════════════════
// TYPE_SPECS — Detail Panel master definition
// (moved from whiteboard.html 1745-2729 — master: finalized in 8093)
// ═══════════════════════════════════════════════════════

window.FI.TYPE_SPECS = {
  hook: {
    base: "An element that intercepts Claude processing at specific points to automatically run checks or actions. Defined in the hooks section of settings.json.",
    flowGuide: {
      what:    "Which hook event (PreToolUse / PostToolUse / SessionStart / Stop / ...) to react to",
      target:  "The matcher value (tool names like Bash or Edit|Write, startup reasons like startup)",
      content: "Handler type (command/prompt/agent/http/mcp_tool) + what to execute (command/prompt/URL etc.)",
      summary: "On matcher match, automatically runs the handler → some events can be blocked via exit code 2",
    },
    steps: [
      "Hook fires when an event matching the target pattern (matcher) occurs",
      "Runs the specified handler (command / prompt / agent / http / mcp_tool)",
      "On success: continues + injects additionalContext into Claude if needed",
      "exit code 2 → blocks tool execution etc. (blockable events only)",
      "Timeout → skips and continues",
    ],
    io: { in: "Event data (tool_name / tool_input / prompt etc., varies by event)", out: "allow/deny/ask decision / additionalContext / toolInputModification (varies by event)" },
    // Blockable events (show permission_decision for these). Per official docs.
    blockableEvents: ["PreToolUse","UserPromptSubmit","Stop","SubagentStop","PermissionRequest","PreCompact","Elicitation","WorktreeCreate","ConfigChange","TeammateIdle","TaskCompleted"],
    // Sections separate flow-specific, handler behavior, and definition concerns
    fieldSections: [
      { key: "trigger",   title: "🟧 Trigger Condition",       desc: "What target causes this hook to fire" },
      { key: "handler",   title: "🟨 Handler (Action)",        desc: "What to execute when matcher matches" },
      { key: "control",   title: "🟦 Control",                 desc: "Timeout, async, permission decision, etc." },
      { key: "io",        title: "🟩 I/O (flow-specific)",     desc: "Data this hook receives and returns" },
    ],
    fields: [
      // 🟧 trigger — minimal fields shared by all hooks
      { section: "trigger", key: "matcher",          label: "Target Pattern", desc: "Meaning varies by event (tool name / startup reason / file name / notification type etc.)", required: true },
      { section: "trigger", key: "placement",        label: "Placement",      desc: "Where in the flow this node belongs (for validation)", advanced: true,
        options: ["before-tool","after-tool","tool-batch","before-prompt","before-response-end","session-start","session-end","subagent-start","subagent-stop","file-watch","worktree-create","worktree-remove","before-compact","after-compact","notification","mcp-input-request"],
        info: {
          "before-tool":          "Place before a tool execution node (PreToolUse etc.)",
          "after-tool":           "Place after a tool execution node (PostToolUse etc.)",
          "tool-batch":           "Place after a parallel tool-execution batch",
          "before-prompt":        "Place immediately after user submits (UserPromptSubmit)",
          "before-response-end":  "Place just before response completes (Stop)",
          "session-start":        "Place at the flow start (SessionStart etc.)",
          "session-end":          "Place at the flow end (SessionEnd)",
          "subagent-start":       "Place when a subagent is launched",
          "subagent-stop":        "Place when a subagent completes",
          "file-watch":           "Place when a file change is detected",
          "worktree-create":      "Place when a worktree is created",
          "worktree-remove":      "Place when a worktree is removed",
          "before-compact":       "Place before compaction (PreCompact)",
          "after-compact":        "Place after compaction (PostCompact)",
          "notification":         "Place when a notification fires (Notification)",
          "mcp-input-request":    "Place when an MCP input is requested (Elicitation)"
        } },
      // 🟨 handler — only handler type is shared; specific fields switch dynamically via fieldsByHandler
      { section: "handler", key: "handler_type",     label: "Handler Type", desc: "What to execute", options: ["command","prompt","agent","http","mcp_tool"], required: true,
        info: {
          command:  "Runs a shell command directly. The most versatile handler — run prettier, npm test, etc. when the hook fires. Default timeout: 600 s.",
          prompt:   "Has Claude (Haiku by default) evaluate a short instruction. Use when you want lightweight LLM judgment like 'is this input dangerous?'. Timeout: 30 s.",
          agent:    "Launches a subagent to decide. Can use Read / Grep / Glob, so suitable for advanced judgments that require reading files. Timeout: 60 s.",
          http:     "Sends an HTTP request to notify or query an external service. For Slack webhooks or your own API.",
          mcp_tool: "Calls an MCP server tool directly. Use when you want to trigger a specific MCP action (e.g. update Notion, write to a DB) from inside a hook.",
        }
      },
      // 🟦 control — shared by all hooks
      { section: "control", key: "timeout",          label: "Timeout",    desc: "Max wait time (seconds). command/http/mcp_tool=600, prompt=30, agent=60, UserPromptSubmit=30" },
      { section: "control", key: "async",            label: "Async Mode", desc: "false = sync, async = fire-and-forget, asyncRewake = background then wake Claude on exit 2", options: ["false","async","asyncRewake"], advanced: true,
        info: {
          false: "Synchronous. Claude waits until the hook completes. Default.",
          async: "Fire-and-forget (background). Does not wait for the result. Use when you only need a side effect like logging.",
          asyncRewake: "Background execution + wakes Claude only when it returns exit code 2. Use for failure notifications."
        } },
      // permission_decision shown only for blockableEvents (dynamic filter in DetailPanel)
      { section: "control", key: "permission_decision", label: "Permission Decision", desc: "Control tool execution with allow/deny/ask", options: ["allow","deny","ask","defer"], blockableOnly: true,
        info: {
          allow: "Allow tool execution. Continue normal flow.",
          deny: "Reject and block tool execution. The stderr message is returned to Claude as the reason.",
          ask: "Show a confirmation dialog to the user. The human decides whether to allow.",
          defer: "Defer the decision to the next hook in the chain."
        } },
      { section: "control", key: "additionalContext", label: "Additional Context", desc: "Extra information to inject into Claude", long: true, advanced: true },
      { section: "control", key: "hookSpecificOutput", label: "Hook-Specific Output", desc: "Event-specific JSON output (toolInputModification / worktreePath etc.)", long: true, advanced: true },
      // 🟩 io (flow-specific)
      { section: "io",      key: "input",            label: "Input (IN)",  desc: "Data this hook receives. Varies by event.",  long: true },
      { section: "io",      key: "output",           label: "Output (OUT)", desc: "Data this hook returns.",                    long: true },
    ],
    // 🟨 Dynamic fields per handler_type (shown only when the corresponding handler_type is selected)
    fieldsByHandler: {
      command: [
        { section: "handler", key: "command",       label: "Command",          desc: "Shell command to run (e.g. bash scripts/validate.sh)", long: true, required: true },
      ],
      prompt: [
        { section: "handler", key: "prompt_text",   label: "Evaluation Prompt", desc: "Instruction passed to Claude (Haiku) for judgment", long: true, required: true },
        { section: "handler", key: "prompt_model",  label: "Model",             desc: "Model used for judgment", options: ["haiku","sonnet"],
          info: { haiku: "Fast, low-cost — for default judgment", sonnet: "High accuracy — for complex judgment" } },
      ],
      agent: [
        { section: "handler", key: "subagent_type", label: "Subagent Type",   desc: "Explore / Plan / general-purpose / custom name", required: true },
        { section: "handler", key: "agent_prompt",  label: "Prompt",          desc: "Instructions for the subagent",                   long: true, required: true },
      ],
      http: [
        { section: "handler", key: "url",           label: "URL",             desc: "Destination for the HTTP request", required: true },
        { section: "handler", key: "method",        label: "HTTP Method",     desc: "Request method", options: ["GET","POST","PUT","DELETE"],
          info: {
            GET: "Fetch data (no side effects)",
            POST: "Send data (create)",
            PUT: "Update data (full replace)",
            DELETE: "Delete data"
          } },
        { section: "handler", key: "body",          label: "Request Body",    desc: "Payload for POST/PUT (JSON)",         long: true, advanced: true },
      ],
      mcp_tool: [
        { section: "handler", key: "mcp_server",    label: "MCP Server",     desc: "mcpServers key in .mcp.json (e.g. slack, notion)", required: true },
        { section: "handler", key: "mcp_tool_name", label: "MCP Tool Name",  desc: "Tool provided by that server (e.g. send_message)", required: true },
        { section: "handler", key: "mcp_params",    label: "Parameters",     desc: "Arguments to pass to the tool (JSON)",               long: true, advanced: true },
      ],
    },
    definition: `// settings.json\n{\n  "hooks": {\n    "PreToolUse": [{\n      "matcher": "Bash",\n      "hooks": [{\n        "type": "command",\n        "command": "bash scripts/validate.sh",\n        "timeout": 30\n      }]\n    }]\n  }\n}`,
  },
  subagent: {
    base: "Launches a specialized AI assistant to handle a specific task independently of the main AI.",
    flowGuide: {
      what:    "The subagent type to launch (Explore / Plan / general-purpose / custom specialist)",
      target:  "The kind and scope of task to delegate (what to investigate, implement, or summarize)",
      content: "Prompt text (specific instructions), allowed tools, model selection",
      summary: "Receives context from the previous step, processes the task autonomously in a separate context → returns only the final result to the parent",
    },
    steps: [
      "Pass the prompt (instructions) to the subagent",
      "Processing begins with the specified model (Sonnet/Opus/Haiku)",
      "Executes the task autonomously using permitted tools (Read/Grep etc.)",
      "Returns the result to the parent agent",
    ],
    io: { in: "Prompt (natural language instructions), context", out: "Task result (text/data)" },
    fieldSections: [
      { key: "request",    title: "🔵 Call Request",         desc: "What to delegate to this subagent. Changes per flow." },
      { key: "execution",  title: "🟣 Execution Parameters", desc: "Model/allowed tools/permissions/isolation — how to run it" },
      { key: "io_schema",  title: "🟢 I/O Shape",            desc: "Expected output format and examples" },
      { key: "definition", title: "⚪ Subagent Definition",  desc: "Contents of .claude/agents/*.md. Only relevant for custom agents." },
    ],
    fields: [
      // ─── 🔵 request ───
      { section: "request", key: "prompt",       label: "Prompt",       desc: "Instructions for the subagent", long: true, required: true },
      { section: "request", key: "target_files", label: "Target Files", desc: "Files/folders to process",      multi: true },

      // ─── 🟣 execution ───
      { section: "execution", key: "model", label: "Model", desc: "Model for processing", options: ["sonnet","opus","haiku"],
        info: { sonnet: "Balanced — standard model", opus: "High capability — for complex tasks", haiku: "Fast, low-cost — for simple tasks" } },
      { section: "execution", key: "allowed_tools", label: "Allowed Tools", desc: "Tools this subagent may use",
        multi: true, choices: ["Read","Write","Edit","MultiEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"],
        info: {
          Read: "Read a file",
          Write: "Create or overwrite a file",
          Edit: "Replace part of a file",
          MultiEdit: "Edit multiple locations in one file at once",
          Bash: "Run a shell command",
          Grep: "Search text in files (ripgrep)",
          Glob: "Search by filename pattern",
          WebFetch: "Fetch a URL and extract content",
          WebSearch: "Web search",
          TodoWrite: "Manage the session todo list",
          Task: "Launch another subagent"
        } },
      { section: "execution", key: "disallowed_tools", label: "Disallowed Tools", desc: "Tools explicitly blocked",
        multi: true, choices: ["Read","Write","Edit","MultiEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"],
        info: {
          Read: "Read a file",
          Write: "Create or overwrite a file",
          Edit: "Replace part of a file",
          MultiEdit: "Edit multiple locations in one file at once",
          Bash: "Run a shell command",
          Grep: "Search text in files (ripgrep)",
          Glob: "Search by filename pattern",
          WebFetch: "Fetch a URL and extract content",
          WebSearch: "Web search",
          TodoWrite: "Manage the session todo list",
          Task: "Launch another subagent"
        } },
      { section: "execution", key: "permission_mode", label: "Permission Mode", desc: "Approval level for tool execution",
        options: ["default","acceptEdits","plan","bypassPermissions"],
        info: {
          default: "Prompt user each time",
          acceptEdits: "Auto-approve edits",
          plan: "Plan only (no writes)",
          bypassPermissions: "Run all tools without approval (advanced)"
        } },
      { section: "execution", key: "isolation", label: "Isolation", desc: "Whether to isolate in a Git worktree", options: ["none","worktree"],
        info: { none: "Runs in the same directory as the main agent", worktree: "Isolated in a separate worktree (keeps main clean)" } },

      // ─── 🟢 io_schema ───
      { section: "io_schema", key: "output_schema", label: "Output Schema",    desc: "Expected output format (JSON Schema / free text)", long: true },
      { section: "io_schema", key: "expected_io",   label: "Expected IN/OUT",  desc: "Concrete example of execution",                    long: true },

      // ─── ⚪ definition (custom agents only) ───
      { section: "definition", key: "file",        label: "File Path",    desc: "Save location for .claude/agents/*.md" },
      { section: "definition", key: "name",        label: "Agent Name",   desc: "Identifier", required: true, authoringOnly: true },
      { section: "definition", key: "description", label: "Trigger",      desc: "Text that triggers selection via the Task tool",   long: true, required: true, authoringOnly: true },
      { section: "definition", key: "builtin",     label: "Built-in",     desc: "Whether this is an Anthropic built-in agent", options: ["false","true"],
        info: { false: "Custom subagent", true: "Anthropic built-in (implementation not public)" } },
    ],
    definition: `// .claude/agents/deploy-checker.md\n---\nmodel: haiku\nallowed_tools:\n  - Read\n  - Bash\n  - Grep\n---\nCheck the pre-deploy checklist and...`,
  },
  think: {
    base: "Represents a step that invokes main Claude itself for reasoning (Claude Call). Does not launch a subagent — performs LLM calls within the current conversation for writing, summarizing, research, review, formatting, etc.",
    flowGuide: {
      what:    "What to have main Claude do (write / structure / review / format etc.)",
      target:  "The output target (draft text / outline / review comments / revised text etc.)",
      content: "Prompt text to pass to Claude + format, perspective, tone",
      summary: "Sends the current context and prompt to Claude to get output → passes it to the next step",
    },
    steps: [
      "Receives material from the previous step (research results, brief, perspective list etc.)",
      "Combines the current context with the prompt and sends to Claude",
      "Holds the returned output (text, summary, review, revision etc.) as the artifact",
      "Passes the result to the next step",
    ],
    io: { in: "Previous step material + prompt", out: "Artifact returned by Claude (text / outline / review etc.)" },
    fields: [
      { key: "prompt",       label: "Prompt",  desc: "Instruction to send to Claude. Based on previous step material — what to output, from what perspective, in what format.",  long: true, required: true },
      { key: "tone",         label: "Tone",    desc: "Style and register of output",  options: ["Polite","Casual","Technical","Business","Academic"], advanced: true },
    ],
    definition: `// LLM call step by main Claude itself\n// No config file — driven by prompt and\n// material from the previous step only`,
  },
  mcp: {
    base: "An element that connects to external services (Slack, GitHub, Google Drive etc.) to fetch or manipulate data.",
    flowGuide: {
      what:    "The MCP server to connect (slack / notion / github / canva-mcp / custom) and the action type (tool/resource/prompt)",
      target:  "Tool name / resource URI / prompt name defined on the server",
      content: "Tool arguments (JSON), search queries, content to write",
      summary: "Uses information from the previous step to make API calls to external services → passes results (post IDs/search results/responses) to the next step",
    },
    // Common fallback (when meta.action is not specified)
    steps: [
      "Connect to the specified MCP server",
      "Verify authentication (OAuth etc., first time only)",
      "Call based on action type (tool / resource / prompt)",
      "Receive the response and pass it to the next step",
    ],
    io: { in: "Action type + parameters", out: "Response from the service" },
    fieldSections: [
      { key: "request",    title: "🔵 Call Request",         desc: "Which tool/resource to call, and with what parameters" },
      { key: "execution",  title: "🟣 Execution Parameters", desc: "Action type and authentication method" },
      { key: "io_schema",  title: "🟢 I/O Shape",            desc: "Expected output schema and examples" },
      { key: "definition", title: "⚪ Server Definition",     desc: "Contents of .mcp.json + available capabilities" },
    ],
    // Common fields
    fields: [
      // 🟣 execution (action type and auth)
      { section: "execution", key: "action", label: "Action Type", desc: "Which of the 3 MCP primitives to call",
        options: ["tool","resource","prompt"], required: true,
        info: {
          tool: "An operation provided by the server (send_message etc.)",
          resource: "Read-only reference to a server resource",
          prompt: "Server-defined prompt template"
        } },
      { section: "execution", key: "auth", label: "Auth Method", desc: "How to authenticate",
        options: ["oauth","api_key","none"],
        info: {
          oauth: "Log in via browser to obtain a token",
          api_key: "Pass API key via environment variable etc.",
          none: "No authentication required (local server etc.)"
        } },
      // 🟢 io_schema
      { section: "io_schema", key: "output_schema", label: "Output Schema",   desc: "Expected output format (JSON Schema / free text)", long: true },
      { section: "io_schema", key: "expected_io",   label: "Expected IN/OUT", desc: "Concrete execution example",                        long: true },
      // ⚪ definition (server itself)
      { section: "definition", key: "server", label: "Server Name", desc: "Connection target (mcpServers key in .mcp.json)", required: true, authoringOnly: true },
    ],
    definition: `// .mcp.json — server definition example\n{\n  "mcpServers": {\n    "slack": {\n      "command": "npx",\n      "args": ["-y", "@anthropic/slack-mcp"],\n      "env": { "SLACK_TOKEN": "xoxb-..." }\n    }\n  }\n}`,

    // 🔵 request: additional fields per action type
    fieldsByAction: {
      tool: [
        { section: "request", key: "tool_name", label: "Tool Name",   desc: "Tool provided by the server (e.g. send_message). Multiple selections possible in the capabilities section.", required: true },
        { section: "request", key: "params",    label: "Parameters",  desc: "Arguments to pass to the tool (JSON)", long: true },
      ],
      resource: [
        { section: "request", key: "resource_uri", label: "Resource URI", desc: "URI of the resource to reference (e.g. notion://page/abc)", required: true },
      ],
      prompt: [
        { section: "request", key: "prompt_name", label: "Prompt Name", desc: "Name of the server-defined prompt template", required: true },
        { section: "request", key: "arguments",   label: "Arguments",   desc: "Arguments to pass to the prompt (JSON)", long: true },
      ],
    },
    stepsByAction: {
      tool: [
        "Connect to server and verify authentication",
        "Specify the target tool via tool_name",
        "Pass params and execute",
        "Service processes → returns JSON response",
      ],
      resource: [
        "Connect to server and verify authentication",
        "Specify the resource to reference via resource_uri",
        "Server reads and returns the resource content",
        "Pass text/JSON/binary to the next step",
      ],
      prompt: [
        "Connect to server",
        "Fetch the pre-defined prompt via prompt_name",
        "Fill in arguments",
        "Pass the completed prompt to Claude",
      ],
    },
    ioByAction: {
      tool:     { in: "server + tool_name + params",      out: "Tool execution result (JSON)" },
      resource: { in: "server + resource_uri",            out: "Resource content (text/JSON/binary)" },
      prompt:   { in: "server + prompt_name + arguments", out: "Completed prompt string" },
    },
  },
  code: {
    base: "An element that performs basic operations like reading/writing files, running commands, and searching. The tools Claude uses like hands and feet.",
    flowGuide: {
      what:    "Select the tool to use (Read / Write / Edit / Bash / Grep / Glob / WebFetch / WebSearch etc.)",
      target:  "Target file path, Bash command string, search pattern, URL etc.",
      content: "Tool-specific additional parameters (offset/limit / replace_all / timeout / matcher etc.)",
      summary: "Executes a tool using paths or instructions from the previous step → passes results (text/JSON/exit code) to the next step",
    },
    // Common fallback (when meta.tool is not set)
    steps: [
      "Receive tool-specific parameters (path, command etc.)",
      "Execute the tool (file operation / shell execution / search etc.)",
      "Pass the result to the next step",
    ],
    io: { in: "Tool-specific parameters (path, command, pattern etc.)", out: "Result (text, JSON, success/failure)" },
    fieldSections: [
      { key: "request",   title: "🔵 Call Request",         desc: "What to pass to this tool" },
      { key: "execution", title: "🟣 Execution Parameters", desc: "How to run it (timeout / flags etc.)" },
      { key: "io_schema", title: "🟢 I/O Shape",            desc: "Expected output format and examples (optional)" },
    ],
    fields: [
      { section: "request", key: "tool", label: "Tool Name", desc: "Built-in tool to use",
        options: ["Read","Write","Edit","MultiEdit","NotebookEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"], required: true,
        info: {
          Read: "Read a file",
          Write: "Create or overwrite a file",
          Edit: "Replace part of a file",
          MultiEdit: "Edit multiple locations in one file at once",
          NotebookEdit: "Edit a Jupyter notebook cell",
          Bash: "Run a shell command",
          Grep: "Search text in files (ripgrep)",
          Glob: "Search by filename pattern",
          WebFetch: "Fetch a URL and extract content",
          WebSearch: "Web search",
          TodoWrite: "Manage the session todo list",
          Task: "Launch a subagent"
        } },
    ],
    definition: `// tool_use block\n{\n  "type": "tool_use",\n  "name": "Read",\n  "input": { "file_path": "/path/to/file.md" }\n}`,

    // Detailed definitions per tool. Each entry has a section for 4-block classification.
    fieldsByTool: {
      Read: [
        { section: "request", key: "file_path", label: "File Path",    desc: "Target file to read (absolute path)", required: true },
        { section: "request", key: "offset",    label: "Start Line",   desc: "Which line to start reading from (optional)" },
        { section: "request", key: "limit",     label: "Line Count",   desc: "Max lines to read (optional, default 2000)" },
        { section: "request", key: "pages",     label: "PDF Page Range", desc: "Page range for PDFs (e.g. 1-5)" },
      ],
      Write: [
        { section: "request", key: "file_path", label: "File Path", desc: "Write destination (overwrites if exists)", required: true },
        { section: "request", key: "content",   label: "Content",   desc: "Full file content",                        long: true, required: true },
      ],
      Edit: [
        { section: "request",   key: "file_path",   label: "File Path",   desc: "File to edit", required: true },
        { section: "request",   key: "old_string",  label: "Before",      desc: "String to replace",         long: true, required: true },
        { section: "request",   key: "new_string",  label: "After",       desc: "Replacement string",        long: true, required: true },
        { section: "execution", key: "replace_all", label: "Replace All", desc: "Replace all matches when true", options: ["false","true"],
          info: { false: "Replace only the first occurrence (default)", true: "Replace all matches in the file" } },
      ],
      MultiEdit: [
        { section: "request", key: "file_path", label: "File Path",  desc: "File to edit", required: true },
        { section: "request", key: "edits",     label: "Edit List",  desc: "[{old_string, new_string, replace_all?}, …]", long: true, required: true },
      ],
      NotebookEdit: [
        { section: "request",   key: "notebook_path", label: "Notebook Path",  desc: ".ipynb file (absolute path)", required: true },
        { section: "request",   key: "cell_id",       label: "Cell ID",        desc: "Target cell (optional; appends to end if omitted)" },
        { section: "request",   key: "new_source",    label: "New Cell Content", desc: "Content to put in the cell", long: true, required: true },
        { section: "execution", key: "cell_type",     label: "Cell Type",      desc: "code / markdown",            options: ["code","markdown"],
          info: { code: "Code cell (executed as Python etc.)", markdown: "Markdown cell (documentation)" } },
        { section: "execution", key: "edit_mode",     label: "Edit Mode",      desc: "replace / insert / delete",  options: ["replace","insert","delete"],
          info: { replace: "Replace existing cell content", insert: "Insert a new cell", delete: "Delete the cell" } },
      ],
      Grep: [
        { section: "request",   key: "pattern",     label: "Search Pattern", desc: "Regular expression (ripgrep syntax)", long: true, required: true },
        { section: "request",   key: "path",        label: "Search Path",    desc: "File/folder (defaults to current working directory)" },
        { section: "request",   key: "glob",        label: "File Filter",    desc: 'Limit target files with glob (e.g. "*.ts", "**/src/**")' },
        { section: "request",   key: "type",        label: "File Type",      desc: 'ripgrep type name (e.g. "js", "py", "rust")' },
        { section: "execution", key: "output_mode", label: "Output Mode",    desc: "content=full text / files_with_matches=filenames only / count=count only", options: ["content","files_with_matches","count"],
          info: { content: "Match lines + filenames", files_with_matches: "Filenames only (default)", count: "Per-file match count" } },
        { section: "execution", key: "-i",          label: "Case-insensitive", desc: "Case-insensitive search when true", options: ["false","true"],
          info: { false: "Case-sensitive (default)", true: "Case-insensitive search" } },
        { section: "execution", key: "-n",          label: "Show Line Numbers", desc: "Attach line numbers to matches when true (content mode)", options: ["false","true"],
          info: { false: "No line numbers", true: "Show line numbers on matches" } },
        { section: "execution", key: "-C",          label: "Context Lines",  desc: "Show N lines before and after match (optional)" },
        { section: "execution", key: "multiline",   label: "Multiline Match", desc: "Allow regex to span newlines", options: ["false","true"],
          info: { false: "Evaluate regex within a single line (default)", true: "Allow regex to span newlines" } },
        { section: "execution", key: "head_limit",  label: "Result Limit",   desc: "Truncate results to first N items (optional)" },
      ],
      Glob: [
        { section: "request", key: "pattern", label: "Glob Pattern",    desc: 'Filename pattern (e.g. "**/*.ts", "src/**/*.{js,jsx}")', required: true },
        { section: "request", key: "path",    label: "Search Root",     desc: "Defaults to current working directory" },
      ],
      Bash: [
        { section: "request",   key: "command",            label: "Command",          desc: "Shell command to execute", long: true, required: true },
        { section: "request",   key: "description",        label: "Description",      desc: "Short description, 5-10 words (for logs)" },
        { section: "execution", key: "timeout",            label: "Timeout",          desc: "Max wait time in ms (default 120000, max 600000)" },
        { section: "execution", key: "run_in_background",  label: "Background",       desc: "Fire-and-forget to continue other work when true", options: ["false","true"],
          info: { false: "Wait for completion (default)", true: "Background execution, returns shell_id" } },
      ],
      BashOutput: [
        { section: "request",   key: "bash_id", label: "Shell ID",       desc: "ID of a Bash started with run_in_background", required: true },
        { section: "execution", key: "filter",  label: "Output Filter",  desc: "Regex to filter output lines (optional)" },
      ],
      KillBash: [
        { section: "request", key: "shell_id", label: "Shell ID", desc: "ID of the background Bash process to stop", required: true },
      ],
      WebFetch: [
        { section: "request", key: "url",    label: "URL",             desc: "Target URL (HTTP auto-upgraded to HTTPS)", required: true },
        { section: "request", key: "prompt", label: "Extraction Hint", desc: "Instruction for what to extract from the page (processed by a small model first)", long: true, required: true },
      ],
      WebSearch: [
        { section: "request",   key: "query",           label: "Search Query",    desc: "Web search keywords", required: true },
        { section: "execution", key: "allowed_domains", label: "Allowed Domains", desc: "Include only results from these domains (optional)", multi: true },
        { section: "execution", key: "blocked_domains", label: "Blocked Domains", desc: "Exclude these domains (mutually exclusive with allowed_domains)", multi: true },
      ],
      TodoWrite: [
        { section: "request", key: "todos", label: "Todo List", desc: "Array of [{content, activeForm, status}, …]", long: true, required: true },
      ],
      Task: [
        { section: "request",   key: "subagent_type",     label: "Subagent Type",  desc: "Explore / Plan / general-purpose / custom name",
          options: ["Explore","Plan","general-purpose"], required: true,
          info: {
            Explore: "Codebase exploration only (read-only)",
            Plan: "Implementation planning only",
            "general-purpose": "General purpose (research + execute + fix)"
          } },
        { section: "request",   key: "description",       label: "Description",    desc: "Short task description, 3-5 words (for UI display)" },
        { section: "request",   key: "prompt",            label: "Prompt",         desc: "Detailed instructions for the subagent", long: true, required: true },
        { section: "execution", key: "run_in_background", label: "Background",     desc: "Run concurrently when true", options: ["false","true"],
          info: { false: "Wait for completion (default)", true: "Run in background concurrently" } },
        { section: "execution", key: "isolation",         label: "Isolation",      desc: "Isolate in a git worktree", options: ["none","worktree"],
          info: { none: "Runs in the same directory as main", worktree: "Isolated in a separate worktree (keeps main clean)" } },
      ],
      SlashCommand: [
        { section: "request", key: "command", label: "Command", desc: "The /command to run (e.g. \"/init\", \"/review pr-123\")", required: true },
      ],
      EnterPlanMode: [],  // no parameters
      ExitPlanMode: [
        { section: "request", key: "plan", label: "Plan", desc: "Work plan to present to the user (Markdown)", long: true, required: true },
      ],
    },

    // Per-tool summary steps
    stepsByTool: {
      Read: [
        "Receive file_path",
        "Open and read the file contents",
        "(Narrow range if offset/limit specified)",
        "Return text (with line numbers)",
      ],
      Write: [
        "Receive file_path and content",
        "Overwrite if file exists; create new if not",
        "Return write success/failure",
      ],
      Edit: [
        "Receive file_path, old_string, new_string",
        "Find old_string in the file (error if not unique)",
        "Replace the found location with new_string",
        "Return success/failure",
      ],
      MultiEdit: [
        "Receive file_path and edits array",
        "Apply edits one by one in order",
        "Commit only if all succeed; roll back on any failure",
        "Return success/failure",
      ],
      NotebookEdit: [
        "Receive notebook_path, cell_id, edit_mode",
        "Open notebook and locate target cell",
        "Replace/insert/delete per edit_mode",
        "Return result",
      ],
      Grep: [
        "Receive pattern and search scope (path / glob / type)",
        "Fast search with ripgrep",
        "Format results per output_mode (content / filename list / count)",
        "Truncate to first N items if head_limit is set",
      ],
      Glob: [
        "Receive glob pattern and start path",
        "List files matching the pattern",
        "Return sorted by most-recently-modified",
      ],
      Bash: [
        "Receive command",
        "Execute in a separate process (timeout applies)",
        "If run_in_background, fire-and-forget and return shell_id",
        "Otherwise return stdout / stderr / exit code (output > 30,000 chars saved to temp file)",
      ],
      BashOutput: [
        "Receive bash_id",
        "Fetch latest stdout/stderr of the target shell",
        "Filter with regex if filter is set",
        "Return new output if still running; final result if finished",
      ],
      KillBash: [
        "Receive shell_id",
        "Terminate the target background Bash process",
        "Return stop result",
      ],
      WebFetch: [
        "Receive url and prompt",
        "Fetch page and convert HTML → Markdown",
        "Small model extracts the relevant part per prompt",
        "Return extraction as text (cached 15 min)",
      ],
      WebSearch: [
        "Receive query",
        "Search via Anthropic search backend (up to 8 refinement rounds internally)",
        "Filter by allowed/blocked domains",
        "Return list of titles and URLs (use WebFetch separately for body content)",
      ],
      TodoWrite: [
        "Receive todos array (content / activeForm / status)",
        "Full-replace the session todo list",
        "Reflect latest list in the UI",
      ],
      Task: [
        "Receive subagent_type and prompt",
        "Launch subagent in a separate context",
        "Subagent autonomously executes the task using tools",
        "Return only the final result to the parent (intermediate steps hidden)",
      ],
      SlashCommand: [
        "Receive command string (e.g. \"/init\")",
        "Resolve and execute the registered command",
        "Return command result",
      ],
      EnterPlanMode: [
        "Enter Plan mode (write tools are blocked)",
        "Read code and build a work plan",
        "Present plan via ExitPlanMode when ready",
      ],
      ExitPlanMode: [
        "Receive plan (Markdown)",
        "Present plan to user and request approval",
        "Return to normal mode and begin implementation on approval",
      ],
    },

    // Per-tool I/O
    ioByTool: {
      Read:         { in: "file_path (+ offset / limit / pages)", out: "File contents (text with line numbers)" },
      Write:        { in: "file_path + content (full text)",       out: "Write success/failure" },
      Edit:         { in: "file_path + old_string + new_string",  out: "Edit success/failure" },
      MultiEdit:    { in: "file_path + edits[]",                  out: "All edits applied result (atomic)" },
      NotebookEdit: { in: "notebook_path + cell_id + new_source", out: "Cell update result" },
      Grep:         { in: "pattern + scope (path/glob/type) + options", out: "Matched text, filename list, or count" },
      Glob:         { in: "glob pattern + search root",           out: "Array of matching file paths (sorted by modified time)" },
      Bash:         { in: "command (+ timeout / run_in_background / description)", out: "stdout / stderr / exit code (or shell_id)" },
      BashOutput:   { in: "bash_id (+ filter)",                   out: "Latest output + status of target shell" },
      KillBash:     { in: "shell_id",                             out: "Stop result" },
      WebFetch:     { in: "url + prompt",                         out: "Extraction text (processed by small model)" },
      WebSearch:    { in: "query (+ allowed/blocked_domains)",    out: "Search result titles + URL list" },
      TodoWrite:    { in: "todos[]",                              out: "Todo list update result" },
      Task:         { in: "subagent_type + prompt (+ options)",   out: "Subagent final result (text)" },
      SlashCommand: { in: "command string (e.g. '/init args')",   out: "Command result" },
      EnterPlanMode:{ in: "(no parameters)",                      out: "Mode transition result" },
      ExitPlanMode: { in: "plan (Markdown format)",               out: "User approval result" },
    },

    // Per-tool Dev mode definition examples
    definitionByTool: {
      Read:         `{\n  "tool": "Read",\n  "input": {\n    "file_path": "/path/to/file.md",\n    "offset": 1,\n    "limit": 200\n  }\n}`,
      Write:        `{\n  "tool": "Write",\n  "input": {\n    "file_path": "/path/to/new.md",\n    "content": "# Hello\\n..."\n  }\n}`,
      Edit:         `{\n  "tool": "Edit",\n  "input": {\n    "file_path": "/path/x.ts",\n    "old_string": "const foo = 1;",\n    "new_string": "const foo = 2;",\n    "replace_all": false\n  }\n}`,
      MultiEdit:    `{\n  "tool": "MultiEdit",\n  "input": {\n    "file_path": "/path/x.ts",\n    "edits": [\n      { "old_string": "foo", "new_string": "bar" },\n      { "old_string": "baz", "new_string": "qux" }\n    ]\n  }\n}`,
      NotebookEdit: `{\n  "tool": "NotebookEdit",\n  "input": {\n    "notebook_path": "/path/x.ipynb",\n    "cell_id": "abc123",\n    "edit_mode": "replace",\n    "new_source": "print('hi')"\n  }\n}`,
      Grep:         `{\n  "tool": "Grep",\n  "input": {\n    "pattern": "function\\\\s+(\\\\w+)",\n    "path": "src/",\n    "glob": "*.ts",\n    "output_mode": "content",\n    "-n": true,\n    "-C": 2,\n    "head_limit": 50\n  }\n}`,
      Glob:         `{\n  "tool": "Glob",\n  "input": {\n    "pattern": "**/*.test.ts",\n    "path": "/path/to/repo"\n  }\n}`,
      Bash:         `{\n  "tool": "Bash",\n  "input": {\n    "command": "npm test -- --coverage",\n    "description": "Run tests with coverage",\n    "timeout": 300000,\n    "run_in_background": false\n  }\n}`,
      BashOutput:   `{\n  "tool": "BashOutput",\n  "input": {\n    "bash_id": "shell_abc123",\n    "filter": "ERROR|FAIL"\n  }\n}`,
      KillBash:     `{\n  "tool": "KillBash",\n  "input": { "shell_id": "shell_abc123" }\n}`,
      WebFetch:     `{\n  "tool": "WebFetch",\n  "input": {\n    "url": "https://example.com/article",\n    "prompt": "Summarize the 3 main claims in this article"\n  }\n}`,
      WebSearch:    `{\n  "tool": "WebSearch",\n  "input": {\n    "query": "Claude Code hooks 2026",\n    "allowed_domains": ["anthropic.com", "code.claude.com"]\n  }\n}`,
      TodoWrite:    `{\n  "tool": "TodoWrite",\n  "input": {\n    "todos": [\n      { "content": "Implement feature", "activeForm": "In progress", "status": "in_progress" },\n      { "content": "Write tests", "activeForm": "Writing tests", "status": "pending" }\n    ]\n  }\n}`,
      Task:         `{\n  "tool": "Task",\n  "input": {\n    "subagent_type": "Explore",\n    "description": "Find auth implementation",\n    "prompt": "Investigate where authentication-related code is implemented..."\n  }\n}`,
      SlashCommand: `{\n  "tool": "SlashCommand",\n  "input": { "command": "/review pr-123" }\n}`,
      EnterPlanMode:`{\n  "tool": "EnterPlanMode",\n  "input": {}\n}`,
      ExitPlanMode: `{\n  "tool": "ExitPlanMode",\n  "input": {\n    "plan": "## Implementation Plan\\n\\n1. Add auth middleware\\n2. JWT token validation logic...\\n3. ..."\n  }\n}`,
    },
  },
  parent: {
    base: "A marker placed at the start, end, or merge point of a flow to represent the parent agent itself. Holds no specific reasoning — just marks where the main Claude agent is present in the flow.",
    flowGuide: {
      what:    "The role the parent agent plays (receive at start, return at end, merge results in between)",
      target:  "Target (= the entire flow)",
      content: "Brief description of what main Claude is responsible for at this position in the flow",
      summary: "Expresses 'the parent agent is here' as a visible node. Holds no LLM prompt (= the difference from think)",
    },
    steps: [
      "Start: receives user instructions or upstream input",
      "End: aggregates all flow results and returns them to the user",
      "Middle (merge point): collects results from parallel branches at one point",
    ],
    io: { in: "User prompt at start / upstream results in the middle", out: "Pass-through to downstream nodes / final output to user" },
    fields: [],
    definition: `// Start, end, or merge-point marker\n// Holds no prompt (distinct from think)\n// Simply marks 'main Claude is the agent here'`,
  },
  // When to use think vs parent (both defined in TYPE_SPECS):
  //   parent: subject marker (no prompt, blue). Place only where you need to show the responsible agent.
  //   think:  individual LLM task sent to Claude (prompt required, purple). Use at each reasoning step in the flow.
  //   When in doubt, use think. Use parent only explicitly for start/end/merge points.
  user: {
    base: "An element for interactions with humans, such as waiting for user input or displaying processing status.",
    steps: [ "Present options or a question to the user", "Wait for user input", "Pass the input to the next step" ],
    io: { in: "Question text / options", out: "User's response" },
    fields: [],
    definition: `// User action node\n// A step that waits for human input or decision`,
  },
  decision: {
    base: "A branch point that switches the processing route based on a condition. Acts like an if statement.",
    steps: [
      "Receive the condition value from the previous step",
      "Evaluate the condition (e.g. did tests pass? / does the file exist?)",
      "Condition A → proceed to route A",
      "Condition B → proceed to route B",
      "Neither → proceed to the default route",
    ],
    io: { in: "Value to evaluate (output of previous step)", out: "The selected route's next step" },
    fields: [
      { key: "condition", label: "Condition", desc: "Branching condition expression", required: true },
    ],
    definition: `// Branch node\n// Determines the next route\n// based on exit code or variable value`,
  },
  skill: {
    base: "A procedure guide specialized for a specific task. Once Claude loads this skill, it can automatically perform the specialized process.",
    steps: [
      "Claude selects the skill based on user instructions or paths pattern, using the description",
      "Contents of SKILL.md are injected as a prompt",
      "Executes the steps in the body (loading reference_files additionally if needed)",
      "Performs specific work using scripts/ and allowed-tools",
      "Returns the artifact (per the output format defined in the skill)",
    ],
    io: { in: "User instructions (keywords matching description) + context", out: "Artifact defined by the skill (file/text/data)" },
    // Settings tab: 4-block structure (request / execution / io_schema / definition)
    fieldSections: [
      { key: "request",    title: "🔵 Call Request",         desc: "What to request from this skill at this node. Changes per flow." },
      { key: "execution",  title: "🟣 Execution Parameters", desc: "Model / allowed tools / effort level etc. — how to run it" },
      { key: "io_schema",  title: "🟢 I/O Shape",            desc: "Expected output schema and concrete examples" },
      { key: "definition", title: "⚪ Skill Definition",      desc: "SKILL.md frontmatter. Defines the skill's capabilities (rarely changed)." },
    ],
    fields: [
      // ─── 🔵 request ───
      { section: "request", key: "request_prompt",  label: "Request",        desc: "Natural language instruction to pass to the skill, e.g. 'Read ○○ and return in △△ format'", long: true, required: true },
      { section: "request", key: "target_files",    label: "Target Files",   desc: "File/folder paths to process",                                                                multi: true },
      { section: "request", key: "arguments_value", label: "Arguments ($ARGUMENTS)", desc: "String passed to $ARGUMENTS / $0 / $1" },

      // ─── 🟣 execution ───
      { section: "execution", key: "model",          label: "Model",          desc: "Model for skill execution", options: ["sonnet","opus","haiku"],
        info: { sonnet: "Balanced. Standard model.", opus: "High capability. For complex tasks.", haiku: "Fast, low-cost. For simple tasks." } },
      { section: "execution", key: "effort",         label: "Effort Level",   desc: "Depth of reasoning", options: ["low","medium","high","xhigh","max"],
        info: { low: "Minimal. Quick answer.", medium: "Standard.", high: "Think carefully.", xhigh: "Think deeply.", max: "Maximum reasoning." } },
      { section: "execution", key: "allowed-tools",  label: "Pre-approved Tools", desc: "Tools usable without prompting during skill execution (e.g. Read, Bash(git *))",
        multi: true, choices: ["Read","Write","Edit","MultiEdit","Bash","Grep","Glob","WebFetch","WebSearch","TodoWrite","Task"],
        info: {
          Read: "Read a file",
          Write: "Create or overwrite a file",
          Edit: "Replace part of a file",
          MultiEdit: "Edit multiple locations in one file at once",
          Bash: "Run a shell command",
          Grep: "Search text in files (ripgrep)",
          Glob: "Search by filename pattern",
          WebFetch: "Fetch a URL and extract content",
          WebSearch: "Web search",
          TodoWrite: "Manage the session todo list",
          Task: "Launch a subagent"
        } },
      { section: "execution", key: "shell",                    label: "Shell",               desc: "Shell for !`cmd` inline execution", options: ["bash","powershell"],
        info: { bash: "Run with bash on Linux/Mac", powershell: "Run with Windows PowerShell" } },
      { section: "execution", key: "disable-model-invocation", label: "Disable Auto-invoke", desc: "Disable Claude's automatic selection when true (manual / only)", options: ["false","true"],
        info: { false: "Claude can auto-select this skill (default)", true: "Disable Claude's auto-selection (manual only)" } },
      { section: "execution", key: "user-invocable",           label: "User-invocable",      desc: "Hide from / menu when false (Claude-auto only)",  options: ["true","false"],
        info: { true: "Can be invoked manually via / menu (default)", false: "Hidden from / menu (Claude-auto only)" } },
      { section: "execution", key: "context",                  label: "Execution Context",   desc: "Run in isolated subagent context when fork", options: ["normal","fork"],
        info: { normal: "Run in main context (default)", fork: "Run in isolated subagent context" } },
      { section: "execution", key: "agent",                    label: "Agent for fork",      desc: "Subagent type to use when context: fork" },

      // ─── 🟢 io_schema ───
      { section: "io_schema", key: "output_schema", label: "Output Schema",   desc: "Expected output format (JSON Schema / TypeScript type / free text)", long: true },
      { section: "io_schema", key: "expected_io",   label: "Expected IN/OUT", desc: "Execution example: 'invoice.pdf → {amount:380000, currency:\"JPY\"}'", long: true },

      // ─── ⚪ definition (rarely changed) ───
      { section: "definition", key: "file",            label: "File Path",         desc: "Save location for SKILL.md" },
      { section: "definition", key: "name",            label: "Skill Name",        desc: "Lowercase letters/numbers/hyphens only. Max 64 characters.", required: true, authoringOnly: true },
      { section: "definition", key: "description",     label: "Trigger",           desc: "Text that makes Claude decide to use this skill. 1,536 character limit.", long: true, required: true, authoringOnly: true },
      { section: "definition", key: "when_to_use",     label: "Additional Trigger", desc: "More specific trigger conditions layered on top of description.",         long: true },
      { section: "definition", key: "argument-hint",   label: "Argument Hint",     desc: "Shown in autocomplete (e.g. [issue-number])" },
      { section: "definition", key: "arguments",       label: "Named Arguments",   desc: "Argument names referenceable as $name",                                    multi: true },
      { section: "definition", key: "reference_files", label: "Reference Files",   desc: "Companion files SKILL.md loads on demand",                                 multi: true },
      { section: "definition", key: "scripts",         label: "Scripts",           desc: "Executable files under scripts/",                                          multi: true },
      { section: "definition", key: "paths",           label: "Auto-activation Paths", desc: "Auto-fires only when editing files matching this glob",                multi: true },
    ],
    definition: `---\nname: example-flow\ndescription: Activated by "Post to X" or "make a tweet". Generates and posts content.\nallowed-tools: Read WebFetch Bash(curl *)\nmodel: sonnet\n---\n\n# X Autopilot Skill\n\n1. Analyze past posts: !\`cat ~/.x-history.json\`\n2. Read style guide: [style-guide.md](style-guide.md)\n3. Generate new post text, confirm with user, then post`,
    expandable: true,
  },
  command: {
    base: "A custom process the user can invoke with /command-name. Encapsulates frequently used routines as components that can be reused in a flow.",
    flowGuide: {
      what:    "Specify the command name (identifier after /)",
      target:  "Format of arguments received via $ARGUMENTS (shown in argument_hint)",
      content: "frontmatter (model / allowed_tools) + prompt body (Markdown)",
      summary: "When /command-name is called, executes the prompt in the frontmatter environment → passes result to next step",
    },
    steps: [
      "User or Claude inputs /command-name + arguments",
      "User argument string is assigned to $ARGUMENTS",
      "Execution environment set via frontmatter model / allowed_tools",
      "Process runs according to the prompt body",
      "Result is passed to the next step",
    ],
    io: { in: "$ARGUMENTS (user argument string)", out: "Command result (text/data)" },
    // fieldSections: separate I/O (flow-specific) from command definition (body)
    fieldSections: [
      { key: "io",         title: "I/O (changes per flow)", desc: "Describe the information this command node receives and returns in the flow context" },
      { key: "command",    title: "Command Definition",     desc: "frontmatter (identification, execution environment) and prompt body" },
    ],
    fields: [
      // I/O — what is received and returned varies by the command's content (subflow). Specified per flow.
      { section: "io",      key: "input",          label: "Input (IN)",      desc: "Data this command receives. Arguments via $ARGUMENTS + information from previous steps.", long: true },
      { section: "io",      key: "output",         label: "Output (OUT)",    desc: "Data this command returns to the next step.",                                              long: true },
      // Command body definition
      { section: "command", key: "name",           label: "Command Name",    desc: "Name after / (e.g. deploy)", required: true, authoringOnly: true },
      { section: "command", key: "description",    label: "Description",     desc: "frontmatter description. One sentence on what the command does." },
      { section: "command", key: "model",          label: "Model",           desc: "Model for command execution", options: ["sonnet","opus","haiku"],
        info: { sonnet: "Balanced — standard model", opus: "High capability — for complex tasks", haiku: "Fast, low-cost — for simple tasks" } },
      { section: "command", key: "allowed_tools",  label: "Allowed Tools",   desc: "List of tools usable inside the command", multi: true },
      { section: "command", key: "argument_hint",  label: "Argument Hint",   desc: "Expected format of $ARGUMENTS (e.g. '<env: prod|staging>')" },
      { section: "command", key: "prompt",         label: "Prompt Body",     desc: "Prompt that runs on command execution (Markdown)", long: true, required: true },
    ],
    definition: `// .claude/commands/deploy.md\n---\ndescription: Pre-deploy check & deployment\nmodel: sonnet\nallowed_tools: [Bash, Read, WebFetch]\nargument_hint: "<env: prod | staging | dev>"\n---\nDeploy to the $ARGUMENTS environment.\n\nFirst check for uncommitted changes with git status; if none, run npm test.\nIf tests pass, run ./scripts/deploy.sh $ARGUMENTS\nand notify the #deploy Slack channel with the result.`,
    // Indicates this node has a subflow (internal flow expansion planned for canvas; not shown in detail panel)
    expandable: true,
  },
  config: {
    base: "Configuration files that define Claude's behavior rules: which tools are available, what permissions apply, etc.",
    steps: [
      "Load ~/.claude/settings.json (user-wide)",
      "Override with project/.claude/settings.json (project)",
      "Further override with settings.local.json (local)",
      "Apply CLAUDE.md (natural language rules)",
    ],
    io: { in: "None (auto-loaded on startup)", out: "Config values (permissions, allowedTools, hooks, env etc.)" },
    fields: [
      { key: "scope", label: "Scope", desc: "user/project/local", options: ["user","project","local"], required: true,
        info: {
          user: "User-wide settings (~/.claude/)",
          project: "Shared project settings (.claude/)",
          local: "Local personal settings (settings.local.json, git-ignored)"
        } },
      { key: "file_type", label: "File Type", desc: "Type of config file", options: ["settings.json","CLAUDE.md",".claudeignore"], required: true,
        info: {
          "settings.json": "JSON config for permissions, hooks, env etc.",
          "CLAUDE.md": "Natural language project rules",
          ".claudeignore": "File patterns Claude should not read"
        } },
    ],
    definition: `// settings.json\n{\n  "permissions": {\n    "allow": ["Bash(npm test)", "Read"],\n    "deny": ["Bash(rm -rf *)"]\n  },\n  "hooks": { ... }\n}`,
  },
  api: {
    base: "An element that calls external APIs — LLMs (Claude/OpenAI/Gemini), REST APIs for various SaaS services, webhooks, etc. Use this for services not covered by MCP.",
    // Common fallback (when meta.service is not specified)
    steps: [
      "Prepare authentication credentials (API key / token / Webhook URL)",
      "Assemble request parameters",
      "Send request over HTTPS",
      "Receive response and pass to the next step",
    ],
    io: { in: "Service-specific parameters + credentials", out: "Response from the service" },
    fields: [
      { key: "service", label: "Service", desc: "Target service", options: ["claude","openai","gemini","line","stripe","discord","rest"], required: true,
        info: {
          claude: "Anthropic Claude API (Messages)",
          openai: "OpenAI Chat Completions API",
          gemini: "Google Gemini API",
          line: "LINE Messaging API (send messages)",
          stripe: "Stripe API (payments, customer management)",
          discord: "Discord Webhook (channel posts)",
          rest: "Generic REST API (any HTTPS not listed above)"
        } },
    ],
    definition: `// Varies by service — see meta.service for details`,

    // ── Dynamic fields / steps / I/O / definition examples per service ──
    fieldsByService: {
      claude: [
        { key: "api_key",     label: "API Key",              desc: "Anthropic API key (ANTHROPIC_API_KEY)",     secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "model",       label: "Model",                desc: "Model to use",                              options: ["claude-sonnet-4-5","claude-opus-4-7","claude-haiku-4-5"], required: true,
          info: {
            "claude-sonnet-4-5": "Balanced — standard model",
            "claude-opus-4-7": "Highest capability — for complex tasks",
            "claude-haiku-4-5": "Fast, low-cost — for simple tasks"
          } },
        { key: "system",      label: "system prompt",        desc: "Assistant role definition",                  long: true },
        { key: "messages",    label: "messages array",       desc: "Conversation history of user/assistant (JSON)", long: true, required: true },
        { key: "tools",       label: "tools (Function Calling)", desc: "Tool definitions for Claude to use (JSON)", long: true },
        { key: "server_tools", label: "Anthropic server tools", desc: "Tools executed server-side", multi: true },
        { key: "temperature", label: "temperature",          desc: "Output variance (0-1)" },
        { key: "max_tokens",  label: "max_tokens",           desc: "Max response length", required: true },
        { key: "cache",       label: "Prompt Cache",         desc: "Reuse long system prompts", options: ["none","ephemeral (5 min)","1 hour"],
          info: {
            "none": "No cache (full send every time)",
            "ephemeral (5 min)": "5-minute cache (for short interactions)",
            "1 hour": "1-hour cache (for long sessions)"
          } },
      ],
      openai: [
        { key: "api_key",     label: "API Key",    desc: "OpenAI API key (OPENAI_API_KEY)",            secret: true, envKey: "OPENAI_API_KEY", required: true },
        { key: "model",       label: "Model",      desc: "Model to use",                               options: ["gpt-4o","gpt-4o-mini","o1","o1-mini","gpt-4-turbo"], required: true,
          info: {
            "gpt-4o": "Flagship — multimodal capable",
            "gpt-4o-mini": "Fast, low-cost lightweight",
            "o1": "Reasoning-focused — math and code",
            "o1-mini": "Reasoning-focused — lightweight",
            "gpt-4-turbo": "Improved classic GPT-4"
          } },
        { key: "system",      label: "system prompt", desc: "Assistant role definition",               long: true },
        { key: "messages",    label: "messages array", desc: "Conversation history of user/assistant (JSON)", long: true, required: true },
        { key: "tools",       label: "tools (Function Calling)", desc: "Tool definitions for OpenAI to use (JSON)", long: true },
        { key: "temperature", label: "temperature",   desc: "Output variance (0-2)" },
        { key: "max_tokens",  label: "max_tokens",    desc: "Max response length" },
      ],
      gemini: [
        { key: "api_key",     label: "API Key",    desc: "Google AI Studio API key (GEMINI_API_KEY)",  secret: true, envKey: "GEMINI_API_KEY", required: true },
        { key: "model",       label: "Model",      desc: "Model to use",                               options: ["gemini-2.0-flash","gemini-2.0-pro","gemini-1.5-flash","gemini-1.5-pro"], required: true,
          info: {
            "gemini-2.0-flash": "Latest generation — fast",
            "gemini-2.0-pro": "Latest generation — high capability",
            "gemini-1.5-flash": "Previous generation — fast",
            "gemini-1.5-pro": "Previous generation — high capability (long context)"
          } },
        { key: "system",      label: "system instruction", desc: "Assistant role definition",          long: true },
        { key: "contents",    label: "contents",    desc: "Conversation history (JSON in parts format)", long: true, required: true },
        { key: "tools",       label: "tools",       desc: "Function Calling definition (JSON)",         long: true },
        { key: "temperature", label: "temperature", desc: "Output variance (0-2)" },
      ],
      line: [
        { key: "channel_access_token", label: "Channel Access Token", desc: "Issued in LINE Developers", secret: true, envKey: "LINE_CHANNEL_ACCESS_TOKEN", required: true },
        { key: "endpoint", label: "Endpoint", desc: "LINE Messaging API operation", options: ["push (individual)","multicast (batch)","broadcast (all)","reply (respond)"], required: true,
          info: {
            "push (individual)": "Send to a specific user (requires userId)",
            "multicast (batch)": "Send to multiple users at once",
            "broadcast (all)": "Send to all friends at once",
            "reply (respond)": "Reply to a message received via Webhook"
          } },
        { key: "to",         label: "Recipient",   desc: "User ID / Group ID / Talk room ID (for push/multicast)" },
        { key: "messages",   label: "messages",    desc: "Array of messages to send (text / image / template etc.)", long: true, required: true },
      ],
      stripe: [
        { key: "secret_key", label: "Secret Key",  desc: "Stripe Secret Key (production/test)",        secret: true, envKey: "STRIPE_SECRET_KEY", required: true },
        { key: "endpoint",   label: "Endpoint",    desc: "Stripe API operation",                       options: ["charges (payment)","customers (customers)","subscriptions (recurring)","payment_intents (PaymentIntents)","invoices (invoices)"], required: true,
          info: {
            "charges (payment)": "One-time payment (legacy API)",
            "customers (customers)": "Create/retrieve customer info",
            "subscriptions (recurring)": "Subscription (recurring billing)",
            "payment_intents (PaymentIntents)": "Modern payment flow (3D Secure support)",
            "invoices (invoices)": "Issue and send invoices"
          } },
        { key: "params",     label: "Parameters",  desc: "Arguments per operation (JSON)",             long: true, required: true },
      ],
      discord: [
        { key: "webhook_url", label: "Webhook URL",  desc: "Discord channel Webhook URL",              secret: true, envKey: "DISCORD_WEBHOOK_URL", required: true },
        { key: "username",    label: "Username",      desc: "Display name for webhook posts (optional)" },
        { key: "content",     label: "Content",       desc: "Post text (Markdown supported)",           long: true, required: true },
        { key: "embeds",      label: "embeds",        desc: "Rich embeds (title/color/fields)",         long: true },
      ],
      rest: [
        { key: "method",      label: "Method",        desc: "HTTP method",                              options: ["GET","POST","PUT","PATCH","DELETE"], required: true,
          info: {
            GET: "Fetch data (no side effects)",
            POST: "Send data (create)",
            PUT: "Update data (full replace)",
            PATCH: "Update data (partial update)",
            DELETE: "Delete data"
          } },
        { key: "url",         label: "URL",           desc: "Request destination URL (https://...)", required: true },
        { key: "auth_type",   label: "Auth Method",   desc: "Type of Authorization header",            options: ["none","Bearer Token","Basic Auth","API Key Header","Custom Header"],
          info: {
            "none": "No auth (public API)",
            "Bearer Token": "Authorization: Bearer <token>",
            "Basic Auth": "Authorization: Basic <base64>",
            "API Key Header": "Dedicated header like X-API-Key",
            "Custom Header": "Send token with any header name"
          } },
        { key: "auth_value",  label: "Auth Value",    desc: "Token / API key value",                   secret: true, envKey: "API_AUTH_TOKEN" },
        { key: "headers",     label: "Headers",       desc: "Additional headers (one per line: Key: Value)", long: true },
        { key: "body",        label: "Body",          desc: "Body for POST/PUT/PATCH (JSON / form / text)", long: true },
        { key: "response_path", label: "Response Path", desc: "jq-style path (e.g. .data.items[0].id)" },
      ],
    },
    stepsByService: {
      claude: [
        "Authenticate with ANTHROPIC_API_KEY",
        "Set model / system / messages / tools / cache_control etc.",
        "POST https://api.anthropic.com/v1/messages",
        "Receive response (assistant message or tool_use)",
        "If tool_use → execute tool → return tool_result → loop",
      ],
      openai: [
        "Authenticate with OPENAI_API_KEY",
        "Set model / messages / tools / response_format etc.",
        "POST https://api.openai.com/v1/chat/completions",
        "Receive response (choices[0].message)",
        "If tool_calls → execute tools → return tool role message → loop",
      ],
      gemini: [
        "Authenticate with GEMINI_API_KEY",
        "Set model / contents / tools / generationConfig etc.",
        "POST https://generativelanguage.googleapis.com/v1/models/{model}:generateContent",
        "Receive response (candidates[0].content)",
        "If functionCall → execute function → return result → loop",
      ],
      line: [
        "Authenticate with LINE_CHANNEL_ACCESS_TOKEN (Bearer)",
        "Set endpoint and to / messages",
        "POST https://api.line.me/v2/bot/message/{endpoint}",
        "Receive response (send success/failure)",
      ],
      stripe: [
        "Authenticate with STRIPE_SECRET_KEY (Basic Auth)",
        "Set endpoint and params",
        "POST https://api.stripe.com/v1/{endpoint}",
        "Receive response (charge / subscription etc. object)",
      ],
      discord: [
        "Prepare DISCORD_WEBHOOK_URL (auth embedded in URL)",
        "Set content / embeds / username",
        "POST {webhook_url}",
        "Receive response (204 No Content or 200 + message object)",
      ],
      rest: [
        "Assemble method / url / auth / headers / body",
        "Send request over HTTPS",
        "Receive response (JSON / text / binary)",
        "Extract relevant part with response_path and pass to next step",
      ],
    },
    ioByService: {
      claude:  { in: "model + system + messages + tools (+ cache)",  out: "assistant message or tool_use block" },
      openai:  { in: "model + messages + tools",                     out: "choices[0].message or tool_calls" },
      gemini:  { in: "model + contents + tools",                     out: "candidates[0].content or functionCall" },
      line:    { in: "endpoint + to + messages",                     out: "Send result (sentMessages[] etc.)" },
      stripe:  { in: "endpoint + params",                            out: "Stripe object (charge/subscription/...)" },
      discord: { in: "webhook_url + content/embeds",                 out: "204 No Content (send complete)" },
      rest:    { in: "method + url + headers + body",                out: "HTTP response (JSON/text/binary)" },
    },
    definitionByService: {
      claude:  `// POST https://api.anthropic.com/v1/messages\n{\n  "model": "claude-sonnet-4-5",\n  "max_tokens": 1024,\n  "system": "You are...",\n  "messages": [{ "role": "user", "content": "..." }],\n  "tools": [{ "name": "...", "input_schema": {...} }]\n}\n// Header: x-api-key: \${ANTHROPIC_API_KEY}`,
      openai:  `// POST https://api.openai.com/v1/chat/completions\n{\n  "model": "gpt-4o",\n  "messages": [\n    { "role": "system", "content": "..." },\n    { "role": "user",   "content": "..." }\n  ],\n  "tools": [{ "type": "function", "function": {...} }]\n}\n// Header: Authorization: Bearer \${OPENAI_API_KEY}`,
      gemini:  `// POST https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=\${GEMINI_API_KEY}\n{\n  "system_instruction": { "parts": [{ "text": "..." }] },\n  "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],\n  "tools": [...]\n}`,
      line:    `// POST https://api.line.me/v2/bot/message/push\n{\n  "to": "USER_ID",\n  "messages": [{ "type": "text", "text": "..." }]\n}\n// Header: Authorization: Bearer \${LINE_CHANNEL_ACCESS_TOKEN}`,
      stripe:  `// POST https://api.stripe.com/v1/charges (Basic Auth: \${STRIPE_SECRET_KEY}:)\nForm body:\n  amount=2000\n  currency=jpy\n  source=tok_visa\n  description="..."`,
      discord: `// POST \${DISCORD_WEBHOOK_URL}\n{\n  "username": "DeployBot",\n  "content": "Deploy complete ✅",\n  "embeds": [{\n    "title": "v1.2.3 released",\n    "color": 5814783\n  }]\n}`,
      rest:    `// Any HTTPS request\n{\n  "method": "POST",\n  "url": "https://api.example.com/v1/resource",\n  "headers": {\n    "Authorization": "Bearer \${API_TOKEN}",\n    "Content-Type": "application/json"\n  },\n  "body": { "key": "value" }\n}`,
    },
  },
  plugin: {
    base: "A package that bundles multiple capabilities (commands, skills, hooks, agents) together. Install once and all included features are available.",
    steps: [
      "Load plugin.json (manifest)",
      "Register included commands/agents/skills/hooks",
      "Connect MCP definition if present",
      "Each feature is activated",
    ],
    io: { in: "Install command", out: "List of registered features" },
    fields: [
      { key: "name", label: "Plugin Name", desc: "Package name", required: true, authoringOnly: true },
      { key: "version", label: "Version", desc: "Semantic version", required: true, authoringOnly: true },
    ],
    definition: `// plugin.json\n{\n  "name": "example-flow",\n  "version": "1.0.0",\n  "commands": ["commands/post.md"],\n  "skills": ["skills/analyze.md"],\n  "hooks": { ... },\n  "agents": ["agents/writer.md"]\n}`,
    expandable: true,
  },
  trigger: {
    base: "The flow start point (trigger). Represents what causes this flow to run — manual, scheduled, webhook, email, chat message, app event, etc. Switch launch mode via meta.source.",
    // Common fallback (when meta.source is not specified)
    steps: [
      "Set up trigger conditions (cron expression / Webhook URL / email filter etc.)",
      "Wait until condition is met",
      "Launch subsequent flow when condition fires",
      "Pass launch data (timestamp / request body / email body etc.) to the next step",
    ],
    io: { in: "(external event)", out: "Trigger to downstream nodes + launch data" },
    fields: [
      { key: "source", label: "Launch Mode", desc: "What causes the flow to start", options: ["manual","cron","webhook","email","chat","app-event"],
        info: {
          manual: "User launches manually (/command or prompt)",
          cron: "Auto-launch on cron expression / schedule",
          webhook: "Launch from an HTTP request from an external service",
          email: "Launch triggered by an incoming email",
          chat: "Launch from a chat message (LINE/Slack/Discord etc.)",
          "app-event": "Launch from an app event (Notion update etc.)"
        } },
    ],
    definition: `// Config varies by launch mode (source) — see meta.source for details`,

    // ── Dynamic fields / steps / I/O / definition examples per source ──
    fieldsBySource: {
      manual: [
        { key: "trigger_type", label: "Launch Method",  desc: "How the user launches the flow", options: ["/slash-command","prompt","UI button"],
          info: {
            "/slash-command": "Launch with a / command",
            "prompt": "Launch with a natural language prompt",
            "UI button": "Launch with a button click"
          } },
        { key: "command",      label: "Command Name",   desc: "/command-name (for slash-command)" },
        { key: "prompt_hint",  label: "Prompt Example", desc: "Example prompts a user might write (reference for trigger conditions)", long: true },
      ],
      cron: [
        { key: "schedule",     label: "Schedule",       desc: "cron expression or interval notation", options: ["Hourly","Daily at 9am","Weekly Mon 9am","Monthly 1st","Custom cron"],
          info: {
            "Hourly": "Run every hour",
            "Daily at 9am": "Run every day at 09:00 (for daily batch)",
            "Weekly Mon 9am": "Run every Monday at 09:00 (for weekly reports)",
            "Monthly 1st": "Run on the 1st of every month (for monthly aggregation)",
            "Custom cron": "Type manually in the cron expression field below"
          } },
        { key: "cron_expr",    label: "Cron Expression", desc: "When Custom selected above (e.g. 0 9 * * *)" },
        { key: "timezone",     label: "Timezone",        desc: "TZ for execution",                    options: ["Asia/Tokyo","UTC","America/New_York","Europe/London"],
          info: {
            "Asia/Tokyo": "Japan Standard Time (JST, UTC+9)",
            "UTC": "Coordinated Universal Time (no offset)",
            "America/New_York": "US Eastern Time (auto DST)",
            "Europe/London": "UK Time (auto DST)"
          } },
        { key: "implementation", label: "Implementation", desc: "Which scheduling mechanism to use", options: ["Anthropic Routines (claude.ai)","CronCreate (in-session)","External cron"],
          info: {
            "Anthropic Routines (claude.ai)": "Official scheduled execution on claude.ai (recommended)",
            "CronCreate (in-session)": "In-memory cron that runs only while the session is active",
            "External cron": "Triggered by OS crontab / GitHub Actions etc."
          } },
      ],
      webhook: [
        { key: "webhook_url",  label: "Webhook URL",    desc: "URL that receives POST/GET from external services (issued by your backend)", secret: true, envKey: "WEBHOOK_URL" },
        { key: "method",       label: "HTTP Method",    desc: "Accepted methods",                     options: ["POST","GET","PUT","ANY"],
          info: {
            POST: "Accept POST only (typical webhook)",
            GET: "Accept GET only (URL parameter intake)",
            PUT: "Accept PUT only",
            ANY: "Accept all methods"
          } },
        { key: "auth",         label: "Auth",           desc: "Authentication on webhook receipt",    options: ["none","HMAC signature","Bearer Token","Basic Auth"],
          info: {
            "none": "No auth (public endpoint, risky)",
            "HMAC signature": "Verify sender with HMAC signature (GitHub/Stripe etc.)",
            "Bearer Token": "Auth with Authorization: Bearer <token>",
            "Basic Auth": "Auth with username/password"
          } },
        { key: "auth_secret",  label: "Auth Secret",    desc: "Secret or token for signature verification", secret: true, envKey: "WEBHOOK_SECRET" },
        { key: "payload_path", label: "Payload Path",   desc: "Part of request body to use (jq-style: .data.user.id etc.)" },
      ],
      email: [
        { key: "email_account", label: "Email Account",    desc: "Mailbox to monitor (Gmail/IMAP)" },
        { key: "auth_token",    label: "Auth Token",       desc: "OAuth token or IMAP password",       secret: true, envKey: "EMAIL_AUTH_TOKEN" },
        { key: "filter",        label: "Receive Filter",   desc: "Conditions for target emails (Gmail search syntax: from:.. subject:.. is:unread etc.)", long: true },
        { key: "polling_interval", label: "Check Interval", desc: "How often to check for emails",    options: ["1 min","5 min","15 min","1 hour"],
          info: {
            "1 min": "Check every minute (priority responsiveness, high API usage)",
            "5 min": "Check every 5 minutes (recommended balance)",
            "15 min": "Check every 15 minutes (lower cost)",
            "1 hour": "Check every hour (low priority, minimal cost)"
          } },
      ],
      chat: [
        { key: "chat_platform", label: "Chat Platform", desc: "Source platform",                      options: ["LINE","Slack","Discord","Telegram","Embedded chat","MCP elicitation"],
          info: {
            "LINE": "Receive messages from LINE Bot",
            "Slack": "Receive messages from Slack Bot",
            "Discord": "Receive messages from Discord Bot",
            "Telegram": "Receive messages from Telegram Bot",
            "Embedded chat": "Chat UI embedded in your own site",
            "MCP elicitation": "MCP user input request (elicitation)"
          } },
        { key: "auth_token",    label: "Auth Token",    desc: "Bot Token / Channel Access Token",      secret: true, envKey: "CHAT_AUTH_TOKEN" },
        { key: "filter",        label: "Launch Condition", desc: "Message conditions to trigger launch (e.g. mentions, specific keywords, specific channel)", long: true },
      ],
      "app-event": [
        { key: "app",            label: "Target App",    desc: "Event source",                         options: ["Notion","Linear","GitHub","Stripe","Google Calendar","Airtable","Shopify","Slack","Custom"],
          info: {
            "Notion": "Change events for Notion pages/DBs",
            "Linear": "Change events for Issues/Projects",
            "GitHub": "Issue / PR / Push and other events",
            "Stripe": "Billing events like payment success/failure",
            "Google Calendar": "Create/update/delete events for calendar entries",
            "Airtable": "Record change events",
            "Shopify": "EC events like orders and inventory",
            "Slack": "Events like messages and reactions",
            "Custom": "Any app not listed above"
          } },
        { key: "event_type",     label: "Event Type",    desc: "Event in the target app (new Issue / PR opened / payment success etc.)" },
        { key: "auth_token",     label: "Auth Token",    desc: "API key / OAuth token for the target app", secret: true, envKey: "APP_AUTH_TOKEN" },
        { key: "filter",         label: "Event Condition", desc: "Narrow down events to fire on (e.g. label=bug only)", long: true },
        { key: "implementation", label: "Receive Method", desc: "Implementation method",               options: ["MCP polling","Webhook (configure in app)","Polling (periodic query)"],
          info: {
            "MCP polling": "MCP server periodically fetches changes",
            "Webhook (configure in app)": "Register URL in the app → immediate event notification (recommended)",
            "Polling (periodic query)": "We periodically query the API ourselves"
          } },
      ],
    },
    stepsBySource: {
      manual: [
        "User inputs a prompt or /command",
        "Claude Code interprets the command/prompt",
        "Launch the flow body",
      ],
      cron: [
        "Register launch condition per implementation method (Routines / cron)",
        "Launch at the specified time or interval",
        "No previous step → launch the first node of the flow body",
      ],
      webhook: [
        "Issue Webhook URL (backend provides a listening endpoint)",
        "External service POSTs/GETs to that URL",
        "Auth/signature check → parse payload",
        "Pass payload (or part extracted by payload_path) to the flow and launch",
      ],
      email: [
        "Connect to the email account via OAuth/IMAP",
        "Check incoming mail on each polling_interval",
        "Find an email matching filter conditions",
        "Pass email content (from/subject/body) to the flow and launch",
      ],
      chat: [
        "Register bot with the platform (LINE/Slack/Discord/...)",
        "User sends a message → received via bot",
        "Find a message matching filter conditions",
        "Pass message content + sender info to the flow and launch",
      ],
      "app-event": [
        "Configure Webhook or MCP polling in the target app",
        "Event fires in the app (new Issue etc.)",
        "Event passes the filter conditions",
        "Pass event data to the flow and launch",
      ],
    },
    ioBySource: {
      manual:      { in: "User's prompt or /command + arguments",    out: "Downstream flow + user input data" },
      cron:        { in: "(time reached)",                            out: "Downstream flow + launch timestamp" },
      webhook:     { in: "HTTP request (headers + body)",            out: "Downstream flow + payload" },
      email:       { in: "Incoming email (from / subject / body / attachments)", out: "Downstream flow + email content" },
      chat:        { in: "Chat message + sender info",               out: "Downstream flow + message content" },
      "app-event": { in: "App event data (JSON)",                    out: "Downstream flow + event data" },
    },
    definitionBySource: {
      manual:      `// Example: launch with /tldr command\n{\n  "trigger": "manual",\n  "command": "/tldr",\n  "prompt_hint": "Paste URL → summarize and return"\n}`,
      cron:        `// Anthropic Routines (on claude.ai)\n// or .claude/cron.json\n{\n  "trigger": "cron",\n  "schedule": "0 9 * * *",  // every day at 9am\n  "timezone": "Asia/Tokyo"\n}`,
      webhook:     `// webhook endpoint received by backend\nPOST /api/triggers/webhook/{flow_id}\nHeader: X-Signature: sha256=...\nBody: { "user": {...}, "action": "..." }\n→ pass payload to downstream flow`,
      email:       `// Email monitoring config\n{\n  "trigger": "email",\n  "account": "support@example.com",\n  "filter": "is:unread label:invoices",\n  "polling": "5min"\n}`,
      chat:        `// LINE Bot Webhook\nPOST https://api.line.me/v2/webhook\nBody: {\n  "events": [{\n    "type": "message",\n    "message": { "type": "text", "text": "..." },\n    "source": { "userId": "U..." }\n  }]\n}`,
      "app-event": `// Notion → MCP polling example\n{\n  "trigger": "app-event",\n  "app": "Notion",\n  "event_type": "page.created",\n  "filter": "database_id == '...' && status == 'New'",\n  "implementation": "MCP polling"\n}`,
    },
  },

  schedule: {
    base: "[Placeholder element] A trigger element that automatically launches a flow on a recurring schedule via cron/timer. Not yet in Anthropic's official element taxonomy — added here to support workflow description.",
    steps: [
      "Register schedule with a cron expression (e.g. 0 9 * * *) or interval (e.g. every 1h)",
      "When the specified time arrives, launch the downstream flow (Subagent/Skill etc.)",
      "Record execution log",
    ],
    io: { in: "cron expression / interval", out: "trigger to downstream node" },
    fields: [
      { key: "cron", label: "Cron Expression", desc: "e.g. 0 9 * * * (every day at 9am)", required: true },
    ],
    definition: `// Placeholder structure example\n{\n  "schedule": "0 9 * * *",\n  "skill": "slack-digest"\n}`,
  },
  parallel: {
    base: "[Placeholder element] A control element that launches multiple Subagents/tasks simultaneously (fan-out) and aggregates results (fan-in). Added to visualize the pattern of calling multiple Tasks in one message.",
    steps: [
      "Fan-out: parent agent launches multiple child tasks in parallel",
      "Each child task processes independently in its own context",
      "Fan-in: wait for all tasks to complete then aggregate results",
    ],
    io: { in: "set of tasks to launch in parallel", out: "aggregated results" },
    fields: [],
    definition: `// Multiple Task calls in one message → parallel execution\n[\n  { tool: "Task", input: { subagent: "explore-docs" }},\n  { tool: "Task", input: { subagent: "explore-code" }},\n  { tool: "Task", input: { subagent: "web-search"   }}\n]`,
  },
  agentsdk: {
    base: "A development kit for launching and controlling Claude agents programmatically. Lets you call Claude Code as a library from your own app or script — available in three forms: TypeScript / Python / REST (Managed).",
    // Common fallback (when meta.runtime is not specified)
    steps: [
      "Authenticate with API key",
      "Build configuration with ClaudeAgentOptions (model / allowed_tools / system etc.)",
      "Launch agent with query()",
      "Agent enters a loop automatically executing tool_use",
      "Approve/reject each tool execution with can_use_tool (optional)",
      "Return final result",
    ],
    io: { in: "prompt + configuration object", out: "agent execution result" },
    fields: [
      { key: "runtime", label: "Runtime", desc: "SDK language/form", options: ["typescript","python","managed"], required: true,
        info: {
          typescript: "Implement with TypeScript / Node.js SDK",
          python: "Implement with Python SDK",
          managed: "Anthropic-hosted (Managed Agents REST API)"
        } },
    ],
    definition: `// Implementation varies by runtime — see meta.runtime for details`,

    // ── Dynamic fields / steps / I/O / definition examples per runtime ──
    fieldsByRuntime: {
      typescript: [
        { key: "api_key",         label: "API Key",         desc: "Anthropic API key",                       secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "entry",           label: "Entry Point",     desc: "Execution method",                         options: ["query() (one-shot)","SDKClient (interactive session)"], required: true,
          info: {
            "query() (one-shot)": "Complete in a single request (simple, recommended)",
            "SDKClient (interactive session)": "Hold client for multi-turn interaction"
          } },
        { key: "model",           label: "Model",           desc: "Model to use",                             options: ["sonnet","opus","haiku"], required: true,
          info: { sonnet: "Balanced, standard model", opus: "High-performance, for complex tasks", haiku: "Fast, low-cost, for simple tasks" } },
        { key: "system",          label: "System Prompt",   desc: "Agent role configuration",                 long: true },
        { key: "prompt",          label: "Prompt",          desc: "Instructions for the agent",               long: true, required: true },
        { key: "allowedTools",    label: "Allowed Tools",   desc: "List of tools the agent may use",          multi: true },
        { key: "permissionMode",  label: "Permission Mode", desc: "Tool approval method",                     options: ["default","acceptEdits","plan","bypassPermissions"],
          info: {
            default: "Ask user each time",
            acceptEdits: "Auto-approve edit operations",
            plan: "Plan only (no writes)",
            bypassPermissions: "Run all tools without approval (advanced)"
          } },
        { key: "maxTurns",        label: "Max Turns",       desc: "Upper limit on tool-call loop iterations" },
        { key: "settingSources",  label: "Settings Source", desc: "Where to load settings.json from",         options: ["project","user","none"],
          info: {
            project: "Use project .claude/settings.json",
            user: "Use user ~/.claude/settings.json",
            none: "Do not load settings file (code only)"
          } },
        { key: "canUseTool",      label: "can_use_tool",    desc: "Function to approve tool execution with custom logic (optional)" },
      ],
      python: [
        { key: "api_key",         label: "API Key",         desc: "Anthropic API key",                       secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "entry",           label: "Entry Point",     desc: "Execution method",                         options: ["query() (one-shot)","ClaudeSDKClient (interactive session)"], required: true,
          info: {
            "query() (one-shot)": "Complete in a single request (simple, recommended)",
            "ClaudeSDKClient (interactive session)": "Hold client for multi-turn interaction"
          } },
        { key: "model",           label: "Model",           desc: "Model to use",                             options: ["sonnet","opus","haiku"], required: true,
          info: { sonnet: "Balanced, standard model", opus: "High-performance, for complex tasks", haiku: "Fast, low-cost, for simple tasks" } },
        { key: "system",          label: "System Prompt",   desc: "Agent role configuration",                 long: true },
        { key: "prompt",          label: "Prompt",          desc: "Instructions for the agent",               long: true, required: true },
        { key: "allowed_tools",   label: "Allowed Tools",   desc: "List of tools the agent may use",          multi: true },
        { key: "permission_mode", label: "Permission Mode", desc: "Tool approval method",                     options: ["default","acceptEdits","plan","bypassPermissions"],
          info: {
            default: "Ask user each time",
            acceptEdits: "Auto-approve edit operations",
            plan: "Plan only (no writes)",
            bypassPermissions: "Run all tools without approval (advanced)"
          } },
        { key: "max_turns",       label: "Max Turns",       desc: "Upper limit on tool-call loop iterations" },
        { key: "setting_sources", label: "Settings Source", desc: "Where to load settings.json from",         options: ["project","user","none"],
          info: {
            project: "Use project .claude/settings.json",
            user: "Use user ~/.claude/settings.json",
            none: "Do not load settings file (code only)"
          } },
        { key: "can_use_tool",    label: "can_use_tool",    desc: "Function to approve tool execution with custom logic (optional)" },
      ],
      managed: [
        { key: "api_key",         label: "API Key",         desc: "Anthropic API key",                       secret: true, envKey: "ANTHROPIC_API_KEY", required: true },
        { key: "agent_id",        label: "Agent ID",        desc: "ID of the agent created in the Anthropic console", required: true },
        { key: "thread_id",       label: "Thread ID",       desc: "Conversation thread ID (for continuing sessions; leave empty for new)" },
        { key: "model",           label: "Model",           desc: "Model to use (agent-side setting takes priority if fixed)", options: ["sonnet","opus","haiku"],
          info: { sonnet: "Balanced, standard model", opus: "High-performance, for complex tasks", haiku: "Fast, low-cost, for simple tasks" } },
        { key: "prompt",          label: "Prompt",          desc: "Instructions for the agent",               long: true, required: true },
        { key: "stream",          label: "Streaming",       desc: "Whether to receive results incrementally", options: ["false","true"],
          info: { false: "Receive all at once on completion", true: "Receive partial responses as they are generated" } },
      ],
    },
    stepsByRuntime: {
      typescript: [
        "Authenticate with ANTHROPIC_API_KEY (env variable or passed in options)",
        "import { query } from '@anthropic-ai/claude-agent-sdk'",
        "Build options and call query() (or new SDKClient)",
        "Agent returns messages as an async generator → process with for-await",
        "tool_use loop runs automatically internally (can interrupt with canUseTool)",
        "Extract final result and pass to app logic",
      ],
      python: [
        "Authenticate with ANTHROPIC_API_KEY",
        "from claude_agent_sdk import query, ClaudeAgentOptions",
        "Build options and call query() (or ClaudeSDKClient for interaction)",
        "Receive messages via async iterator",
        "tool_use loop runs automatically internally (can interrupt with can_use_tool)",
        "Extract final result and pass to app logic",
      ],
      managed: [
        "Authenticate with ANTHROPIC_API_KEY (Authorization: Bearer)",
        "Pre-create agent in Anthropic console → obtain agent_id",
        "POST /v1/agents/{agent_id}/messages with prompt",
        "tool_use loop completes on Anthropic's side (server-side execution)",
        "Continue conversation with thread_id",
        "Receive result as JSON",
      ],
    },
    ioByRuntime: {
      typescript: { in: "ClaudeAgentOptions + prompt", out: "AsyncGenerator<Message> (tool execution history + final result)" },
      python:     { in: "ClaudeAgentOptions + prompt", out: "AsyncIterator[Message] (tool execution history + final result)" },
      managed:    { in: "agent_id + prompt (+ thread_id)", out: "Hosted execution JSON response (assistant message + tool execution history)" },
    },
    definitionByRuntime: {
      typescript: `// TypeScript / Node.js\nimport { query } from "@anthropic-ai/claude-agent-sdk";\n\nfor await (const msg of query({\n  prompt: "Run pre-deploy checks",\n  options: {\n    model: "sonnet",\n    allowedTools: ["Read", "Bash", "Grep"],\n    permissionMode: "acceptEdits",\n    maxTurns: 20,\n  },\n})) {\n  console.log(msg);\n}\n// Auth: process.env.ANTHROPIC_API_KEY`,
      python:     `# Python\nfrom claude_agent_sdk import query, ClaudeAgentOptions\nimport asyncio\n\nasync def main():\n    options = ClaudeAgentOptions(\n        model="sonnet",\n        allowed_tools=["Read", "Bash", "Grep"],\n        permission_mode="acceptEdits",\n        max_turns=20,\n    )\n    async for msg in query(prompt="Run pre-deploy checks", options=options):\n        print(msg)\n\nasyncio.run(main())\n# Auth: os.environ["ANTHROPIC_API_KEY"]`,
      managed:    `# Managed Agents (REST)\n# POST https://api.anthropic.com/v1/agents/{agent_id}/messages\ncurl https://api.anthropic.com/v1/agents/ag_xxxx/messages \\\n  -H "Authorization: Bearer $ANTHROPIC_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "prompt": "Run pre-deploy checks",\n    "thread_id": null,\n    "stream": false\n  }'`,
    },
  },
};


// ═══════════════════════════════════════════════════════
// ELEMENTS — Whiteboard element catalog (Tier 1-3, ~130 cards)
// (moved from whiteboard.html 558-1144 — master: finalized in 8093)
// ═══════════════════════════════════════════════════════

// ══════════ PARTS (practical parts) ══════════
// Pre-configured nodes usable as "business verbs". Same shape as ELEMENTS (cat/type/id/title/subtitle/desc/meta).
// Where ELEMENTS is "a catalog of Claude Code primitives (technical units)",
// PARTS is "practical units like 'send email' / 'add calendar event'". Appears in the "🧱 Parts" tab of the non-engineer palette.
//
// Each part's meta.capability is the key into PART_FIELDS, which provides field definitions (labels/input types) for the practical core.
// meta.core holds default values for the practical core. Details (server/auth/action etc.) are handled via TYPE_SPECS as usual.
window.FI.PARTS = [
  // ── 🚩 Flow common (start/end of all flows = skill I/O contract. Auto-injected when flowized) ──
  { cat: "🚩 Flow Common", tier: 1, type: "trigger", id: "part-flow-start", title: "Flow Start", subtitle: "Input & Trigger",
    desc: "The entry point of this flow (skill). Defines what input it receives and what triggers it to run.",
    meta: { capability: "flow.start" } },
  { cat: "🚩 Flow Common", tier: 1, type: "parent", id: "part-flow-end", title: "Flow Complete", subtitle: "Output & Notification",
    desc: "The exit point of this flow (skill). Defines what it ultimately produces and where to notify on completion.",
    meta: { capability: "flow.end" } },

  // ── 📧 Gmail (connected MCP / draft-centric = safe design with no direct send) ──
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-draft", title: "Draft an Email", subtitle: "Gmail",
    desc: "Create a Gmail draft with recipient, subject, and body (saves as draft only — no send = safe against accidental delivery).",
    meta: { server: "gmail", action: "tool", tool_name: "create_draft", capability: "gmail.create_draft" } },
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-search", title: "Search Emails", subtitle: "Gmail",
    desc: "Search emails by conditions like sender, unread status, or date range.",
    meta: { server: "gmail", action: "tool", tool_name: "search_threads", capability: "gmail.search_threads" } },
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-read", title: "Read Thread", subtitle: "Gmail",
    desc: "Fetch the body, subject, and sender of a target email thread.",
    meta: { server: "gmail", action: "tool", tool_name: "get_thread", capability: "gmail.get_thread" } },
  { cat: "📧 Gmail", tier: 1, type: "mcp", id: "part-gmail-label", title: "Apply Label", subtitle: "Gmail",
    desc: "Assign a label to a thread for organization.",
    meta: { server: "gmail", action: "tool", tool_name: "label_thread", capability: "gmail.label_thread" } },

  // ── 📅 Google Calendar ──
  { cat: "📅 Calendar", tier: 1, type: "mcp", id: "part-cal-create", title: "Add Event", subtitle: "Google Calendar",
    desc: "Create a calendar event with title, date/time, and attendees.",
    meta: { server: "google-calendar", action: "tool", tool_name: "create_event", capability: "calendar.create_event" } },
  { cat: "📅 Calendar", tier: 1, type: "mcp", id: "part-cal-list", title: "List Events", subtitle: "Google Calendar",
    desc: "Retrieve a list of calendar events for a specified period.",
    meta: { server: "google-calendar", action: "tool", tool_name: "list_events", capability: "calendar.list_events" } },
  { cat: "📅 Calendar", tier: 1, type: "mcp", id: "part-cal-suggest", title: "Find Free Time", subtitle: "Google Calendar",
    desc: "Suggest time slots when all attendees are available.",
    meta: { server: "google-calendar", action: "tool", tool_name: "suggest_time", capability: "calendar.suggest_time" } },
  { cat: "📅 Calendar", tier: 1, type: "mcp", id: "part-cal-respond", title: "Respond to Invite", subtitle: "Google Calendar",
    desc: "Accept or decline an event invitation.",
    meta: { server: "google-calendar", action: "tool", tool_name: "respond_to_event", capability: "calendar.respond_to_event" } },

  // ── 📁 Google Drive ──
  { cat: "📁 Drive", tier: 1, type: "mcp", id: "part-drive-search", title: "Search Files", subtitle: "Google Drive",
    desc: "Search for files in Drive by keyword.",
    meta: { server: "google-drive", action: "tool", tool_name: "search_files", capability: "drive.search_files" } },
  { cat: "📁 Drive", tier: 1, type: "mcp", id: "part-drive-read", title: "Read File", subtitle: "Google Drive",
    desc: "Retrieve the content of a target file as text.",
    meta: { server: "google-drive", action: "tool", tool_name: "read_file_content", capability: "drive.read_file_content" } },
  { cat: "📁 Drive", tier: 1, type: "mcp", id: "part-drive-create", title: "Create File", subtitle: "Google Drive",
    desc: "Create a new file in Drive with a name and content.",
    meta: { server: "google-drive", action: "tool", tool_name: "create_file", capability: "drive.create_file" } },

  // ── 📝 Notion ──
  { cat: "📝 Notion", tier: 1, type: "mcp", id: "part-notion-create", title: "Create Page", subtitle: "Notion",
    desc: "Create a Notion page with a title and body.",
    meta: { server: "notion", action: "tool", tool_name: "notion-create-pages", capability: "notion.create_pages" } },
  { cat: "📝 Notion", tier: 1, type: "mcp", id: "part-notion-search", title: "Search Notion", subtitle: "Notion",
    desc: "Search the Notion workspace by keyword.",
    meta: { server: "notion", action: "tool", tool_name: "notion-search", capability: "notion.search" } },
  { cat: "📝 Notion", tier: 1, type: "mcp", id: "part-notion-update", title: "Update Page", subtitle: "Notion",
    desc: "Append or update content on a target page.",
    meta: { server: "notion", action: "tool", tool_name: "notion-update-page", capability: "notion.update_page" } },

  // ── 💬 iMessage ──
  { cat: "💬 iMessage", tier: 1, type: "mcp", id: "part-imsg-send", title: "Send Message", subtitle: "iMessage",
    desc: "Send an iMessage to a specified recipient.",
    meta: { server: "imessage", action: "tool", tool_name: "send_imessage", capability: "imessage.send" } },
  { cat: "💬 iMessage", tier: 1, type: "mcp", id: "part-imsg-unread", title: "Read Unread", subtitle: "iMessage",
    desc: "Fetch unread iMessages.",
    meta: { server: "imessage", action: "tool", tool_name: "get_unread_imessages", capability: "imessage.unread" } },
  { cat: "💬 iMessage", tier: 1, type: "mcp", id: "part-imsg-contact", title: "Find Contact", subtitle: "iMessage",
    desc: "Search contacts by name, phone, or email.",
    meta: { server: "imessage", action: "tool", tool_name: "search_contacts", capability: "imessage.search_contacts" } },

  // ── 🗄 Local DB (code wrapper / sqlite etc.) ──
  { cat: "🗄 Local DB", tier: 1, type: "code", id: "part-db-record", title: "Record Data", subtitle: "Local DB",
    desc: "Write data to a local database (e.g. ~/data/app.sqlite).",
    meta: { tool: "Bash", capability: "localdb.record" } },
  { cat: "🗄 Local DB", tier: 1, type: "code", id: "part-db-query", title: "Query Data", subtitle: "Local DB",
    desc: "Retrieve data from a local DB with specified conditions.",
    meta: { tool: "Bash", capability: "localdb.query" } },
  { cat: "🗄 Local DB", tier: 1, type: "code", id: "part-db-update", title: "Update Record", subtitle: "Local DB",
    desc: "Update the content of a target record.",
    meta: { tool: "Bash", capability: "localdb.update" } },

  // ── 🤖 Claude (LLM call) = think. Have the main Claude itself reason ──
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-write", title: "Write Text", subtitle: "Claude Call",
    desc: "Have Claude write text (article, body, manuscript) based on provided materials.",
    meta: { capability: "think.task" } },
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-summarize", title: "Summarize", subtitle: "Claude Call",
    desc: "Have Claude summarize a long document or materials.",
    meta: { capability: "think.task" } },
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-review", title: "Review", subtitle: "Claude Call",
    desc: "Have Claude review and check deliverables against a set of criteria.",
    meta: { capability: "think.task" } },
  { cat: "🤖 Claude (LLM)", tier: 1, type: "think", id: "part-think-format", title: "Format", subtitle: "Claude Call",
    desc: "Have Claude reformat or clean up text style and structure.",
    meta: { capability: "think.task" } },

  // ── 👥 Subagent = delegate to a separate Claude instance ──
  { cat: "👥 Subagent", tier: 1, type: "subagent", id: "part-sa-investigate", title: "Investigate", subtitle: "Subagent",
    desc: "Delegate research to a separate Claude context and have results written to a file.",
    meta: { capability: "subagent.task" } },
  { cat: "👥 Subagent", tier: 1, type: "subagent", id: "part-sa-build", title: "Build / Generate", subtitle: "Subagent",
    desc: "Delegate an implementation or generation task to a separate Claude context.",
    meta: { capability: "subagent.task" } },
  { cat: "👥 Subagent", tier: 1, type: "subagent", id: "part-sa-review", title: "Peer Review", subtitle: "Subagent",
    desc: "Delegate objective review to a separate Claude context.",
    meta: { capability: "subagent.task" } },

  // ── ⚙ Code & Files = code ──
  { cat: "⚙ Code & Files", tier: 1, type: "code", id: "part-code-read", title: "Read File", subtitle: "Code",
    desc: "Read the content of a file.",
    meta: { tool: "Read", capability: "code.read" } },
  { cat: "⚙ Code & Files", tier: 1, type: "code", id: "part-code-write", title: "Write File", subtitle: "Code",
    desc: "Create a new file or overwrite an existing one.",
    meta: { tool: "Write", capability: "code.write" } },
  { cat: "⚙ Code & Files", tier: 1, type: "code", id: "part-code-run", title: "Run Command", subtitle: "Code",
    desc: "Execute a shell command or script.",
    meta: { tool: "Bash", capability: "code.run" } },
  { cat: "⚙ Code & Files", tier: 1, type: "code", id: "part-code-search", title: "Search", subtitle: "Code",
    desc: "Search for text within files or search by filename.",
    meta: { tool: "Grep", capability: "code.search" } },

  // ── 📄 Document creation (official skill / builtin = implementation private) ──
  { cat: "📄 Documents", tier: 1, type: "skill", id: "part-skill-docx", title: "Create Word Doc", subtitle: "docx skill",
    desc: "Create a Word document (.docx) based on the requested content.",
    meta: { skill_name: "docx", builtin: true, capability: "skill.document" } },
  { cat: "📄 Documents", tier: 1, type: "skill", id: "part-skill-pptx", title: "Create Slides", subtitle: "pptx skill",
    desc: "Create a PowerPoint presentation (.pptx) based on the requested content.",
    meta: { skill_name: "pptx", builtin: true, capability: "skill.document" } },
  { cat: "📄 Documents", tier: 1, type: "skill", id: "part-skill-pdf", title: "Create PDF", subtitle: "pdf skill",
    desc: "Create a PDF based on the requested content.",
    meta: { skill_name: "pdf", builtin: true, capability: "skill.document" } },
  { cat: "📄 Documents", tier: 1, type: "skill", id: "part-skill-xlsx", title: "Create Spreadsheet", subtitle: "xlsx skill",
    desc: "Create an Excel spreadsheet (.xlsx) based on the requested content.",
    meta: { skill_name: "xlsx", builtin: true, capability: "skill.document" } },
  { cat: "📄 Documents", tier: 1, type: "skill", id: "part-skill-custom", title: "Call Custom Skill", subtitle: "Skill",
    desc: "Call a skill you created as a component.",
    meta: { capability: "skill.custom" } },

  // ── 🔀 Branch & Confirm ──
  { cat: "🔀 Branch & Confirm", tier: 1, type: "decision", id: "part-decision", title: "Branch on Condition", subtitle: "Branch",
    desc: "Split the processing route to yes / no based on a condition.",
    meta: { capability: "decision.branch" } },
  { cat: "🔀 Branch & Confirm", tier: 1, type: "user", id: "part-user-confirm", title: "Ask User", subtitle: "User Action",
    desc: "Request confirmation or input from a human.",
    meta: { capability: "user.confirm" } },

  // ── 🌐 External API (services without MCP / other LLMs) ──
  { cat: "🌐 External API", tier: 1, type: "api", id: "part-api-llm", title: "Call Another LLM", subtitle: "Claude/OpenAI/Gemini",
    desc: "Send a request to an external LLM API (Claude / OpenAI / Gemini) and receive the result.",
    meta: { capability: "api.llm" } },
  { cat: "🌐 External API", tier: 1, type: "api", id: "part-api-discord", title: "Post to Discord", subtitle: "Discord Webhook",
    desc: "Post a message to a Discord channel.",
    meta: { service: "discord", capability: "api.discord" } },
  { cat: "🌐 External API", tier: 1, type: "api", id: "part-api-line", title: "Send via LINE", subtitle: "LINE Messaging",
    desc: "Send a message via LINE.",
    meta: { service: "line", capability: "api.line" } },
];

// ── PART_FIELDS: practical core field definitions per capability (the "core" side of the 2-layer UI) ──
// Only business-language fields — no details (server/auth/params-JSON).
window.FI.PART_FIELDS = {
  // 🚩 Flow common — start/end (skill I/O contract = interface)
  "flow.start": [
    { key: "input",   label: "Input",        long: true, required: true,
      desc: "Materials this flow receives (e.g. input/interview-notes.docx, text provided by the user)" },
    { key: "trigger", label: "Trigger Type", required: true,
      options: ["/command", "file change", "schedule", "manual", "Webhook"],
      info: {
        "/command":    "Launch manually with /skill-name",
        "file change": "Auto-launch on change to specific folder/file",
        "schedule":    "Scheduled execution (cron etc.)",
        "manual":      "User starts explicitly",
        "Webhook":     "Launch on notification from external system",
      } },
  ],
  "flow.end": [
    { key: "outputs", label: "Outputs",      long: true, required: true,
      desc: "Final deliverables this flow produces (e.g. output/article.docx, recorded DB row)" },
    { key: "notify",  label: "Notify",       required: false,
      desc: "Where to notify on completion (e.g. Slack #general, email, none)" },
  ],
  "gmail.create_draft": [
    { key: "to",      label: "To",      required: true,  placeholder: "tanaka@example.com" },
    { key: "subject", label: "Subject", required: true,  placeholder: "[Delivered] Case Study Article" },
    { key: "body",    label: "Body",    long: true, required: true,  desc: "Email body" },
  ],
  "gmail.search_threads": [
    { key: "query",       label: "Search Query", required: true,  desc: "e.g. is:unread from:tanaka after:2026-05-01" },
    { key: "max_results", label: "Max Results",  required: false, desc: "Default 20" },
  ],
  "gmail.get_thread": [
    { key: "thread_id", label: "Target Thread", required: true, desc: "Thread ID or select from search" },
  ],
  "gmail.label_thread": [
    { key: "thread_id", label: "Target Thread", required: true },
    { key: "label",     label: "Label Name",    required: true, desc: "e.g. Work / Follow-up" },
  ],

  // 📅 Calendar
  "calendar.create_event": [
    { key: "summary",        label: "Title",      required: true, placeholder: "Meeting" },
    { key: "startTime",      label: "Start Time", required: true, desc: "e.g. 2026-06-03T14:00:00" },
    { key: "endTime",        label: "End Time",   required: true, desc: "e.g. 2026-06-03T15:00:00" },
    { key: "location",       label: "Location",   required: false },
    { key: "attendeeEmails", label: "Attendees",  required: false, multi: true, desc: "Email addresses" },
  ],
  "calendar.list_events": [
    { key: "startTime", label: "Period Start", required: false, desc: "e.g. 2026-06-01T00:00:00" },
    { key: "endTime",   label: "Period End",   required: false },
    { key: "fullText",  label: "Keyword",      required: false, desc: "Filter by title, location, or attendees" },
  ],
  "calendar.suggest_time": [
    { key: "attendeeEmails",  label: "Attendees",       required: true, multi: true, desc: "Emails of people to find availability for (self = primary)" },
    { key: "startTime",       label: "Window Start",    required: true },
    { key: "endTime",         label: "Window End",      required: true },
    { key: "durationMinutes", label: "Duration (min)",  required: false, desc: "Default 30" },
  ],
  "calendar.respond_to_event": [
    { key: "eventId",        label: "Target Event", required: true },
    { key: "responseStatus", label: "Response",     required: true, options: ["accepted", "declined", "tentative"],
      info: { accepted: "Accept", declined: "Decline", tentative: "Tentative" } },
  ],

  // 📁 Drive
  "drive.search_files": [
    { key: "query", label: "Search Keyword", required: true, desc: "e.g. title contains 'invoice' / fullText contains 'estimate'" },
  ],
  "drive.read_file_content": [
    { key: "fileId", label: "Target File", required: true, desc: "File ID (obtained from search)" },
  ],
  "drive.create_file": [
    { key: "title",       label: "File Name",   required: true },
    { key: "textContent", label: "Content",     long: true, required: false },
    { key: "parentId",    label: "Location",    required: false, desc: "Folder ID (default: My Drive root)" },
  ],

  // 📝 Notion
  "notion.create_pages": [
    { key: "title",   label: "Title",    required: true },
    { key: "content", label: "Body",     long: true, required: false, desc: "Notion Markdown" },
    { key: "parent",  label: "Location", required: false, desc: "Parent page/DB ID (default: workspace root)" },
  ],
  "notion.search": [
    { key: "query", label: "Search Keyword", required: true },
  ],
  "notion.update_page": [
    { key: "page_id", label: "Target Page", required: true, desc: "Page ID" },
    { key: "content", label: "Content",     long: true, required: false, desc: "Notion Markdown" },
  ],

  // 💬 iMessage
  "imessage.send": [
    { key: "recipient", label: "Recipient", required: true, desc: "Phone number or email" },
    { key: "message",   label: "Body",      long: true, required: true },
  ],
  "imessage.unread": [],
  "imessage.search_contacts": [
    { key: "query", label: "Search (name/phone/email)", required: true },
  ],

  // 🗄 Local DB
  "localdb.record": [
    { key: "target",  label: "Destination",    required: true, desc: "DB path/table (e.g. posts in ~/data/app.sqlite)" },
    { key: "content", label: "Data to Record", long: true, required: true, desc: "Fields and values to save" },
  ],
  "localdb.query": [
    { key: "target",    label: "Target",    required: true, desc: "DB path/table" },
    { key: "condition", label: "Condition", long: true, required: false, desc: "e.g. date is this week, status is unprocessed" },
  ],
  "localdb.update": [
    { key: "target",    label: "Target",     required: true },
    { key: "condition", label: "Which",      required: true, desc: "Condition identifying records to update" },
    { key: "content",   label: "New Values", long: true, required: true },
  ],

  // 🤖 Claude (think)
  "think.task": [
    { key: "prompt", label: "Instructions for Claude", long: true, required: true, desc: "What to output, from what angle, in what format" },
    { key: "files",  label: "Files to Pass",           multi: true, required: false, desc: "Files/folders to read as source material" },
    { key: "model",  label: "Model",                   options: ["sonnet", "opus", "haiku"], required: false,
      info: { sonnet: "Balanced, standard", opus: "High-performance, complex tasks", haiku: "Fast, low-cost" } },
  ],

  // 👥 subagent
  "subagent.task": [
    { key: "agent",  label: "Which Claude",   options: ["general-purpose", "Explore", "Plan"], required: false,
      info: { "general-purpose": "General-purpose (anything)", Explore: "Research-focused (read-only)", Plan: "Planning-focused" } },
    { key: "prompt", label: "Task Brief",     long: true, required: true, desc: "Goal, inputs, expected deliverables" },
    { key: "target", label: "Target Files",   multi: true, required: false },
    { key: "model",  label: "Model",          options: ["sonnet", "opus", "haiku"], required: false },
  ],

  // ⚙ code
  "code.read":   [ { key: "path", label: "Target File",   required: true, desc: "Path of the file to read" } ],
  "code.write":  [
    { key: "path",    label: "Destination", required: true },
    { key: "content", label: "Content",     long: true, required: true },
  ],
  "code.run":    [ { key: "command", label: "Command", long: true, required: true, desc: "Shell command or script to execute" } ],
  "code.search": [
    { key: "pattern", label: "Search Pattern", required: true, desc: "String or regex to look for" },
    { key: "path",    label: "Scope",           required: false, desc: "Folder to search (default: entire project)" },
  ],

  // 📄 Document creation (official skill / builtin → request + target only)
  "skill.document": [
    { key: "request", label: "Request",      long: true, required: true, desc: "What to create (e.g. meeting minutes as a Word doc in our format)" },
    { key: "target",  label: "Source Files", multi: true, required: false, desc: "Source material files" },
  ],
  "skill.custom": [
    { key: "skill_name", label: "Skill Name",  required: true, desc: "Name of the custom skill to call" },
    { key: "request",    label: "Request",     long: true, required: true },
    { key: "target",     label: "Target Files", multi: true, required: false },
  ],

  // 🔀 Branch & Confirm
  "decision.branch": [
    { key: "condition", label: "Condition (question form)", required: true, desc: "e.g. Did tests pass? / Does the file exist?" },
  ],
  "user.confirm": [
    { key: "message", label: "Prompt for User", long: true, required: true, desc: "Content to show/ask the user" },
  ],

  // 🌐 External API
  "api.llm": [
    { key: "service", label: "Service", options: ["claude", "openai", "gemini"], required: true,
      info: { claude: "Anthropic Claude", openai: "OpenAI GPT", gemini: "Google Gemini" } },
    { key: "prompt",  label: "Prompt",  long: true, required: true },
    { key: "model",   label: "Model",   required: false, desc: "Model name for the selected service" },
  ],
  "api.discord": [
    { key: "content", label: "Message", long: true, required: true, desc: "Message to post to Discord" },
  ],
  "api.line": [
    { key: "to",      label: "Recipient", required: true, desc: "User ID / Group ID" },
    { key: "message", label: "Message",   long: true, required: true },
  ],

  // 💬 Slack (MCP) — channel/body are required core fields. #general is placeholder only (not saved).
  "slack.send_message": [
    { key: "channel",   label: "Channel",       required: true,  placeholder: "#general", desc: "e.g. #general / @user / channel ID" },
    { key: "text",      label: "Message",       long: true, required: true },
    { key: "thread_ts", label: "Reply to Thread", required: false, desc: "ts of parent message (optional)" },
  ],
  "slack.search_messages": [
    { key: "query",       label: "Search Query", required: true,  desc: "Slack search syntax: from:@user in:#channel before:YYYY-MM-DD" },
    { key: "max_results", label: "Max Results",  required: false },
  ],
};

window.FI.ELEMENTS = [
  // ── Design Reference: all node type samples ──
  { cat: "★ Node Types", tier: 1, type: "parent",   id: "ref-parent",   title: "Receive Skill",            subtitle: "Parent Agent",                desc: "Parent agent node controlling the entire flow. Rounded rectangle + blue accent bar", meta: { shape: "rect (rx:10)", accent: "left sidebar", color: "#2563eb" } },
  { cat: "★ Node Types", tier: 1, type: "hook",     id: "ref-hook",     title: "pre: Input Validation",    subtitle: "PreToolUse Hook",             desc: "Hook node that fires on events. Parallelogram + orange accent bar", meta: { shape: "para (skew:14)", accent: "diagonal bar", color: "#c2410c" } },
  { cat: "★ Node Types", tier: 1, type: "subagent", id: "ref-subagent", title: "Explore: Past Post Analysis", subtitle: "Subagent (read-only)",      desc: "Subagent that can run in parallel. Hexagon + purple diamond accent", meta: { shape: "hex (inset:16)", accent: "diamond", color: "#7c3aed" } },
  { cat: "★ Node Types", tier: 1, type: "mcp",      id: "ref-mcp",      title: "Image Asset Search",       subtitle: "canva-mcp",                   desc: "External MCP integration node. Pill shape (full round) + green circle accent", meta: { shape: "pill (rx:h/2)", accent: "circle", color: "#15803d" } },
  { cat: "★ Node Types", tier: 1, type: "code",     id: "ref-code",     title: "Read",                     subtitle: "File Read",                   desc: "Code execution / tool call node. Sharp rectangle + $_ prompt accent", meta: { shape: "sharp (rx:2)", accent: "$_ prompt", color: "#525252" } },
  { cat: "★ Node Types", tier: 1, type: "user",     id: "ref-user",     title: "Timeline",                 subtitle: "Chronological View",          desc: "User action / display node. Octagon + sidebar accent", meta: { shape: "octa (chamfer:16)", accent: "sidebar", color: "#a16207" } },
  { cat: "★ Node Types", tier: 1, type: "decision", id: "ref-decision", title: "Branch",                   subtitle: "Condition via Bash Result",   desc: "Branch/decision node. Diamond shape", meta: { shape: "diamond", accent: "none", color: "#1f2937" } },
  { cat: "★ Node Types", tier: 1, type: "skill",    id: "ref-skill",    title: "SKILL.md File",            subtitle: "name / description / body",   desc: "Skill definition node. Rounded rectangle + cyan accent bar", meta: { shape: "rect (rx:10)", accent: "left sidebar", color: "#0891b2" } },
  { cat: "★ Node Types", tier: 1, type: "command",  id: "ref-command",  title: "commands/run.md",          subtitle: "under claude/commands/",      desc: "Custom command node. Sharp rectangle + $_ accent", meta: { shape: "sharp (rx:2)", accent: "$_ prompt", color: "#6d28d9" } },
  { cat: "★ Node Types", tier: 1, type: "config",   id: "ref-config",   title: "settings.json",            subtitle: "model / allowedTools / permissions", desc: "Configuration node. Rounded rectangle + gray accent", meta: { shape: "rect (rx:9)", accent: "left sidebar", color: "#78716c" } },
  { cat: "★ Node Types", tier: 1, type: "api",      id: "ref-api",      title: "model",                    subtitle: "Model Name Setting",          desc: "API parameter node. Pill + teal circle accent", meta: { shape: "pill (rx:h/2)", accent: "circle", color: "#0d9488" } },
  { cat: "★ Node Types", tier: 1, type: "plugin",   id: "ref-plugin",   title: "plugin.json",              subtitle: "Plugin Manifest",             desc: "Plugin definition node. Tab shape (top-left notch) + indigo accent", meta: { shape: "tab (notch:10)", accent: "left sidebar", color: "#4f46e5" } },
  { cat: "★ Node Types", tier: 1, type: "agentsdk", id: "ref-agentsdk", title: "createAgentWithOptions",   subtitle: "agent.ts entry point",        desc: "Agent SDK node. Trapezoid (narrow top) + rose accent", meta: { shape: "trap (inset:12)", accent: "diagonal bar", color: "#be185d" } },
  { cat: "★ Node Types", tier: 1, type: "trigger",  id: "ref-trigger",  title: "Trigger (start)",          subtitle: "What starts the flow",        desc: "Trigger node. Pill shape (like a flowchart start node) + amber accent", meta: { shape: "pill (rx:h/2)", accent: "circle", color: "#d97706" } },

  // A. Hook Events
  // A. Hook Events — 22 entries (each has different firing timing, input data, matcher semantics,
  // blocking capability, and output fields — kept as individual cards.
  // Tier1=essential 5, Tier2=important 8, Tier3=differentiating 9).
  // meta.placement on each card is for future flow-placement validation (see IMPLEMENTATION_NOTES.md).

  // ─── Tier 1 (essential) ───
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "SessionStart", title: "SessionStart", subtitle: "On Session Start", desc: "Fires when a session starts. matcher: startup / resume / clear / compact",
    meta: { event: "SessionStart", placement: "session-start", matcher: "startup|resume", handler_type: "command", command: "echo 'Loading project info…' && cat .claude/STATUS.md", timeout: 30, additionalContext: "Inform Claude of recent project changes",
      io: { in: "session start info (how: startup/resume/clear/compact, cwd, project_dir)", out: "inject additional info into Claude via additionalContext" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "UserPromptSubmit", title: "UserPromptSubmit", subtitle: "On Prompt Submit", desc: "Fires immediately after the user sends a message. Used for context injection and blocking dangerous instructions.",
    meta: { event: "UserPromptSubmit", placement: "before-prompt", matcher: "", handler_type: "prompt", prompt_text: "Check this prompt for risk of confidential information leakage", timeout: 30, async: "false", permission_decision: "allow",
      io: { in: "user's prompt text + session info", out: "additionalContext / sessionTitle / block decision" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "PreToolUse", title: "PreToolUse", subtitle: "Before Tool Execution (most important)", desc: "Fires just before Claude executes a tool. Specify target tool with matcher. Can block.",
    meta: { event: "PreToolUse", placement: "before-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/validate-bash.sh", timeout: 30, permission_decision: "allow",
      io: { in: "tool_name + tool_input (pre-execution info)", out: "permissionDecision (allow/deny/ask) / toolInputModification / additionalContext" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "PostToolUse", title: "PostToolUse", subtitle: "After Tool Execution", desc: "Fires immediately after successful tool execution. Auto-format, run tests, record logs, etc.",
    meta: { event: "PostToolUse", placement: "after-tool", matcher: "Edit|Write", handler_type: "command", command: "prettier --write \"$FILE_PATH\"", timeout: 30,
      io: { in: "tool_name + tool_input + tool_response (includes execution result)", out: "additionalContext (pass result to Claude)" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "Stop", title: "Stop", subtitle: "On Response Complete", desc: "Fires when Claude's response is complete. Completion notifications, force continue.",
    meta: { event: "Stop", placement: "before-response-end", matcher: "", handler_type: "http", url: "https://hooks.slack.com/services/T00000/B00000/XXXXXXXX", timeout: 10,
      io: { in: "response completion info", out: "send notification to Slack etc. / force continue via block decision" } } },

  // ─── Tier 2 (important) ───
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "PostToolUseFailure", title: "PostToolUseFailure", subtitle: "On Tool Failure", desc: "Fires on tool execution failure. Log error, suggest retry.",
    meta: { event: "PostToolUseFailure", placement: "after-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/log-failure.sh", timeout: 10,
      io: { in: "tool_name + tool_input + error info", out: "additionalContext (pass error to Claude to suggest retry)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "PermissionRequest", title: "PermissionRequest", subtitle: "On Permission Dialog", desc: "Fires at the moment a permission confirmation dialog appears. Inject auto-approve/deny rules.",
    meta: { event: "PermissionRequest", placement: "before-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/auto-approve.sh", timeout: 5, permission_decision: "allow",
      io: { in: "tool_name + tool_input", out: "decision.behavior (allow/deny) + decision.updatedInput" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "SubagentStart", title: "SubagentStart", subtitle: "On Subagent Launch", desc: "Fires at the moment a subagent starts. Start log, pass initial context.",
    meta: { event: "SubagentStart", placement: "subagent-start", matcher: "Explore|Plan", handler_type: "command", command: "echo \"[$(date)] Subagent started\" >> .claude/agent.log", timeout: 5,
      io: { in: "subagent_type + prompt", out: "additionalContext (initial info for subagent)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "SubagentStop", title: "SubagentStop", subtitle: "On Subagent Complete", desc: "Fires at the moment a subagent finishes. Aggregate results, report completion.",
    meta: { event: "SubagentStop", placement: "subagent-stop", matcher: "Explore|Plan", handler_type: "command", command: "echo \"[$(date)] Subagent finished\" >> .claude/agent.log", timeout: 5,
      io: { in: "subagent_type + execution result", out: "additionalContext (result summary for parent agent)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "ConfigChange", title: "ConfigChange", subtitle: "On Settings Change", desc: "Fires when settings.json etc. changes. Diff notification, post-reload processing.",
    meta: { event: "ConfigChange", placement: "file-watch", matcher: "", handler_type: "command", command: "bash scripts/notify-config-change.sh", timeout: 10,
      io: { in: "changed file path + diff", out: "additionalContext (notify Claude of changes)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "InstructionsLoaded", title: "InstructionsLoaded", subtitle: "On CLAUDE.md / .claude/rules/*.md Load", desc: "Fires when instruction files finish loading. Add project-specific context.",
    meta: { event: "InstructionsLoaded", placement: "file-watch", matcher: "", handler_type: "command", command: "cat .claude/recent-decisions.md", timeout: 5,
      io: { in: "loaded file path", out: "additionalContext (inject supplemental info)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "FileChanged", title: "FileChanged", subtitle: "On File Change Detection", desc: "Fires when a watched file changes. matcher is the filename itself (custom convention).",
    meta: { event: "FileChanged", placement: "file-watch", matcher: ".envrc|.env", handler_type: "command", command: "bash scripts/reload-env.sh", timeout: 10,
      io: { in: "file path + change type (created/modified/deleted)", out: "additionalContext" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "Notification", title: "Notification", subtitle: "On System Notification", desc: "Fires on system notification output. matcher: permission_prompt / elicitation_dialog etc.",
    meta: { event: "Notification", placement: "notification", matcher: "permission_prompt|elicitation_dialog", handler_type: "command", command: "osascript -e 'display notification \"Claude requests attention\"'", timeout: 5,
      io: { in: "notification type + message", out: "(no output, side effects only)" } } },

  // ─── Tier 3 (differentiating) ───
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "SessionEnd", title: "SessionEnd", subtitle: "On Session End", desc: "Fires when a conversation session ends. Save work log, clean up.",
    meta: { event: "SessionEnd", placement: "session-end", matcher: "logout|clear", handler_type: "command", command: "bash scripts/save-session-log.sh", timeout: 30,
      io: { in: "end reason (logout/clear/resume)", out: "(no output, side effects only)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "Setup", title: "Setup", subtitle: "On init / maintenance run", desc: "Fires on `claude --init-only` / `--maintenance`. matcher: init / maintenance",
    meta: { event: "Setup", placement: "session-start", matcher: "init|maintenance", handler_type: "command", command: "bash scripts/project-init.sh", timeout: 60,
      io: { in: "execution mode (init / maintenance)", out: "additionalContext" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "TaskCompleted", title: "TaskCompleted", subtitle: "On Task Complete", desc: "Fires when an internally managed Claude task (TodoWrite etc.) completes. Trigger next task, send completion notification.",
    meta: { event: "TaskCompleted", placement: "subagent-stop", matcher: "", handler_type: "command", command: "bash scripts/on-task-done.sh", timeout: 10,
      io: { in: "completed task id / content", out: "additionalContext (instructions for next task)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "TeammateIdle", title: "TeammateIdle", subtitle: "On Teammate Agent Idle", desc: "Fires when a collaborative agent becomes free. Assign next work.",
    meta: { event: "TeammateIdle", placement: "subagent-stop", matcher: "", handler_type: "command", command: "bash scripts/assign-next-task.sh", timeout: 30,
      io: { in: "idle teammate info", out: "new task assignment" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "Elicitation", title: "Elicitation", subtitle: "On MCP User Input Request", desc: "Fires when an MCP server requests user input. Auto-answer common inputs.",
    meta: { event: "Elicitation", placement: "mcp-input-request", matcher: "", handler_type: "command", command: "bash scripts/auto-fill-elicitation.sh", timeout: 10,
      io: { in: "input request from MCP server", out: "action (accept/decline/cancel) + content (form values)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "WorktreeCreate", title: "WorktreeCreate", subtitle: "On Git Worktree Create", desc: "Fires when a Git worktree (separate working folder) is created. Initialize new work space.",
    meta: { event: "WorktreeCreate", placement: "worktree-create", matcher: "", handler_type: "command", command: "cd $WORKTREE_PATH && npm install", timeout: 120,
      io: { in: "worktreePath + branch", out: "worktreePath (confirmed path) + additionalContext" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "WorktreeRemove", title: "WorktreeRemove", subtitle: "On Git Worktree Remove", desc: "Fires when a Git worktree is removed. Clean up, clear cache.",
    meta: { event: "WorktreeRemove", placement: "worktree-remove", matcher: "", handler_type: "command", command: "rm -rf node_modules .next", timeout: 30,
      io: { in: "removed worktreePath", out: "(no output, side effects only)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "PreCompact", title: "PreCompact", subtitle: "Before Compaction", desc: "Fires just before conversation history compaction starts. Save important info separately.",
    meta: { event: "PreCompact", placement: "before-compact", matcher: "manual|auto", handler_type: "command", command: "bash scripts/save-key-context.sh", timeout: 30,
      io: { in: "compaction trigger (manual / auto)", out: "additionalContext (info to preserve after summarization)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "PostCompact", title: "PostCompact", subtitle: "After Compaction", desc: "Fires immediately after history summarization completes. Reorganize state, re-inject needed info.",
    meta: { event: "PostCompact", placement: "after-compact", matcher: "manual|auto", handler_type: "command", command: "cat .claude/key-context.md", timeout: 10,
      io: { in: "compaction trigger + summary result", out: "additionalContext (info to re-inject)" } } },

  // A-2. Hook Handlers (h-*) — removed. Demoted to handler_type options in each Hook Event card's fields.
  // A-3. Hook Controls (c-*) — removed. Merged into each Hook Event card's fields (matcher / timeout / async / exit2 / output / perm / input / ctx).

  // B. Built-in Tools
  // B. File Operations — one card per tool, independent. Settings are shown dynamically via tool-specific fields in DetailPanel.
  // meta here is "representative sample". Values will differ per node in real flows.
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-Read", title: "Read", subtitle: "File Read", desc: "Supports offset/limit/pages",
    meta: { tool: "Read", file_path: "/path/to/file.md", offset: 1, limit: 200,
      io: { in: "file_path (+ offset / limit / pages)", out: "file content (text with line numbers)" } } },
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-Write", title: "Write", subtitle: "Create New File", desc: "Overwrites if file already exists",
    meta: { tool: "Write", file_path: "/path/to/new-file.md", content: "# New File\nWriting content here…",
      io: { in: "file_path + content (full text)", out: "write success/failure" } } },
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-Edit", title: "Edit", subtitle: "Edit File (partial replace)", desc: "Replace one occurrence of old_string with new_string",
    meta: { tool: "Edit", file_path: "/path/to/config.ts", old_string: "const PORT = 8080;", new_string: "const PORT = 9090;", replace_all: "false",
      io: { in: "file_path + old_string + new_string", out: "edit success/failure" } } },
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-MultiEdit", title: "MultiEdit", subtitle: "Multi-location Edit", desc: "Edit multiple locations in one file atomically",
    meta: { tool: "MultiEdit", file_path: "/path/to/file.ts", edits: '[\n  { "old_string": "foo", "new_string": "bar" },\n  { "old_string": "baz", "new_string": "qux" }\n]',
      io: { in: "file_path + edits[]", out: "success/failure of all edits applied (atomic)" } } },
  { cat: "B. File Operations", tier: 2, type: "code", id: "t-NB", title: "NotebookEdit", subtitle: "Jupyter Notebook Edit", desc: "Cell-level editing for .ipynb files",
    meta: { tool: "NotebookEdit", notebook_path: "/path/to/analysis.ipynb", cell_id: "abc123", cell_type: "code", edit_mode: "replace", new_source: "import pandas as pd\ndf = pd.read_csv('data.csv')",
      io: { in: "notebook_path + cell_id + new_source", out: "cell update result" } } },
  // B. Search — fast text search with ripgrep (Grep) and glob pattern search (Glob)
  { cat: "B. Search", tier: 1, type: "code", id: "t-Grep", title: "Grep", subtitle: "Text Search", desc: "Fast regex search equivalent to ripgrep",
    meta: { tool: "Grep", pattern: "function\\s+(\\w+)", path: "src/", glob: "*.ts", output_mode: "content", "-n": "true", "-C": 2, head_limit: 50,
      io: { in: "pattern + scope (path/glob/type) + options", out: "matching text / file list / count" } } },
  { cat: "B. Search", tier: 1, type: "code", id: "t-Glob", title: "Glob", subtitle: "File Path Search", desc: "Enumerate files with glob pattern",
    meta: { tool: "Glob", pattern: "**/*.test.ts", path: "/path/to/repo",
      io: { in: "glob pattern + search root path", out: "array of matching file paths (sorted by modification time)" } } },
  // B. Execution — shell command execution and background execution control
  { cat: "B. Execution", tier: 1, type: "code", id: "t-Bash", title: "Bash", subtitle: "Run Shell Command", desc: "Supports timeout/run_in_background",
    meta: { tool: "Bash", command: "npm test -- --coverage", description: "Run tests with coverage", timeout: 300000, run_in_background: "false",
      io: { in: "command (+ timeout / run_in_background / description)", out: "stdout / stderr / exit code (or shell_id)" } } },
  { cat: "B. Execution", tier: 2, type: "code", id: "t-BO", title: "BashOutput", subtitle: "Get Background Output", desc: "Retrieve output of a background Bash process",
    meta: { tool: "BashOutput", bash_id: "shell_abc123", filter: "ERROR|FAIL",
      io: { in: "bash_id (+ filter)", out: "latest output of the target shell + status" } } },
  { cat: "B. Execution", tier: 2, type: "code", id: "t-KB", title: "KillBash", subtitle: "Stop Bash Process", desc: "Stop a Bash process",
    meta: { tool: "KillBash", shell_id: "shell_abc123",
      io: { in: "shell_id", out: "stop result" } } },

  // B. Web — access external web resources
  { cat: "B. Web", tier: 1, type: "code", id: "t-WF", title: "WebFetch", subtitle: "Fetch URL", desc: "Fetch and extract content from a URL",
    meta: { tool: "WebFetch", url: "https://example.com/article", prompt: "Summarize the 3 main claims in this article",
      io: { in: "url + prompt", out: "extracted result text (processed by a small model)" } } },
  { cat: "B. Web", tier: 1, type: "code", id: "t-WS", title: "WebSearch", subtitle: "Web Search", desc: "Search using the Anthropic search backend",
    meta: { tool: "WebSearch", query: "Claude Code hooks 2026", allowed_domains: ["anthropic.com","code.claude.com"], blocked_domains: [],
      io: { in: "query (+ allowed/blocked_domains)", out: "search result titles + URL list" } } },

  // B. Task Management — Todo / subagent / slash commands
  { cat: "B. Task Management", tier: 1, type: "code", id: "t-TW", title: "TodoWrite", subtitle: "Manage Task List", desc: "Update the in-session Todo list",
    meta: { tool: "TodoWrite", todos: '[\n  { "content": "Implement", "activeForm": "Implementing", "status": "in_progress" },\n  { "content": "Write tests", "activeForm": "Writing tests", "status": "pending" }\n]',
      io: { in: "todos[]", out: "todo list update result" } } },
  { cat: "B. Task Management", tier: 1, type: "code", id: "t-Task", title: "Task", subtitle: "Call Subagent", desc: "Launch a subagent in a separate context",
    meta: { tool: "Task", subagent_type: "Explore", description: "Find auth implementation", prompt: "Report where authentication-related code is implemented — list file paths and relevant lines", run_in_background: "false", isolation: "none",
      io: { in: "subagent_type + prompt (+ options)", out: "subagent final result (text)" } } },
  { cat: "B. Task Management", tier: 2, type: "code", id: "t-SC", title: "SlashCommand", subtitle: "Run Slash Command", desc: "Call a registered command",
    meta: { tool: "SlashCommand", command: "/review pr-123",
      io: { in: "command string (e.g. '/init args')", out: "command execution result" } } },

  // B. Planning — enter/exit plan mode
  { cat: "B. Planning", tier: 2, type: "code", id: "t-PM", title: "EnterPlanMode", subtitle: "Start Plan Mode", desc: "Switch to write-protected mode to build a plan",
    meta: { tool: "EnterPlanMode",
      io: { in: "(no parameters)", out: "mode transition result" } } },
  { cat: "B. Planning", tier: 2, type: "code", id: "t-EPM", title: "ExitPlanMode", subtitle: "End Plan Mode", desc: "Present the plan and return to normal mode",
    meta: { tool: "ExitPlanMode", plan: "## Implementation Plan\n\n1. Add auth middleware\n2. Implement JWT token validation logic\n3. Add login/logout endpoints\n4. Write E2E tests",
      io: { in: "plan (Markdown format)", out: "user approval result" } } },

  // C. Subagent
  // C. Subagent — concrete cards only. Configuration fields (model/allowed_tools/permission_mode/isolation etc.)
  // are shown in the "settings" section of the subagent node detail panel.
  { cat: "C. Subagent", tier: 1, type: "subagent", id: "sa-def", title: "Subagent (General)", subtitle: ".claude/agents/*.md", desc: "Custom subagent definition. In real flows, model/allowed_tools/prompt/I/O differ per node (values here are samples).",
    meta: {
      file: ".claude/agents/*.md",
      model: "sonnet",
      allowed_tools: ["Read","Grep","Glob","WebFetch"],
      disallowed_tools: ["Bash"],
      permission_mode: "default",
      isolation: "none",
      prompt: "You are a specialist agent for ○○.\nFollow these steps:\n1. ...\n2. ...\n3. Summarize results in Markdown and return",
      io: { in: "prompt + context from parent agent", out: "task execution result (natural text / structured data)" }
    }
  },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-explore", title: "builtin: Explore", subtitle: "Read-only exploration agent", desc: "Built-in subagent for safely investigating a codebase", meta: { builtin: true, model: "haiku", allowed_tools: ["Read","Grep","Glob","WebFetch"], permission_mode: "default" } },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-plan", title: "builtin: Plan", subtitle: "Implementation planning agent", desc: "Built-in subagent that returns design and scheduling before implementation begins", meta: { builtin: true, model: "sonnet", allowed_tools: ["Read","Grep","Glob","WebFetch"], permission_mode: "plan" } },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-general", title: "builtin: general-purpose", subtitle: "General-purpose agent", desc: "Built-in all-in-one subagent that can handle investigation, execution, and correction", meta: { builtin: true, model: "sonnet", allowed_tools: ["*"], permission_mode: "default" } },

  // D. MCP
  // D. MCP — main 10 cards (one per server)
  // Switching meta.action (tool/resource/prompt) in the detail panel shows the needed additional fields.
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-def", title: "Custom MCP Server (Generic)", subtitle: "defined in .mcp.json", desc: "Generic card representing a custom or third-party MCP server",
    meta: { server: "my-server", auth: "api_key", action: "tool", tool_name: "do_something", params: '{ "key": "value" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Whether to call tool / resource / prompt provided by the server",
        target:  "Server name (mcpServers key in .mcp.json) and operation target (tool name / resource URI / prompt name)",
        content: "Arguments specific to each server (JSON format)",
        summary: "One call to a custom or third-party MCP server. Pass server-specific arguments and pass the result to the next step.",
      },
      capabilities: [
        { name: "(tools)",     desc: "Functions provided by the server that the LLM calls to perform actions", friendly: "Functions the server exposes for the LLM to call. Have side effects (data creation, sending, updating etc.). Each server exposes them under custom names like `send_message` or `query`." },
        { name: "(resources)", desc: "Read-only data published by the server (URI reference)",                 friendly: "Data the server exposes for the LLM to reference. Identified by URI (e.g. `file:///path/x`, `notion://page/abc`), read-only with no side effects. Convenient for passing context to the LLM." },
        { name: "(prompts)",   desc: "Pre-defined prompt templates defined by the server",                     friendly: "Preset prompt templates prepared by the server. Fill in arguments to get a completed prompt to pass to the LLM. Allows the server to maintain and share things like 'standard meeting minutes summary instructions'." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-fs", title: "Filesystem", subtitle: "File Read/Write", desc: "Safely operate on files in specified folders",
    meta: { server: "filesystem", auth: "none", action: "tool", tool_name: "read_file", params: '{ "path": "~/Documents/notes.md" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from read_file / write_file / list_directory / search_files / move_file",
        target:  "Absolute path of target file or folder (within folders allowed by server config)",
        content: "Write content, search pattern, destination path, etc.",
        summary: "File operations on folders outside the project (Downloads, Desktop etc.). Use this when the built-in Read/Write tools (cwd-centric) can't reach the files.",
      },
      capabilities: [
        { name: "read_file",      desc: "Read file content",                              friendly: "Reads and returns the content of a file (.md, .txt, .json etc.) specified by absolute path. Similar to Claude Code's built-in Read tool, but Filesystem MCP is scoped to pre-allowed folders, so it can safely access files outside the working directory like Downloads or Desktop." },
        { name: "write_file",     desc: "Write to file (overwrite or create)",            friendly: "Writes to the specified path. Overwrites existing files entirely, creates new if path doesn't exist. Use for output destinations like 'save results to ~/Documents/report.md'." },
        { name: "list_directory", desc: "List files in a folder",                         friendly: "Returns the list of files and subfolders directly under the specified folder. Returns file name, size, and modification date — useful as a starting point for aggregations like 'the 3 largest files in Downloads'." },
        { name: "search_files",   desc: "Search by filename or content",                  friendly: "Search by filename pattern or content keyword under the specified folder. Recursive into subfolders. Use for investigations like 'find Markdown files containing meeting minutes'." },
        { name: "move_file",      desc: "Move or rename a file",                          friendly: "Move a file to another location or rename it. Use for automated organization like 'sort downloaded PDFs from Downloads into Documents/Receipts'." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-gh", title: "GitHub", subtitle: "PR / Issue / Code", desc: "Operate on GitHub PRs / Issues / code",
    meta: { server: "github", auth: "oauth", action: "tool", tool_name: "create_issue", params: '{ "owner": "anthropic", "repo": "claude-code", "title": "Bug Report", "body": "..." }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from create_issue / create_pull_request / add_comment / search_code / get_file_contents / list_repos",
        target:  "owner (org/user name) and repo (repository name), plus issue/PR number if needed",
        content: "title / body / comment text / search query etc.",
        summary: "One operation against a GitHub Issue/PR/code. Primarily used for posting text generated in previous steps (error reports, review comments, etc.) to GitHub.",
      },
      capabilities: [
        { name: "create_issue",        desc: "Create an Issue",            friendly: "Create a new Issue in the repository. Specify title, body (Markdown), labels, assignee, and milestone. Use for automations like 'auto-create bug report Issues from test failure logs' or 'create monthly maintenance Issues'." },
        { name: "create_pull_request", desc: "Create a PR",                friendly: "Create a Pull Request between branches. Specify title, body (Markdown), base branch, and head branch. Use for workflows where Claude auto-implements a branch and then opens a PR." },
        { name: "add_comment",         desc: "Add comment to Issue / PR",  friendly: "Add a comment to an existing Issue or PR. Supports both code review comments (anchored to specific lines) and general comments. Use for review automation like 'summarize PR analysis as a comment'." },
        { name: "search_code",         desc: "Search code in repo",        friendly: "Search code via GitHub's search API. Use queries like `language:python TODO` to search across a repo, organization, or all public repos. Great for 'where was that implementation again?'." },
        { name: "get_file_contents",   desc: "Get file content",           friendly: "Retrieve the content of a file in the repository. Specify path and branch/commit SHA. Use for 'read main branch README and summarize' or 'compare code at a specific commit with current state'." },
        { name: "list_repos",          desc: "List repositories",          friendly: "Get a list of repositories owned by an org or user. Use for overviews like 'top 10 recently updated repos in the company org' or 'list all repos I created'." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-gd", title: "Google Drive", subtitle: "Document Search & Update", desc: "Operate on Google Drive documents",
    meta: { server: "gdrive", auth: "oauth", action: "tool", tool_name: "search_files", params: '{ "query": "meeting minutes 2026", "page_size": 10 }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from search_files / read_file_content / create_file / update_file",
        target:  "File ID or search query. Folder ID can also be specified.",
        content: "Body, title, MIME type etc. for new/updated files",
        summary: "Search, view, create, and update documents on Google Drive. Use cases: 'new file from meeting minutes template', 'fetch last week's proposal to understand its content', etc.",
      },
      capabilities: [
        { name: "search_files",      desc: "Search files in Drive",         friendly: "Search Google Drive by name, content, MIME type, etc. Get a candidate list via natural filters like 'meeting minutes 2026' or 'Spreadsheet last updated this month'." },
        { name: "read_file_content", desc: "Read document body",            friendly: "Retrieve content by file ID. Google Docs returns text body, Google Sheets returns CSV, Markdown/text returns as-is. Use for fetching source data for summarization or analysis." },
        { name: "create_file",       desc: "Create new file",               friendly: "Create a new file on Drive. Specify folder, title, body, and MIME type. Use for automated output like 'create new file from meeting minutes template' or 'save analysis results as Spreadsheet'." },
        { name: "update_file",       desc: "Update existing file",          friendly: "Update content of an existing file. Can overwrite, append, or change metadata (title, sharing settings). Use for ongoing updates like 'append decisions to meeting minutes'." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-sl", title: "Slack", subtitle: "Send & Receive Messages", desc: "Send/receive and search Slack messages",
    meta: { server: "slack", auth: "oauth", action: "tool", tool_name: "send_message", capability: "slack.send_message",
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from send_message / search_messages / list_channels / get_thread / add_reaction",
        target:  "Operation target (channel name '#general' / user ID / message timestamp etc.)",
        content: "Data to pass (send text, search query, emoji name etc.)",
        summary: "Use info received from previous step to post or search in Slack, then pass results (post ID, message list etc.) to the next step",
      },
      capabilities: [
        { name: "send_message",    desc: "Send message to channel or DM",  friendly: "Post a new message to a specified channel (#general etc.) or DM. In addition to the body, you can specify emoji, thread reply destination (thread_ts), @mentions, and attachments. Use for deploy notifications, error alerts, daily report posts, etc." },
        { name: "search_messages", desc: "Search past messages",            friendly: "Search messages across the workspace matching keywords. Supports Slack search syntax (from:@user / in:#channel / before:YYYY-MM-DD). Use for aggregating things like 'requests from someone last week' or 'ERROR mentions in #bug channel'." },
        { name: "list_channels",   desc: "List channels",                   friendly: "Get a list of channel names, member counts, and topics for the workspace. Use when you don't know where to post, to find candidates, guide new members, or for automatic 'select appropriate channel'." },
        { name: "get_thread",      desc: "Get thread replies",              friendly: "Specify the parent message timestamp to get all replies in that thread. Useful for summarizing discussion flow or collecting all unread replies at once." },
        { name: "add_reaction",    desc: "Add reaction to message",         friendly: "Add an emoji reaction (✅ 👀 🚀 etc.) to an existing message. Use to show status like 'in progress' / 'acknowledged' at a glance, or as a progress marker in automated workflows." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-db", title: "Database (Postgres / SQLite)", subtitle: "Run SQL", desc: "Execute SQL against a database",
    meta: { server: "postgres", auth: "api_key", action: "tool", tool_name: "query", params: '{ "sql": "SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL \'30 days\'" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from query (run SQL) / schema (get table definition) / list_tables",
        target:  "DB connection (specified in .mcp.json env). Write table names directly in the query.",
        content: "SQL statement to execute (SELECT/INSERT/UPDATE/DELETE). Claude converts natural language to SQL.",
        summary: "Claude converts a natural language question (e.g. 'How many new users last month?') to SQL → queries the DB → aggregates and summarizes results",
      },
      capabilities: [
        { name: "query",       desc: "Execute arbitrary SQL and get results", friendly: "Can execute any SQL: SELECT / INSERT / UPDATE / DELETE. Claude converts natural language questions to SQL and calls this query. For production DBs, connect with a read-only user or deny UPDATE/DELETE in permissions for safety." },
        { name: "schema",      desc: "Get table schema definition",           friendly: "Get column names, types, constraints, and indexes for a specified table. The standard flow is: call schema first to understand the structure → then compose the correct query." },
        { name: "list_tables", desc: "List tables in the DB",                 friendly: "Get a list of table names in the currently connected DB. Use as the starting point to understand 'what data is in this DB?'." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-gm", title: "Gmail", subtitle: "Email Search & Send", desc: "Search and send emails with Gmail",
    meta: { server: "gmail", auth: "oauth", action: "tool", tool_name: "search_messages", params: '{ "query": "is:unread label:important", "max_results": 20 }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from search_messages / read_message / send_message / create_draft / add_label",
        target:  "Target message ID or Gmail search query (is:unread, label:work etc.)",
        content: "Send email recipient/subject/body, label to apply, draft content, etc.",
        summary: "Email workflow automation: 'summarize only important unread emails', 'create standard reply draft', 'auto-sort into specific tag', etc. Route through drafts for send operations to prevent accidents.",
      },
      capabilities: [
        { name: "search_messages", desc: "Search email (Gmail query syntax)", friendly: "Search messages using Gmail search syntax like `is:unread`, `label:important`, `from:tanaka@`, `before:2026-05-01`. Can filter to 'only important unread emails' or 'last 10 from a specific person'. Results are message IDs + preview list." },
        { name: "read_message",    desc: "Get individual email body",         friendly: "Specify a message ID to retrieve subject, body, sender, and attachment info. The standard flow is: search → individual read (two steps)." },
        { name: "send_message",    desc: "Send email",                        friendly: "Send an email with recipient, subject, and body. Sent immediately without confirmation, so either deny in permissions or route through create_draft for safety." },
        { name: "create_draft",    desc: "Create draft",                      friendly: "Save to the drafts folder without sending. Use this for workflows like 'have Claude prepare 10 reply options, then I'll review and send'." },
        { name: "add_label",       desc: "Apply label",                       friendly: "Apply a label (`Work`, `Follow-up` etc.) to a specified message. Use for auto-sorting and follow-up task list creation." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-gc", title: "Google Calendar", subtitle: "Schedule Management", desc: "Manage Google Calendar events",
    meta: { server: "gcalendar", auth: "oauth", action: "tool", tool_name: "suggest_time", params: '{ "attendees": ["you@example.com","colleague@example.com"], "duration": 30, "within_days": 7 }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from list_events / create_event / update_event / delete_event / suggest_time",
        target:  "Calendar ID (default: primary) + event ID or time range",
        content: "Event title / start time / end time / attendee list / location etc.",
        summary: "Check, adjust, and manage schedules. Tasks like 'book a meeting with a colleague next week when free' or 'summarize today's schedule'.",
      },
      capabilities: [
        { name: "list_events",  desc: "List events",                      friendly: "Get a list of events for a specified period (e.g. this week / today / next Monday). Returns title, time, location, and attendees — useful as a starting point for 'today's schedule summary' or 'list important events only'." },
        { name: "create_event", desc: "Create new event",                 friendly: "Create a new event. Can specify title, start/end time, attendees, location, and recurrence. Created immediately without confirmation, so control via permissions like send_message." },
        { name: "update_event", desc: "Update existing event",            friendly: "Change an event's time, title, or attendees. Use for reschedules like 'move Friday 2pm meeting to 3pm'." },
        { name: "delete_event", desc: "Delete event",                     friendly: "Cancel and delete an event. Notifies attendees, so denying in permissions is the standard safe approach." },
        { name: "suggest_time", desc: "Suggest free time for all attendees", friendly: "Compare multiple people's schedules and suggest time slots when everyone is free. Most convenient for scheduling like 'arrange a 30-minute meeting with 3 people within next week'. Read-only so safe." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-nt", title: "Notion", subtitle: "Page & DB Operations", desc: "Operate on Notion pages and databases",
    meta: { server: "notion", auth: "oauth", action: "resource", resource_uri: "notion://page/abc123def456",
      io: { in: "server + resource_uri", out: "resource content (text/JSON/binary)" },
      flowGuide: {
        what:    "search / create_page / update_page / query_database / create_database_entry (tool) or reference via resource notion://page/{id}",
        target:  "Page ID / Database ID / search query. Extract IDs from Notion URLs.",
        content: "Page title / body (Markdown → Notion blocks) / property values / filter conditions",
        summary: "Operate on documents and databases on Notion. Use cases: 'new page from meeting minutes template', 'append this week's progress to a specific DB', 'reference page → summarize', etc.",
      },
      capabilities: [
        { name: "search",                desc: "Search entire workspace (tool)",                           friendly: "Cross-search pages, databases, and comments in the workspace. Use for searches like 'all last month's meeting minutes' or 'pages with keyword QBR'." },
        { name: "create_page",           desc: "Create new page (tool)",                                   friendly: "Create a new page. Specify parent page or DB + title + body (Markdown equivalent) + property values. Use for automated creation like 'new page from meeting minutes template'." },
        { name: "update_page",           desc: "Update existing page (tool)",                              friendly: "Update page properties (status, owner, deadline etc.) or body. Use for ongoing updates like 'set task status to Done' or 'append decisions to meeting minutes'." },
        { name: "query_database",        desc: "Filter and sort database (tool)",                          friendly: "SQL-like filtering, sorting, and paging for a Notion DB. Use for retrieval like 'tasks due this week assigned to me' or 'active deals sorted by priority'." },
        { name: "create_database_entry", desc: "Add new entry to DB (tool)",                               friendly: "Add a new row to a Notion DB (task management, reading log, etc.). Specify property values (title, tags, date, etc.)." },
        { name: "notion://page/{id}",    desc: "Read-only page reference (resource)",                      friendly: "Specify a page ID as a URI to retrieve its body in read-only mode. Unlike the create_page/update_page tools, this is a reference without side effects. Use as source data for summarization or analysis." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-ln", title: "Linear / Jira / Asana", subtitle: "Ticket Management", desc: "Operate on tickets in project management tools",
    meta: { server: "linear", auth: "api_key", action: "tool", tool_name: "update_issue", params: '{ "id": "ENG-123", "state": "Done", "comment": "Released in PR #45" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Select from create_issue / update_issue / list_issues / add_comment / assign",
        target:  "Ticket ID (e.g. ENG-123) or project ID + filter conditions",
        content: "Title / body / status (Todo/In Progress/Done etc.) / owner / priority",
        summary: "Automated ticket updates linked to GitHub PRs/commits, regular reports, auto-assign, etc. Use for automations like 'set ticket to Done on PR merge' or 'notify Slack of incomplete tickets every morning'.",
      },
      capabilities: [
        { name: "create_issue", desc: "Create a ticket",                       friendly: "Create a new ticket. Specify title, body (Markdown), status, owner, priority, and labels. Use for automations like 'auto-file bug tickets on test failure' or 'bulk-create Todos for regular reviews'." },
        { name: "update_issue", desc: "Change status, owner, or priority",     friendly: "Change properties of an existing ticket. Use for linked workflows like 'auto-Done on PR merge' or 'raise priority when blocker found'." },
        { name: "list_issues",  desc: "Get ticket list (with filters)",        friendly: "Retrieve tickets with conditions. Use for overviews like 'incomplete tickets assigned to me' or 'all overdue tickets'." },
        { name: "add_comment",  desc: "Add comment to ticket",                 friendly: "Add a progress comment to an existing ticket. Use for record automation like 'auto-comment code review results' or 'auto-post daily status'." },
        { name: "assign",       desc: "Assign an owner",                       friendly: "Change the ticket owner. Use for adjustments like 'auto-assign based on label' or 're-assign from overloaded to other team members'." },
      ] } },

  // D. MCP (Dev) — developer sub-elements. For those who understand MCP spec details. Tier 3 + ⚙ icon.
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-call", title: "⚙ MCP Tool Call", subtitle: "MCP spec: tool call", desc: "The 'tools' action from MCP protocol's 3 elements. Equivalent to action=tool on server cards.",
    meta: { action: "tool" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-res", title: "⚙ MCP Resource Fetch", subtitle: "MCP spec: resource fetch", desc: "The 'resources' action from MCP protocol's 3 elements. Read-only, no side effects.",
    meta: { action: "resource" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-prm", title: "⚙ MCP Prompt Template", subtitle: "MCP spec: prompt use", desc: "The 'prompts' action from MCP protocol's 3 elements. Calls a pre-defined prompt template.",
    meta: { action: "prompt" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-oauth", title: "⚙ MCP OAuth Auth", subtitle: "Dynamic auth flow", desc: "OAuth authentication flow to an MCP server (Dynamic Client Registration). User logs in via browser to obtain a token.",
    meta: { auth: "oauth" } },

  // E. Skills
  // E. Skills — concrete cards only. Frontmatter (name/description/allowed-tools/scripts etc.)
  // is consolidated in the "settings fields" section of the detail panel. meta values are samples.
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-file", title: "Skill (Generic)", subtitle: ".claude/skills/<name>/SKILL.md", desc: "Custom skill. In real flows, name / description / allowed-tools / reference files / scripts differ per skill (values here are samples).",
    meta: {
      // ── Call request (what this node requests in the flow) ──
      request_prompt: "For today's new feature release, create 3 draft posts matching the tone of past posts and prepare for publishing",
      target_files: ["~/.x-history.json"],
      output_schema: "3 draft options + variation rationale for each (Markdown)",
      arguments_value: "new feature release",
      expected_io: "Receive 'new feature release' topic → 3 drafts in the style of past posts + user confirmation → post via X API",
      // ── Skill definition (the core capability) ──
      file: ".claude/skills/example-flow/SKILL.md",
      name: "example-flow",
      description: "Activated by 'post to X' or 'make a tweet'. Generates, confirms, and posts the content.",
      "allowed-tools": ["Read","WebFetch","Bash(curl *)"],
      model: "sonnet",
      effort: "medium",
      reference_files: ["style-guide.md","templates/post.md"],
      scripts: ["scripts/post.py","scripts/analyze-history.py"],
      "argument-hint": "[topic]",
      "disable-model-invocation": "false",
      "user-invocable": "true",
      context: "normal",
      io: { in: "user's instruction (keyword matching description) + context", out: "posted result + copy of post text" },
      // Internal flow — what this skill actually does inside SKILL.md
      subflow: [
        { title: "Load past posts",          tool: "Bash",     detail: "Use scripts/analyze-history.py to parse ~/.x-history.json and extract recent tone and topic trends" },
        { title: "Reference style guide",    tool: "Read",     detail: "Read style-guide.md / templates/post.md from reference_files to understand writing style rules" },
        { title: "Generate 3 draft options", tool: "(model)",  detail: "Create 3 varied drafts reflecting $ARGUMENTS topic and style constraints" },
        { title: "Present 3 options to user", tool: "user",   detail: "Interactively confirm which option to use and any minor revisions" },
        { title: "Post via X API",            tool: "Bash",    detail: "Run scripts/post.py (which calls X API via curl internally). Pre-allowed via Bash(curl *) in allowed-tools" },
        { title: "Append to history",         tool: "Bash",    detail: "After successful post, append new entry to ~/.x-history.json" },
      ]
    }
  },
  // Official skills (distributed via anthropic-skills plugin) — placed in flow to explicitly mark where an artifact is generated/read
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-docx", title: "docx", subtitle: "Word Document Generation, Edit & Read",
    desc: "Create, read, and edit Word documents (.docx). Supports formatted official documents, templates, and letterheads. Use in flows that output meeting minutes, contracts, or reports as Word files.",
    meta: {
      // ── Call request ──
      request_prompt: "Take the meeting notes text (meeting-notes.md) and fill it into our company letterhead Word minutes template (templates/minutes-template.docx), saving as output/2026-05-21-minutes.docx",
      target_files: ["meeting-notes.md","templates/minutes-template.docx"],
      output_schema: "output/2026-05-21-minutes.docx (Word document, company letterhead + minutes format)",
      arguments_value: "",
      expected_io: "meeting-notes.md (text) + template → completed .docx with letterhead",
      // ── Skill definition ──
      builtin: true,
      name: "docx",
      description: "Create, read, edit, and manipulate Word documents (.docx). Supports formatted official documents, templates, and letterheads.",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md","examples/letterhead.docx"],
      scripts: ["scripts/create_docx.py","scripts/extract_text.py","scripts/replace_text.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".docx file reference or creation instructions + content data", out: "generated / edited .docx file" }
    }
  },
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-pptx", title: "pptx", subtitle: "PowerPoint Generation & Edit",
    desc: "Generate and edit PowerPoint (.pptx). Supports template application, chart insertion, and slide master control. Use in flows that auto-generate sales materials, weekly reports, or pitch decks.",
    meta: {
      // ── Call request ──
      request_prompt: "Read data/weekly-kpi.json and create a weekly report with our company template (templates/business.pptx) in 10 slides or fewer. Structure: cover / summary / 3 key KPIs / issues / next week's actions / Q&A.",
      target_files: ["data/weekly-kpi.json","templates/business.pptx"],
      output_schema: "output/2026-W21-weekly-report.pptx (10-slide structure, business template applied)",
      arguments_value: "",
      expected_io: "JSON data + template → sales weekly report .pptx (10 slides)",
      // ── Skill definition ──
      builtin: true,
      name: "pptx",
      description: "Create and edit PowerPoint (.pptx) slide decks. Supports template application, chart/table/image insertion, and slide master control.",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md","templates/business.pptx"],
      scripts: ["scripts/create_pptx.py","scripts/add_slide.py","scripts/apply_template.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".pptx file reference or slide structure data", out: "generated / edited .pptx file" }
    }
  },
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-xlsx", title: "xlsx", subtitle: "Excel/CSV/TSV Read & Write",
    desc: "Read/write Excel/CSV/TSV, data cleaning, formula application, and chart insertion. Use in flows that output aggregated results as Excel, or flows that clean and import messy CSVs.",
    meta: {
      // ── Call request ──
      request_prompt: "Read data/sales-raw-2026-05.csv and: (1) remove blank rows and duplicates, (2) normalize date column to YYYY-MM-DD, (3) aggregate monthly sales by product category with SUMIFS, (4) output results with bar chart to output/sales-2026-05-summary.xlsx",
      target_files: ["data/sales-raw-2026-05.csv"],
      output_schema: "output/sales-2026-05-summary.xlsx (2 sheets: raw_cleaned / summary_with_chart)",
      arguments_value: "",
      expected_io: "messy CSV → cleaned + aggregated + chart .xlsx",
      // ── Skill definition ──
      builtin: true,
      name: "xlsx",
      description: "Read, write, and edit Excel (.xlsx/.xlsm) / CSV / TSV. Supports data cleaning, formula application, formatting, and chart insertion.",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md"],
      scripts: ["scripts/clean_csv.py","scripts/apply_formulas.py","scripts/add_chart.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".xlsx/.csv file reference + operation instructions", out: "formatted / aggregated / generated tabular file" }
    }
  },
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-pdf", title: "pdf", subtitle: "PDF Read, Generate & Manipulate",
    desc: "Read, merge, split, OCR, and fill forms for PDFs. Use in flows that extract clauses from contracts, merge multiple PDFs, or convert scanned PDFs to text.",
    meta: {
      // ── Call request ──
      request_prompt: "Read invoices/2026-Q2-001.pdf and extract the total amount, currency, payment due date, and vendor name, returning them in the following JSON schema.\n\n{\n  \"amount\":   number,\n  \"currency\": \"JPY\"|\"USD\"|\"EUR\",\n  \"due_date\": \"YYYY-MM-DD\",\n  \"vendor\":   string\n}",
      target_files: ["invoices/2026-Q2-001.pdf"],
      output_schema: "{\n  \"amount\":   number,\n  \"currency\": \"JPY\"|\"USD\"|\"EUR\",\n  \"due_date\": \"YYYY-MM-DD\",\n  \"vendor\":   string\n}",
      arguments_value: "",
      expected_io: "invoice PDF → { amount: 380000, currency: \"JPY\", due_date: \"2026-06-30\", vendor: \"Acme Corp\" }",
      // ── Skill definition ──
      builtin: true,
      name: "pdf",
      description: "General PDF file operations. Read (text/table extraction), merge, split, rotate, watermark, form fill, and OCR.",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md"],
      scripts: ["scripts/extract_text.py","scripts/merge_pdfs.py","scripts/ocr.py","scripts/fill_form.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".pdf file reference + operation instructions", out: "extracted text / generated / edited .pdf file" }
    }
  },

  // F. Commands
  // F. Commands — consolidated to 1 generic custom slash command card.
  //   $ARGUMENTS / frontmatter (description, model, tools) etc. are merged into detail panel fields.
  //   Built-in commands (/init, /clear etc.) are not made into cards (not used in flows/automations).
  //   meta is sample values. Will differ per node in real flows.
  //   subflow is intended for future "+" expansion on the canvas side (not shown in detail panel).
  { cat: "F. Commands", tier: 1, type: "command", id: "cm-file", title: "Custom Command (Generic)", subtitle: ".claude/commands/*.md", desc: "Custom routine callable with /command-name. Executed via the SlashCommand tool in flows.",
    meta: {
      file: ".claude/commands/*.md",
      name: "deploy",
      description: "Pre-deploy check & execute",
      model: "sonnet",
      allowed_tools: ["Bash","Read","WebFetch"],
      argument_hint: "<env: prod | staging | dev>",
      prompt: "Deploy to the $ARGUMENTS environment.\n\n1. Check for uncommitted changes with git status\n2. If none, run npm test\n3. If tests pass, run ./scripts/deploy.sh $ARGUMENTS\n4. Notify results to Slack #deploy channel",
      input:  "$ARGUMENTS (e.g. 'prod')\n+ env vars + context passed from previous step",
      output: "Deploy result (success/failure) + log URL + elapsed time",
      io: { in: "$ARGUMENTS (e.g. 'prod')", out: "deploy result (success/failure + log URL)" },
      flowGuide: {
        what:    "Command name (identifier after /)",
        target:  "Format of arguments received by $ARGUMENTS (specified in argument_hint)",
        content: "Prompt body that runs when the command executes. Describe multiple steps in Markdown.",
      },
      // Interim representation: record internal processing as subflow (future: expand on canvas side)
      subflow: [
        { title: "Check git status",   tool: "Bash",  detail: "Detect uncommitted changes" },
        { title: "Run tests",          tool: "Bash",  detail: "Run npm test" },
        { title: "Execute deploy",     tool: "Bash",  detail: "./scripts/deploy.sh $ARGUMENTS" },
        { title: "Slack notification", tool: "mcp",   detail: "Post results to #deploy (via Slack MCP)" },
      ],
    } },

  // G. Plugin — removed. Plugins are "distribution packages", not flow execution nodes.
  // After installation, their contents (commands/agents/skills/hooks/MCP) are expressed via cards in existing categories.

  // H. Settings — removed.
  //   settings.json / CLAUDE.md / AGENTS.md / .claudeignore are not flow nodes —
  //   they are the foundation of flow execution, auto-loaded at session start. Not needed for flow rendering since there's no explicit call.
  //   To represent settings changes in a flow, use Hook (ConfigChange / InstructionsLoaded).

  // I. API — external API calls. LLM APIs (Claude/OpenAI/Gemini) + various SaaS REST APIs.
  //   Dynamic fields per service switch via TYPE_SPECS.api.fieldsByService.
  //   Secrets (api_key/webhook_url) show as masked in the UI via f.secret: true (linked to .env in real implementation).

  // Tier 1: LLM APIs (frequently used LLMs including Claude)
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-claude", title: "Claude API", subtitle: "Anthropic Messages API", desc: "Anthropic's official Messages API. Supports tool_use loops, prompt caching, and server tools (web_search etc.)",
    meta: { service: "claude", api_key: "", model: "claude-sonnet-4-5", system: "You are...", messages: '[\n  { "role": "user", "content": "..." }\n]', tools: "", server_tools: [], temperature: 0.7, max_tokens: 4096, cache: "none",
      io: { in: "model + system + messages + tools (+ cache)", out: "assistant message or tool_use block" } } },
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-openai", title: "OpenAI API", subtitle: "GPT-4 / o1 series", desc: "OpenAI's Chat Completions API. Supports Function Calling, JSON mode, and o1 reasoning models.",
    meta: { service: "openai", api_key: "", model: "gpt-4o", system: "You are...", messages: '[\n  { "role": "user", "content": "..." }\n]', tools: "", temperature: 0.7, max_tokens: 4096,
      io: { in: "model + messages + tools", out: "choices[0].message or tool_calls" } } },
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-gemini", title: "Gemini API", subtitle: "Google AI Studio", desc: "Call Google's Gemini model via the Generative API. Supports long context and multimodal.",
    meta: { service: "gemini", api_key: "", model: "gemini-2.0-flash", system: "...", contents: '[\n  { "role": "user", "parts": [{ "text": "..." }] }\n]', tools: "", temperature: 0.7,
      io: { in: "model + contents + tools", out: "candidates[0].content or functionCall" } } },

  // Tier 2: External SaaS APIs (not covered by MCP)
  { cat: "I. External API", tier: 2, type: "api", id: "a-line", title: "LINE Messaging API", subtitle: "LINE Official Account", desc: "Send messages to users from a LINE official account. push / multicast / broadcast / reply",
    meta: { service: "line", channel_access_token: "", endpoint: "push (individual send)", to: "USER_ID", messages: '[\n  { "type": "text", "text": "notification body" }\n]',
      io: { in: "endpoint + to + messages", out: "send result (sentMessages[] etc)" } } },
  { cat: "I. External API", tier: 2, type: "api", id: "a-stripe", title: "Stripe API", subtitle: "Payments & Subscriptions", desc: "Payment processing, customer management, subscription management. Switch between test and live keys.",
    meta: { service: "stripe", secret_key: "", endpoint: "charges (payment)", params: '{\n  "amount": 2000,\n  "currency": "jpy",\n  "source": "tok_visa"\n}',
      io: { in: "endpoint + params", out: "Stripe object (charge/subscription/...)" } } },
  { cat: "I. External API", tier: 2, type: "api", id: "a-discord", title: "Discord Webhook", subtitle: "Channel Post", desc: "Webhook post to a Discord channel. Supports text / embeds / mentions.",
    meta: { service: "discord", webhook_url: "", username: "DeployBot", content: "Deploy complete ✅", embeds: '[{\n  "title": "v1.2.3 released",\n  "color": 5814783\n}]',
      io: { in: "webhook_url + content/embeds", out: "204 No Content (send complete)" } } },

  // Tier 1: Generic REST API (for services not covered above)
  { cat: "I. Generic API", tier: 1, type: "api", id: "a-rest", title: "REST API (Generic)", subtitle: "Any HTTPS request", desc: "Generic card for calling any REST/HTTP API directly. Use for services not covered by MCP or custom APIs.",
    meta: { service: "rest", method: "POST", url: "https://api.example.com/v1/resource", auth_type: "Bearer Token", auth_value: "", headers: "Content-Type: application/json", body: '{\n  "key": "value"\n}', response_path: ".data.id",
      io: { in: "method + url + headers + body", out: "HTTP response (JSON/text/binary)" } } },

  // J. Agent SDK — category fully removed.
  //   Reason: SDK installation is a one-time environment setup, not a node called repeatedly in an automation flow.
  //   Same logic as Plugin (distribution/environment setup vs. flow entity).
  //   Managed Agents (Anthropic-hosted REST) may be merged into I. Server Tools in the future.
  //   ref-agentsdk (design sample) remains in ★ Node Types (the type itself is preserved).

  // L. Composite Flows
  // L. Composite Flows — removed from ELEMENTS.
  //   Flow examples are consolidated in the FLOWS array (in whiteboard.html, shown in workflow mode).
  //   ELEMENTS = "node components", FLOWS = "examples of node combinations". Roles separated.
  //   FLOWS may be extracted to flow-templates.js in the future (see IMPLEMENTATION_NOTES.md).

  // M. Meta Visualization — category fully removed.
  //   Reason: Timeline / active path highlight / data flow visualization are
  //   display modes / view features of the Flow Inspector app itself, not "nodes" to place in a flow diagram.
  //   Transferred to IMPLEMENTATION_NOTES.md as UI features for real implementation.

  // N. Placeholder elements — category removed.
  //   new-schedule → promoted to K. Trigger's tr-cron (officially supported via Anthropic Routines / CronCreate)
  //   new-parallel → removed (parallel execution can be expressed by multiple edges from one node; dedicated node not needed)

  // K. Trigger — flow start points (what causes the flow to run). The first node placed in a flow diagram.
  //   Settings values switch dynamically via TYPE_SPECS.trigger.fieldsBySource.
  //   Secrets (Webhook URL / Auth Token etc.) are masked in the UI via f.secret: true (linked to .env in real implementation).
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-manual", title: "Manual Launch", subtitle: "/command / prompt / UI", desc: "User explicitly launches the flow.",
    meta: { source: "manual", trigger_type: "/slash-command", command: "/draft-nda", prompt_hint: "Also launched by natural language like 'make an NDA with Tanaka'",
      io: { in: "user's prompt or /command + arguments", out: "downstream flow + user input data" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-cron", title: "Scheduled Launch", subtitle: "cron / Routines", desc: "Auto-launch the flow on a recurring schedule or at a specified time.",
    meta: { source: "cron", schedule: "Daily at 9am", cron_expr: "0 9 * * *", timezone: "Asia/Tokyo", implementation: "Anthropic Routines (claude.ai)",
      io: { in: "(time reached)", out: "downstream flow + launch timestamp" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-webhook", title: "Webhook Receive", subtitle: "External HTTP POST", desc: "Launch on HTTP request from GitHub / Stripe / custom API.",
    meta: { source: "webhook", webhook_url: "", method: "POST", auth: "HMAC signature", auth_secret: "", payload_path: ".user.id",
      io: { in: "HTTP request (headers + body)", out: "downstream flow + payload" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-email", title: "Email Receive", subtitle: "Gmail / IMAP", desc: "Launch when an email matching specific conditions is received.",
    meta: { source: "email", email_account: "support@example.com", auth_token: "", filter: "is:unread label:invoices from:billing@", polling_interval: "5 min",
      io: { in: "incoming email (from / subject / body / attachments)", out: "downstream flow + email content" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-chat", title: "Chat Input", subtitle: "LINE / Slack / Discord bot", desc: "Launch on message received via chatbot.",
    meta: { source: "chat", chat_platform: "LINE", auth_token: "", filter: "all messages (specific keyword can be set)",
      io: { in: "chat message + sender info", out: "downstream flow + message content" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-app-event", title: "App Event", subtitle: "Notion / Linear / GitHub etc.", desc: "Launch on event inside a SaaS app (form submit / DB row added / event created etc. all consolidated here).",
    meta: { source: "app-event", app: "Notion", event_type: "page.created", auth_token: "", filter: "database_id == 'xxx' && status == 'New'", implementation: "MCP polling",
      io: { in: "app event data (JSON)", out: "downstream flow + event data" } } },
];

