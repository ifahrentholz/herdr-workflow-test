import type { SubagentLifecycleState, SubagentProtocolPayload } from "./protocol.ts";

export interface LifecycleSummary {
	agent: string;
	state: SubagentLifecycleState;
	runName?: string;
	paneRef?: string;
	cleanup?: "closed" | "kept-open" | "not-started";
}

export function getLifecycleIcon(state: SubagentLifecycleState): "✓" | "✗" | "⏳" {
	if (state === "completed") return "✓";
	if (state === "failed") return "✗";
	return "⏳";
}

export function formatLifecycleSummary(summary: LifecycleSummary): string {
	let text = `${getLifecycleIcon(summary.state)} ${summary.agent} ${summary.state}`;
	if (summary.runName) text += ` (${summary.runName})`;
	if (summary.cleanup) text += ` cleanup:${summary.cleanup}`;
	if (summary.paneRef && summary.state !== "completed") text += ` pane:${summary.paneRef}`;
	return text;
}

function formatTableValue(value: unknown): string {
	const text = Array.isArray(value) ? value.join("<br>") : String(value);
	return text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

export function formatSubagentPayload(payload: SubagentProtocolPayload): string {
	const preferredOrder = ["status", "summary", "output", "filesChanged", "tests", "notes", "error"];
	const rows: Array<[string, unknown]> = [];
	const seen = new Set<string>();

	for (const key of preferredOrder) {
		const value = (payload as Record<string, unknown>)[key];
		if (value === undefined || (Array.isArray(value) && value.length === 0) || value === "") continue;
		rows.push([key, value]);
		seen.add(key);
	}

	for (const [key, value] of Object.entries(payload)) {
		if (seen.has(key) || value === undefined || (Array.isArray(value) && value.length === 0) || value === "") continue;
		rows.push([key, value]);
	}

	return ["| Field | Value |", "|---|---|", ...rows.map(([key, value]) => `| ${key} | ${formatTableValue(value)} |`)].join("\n");
}
