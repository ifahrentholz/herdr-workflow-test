# shellcheck shell=bash
# wf-log.sh — small logging helpers. Source me.

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  WF_C_DIM=$'\033[2m'
  WF_C_RED=$'\033[31m'
  WF_C_GREEN=$'\033[32m'
  WF_C_YELLOW=$'\033[33m'
  WF_C_BLUE=$'\033[34m'
  WF_C_CYAN=$'\033[36m'
  WF_C_BOLD=$'\033[1m'
  WF_C_RESET=$'\033[0m'
else
  WF_C_DIM=''; WF_C_RED=''; WF_C_GREEN=''; WF_C_YELLOW=''
  WF_C_BLUE=''; WF_C_CYAN=''; WF_C_BOLD=''; WF_C_RESET=''
fi

wf_info()  { printf '%s[wf]%s %s\n'    "$WF_C_BLUE"   "$WF_C_RESET" "$*"; }
wf_ok()    { printf '%s[wf]%s %s\n'    "$WF_C_GREEN"  "$WF_C_RESET" "$*"; }
wf_warn()  { printf '%s[wf]%s %s\n'    "$WF_C_YELLOW" "$WF_C_RESET" "$*" >&2; }
wf_err()   { printf '%s[wf]%s %s\n'    "$WF_C_RED"    "$WF_C_RESET" "$*" >&2; }
wf_step()  { printf '\n%s▶%s %s%s%s\n' "$WF_C_CYAN"   "$WF_C_RESET" "$WF_C_BOLD" "$*" "$WF_C_RESET"; }
wf_dim()   { printf '%s%s%s\n'         "$WF_C_DIM"    "$*" "$WF_C_RESET"; }

# wf_die <code> <msg> — abort with code+message
wf_die() { wf_err "$2"; exit "$1"; }
