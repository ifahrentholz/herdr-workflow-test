---
name: wf-resume
description: Show where the workflow left off and suggest the next action
---

Print the resume hint and current state:

```bash
bash scripts/wf.sh resume
```

After printing, ask the user whether to continue (`wf next`) or pause. Do not auto-continue — resume is a deliberate user decision.
