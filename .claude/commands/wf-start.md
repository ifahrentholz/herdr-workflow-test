---
description: Initialize the wf workflow from a PRD (detects git host, creates state.yaml)
---

Run `bash scripts/wf.sh init $ARGUMENTS` and report what happened. The script handles host detection (GitHub / GitLab SaaS / GitLab self-hosted / none), auth checks, and state-file creation.

If init succeeds, tell the user to register tasks with `/wf-task add "<title>"`, then `/wf-next` to start working.

If init fails, surface the error message verbatim. Do not retry without addressing the cause.
