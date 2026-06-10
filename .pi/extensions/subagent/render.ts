import type { SubagentLifecycleState } from "./protocol.ts";

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
