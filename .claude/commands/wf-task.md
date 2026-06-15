---
description: Manage tasks (add/list/select) — auto-creates issue or local file
---

Run `bash scripts/wf.sh task $ARGUMENTS`. Subcommands:

- `add "<title>" [--slug <slug>]` — register a task; auto-creates a GitHub/GitLab issue or `docs/tasks/<id>-<slug>.md` depending on detected host.
- `list` — show all tasks.
- `select <id>` — change current_task pointer.
