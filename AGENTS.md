# AGENTS.md — Workflow Rules

This project uses a script-driven workflow. The agent's job is to invoke the right `wf` command at the right moment and surface its output. **It does NOT orchestrate subagents directly.**

## Entry Point

When the user describes a new feature: run `skill:grill-me` → `skill:to-prd` to produce a PRD file. Then:

1. `bash scripts/wf.sh init <prd-path>` — initializes state, detects git host.
2. For each task in the PRD: `bash scripts/wf.sh task add "<title>"` — auto-creates a GitHub/GitLab issue OR a `docs/tasks/<id>-<slug>.md` file depending on the remote.
3. `bash scripts/wf.sh next` — drives the current task forward through all phases.

The agent should prefer slash equivalents when available: `/wf-start`, `/wf-task`, `/wf-next`, `/wf-resume`, `/wf-status`, `/wf-doctor`, `/wf-abort`.

If the user issues an unrelated, narrow question (e.g. "how do I run the tests?"), answer directly — do NOT enter the workflow.

## Golden Rule — Script Owns Orchestration

`scripts/wf.sh` is the orchestrator. It:

- Runs preflight checks (CLI versions, agent files, git host auth, etc.) **before** spawning anything.
- Spawns Pi subagents via `pi --no-session -p --system-prompt ... --tools ...`.
- Streams subagent stdout live, prefixing dimmed lines and highlighting `## PROGRESS:` markers.
- Parses the final JSON envelope from each subagent and updates `.workflow/state.yaml`.
- Loops review→fix up to 3 cycles, then hard-stops with `status: blocked`.

Do not spawn additional subagents in parallel. Single-agent-at-a-time is enforced by the script.

## Roles

All roles live in `.pi/agents/<role>.md`. They are loaded as system prompts when the script spawns a worker.

| Role        | Purpose                                | Tools                       |
| ----------- | -------------------------------------- | --------------------------- |
| `developer` | TDD implementation                     | `read,write,edit,bash`      |
| `reviewer`  | Reads diff, classifies PASS/FAIL       | `read,bash` (read-only sub) |
| `fixer`     | Addresses reviewer blockers            | `read,write,edit,bash`      |
| `submitter` | Commits + pushes + opens PR/MR         | `read,bash`                 |
| `tester`    | Optional — adds tests                  | `read,write,edit,bash`      |
| `planner`   | Optional — turns PRD into task plan    | `read,bash`                 |

Commit authority: only `submitter` runs `git commit` / `git push` / `gh pr create` / `glab mr create`. All other roles leave changes in the working tree.

## Subagent JSON Envelope

Every role's prompt ends with a contract: its final non-empty message **must** be a single JSON object:

```json
{
  "status": "success" | "error",
  "summary": "<one-line outcome — reviewer summary MUST start with PASS or FAIL>",
  "output": "<the full Markdown report as a single string>",
  "filesChanged": ["..."],   // developer/fixer/submitter
  "tests": ["..."],           // developer/fixer/tester
  "notes": "<optional — PR URL, hand-off info>",
  "error": "<set when status is error>"
}
```

The script extracts the last balanced `{...}` block from the worker's stdout. Workers should emit nothing after the envelope.

## Progress Markers

Workers periodically emit lines of the form:

```
## PROGRESS: writing failing test for snake.move()
```

The script highlights these lines so the user sees what is happening live.

## Resume Semantics

`bash scripts/wf.sh resume` is **task-level**: it identifies which task is in flight (or which planned task is next) and tells the user to run `wf next`. Half-finished subagent runs are not resumed — the next `wf next` restarts the current phase from scratch on the same branch.

## Git Workflow

- Each task → branch `feature/<slug>` cut from the latest default branch.
- Submitter commits + pushes; opens PR/MR via the detected host CLI.
- For `host: none`, submitter commits locally only — the user merges with `git merge --no-ff`.
- A task is `merged_pending` until its branch is reachable from the default branch; the next `wf next` flips it to `merged`.

## Eskalation

After 3 failed review→fix cycles the script writes `status: blocked` with a `blocked_reason`, dumps the last review envelope, and exits non-zero. The agent must report this to the user — no autonomous further attempts.

## Troubleshooting

- `bash scripts/wf.sh doctor` — runs every preflight check at once.
- `.workflow/runs/` — per-run logs (timestamped, role-named).
- `.workflow/state.yaml` — single source of truth for the cursor.

## Notes

- Subagent definitions in `.pi/agents/*.md` — edit them to tune role behavior.
- Skills `grill-me`, `to-prd`, `tdd` remain user-level Pi skills; this workflow calls them from the agent's main loop, not from the script.
- Never edit `.workflow/state.yaml` by hand while a task is in flight — use `wf task` subcommands.
