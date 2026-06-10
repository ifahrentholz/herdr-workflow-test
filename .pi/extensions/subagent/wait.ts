export const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
export const POLL_INTERVAL_MS = 3_000;
export const PROGRESS_INTERVAL_MS = 30_000;
export const WAIT_CHUNK_MS = 30_000;
export const READ_LINES = 2_000;
export const READ_SOURCE = "recent-unwrapped";

export type CleanupPolicy = "closed" | "kept-open" | "not-started";

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export const TERMINAL_AGENT_STATUSES: ReadonlySet<AgentStatus> = new Set<AgentStatus>(["done", "idle"]);

export function buildAgentReadArgs(target: string, lines = READ_LINES): string[] {
	return ["agent", "read", target, "--source", READ_SOURCE, "--lines", String(lines)];
}

export function buildPaneReadArgs(paneRef: string, lines = READ_LINES): string[] {
	return ["pane", "read", paneRef, "--source", READ_SOURCE, "--lines", String(lines)];
}

export function buildPaneCloseArgs(paneRef: string): string[] {
	return ["pane", "close", paneRef];
}

export function buildPaneGetArgs(paneRef: string): string[] {
	return ["pane", "get", paneRef];
}

export function buildPaneListArgs(workspaceId?: string): string[] {
	return workspaceId ? ["pane", "list", "--workspace", workspaceId] : ["pane", "list"];
}

export function buildWorkspaceListArgs(): string[] {
	return ["workspace", "list"];
}

export interface ActiveWorkspaceInfo {
	workspaceId: string;
	paneCount: number;
}

/**
 * Identify the currently focused Herdr workspace and its pane count.
 *
 * `herdr workspace list` is one CLI roundtrip and gives us both the
 * workspace id (for downstream scoping) and the `pane_count` field directly
 * on the workspace object — no second `pane list` call needed.
 */
export function parseActiveWorkspace(workspaceListStdout: string): ActiveWorkspaceInfo | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(workspaceListStdout);
	} catch {
		return null;
	}
	const workspaces = (parsed as { result?: { workspaces?: unknown[] } })?.result?.workspaces;
	if (!Array.isArray(workspaces) || workspaces.length === 0) return null;

	const focused = workspaces.find((w): w is Record<string, unknown> => {
		return typeof w === "object" && w !== null && (w as Record<string, unknown>).focused === true;
	}) ?? (workspaces[0] as Record<string, unknown>);

	const id = focused?.workspace_id;
	const count = focused?.pane_count;
	if (typeof id !== "string" || typeof count !== "number") return null;
	return { workspaceId: id, paneCount: count };
}

export function buildWaitAgentStatusArgs(target: string, status: AgentStatus, timeoutMs: number): string[] {
	return ["wait", "agent-status", target, "--status", status, "--timeout", String(timeoutMs)];
}

export function parseAgentStatus(paneGetStdout: string): AgentStatus | null {
	try {
		const parsed = JSON.parse(paneGetStdout);
		const status = parsed?.result?.pane?.agent_status;
		if (status === "idle" || status === "working" || status === "blocked" || status === "done" || status === "unknown") {
			return status;
		}
		return null;
	} catch {
		return null;
	}
}

export function parsePaneCount(paneListStdout: string): number | null {
	try {
		const parsed = JSON.parse(paneListStdout);
		const panes = parsed?.result?.panes;
		return Array.isArray(panes) ? panes.length : null;
	} catch {
		return null;
	}
}

export function shouldEmitProgress(now: number, nextProgressAt: number): boolean {
	return now >= nextProgressAt;
}

export function makeTimeoutError(timeoutMs: number, waitedFor: string): Error {
	return new Error(`Timed out after ${Math.round(timeoutMs / 60_000)} minutes waiting for ${waitedFor}`);
}
