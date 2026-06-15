# AGENTS.md — Workflow Rules

> **You are in a workflow-driven project. Follow these rules strictly.**

## 🚀 AUTO-START — Read this first

**When the user describes a feature, idea, or change request → immediately enter Phase 1. Do NOT ask "what would you like to do?". The user's message IS the trigger.**

**Exception (single):** If the message is a narrow, factual question (e.g. "how do I run the tests?", "what does this function do?", "show me the README"), answer it directly without entering the workflow.

The workflow has two phases. Run them as a chain — each step gates the next, and you do NOT stop between them unless an error occurs or the user explicitly pauses you.

---

## Phase 1 — Design → PRD → Issues → Workflow Init

Run these skills/commands in order. After each one finishes, immediately run the next:

### 1.1 `skill:grill-me`
Stress-test the idea with the user. Resolve every branch of the design tree.

### 1.2 `skill:to-prd`
Produce `docs/prd-<slug>.md` from the grilled context.

### 1.3 `skill:to-issues`
Break the PRD into tracer-bullet issues. The skill publishes them to the issue tracker (GitHub or GitLab — detected automatically).

### 1.4 Write `.workflow/pending-issues.json`
**As soon as `to-issues` finishes creating issues**, extract the title + URL of each issue from the skill's output and write them as a JSON array to `.workflow/pending-issues.json`. Schema:

```json
[
  {"title": "Render snake grid", "url": "https://github.com/.../issues/1"},
  {"title": "Add snake movement", "url": "https://github.com/.../issues/2"}
]
```

Use the Bash tool to write the file. Get the URLs from `to-issues`'s message — they are explicit in its output.

### 1.5 `bash scripts/wf.sh init docs/prd-<slug>.md`
Initialize the workflow state. Detects the git host, creates `.workflow/state.yaml`.

### 1.6 `bash scripts/wf.sh import-issues`
Read `.workflow/pending-issues.json` and register every issue as a task.

→ **Proceed straight to Phase 2.**

### Special case: no remote / local mode
If `bash scripts/wf.sh host` reports `host: none`, skip 1.3 / 1.4 / 1.6. Instead:
1. After `to-prd` finishes, for each vertical slice the user approved, call `bash scripts/wf.sh task add "<title>"`. Each call creates a `docs/tasks/<id>-<slug>.md` file.
2. Proceed to Phase 2.

---

## Phase 2 — Task Loop

Run `bash scripts/wf.sh next`. The script orchestrates everything:

- Pre-flight checks → spawns the `developer` worker → review-fix loop (max 3 cycles) → `submitter`.
- Lives subagent stdout is streamed (`## PROGRESS:` markers highlighted).
- State written to `.workflow/state.yaml` after every phase.

When the script exits:

- **PR/MR opened** → tell the user to merge, then call `wf next` again for the next task.
- **`host: none`** → tell the user to merge locally with `git merge --no-ff <branch>`, then call `wf next`.
- **`status: blocked`** → report the `blocked_reason` and stop. Do NOT retry without user direction.

Keep calling `wf next` until `wf status` shows every task as `merged`.

---

## Golden Rule — The Script Owns Orchestration

`scripts/wf.sh` is the orchestrator. It:

- Runs preflight checks (CLI versions, agent files, git host auth) **before** spawning anything.
- Spawns Pi subagents via `pi --no-session -p --system-prompt … --tools …` and streams their stdout.
- Parses the final JSON envelope from each subagent and updates state.
- Enforces a single-agent-at-a-time policy and a 3-cycle review/fix budget with hard-stop.

**You do NOT spawn subagents directly.** All subagent invocation goes through `wf next`. If you find yourself wanting to call the `subagent` tool yourself, you have misread these rules.

---

## Roles

Defined in `.pi/agents/<role>.md`; loaded as system prompts when the script spawns a worker.

