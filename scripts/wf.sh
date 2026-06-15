#!/usr/bin/env bash
# wf.sh — workflow orchestrator
#
# Subcommands:
#   init <prd-path>                         Initialize state, detect host
#   task add <title> [--slug <slug>]        Register a task (creates issue or local file)
#   task list                               Show tasks
#   task select <id>                        Set current_task
#   next [--step]                           Drive current task forward (or one phase if --step)
#   resume                                  Print resume guidance
#   status                                  Pretty-print state
#   host                                    Print detected git host
#   doctor                                  Run all preflight checks
#   abort [--yes]                           Reset state (confirms unless --yes)

set -euo pipefail

# Resolve repo root
WF_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export WF_ROOT
LIB="$WF_ROOT/scripts/lib"

# shellcheck source=lib/wf-log.sh
. "$LIB/wf-log.sh"
# shellcheck source=lib/wf-state.sh
. "$LIB/wf-state.sh"
# shellcheck source=lib/wf-git.sh
. "$LIB/wf-git.sh"
# shellcheck source=lib/wf-agent.sh
. "$LIB/wf-agent.sh"

WF_MAX_REVIEW_CYCLES=3

# ---------- helpers ----------

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' \
    | cut -c1-40
}

confirm() {
  if [ "${WF_YES:-0}" = "1" ]; then return 0; fi
  printf '%s [y/N] ' "$1"
  local ans
  read -r ans
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# ---------- subcommands ----------

cmd_doctor() {
  local fail=0
  wf_step "Doctor — preflight checks"

  for bin in pi git yq jq python3; do
    if command -v "$bin" >/dev/null; then
      wf_ok "$bin present ($(command -v "$bin"))"
    else
      wf_err "$bin missing"
      fail=1
    fi
  done

  if [ -d "$WF_ROOT/.pi/agents" ]; then
    wf_ok ".pi/agents/ exists"
    for role in developer reviewer fixer submitter; do
      if [ -f "$WF_ROOT/.pi/agents/$role.md" ]; then
        wf_ok "  role: $role"
      else
        wf_err "  role missing: $role.md"; fail=1
      fi
    done
  else
    wf_err ".pi/agents/ missing"; fail=1
  fi

  local host remote
  host=$(wf_git_detect_host)
  remote=$(wf_git_remote_url)
  wf_info "Detected host: $host  (remote: ${remote:-—})"
  case "$host" in
    github|gitlab_saas|gitlab_selfhosted)
      if wf_git_host_ready "$host"; then
        wf_ok "  $host CLI authenticated"
      else
        wf_warn "  $host CLI not ready — issues/PR steps will fail"
        fail=1
      fi
      ;;
    none) wf_warn "No supported remote — workflow will use docs/tasks/*.md" ;;
  esac

  if wf_state_exists; then
    wf_ok "state.yaml present"
  else
    wf_warn "state.yaml not present — run \`wf init <prd>\` to start"
  fi

  if [ "$fail" = 0 ]; then
    wf_ok "Doctor: all green"
    return 0
  else
    wf_err "Doctor: issues found"
    return 1
  fi
}

cmd_host() {
  local h r
  h=$(wf_git_detect_host)
  r=$(wf_git_remote_url)
  printf 'host: %s\nremote: %s\n' "$h" "${r:-}"
}

