# Workflow & Subagent-Tool — Improvement Backlog

Survey-Ergebnis vom 2026-06-10. Gruppiert nach Schweregrad. Quellen:
`AGENTS.md`, `.pi/agents/*.md`, `.pi/extensions/subagent/*.ts`.

**Fortschritt:** Batch 1 abgeschlossen (2026-06-10) — A1, A4, A8, A10, B11, B13, C24, E34, E35. Tests 48/48 grün.

---

## A. Bugs / echte Risiken

- [x] **A1 — `startedAt` wird bei jedem `emit()` zurückgesetzt.** *(erledigt 2026-06-10)*
  `index.ts:128-130` (`makeDetails`) setzt `startedAt: Date.now()` jedes Mal
  neu. Lifecycle-Updates zeigen damit nie den echten Startzeitpunkt.
  → einmalig am Anfang von `runHerdrAgent` setzen und in `detailsBase`
  durchreichen.

- [ ] **A2 — `blocked`-Erkennung erst nach 30-s-Wait.**
  Wenn der Worker während `herdr wait agent-status --status done` in
  `blocked` rutscht, merken wir das erst nach Wait-Timeout. Akzeptabel, aber
  ein paralleler `--status blocked`-Wait würde sofort reagieren.
  Datei: `index.ts:200-225`.

- [ ] **A3 — `AbortSignal` propagiert nicht in `herdr`-Subprozesse.**
  `signal?.aborted` wird nur am Loop-Anfang geprüft; während eines blockenden
  `herdr wait` (bis 30 s) ist kein Abbruch möglich.
  → Signal an `execFile` weitergeben.

- [x] **A4 — `paneRef` fällt im Worst Case auf den `runName`-String zurück.** *(erledigt 2026-06-10)*
  `extractPaneRef` gibt jetzt `string | null` zurück und greift nur noch auf
  positive `pane_id`-Matches zu. `runHerdrAgent` wirft hart, wenn der Start
  keine pane_id liefert. Test ergänzt.

- [ ] **A5 — `getPaneCount` ist nicht workspace-gescopt.**
  `index.ts:160-166` ruft `buildPaneListArgs()` ohne Workspace. Bei mehreren
  Workspaces falsche Split-Entscheidung.
  → vorher aktiven Workspace via `herdr workspace list` ermitteln, dann
  `pane list --workspace <id>`.

- [ ] **A6 — Worker-System-Prompt und Tool-Envelope-Prompt widersprechen sich.**
  z.B. `developer.md` sagt "Output format: ## Completed / ## Files Changed",
  `buildWorkerPrompt` sagt "final non-empty content MUST be one JSON object".
  Worker müssen raten. `findValidPayload` ist tolerant, aber sauberer wäre,
  in den Rollen-Prompts explizit zu sagen: "wrap your Markdown report in the
  `output:` field of the JSON envelope".
  Dateien: `.pi/agents/*.md`, `protocol.ts:buildWorkerPrompt`.

- [ ] **A7 — `agentScope`-Default-Mismatch.**
  Tool-Default in `SubagentParams` ist `"user"`, AGENTS.md verlangt überall
  `agentScope: "both"`. Vergisst der Orchestrator das, sind Projektagenten
  unsichtbar.
  → Default auf `"both"` umstellen oder per `.pi`-Config überschreibbar
  machen.

- [x] **A8 — `pi`-Integrationsversion wird nicht geprüft.** *(erledigt 2026-06-10)*
  `assertHerdrRuntime` ruft jetzt zusätzlich `herdr integration status`,
  parsed die `pi:`-Zeile und wirft bei `not-installed`/`unknown` mit
  actionable Hinweis (`herdr integration install pi`). `outdated` läuft
  durch, weil noch lauffähig — könnte später noch via `onUpdate` als
  Warnung erscheinen.

- [ ] **A9 — `withFileMutationQueue` für frisches Tmp-File ist Overkill.**
  `writePromptToTempFile` nutzt die Mutation-Queue für ein eindeutig
  benanntes Tmp-File ohne Contention. Unnötige Komplexität.
  → direktes `fs.promises.writeFile`.

- [x] **A10 — `closeWorkerPane` schluckt alle Fehler als "kept-open".** *(erledigt 2026-06-10)*
  Differenziert jetzt per Regex auf der Fehlermeldung: `not[ _-]found`,
  `does[ _-]not[ _-]exist`, `no such`, `unknown pane`, `already closed` →
  als `"closed"` behandelt (Ziel erreicht). Alles andere bleibt
  `"kept-open"`.

