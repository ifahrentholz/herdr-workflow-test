export type SplitDirection = "right" | "down";

export interface WorkerStartOptions {
	runName: string;
	cwd: string;
	piArgs: string[];
	split?: SplitDirection;
	focus?: boolean;
}

export const MIN_WIDTH_AFTER_RIGHT_SPLIT = 80;
export const MIN_HEIGHT_AFTER_DOWN_SPLIT = 20;

export interface SplitDecisionInput {
	paneCount: number;
	columns?: number;
	rows?: number;
}

/**
 * Pick `right` (vertical split, side-by-side) vs `down` (horizontal split, stacked).
 *
 * Heuristic:
 * - If we have terminal geometry, estimate the focused pane's current size
 *   (assuming previous splits were `right` — the historical default), and
 *   prefer the direction that keeps both resulting halves above a usable size.
 * - Without geometry, fall back to a pane-count heuristic: once panes start to
 *   pile up, switch to `down` to avoid making everything too narrow.
 */
export function chooseSplitDirection(input: SplitDecisionInput): SplitDirection {
	const paneCount = Math.max(input.paneCount, 1);

	if (input.columns == null || input.rows == null || input.columns <= 0 || input.rows <= 0) {
		return paneCount >= 3 ? "down" : "right";
	}

	const focusedWidth = input.columns / paneCount;
	const focusedHeight = input.rows;
	const widthAfterRight = focusedWidth / 2;
	const heightAfterDown = focusedHeight / 2;

	if (widthAfterRight >= MIN_WIDTH_AFTER_RIGHT_SPLIT) return "right";
	if (heightAfterDown >= MIN_HEIGHT_AFTER_DOWN_SPLIT) return "down";
	return widthAfterRight >= heightAfterDown * 3 ? "right" : "down";
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function makePiCommand(args: string[]): string {
	return ["pi", ...args.map(shellQuote)].join(" ");
}

export function buildWorkerStartArgs(options: WorkerStartOptions): string[] {
	return [
		"agent",
		"start",
		options.runName,
		"--cwd",
		options.cwd,
		"--split",
		options.split ?? "right",
		options.focus ? "--focus" : "--no-focus",
		"--",
		"bash",
		"-lc",
		makePiCommand(options.piArgs),
	];
}

export function getHerdrRuntimeError(error: unknown): string {
	return `Herdr runtime is required for subagent execution. Start/attach Herdr first. (${error instanceof Error ? error.message : String(error)})`;
}

export type PiIntegrationState = "current" | "outdated" | "not-installed" | "unknown";

export interface PiIntegrationStatus {
	state: PiIntegrationState;
	rawLine: string;
}

/**
 * Parse the output of `herdr integration status` for the `pi:` line.
 *
 * The integration is what sets `agent_status` on the worker pane. Without it,
 * waitForCompletion has no signal to fire on and will run the full timeout —
 * so we fail fast at spawn time with an actionable message.
 *
 * Expected line shapes (from herdr 0.6.x):
 *   "pi: current (v2) (/path/to/extension)"
 *   "pi: outdated (v1, latest v2) (/path)"
 *   "pi: not installed (/path)"
 */
export function parsePiIntegrationStatus(stdout: string): PiIntegrationStatus {
	for (const rawLine of stdout.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line.startsWith("pi:")) continue;
		const body = line.slice(3).trim().toLowerCase();
		if (body.startsWith("current")) return { state: "current", rawLine: line };
		if (body.startsWith("outdated")) return { state: "outdated", rawLine: line };
		if (body.startsWith("not installed") || body.startsWith("not-installed")) {
			return { state: "not-installed", rawLine: line };
		}
		return { state: "unknown", rawLine: line };
	}
	return { state: "unknown", rawLine: "" };
}

export function getPiIntegrationRequirementError(status: PiIntegrationStatus): string {
	if (status.state === "not-installed") {
		return [
			"Herdr pi integration is not installed.",
			"The subagent tool relies on it to report worker agent_status; without it, every run will time out.",
			"Install with: herdr integration install pi",
		].join(" ");
	}
	if (status.state === "outdated") {
		return [
			"Herdr pi integration is outdated.",
			"agent_status reporting may be unreliable on older versions.",
			"Update with: herdr integration install pi",
			`(detected: ${status.rawLine})`,
		].join(" ");
	}
	return `Herdr pi integration check returned an unrecognized status: ${status.rawLine || "no pi line found in output"}`;
}

function getStringAt(value: unknown, path: string[]): string | null {
	let current: unknown = value;
	for (const key of path) {
		if (!current || typeof current !== "object" || !(key in current)) return null;
		current = (current as Record<string, unknown>)[key];
	}
	return typeof current === "string" && current.trim() ? current : null;
}

function parsePaneRefFromJsonLine(line: string): string | null {
	try {
		const parsed: unknown = JSON.parse(line);
		return (
			getStringAt(parsed, ["result", "agent", "pane_id"]) ??
			getStringAt(parsed, ["agent", "pane_id"]) ??
			getStringAt(parsed, ["result", "pane_id"]) ??
			getStringAt(parsed, ["pane_id"])
		);
	} catch {
		return null;
	}
}

/**
 * Extract a Herdr pane id from `herdr agent start` JSON output.
 *
 * Only returns a value when we can positively identify a `pane_id` field in
 * the response (JSON-line shape or raw `"pane_id":"..."` substring). Earlier
 * versions fell back to "first non-empty line" / arbitrary UUID matches,
 * which silently produced bogus pane refs whenever the response format
 * shifted — every subsequent `pane get`/`pane close` then failed silently.
 */
export function extractPaneRef(startOutput: string): string | null {
	const trimmed = startOutput.trim();
	for (const line of trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
		const paneRef = parsePaneRefFromJsonLine(line);
		if (paneRef) return paneRef;
	}
	const paneId = trimmed.match(/"pane_id"\s*:\s*"([^"]+)"/)?.[1];
	if (paneId) return paneId;
	return null;
}

function parseWorkspaceIdFromJsonLine(line: string): string | null {
	try {
		const parsed: unknown = JSON.parse(line);
		return (
			getStringAt(parsed, ["result", "agent", "workspace_id"]) ??
			getStringAt(parsed, ["agent", "workspace_id"]) ??
			getStringAt(parsed, ["result", "workspace_id"]) ??
			getStringAt(parsed, ["workspace_id"])
		);
	} catch {
		return null;
	}
}

export function extractWorkspaceId(startOutput: string): string | null {
	const trimmed = startOutput.trim();
	for (const line of trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
		const id = parseWorkspaceIdFromJsonLine(line);
		if (id) return id;
	}
	return trimmed.match(/"workspace_id"\s*:\s*"([^"]+)"/)?.[1] ?? null;
}
