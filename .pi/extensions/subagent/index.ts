/**
 * Herdr-native Subagent Tool
 *
 * Delegates exactly one task to an ephemeral, role-specific pi worker running in a
 * Herdr-managed pane. The main agent remains the broker: it starts the worker,
 * sends one structured prompt, waits for the Herdr pi integration to report the
 * worker's agent_status as a terminal state (done/idle), then reads the final
 * output, best-effort parses a structured JSON payload, and applies cleanup.
 *
 * Completion detection relies on Herdr's `agent_status` (set by the pi
 * integration) rather than scraping a sentinel token out of the worker's text
 * output. Text-output parsing is best-effort only — if the worker forgot the
 * JSON envelope, completion still succeeds because the agent_status reached a
 * terminal state.
 */

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { StringEnum } from "@earendil-works/pi-ai";
import { type ExtensionAPI, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.ts";
import { buildPromptRunArgs } from "./broker.ts";
import {
	buildWorkerStartArgs,
	chooseSplitDirection,
	extractPaneRef,
	extractWorkspaceId,
	getHerdrRuntimeError,
	getPiIntegrationRequirementError,
	parsePiIntegrationStatus,
	type SplitDirection,
} from "./lifecycle.ts";
import {
	buildPiArgs,
	buildWorkerPrompt,
	findValidPayload,
	makeRunName,
	synthesizeFallbackPayload,
	validateSingleModeParams,
	type SubagentLifecycleState,
	type SubagentProtocolPayload,
} from "./protocol.ts";
import { formatLifecycleSummary, formatSubagentPayload, getLifecycleIcon } from "./render.ts";
import {
	type AgentStatus,
	DEFAULT_TIMEOUT_MS,
	TERMINAL_AGENT_STATUSES,
	WAIT_CHUNK_MS,
	buildAgentReadArgs,
	buildPaneCloseArgs,
	buildPaneGetArgs,
	buildPaneListArgs,
	buildPaneReadArgs,
	buildWaitAgentStatusArgs,
	makeTimeoutError,
	parseAgentStatus,
	parsePaneCount,
} from "./wait.ts";

const execFileAsync = promisify(execFile);

interface SubagentDetails {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	runName?: string;
	paneRef?: string;
	splitDirection?: SplitDirection;
	state: SubagentLifecycleState;
	startedAt: number;
	completedAt?: number;
	payload?: SubagentProtocolPayload;
	agentStatus?: AgentStatus;
	error?: string;
	lastOutput?: string;
	cleanup?: "closed" | "kept-open" | "not-started";
}

async function runHerdr(args: string[], options: { cwd?: string; timeout?: number } = {}) {
	return execFileAsync("herdr", args, {
		cwd: options.cwd,
		timeout: options.timeout ?? 30_000,
		maxBuffer: 1024 * 1024,
	});
}

async function assertHerdrRuntime(cwd: string): Promise<void> {
	try {
		await runHerdr(["status", "server"], { cwd, timeout: 10_000 });
	} catch (error) {
		throw new Error(getHerdrRuntimeError(error));
	}

	let integrationStdout: string;
	try {
		const { stdout } = await runHerdr(["integration", "status"], { cwd, timeout: 10_000 });
		integrationStdout = stdout;
	} catch (error) {
		// `integration status` failure is non-fatal — we still try to run, and
		// surface a hint instead of blocking the user entirely.
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Could not query \`herdr integration status\` to verify the pi integration. ${message}`);
	}

	const integrationStatus = parsePiIntegrationStatus(integrationStdout);
	if (integrationStatus.state === "not-installed" || integrationStatus.state === "unknown") {
		throw new Error(getPiIntegrationRequirementError(integrationStatus));
	}
	// `outdated` is intentionally allowed through with no warning here — the
	// agent_status wait will surface a real timeout if the older version can't
	// report state. Future work: pipe a warning into onUpdate.
}

async function writePromptToTempFile(agentName: string, prompt: string): Promise<{ dir: string; filePath: string }> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
	await withFileMutationQueue(filePath, async () => {
		await fs.promises.writeFile(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	});
	return { dir: tmpDir, filePath };
}

function cleanupTemp(dir: string | null, filePath: string | null) {
	if (filePath) {
		try {
			fs.unlinkSync(filePath);
		} catch {
			/* ignore */
		}
	}
	if (dir) {
		try {
			fs.rmdirSync(dir);
		} catch {
			/* ignore */
		}
	}
}

