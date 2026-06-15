# AGENTS.md — Workflow Rules

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

All agents are defined in `.pi/agents/*.md` and invoked via the **`subagent`** tool. `agentScope` defaults to `"both"` — project-local agents shadow same-named user agents automatically; you don't need to pass it explicitly.

Agent runtime settings come from each agent file's YAML frontmatter:

```yaml
model: openai-codex/gpt-5.5
thinking: high
```

The subagent runner passes these through to Pi as `--model <model>` and `--thinking <level>`.

| Agent          | Role                                                                                              | Tools                   | Model                        | Thinking |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------- | -------- |
| `orchestrator` | Coordinates workflow, delegates tasks                                                             | read, subagent          | `openai-codex/gpt-5.4-mini` | medium   |
| `planner`      | Creates implementation plans from PRD                                                             | read, bash              | `openai-codex/gpt-5.5`      | high     |
| `developer`    | Implements features via TDD                                                                       | read, write, edit, bash | `openai-codex/gpt-5.5`      | medium   |
| `reviewer`     | Code review — finds blockers (bash is read-only by prompt; tool-level sandbox tracked separately) | read, bash              | `openai-codex/gpt-5.5`      | high     |
| `tester`       | Writes and runs tests                                                                             | read, write, edit, bash | `openai-codex/gpt-5.5`      | medium   |
| `fixer`        | Fixes reviewer blockers                                                                           | read, write, edit, bash | `openai-codex/gpt-5.5`      | high     |
| `submitter`    | Commits, pushes, creates PRs                                                                      | read, bash              | `openai-codex/gpt-5.4-mini` | medium   |

### Invocation Pattern

`subagent` is intentionally **single-mode only**. Orchestration, sequencing, and review/fix loops happen in the main agent/workflow policy — not inside the tool.

```
subagent({
  agent: "<agent-name>",
  task: "<clear task description with context>",
})
```

Optional parameters:

- `agentScope: "user" | "project" | "both"` — default `"both"`. Use `"user"` to deliberately bypass project agents.
- `timeoutMs: number` — default 1 200 000 (20 min); clamped to `[10000, 3600000]`.
- `confirmProjectAgents: boolean` — default `true`. In headless runs (no UI), project agents require either this flag set to `false` OR the environment variable `PI_SUBAGENT_TRUST_PROJECT_AGENTS=1`.

Do not pass legacy `tasks` or `chain` parameters; they are rejected by the tool.

Runtime behavior:

- `subagent` starts one ephemeral worker in a Herdr-managed pane.
- The worker runs `pi --no-session` with the selected role prompt, role tool restrictions, configured model, and configured thinking level.
- The main agent remains the broker: it starts the worker, sends the task, waits for the worker's `agent_status` (reported by the Herdr pi integration) to reach a terminal state (`done` / `idle`), parses the result, then decides the next workflow step.
- Completion detection is **event-driven via `agent_status`**, not via text scraping. Workers no longer need to emit a sentinel token — they just finish their turn cleanly.
- Workers must still emit a final JSON object describing the outcome (see "Subagent JSON envelope" in each role prompt). Their Markdown report goes inside that object's `output` field.
- Successful worker panes close automatically.
- Failed, timed-out, or `blocked` worker panes stay open for debugging.
- Project-local agent confirmation remains required when configured.

### Commit Authority

**The submitter agent is the only role that creates git commits, pushes, or opens PRs.**

- Developer / fixer / tester leave changes in the working tree (staged or unstaged). They do not run `git commit`, `git push`, or `git tag`.
- The submitter receives the working-tree state, commits it on the feature branch, pushes, and opens the PR.
- This keeps the merge boundary explicit: one commit per task, one PR per task, attribution clear.

### Subagent Failure Recovery

A failed `subagent` tool call can mean one of three things — handle each differently rather than blindly retrying:

1. **`agent_status` never reached `done`/`idle` (timeout, 20 min default).**
   The worker is still alive in its pane. Do NOT spawn a replacement. Instead:
   - `herdr agent read <runName>` to see what it did.
   - `herdr agent attach <runName>` to inspect interactively, or `herdr pane run <paneRef> "..."` to nudge it.
   - If the work is actually complete, the missing signal is a Herdr pi-integration issue (run `herdr integration status` and verify `pi: current`).
   - If the work is incomplete, decide whether to nudge it forward or close the pane and start fresh.

2. **`agent_status` reached `blocked`.**
   The worker is waiting for user input the tool cannot provide. Read the pane to see what it asked, then either:
   - send a reply via `herdr pane run <paneRef> "<answer>"` and let the worker finish, or
   - close the pane and re-spawn with a clearer task that doesn't trigger the prompt.

3. **Worker emitted `status: "error"` in its final JSON.**
   The worker considers the task failed for a real reason. Read the `error` and `output` fields in the result. Do NOT auto-retry — surface it to the user or decide on a remediation (different agent, smaller scope, etc.).

The legacy `<<<SUBAGENT_DONE>>>` token is now optional and exists only for human-readable pane scrubbing. Do not include "final-protocol reminders" in task strings — the role system prompt already specifies the JSON envelope.

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
})
```

#### Step 2: Reviewer

```
subagent({
  agent: "reviewer",
  task: "Review changes on feature/<task-name>. Check against PRD: [summary]. Return findings in your final report; if write access is explicitly granted in the role, also persist them to reviews/<timestamp>-review.md",
})
```

#### Step 2b: Fixer (if FAIL)

```
subagent({
  agent: "fixer",
  task: "Fix these blockers from the review: [include reviewer output]",
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

- Subagents are discovered from `.pi/agents/*.md` — edit those files to modify agent behavior, model, or thinking level.
- The `subagent` tool handles Herdr pane lifecycle, prompt delivery, output capture, and result parsing automatically.
- Never skip the Review gate.
- Review output should be preserved in the tool result; persist it in `reviews/` only when the active reviewer role has write access.
- **Every task ends with a merged PR** — this ensures each task builds on verified, merged code.
