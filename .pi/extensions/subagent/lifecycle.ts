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

export function extractPaneRef(startOutput: string, fallback: string): string {
	const trimmed = startOutput.trim();
	for (const line of trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
		const paneRef = parsePaneRefFromJsonLine(line);
		if (paneRef) return paneRef;
	}
	const paneId = trimmed.match(/"pane_id"\s*:\s*"([^"]+)"/)?.[1];
	if (paneId) return paneId;
	const uuid = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}/)?.[0];
	if (uuid) return uuid;
	const terminalId = trimmed.match(/(?:pane|terminal|id)[:=]\s*([A-Za-z0-9_.:-]+)/i)?.[1];
	if (terminalId) return terminalId;
	const firstLine = trimmed.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
	return firstLine ?? fallback;
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
