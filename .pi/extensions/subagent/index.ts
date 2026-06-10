/**
 * Herdr-native Subagent Tool
 *
 * Delegates exactly one task to an ephemeral, role-specific pi worker running in a
 * Herdr-managed pane. The main agent remains the broker: it starts the worker,
 * sends one structured prompt, waits for the completion token, parses the final
 * JSON payload, and applies cleanup policy.
 */

import { execFile } from "node:child_process";
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
import { buildWorkerStartArgs, extractPaneRef, getHerdrRuntimeError } from "./lifecycle.ts";
import {
	SUBAGENT_DONE_TOKEN,
	buildPiArgs,
	buildWorkerPrompt,
	makeRunName,
	tryParseSubagentCompletion,
	validateSingleModeParams,
	type SubagentLifecycleState,
	type SubagentProtocolPayload,
} from "./protocol.ts";
import { formatLifecycleSummary, formatSubagentPayload, getLifecycleIcon } from "./render.ts";
import {
	DEFAULT_TIMEOUT_MS,
	POLL_INTERVAL_MS,
	PROGRESS_INTERVAL_MS,
	buildAgentReadArgs,
	buildPaneCloseArgs,
	buildPaneReadArgs,
	makeTimeoutError,
	shouldEmitProgress,
} from "./wait.ts";

const execFileAsync = promisify(execFile);

interface SubagentDetails {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	runName?: string;
	paneRef?: string;
	state: SubagentLifecycleState;
	startedAt: number;
	completedAt?: number;
	payload?: SubagentProtocolPayload;
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

function makeText(payload: SubagentProtocolPayload): string {
	return formatSubagentPayload(payload);
}

function makeDetails(base: Omit<SubagentDetails, "state" | "startedAt">, state: SubagentLifecycleState): SubagentDetails {
	return { ...base, state, startedAt: Date.now() };
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
	} catch {
		return "kept-open";
	}
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
	const runName = makeRunName(options.agent.name, `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
	let tmpPromptDir: string | null = null;
	let tmpPromptPath: string | null = null;
	let paneRef = runName;
	let lastOutput = "";

	const detailsBase = {
		agent: options.agent.name,
		agentSource: options.agent.source,
		agentScope: options.agentScope,
		projectAgentsDir: options.projectAgentsDir,
		runName,
		paneRef,
	};

	const emit = (state: SubagentLifecycleState, text: string, extra: Partial<SubagentDetails> = {}) => {
		options.onUpdate?.({
			content: [{ type: "text", text }],
			details: { ...makeDetails(detailsBase, state), paneRef, lastOutput, ...extra },
		});
	};

	try {
		if (options.agent.systemPrompt.trim()) {
			const tmp = await writePromptToTempFile(options.agent.name, options.agent.systemPrompt);
			tmpPromptDir = tmp.dir;
			tmpPromptPath = tmp.filePath;
		}

		const piArgs = buildPiArgs(options.agent, tmpPromptPath ?? undefined);
		const start = await runHerdr(buildWorkerStartArgs({ runName, cwd, piArgs }), { cwd });
		paneRef = extractPaneRef(start.stdout, runName);
		detailsBase.paneRef = paneRef;
		emit("spawned", `Spawned ${runName} in Herdr pane ${paneRef}.`);

		const workerPrompt = buildWorkerPrompt(options.agent.name, options.task);
		await runHerdr(buildPromptRunArgs(paneRef, workerPrompt), { cwd });
		emit("prompted", `Prompt sent to ${runName}; waiting for ${SUBAGENT_DONE_TOKEN}.`);

		const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
		let nextProgressAt = Date.now();

		while (Date.now() < deadline) {
			if (options.signal?.aborted) throw new Error("Subagent was aborted");

			lastOutput = await readWorkerOutput(runName, paneRef);
			const parsed = tryParseSubagentCompletion(lastOutput);
			if (parsed) {
				if (parsed.payload.status === "error") {
					return {
						content: [{ type: "text", text: makeText(parsed.payload) }],
						details: {
							...makeDetails(detailsBase, "failed"),
							paneRef,
							completedAt: Date.now(),
							payload: parsed.payload,
							lastOutput,
							cleanup: "kept-open",
							error: parsed.payload.error ?? parsed.payload.summary,
						},
						isError: true,
					};
				}

				const cleanup = await closeWorkerPane(paneRef);
				return {
					content: [{ type: "text", text: makeText(parsed.payload) }],
					details: {
						...makeDetails(detailsBase, "completed"),
						paneRef,
						completedAt: Date.now(),
						payload: parsed.payload,
						lastOutput,
						cleanup,
					},
				};
			}

			if (shouldEmitProgress(Date.now(), nextProgressAt)) {
				emit("waiting", `Waiting for ${runName}...`, { lastOutput });
				nextProgressAt = Date.now() + PROGRESS_INTERVAL_MS;
			}
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		}

		throw makeTimeoutError(DEFAULT_TIMEOUT_MS, SUBAGENT_DONE_TOKEN);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			content: [{ type: "text", text: `Subagent failed: ${message}\nWorker pane kept open: ${paneRef}` }],
			details: {
				...makeDetails(detailsBase, "failed"),
				paneRef,
				completedAt: Date.now(),
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