| Role        | Purpose                                | Tools                       |
| ----------- | -------------------------------------- | --------------------------- |
| `developer` | TDD implementation                     | `read,write,edit,bash`      |
| `reviewer`  | Reads diff, classifies PASS/FAIL       | `read,bash` (read-only)     |
| `fixer`     | Addresses reviewer blockers            | `read,write,edit,bash`      |
| `submitter` | Commits + pushes + opens PR/MR         | `read,bash`                 |
| `tester`    | Optional — adds tests                  | `read,write,edit,bash`      |
| `planner`   | Optional — turns PRD into task plan    | `read,bash`                 |

Commit authority: only `submitter` runs `git commit` / `git push` / `gh pr create` / `glab mr create`. All other roles leave changes in the working tree.

---

## Subagent JSON Envelope

Every role's prompt ends with this contract — its final non-empty message **must** be a single JSON object:

```json
{
  "status": "success" | "error",
  "summary": "<one-line outcome — reviewer summary MUST start with PASS or FAIL>",
  "output": "<the full Markdown report as a single string>",
  "filesChanged": ["..."],
  "tests": ["..."],
  "notes": "<optional — PR URL, hand-off info>",
  "error": "<set when status is error>"
}
```

The script extracts the last balanced `{...}` block from the worker's stdout.

---

## Progress Markers

Workers periodically emit:

```
## PROGRESS: writing failing test for snake.move()
```

The script highlights these so the user sees what is happening live.

---

## Resume Semantics

`bash scripts/wf.sh resume` is **task-level**: it identifies the in-flight or next-planned task and points at `wf next`. Half-finished subagent runs are not resumed — the next `wf next` restarts the current phase from scratch on the same branch.

If the user returns after a session break and just says "weiter", run `bash scripts/wf.sh resume` first.

---

## Git Workflow

- Each task → branch `feature/<slug>` cut from the latest default branch.
- Submitter commits + pushes; opens PR/MR via the detected host CLI.
- For `host: none`, submitter commits locally only — user merges with `git merge --no-ff`.
- A task is `merged_pending` until its branch is reachable from the default branch; the next `wf next` flips it to `merged`.

---

## Eskalation

After 3 failed review→fix cycles the script writes `status: blocked` with a `blocked_reason`, dumps the last review envelope, and exits non-zero. Report this to the user and STOP — no autonomous further attempts.

---

## Slash / Skill Equivalents

| Command                              | Slash (Claude Code) | Skill (Pi)       |
| ------------------------------------ | ------------------- | ---------------- |
| `bash scripts/wf.sh doctor`          | `/wf-doctor`        | `skill:wf-doctor`  |
| `bash scripts/wf.sh init <prd>`      | `/wf-start <prd>`   | `skill:wf-start`   |
| `bash scripts/wf.sh import-issues`   | (run via bash)      | (run via bash)   |
| `bash scripts/wf.sh task ...`        | `/wf-task`          | `skill:wf-task`    |
| `bash scripts/wf.sh next`            | `/wf-next`          | `skill:wf-next`    |
| `bash scripts/wf.sh resume`          | `/wf-resume`        | `skill:wf-resume`  |
| `bash scripts/wf.sh status`          | `/wf-status`        | `skill:wf-status`  |
| `bash scripts/wf.sh abort`           | `/wf-abort`         | `skill:wf-abort`   |

---

## Troubleshooting

- `bash scripts/wf.sh doctor` — runs every preflight check at once.
- `.workflow/runs/` — per-run logs (timestamped, role-named).
- `.workflow/state.yaml` — single source of truth for the cursor.
- `.workflow/pending-issues.imported-<ts>.json` — archived import payloads.

---

## Notes

- Subagent definitions in `.pi/agents/*.md` — edit them to tune role behavior.
- Skills `grill-me`, `to-prd`, `to-issues`, `tdd` remain unchanged at user level; this workflow chains them.
- Never edit `.workflow/state.yaml` by hand while a task is in flight — use `wf task` subcommands.
