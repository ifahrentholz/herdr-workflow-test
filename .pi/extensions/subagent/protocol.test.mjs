import test from "node:test";
import assert from "node:assert/strict";
import {
	SUBAGENT_DONE_TOKEN,
	buildPiArgs,
	buildWorkerPrompt,
	makeRunName,
	parseSubagentCompletion,
	validateSingleModeParams,
} from "./protocol.ts";

test("single-mode validation rejects legacy parallel and chain params", () => {
	assert.match(validateSingleModeParams({ tasks: [] }), /no longer supported/);
	assert.match(validateSingleModeParams({ chain: [] }), /no longer supported/);
});

test("single-mode validation requires agent and task", () => {
	assert.match(validateSingleModeParams({ agent: "developer" }), /agent, task/);
	assert.match(validateSingleModeParams({ task: "do work" }), /agent, task/);
	assert.equal(validateSingleModeParams({ agent: "developer", task: "do work" }), null);
});

test("pi args preserve role model, tools, and system prompt wiring", () => {
	assert.deepEqual(buildPiArgs({ model: "gpt-5", tools: ["read", "bash"] }, "/tmp/prompt.md"), [
		"--no-session",
		"--model",
		"gpt-5",
		"--tools",
		"read,bash",
		"--append-system-prompt",
		"/tmp/prompt.md",
	]);
});

test("worker prompt requires JSON protocol and completion token", () => {
	const prompt = buildWorkerPrompt("reviewer", "Review the diff");
	assert.match(prompt, /Review the diff/);
	assert.match(prompt, /JSON object/);
	assert.match(prompt, new RegExp(SUBAGENT_DONE_TOKEN.replace(/[<>]/g, "\\$&")));
});

test("completion parser extracts and validates final JSON immediately before token", () => {
	const output = `notes\n{"status":"success","summary":"done","output":"ok"}\n${SUBAGENT_DONE_TOKEN}\n`;
	assert.deepEqual(parseSubagentCompletion(output).payload, {
		status: "success",
		summary: "done",
		output: "ok",
	});
});

test("completion parser rejects prose or markdown fences between final JSON and token", () => {
	assert.throws(
		() => parseSubagentCompletion(`{"status":"success","summary":"done"}\nextra prose\n${SUBAGENT_DONE_TOKEN}`),
		/immediately followed/,
	);
	assert.throws(
		() => parseSubagentCompletion(`\`\`\`json\n{"status":"success","summary":"done"}\n\`\`\`\n${SUBAGENT_DONE_TOKEN}`),
		/immediately followed/,
	);
});

test("completion parser rejects missing token, malformed JSON, and invalid schema", () => {
	assert.throws(() => parseSubagentCompletion('{"status":"success","summary":"done"}'), /Missing completion token/);
	assert.throws(() => parseSubagentCompletion(`{"status":\n${SUBAGENT_DONE_TOKEN}`), /Missing final JSON|Malformed/);
	assert.throws(() => parseSubagentCompletion(`{"status":"ok","summary":"done"}\n${SUBAGENT_DONE_TOKEN}`), /status/);
	assert.throws(() => parseSubagentCompletion(`{"status":"success"}\n${SUBAGENT_DONE_TOKEN}`), /summary/);
});

test("run names are unique-friendly and shell-safe", () => {
	assert.equal(makeRunName("Code Reviewer!", "ABCDEF123456"), "code-reviewer-abcdef12");
});