function makeDetails(
	base: Omit<SubagentDetails, "state" | "startedAt">,
	state: SubagentLifecycleState,
	startedAt: number,
): SubagentDetails {
	return { ...base, state, startedAt };
}

async function readWorkerOutput(target: string, paneRef: string): Promise<string> {
	try {
		const { stdout } = await runHerdr(buildAgentReadArgs(target));
		return stdout;
	} catch {
		const { stdout } = await runHerdr(buildPaneReadArgs(paneRef));
		return stdout;
	}
}

async function closeWorkerPane(paneRef: string): Promise<"closed" | "kept-open"> {
	try {
		await runHerdr(buildPaneCloseArgs(paneRef));
		return "closed";
	} catch (error) {
		// Treat "pane no longer exists" the same as a successful close — the
		// goal (no lingering worker pane) is met either way. Other errors
		// (socket down, permission denied, etc.) mean the pane is still alive
		// somewhere and should be flagged kept-open for the user to inspect.
		const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
		const alreadyGone = /not[ _-]found|does[ _-]not[ _-]exist|no such|unknown pane|already closed/.test(message);
		return alreadyGone ? "closed" : "kept-open";
	}
}

async function getAgentStatus(paneRef: string): Promise<AgentStatus | null> {
	try {
		const { stdout } = await runHerdr(buildPaneGetArgs(paneRef), { timeout: 10_000 });
		return parseAgentStatus(stdout);
	} catch {
		return null;
	}
}

async function getPaneCount(cwd: string, workspaceId?: string): Promise<number> {
	try {
		const { stdout } = await runHerdr(buildPaneListArgs(workspaceId), { cwd, timeout: 10_000 });
		return parsePaneCount(stdout) ?? 1;
	} catch {
		return 1;
	}
}

function getTerminalSize(): { columns?: number; rows?: number } {
	const stream = process.stdout;
	if (stream && stream.isTTY && stream.columns && stream.rows) {
		return { columns: stream.columns, rows: stream.rows };
	}
	return {};
}

interface WaitForCompletionResult {
	status: AgentStatus;
}

/**
 * Block until the worker's agent_status reaches a terminal state.
 *
 * Strategy:
 * - Fast-path check via `pane get` (cheap single call).
 * - Then block on `herdr wait agent-status --status done` for chunks of
 *   WAIT_CHUNK_MS so the UI can emit progress and we can re-check status
 *   (handles the `idle` case if the user manually focused the worker pane).
 * - `blocked` is treated as a fatal error — the worker is waiting for user
 *   input we can't provide.
 */
