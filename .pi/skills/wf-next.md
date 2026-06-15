---
name: wf-next
description: Drive the current task forward through developer → review → fix → submitter
---

Run the next phase(s) of the active workflow task. The shell script handles all orchestration: preflight checks, subagent spawning via `pi --no-session -p`, live output streaming, JSON envelope parsing, state updates, and 3-cycle review/fix loop with hard-stop on exhaustion.

```bash
bash scripts/wf.sh next "$@"
```

When the script returns:

- **Success + PR URL printed** → tell the user to merge the PR, then run `wf next` for the next task.
- **No-remote mode** → tell the user the branch is committed locally and offer the `git merge --no-ff` command from the script output.
- **Blocked** → read `.workflow/state.yaml` for `blocked_reason` and report it. Suggest `wf status` to inspect.

Do NOT spawn additional subagents yourself — the script is the orchestrator.
