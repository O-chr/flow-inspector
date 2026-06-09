/**
 * Flow Inspector — Elements Catalog
 *
 * Master definition: finalized in 8093 (whiteboard) → shared with 8092 (Inspector / Builder)
 * Contains ELEMENTS data (Tier 1-3, 130+ cards)
 *
 * Dependency: shared/flow-elements.js (initializes window.FI first)
 */

const FI_ELEMENTS = [
  // ── Design Reference: sample of all node types ──
  { cat: "★ Node Types", tier: 1, type: "parent",   id: "ref-parent",   title: "Skill Receive",           subtitle: "Parent Agent",                desc: "Parent agent node that controls the entire flow. Rounded rect + blue accent bar", meta: { shape: "rect (rx:10)", accent: "left sidebar", color: "#2563eb" } },
  { cat: "★ Node Types", tier: 1, type: "hook",     id: "ref-hook",     title: "pre: Input Validation",   subtitle: "PreToolUse Hook",             desc: "Hook node that fires on events. Parallelogram + orange accent bar", meta: { shape: "para (skew:14)", accent: "slanted bar", color: "#c2410c" } },
  { cat: "★ Node Types", tier: 1, type: "subagent", id: "ref-subagent", title: "Explore: Past Post Analysis", subtitle: "Subagent (read-only)",     desc: "Subagent that can run in parallel. Hexagon + purple diamond accent", meta: { shape: "hex (inset:16)", accent: "diamond", color: "#7c3aed" } },
  { cat: "★ Node Types", tier: 1, type: "think",    id: "ref-think",    title: "Draft Writing",           subtitle: "Claude Invocation",           desc: "LLM call step that sends reasoning to Claude itself. No subagent is launched — continues from the current conversation. Large rounded rect + purple accent bar (same color as subagent, distinguished by shape)", meta: { shape: "rect (rx:14)", accent: "left sidebar", color: "#7c3aed" } },
  { cat: "★ Node Types", tier: 1, type: "mcp",      id: "ref-mcp",      title: "Image Asset Search",      subtitle: "canva-mcp",                   desc: "External MCP integration node. Pill shape (fully rounded) + green circle accent", meta: { shape: "pill (rx:h/2)", accent: "circle", color: "#15803d" } },
  { cat: "★ Node Types", tier: 1, type: "code",     id: "ref-code",     title: "Read",                    subtitle: "File Read",                   desc: "Code execution / tool call node. Sharp rect + $_ prompt accent", meta: { shape: "sharp (rx:2)", accent: "$_ prompt", color: "#525252" } },
  { cat: "★ Node Types", tier: 1, type: "user",     id: "ref-user",     title: "Timeline",                subtitle: "Chronological View",          desc: "User interaction / display node. Octagon + sidebar accent", meta: { shape: "octa (chamfer:16)", accent: "sidebar", color: "#a16207" } },
  { cat: "★ Node Types", tier: 1, type: "decision", id: "ref-decision", title: "Branch",                  subtitle: "Decide by Bash Result",       desc: "Branching decision node. Diamond shape", meta: { shape: "diamond", accent: "none", color: "#1f2937" } },
  { cat: "★ Node Types", tier: 1, type: "skill",    id: "ref-skill",    title: "SKILL.md File",           subtitle: "name / description / body",   desc: "Skill definition node. Rounded rect + cyan accent bar", meta: { shape: "rect (rx:10)", accent: "left sidebar", color: "#0891b2" } },
  { cat: "★ Node Types", tier: 1, type: "command",  id: "ref-command",  title: "commands/run.md",         subtitle: "Under claude/commands/",      desc: "Custom command node. Sharp rect + $_ accent", meta: { shape: "sharp (rx:2)", accent: "$_ prompt", color: "#6d28d9" } },
  { cat: "★ Node Types", tier: 1, type: "config",   id: "ref-config",   title: "settings.json",           subtitle: "model / allowedTools / permissions", desc: "Settings node. Rounded rect + grey accent", meta: { shape: "rect (rx:9)", accent: "left sidebar", color: "#78716c" } },
  { cat: "★ Node Types", tier: 1, type: "api",      id: "ref-api",      title: "model",                   subtitle: "Model Name Specification",    desc: "API parameter node. Pill shape + teal circle accent", meta: { shape: "pill (rx:h/2)", accent: "circle", color: "#0d9488" } },
  { cat: "★ Node Types", tier: 1, type: "plugin",   id: "ref-plugin",   title: "plugin.json",             subtitle: "Plugin Manifest",             desc: "Plugin definition node. Tab shape (top-left notch) + indigo accent", meta: { shape: "tab (notch:10)", accent: "left sidebar", color: "#4f46e5" } },
  { cat: "★ Node Types", tier: 1, type: "agentsdk", id: "ref-agentsdk", title: "createAgentWithOptions",  subtitle: "agent.ts Entry Point",        desc: "Agent SDK node. Trapezoid (narrow top) + rose accent", meta: { shape: "trap (inset:12)", accent: "slanted bar", color: "#be185d" } },
  { cat: "★ Node Types", tier: 1, type: "trigger",  id: "ref-trigger",  title: "Trigger (Start)",         subtitle: "Flow Entry Point",            desc: "Trigger node. Pill shape (like a flowchart start node) + amber accent", meta: { shape: "pill (rx:h/2)", accent: "circle", color: "#d97706" } },

  // A. Hook Events
  // A. Hook Events — 22 items (each has different trigger timing, input data, matcher semantics,
  // blocking capability, and output fields, so individual cards are kept.
  // Tier1=required 5, Tier2=important 8, Tier3=differentiating 9).
  // meta.placement on each card is for future flow placement validation (see IMPLEMENTATION_NOTES.md).

  // ─── Tier 1 (Required) ───
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "SessionStart", title: "SessionStart", subtitle: "On Session Start", desc: "Fires when a session starts. matcher: startup / resume / clear / compact",
    meta: { event: "SessionStart", placement: "session-start", matcher: "startup|resume", handler_type: "command", command: "echo 'Loading project info…' && cat .claude/STATUS.md", timeout: 30, additionalContext: "Inform Claude of recent project changes",
      io: { in: "session start info (how: startup/resume/clear/compact, cwd, project_dir)", out: "Inject additional info to Claude via additionalContext" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "UserPromptSubmit", title: "UserPromptSubmit", subtitle: "On Prompt Submit", desc: "Fires immediately after the user sends a message. Use for context injection or blocking dangerous instructions.",
    meta: { event: "UserPromptSubmit", placement: "before-prompt", matcher: "", handler_type: "prompt", prompt_text: "Check this prompt for risk of leaking sensitive information", timeout: 30, async: "false", permission_decision: "allow",
      io: { in: "user prompt text + session info", out: "additionalContext / sessionTitle / block decision" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "PreToolUse", title: "PreToolUse", subtitle: "Before Tool Execution (Critical)", desc: "Fires immediately before Claude executes a tool. Specify the target tool with matcher. Can block.",
    meta: { event: "PreToolUse", placement: "before-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/validate-bash.sh", timeout: 30, permission_decision: "allow",
      io: { in: "tool_name + tool_input (pre-execution info)", out: "permissionDecision (allow/deny/ask) / toolInputModification / additionalContext" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "PostToolUse", title: "PostToolUse", subtitle: "After Tool Execution", desc: "Fires immediately after a tool succeeds. Use for auto-formatting, running tests, logging, etc.",
    meta: { event: "PostToolUse", placement: "after-tool", matcher: "Edit|Write", handler_type: "command", command: "prettier --write \"$FILE_PATH\"", timeout: 30,
      io: { in: "tool_name + tool_input + tool_response (including execution result)", out: "additionalContext (report result to Claude)" } } },
  { cat: "A. Hook Events", tier: 1, type: "hook", id: "Stop", title: "Stop", subtitle: "On Response Complete", desc: "Fires when Claude finishes responding. Use for completion notifications or forcing continuation.",
    meta: { event: "Stop", placement: "before-response-end", matcher: "", handler_type: "http", url: "https://hooks.slack.com/services/T00000/B00000/XXXXXXXX", timeout: 10,
      io: { in: "response completion info", out: "Send notification to Slack etc. / force continuation via block decision" } } },

  // ─── Tier 2 (Important) ───
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "PostToolUseFailure", title: "PostToolUseFailure", subtitle: "On Tool Failure", desc: "Fires when a tool execution fails. Use for error logging or suggesting retries.",
    meta: { event: "PostToolUseFailure", placement: "after-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/log-failure.sh", timeout: 10,
      io: { in: "tool_name + tool_input + error info", out: "additionalContext (inform Claude of error and suggest retry)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "PermissionRequest", title: "PermissionRequest", subtitle: "On Permission Dialog", desc: "Fires when a permission dialog appears. Inject auto-approve or auto-deny rules.",
    meta: { event: "PermissionRequest", placement: "before-tool", matcher: "Bash", handler_type: "command", command: "bash scripts/auto-approve.sh", timeout: 5, permission_decision: "allow",
      io: { in: "tool_name + tool_input", out: "decision.behavior (allow/deny) + decision.updatedInput" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "SubagentStart", title: "SubagentStart", subtitle: "On Subagent Launch", desc: "Fires at the moment a subagent starts. Use for start logging or passing initial context.",
    meta: { event: "SubagentStart", placement: "subagent-start", matcher: "Explore|Plan", handler_type: "command", command: "echo \"[$(date)] Subagent started\" >> .claude/agent.log", timeout: 5,
      io: { in: "subagent_type + prompt", out: "additionalContext (initial info for the subagent)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "SubagentStop", title: "SubagentStop", subtitle: "On Subagent Complete", desc: "Fires at the moment a subagent completes. Use for result aggregation or completion reporting.",
    meta: { event: "SubagentStop", placement: "subagent-stop", matcher: "Explore|Plan", handler_type: "command", command: "echo \"[$(date)] Subagent finished\" >> .claude/agent.log", timeout: 5,
      io: { in: "subagent_type + execution result", out: "additionalContext (result summary for parent agent)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "ConfigChange", title: "ConfigChange", subtitle: "On Config Change", desc: "Fires when settings.json or similar config files change. Use for diff notifications or post-reload processing.",
    meta: { event: "ConfigChange", placement: "file-watch", matcher: "", handler_type: "command", command: "bash scripts/notify-config-change.sh", timeout: 10,
      io: { in: "changed file path + diff", out: "additionalContext (notify Claude of changes)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "InstructionsLoaded", title: "InstructionsLoaded", subtitle: "On CLAUDE.md / .claude/rules/*.md Load", desc: "Fires when instruction files finish loading. Use to add project-specific context.",
    meta: { event: "InstructionsLoaded", placement: "file-watch", matcher: "", handler_type: "command", command: "cat .claude/recent-decisions.md", timeout: 5,
      io: { in: "loaded file path", out: "additionalContext (inject supplemental info)" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "FileChanged", title: "FileChanged", subtitle: "File Change Detection", desc: "Fires when a watched file changes. Put the filename itself in the matcher (custom scheme).",
    meta: { event: "FileChanged", placement: "file-watch", matcher: ".envrc|.env", handler_type: "command", command: "bash scripts/reload-env.sh", timeout: 10,
      io: { in: "file path + change type (created/modified/deleted)", out: "additionalContext" } } },
  { cat: "A. Hook Events", tier: 2, type: "hook", id: "Notification", title: "Notification", subtitle: "On System Notification", desc: "Fires when a system notification is emitted. matcher: permission_prompt / elicitation_dialog etc.",
    meta: { event: "Notification", placement: "notification", matcher: "permission_prompt|elicitation_dialog", handler_type: "command", command: "osascript -e 'display notification \"Claude requests attention\"'", timeout: 5,
      io: { in: "notification type + message", out: "(no output, side-effect only)" } } },

  // ─── Tier 3 (Differentiating) ───
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "SessionEnd", title: "SessionEnd", subtitle: "On Session End", desc: "Fires when a conversation session ends. Use for saving work logs or cleanup.",
    meta: { event: "SessionEnd", placement: "session-end", matcher: "logout|clear", handler_type: "command", command: "bash scripts/save-session-log.sh", timeout: 30,
      io: { in: "end reason (logout/clear/resume)", out: "(no output, side-effect only)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "Setup", title: "Setup", subtitle: "On init / maintenance Run", desc: "Fires when running `claude --init-only` / `--maintenance`. matcher: init / maintenance",
    meta: { event: "Setup", placement: "session-start", matcher: "init|maintenance", handler_type: "command", command: "bash scripts/project-init.sh", timeout: 60,
      io: { in: "execution mode (init / maintenance)", out: "additionalContext" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "TaskCompleted", title: "TaskCompleted", subtitle: "On Task Complete", desc: "Fires when a Claude-managed task (e.g. TodoWrite) completes. Use to trigger next tasks or send notifications.",
    meta: { event: "TaskCompleted", placement: "subagent-stop", matcher: "", handler_type: "command", command: "bash scripts/on-task-done.sh", timeout: 10,
      io: { in: "completed task id / content", out: "additionalContext (instructions for next task)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "TeammateIdle", title: "TeammateIdle", subtitle: "On Teammate Idle", desc: "Fires when a collaborative agent becomes free. Assign the next piece of work.",
    meta: { event: "TeammateIdle", placement: "subagent-stop", matcher: "", handler_type: "command", command: "bash scripts/assign-next-task.sh", timeout: 30,
      io: { in: "idle teammate info", out: "new task assignment" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "Elicitation", title: "Elicitation", subtitle: "On MCP User Input Request", desc: "Fires when an MCP server requests user input. Use to auto-answer common prompts.",
    meta: { event: "Elicitation", placement: "mcp-input-request", matcher: "", handler_type: "command", command: "bash scripts/auto-fill-elicitation.sh", timeout: 10,
      io: { in: "input request from MCP server", out: "action (accept/decline/cancel) + content (form values)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "WorktreeCreate", title: "WorktreeCreate", subtitle: "On Git Worktree Create", desc: "Fires when a Git worktree (separate working folder) is created. Initialize the new workspace.",
    meta: { event: "WorktreeCreate", placement: "worktree-create", matcher: "", handler_type: "command", command: "cd $WORKTREE_PATH && npm install", timeout: 120,
      io: { in: "worktreePath + branch", out: "worktreePath (resolved path) + additionalContext" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "WorktreeRemove", title: "WorktreeRemove", subtitle: "On Git Worktree Remove", desc: "Fires when a Git worktree is removed. Use for cleanup and cache clearing.",
    meta: { event: "WorktreeRemove", placement: "worktree-remove", matcher: "", handler_type: "command", command: "rm -rf node_modules .next", timeout: 30,
      io: { in: "removed worktreePath", out: "(no output, side-effect only)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "PreCompact", title: "PreCompact", subtitle: "Before Compaction", desc: "Fires just before conversation history compaction begins. Save important info separately.",
    meta: { event: "PreCompact", placement: "before-compact", matcher: "manual|auto", handler_type: "command", command: "bash scripts/save-key-context.sh", timeout: 30,
      io: { in: "compaction trigger (manual / auto)", out: "additionalContext (info to preserve after summarization)" } } },
  { cat: "A. Hook Events", tier: 3, type: "hook", id: "PostCompact", title: "PostCompact", subtitle: "After Compaction", desc: "Fires immediately after history summarization completes. Reorganize state and re-inject needed info.",
    meta: { event: "PostCompact", placement: "after-compact", matcher: "manual|auto", handler_type: "command", command: "cat .claude/key-context.md", timeout: 10,
      io: { in: "compaction trigger + summary result", out: "additionalContext (info to re-inject)" } } },

  // A-2. Hook Handlers (h-*) — removed. Downgraded to handler_type options in each Hook Event card's fields.
  // A-3. Hook Control (c-*) — removed. Merged into each Hook Event card's fields (matcher / timeout / async / exit2 / output / perm / input / ctx).

  // B. Built-in Tools
  // B. File Operations — one card per tool. Config values are shown dynamically in the DetailPanel per-tool fields.
  // meta here are "representative samples". Values change per node in actual flows.
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-Read", title: "Read", subtitle: "File Read", desc: "Supports offset/limit/pages",
    meta: { tool: "Read", file_path: "/path/to/file.md", offset: 1, limit: 200,
      io: { in: "file_path (+ offset / limit / pages)", out: "file contents (text with line numbers)" } } },
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-Write", title: "Write", subtitle: "Create New File", desc: "Overwrites existing files",
    meta: { tool: "Write", file_path: "/path/to/new-file.md", content: "# New File\nWrite body here…",
      io: { in: "file_path + content (full text)", out: "write success/failure" } } },
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-Edit", title: "Edit", subtitle: "Edit File (Partial Replace)", desc: "Replace one occurrence of old_string with new_string",
    meta: { tool: "Edit", file_path: "/path/to/config.ts", old_string: "const PORT = 8080;", new_string: "const PORT = 9090;", replace_all: "false",
      io: { in: "file_path + old_string + new_string", out: "edit success/failure" } } },
  { cat: "B. File Operations", tier: 1, type: "code", id: "t-MultiEdit", title: "MultiEdit", subtitle: "Multi-location Edit", desc: "Edit multiple locations in one file atomically",
    meta: { tool: "MultiEdit", file_path: "/path/to/file.ts", edits: '[\n  { "old_string": "foo", "new_string": "bar" },\n  { "old_string": "baz", "new_string": "qux" }\n]',
      io: { in: "file_path + edits[]", out: "success/failure of all edits applied (atomic)" } } },
  { cat: "B. File Operations", tier: 2, type: "code", id: "t-NB", title: "NotebookEdit", subtitle: "Jupyter Notebook Edit", desc: "Cell-level editing of ipynb files",
    meta: { tool: "NotebookEdit", notebook_path: "/path/to/analysis.ipynb", cell_id: "abc123", cell_type: "code", edit_mode: "replace", new_source: "import pandas as pd\ndf = pd.read_csv('data.csv')",
      io: { in: "notebook_path + cell_id + new_source", out: "cell update result" } } },
  // B. Search — fast text search (Grep, ripgrep-based) and glob-pattern file search (Glob)
  { cat: "B. Search", tier: 1, type: "code", id: "t-Grep", title: "Grep", subtitle: "Text Search", desc: "Fast regex search equivalent to ripgrep",
    meta: { tool: "Grep", pattern: "function\\s+(\\w+)", path: "src/", glob: "*.ts", output_mode: "content", "-n": "true", "-C": 2, head_limit: 50,
      io: { in: "pattern + scope (path/glob/type) + options", out: "matched text, file list, or count" } } },
  { cat: "B. Search", tier: 1, type: "code", id: "t-Glob", title: "Glob", subtitle: "File Path Search", desc: "Enumerate files by glob pattern",
    meta: { tool: "Glob", pattern: "**/*.test.ts", path: "/path/to/repo",
      io: { in: "glob pattern + search root path", out: "array of matching file paths (by modification date)" } } },
  // B. Execution — shell command execution and background process control
  { cat: "B. Execution", tier: 1, type: "code", id: "t-Bash", title: "Bash", subtitle: "Shell Command", desc: "Supports timeout/run_in_background",
    meta: { tool: "Bash", command: "npm test -- --coverage", description: "Run tests with coverage", timeout: 300000, run_in_background: "false",
      io: { in: "command (+ timeout / run_in_background / description)", out: "stdout / stderr / exit code (or shell_id)" } } },
  { cat: "B. Execution", tier: 2, type: "code", id: "t-BO", title: "BashOutput", subtitle: "Background Output Fetch", desc: "Fetch output from a background Bash process",
    meta: { tool: "BashOutput", bash_id: "shell_abc123", filter: "ERROR|FAIL",
      io: { in: "bash_id (+ filter)", out: "latest output + status of the target shell" } } },
  { cat: "B. Execution", tier: 2, type: "code", id: "t-KB", title: "KillBash", subtitle: "Stop Bash Process", desc: "Terminate a Bash process",
    meta: { tool: "KillBash", shell_id: "shell_abc123",
      io: { in: "shell_id", out: "termination result" } } },

  // B. Web — access the external web
  { cat: "B. Web", tier: 1, type: "code", id: "t-WF", title: "WebFetch", subtitle: "Fetch URL", desc: "Fetch content from a URL and extract",
    meta: { tool: "WebFetch", url: "https://example.com/article", prompt: "Summarize the three main claims of this article",
      io: { in: "url + prompt", out: "extracted text (pre-processed by a smaller model)" } } },
  { cat: "B. Web", tier: 1, type: "code", id: "t-WS", title: "WebSearch", subtitle: "Web Search", desc: "Search via the Anthropic search backend",
    meta: { tool: "WebSearch", query: "Claude Code hooks 2026", allowed_domains: ["anthropic.com","code.claude.com"], blocked_domains: [],
      io: { in: "query (+ allowed/blocked_domains)", out: "search result titles + URL list" } } },

  // B. Task Management — Todo / subagent / slash commands
  { cat: "B. Task Management", tier: 1, type: "code", id: "t-TW", title: "TodoWrite", subtitle: "Task List Management", desc: "Update the Todo list within the session",
    meta: { tool: "TodoWrite", todos: '[\n  { "content": "Implement feature", "activeForm": "Implementing", "status": "in_progress" },\n  { "content": "Write tests", "activeForm": "Writing tests", "status": "pending" }\n]',
      io: { in: "todos[]", out: "Todo list update result" } } },
  { cat: "B. Task Management", tier: 1, type: "code", id: "t-Task", title: "Task", subtitle: "Launch Subagent", desc: "Launch a subagent in a separate context",
    meta: { tool: "Task", subagent_type: "Explore", description: "Find auth implementation", prompt: "Report file paths and line numbers where authentication-related code is implemented", run_in_background: "false", isolation: "none",
      io: { in: "subagent_type + prompt (+ options)", out: "final result from the subagent (text)" } } },
  { cat: "B. Task Management", tier: 2, type: "code", id: "t-SC", title: "SlashCommand", subtitle: "Run Slash Command", desc: "Invoke a registered slash command",
    meta: { tool: "SlashCommand", command: "/review pr-123",
      io: { in: "command string (e.g. '/init args')", out: "command execution result" } } },

  // B. Plan Mode — entering and exiting plan mode
  { cat: "B. Plan Mode", tier: 2, type: "code", id: "t-PM", title: "EnterPlanMode", subtitle: "Start Plan Mode", desc: "Switch to write-restricted mode to create a plan",
    meta: { tool: "EnterPlanMode",
      io: { in: "(no parameters)", out: "mode transition result" } } },
  { cat: "B. Plan Mode", tier: 2, type: "code", id: "t-EPM", title: "ExitPlanMode", subtitle: "End Plan Mode", desc: "Present the plan and return to normal mode",
    meta: { tool: "ExitPlanMode", plan: "## Implementation Plan\n\n1. Add auth middleware\n2. Implement JWT token validation logic\n3. Add login/logout endpoints\n4. Write E2E tests",
      io: { in: "plan (Markdown-formatted plan)", out: "user approval result" } } },

  // C. Subagent
  // C. Subagent — entity cards only. Config fields (model/allowed_tools/permission_mode/isolation etc.)
  // are shown in the "Settings" section of the subagent node detail panel.
  { cat: "C. Subagent", tier: 1, type: "subagent", id: "sa-def", title: "Subagent (Generic)", subtitle: ".claude/agents/*.md", desc: "Custom subagent definition. In real flows, model, allowed tools, prompt, and I/O change per node (values here are samples).",
    meta: {
      file: ".claude/agents/*.md",
      model: "sonnet",
      allowed_tools: ["Read","Grep","Glob","WebFetch"],
      disallowed_tools: ["Bash"],
      permission_mode: "default",
      isolation: "none",
      prompt: "You are a specialist agent for ○○.\nComplete the task using the following steps:\n1. ...\n2. ...\n3. Summarize the result in Markdown and return",
      io: { in: "prompt + context from parent agent", out: "task execution result (natural text / structured data)" }
    }
  },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-explore", title: "builtin: Explore", subtitle: "Read-only Exploration Agent", desc: "Built-in subagent for safely investigating a codebase", meta: { builtin: true, model: "haiku", allowed_tools: ["Read","Grep","Glob","WebFetch"], permission_mode: "default" } },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-plan", title: "builtin: Plan", subtitle: "Implementation Planning Agent", desc: "Built-in subagent that returns a design and action plan before implementation begins", meta: { builtin: true, model: "sonnet", allowed_tools: ["Read","Grep","Glob","WebFetch"], permission_mode: "plan" } },
  { cat: "C. Subagent", tier: 2, type: "subagent", id: "sa-bi-general", title: "builtin: general-purpose", subtitle: "General-Purpose Agent", desc: "Built-in all-purpose subagent that can handle investigation, execution, and fixes together", meta: { builtin: true, model: "sonnet", allowed_tools: ["*"], permission_mode: "default" } },

  // D. MCP
  // D. MCP — 10 main cards (one per server)
  // Switching meta.action (tool/resource/prompt) in the detail panel reveals the relevant additional fields.
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-def", title: "Custom MCP Server (Generic)", subtitle: "Defined in .mcp.json", desc: "Generic card representing a custom or unofficial MCP server",
    meta: { server: "my-server", auth: "api_key", action: "tool", tool_name: "do_something", params: '{ "key": "value" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Which of the server's tool / resource / prompt to call",
        target:  "Server name (.mcp.json mcpServers key) and the target (tool name / resource URI / prompt name)",
        content: "Arguments specific to each server (JSON format)",
        summary: "A single call to a custom or third-party MCP server. Pass server-specific arguments and forward the result to the next step.",
      },
      capabilities: [
        { name: "(tools)",     desc: "Functions provided by the server for the LLM to invoke and execute actions", friendly: "Functions the server exposes for the LLM to call. Have side effects (create, send, update data, etc.). Each server publishes them under its own function names such as `send_message` or `query`." },
        { name: "(resources)", desc: "Read-only data exposed by the server (URI reference)",                       friendly: "Data the server exposes for the LLM to read. Identified by URI (e.g. `file:///path/x`, `notion://page/abc`). Read-only, no side effects. Convenient for passing as context to the LLM." },
        { name: "(prompts)",   desc: "Pre-defined prompt templates defined by the server",                         friendly: "Fixed prompt templates provided by the server. Fill in arguments to produce a complete prompt to send to the LLM. Templates like 'meeting-minutes summary instructions' can be maintained and shared on the server side." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-fs", title: "Filesystem", subtitle: "File Read/Write", desc: "Safely operate on files in designated folders",
    meta: { server: "filesystem", auth: "none", action: "tool", tool_name: "read_file", params: '{ "path": "~/Documents/notes.md" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: read_file / write_file / list_directory / search_files / move_file",
        target:  "Absolute path of the target file or folder (within folders permitted by the server config)",
        content: "Write content, search pattern, destination path, etc.",
        summary: "File operations outside the project (Downloads, Desktop, etc.). Use this when the built-in Read/Write tools are too cwd-centric.",
      },
      capabilities: [
        { name: "read_file",      desc: "Read file contents",                    friendly: "Reads a file (.md, .txt, .json, etc.) by absolute path and returns its contents. Similar to Claude Code's built-in Read tool, but Filesystem MCP is restricted to pre-approved folders, so it can safely reach files outside the working directory such as Downloads or Desktop." },
        { name: "write_file",     desc: "Write to a file (overwrite or create)", friendly: "Writes a file at the specified path. Overwrites existing files entirely; creates a new file if the path does not exist. Useful for specifying output like 'save the organized result as ~/Documents/report.md'." },
        { name: "list_directory", desc: "List files in a folder",               friendly: "Returns the files and subfolders directly inside a specified folder, including name, size, and modification date. Good starting point for aggregations like 'the three largest files in Downloads'." },
        { name: "search_files",   desc: "Search by file name or content",       friendly: "Searches for filename patterns or content keywords recursively under a specified folder, including subfolders. Use for queries like 'find Markdown files that contain the word minutes'." },
        { name: "move_file",      desc: "Move or rename a file",                friendly: "Moves or renames a file to another location. Useful for automatic organization like 'sort PDFs downloaded to Downloads into Documents/Receipts'." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-gh", title: "GitHub", subtitle: "PRs, Issues & Code", desc: "Operate on GitHub PRs / Issues / code",
    meta: { server: "github", auth: "oauth", action: "tool", tool_name: "create_issue", params: '{ "owner": "anthropic", "repo": "claude-code", "title": "Bug report", "body": "..." }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: create_issue / create_pull_request / add_comment / search_code / get_file_contents / list_repos",
        target:  "owner (org/username) and repo (repository name), plus issue/PR number if needed",
        content: "title / body / comment text / search query, etc.",
        summary: "A single operation on a GitHub Issue/PR/codebase. Primarily used to post text generated in a previous step (error reports, review comments, etc.) to GitHub.",
      },
      capabilities: [
        { name: "create_issue",        desc: "Create an Issue",                    friendly: "Creates a new Issue in a repository. You can specify title, body (Markdown), labels, assignees, and milestone. Use for automation like 'auto-create a bug report from test failure logs' or 'create a maintenance Issue monthly'." },
        { name: "create_pull_request", desc: "Create a PR",                        friendly: "Creates a Pull Request between branches. Specify title, body (Markdown), base branch, and head branch. Use this to turn a branch that Claude auto-implemented directly into a PR." },
        { name: "add_comment",         desc: "Add a comment to an Issue or PR",    friendly: "Adds a comment to an existing Issue or PR. Supports both code review comments (tied to specific lines) and general comments. Use for review automation like 'summarize PR analysis and post as a comment'." },
        { name: "search_code",         desc: "Search code in a repo",              friendly: "Searches code via the GitHub search API. Use queries like `language:python TODO` to search within a repo, across an org, or across all public repos. Makes 'where was that implementation?' answerable." },
        { name: "get_file_contents",   desc: "Get file contents",                  friendly: "Retrieves the body of a file in a repository. Specify the path and branch/commit SHA. Use for tasks like 'load the README from main and summarize it' or 'compare code at a specific commit vs. now'." },
        { name: "list_repos",          desc: "List repositories",                  friendly: "Returns a list of repositories owned by an organization or user. Use for overviews like 'top 10 recently updated repos in the company org' or 'list all repos I've created'." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-gd", title: "Google Drive", subtitle: "Document Search & Update", desc: "Operate on Google Drive documents",
    meta: { server: "gdrive", auth: "oauth", action: "tool", tool_name: "search_files", params: '{ "query": "meeting minutes 2026", "page_size": 10 }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: search_files / read_file_content / create_file / update_file",
        target:  "File ID or search query. Folder ID can also be specified.",
        content: "Body, title, MIME type of new/updated files, etc.",
        summary: "Search, read, create, and update documents on Google Drive. Use cases include 'new file from a meeting minutes template' or 'fetch last week's proposal and understand the content'.",
      },
      capabilities: [
        { name: "search_files",      desc: "Search files in Drive",          friendly: "Searches Google Drive by name, content, MIME type, and other criteria. Retrieve a candidate list with natural filters like 'meeting minutes 2026' or 'Spreadsheets last updated this month'." },
        { name: "read_file_content", desc: "Read document body",             friendly: "Fetches the content by file ID. Google Docs returns plain text, Google Sheets returns CSV, and Markdown/text files are returned as-is. Use for fetching source data for summarization or analysis." },
        { name: "create_file",       desc: "Create a new file",              friendly: "Creates a new file on Drive. Specify folder, title, body, and MIME type. Use for automated output like 'create a new file from the meeting minutes template' or 'save analysis results as a Spreadsheet'." },
        { name: "update_file",       desc: "Update an existing file",        friendly: "Updates an existing file's content. Supports full overwrite, append, and metadata changes (title, sharing settings). Use for continuous updates like 'append decisions to the meeting minutes'." },
      ] } },
  { cat: "D. MCP", tier: 1, type: "mcp", id: "mcp-sl", title: "Slack", subtitle: "Send & Receive Messages", desc: "Send, receive, and search Slack messages",
    meta: { server: "slack", auth: "oauth", action: "tool", tool_name: "send_message", capability: "slack.send_message",
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: send_message / search_messages / list_channels / get_thread / add_reaction",
        target:  "Target (channel name '#general' / user ID / message timestamp, etc.)",
        content: "Data to pass (send text, search query, emoji name, etc.)",
        summary: "Use information received from a previous step to post or search Slack, then pass the result (post ID, message list, etc.) to the next step.",
      },
      capabilities: [
        { name: "send_message",    desc: "Send a message to a channel or DM", friendly: "Posts a new message to a specified channel (e.g. #general) or DM. You can include emoji, a thread reply target (thread_ts), mentions (@user), and attachments. Use for deploy notifications, error alerts, daily report posts, etc." },
        { name: "search_messages", desc: "Search past messages",              friendly: "Searches the entire workspace for messages matching a keyword. Supports Slack search syntax (from:@user / in:#channel / before:YYYY-MM-DD). Use when you want to aggregate things like 'requests from Tanaka last week' or 'ERROR mentions in #bug'." },
        { name: "list_channels",   desc: "List channels",                     friendly: "Returns a list of channel names, member counts, and topics in the workspace. Use to find a posting destination, guide new members, or automatically select the appropriate channel." },
        { name: "get_thread",      desc: "List thread replies",               friendly: "Fetches all replies in a thread by specifying the parent message timestamp. Use when you want to summarize a discussion or catch up on unread replies at once." },
        { name: "add_reaction",    desc: "Add a reaction to a message",       friendly: "Adds an emoji reaction (✅ 👀 🚀, etc.) to an existing message. Use to show status at a glance ('handling', 'confirmed') or as a progress marker in automated workflows." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-db", title: "Database (Postgres / SQLite)", subtitle: "SQL Execution", desc: "Run SQL against a database",
    meta: { server: "postgres", auth: "api_key", action: "tool", tool_name: "query", params: '{ "sql": "SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL \'30 days\'" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: query (run SQL) / schema (get table definition) / list_tables",
        target:  "DB connection (already specified via .mcp.json env). Write table names directly in the query.",
        content: "SQL statement to run (SELECT/INSERT/UPDATE/DELETE). Claude converts natural language to SQL.",
        summary: "Claude converts a natural-language question (e.g. 'How many new users last month?') to SQL → queries the DB → aggregates and summarizes the result.",
      },
      capabilities: [
        { name: "query",       desc: "Run any SQL and get results",   friendly: "Can run any SQL — SELECT / INSERT / UPDATE / DELETE. Claude converts natural-language questions to SQL and calls this query. When using on a production DB, connect with a read-only user or deny UPDATE/DELETE via permissions for safety." },
        { name: "schema",      desc: "Get a table's schema definition", friendly: "Returns column names, types, constraints, and indexes of a specified table. The typical pattern is: call schema first to understand structure → then write the correct query." },
        { name: "list_tables", desc: "List tables in the DB",          friendly: "Returns a list of table names in the currently connected DB. Use as a starting point to understand 'what data is in this DB?'." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-gm", title: "Gmail", subtitle: "Email Search & Send", desc: "Search and send Gmail messages",
    meta: { server: "gmail", auth: "oauth", action: "tool", tool_name: "search_messages", params: '{ "query": "is:unread label:important", "max_results": 20 }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: search_messages / read_message / send_message / create_draft / add_label",
        target:  "Target message ID or Gmail search query (is:unread, label:work, etc.)",
        content: "Recipient/subject/body for outgoing email, label name to apply, draft content, etc.",
        summary: "Automate email workflows: 'summarize only the important unread messages', 'draft a standard reply', 'auto-sort by specific label', etc. Sending via create_draft is recommended to prevent accidental sends.",
      },
      capabilities: [
        { name: "search_messages", desc: "Search emails (Gmail query syntax)", friendly: "Searches messages using Gmail search syntax like `is:unread`, `label:important`, `from:tanaka@`, `before:2026-05-01`. Supports filters like 'important unread emails only' or 'last 10 from a specific person'. Results are a list of message IDs + previews." },
        { name: "read_message",    desc: "Get individual email body",          friendly: "Fetches subject, body, sender, and attachment info by message ID. The standard pattern is a two-step: search → read individual." },
        { name: "send_message",    desc: "Send an email",                      friendly: "Sends an email with the specified recipient, subject, and body. Sends immediately without confirmation, so either deny via permissions or route through create_draft for safety." },
        { name: "create_draft",    desc: "Create a draft",                     friendly: "Saves to the drafts folder without sending. Use this when you want Claude to 'prepare 10 reply drafts that I review before sending'." },
        { name: "add_label",       desc: "Apply a label",                      friendly: "Applies a label (e.g. `Work`, `Follow-up`) to a specified message. Use for auto-sorting or building follow-up action lists." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-gc", title: "Google Calendar", subtitle: "Schedule Management", desc: "Operate on Google Calendar events",
    meta: { server: "gcalendar", auth: "oauth", action: "tool", tool_name: "suggest_time", params: '{ "attendees": ["you@example.com","colleague@example.com"], "duration": 30, "within_days": 7 }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: list_events / create_event / update_event / delete_event / suggest_time",
        target:  "Calendar ID (default: primary) + event ID or time range",
        content: "Event title / start time / end time / attendee list / location, etc.",
        summary: "Check, adjust, and schedule events. Tasks like 'schedule a meeting with Tanaka during free time next week' or 'summarize today's schedule'.",
      },
      capabilities: [
        { name: "list_events",  desc: "List events",                          friendly: "Returns a list of events in a specified period (e.g. this week / today / next Monday). Returns title, time, location, and attendees — a good starting point for 'summarize today's schedule' or 'list only important events'." },
        { name: "create_event", desc: "Create a new event",                  friendly: "Creates a new event. You can specify title, start/end time, attendees, location, and recurrence. Created immediately without confirmation — control via permissions just like send_message." },
        { name: "update_event", desc: "Update an existing event",            friendly: "Changes the time, title, or attendees of an event. Use for rescheduling like 'move Friday 2pm meeting to 3pm'." },
        { name: "delete_event", desc: "Delete an event",                     friendly: "Cancels and deletes an event. Attendees are also notified, so it's best practice to deny via permissions by default." },
        { name: "suggest_time", desc: "Suggest free times for all attendees", friendly: "Compares schedules of multiple people and suggests time slots when everyone is free. Most convenient for scheduling tasks like 'find a 30-minute slot next week for 3 people'. Read-only, so it's safe." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-nt", title: "Notion", subtitle: "Page & DB Operations", desc: "Operate on Notion pages and databases",
    meta: { server: "notion", auth: "oauth", action: "resource", resource_uri: "notion://page/abc123def456",
      io: { in: "server + resource_uri", out: "resource content (text/JSON/binary)" },
      flowGuide: {
        what:    "search / create_page / update_page / query_database / create_database_entry (tool) or reference notion://page/{id} as a resource",
        target:  "Page ID / Database ID / search query. Extract the ID from the Notion URL.",
        content: "Page title / body (Markdown converted to Notion blocks) / property values / filter conditions",
        summary: "Operate on Notion documents and databases. Use cases: 'new page from a meeting minutes template', 'append this week's progress to a specific DB', 'reference a page → summarize', etc.",
      },
      capabilities: [
        { name: "search",                desc: "Search the entire workspace (tool)",        friendly: "Cross-searches pages, databases, and comments in the workspace. Use for queries like 'all meeting minutes from last month' or 'pages containing the keyword QBR'." },
        { name: "create_page",           desc: "Create a new page (tool)",                  friendly: "Creates a new page. Specify parent page or parent DB + title + body (Markdown equivalent) + property values. Use for automated creation like 'new page from a meeting minutes template'." },
        { name: "update_page",           desc: "Update an existing page (tool)",            friendly: "Updates page properties (status, assignee, due date, etc.) or body. Use for continuous updates like 'set task status to Done' or 'append decisions to the meeting minutes'." },
        { name: "query_database",        desc: "Filter and sort a database (tool)",         friendly: "SQL-like filter, sort, and pagination on a Notion DB. Use for retrieval like 'tasks due this week assigned to me' or 'active projects sorted by priority'." },
        { name: "create_database_entry", desc: "Add a new entry to a DB (tool)",           friendly: "Adds a new row to a Notion DB (task tracker, reading log, etc.). Specify property values (title, tags, date, etc.)." },
        { name: "notion://page/{id}",    desc: "Read-only page reference (resource)",      friendly: "Fetches a page body in read-only mode by specifying the page ID as a URI. Unlike create_page/update_page tools, this is a pure reference with no side effects. Use as source data for summarization or analysis." },
      ] } },
  { cat: "D. MCP", tier: 2, type: "mcp", id: "mcp-ln", title: "Linear / Jira / Asana", subtitle: "Ticket Management", desc: "Operate on project management tickets",
    meta: { server: "linear", auth: "api_key", action: "tool", tool_name: "update_issue", params: '{ "id": "ENG-123", "state": "Done", "comment": "Released in PR #45" }',
      io: { in: "server + tool_name + params", out: "tool execution result (JSON)" },
      flowGuide: {
        what:    "Choose one of: create_issue / update_issue / list_issues / add_comment / assign",
        target:  "Ticket ID (e.g. ENG-123) or Project ID + filter conditions",
        content: "Title / body / state (Todo/In Progress/Done etc.) / assignee / priority",
        summary: "Auto-update tickets linked to GitHub PRs/commits, regular reports, auto-assign, etc. Use for automation like 'mark ticket Done on PR merge' or 'notify Slack daily of incomplete tickets'.",
      },
      capabilities: [
        { name: "create_issue", desc: "Create a ticket",                     friendly: "Creates a new ticket. Specify title, body (Markdown), state, assignee, priority, and labels. Use for automation like 'auto-file a bug ticket on test failure' or 'bulk-create Todo items at regular reviews'." },
        { name: "update_issue", desc: "Change state, assignee, or priority", friendly: "Updates properties of an existing ticket. Use for linked workflows like 'auto-Done on PR merge' or 'raise priority when a blocker is found'." },
        { name: "list_issues",  desc: "List tickets (with filters)",         friendly: "Fetches tickets in a project filtered by conditions. Use for overviews like 'incomplete tickets assigned to me' or 'all overdue tickets'." },
        { name: "add_comment",  desc: "Add a comment to a ticket",           friendly: "Adds a progress comment to an existing ticket. Use for automated logging like 'auto-post code review result' or 'post daily status update'." },
        { name: "assign",       desc: "Assign a ticket",                     friendly: "Changes the assignee of a ticket. Use for adjustments like 'auto-assign based on label' or 'reassign from an overloaded person to another team member'." },
      ] } },

  // D. MCP (Dev) — developer sub-elements. For those who understand MCP spec details. Tier 3 + ⚙ mark.
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-call", title: "⚙ MCP Tool Call", subtitle: "MCP spec: tool invocation", desc: "Action that calls tools — one of the three MCP protocol elements. Equivalent to action=tool on server cards.",
    meta: { action: "tool" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-res", title: "⚙ MCP Resource Fetch", subtitle: "MCP spec: resource access", desc: "Action that references resources — one of the three MCP protocol elements. Read-only, no side effects.",
    meta: { action: "resource" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-prm", title: "⚙ MCP Prompt Template", subtitle: "MCP spec: prompt usage", desc: "Action that uses prompts — one of the three MCP protocol elements. Calls a pre-defined prompt template.",
    meta: { action: "prompt" } },
  { cat: "D. MCP (Dev)", tier: 3, type: "mcp", id: "mcp-oauth", title: "⚙ MCP OAuth Auth", subtitle: "Dynamic Auth Flow", desc: "OAuth authentication flow to an MCP server (Dynamic Client Registration). User logs in via browser to obtain a token.",
    meta: { auth: "oauth" } },

  // E. Skills
  // E. Skills — entity cards only. Frontmatter (name/description/allowed-tools/scripts etc.)
  //   is consolidated into the "Settings Fields" section of the detail panel. meta contains sample values.
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-file", title: "Skill (Generic)", subtitle: ".claude/skills/<name>/SKILL.md", desc: "Custom skill. In real flows, name / description / allowed-tools / reference files / scripts change per skill (values here are samples).",
    meta: {
      // ── Invocation request (what this node requests in the flow) ──
      request_prompt: "For today's new feature release, create 3 draft posts matching the tone of past posts and prepare to publish",
      target_files: ["~/.post-history.json"],
      output_schema: "3 draft options + rationale for each variation (Markdown)",
      arguments_value: "new feature release",
      expected_io: "Receives topic 'new feature release' → 3 drafts matching past post style + user confirmation → post via X API",
      // ── Skill definition (core capability) ──
      file: ".claude/skills/example-flow/SKILL.md",
      name: "example-flow",
      description: "Activated by 'post to X' or 'make it a tweet'. Generates, confirms, and posts the content.",
      "allowed-tools": ["Read","WebFetch","Bash(curl *)"],
      model: "sonnet",
      effort: "medium",
      reference_files: ["style-guide.md","templates/post.md"],
      scripts: ["scripts/post.py","scripts/analyze-history.py"],
      "argument-hint": "[topic]",
      "disable-model-invocation": "false",
      "user-invocable": "true",
      context: "normal",
      io: { in: "user instruction (keyword matching description) + context", out: "published result + copy of the posted text" },
      // Internal flow — what this skill actually does inside SKILL.md
      subflow: [
        { title: "Load past posts",             tool: "Bash",     detail: "Run scripts/analyze-history.py to parse ~/.post-history.json and extract recent tone and topic trends" },
        { title: "Reference style guide",       tool: "Read",     detail: "Read style-guide.md / templates/post.md from reference_files to understand writing style rules" },
        { title: "Generate 3 draft options",    tool: "(model)",  detail: "Create 3 varied drafts reflecting the $ARGUMENTS topic and style constraints" },
        { title: "Present 3 options to user",   tool: "user",     detail: "Interactively confirm which option to use and whether any minor edits are needed" },
        { title: "Post via X API",              tool: "Bash",     detail: "Run scripts/post.py (internally calls X API via curl). Pre-approved via Bash(curl *) in allowed-tools." },
        { title: "Append to history",           tool: "Bash",     detail: "After successful post, append a new entry to ~/.post-history.json" },
      ]
    }
  },
  // Official skills (distributed via anthropic-skills plugin) — placed in flows to explicitly mark where an artifact is generated/read
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-docx", title: "docx", subtitle: "Word Document Generate, Edit & Read",
    desc: "Create, read, and edit Word documents (.docx). Supports formatted official documents, templates, and letterheads. Use in flows that output meeting minutes, contracts, or reports as Word files.",
    meta: {
      // ── Invocation request ──
      request_prompt: "Merge the attached meeting notes (meeting-notes.md) into our letterhead Word meeting minutes template (templates/minutes-template.docx) and save as output/2026-05-21-minutes.docx",
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
      io: { in: "reference to .docx file or creation instructions + content data", out: "generated / edited .docx file" }
    }
  },
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-pptx", title: "pptx", subtitle: "PowerPoint Generate & Edit",
    desc: "Generate and edit PowerPoint (.pptx) files. Supports template application, chart insertion, and slide master control. Use in flows that auto-generate sales decks, weekly reports, or pitch decks.",
    meta: {
      // ── Invocation request ──
      request_prompt: "Load data/weekly-kpi.json, apply our company template (templates/business.pptx), and create a weekly report in 10 slides or fewer. Structure: cover / summary / 3 KPI slides / issues / next week's actions / Q&A.",
      target_files: ["data/weekly-kpi.json","templates/business.pptx"],
      output_schema: "output/2026-W21-weekly-report.pptx (10-slide structure, business template applied)",
      arguments_value: "",
      expected_io: "JSON data + template → sales-ready weekly report .pptx (10 slides)",
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
    desc: "Read/write Excel/CSV/TSV, data cleaning, formula application, and chart insertion. Use in flows that output aggregated results as Excel, or clean and import messy CSV files.",
    meta: {
      // ── Invocation request ──
      request_prompt: "Load data/sales-raw-2026-05.csv, (1) remove empty rows and duplicates, (2) normalize the date column to YYYY-MM-DD, (3) aggregate monthly sales by product category using SUMIFS, (4) output the result with a bar chart to output/sales-2026-05-summary.xlsx",
      target_files: ["data/sales-raw-2026-05.csv"],
      output_schema: "output/sales-2026-05-summary.xlsx (2 sheets: raw_cleaned / summary_with_chart)",
      arguments_value: "",
      expected_io: "messy CSV → cleaned + aggregated + .xlsx with chart",
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
  { cat: "E. Skills", tier: 1, type: "skill", id: "sk-pub-pdf", title: "pdf", subtitle: "PDF Read, Generate & Operate",
    desc: "Read, merge, split, OCR, and fill PDF forms. Use in flows that extract clauses from contracts, merge multiple PDFs, or convert scanned PDFs to text.",
    meta: {
      // ── Invocation request ──
      request_prompt: "Read invoices/2026-Q2-001.pdf, extract the total amount, currency, due date, and vendor name, and return in the JSON schema below.\n\n{\n  \"amount\":   number,\n  \"currency\": \"JPY\"|\"USD\"|\"EUR\",\n  \"due_date\": \"YYYY-MM-DD\",\n  \"vendor\":   string\n}",
      target_files: ["invoices/2026-Q2-001.pdf"],
      output_schema: "{\n  \"amount\":   number,\n  \"currency\": \"JPY\"|\"USD\"|\"EUR\",\n  \"due_date\": \"YYYY-MM-DD\",\n  \"vendor\":   string\n}",
      arguments_value: "",
      expected_io: "Invoice PDF → { amount: 380000, currency: \"JPY\", due_date: \"2026-06-30\", vendor: \"Acme Corp\" }",
      // ── Skill definition ──
      builtin: true,
      name: "pdf",
      description: "Full PDF file operations: read (text/table extraction), merge, split, rotate, watermark, form fill, and OCR.",
      "allowed-tools": ["Read","Write","Bash"],
      reference_files: ["reference.md"],
      scripts: ["scripts/extract_text.py","scripts/merge_pdfs.py","scripts/ocr.py","scripts/fill_form.py"],
      "disable-model-invocation": "false",
      "user-invocable": "true",
      io: { in: ".pdf file reference + operation instructions", out: "extracted text / generated / edited .pdf file" }
    }
  },

  // F. Commands
  // F. Commands — consolidated into one generic custom slash command card.
  //   $ARGUMENTS / frontmatter (description, model, tools) etc. are integrated into the detail panel fields.
  //   Built-in commands (/init, /clear, etc.) are not made into cards (not used in flows/automation).
  //   meta contains representative sample values. Values change per node in real flows.
  //   subflow is intended for future '+' expansion on the canvas side (not shown in the detail panel).
  { cat: "F. Commands", tier: 1, type: "command", id: "cm-file", title: "Custom Command (Generic)", subtitle: ".claude/commands/*.md", desc: "Custom routine callable via /command-name. Executed via the SlashCommand tool within a flow.",
    meta: {
      file: ".claude/commands/*.md",
      name: "deploy",
      description: "Pre-deploy check & execute",
      model: "sonnet",
      allowed_tools: ["Bash","Read","WebFetch"],
      argument_hint: "<env: prod | staging | dev>",
      prompt: "Deploy to the $ARGUMENTS environment.\n\n1. Check for uncommitted changes with git status\n2. If none, run npm test\n3. If tests pass, run ./scripts/deploy.sh $ARGUMENTS\n4. Notify the #deploy Slack channel with the result",
      input:  "$ARGUMENTS (e.g. 'prod')\n+ env vars and context passed from previous steps",
      output: "Deploy result (success/failure) + log URL + elapsed time",
      io: { in: "$ARGUMENTS (e.g. 'prod')", out: "deploy result (success/failure + log URL)" },
      flowGuide: {
        what:    "Command name (identifier after the /)",
        target:  "Argument format received via $ARGUMENTS (specified by argument_hint)",
        content: "Prompt body that runs when the command is executed. Write multiple steps in Markdown.",
      },
      // Interim representation: internal processing recorded as subflow (intended for canvas '+' expansion in future)
      subflow: [
        { title: "Check git status",  tool: "Bash",         detail: "Detect uncommitted changes" },
        { title: "Run tests",         tool: "Bash",         detail: "Run npm test" },
        { title: "Execute deploy",    tool: "Bash",         detail: "./scripts/deploy.sh $ARGUMENTS" },
        { title: "Slack notification", tool: "mcp",         detail: "Post result to #deploy (via Slack MCP)" },
      ],
    } },

  // G. Plugin — removed. A plugin is a "distribution package", not a flow execution node.
  // Its contents after installation (commands/agents/skills/hooks/MCP) are represented by cards in their respective categories.

  // H. Settings — removed.
  //   settings.json / CLAUDE.md / AGENTS.md / .claudeignore are not flow nodes —
  //   they are the foundation for flow execution, auto-loaded at session start. No explicit call is made, so not needed in flow diagrams.
  //   To show config change timing in a flow, use Hooks (ConfigChange / InstructionsLoaded).

  // I. API — external API calls. LLM APIs (Claude/OpenAI/Gemini) + various SaaS REST APIs.
  //   Service-specific dynamic fields are switched via TYPE_SPECS.api.fieldsByService.
  //   Secrets (api_key/webhook_url) are masked in the UI with f.secret: true (integrated with .env in production).

  // Tier 1: LLM APIs (commonly used LLMs including Claude)
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-claude", title: "Claude API", subtitle: "Anthropic Messages API", desc: "Anthropic's official Messages API. Supports tool_use loops, prompt caching, and server tools (web_search, etc.)",
    meta: { service: "claude", api_key: "", model: "claude-sonnet-4-5", system: "You are...", messages: '[\n  { "role": "user", "content": "..." }\n]', tools: "", server_tools: [], temperature: 0.7, max_tokens: 4096, cache: "none",
      io: { in: "model + system + messages + tools (+ cache)", out: "assistant message or tool_use block" } } },
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-openai", title: "OpenAI API", subtitle: "GPT-4 / o1 series", desc: "OpenAI Chat Completions API. Supports Function Calling, JSON mode, and o1 reasoning models.",
    meta: { service: "openai", api_key: "", model: "gpt-4o", system: "You are...", messages: '[\n  { "role": "user", "content": "..." }\n]', tools: "", temperature: 0.7, max_tokens: 4096,
      io: { in: "model + messages + tools", out: "choices[0].message or tool_calls" } } },
  { cat: "I. LLM API", tier: 1, type: "api", id: "a-gemini", title: "Gemini API", subtitle: "Google AI Studio", desc: "Call Google's Gemini models via the generative API. Supports long context and multimodal input.",
    meta: { service: "gemini", api_key: "", model: "gemini-2.0-flash", system: "...", contents: '[\n  { "role": "user", "parts": [{ "text": "..." }] }\n]', tools: "", temperature: 0.7,
      io: { in: "model + contents + tools", out: "candidates[0].content or functionCall" } } },

  // Tier 2: External SaaS APIs (not covered by MCP)
  { cat: "I. External API", tier: 2, type: "api", id: "a-line", title: "LINE Messaging API", subtitle: "LINE Official Account", desc: "Send messages to users from a LINE official account. push / multicast / broadcast / reply",
    meta: { service: "line", channel_access_token: "", endpoint: "push (individual send)", to: "USER_ID", messages: '[\n  { "type": "text", "text": "Notification body" }\n]',
      io: { in: "endpoint + to + messages", out: "send result (sentMessages[] etc)" } } },
  { cat: "I. External API", tier: 2, type: "api", id: "a-stripe", title: "Stripe API", subtitle: "Payments & Subscriptions", desc: "Payment processing, customer management, and subscription management. Switch between test and live keys.",
    meta: { service: "stripe", secret_key: "", endpoint: "charges (payment)", params: '{\n  "amount": 2000,\n  "currency": "jpy",\n  "source": "tok_visa"\n}',
      io: { in: "endpoint + params", out: "Stripe object (charge/subscription/...)" } } },
  { cat: "I. External API", tier: 2, type: "api", id: "a-discord", title: "Discord Webhook", subtitle: "Channel Post", desc: "Post to a Discord channel via Webhook. Supports text, embeds, and mentions.",
    meta: { service: "discord", webhook_url: "", username: "DeployBot", content: "Deploy complete ✅", embeds: '[{\n  "title": "v1.2.3 released",\n  "color": 5814783\n}]',
      io: { in: "webhook_url + content/embeds", out: "204 No Content (send complete)" } } },

  // Tier 1: Generic REST API (for services not covered above)
  { cat: "I. Generic API", tier: 1, type: "api", id: "a-rest", title: "REST API (Generic)", subtitle: "Any HTTPS Request", desc: "Generic card for calling any REST/HTTP API directly. Use for services not covered by MCP or custom APIs.",
    meta: { service: "rest", method: "POST", url: "https://api.example.com/v1/resource", auth_type: "Bearer Token", auth_value: "", headers: "Content-Type: application/json", body: '{\n  "key": "value"\n}', response_path: ".data.id",
      io: { in: "method + url + headers + body", out: "HTTP response (JSON/text/binary)" } } },

  // J. Agent SDK — category removed entirely.
  //   Reason: SDK installation is a one-time environment setup, not a node
  //         that is called repeatedly within an automation flow.
  //   Same logic as Plugin (distribution/environment setup vs. flow entity).
  //   Managed Agents (Anthropic-hosted REST) may be integrated into I. Server Tools in the future.
  //   ref-agentsdk (design reference) remains in ★ Node Types (the type itself is preserved).

  // L. Composite Flows
  // L. Composite Flows — removed from ELEMENTS.
  //   Flow examples are consolidated in the FLOWS array (displayed in workflow mode inside whiteboard.html).
  //   ELEMENTS = "node parts", FLOWS = "node combination examples". Roles are separated.
  //   FLOWS may be extracted to flow-templates.js in the future (see IMPLEMENTATION_NOTES.md).

  // M. Meta Visualization — category removed entirely.
  //   Reason: Timeline / active path highlight / data flow visualization are not
  //   "nodes" placed in a flow diagram — they are display modes / view features of the Flow Inspector app itself.
  //   Transferred to IMPLEMENTATION_NOTES.md as UI features for the production implementation.

  // N. Placeholder Elements — category removed.
  //   new-schedule → promoted to K. Trigger tr-cron (officially supported by Anthropic Routines / CronCreate)
  //   new-parallel → removed (parallel execution is representable with flow edges "multiple lines from one node"; no dedicated node needed)

  // K. Trigger — flow entry points (what triggers a flow). Placed at the start of a flow diagram.
  //   Config values are dynamically switched via TYPE_SPECS.trigger.fieldsBySource.
  //   Secrets (Webhook URL / Auth Token, etc.) are masked in the UI with f.secret: true (integrated with .env in production).
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-manual", title: "Manual Launch", subtitle: "/command / prompt / UI", desc: "User explicitly launches the flow",
    meta: { source: "manual", trigger_type: "/slash-command", command: "/draft-nda", prompt_hint: "Also launches from natural language like 'draft an NDA with Tanaka'",
      io: { in: "user prompt or /command + arguments", out: "downstream flow + user input data" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-cron", title: "Scheduled Launch", subtitle: "cron / Routines", desc: "Auto-launch the flow on a schedule or at a specified time",
    meta: { source: "cron", schedule: "Every day at 9am", cron_expr: "0 9 * * *", timezone: "Asia/Tokyo", implementation: "Anthropic Routines (claude.ai)",
      io: { in: "(time reached)", out: "downstream flow + launch time" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-webhook", title: "Webhook Receive", subtitle: "External HTTP POST", desc: "Launch from an HTTP request from GitHub / Stripe / your own API",
    meta: { source: "webhook", webhook_url: "", method: "POST", auth: "Signature verification (HMAC)", auth_secret: "", payload_path: ".user.id",
      io: { in: "HTTP request (headers + body)", out: "downstream flow + payload" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-email", title: "Email Receive", subtitle: "Gmail / IMAP", desc: "Launch when an email matching specific conditions arrives",
    meta: { source: "email", email_account: "support@example.com", auth_token: "", filter: "is:unread label:invoices from:billing@", polling_interval: "5 min",
      io: { in: "received email (from / subject / body / attachments)", out: "downstream flow + email content" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-chat", title: "Chat Input", subtitle: "LINE / Slack / Discord bot", desc: "Launch from a message via a chatbot",
    meta: { source: "chat", chat_platform: "LINE", auth_token: "", filter: "All messages (specific keywords can be specified)",
      io: { in: "chat message + sender info", out: "downstream flow + message content" } } },
  { cat: "K. Trigger", tier: 1, type: "trigger", id: "tr-app-event", title: "App Event", subtitle: "Notion / Linear / GitHub, etc.", desc: "Launch when an event occurs within a SaaS (form submit / DB row add / event create, etc. all consolidated here)",
    meta: { source: "app-event", app: "Notion", event_type: "page.created", auth_token: "", filter: "database_id == 'xxx' && status == 'New'", implementation: "MCP polling",
      io: { in: "app event data (JSON)", out: "downstream flow + event data" } } },
];

window.FI = window.FI || {};
window.FI.ELEMENTS = FI_ELEMENTS;
