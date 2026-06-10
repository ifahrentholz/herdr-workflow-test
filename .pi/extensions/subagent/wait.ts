export const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
export const POLL_INTERVAL_MS = 3_000;
export const PROGRESS_INTERVAL_MS = 30_000;
export const READ_LINES = 2_000;
export const READ_SOURCE = "recent-unwrapped";

export type CleanupPolicy = "closed" | "kept-open" | "not-started";

export function buildAgentReadArgs(target: string, lines = READ_LINES): string[] {
	return ["agent", "read", target, "--source", READ_SOURCE, "--lines", String(lines)];
}

export function buildPaneReadArgs(paneRef: string, lines = READ_LINES): string[] {
	return ["pane", "read", paneRef, "--source", READ_SOURCE, "--lines", String(lines)];
}

export function buildPaneCloseArgs(paneRef: string): string[] {
	return ["pane", "close", paneRef];
}

export function shouldEmitProgress(now: number, nextProgressAt: number): boolean {
	return now >= nextProgressAt;
}

export function makeTimeoutError(timeoutMs = DEFAULT_TIMEOUT_MS, token: string): Error {
	return new Error(`Timed out after ${Math.round(timeoutMs / 60_000)} minutes waiting for ${token}`);
}