---

## B. AGENTS.md (Workflow-Definition)

- [x] **B11 — Failure-Recovery-Sektion ist veraltet.** *(erledigt 2026-06-10)*
  Komplett neu geschrieben: drei Failure-Modi (timeout / blocked /
  worker-error) mit jeweils konkretem Handling. Hinweis ergänzt, dass der
  legacy `<<<SUBAGENT_DONE>>>`-Token optional ist und die "Final-Protocol
  Reminder"-Snippets nicht mehr in Task-Strings müssen.

- [ ] **B12 — Auto-Start ist zu aggressiv.**
  "Jede Feature-Idee triggert grill-me + PRD + tasks". Trivialfälle
  (Tippfehler, Doku-Update, Rename) sollten direkt zum Developer gehen. Die
  "Exception: einfache Frage" ist zu vage.
  → Fast-Path für triviale Aufgaben definieren.

- [x] **B13 — Doppelte Commits.** *(erledigt 2026-06-10)*
  AGENTS.md hat jetzt eine "Commit Authority"-Sektion: Submitter ist der
  alleinige Commit-Owner. `developer.md`, `fixer.md`, `tester.md` enthalten
  jeweils einen "Do NOT create git commits"-Punkt in den Rules.

- [ ] **B14 — Review/Fix-Loop ohne Eskalationsweg.**
  Max 3 Zyklen, dann "escalate to user". Was heißt das konkret? Zurück zu
  Phase 1? Task abbrechen? Fehlt.

- [ ] **B15 — Kein definiertes Verhalten bei `status: "error"` oder Timeout.**
  Was tut der Orchestrator, wenn ein Subagent error returnt? Retry? Skip?
  Abbruch?
  → Reaktionsmatrix in AGENTS.md ergänzen.

- [ ] **B16 — `orchestrator`-Subagent vs. Main-Agent-als-Orchestrator.**
  `.pi/agents/orchestrator.md` definiert einen Orchestrator-Agenten, aber
  AGENTS.md beschreibt den Main-Agenten als Orchestrator. Aktuell wird
  `orchestrator` nirgends im Workflow gerufen.
  → entweder löschen oder klar in den Workflow integrieren.

- [ ] **B17 — Phase-Skip nicht möglich.**
  Für klare Aufgabentypen ("add a unit test", "rename a function") braucht
  es kein grill-me + PRD. Workflow sollte einen Fast-Path haben.

- [ ] **B18 — User-Fragen sollten Config-Defaults sein.**
  "GitHub issues vs. inline TODOs", "Main agent vs. spawned agents" — pro
  Projekt einmal entscheiden, in `.pi/workflow.toml` o.ä. ablegen, nicht
  jeden Run fragen.

---

## C. Agent-Rollen (`.pi/agents/*.md`)

- [ ] **C19 — Kein Modell-Override pro Rolle.**
  Keine Rolle setzt `model:` im Frontmatter. Planner/Reviewer profitieren
  von stärkerem Reasoning-Modell, Submitter (nur git) reicht ein
  günstigeres.

- [x] **C20 — Reviewer "bash read-only" nur per Prompt durchgesetzt.** *(verstanden, vorerst zurückgestellt)*
  Tool-Whitelist `bash` ist voll offen. Prompt-Anweisung allein hält keinen
  prompt-injected oder kreativen LLM auf. Empfohlene Lösung:
  Reviewer-Worker in detached `git worktree` mit `chmod -R a-w` starten →
  OS-erzwungene Schreibsperre.
  Datei: `.pi/agents/reviewer.md`, `lifecycle.ts:buildWorkerStartArgs`.

- [ ] **C21 — Tool-Listen enthalten potenziell Nicht-Tools.**
  `grep, find, ls` werden als kommagetrennte Tools an `pi --tools` übergeben.
  Falls Pi diese nicht als eigene Tools kennt, werden sie ignoriert. Bash
  deckt sie ohnehin ab.
  → klären, welche Strings pi tatsächlich versteht; Redundanz entfernen.

- [ ] **C22 — Orchestrator hat write/edit/bash.**
  Als reiner Koordinator sollte er nur das `subagent`-Tool bekommen.
  Reduziert Foot-Gun-Risiko.

- [ ] **C23 — Keine Branch-Enforcement im `developer.md`.**
  Prompt sagt "feature/<task-name>-Branch", aber nichts zwingt den Agenten,
  sich darauf zu bewegen.
  → erste Bash-Action soll `git checkout -b feature/...` sein.

