// Plain-language explanation text for each element ID, intended for non-technical users.
// Loaded by whiteboard.html. Fact-checked and simplified against the official docs
// (https://code.claude.com/docs/en/hooks, /settings).
window.ELEMENT_EXPLAINS = {
  // ── ★ Node Type Catalog (design reference) ──
  // Note: These are not flow components — they are a design catalog showing how each
  // node type is rendered on the whiteboard. Each entry contains one sentence describing
  // the node's purpose plus its visual design spec.
  "ref-parent": "A marker node placed at the start, end, or merge point of a flow to represent the main Claude agent itself. It carries no prompt of its own — it simply marks where Claude acts as the primary agent driving the flow. Use it at entry points, exit points, and parallel merge points where you want to make the responsible agent explicit. Inline reasoning steps (writing, analysis, etc.) should use the purple 'think' nodes instead. Visually rendered as a rounded rectangle with a blue accent bar.",
  "ref-hook": "Represents an automated intercept that fires at a specific moment in Claude's processing — such as when a prompt is submitted or a tool is about to run. Visually rendered as a parallelogram with an orange accent bar.",
  "ref-subagent": "Represents a specialized AI assistant that runs independently alongside the main agent. Multiple subagents can run in parallel, each with its own restricted set of allowed tools. Visually rendered as a hexagon with a purple diamond accent.",
  "ref-think": "Represents a discrete LLM call directed at the main Claude model. No subagent is launched — Claude reasons within the current conversation context to handle writing, summarization, research, review, formatting, and similar tasks. Unlike a parent node, every think node must carry an explicit prompt. Because it is not a subagent call, it shares the current conversation context rather than starting a fresh one. Visually rendered as a rounded rectangle with a purple accent bar (same color as subagent, distinguished by shape).",
  "ref-mcp": "Represents a connection point to an external service such as Slack, GitHub, or a database. Visually rendered as a pill shape (fully rounded ends) with a green circle accent.",
  "ref-code": "Represents a built-in tool that performs basic operations: reading and writing files, running commands, searching. Visually rendered as a near-square rectangle with a terminal-style '$_' accent.",
  "ref-user": "Represents an element that involves a human — requesting input from the user or displaying status information. Visually rendered as an octagon with a sidebar shape.",
  "ref-decision": "Represents a branching point where the flow splits based on a condition — such as a test result or whether a file exists. Functions like a flowchart diamond. Visually rendered as a diamond (rhombus) shape.",
  "ref-skill": "Represents a skill file containing step-by-step instructions for a specific task. Claude automatically loads it when appropriate and follows the procedure to handle specialized work. Visually rendered as a rounded rectangle with a cyan accent bar.",
  "ref-command": "Represents a custom slash command the user can invoke with '/command-name'. Bundles frequently used operations into a single command. Visually rendered as a sharp rectangle with a purple '$_' accent.",
  "ref-config": "Represents a configuration file that defines Claude's behavioral rules — allowed tools, permissions, hooks, and so on. Visually rendered as a rounded rectangle with a gray accent bar.",
  "ref-api": "Represents the parameters passed to the Claude API — model name, temperature, max tokens, and so on. Visually rendered as a pill shape with a teal circle accent.",
  "ref-plugin": "Represents a package that bundles multiple capabilities — commands, skills, hooks, agents — into a single installable unit. Installing it activates the full feature set at once. Visually rendered as a tab shape with a folded top-left corner and an indigo accent.",
  "ref-agentsdk": "Represents the Agent SDK (Python/TypeScript), the developer toolkit for launching and controlling Claude agents programmatically. Used when building automation systems. Visually rendered as a trapezoid (narrower top edge) with a rose/pink accent.",

  // A. Hook Events
  "SessionStart": "Fires automatically the moment a Claude Code conversation session begins. The matcher lets you distinguish how it started: startup (first launch), resume (resuming a previous session), clear (after history was cleared), or compact (after compaction). Use it to run opening greetings or load project context.",
  "SessionEnd": "Fires automatically when a Claude Code conversation session ends. The matcher lets you distinguish the reason — logout, clear, resume, etc. Use it to save work logs or run cleanup tasks.",
  "UserPromptSubmit": "Fires immediately after the user sends a message. You can inject additional context (such as current project state) into the message, or block a dangerous instruction before it reaches Claude. Timeout is 30 seconds — keep handlers fast.",
  "PreToolUse": "The most important hook — fires just before Claude executes a tool. Use the matcher to target specific tools (e.g. Bash or Edit|Write) and control whether execution is allowed, denied, or requires confirmation. Returning exit code 2 blocks the tool call.",
  "PostToolUse": "Fires immediately after a tool executes successfully. Use it to auto-format edited files, log results, or trigger follow-up actions. Use the matcher to restrict which tools trigger the hook.",
  "Stop": "Fires when Claude finishes generating its response. Use it to send a completion notification to Slack, or to force Claude to continue if you determine the response is incomplete.",
  "SubagentStop": "Fires the moment a subagent (child agent) finishes its work. Use it to aggregate results from multiple children or to emit completion reports. The matcher lets you filter by agent type (e.g. Explore or Plan).",
  "InstructionsLoaded": "Fires after instruction files — CLAUDE.md or .claude/rules/*.md — have been fully loaded. Use it to inject project-specific additional context.",
  "PostCompact": "Fires immediately after a long conversation history has been compacted (summarized and compressed). Use it to tidy up the post-summary state or re-inject information that must persist.",
  "PreCompact": "Fires just before conversation history compaction begins. Use it to save important information separately before the summary is generated. The matcher can filter for manual vs. auto compaction.",
  "ConfigChange": "Fires when a configuration file such as settings.json is modified. Use it to notify about config diffs or to run post-reload processing.",
  "PostToolUseFailure": "Fires when a tool execution fails. Use it to log the error, suggest a retry, or offer an alternative approach. The matcher lets you target specific tool names.",
  "PermissionRequest": "Fires the moment a permission dialog is shown to the user. Use it to record approval history or inject automatic allow/deny rules.",
  "SubagentStart": "Fires the moment a subagent is launched. Use it to log the agent's startup or pass initial context. The matcher lets you filter by agent type.",
  "Notification": "Fires when Claude Code emits a system notification. Use the matcher to distinguish notification types — permission_prompt (permission request dialogs), elicitation_dialog (MCP input requests) — and trigger desktop notifications or sounds.",
  "Setup": "Fires when setup-type commands are run, such as `claude --init-only` or `claude -p --init/--maintenance`. Use the matcher to distinguish init from maintenance and run the appropriate project initialization scripts.",
  "WorktreeCreate": "Fires the moment a Git worktree (a separate working directory) is created. Use it to initialize the new workspace — for example, installing dependencies.",
  "WorktreeRemove": "Fires when a Git worktree is deleted. Use it to run cleanup tasks or clear caches.",
  "TeammateIdle": "In multi-agent collaborative setups, fires when another agent becomes available. Use it to assign the next piece of work.",
  "TaskCompleted": "Fires when a task managed internally by Claude (created via TodoWrite or similar) is marked complete. Use it to launch the next task or send a completion notification.",
  "Elicitation": "Fires when an MCP server requests additional input from the user. Use it to automatically answer common inputs or to transform the contents of input forms.",
  "FileChanged": "Fires when a watched file is modified. The matcher uses file names directly (e.g. `.envrc|.env`) — a custom format that restricts the hook to specific files only.",

  // A-2. Hook Handlers (h-*) / A-3. Hook Controls (c-*) — categories removed.
  //   Handler types (command / prompt / agent / http / mcp_tool) are now surfaced as options in
  //   the handler_type field on each Hook event card's detail panel "Settings" tab.
  //   Controls (matcher / timeout / async / exit2 / output / perm / input / ctx) are now
  //   integrated as fields on each individual Hook card.

  // B. Built-in Tools
  "t-Read": "Reads a file's contents and passes them to Claude. Supports offset/limit to read only a specific range, PDF page ranges, images, and Jupyter notebooks.",
  "t-Write": "Creates a new file and writes content to it. If the file already exists it is completely overwritten, so use Edit for partial changes.",
  "t-Edit": "Replaces a specific section of a file. Substitutes the text matching old_string with new_string — ideal for precise, targeted edits.",
  "t-MultiEdit": "Edits multiple locations within a single file in one operation. Faster than calling Edit repeatedly, and all changes are applied atomically — if any edit fails, the entire set is rolled back.",
  "t-NB": "Edits cells in a Jupyter Notebook (.ipynb file). Supports rewriting or adding code cells and markdown cells.",
  "t-Grep": "Searches file contents for a string or pattern. Best for questions like 'where is this function used?' Runs a high-speed search equivalent to ripgrep.",
  "t-Glob": "Finds files by filename pattern (e.g. *.ts). Use it to quickly list the contents of a directory or locate files matching a naming convention.",
  "t-Bash": "Runs commands in a terminal. Supports a timeout for maximum wait time; long-running processes can be launched in the background with run_in_background.",
  "t-BO": "Retrieves the latest output from a Bash command running in the background. Use it to monitor ongoing builds or tail server logs.",
  "t-KB": "Stops a Bash process running in the background. Use it to explicitly terminate work that is no longer needed.",
  "t-WF": "Fetches the content of a URL. Use it to load a web page or article for Claude to read and summarize.",
  "t-WS": "Runs a web search and returns a list of relevant results. Use it to look up current information or explore an unfamiliar topic.",
  "t-TW": "Creates and manages a to-do list. Use it to make multi-step work visible and to track progress as steps are completed.",
  "t-Task": "Invokes a subagent to handle an independent research or work task. Use it when you want parallel work done in a separate context without polluting the main conversation.",
  "t-SC": "Runs a slash command within Claude Code — such as /init or a custom command you have registered.",
  "t-PM": "Enters plan mode (write-restricted mode). While in plan mode, destructive tools such as Edit, Write, and Bash are unavailable, giving Claude time to read the codebase and build a work plan. Use it for alignment before making changes or for a safe read-only exploration phase.",
  "t-EPM": "Exits plan mode and moves into actual execution. Once the user approves the plan, implementation begins from this point.",

  // C. Subagents — Note: fields such as model / allowed_tools / permission_mode / isolation
  //   are shown in the "Settings" section of each subagent node's detail panel,
  //   not as separate cards.
  "sa-def": "A custom subagent you define in .claude/agents/*.md. Create specialized roles — such as 'write a social post' or 'review this code' — that can be launched on demand. The detail panel shows settings like model, allowed tools, and the prompt body.",
  "sa-bi-explore": "A read-only built-in subagent for quickly investigating a project's codebase. It uses Read, Grep, and Glob to answer questions like 'where is this feature implemented?' or 'which files reference Y?'. Because write tools are disabled by design, you can safely delegate research without any risk of modifying code.",
  "sa-bi-plan": "A built-in subagent that designs an implementation plan before any code is written. It reads the codebase, understands the overall structure, and returns a step-by-step work plan, a list of key files, and trade-off analysis. Acts as an architect — useful for scoping and strategy before handing off to the main agent.",
  "sa-bi-general": "A general-purpose built-in subagent capable of handling anything. It can research, execute, and fix across multiple steps. Unlike Explore (read-only) or Plan (planning-only), it thinks and acts — the default choice for work that does not fit a specialized role.",

  // D. MCP — Main 10 cards (one per server; meta.action switches between tool/resource/prompt in flows)
  "mcp-def": "A generic card representing a custom or third-party MCP server. Specify the name, command, args, and env in .mcp.json to define how it starts. In a real flow, the detail panel lets you specify which server to connect to and which operation (tool/resource/prompt) to call.",
  "mcp-fs": "An MCP server that provides access to the local file system. Supports read_file, write_file, list_directory, search_files, and more within specified folders — for example, allowing Claude to touch only Downloads or ~/Documents.",
  "mcp-gh": "An MCP server that integrates with GitHub. Supports create_issue, create_pull_request, search_code, add_comment, and similar operations — for instructions like 'add a review comment to PR #123' or 'find any bug reports in this repo'.",
  "mcp-gd": "An MCP server for Google Drive. Use search_files, read_file_content, create_file, and update_file to search, view, and update documents — for example, 'find last week's meeting notes' or 'update this proposal'.",
  "mcp-sl": "An MCP server for Slack. Supports send_message, search_messages, list_channels, get_thread, and add_reaction — for instructions like 'post to #general' or 'summarize DMs from Alice'.",
  "mcp-db": "An MCP server for databases such as PostgreSQL or SQLite. Translates natural-language questions like 'how many users registered last month?' into SQL via query, schema, and list_tables operations.",
  "mcp-gm": "An MCP server for Gmail. Supports search_messages, read_message, send_message, create_draft, and add_label — for tasks like 'summarize only the important unread emails' or 'draft a reply to this thread'.",
  "mcp-gc": "An MCP server for Google Calendar. Supports list_events, create_event, update_event, and suggest_time — for scheduling tasks like 'find a free slot next week and book a meeting with Alice'.",
  "mcp-nt": "An MCP server for Notion. Supports search, create_page, update_page, and query_database — for operations like 'create a new page from the meeting-notes template' or 'add today's progress to this DB'.",
  "mcp-ln": "An MCP server for project management tools such as Linear, Jira, or Asana. Supports create_issue, update_issue, list_issues, add_comment, and assign — for operations like 'mark Linear ticket #123 as Done'.",

  // D. MCP (Dev) — Developer sub-elements: the three MCP protocol primitives shown as standalone concepts.
  "mcp-call": "A reference card representing the tools primitive — one of the three MCP protocol primitives. In a real flow this is equivalent to selecting 'operation type: tool' on an individual server card (Slack, Notion, etc.). Provided as a conceptual reference for understanding the MCP spec.",
  "mcp-res": "A reference card representing the resources primitive — read-only reference data — in the MCP protocol. Resources are addressed by URI (e.g. `notion://page/abc`) and fetched without side effects.",
  "mcp-prm": "A reference card representing the prompts primitive — predefined prompt templates — in the MCP protocol. Arguments are filled into a server-side template and the result is passed to Claude.",
  "mcp-oauth": "Represents the OAuth authentication flow (Dynamic Client Registration) for an MCP server. The user logs in via a browser, grants access, and the server receives a token for subsequent calls. In a real flow this is absorbed into an individual server card as 'auth method: oauth'.",

  // E. Skills — Note: frontmatter fields (name / description / allowed-tools / reference_files / scripts, etc.)
  //   are shown in the "Configuration Fields" section of each skill node's detail panel,
  //   not as separate cards.
  "sk-file": "A custom skill you define in .claude/skills/<name>/SKILL.md. The frontmatter specifies when it activates (description) and which tools it may use (allowed-tools); the body contains the procedure. Claude auto-activates it based on the description, reads any reference_files if needed, and runs attached scripts to carry out specialized work as a cohesive procedure.",
  "sk-pub-docx": "An official Anthropic-distributed docx skill. Specializes in generating, editing, and reading Word (.docx) documents — including formatted documents, templates, and letterheads. Use it in flow steps like 'output meeting notes as a Word file', 'fill in a contract template', or 'parse an existing Word document'.",
  "sk-pub-pptx": "An official Anthropic-distributed pptx skill. Specializes in generating and editing PowerPoint (.pptx) slide decks — including template application and inserting charts, tables, images, and slide master controls. Use it in flow steps like 'auto-generate sales materials', 'turn a weekly report into slides', or 'build a pitch deck'.",
  "sk-pub-xlsx": "An official Anthropic-distributed xlsx skill. Supports reading and writing Excel (.xlsx/.xlsm), CSV, and TSV files, along with data cleaning, formula application, and chart insertion. Use it in flow steps like 'output aggregated results as an Excel file', 'clean and import a messy CSV', or 'produce a tabular analysis report'.",
  "sk-pub-pdf": "An official Anthropic-distributed pdf skill. Supports reading PDFs (text/table extraction), merging, splitting, rotating, adding watermarks, filling forms, and OCR. Use it in flow steps like 'extract clauses from a contract', 'merge multiple PDFs', or 'convert a scanned PDF to text'.",

  // F. Commands
  // Note: $ARGUMENTS and frontmatter fields (description / model / allowed_tools) are shown
  //   in the "Settings" tab of each command node's detail panel, not as separate cards.
  //   Built-in commands (/init, /clear, etc.) are for manual use only and are not represented as flow cards.
  "cm-file": "A custom command the user or Claude can invoke with '/command-name'. Simply drop a file at .claude/commands/<name>.md to register it. Bundles a frequently used sequence of steps — such as a pre-deploy check, code review, or scheduled backup — into a single command. The frontmatter specifies the model, allowed tools, and argument hints; the body contains the processing prompt. Inside a flow it is executed via the SlashCommand tool, with user arguments passed as $ARGUMENTS.",

  // G. Plugin — category removed. Plugins are a distribution unit, not a flow node.
  // Their installed contents (commands/agents/skills/hooks/MCP) are represented by existing categories.

  // H. Settings — category removed. settings.json / CLAUDE.md / AGENTS.md / .claudeignore are
  // foundations loaded automatically at session start, not flow nodes — they are never explicitly
  // invoked. Configuration change events are represented by Hook nodes (ConfigChange / InstructionsLoaded).

  // I. API — External API calls (LLM APIs + SaaS APIs + generic REST)
  // Note: per-service dynamic fields are controlled by TYPE_SPECS.api.fieldsByService.
  //   Secrets (api_key, webhook_url, etc.) use f.secret: true to mask them in the UI (.env in production).

  // I-1. LLM APIs
  "a-claude": "A node that calls Anthropic's Claude API (Messages API) directly. Supports tool_use loops, prompt caching, and Anthropic-side server tools (web_search, web_fetch, code_execution). Use it when you want to call Claude from your own app or backend without going through Claude Code.",
  "a-openai": "A node that calls OpenAI's Chat Completions API directly. Supports GPT-4o, o1, and other models, including Function Calling and JSON mode. Use it when you want to use GPT instead of Claude, compare models, or run heavy reasoning with o1.",
  "a-gemini": "A node that calls Google's Gemini API (generateContent) directly. Supports Gemini 2.0 Flash and Pro, long-context inputs, and multimodal inputs (images, video). Authentication uses an API key issued through Google AI Studio.",

  // I-2. External SaaS APIs (when no MCP server exists, or when a direct call is preferred)
  "a-line": "A node that calls the LINE Messaging API directly. Supports push (to an individual user), multicast (to a group), broadcast (to all users), and reply (responding to a webhook). Requires a channel access token issued through LINE Developers.",
  "a-stripe": "A node that calls the Stripe API directly. Supports charges, customers, subscriptions, PaymentIntents, and invoices. Test and production keys are separate — make sure to use the right one per environment.",
  "a-discord": "A node that posts to a Discord channel via a Webhook URL. Supports text, emoji, and rich embeds (with title, color, and fields). The Webhook URL is created in Discord's channel settings.",

  // I-3. Generic REST API
  "a-rest": "A generic card for calling any HTTPS API directly — for services not covered by an MCP server or a dedicated card (Claude, OpenAI, LINE, etc.). Specify the method (GET/POST/PUT/PATCH/DELETE), URL, auth method (Bearer/Basic/API Key Header), headers, and body. Extract the parts you need from the response using jq-style paths.",

  // J. Agent SDK — category fully removed.
  //   The Claude Agent SDK (Python/TS) is the flow execution environment, not a flow component.
  //   Installing the SDK is a one-time environment setup step, not a node called on each automation run.
  //   Managed Agents are under consideration for future integration into I. Server Tools.
  //   ref-agentsdk (design reference) is retained in the ★ Node Type Catalog above.

  // L. Combination Flows — removed from ELEMENTS. Flow examples are collected in the FLOWS array
  //   inside whiteboard.html. Node components (ELEMENTS) and usage examples (FLOWS) are managed
  //   as separate layers by design.

  // M. Meta Visualization — category removed.
  // Timeline / active path / data flow are UI display modes in Flow Inspector, not nodes.
  // See IMPLEMENTATION_NOTES.md for details.

  // N. Placeholder elements — removed (new-schedule promoted to tr-cron / new-parallel removed)

  // K. Triggers — flow entry points (what kicks the flow off)
  "ref-trigger": "A trigger node representing the starting point of a flow — showing what event causes this flow to run. Triggers include manual invocation, a schedule, a webhook, an email, a chat message, or an app event. Visually rendered as a pill shape (rounded oblong, like a flowchart start node) with an amber accent.",
  "tr-manual": "A trigger that starts the flow when a user explicitly requests it — via a slash command such as /draft-nda, a natural-language prompt, or a UI button. The most common and fundamental way to start a flow during a Claude Code session.",
  "tr-cron": "A trigger that automatically starts the flow at a fixed time or interval — for example, 'generate a report every morning at 9 am' or 'check social media every hour'. Implementation options include Anthropic Routines (claude.ai, Pro+ plan), CronCreate (in-session tasks), or an external cron job.",
  "tr-webhook": "A trigger that starts the flow when an external service sends an HTTP request (POST/GET) to a webhook URL — for example, a GitHub PR opened event, a Stripe payment, or a notification from your own app. Supports HMAC signature verification and Bearer Token auth for incoming request validation.",
  "tr-email": "A trigger that starts the flow when a matching email is received. Uses Gmail search syntax (e.g. `is:unread label:invoices from:billing@`) to narrow the target, and polls for new messages on a configurable interval. Use cases include 'auto-extract the amount from invoice emails' or 'auto-summarize and categorize support inquiries'.",
  "tr-chat": "A trigger that starts the flow from a message received through a chat bot — LINE Official Account, Slack bot, Discord bot, Telegram, an embedded chat widget, MCP elicitation, and others. Passes the sender's information and message body to the downstream flow.",
  "tr-app-event": "A generic trigger that starts the flow when an event occurs inside a SaaS product — a new Notion page, a Linear bug ticket, a GitHub PR opened, a new Google Calendar event, an Airtable row added, a Shopify order, and so on. The receive method (MCP polling, webhook, or periodic polling) and filter conditions can be configured to control exactly which events fire the trigger.",
};
