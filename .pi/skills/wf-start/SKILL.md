---
name: wf-start
description: Initialize the wf workflow for a PRD — detect git host, create .workflow/state.yaml
---

Run the workflow initializer. Pass the PRD path through.

```bash
bash scripts/wf.sh init "$@"
```

After init completes successfully, remind the user:

> Register tasks with `wf task add "<title>"` (auto-creates a GitHub issue, GitLab issue, or a local file under `docs/tasks/` depending on the detected remote). Then run `wf next` to start work.

If init fails (host CLI not ready, PRD missing, etc.), surface the error verbatim — do NOT retry blindly.
