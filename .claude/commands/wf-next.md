---
description: Drive the current workflow task forward (developer → review → fix → submitter)
---

Run `bash scripts/wf.sh next $ARGUMENTS`. The script is the orchestrator — it spawns Pi subagents itself, streams their `## PROGRESS:` markers live, parses the JSON envelope, and updates `.workflow/state.yaml` after each phase.

Stream the output to the user verbatim. When the script exits:

- If a PR/MR URL appears in the final lines, tell the user to merge it and re-run `/wf-next`.
- If the run was no-remote, surface the suggested `git merge --no-ff <branch>` line.
- If the task ended in `blocked` status, run `bash scripts/wf.sh status` and explain the `blocked_reason`.

Never spawn your own subagents — the script owns orchestration.
