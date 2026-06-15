# shellcheck shell=bash
# wf-agent.sh — spawn pi worker for a role, stream stdout, parse JSON envelope.
# Source me. Depends on wf-log.sh.

WF_AGENTS_DIR="${WF_ROOT}/.pi/agents"
WF_RUN_DIR="${WF_ROOT}/.workflow/runs"

# wf_agent_extract_prompt <role-file> — strip frontmatter, print prompt body.
wf_agent_extract_prompt() {
  awk '
    BEGIN { in_fm=0; past_fm=0 }
    /^---[[:space:]]*$/ {
      if (!past_fm && in_fm==0) { in_fm=1; next }
      if (in_fm==1)             { in_fm=0; past_fm=1; next }
    }
    in_fm==0 && past_fm==1 { print }
  ' "$1"
}

# wf_agent_extract_tools <role-file> — print tools list (comma-separated) from frontmatter.
wf_agent_extract_tools() {
  awk '
    /^---[[:space:]]*$/ { fm = !fm; next }
    fm && /^tools:/ {
      sub(/^tools:[[:space:]]*/, "")
      gsub(/[[:space:]]/, "")
      print
      exit
    }
  ' "$1"
}

# wf_agent_preflight <role>
wf_agent_preflight() {
  local role="$1"
  command -v pi >/dev/null || { wf_err "pi CLI not installed"; return 10; }
  [ -f "$WF_AGENTS_DIR/$role.md" ] || { wf_err "Role file missing: $WF_AGENTS_DIR/$role.md"; return 11; }
  # Bash + git presence
  command -v git >/dev/null || { wf_err "git not installed"; return 12; }
  return 0
}

# wf_agent_run <role> <task-prompt> — runs the worker; streams output; prints JSON envelope on stdout.
# Returns 0 if envelope.status == success, 1 if error, 2 if no envelope.
wf_agent_run() {
  local role="$1" task="$2"
  wf_agent_preflight "$role" || return $?

  mkdir -p "$WF_RUN_DIR"
  local ts
  ts=$(date +%Y%m%d-%H%M%S)
  local log="$WF_RUN_DIR/${ts}-${role}.log"
  local env_file="$WF_RUN_DIR/${ts}-${role}.envelope.json"

  local sys_prompt tools
  sys_prompt=$(wf_agent_extract_prompt "$WF_AGENTS_DIR/$role.md")
  tools=$(wf_agent_extract_tools "$WF_AGENTS_DIR/$role.md")
  [ -z "$tools" ] && tools="read,write,edit,bash"

  wf_step "Subagent: $role"
  wf_dim   "  tools: $tools"
  wf_dim   "  log:   $log"

  # Run pi non-interactively. Stream raw output through a filter that:
  #  - tees to log file for envelope extraction
  #  - shows live `## PROGRESS:` markers prominently
  #  - dims everything else as a sidebar
  set +e
  pi --no-session -p \
     --system-prompt "$sys_prompt" \
     --tools "$tools" \
     --mode text \
     "$task" 2>&1 \
  | tee "$log" \
  | awk -v dim="$WF_C_DIM" -v reset="$WF_C_RESET" -v cyan="$WF_C_CYAN" -v bold="$WF_C_BOLD" '
      /^## PROGRESS:/ {
        sub(/^## PROGRESS:[[:space:]]*/, "")
        printf "  %s└─%s %s%s%s\n", cyan, reset, bold, $0, reset
        fflush()
        next
      }
      { printf "  %s│ %s%s\n", dim, $0, reset; fflush() }
    '
  local rc=${PIPESTATUS[0]}
  set -e

  # Extract the final JSON envelope: last balanced {...} that parses + contains "status".
  if ! wf_agent_extract_envelope "$log" > "$env_file"; then
    wf_err "$role finished but emitted no JSON envelope (pi exit=$rc, log: $log)"
    return 2
  fi

  # Pretty-print envelope summary
  local status summary
  status=$(jq -r '.status // ""' "$env_file")
  summary=$(jq -r '.summary // ""' "$env_file")
  if [ "$status" = "success" ]; then
    wf_ok "$role: $summary"
    cat "$env_file"
    return 0
  else
    wf_err "$role failed: $(jq -r '.error // .summary // "no detail"' "$env_file")"
    cat "$env_file"
    return 1
  fi
}

# wf_agent_extract_envelope <log-file> — print last JSON object that has "status".
wf_agent_extract_envelope() {
  local log="$1"
  python3 - "$log" <<'PY'
import sys, json, re
path = sys.argv[1]
text = open(path, 'r', encoding='utf-8', errors='replace').read()

# Find every balanced {...} block in the text (greedy left-to-right scan).
results = []
depth = 0
start = -1
for i, ch in enumerate(text):
    if ch == '{':
        if depth == 0:
            start = i
        depth += 1
    elif ch == '}':
        if depth > 0:
            depth -= 1
            if depth == 0 and start >= 0:
                results.append(text[start:i+1])
                start = -1

# Walk from the end, return the first one that parses and has 'status'.
for blob in reversed(results):
    blob_stripped = blob.strip()
    try:
        obj = json.loads(blob_stripped)
    except json.JSONDecodeError:
        continue
    if isinstance(obj, dict) and 'status' in obj:
        print(json.dumps(obj))
        sys.exit(0)
sys.exit(1)
PY
}
