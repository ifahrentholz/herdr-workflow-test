---
name: wf-task
description: Manage tasks — add/list/select. Auto-creates the issue or local file.
---

Pass-through to the script. Examples the user might want:

- `wf-task add "Render snake grid"` — creates GitHub/GitLab issue OR `docs/tasks/01-render-snake-grid.md`
- `wf-task list` — prints all tasks with status
- `wf-task select 3` — change current_task pointer

```bash
bash scripts/wf.sh task "$@"
```
