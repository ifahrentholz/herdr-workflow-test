export const SUBAGENT_DONE_TOKEN = "<<<SUBAGENT_DONE>>>";

export type SubagentLifecycleState = "spawned" | "prompted" | "waiting" | "completed" | "failed";

/**
 * Categorises *why* a subagent run failed so the orchestrator can react
 * differently (retry vs. surface to user vs. fix task and re-spawn). The
 * worker itself only ever produces `worker-error`; the rest are set by the
 * tool runtime when it intercepts a specific failure shape.
 */
export type SubagentErrorKind =
	| "timeout" // agent_status never reached done/idle within the wait budget
	| "blocked" // worker pane reached blocked state (awaiting user input)
	| "aborted" // user/abort-signal cancelled the run
	| "pane-start-failed" // herdr agent start didn't return a pane id
	| "exec-fail" // a `herdr` CLI invocation rejected unexpectedly
	| "worker-error"; // worker emitted status:"error" in its final JSON

export interface SubagentProtocolPayload {
	status: "success" | "error";
	summary: string;
	output?: string;
	filesChanged?: string[];
	tests?: string[];
	notes?: string;
	error?: string;
	errorKind?: SubagentErrorKind;
}

/**
 * Typed error thrown by the subagent runtime. The kind drives orchestrator
 * decisions and survives into the final payload's `errorKind` field.
 */
export class SubagentRunError extends Error {
	readonly kind: SubagentErrorKind;
	constructor(kind: SubagentErrorKind, message: string) {
		super(message);
		this.name = "SubagentRunError";
		this.kind = kind;
	}
}

export function classifyUnknownError(error: unknown): SubagentErrorKind {
	if (error instanceof SubagentRunError) return error.kind;
	const name = error instanceof Error ? error.name : "";
	if (name === "AbortError" || name === "ABORT_ERR") return "aborted";
	return "exec-fail";
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
		"Complete the delegated task, then finish your turn so Herdr's pi integration reports your agent_status as 'done'.",
		"",
		"Delegated task:",
		task,
		"",
		"Final-response protocol:",
		"1. After completing the task, your final non-empty content MUST be one JSON object matching this schema:",
		'   { "status": "success" | "error", "summary": string, "output"?: string, "filesChanged"?: string[], "tests"?: string[], "notes"?: string, "error"?: string }',
		"2. Do NOT wrap the JSON in a markdown code fence.",
		`3. You MAY add a trailing line with the marker ${SUBAGENT_DONE_TOKEN} after the JSON for human readability.`,
		"4. End your turn immediately after the JSON (and optional marker). Do not ask a follow-up question.",
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

function tryParseAsProtocolPayload(rawJson: string): SubagentProtocolPayload | null {
	let payload: unknown;
	try {
		payload = JSON.parse(rawJson);
	} catch {
		return null;
	}
	if (!payload || typeof payload !== "object") return null;
	const candidate = payload as Partial<SubagentProtocolPayload>;
	if (candidate.status !== "success" && candidate.status !== "error") return null;
	if (typeof candidate.summary !== "string" || candidate.summary.trim() === "") return null;
	return candidate as SubagentProtocolPayload;
}

/**
 * Find the last well-formed protocol payload anywhere in the worker output.
 *
 * Scans backwards, skipping any malformed/unrelated JSON-like blocks, until it
 * finds one that parses AND matches the protocol schema. This is tolerant to:
 * - markdown code fences around the JSON
 * - trailing prose, banners, or ANSI noise after the JSON
 * - the legacy SUBAGENT_DONE_TOKEN being present or absent
 * - prompt-echoed schema examples (those are not valid JSON, so they are skipped)
 */
export function findValidPayload(output: string): ProtocolParseResult | null {
	let remaining = output;
	while (remaining.length > 0) {
		const rawJson = extractLastJsonObject(remaining);
		if (!rawJson) return null;
		const payload = tryParseAsProtocolPayload(rawJson);
		if (payload) return { payload, rawJson };
		const idx = remaining.lastIndexOf(rawJson);
		if (idx === -1) return null;
		remaining = remaining.slice(0, idx);
	}
	return null;
}

/**
 * Synthesize a minimal protocol payload from raw output when the worker did
 * not emit a parseable JSON frame. Used when agent_status has already reached
 * a terminal state but no structured payload was found.
 */
export function synthesizeFallbackPayload(output: string, agentStatus?: string): SubagentProtocolPayload {
	const tail = output.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(-5).join("\n");
	return {
		status: "success",
		summary: "Worker finished without emitting a structured JSON payload",
		output: tail || output.slice(-2000),
		notes: agentStatus ? `Inferred from agent_status=${agentStatus}` : "Inferred from agent_status",
	};
}

export function makeRunName(agentName: string, id: string): string {
	const safeAgent = agentName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
	const safeId = id.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8) || "run";
	return `${safeAgent}-${safeId}`;
}
