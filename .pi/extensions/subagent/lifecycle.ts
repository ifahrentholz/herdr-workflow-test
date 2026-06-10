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

export function extractPaneRef(startOutput: string, fallback: string): string {
	const trimmed = startOutput.trim();
	const uuid = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}/)?.[0];
	if (uuid) return uuid;
	const terminalId = trimmed.match(/(?:pane|terminal|id)[:=]\s*([A-Za-z0-9_.:-]+)/i)?.[1];
	if (terminalId) return terminalId;
	const firstLine = trimmed.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
	return firstLine ?? fallback;
}