async function waitForCompletion(
	paneRef: string,
	overallTimeoutMs: number,
	signal: AbortSignal | undefined,
	onWaiting: (status: AgentStatus | null) => void,
): Promise<WaitForCompletionResult> {
	const deadline = Date.now() + overallTimeoutMs;

	while (Date.now() < deadline) {
		if (signal?.aborted) throw new Error("Subagent was aborted");

		const currentStatus = await getAgentStatus(paneRef);
		if (currentStatus && TERMINAL_AGENT_STATUSES.has(currentStatus)) {
			return { status: currentStatus };
		}
		if (currentStatus === "blocked") {
			throw new Error("Worker pane reached blocked state (awaiting user input)");
		}

		const remaining = Math.min(deadline - Date.now(), WAIT_CHUNK_MS);
		if (remaining <= 0) break;

		try {
			await runHerdr(buildWaitAgentStatusArgs(paneRef, "done", remaining), {
				timeout: remaining + 5_000,
			});
			return { status: "done" };
		} catch {
			onWaiting(currentStatus);
		}
	}

	throw makeTimeoutError(overallTimeoutMs, "agent_status to reach done/idle");
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

async function runHerdrAgent(options: {
	defaultCwd: string;
	agent: AgentConfig;
	task: string;
	cwd?: string;
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	signal?: AbortSignal;
	onUpdate?: OnUpdateCallback;
}): Promise<AgentToolResult<SubagentDetails>> {
	await assertHerdrRuntime(options.defaultCwd);

	const cwd = options.cwd ?? options.defaultCwd;
	const runName = makeRunName(options.agent.name, randomUUID());
	const startedAt = Date.now();
	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;
	let paneRef: string | null = null;
	let lastOutput = "";

	const detailsBase: Omit<SubagentDetails, "state" | "startedAt"> = {
		agent: options.agent.name,
		agentSource: options.agent.source,
		agentScope: options.agentScope,
		projectAgentsDir: options.projectAgentsDir,
		runName,
		paneRef: undefined,
	};

	const emit = (state: SubagentLifecycleState, text: string, extra: Partial<SubagentDetails> = {}) => {
		options.onUpdate?.({
			content: [{ type: "text", text }],
			details: {
				...makeDetails(detailsBase, state, startedAt),
				paneRef: paneRef ?? undefined,
				lastOutput,
				...extra,
			},
		});
	};

	try {
		if (options.agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(options.agent.name, options.agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
		}

		const paneCount = await getPaneCount(cwd);
		const { columns, rows } = getTerminalSize();
		const splitDirection = chooseSplitDirection({ paneCount, columns, rows });
		detailsBase.splitDirection = splitDirection;

		const piArgs = buildPiArgs(options.agent, tmpPromptPath ?? undefined);
		const start = await runHerdr(
			buildWorkerStartArgs({ runName, cwd, piArgs, split: splitDirection }),
			{ cwd },
		);
		const extractedPaneRef = extractPaneRef(start.stdout);
		if (!extractedPaneRef) {
			throw new Error(
				`herdr agent start did not return a pane_id; cannot track worker.\nRaw output:\n${start.stdout.slice(0, 500)}`,
			);
		}
		paneRef = extractedPaneRef;
		detailsBase.paneRef = paneRef;
		const workspaceId = extractWorkspaceId(start.stdout);
		emit(
			"spawned",
			`Spawned ${runName} in Herdr pane ${paneRef} (split:${splitDirection}${workspaceId ? `, workspace ${workspaceId}` : ""}).`,
		);

		const workerPrompt = buildWorkerPrompt(options.agent.name, options.task);
		await runHerdr(buildPromptRunArgs(paneRef, workerPrompt), { cwd });
		emit("prompted", `Prompt sent to ${runName}; waiting for agent_status to reach done/idle.`);

		const { status: terminalStatus } = await waitForCompletion(paneRef, DEFAULT_TIMEOUT_MS, options.signal, (current) => {
			emit("waiting", `Waiting for ${runName} (current agent_status: ${current ?? "unknown"})...`, { agentStatus: current ?? undefined });
		});

		lastOutput = await readWorkerOutput(runName, paneRef);
		const parsed = findValidPayload(lastOutput);
		const payload = parsed?.payload ?? synthesizeFallbackPayload(lastOutput, terminalStatus);

		if (payload.status === "error") {
			return {
				content: [{ type: "text", text: formatSubagentPayload(payload) }],
				details: {
					...makeDetails(detailsBase, "failed", startedAt),
					paneRef,
					completedAt: Date.now(),
					payload,
					agentStatus: terminalStatus,
					lastOutput,
					cleanup: "kept-open",
					error: payload.error ?? payload.summary,
				},
				isError: true,
			};
		}

		const cleanup = await closeWorkerPane(paneRef);
		return {
			content: [{ type: "text", text: formatSubagentPayload(payload) }],
			details: {
				...makeDetails(detailsBase, "completed", startedAt),
				paneRef,
				completedAt: Date.now(),
				payload,
				agentStatus: terminalStatus,
				lastOutput,
				cleanup,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const recoveredOutput = paneRef ? await readWorkerOutput(runName, paneRef).catch(() => "") : "";
		if (recoveredOutput) lastOutput = recoveredOutput;
		const recoveredStatus = paneRef ? await getAgentStatus(paneRef) : null;

		const fallback: SubagentProtocolPayload = {
			status: "error",
			summary: "Subagent run failed",
			error: message,
		};

		return {
			content: [{ type: "text", text: formatSubagentPayload(fallback) }],
			details: {
				...makeDetails(detailsBase, "failed", startedAt),
				paneRef: paneRef ?? undefined,
				completedAt: Date.now(),
				payload: fallback,
				agentStatus: recoveredStatus ?? undefined,
				lastOutput,
				error: message,
				cleanup: paneRef ? "kept-open" : "not-started",
			},
			isError: true,
		};
	} finally {
		cleanupTemp(tmpPromptDir, tmpPromptPath);
	}
}

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
	description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
	default: "user",
});

const SubagentParams = Type.Object({
	agent: Type.Optional(Type.String({ description: "Name of the agent to invoke" })),
	task: Type.Optional(Type.String({ description: "Task to delegate to the agent" })),
	tasks: Type.Optional(Type.Any({ description: "Legacy parameter. No longer supported; use { agent, task }." })),
	chain: Type.Optional(Type.Any({ description: "Legacy parameter. No longer supported; orchestrate sequencing externally." })),
	agentScope: Type.Optional(AgentScopeSchema),
	confirmProjectAgents: Type.Optional(
		Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true }),
	),
	cwd: Type.Optional(Type.String({ description: "Working directory for the worker agent" })),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "subagent",
		label: "Subagent",
		description: [
			"Delegate one task to a specialized Herdr-managed subagent with isolated context.",
			"Single mode only: provide { agent, task }.",
			'Default agent scope is "user"; use agentScope "both" or "project" for project-local agents.',
		].join(" "),
		parameters: SubagentParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const agentScope: AgentScope = params.agentScope ?? "user";
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;

			const validationError = validateSingleModeParams(params);
			if (validationError) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [{ type: "text", text: `${validationError}\nAvailable agents: ${available}` }],
					details: {
						agent: params.agent ?? "unknown",
						agentSource: "unknown",
						agentScope,
						projectAgentsDir: discovery.projectAgentsDir,
						state: "failed",
						startedAt: Date.now(),
						error: validationError,
						cleanup: "not-started",
					} satisfies SubagentDetails,
					isError: true,
				};
			}

			const agent = agents.find((a) => a.name === params.agent);
			if (!agent) {
				const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
				return {
					content: [{ type: "text", text: `Unknown agent: "${params.agent}". Available agents: ${available}.` }],
					details: {
						agent: params.agent!,
						agentSource: "unknown",
						agentScope,
						projectAgentsDir: discovery.projectAgentsDir,
						state: "failed",
						startedAt: Date.now(),
						error: "Unknown agent",
						cleanup: "not-started",
					} satisfies SubagentDetails,
					isError: true,
				};
			}

			const confirmProjectAgents = params.confirmProjectAgents ?? true;
			if ((agentScope === "project" || agentScope === "both") && confirmProjectAgents && ctx.hasUI && agent.source === "project") {
				const ok = await ctx.ui.confirm(
					"Run project-local agent?",
					`Agent: ${agent.name}\nSource: ${discovery.projectAgentsDir ?? agent.filePath}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
				);
				if (!ok) {
					return {
						content: [{ type: "text", text: "Canceled: project-local agent not approved." }],
						details: {
							agent: agent.name,
							agentSource: agent.source,
							agentScope,
							projectAgentsDir: discovery.projectAgentsDir,
							state: "failed",
							startedAt: Date.now(),
							cleanup: "not-started",
						} satisfies SubagentDetails,
						isError: true,
					};
				}
			}

			return runHerdrAgent({
				defaultCwd: ctx.cwd,
				agent,
				task: params.task!,
				cwd: params.cwd,
				agentScope,
				projectAgentsDir: discovery.projectAgentsDir,
				signal,
				onUpdate,
			});
		},

		renderCall(args, theme, _context) {
			const scope: AgentScope = args.agentScope ?? "user";
			const agentName = args.agent || "...";
			const preview = args.task ? (args.task.length > 70 ? `${args.task.slice(0, 70)}...` : args.task) : "...";
			return new Text(
				`${theme.fg("toolTitle", theme.bold("subagent "))}${theme.fg("accent", agentName)}${theme.fg("muted", ` [${scope}]`)}\n  ${theme.fg("dim", preview)}`,
				0,
				0,
			);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as SubagentDetails | undefined;
			const content = result.content[0];
			const text = details?.payload ? formatSubagentPayload(details.payload) : content?.type === "text" ? content.text : "(no output)";
			if (!details) return new Text(text, 0, 0);

			const icon = getLifecycleIcon(details.state);
			const coloredIcon = theme.fg(details.state === "completed" ? "success" : details.state === "failed" ? "error" : "warning", icon);
			const plainHeader = formatLifecycleSummary(details);
			const header = plainHeader.replace(icon, coloredIcon).replace(details.agent, theme.fg("toolTitle", theme.bold(details.agent)));
			return new Text(`${header}\n${theme.fg(details.state === "failed" ? "error" : "toolOutput", text)}`, 0, 0);
		},
	});
}
