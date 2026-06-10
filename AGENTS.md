# AGENTS.md — Pi Agent Workflow Rules

> These rules govern how the Pi agent operates in this workspace. Follow them strictly.

---

## 🚀 Entry Point — Auto-Start Workflow

**When the user describes a new feature, idea, or request → immediately start Phase 1 (grill-me).**

Do NOT wait for further instructions. Do NOT ask "What would you like to do?" — the user's message IS the trigger.

**Exception:** If the user explicitly asks a simple question (e.g., "How do I run tests?"), answer directly without triggering the workflow.

---

## ⚠️ Golden Rule — Single Agent Lock

**Only ONE agent may work on code at any time.**

- All subagents execute **strictly sequentially** via the `subagent` tool.
- Wait for a subagent to complete **before** invoking the next one.
- Do not use legacy `subagent` `parallel`/`tasks` or `chain` modes. The Herdr-native tool is single-mode only.

---

## Available Subagents

All agents are defined in `.pi/agents/*.md` and invoked via the **`subagent`** tool with `agentScope: "both"`.

| Agent          | Role                                  | Tools                                  |
| -------------- | ------------------------------------- | -------------------------------------- |
| `orchestrator` | Coordinates workflow, delegates tasks | read, write, edit, bash                |
| `planner`      | Creates implementation plans from PRD | read, grep, find, ls                   |
| `developer`    | Implements features via TDD           | read, write, edit, bash                |
| `reviewer`     | Code review — finds blockers          | read, grep, find, ls, bash (read-only) |
| `tester`       | Writes and runs tests                 | read, write, edit, bash                |
| `fixer`        | Fixes reviewer blockers               | read, write, edit, bash                |
| `submitter`    | Commits, pushes, creates PRs          | read, bash, grep, find, ls             |

### Invocation Pattern

`subagent` is intentionally **single-mode only**. Orchestration, sequencing, and review/fix loops happen in the main agent/workflow policy — not inside the tool.

```
subagent({
  agent: "<agent-name>",
  task: "<clear task description with context>",
  agentScope: "both"
})
```

Do not pass legacy `tasks` or `chain` parameters; they are rejected by the tool.

Runtime behavior:

- `subagent` starts one ephemeral worker in a Herdr-managed pane.
- The worker runs `pi --no-session` with the selected role prompt and role tool restrictions.
- The main agent remains the broker: it starts the worker, sends the task, waits for completion, parses the result, then decides the next workflow step.
- Successful worker panes close automatically.
- Failed, timed-out, or malformed-protocol worker panes stay open for debugging.
- Project-local agent confirmation remains required when configured.
- Worker final output is returned through the tool's required JSON protocol; role-specific Markdown reports should be placed in the JSON `output` field.

---

## Phase 1 — Design & Grilling

1. Run **`skill:grill-me`** to stress-test the idea with the user.
2. When grilling is complete → **do NOT start implementing yet.**
3. Produce a PRD using **`skill:to-prd`**.

### Task Breakdown

After the PRD is written:

- **Ask the user:** _"Should I create GitHub issues in the repo, or inline TODOs in the markdown?"_
  - **GitHub issues** → use **`skill:to-issues`**
  - **Inline TODOs** → add `<!-- TODO: ... -->` blocks in the PRD

### Optional: Planning Phase

If the task is complex, delegate planning to the planner agent:

```
subagent({
  agent: "planner",
  task: "Create an implementation plan from this PRD: [include PRD content or path]",
  agentScope: "both"
})
```

---

## Phase 2 — Implementation (Per Task Loop)

Before the FIRST task:

- **Ask the user:** _"Should all tasks run in this main agent, or should I spawn separate agents per task?"_
  - **Main agent mode** — execute tasks sequentially in this session using TDD directly.
  - **Spawned agents mode** — delegate each task to a subagent (see below).

### Task Loop — Repeat for Each Task

Each task follows this exact sequence. **Every task must be committed and merged before the next task begins.**

```
┌─ Task N  ──────────────────────────────────────────────────┐
│                                                            │
│  1. developer  → implement on feature/<task-name> branch   │
│       ↓                                                    │
│  2. reviewer   → review changes                            │
│       ↓                                                    │
│  PASS? ───→ 3. submitter → commit + push + create PR       │
│       ↓                        ↓                           │
│  FAIL? ──→ fixer → reviewer (loop, max 3 cycles)           │
│       ↓                                                    │
│  4. [User merges PR to main]                               │
│       ↓                                                    │
│  5. [Next task starts on latest main]                      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

#### Step 1: Developer

```
subagent({
  agent: "developer",
  task: "Implement [task description] using TDD on feature/<task-name> branch. PRD context: [summary]",
  agentScope: "both"
})
```

#### Step 2: Reviewer

```
subagent({
  agent: "reviewer",
  task: "Review changes on feature/<task-name>. Check against PRD: [summary]. Return findings in your final report; if write access is explicitly granted in the role, also persist them to reviews/<timestamp>-review.md",
  agentScope: "both"
})
```

#### Step 2b: Fixer (if FAIL)

```
subagent({
  agent: "fixer",
  task: "Fix these blockers from the review: [include reviewer output]",
  agentScope: "both"
})
```

→ After Fixer completes → go back to **Step 2** (spawn new Reviewer).

**Loop rules:**

- Maximum **3 Review → Fix cycles**. After 3 cycles, escalate to the user.
- Only when Reviewer returns **PASS (zero blockers)** → proceed to Step 3.

#### Step 3: Submitter

```
subagent({
  agent: "submitter",
  task: "Commit changes, push to feature/<task-name>, and create a PR to main. PRD reference: [summary]",
  agentScope: "both"
})
```

#### Step 4: Merge to Main

**The Submitter creates the PR. The user merges it to main.**

After the user confirms the PR is merged → **next task starts on latest main.**

> **Why this matters:** Each task builds on the previous task's merged code. Skipping the merge step means the next task works on stale code and will cause conflicts.

### TDD Rule

Every implementation follows **Test-Driven Development**:

- Use **`skill:tdd`** for all feature work (main agent mode).
- Developer agent always uses TDD (enforced in its system prompt).
- Red → Green → Refactor. No exceptions.
- If no test infrastructure exists, scaffold it first.

---

## Blocker vs Nit

| Severity    | Definition                                                        | Action                         |
| ----------- | ----------------------------------------------------------------- | ------------------------------ |
| **Blocker** | Code incorrect, tests fail, spec mismatch, missing error handling | Must be fixed before sign-off  |
| **Nit**     | Style preference, minor naming, cosmetic                          | Document in review, no re-work |

---

## Workflow Summary

```
USER: "I want to build X"
  ↓
[Auto-start]
  ↓
grill-me → to-prd → ask: issues or todos? → to-issues (if yes)
  ↓
ask: main agent or spawned agents?
  ↓
FOR EACH TASK:
  developer (TDD) → reviewer → (fixer → reviewer)* → submitter → [merge to main]
  ↓
ALL TASKS DONE
```

---

## Git Workflow

- Each task works on **`feature/<task-name>`** branch.
- Review Gate happens on the feature branch.
- Submitter creates PR to `main`.
- User merges PR → next task starts on latest `main`.
- Never skip the merge step between tasks.

---

## Notes

- Subagents are discovered from `.pi/agents/*.md` — edit those files to modify agent behavior.
- The `subagent` tool handles Herdr pane lifecycle, prompt delivery, output capture, and result parsing automatically.
- Never skip the Review gate.
- Review output should be preserved in the tool result; persist it in `reviews/` only when the active reviewer role has write access.
- **Every task ends with a merged PR** — this ensures each task builds on verified, merged code.