cmd_init() {
  local prd="${1:-}"
  [ -n "$prd" ] || wf_die 2 "Usage: wf init <prd-path>"
  [ -f "$prd" ] || wf_die 2 "PRD not found: $prd"
  prd=$(cd "$(dirname "$prd")" && pwd)/$(basename "$prd")
  # Make path relative to repo root if possible
  case "$prd" in "$WF_ROOT"/*) prd="${prd#$WF_ROOT/}" ;; esac

  wf_step "Initializing workflow"
  local host remote branch
  host=$(wf_git_detect_host)
  remote=$(wf_git_remote_url)
  branch=$(wf_git_default_branch)
  wf_info "Host: $host  ·  Branch: $branch  ·  Remote: ${remote:-—}"

  case "$host" in
    github|gitlab_saas|gitlab_selfhosted)
      wf_git_host_ready "$host" || wf_die 3 "Host CLI not ready. Authenticate then re-run."
      ;;
  esac

  wf_state_init "$prd" "$host" "$remote" "$branch"
  wf_ok "Created .workflow/state.yaml"
  wf_info "Next: register tasks with \`wf task add \"<title>\"\` then run \`wf next\`."
}

cmd_task_add() {
  wf_state_require
  local title="" slug=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --slug) slug="$2"; shift 2 ;;
      *) if [ -z "$title" ]; then title="$1"; else title="$title $1"; fi; shift ;;
    esac
  done
  [ -n "$title" ] || wf_die 2 "Usage: wf task add \"<title>\" [--slug <slug>]"
  [ -n "$slug" ] || slug=$(slugify "$title")

  local host
  host=$(wf_state_get '.host')
  local next_id
  next_id=$(yq -r '(.tasks | map(.id) | max // 0) + 1' "$WF_STATE_FILE")
  local branch="feature/${slug}"

  # Create issue / local file
  local backend="" ref="" body_file
  body_file=$(mktemp)
  trap 'rm -f "$body_file"' RETURN

  {
    printf '# %s\n\n' "$title"
    printf 'Tracked by workflow task #%s.\n\n' "$next_id"
    printf '- Branch: \`%s\`\n' "$branch"
    printf '- PRD: \`%s\`\n' "$(wf_state_get '.prd')"
  } > "$body_file"

  case "$host" in
    github)
      backend="github_issue"
      ref=$(wf_git_create_issue github "$title" "$body_file")
      ;;
    gitlab_saas|gitlab_selfhosted)
      backend="gitlab_issue"
      ref=$(wf_git_create_issue "$host" "$title" "$body_file")
      ;;
    none)
      backend="local_file"
      local local_path="docs/tasks/$(printf '%02d' "$next_id")-${slug}.md"
      mkdir -p "$WF_ROOT/docs/tasks"
      {
        printf -- '---\n'
        printf 'task_id: %s\n' "$next_id"
        printf 'title: %s\n' "$title"
        printf 'slug: %s\n' "$slug"
        printf 'branch: %s\n' "$branch"
        printf 'status: planned\n'
        printf -- '---\n\n'
        cat "$body_file"
      } > "$WF_ROOT/$local_path"
      ref="$local_path"
      ;;
  esac

  wf_state_add_task "$next_id" "$title" "$slug" "$branch" "$backend" "$ref"
  wf_ok "Registered task #$next_id — $title"
  wf_dim "  backend: $backend  ref: $ref"
}

cmd_task_list() {
  wf_state_require
  wf_state_summary
}

cmd_task_select() {
  local id="${1:-}"
  [ -n "$id" ] || wf_die 2 "Usage: wf task select <id>"
  wf_state_require
  local exists
  exists=$(yq -r "[.tasks[] | select(.id == $id)] | length" "$WF_STATE_FILE")
  [ "$exists" -gt 0 ] || wf_die 2 "Task $id not found"
  wf_state_set '.current_task' "$id"
  wf_ok "current_task = $id"
}

cmd_status() {
  if ! wf_state_exists; then
    wf_warn "No state.yaml yet — run \`wf init <prd>\`"
    return 0
  fi
  wf_state_summary
}

cmd_resume() {
  wf_state_require
  local cur pending
  cur=$(wf_state_current_task_id)
  pending=$(wf_state_pending_task_id)
  wf_step "Resume"
  if [ -n "$pending" ] && [ "$pending" != "null" ]; then
    local status
    status=$(wf_state_task_field "$pending" status)
    wf_info "Task $pending is in flight (status: $status)."
    wf_info "Run \`wf next\` to continue."
  elif [ -n "$cur" ] && [ "$cur" != "null" ]; then
    local status
    status=$(wf_state_task_field "$cur" status)
    if [ "$status" = "merged" ]; then
      wf_info "Task $cur is merged. Run \`wf next\` to pick the next planned task."
    elif [ "$status" = "merged_pending" ]; then
      wf_info "Task $cur is awaiting merge of its PR. Merge then run \`wf next\`."
    else
      wf_info "Task $cur status: $status. Run \`wf next\` to continue."
    fi
  else
    local n
    n=$(wf_state_next_planned_task_id)
    if [ -n "$n" ]; then
      wf_info "No active task. Next planned: $n. Run \`wf next\` to start it."
    else
      wf_ok "No planned tasks remain. All done."
    fi
  fi
  echo
  cmd_status
}

cmd_abort() {
  wf_state_require
  if ! confirm "Reset .workflow/state.yaml? This deletes the cursor (issues/files stay)."; then
    wf_info "Aborted."
    return 0
  fi
  rm -f "$WF_STATE_FILE"
  wf_ok "state.yaml deleted."
}

# ---------- the per-task driver ----------

# Pick the task to work on: pending > current > next planned
pick_task() {
  local id
  id=$(wf_state_pending_task_id)
  if [ -z "$id" ]; then id=$(wf_state_current_task_id); fi
  if [ -z "$id" ] || [ "$id" = "null" ]; then id=$(wf_state_next_planned_task_id); fi
  if [ -z "$id" ]; then return 1; fi
  printf '%s\n' "$id"
}

run_phase_developer() {
  local id="$1"
  local title branch base prd
  title=$(wf_state_task_field "$id" title)
  branch=$(wf_state_task_field "$id" branch)
  base=$(wf_state_get '.default_branch')
  prd=$(wf_state_get '.prd')

  wf_state_set_task_field_str "$id" status in_progress
  [ -z "$(wf_state_task_field "$id" started_at)" ] && \
    wf_state_set_task_field_str "$id" started_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local task
  task=$(cat <<EOF
Implement task: $title

Work on branch: $branch (create from latest origin/$base if the branch is missing).
PRD reference: $prd — read it for spec context.

Follow strict TDD. Periodically emit \`## PROGRESS: <one-line status>\` lines so the orchestrator can show live progress to the user.

Do NOT commit. Leave changes in the working tree; the submitter will commit.
End with the JSON envelope as specified in your role prompt.
EOF
  )
  wf_agent_run developer "$task" >/dev/null
}

run_phase_review() {
  local id="$1"
  local branch title prd
  branch=$(wf_state_task_field "$id" branch)
  title=$(wf_state_task_field "$id" title)
  prd=$(wf_state_get '.prd')

  wf_state_set_task_field_str "$id" status in_review

  local task
  task=$(cat <<EOF
Review uncommitted changes on branch: $branch
PRD: $prd
Task: $title

Use git diff (read-only) to inspect the working tree. Check against the PRD.
Periodically emit \`## PROGRESS: <one-line status>\` lines.
End with the JSON envelope. The summary MUST start with "PASS" or "FAIL".
EOF
  )

  local env_file
  env_file=$(mktemp)
  if wf_agent_run reviewer "$task" > "$env_file"; then
    local summary
    summary=$(jq -r '.summary // ""' "$env_file")
    case "$summary" in
      PASS*) rm -f "$env_file"; return 0 ;;
      FAIL*) printf '%s\n' "$summary" ; cat "$env_file" > "$WF_RUN_DIR/last-review.envelope.json"; rm -f "$env_file"; return 20 ;;
      *) wf_warn "Reviewer summary unclear: $summary"; rm -f "$env_file"; return 21 ;;
    esac
  else
    rm -f "$env_file"
    return 1
  fi
}

run_phase_fix() {
  local id="$1"
  local branch
  branch=$(wf_state_task_field "$id" branch)
  local review_output=""
  [ -f "$WF_RUN_DIR/last-review.envelope.json" ] && \
    review_output=$(jq -r '.output // ""' "$WF_RUN_DIR/last-review.envelope.json")

  wf_state_set_task_field_str "$id" status fixing

  local task
  task=$(cat <<EOF
Fix the blockers identified by the reviewer.

Branch: $branch
Review report:
---
$review_output
---

Fix ONLY the blockers above. Do NOT commit. Periodically emit \`## PROGRESS:\` lines.
End with the JSON envelope.
EOF
  )
  wf_agent_run fixer "$task" >/dev/null
}

run_phase_submit() {
  local id="$1"
  local title branch host prd
  title=$(wf_state_task_field "$id" title)
  branch=$(wf_state_task_field "$id" branch)
  host=$(wf_state_get '.host')
  prd=$(wf_state_get '.prd')
  local base
  base=$(wf_state_get '.default_branch')
  local ref
  ref=$(wf_state_task_field "$id" ref)

  wf_state_set_task_field_str "$id" status submitting

  local pr_instruction
  case "$host" in
    github)
      pr_instruction="After pushing, open a PR with: gh pr create --base $base --head $branch --title \"$title\" --body \"Closes $ref. PRD: $prd\""
      ;;
    gitlab_saas|gitlab_selfhosted)
      pr_instruction="After pushing, open an MR with: glab mr create --target-branch $base --source-branch $branch --title \"$title\" --description \"Closes $ref. PRD: $prd\" --yes"
      ;;
    none)
      pr_instruction="No remote configured — DO NOT push. Commit on $branch only. Report the branch name; the user will merge locally."
      ;;
  esac

  local task
  task=$(cat <<EOF
Commit the working tree on branch: $branch
Use a conventional commit message describing: $title
$pr_instruction

Periodically emit \`## PROGRESS:\` lines.
End with the JSON envelope. Put the PR/MR URL in \`notes\` if you created one.
EOF
  )

  local env_file
  env_file=$(mktemp)
  if wf_agent_run submitter "$task" > "$env_file"; then
    local pr_url
    pr_url=$(jq -r '.notes // ""' "$env_file" | grep -oE 'https?://[^ ]+' | head -1 || true)
    if [ -n "$pr_url" ]; then
      wf_state_set_task_field_str "$id" pr_url "$pr_url"
    fi
    rm -f "$env_file"
    return 0
  else
    rm -f "$env_file"
    return 1
  fi
}

cmd_next() {
  local step=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --step) step=1; shift ;;
      *) wf_die 2 "Unknown flag: $1" ;;
    esac
  done

  wf_state_require
  local id
  if ! id=$(pick_task); then
    wf_ok "No tasks to work on. Add some with \`wf task add\`."
    return 0
  fi

  local status
  status=$(wf_state_task_field "$id" status)
  wf_state_set '.current_task' "$id"
  wf_info "→ task #$id  ($(wf_state_task_field "$id" title))"
  wf_dim   "  current status: $status"

  if [ "$status" = "planned" ] || [ "$status" = "in_progress" ]; then
    run_phase_developer "$id" || {
      wf_state_set_task_field_str "$id" status blocked
      wf_state_set_task_field_str "$id" blocked_reason "developer failed"
      wf_die 1 "Developer phase failed."
    }
    if [ "$step" = 1 ]; then return 0; fi
    status=in_review
  fi

  # Review / fix loop
  if [ "$status" = "in_review" ] || [ "$status" = "fixing" ]; then
    local cycle
    cycle=$(wf_state_task_field "$id" review_cycle)
    [ -z "$cycle" ] && cycle=0

    while :; do
      if run_phase_review "$id"; then
        wf_ok "Review PASS"
        break
      else
        cycle=$((cycle + 1))
        wf_state_set_task_field "$id" review_cycle "$cycle"
        wf_warn "Review FAIL — cycle $cycle/$WF_MAX_REVIEW_CYCLES"
        if [ "$cycle" -ge "$WF_MAX_REVIEW_CYCLES" ]; then
          wf_state_set_task_field_str "$id" status blocked
          wf_state_set_task_field_str "$id" blocked_reason "Exceeded $WF_MAX_REVIEW_CYCLES review cycles"
          wf_die 1 "Hard-stop: $WF_MAX_REVIEW_CYCLES review cycles exhausted. See $WF_RUN_DIR/last-review.envelope.json"
        fi
        run_phase_fix "$id" || { wf_state_set_task_field_str "$id" status blocked; wf_state_set_task_field_str "$id" blocked_reason "fixer failed"; wf_die 1 "Fixer phase failed."; }
      fi
      [ "$step" = 1 ] && return 0
    done
  fi

  # Submit
  run_phase_submit "$id" || { wf_state_set_task_field_str "$id" status blocked; wf_state_set_task_field_str "$id" blocked_reason "submitter failed"; wf_die 1 "Submitter phase failed."; }
  wf_state_set_task_field_str "$id" status merged_pending

  local host pr_url
  host=$(wf_state_get '.host')
  pr_url=$(wf_state_task_field "$id" pr_url)
  echo
  if [ -n "$pr_url" ]; then
    wf_ok "Task #$id ready for merge: $pr_url"
    wf_info "Merge the PR, then run \`wf next\` to start the next task."
  elif [ "$host" = "none" ]; then
    local branch base
    branch=$(wf_state_task_field "$id" branch)
    base=$(wf_state_get '.default_branch')
    wf_ok "Task #$id committed on $branch."
    wf_info "Merge locally with: git checkout $base && git merge --no-ff $branch"
    wf_info "Then run \`wf next\`."
  else
    wf_warn "Task #$id submitted but no PR URL captured. Inspect $WF_RUN_DIR for details."
  fi

  # Auto-detect already-merged tasks on next invocation: if branch is merged into base, mark merged.
  wf_check_merged "$id" || true
}

# wf_check_merged <id> — if the task's branch is merged into base, flip status to merged.
wf_check_merged() {
  local id="$1"
  local branch base
  branch=$(wf_state_task_field "$id" branch)
  base=$(wf_state_get '.default_branch')
  if git -C "$WF_ROOT" merge-base --is-ancestor "$branch" "$base" 2>/dev/null; then
    wf_state_set_task_field_str "$id" status merged
    wf_ok "Task #$id detected as merged into $base."
  fi
}

# ---------- dispatch ----------

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# *//'
  exit "${1:-0}"
}

main() {
  [ $# -gt 0 ] || usage 0
  case "$1" in
    -h|--help|help) usage 0 ;;
    init)    shift; cmd_init "$@" ;;
    task)
      shift
      [ $# -gt 0 ] || wf_die 2 "Usage: wf task <add|list|select> ..."
      sub="$1"; shift
      case "$sub" in
        add)    cmd_task_add "$@" ;;
        list)   cmd_task_list ;;
        select) cmd_task_select "$@" ;;
        *) wf_die 2 "Unknown task subcommand: $sub" ;;
      esac
      ;;
    next)    shift; cmd_next "$@" ;;
    resume)  shift; cmd_resume ;;
    status)  shift; cmd_status ;;
    host)    shift; cmd_host ;;
    doctor)  shift; cmd_doctor ;;
    abort)
      shift
      [ "${1:-}" = "--yes" ] && WF_YES=1
      cmd_abort
      ;;
    *) wf_die 2 "Unknown command: $1. Try \`wf help\`." ;;
  esac
}

main "$@"
