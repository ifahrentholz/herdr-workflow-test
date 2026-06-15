# shellcheck shell=bash
# wf-git.sh — git host detection + gh/glab/local abstraction.
# Source me. Depends on wf-log.sh.

wf_git_remote_url() {
  git -C "$WF_ROOT" remote get-url origin 2>/dev/null || true
}

wf_git_default_branch() {
  # Best-effort: try origin/HEAD, fall back to main/master
  local b
  b=$(git -C "$WF_ROOT" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|origin/||')
  if [ -z "$b" ]; then
    if git -C "$WF_ROOT" show-ref --verify --quiet refs/heads/main; then b=main
    elif git -C "$WF_ROOT" show-ref --verify --quiet refs/heads/master; then b=master
    else b=main
    fi
  fi
  printf '%s\n' "$b"
}

# wf_git_detect_host — prints one of:
#   github            gitlab_saas    gitlab_selfhosted    none
# Sets globals: WF_HOST, WF_REMOTE_URL
wf_git_detect_host() {
  local url
  url=$(wf_git_remote_url)
  WF_REMOTE_URL="$url"
  if [ -z "$url" ]; then
    WF_HOST="none"
  elif printf '%s' "$url" | grep -qE '(^|@|//)github\.com[:/]'; then
    WF_HOST="github"
  elif printf '%s' "$url" | grep -qE '(^|@|//)gitlab\.com[:/]'; then
    WF_HOST="gitlab_saas"
  elif printf '%s' "$url" | grep -qiE 'gitlab'; then
    WF_HOST="gitlab_selfhosted"
  else
    # Could be Bitbucket / Gitea / unknown — treat as none for safety
    WF_HOST="none"
    wf_warn "Remote $url is not GitHub or GitLab. Falling back to local TODO mode."
  fi
  printf '%s\n' "$WF_HOST"
}

# wf_git_host_ready — returns 0 if the CLI for the current host is installed AND authenticated.
wf_git_host_ready() {
  local host="${1:-$WF_HOST}"
  case "$host" in
    github)
      command -v gh >/dev/null || { wf_err "gh CLI not installed"; return 2; }
      gh auth status >/dev/null 2>&1 || { wf_err "gh not authenticated (run: gh auth login)"; return 3; }
      ;;
    gitlab_saas|gitlab_selfhosted)
      command -v glab >/dev/null || { wf_err "glab CLI not installed"; return 2; }
      glab auth status >/dev/null 2>&1 || { wf_err "glab not authenticated (run: glab auth login)"; return 3; }
      ;;
    none) return 0 ;;
    *) wf_err "Unknown host: $host"; return 4 ;;
  esac
}

# wf_git_create_issue <host> <title> <body-file> — prints ref (URL or file-path)
wf_git_create_issue() {
  local host="$1" title="$2" body_file="$3"
  case "$host" in
    github)
      gh issue create --title "$title" --body-file "$body_file" 2>&1 | tail -1
      ;;
    gitlab_saas|gitlab_selfhosted)
      glab issue create --title "$title" --description "$(cat "$body_file")" --yes 2>&1 | grep -oE 'https?://[^ ]+' | head -1
      ;;
    none)
      # Caller is responsible for creating docs/tasks/<id>-<slug>.md
      printf '\n'
      ;;
    *) wf_err "Unknown host: $host"; return 1 ;;
  esac
}

# wf_git_create_pr <host> <head-branch> <base-branch> <title> <body-file> <issue-ref> — prints PR URL
wf_git_create_pr() {
  local host="$1" head="$2" base="$3" title="$4" body_file="$5" issue_ref="$6"
  case "$host" in
    github)
      gh pr create --head "$head" --base "$base" --title "$title" --body-file "$body_file" 2>&1 | grep -oE 'https?://[^ ]+' | head -1
      ;;
    gitlab_saas|gitlab_selfhosted)
      glab mr create --source-branch "$head" --target-branch "$base" --title "$title" \
        --description "$(cat "$body_file")" --yes 2>&1 | grep -oE 'https?://[^ ]+' | head -1
      ;;
    none)
      wf_warn "No remote host — skipping PR creation. Merge manually:"
      wf_warn "  git checkout $base && git merge $head"
      printf '\n'
      ;;
    *) wf_err "Unknown host: $host"; return 1 ;;
  esac
}
