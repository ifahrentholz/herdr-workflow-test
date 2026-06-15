---
name: wf-doctor
description: Run preflight checks for the wf workflow (CLIs present, git host auth, agent files)
---

Run the workflow diagnostics:

```bash
bash scripts/wf.sh doctor
```

Surface every failing check verbatim and suggest the concrete fix (install missing CLI, run `gh auth login` / `glab auth login`, restore a deleted agent role file, etc.).
