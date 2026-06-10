export const SUBAGENT_DONE_TOKEN = "<<<SUBAGENT_DONE>>>";

export type SubagentLifecycleState = "spawned" | "prompted" | "waiting" | "completed" | "failed";

export interface SubagentProtocolPayload {
	status: "success" | "error";
	summary: string;
	output?: string;
	filesChanged?: string[];
	tests?: string[];
	notes?: string;
	error?: string;
}

export interface ProtocolParseResult {
	payload: SubagentProtocolPayload;
	rawJson: string;
}

export interface SingleModeParams {
	agent?: string;
	task?: string;
	tasks?: unknown;
	chain?: unknown;
}

export function validateSingleModeParams(params: SingleModeParams): string | null {
	if (params.tasks !== undefined || params.chain !== undefined) {
		return "Legacy subagent parameters 'tasks' and 'chain' are no longer supported. Use a single invocation with { agent, task } and orchestrate sequencing in the main agent.";
	}
	if (!params.agent || !params.task) {
		return "Invalid subagent parameters. Provide required fields: { agent, task }.";
	}
	return null;
}

export function buildPiArgs(agent: { model?: string; tools?: string[] }, systemPromptPath?: string): string[] {
	const args = ["--no-session"];
	if (agent.model) args.push("--model", agent.model);
	if (agent.tools && agent.tools.length > 0) args.push("--tools", agent.tools.join(","));
	if (systemPromptPath) args.push("--append-system-prompt", systemPromptPath);
	return args;
}

export function buildWorkerPrompt(agentName: string, task: string): string {
	return [
		`You are running as subagent '${agentName}' in an ephemeral Herdr-managed pane.`,
		"Complete the delegated task and then finish with the required machine-readable protocol.",
		"",
		"Delegated task:",
		task,
		"",
		"Required final response protocol:",
		"1. Your final non-empty content before the completion token MUST be one JSON object.",
		"2. The JSON object MUST match this schema:",
		'{ "status": "success" | "error", "summary": string, "output"?: string, "filesChanged"?: string[], "tests"?: string[], "notes"?: string, "error"?: string }',
		`3. The line immediately after the JSON object MUST be exactly: ${SUBAGENT_DONE_TOKEN}`,
		"4. Do not put the final JSON in a markdown code fence.",
	].join("\n");
}

export function extractLastJsonObject(text: string): string | null {
	let end = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = text.length - 1; i >= 0; i--) {
		const ch = text[i];

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}

		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === "}") {
			if (end === -1) end = i;
			depth++;
			continue;
		}
		if (ch === "{") {
			depth--;
			if (depth === 0 && end !== -1) return text.slice(i, end + 1);
		}
	}
	return null;
}

export function parseSubagentCompletion(output: string): ProtocolParseResult {
	const tokenIndex = output.lastIndexOf(SUBAGENT_DONE_TOKEN);
	if (tokenIndex === -1) throw new Error(`Missing completion token ${SUBAGENT_DONE_TOKEN}`);

	const beforeToken = output.slice(0, tokenIndex).trim();
	const rawJson = extractLastJsonObject(beforeToken);
	if (!rawJson) throw new Error("Missing final JSON object before completion token");
	if (!beforeToken.endsWith(rawJson)) {
		throw new Error(`Final JSON object must be immediately followed by ${SUBAGENT_DONE_TOKEN}`);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(rawJson);
	} catch (error) {
		throw new Error(`Malformed final JSON: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (!payload || typeof payload !== "object") throw new Error("Final JSON must be an object");
	const candidate = payload as Partial<SubagentProtocolPayload>;
	if (candidate.status !== "success" && candidate.status !== "error") {
		throw new Error("Final JSON field 'status' must be 'success' or 'error'");
	}
	if (typeof candidate.summary !== "string" || candidate.summary.trim() === "") {
		throw new Error("Final JSON field 'summary' must be a non-empty string");
	}
	return { payload: candidate as SubagentProtocolPayload, rawJson };
}

export function makeRunName(agentName: string, id: string): string {
	const safeAgent = agentName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
	const safeId = id.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8) || "run";
	return `${safeAgent}-${safeId}`;
}