- [x] **C24 — Keine Rolle erklärt das JSON-Envelope.** *(erledigt 2026-06-10)*
  Alle 7 Rollen (developer, reviewer, fixer, tester, planner, submitter,
  orchestrator) haben jetzt eine "Subagent JSON envelope (mandatory)"-Sektion
  mit konkretem Schema-Beispiel und Hinweis, den Markdown-Report ins
  `output`-Feld zu setzen.

- [ ] **C25 — Keine `filesChanged`/`tests`-Felder im Rollen-Output.**
  Protokoll erwartet sie strukturiert, die Rollen-Prompts liefern sie als
  Markdown-Liste.
  → entweder Rollen anpassen oder Protokoll vereinfachen.

---

## D. Verbesserungen ohne harten Fix-Bedarf

- [ ] **D26 — Kein Per-Task-Timeout-Override.**
  `DEFAULT_TIMEOUT_MS = 20 min` hart codiert. SubagentParams sollte
  optionales `timeoutMs` annehmen.

- [ ] **D27 — Kein Streaming des Worker-Outputs.**
  User sieht 20 min "Waiting...". Tail von `agent read` alle 30 s mitliefern.

- [ ] **D28 — Worktree-Isolation fehlt.**
  Sequential lock schützt vor Race, aber jeder Run im selben Workdir. Bei
  abgebrochenen Runs bleibt der Tree dirty.
  → optionaler `git worktree`-Modus (s. auch C20).

- [ ] **D29 — Keine strukturierte Fehler-Kategorisierung.**
  `status: "error"` ist Freitext. Orchestrator kann nicht differenziert
  reagieren.
  → Enum: `timeout | blocked | exec-fail | worker-reported-error |
  parse-fail`.

- [ ] **D30 — `SUBAGENT_DONE_TOKEN` ist toter Code.**
  Im Prompt noch als "MAY" erwähnt, nirgends geparst.
  → entweder raus oder als Fallback-Signal reanimieren (z.B. wenn
  `agent_status` nie aus `working` rauskommt).

- [ ] **D31 — Kein Test für `index.ts`-Orchestrierung.**
  Alle Tests decken Helfer ab, End-to-End-Logik ist ungetestet.
  → mit `execFile`-Stub machbar.

- [ ] **D32 — `readWorkerOutput` liest nur letzte 2000 Zeilen.**
  Bei langen Sessions könnte das finale JSON außerhalb des Fensters liegen.
  → konfigurierbar oder bei Parse-Fail mit größerem Buffer retryen.

- [ ] **D33 — Projektagent-Confirmation nur mit UI.**
  Headless/CI-Runs führen Projektagenten ohne Rückfrage aus.
  → mind. via Env-Var/Config opt-out-bar machen.

---

## E. Repo-Hygiene

- [x] **E34 — Uncommitted Artefakte aus Test-Runs.** *(erledigt 2026-06-10)*
  `hello_world.html`, `hello_world.js`, `tests/` aus dem Workdir entfernt.
  Werden mit dem nächsten Commit aus dem Index gelöscht.

- [x] **E35 — `.DS_Store`-Files unter `.pi/` und `.pi/extensions/`.** *(erledigt 2026-06-10)*
  `.gitignore` neu angelegt mit `.DS_Store`, `*.log`, `.vscode/`, `.idea/`,
  `node_modules/`. Vorhandene `.DS_Store`-Files waren nicht im Index, daher
  kein Untracking nötig.

- [ ] **E36 — Keine TROUBLESHOOTING.md.**
  Was tun, wenn herdr server down, pi-Integration fehlt, worker hängt, pane
  manuell geschlossen.
  → kurzer Leitfaden würde User-Support sparen.

---

## Empfohlene Reihenfolge

**Quick wins (high value, low risk):** ✅ alle abgeschlossen.
A1, A4, A8, A10, B11, B13, C24, E34, E35.

**Strukturelle Verbesserungen (mittel) — nächster Batch-Kandidat:**
A3 (Signal-Propagation), A5 (Workspace-Scoping für pane count),
B12 (Auto-Start nicht für Trivialfälle), B17 (Phase-Skip),
C19 (Modell-Override pro Rolle), D26 (Per-Task-Timeout),
D29 (Error-Kategorisierung).

**Größere Refactors (Designentscheidung gewünscht):**
B16 (Orchestrator-Rolle vs. Main-Agent), C20 (Reviewer read-only Worktree),
D28 (Worktree-Modus für Isolation).
