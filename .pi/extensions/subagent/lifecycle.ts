export interface WorkerStartOptions {
	runName: string;
	cwd: string;
	piArgs: string[];
	split?: "right" | "down";
	focus?: boolean;
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
