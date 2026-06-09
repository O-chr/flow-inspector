---
name: flow-inspector
description: Start/stop the Flow Inspector dashboard that visualizes Claude Code config as flow diagrams (English edition)
argument-hint: "[stop]"
disable-model-invocation: true
flow_version: 1
---

# Flow Inspector Skill

This skill starts and stops the dashboard that visualizes and edits your Claude Code configuration as flow diagrams.

## Usage

- No argument: start the dashboard
- Argument `stop`: stop the dashboard

## Flow

### On start <!-- {code} -->

The port defaults to **8077**. Override it with the `FLOW_INSPECTOR_PORT` environment variable.

0. **Double-start check (always do this first)**: if Flow Inspector is already running on the same port, do not start a new instance (this avoids a "failed" message from a port conflict).
   ```bash
   PORT="${FLOW_INSPECTOR_PORT:-8077}"
   if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
     echo "already running on ${PORT}"   # → already running. Skip steps 1-2 and go to the workspace check and browser step (3+).
   fi
   ```
   If it responds, tell the user "already running" and jump to step 5 (open the browser). If there is no response, start from step 1.
   (The liveness check only tests whether the server responds. Use `/` consistently — same as the check in "Implementation" below.)

1. **Prepare a dedicated venv (isolate dependencies outside the plugin)**: do not install dependencies inside the plugin directory; instead set up a dedicated Python virtual environment at `~/.cache/flow-inspector/venv` (create it if missing, reuse it if present). This keeps dependencies out of the system Python and other projects, and keeps the plugin itself lightweight.
   ```bash
   FI_VENV="$HOME/.cache/flow-inspector/venv"
   [ -d "$FI_VENV" ] || python3 -m venv "$FI_VENV"      # use `python` if `python3` is unavailable
   "$FI_VENV/bin/python" -c "import fastapi, uvicorn, yaml" 2>/dev/null \
     || "$FI_VENV/bin/pip" install -q -r "${CLAUDE_PLUGIN_ROOT}/server/requirements.txt"
   ```

2. **Start the server**: run Uvicorn with that venv's Python, from the plugin directory.
   - Command: `cd "${CLAUDE_PLUGIN_ROOT}" && "$HOME/.cache/flow-inspector/venv/bin/python" -m uvicorn server.main:app --host 127.0.0.1 --port "${FLOW_INSPECTOR_PORT:-8077}"`
   - Binds to port 8077 (localhost only) by default. It is fine to start it in the background.

3. **Initialize the workspace**: after the server starts, initialize the workspace with a POST request.
   - Endpoint: `POST http://127.0.0.1:8077/api/workspace/init`
   - This is a deterministic copy only. It does NOT call the AI (claude) and consumes no tokens.

4. **Inform about un-flow-ized skills (do NOT flow-ize; 0 tokens)**:
   - Call `GET http://127.0.0.1:8077/api/workspace/annotate-candidates` to get the count of un-flow-ized skills (deterministic, 0 tokens). The response is `{count, skills:[{id, name, description}], setup_done}`.
   - If `count == 0`, say nothing and move on.
   - If `count >= 1`, only **inform** the user (do NOT run AI annotation / flow-ization here):
     ```
     There are N un-flow-ized skills/commands.
     In the dashboard, press the "▶ Flow-ize" button on any item you want to visualize (each press calls the AI).
     To do them all at once, use the "▶ Flow-ize (N)" button at the top of the list.
     ```
   - **Do NOT call `annotate-all` automatically from this skill.** All flow-ization runs from the dashboard buttons (a human click) — consolidating consent and token cost in the UI. Only when the user explicitly asks in chat (e.g. "flow-ize the X-type skills") may you optionally `POST .../annotate-all` with `{"flow_ids": [...]}`.
   - Note: flow-ization results are written to staging; live `~/.claude` stays untouched until "Sync & Apply" is pressed. Once flow-ized, the result is cached and survives a plugin restart.

5. **Open the browser**: open `http://127.0.0.1:8077` (or your chosen port if you changed `FLOW_INSPECTOR_PORT`).

### On stop (argument: `stop`) <!-- {code} -->

- **macOS / Linux**: `pkill -f "uvicorn server.main:app"`
- **Windows** (no `pkill`): `taskkill /F /IM python.exe` (if other Python processes are running, stop only the relevant one via Task Manager, etc.)

## Implementation

Follow these steps:

The port defaults to **8077** (override with `FLOW_INSPECTOR_PORT`). Use `python` where `python3` is unavailable.

**Start mode:**
0. **Double-start check (always first)**: if it is already running, do not start a second uvicorn (this avoids an "exit 1 / failed" message from a port conflict).
   ```bash
   PORT="${FLOW_INSPECTOR_PORT:-8077}"
   if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
     echo "already running"   # already running → skip steps 1-4 and go to step 7 (browser). Tell the user "already running".
   fi
   ```
   Only start from step 1 if there is no response.
1. Prepare a dedicated venv (isolate dependencies outside the plugin, at `$HOME/.cache/flow-inspector/venv`):
   ```bash
   FI_VENV="$HOME/.cache/flow-inspector/venv"
   [ -d "$FI_VENV" ] || python3 -m venv "$FI_VENV"
   "$FI_VENV/bin/python" -c "import fastapi, uvicorn, yaml" 2>/dev/null \
     || "$FI_VENV/bin/pip" install -q -r "${CLAUDE_PLUGIN_ROOT}/server/requirements.txt"
   ```
2. (Merged into the step above. Dependencies are installed automatically if missing.)
3. Start Uvicorn with that venv's Python: `cd "${CLAUDE_PLUGIN_ROOT}" && "$FI_VENV/bin/python" -m uvicorn server.main:app --host 127.0.0.1 --port "${FLOW_INSPECTOR_PORT:-8077}"`
4. Wait for the server to start (a few seconds)
5. Call POST `http://127.0.0.1:8077/api/workspace/init` (pull live config into a working copy; deterministic, 0 tokens)
6. **Inform about un-flow-ized skills (do NOT flow-ize; 0 tokens)**:
   - GET `http://127.0.0.1:8077/api/workspace/annotate-candidates` to get the count (deterministic, 0 tokens). `{count, skills:[{id,name,description}], setup_done}`.
   - If `count == 0`, do nothing and go to step 7.
   - If `count >= 1`, only **inform** the user that they can flow-ize from the dashboard: "N items are un-flow-ized. Run them with the '▶ Flow-ize' button on each row, or the '▶ Flow-ize (N)' button at the top (each press calls the AI)."
   - **Do NOT call `annotate-all` automatically from here.** Flow-ization execution and consent are consolidated in the UI buttons (only when the user explicitly asks in chat to "flow-ize the X-type skills" may you optionally `POST .../annotate-all`).
7. Open `http://127.0.0.1:8077` in the browser (or your chosen port if you changed `FLOW_INSPECTOR_PORT`)
8. Notify the user that the dashboard has started (if there are N un-flow-ized items, add that they can run them with the dashboard's "▶ Flow-ize" button).

**Stop mode (when the argument contains "stop"):**
1. Terminate the process (branch by OS):
   - macOS / Linux: `pkill -f "uvicorn server.main:app"`
   - Windows (no `pkill`): `taskkill /F /IM python.exe` (prefer stopping only the relevant process)
2. Notify the user that the dashboard has stopped
