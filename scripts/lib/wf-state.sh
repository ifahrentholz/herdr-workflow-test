# shellcheck shell=bash
# wf-state.sh — read/write .workflow/state.yaml via yq.
# Source me. Depends on wf-log.sh, yq v4.

WF_STATE_DIR="${WF_ROOT:?WF_ROOT not set}/.workflow"
WF_STATE_FILE="$WF_STATE_DIR/state.yaml"

wf_state_exists() { [ -f "$WF_STATE_FILE" ]; }

wf_state_require() {
  wf_state_exists || wf_die 2 "No workflow state at $WF_STATE_FILE. Run \`wf init\` first."
}

wf_state_init() {
  # Args: <prd-path> <host> <remote-url> <default-branch>
  local prd="$1" host="$2" remote="$3" branch="$4"
  mkdir -p "$WF_STATE_DIR"
  if wf_state_exists; then
    wf_die 1 "state.yaml already exists. Use \`wf abort\` to reset or \`wf resume\` to continue."
  fi
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat > "$WF_STATE_FILE" <<YAML
version: 1
prd: $prd
host: $host
remote_url: $remote
default_branch: $branch
current_task: null
created_at: $now
updated_at: $now
tasks: []
YAML
}

wf_state_get() {
  # Args: <yq-path> — prints value
  wf_state_require
  yq -r "$1 // \"\"" "$WF_STATE_FILE"
}

wf_state_set() {
  # Args: <yq-path> <value> — value is a YAML scalar (use null for null, quote strings yourself)
  wf_state_require
  local path="$1" val="$2"
  yq -i "$path = $val | .updated_at = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" "$WF_STATE_FILE"
}

wf_state_set_str() {
  # Args: <yq-path> <string-value> — quotes value as string
  wf_state_require
  local path="$1" val="$2"
  WF_VAL="$val" yq -i "$path = strenv(WF_VAL) | .updated_at = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" "$WF_STATE_FILE"
}

wf_state_add_task() {
  # Args: <id> <title> <slug> <branch> <backend> <ref>
  wf_state_require
  local id="$1" title="$2" slug="$3" branch="$4" backend="$5" ref="$6"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  WF_TITLE="$title" WF_SLUG="$slug" WF_BRANCH="$branch" WF_BACKEND="$backend" WF_REF="$ref" \
  yq -i "
    .tasks += [{
      \"id\": $id,
      \"title\": strenv(WF_TITLE),
      \"slug\": strenv(WF_SLUG),
      \"branch\": strenv(WF_BRANCH),
      \"backend\": strenv(WF_BACKEND),
      \"ref\": strenv(WF_REF),
      \"status\": \"planned\",
      \"review_cycle\": 0,
      \"pr_url\": null,
      \"blocked_reason\": null,
      \"started_at\": null,
      \"updated_at\": \"$now\"
    }]
    | .updated_at = \"$now\"
  " "$WF_STATE_FILE"
}

wf_state_task_field() {
  # Args: <task-id> <field>
  wf_state_require
  yq -r ".tasks[] | select(.id == $1) | .$2 // \"\"" "$WF_STATE_FILE"
}

wf_state_set_task_field() {
  # Args: <task-id> <field> <yaml-value>
  wf_state_require
  local id="$1" field="$2" val="$3"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  yq -i "
    (.tasks[] | select(.id == $id) | .$field) = $val
    | (.tasks[] | select(.id == $id) | .updated_at) = \"$now\"
    | .updated_at = \"$now\"
  " "$WF_STATE_FILE"
}

wf_state_set_task_field_str() {
  # Args: <task-id> <field> <string>
  wf_state_require
  local id="$1" field="$2" val="$3"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  WF_VAL="$val" yq -i "
    (.tasks[] | select(.id == $id) | .$field) = strenv(WF_VAL)
    | (.tasks[] | select(.id == $id) | .updated_at) = \"$now\"
    | .updated_at = \"$now\"
  " "$WF_STATE_FILE"
}

wf_state_current_task_id() {
  wf_state_get '.current_task'
}

wf_state_next_planned_task_id() {
  wf_state_require
  yq -r '[.tasks[] | select(.status == "planned")] | .[0].id // ""' "$WF_STATE_FILE"
}

wf_state_pending_task_id() {
  # Returns id of the task currently in flight (not planned, not merged, not blocked)
  wf_state_require
  yq -r '
    [.tasks[] | select(.status != "planned" and .status != "merged" and .status != "blocked")]
    | .[0].id // ""
  ' "$WF_STATE_FILE"
}

wf_state_summary() {
  wf_state_require
  yq -r '
    "PRD:           " + (.prd // "—"),
    "Host:          " + (.host // "—"),
    "Remote:        " + (.remote_url // "—"),
    "Default branch:" + " " + (.default_branch // "main"),
    "Current task:  " + ((.current_task // "—") | tostring),
    "",
    "Tasks:"
  ' "$WF_STATE_FILE"
  # Emit one tab-separated record per task; format in shell so we can do
  # conditionals (mikefarah/yq v4 does not support inline if-then-else).
  yq -r '.tasks[] | (.id | tostring) + "\t" + .status + "\t" + .title + "\t" + (.pr_url // "") + "\t" + (.blocked_reason // "")' "$WF_STATE_FILE" \
  | while IFS=$'\t' read -r id status title pr block; do
      line="  [$id] $status  $title"
      [ -n "$pr" ] && line="$line  → $pr"
      [ -n "$block" ] && line="$line  ⚠ $block"
      printf '%s\n' "$line"
    done
}
