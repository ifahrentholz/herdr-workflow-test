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

function formatList(title: string, items: string[]): string {
	return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function formatSubagentPayload(payload: SubagentProtocolPayload): string {
	const parts = [`${payload.status.toUpperCase()}: ${payload.summary}`];
	if (payload.output) parts.push(`Output:\n${payload.output}`);
	if (payload.error) parts.push(`Error:\n${payload.error}`);
	if (payload.filesChanged?.length) parts.push(formatList("Files changed", payload.filesChanged));
	if (payload.tests?.length) parts.push(formatList("Tests", payload.tests));
	if (payload.notes) parts.push(`Notes:\n${payload.notes}`);
	return parts.join("\n\n");
}
