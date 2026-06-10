import test from "node:test";
import assert from "node:assert/strict";
import {
	SUBAGENT_DONE_TOKEN,
	buildPiArgs,
	buildWorkerPrompt,
	findValidPayload,
	makeRunName,
	synthesizeFallbackPayload,
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

test("worker prompt describes the JSON envelope without requiring the legacy completion token", () => {
	const prompt = buildWorkerPrompt("reviewer", "Review the diff");
	assert.match(prompt, /Review the diff/);
	assert.match(prompt, /JSON object/);
	assert.match(prompt, /agent_status/);
	assert.match(prompt, /"status"/);
	assert.match(prompt, /"summary"/);
	// Token is now optional / human-readable only — mentioned as MAY, not MUST.
	assert.match(prompt, new RegExp(`MAY[^\\n]*${SUBAGENT_DONE_TOKEN.replace(/[<>]/g, "\\$&")}`));
});

test("findValidPayload extracts a well-formed JSON frame anywhere in worker output", () => {
	const output = `worker logs\n{"status":"success","summary":"done","output":"ok"}\n${SUBAGENT_DONE_TOKEN}\n`;
	assert.deepEqual(findValidPayload(output)?.payload, {
		status: "success",
		summary: "done",
		output: "ok",
	});
});

test("findValidPayload tolerates trailing prose, banners, and markdown fences", () => {
	const output = [
		"# Report",
		"```json",
		'{"status":"success","summary":"done","filesChanged":["a.html"]}',
		"```",
		"",
		"Run complete.",
	].join("\n");
	assert.deepEqual(findValidPayload(output)?.payload, {
		status: "success",
		summary: "done",
		filesChanged: ["a.html"],
	});
});

test("findValidPayload skips malformed JSON-like blocks (e.g. echoed schema example) until a valid one is found", () => {
	const echoedSchemaPrompt = buildWorkerPrompt("developer", "do work");
	const output = `${echoedSchemaPrompt}\n\nworker logs\n{"status":"success","summary":"done after work"}\n`;
	assert.deepEqual(findValidPayload(output)?.payload, {
		status: "success",
		summary: "done after work",
	});
});

test("findValidPayload returns null when no valid protocol payload is present", () => {
	assert.equal(findValidPayload("no json here\n"), null);
	assert.equal(findValidPayload(`{"status":"ok","summary":"done"}`), null); // invalid status
	assert.equal(findValidPayload(`{"status":"success"}`), null); // missing summary
	assert.equal(findValidPayload(`{"status":"success","summary":""}`), null); // empty summary
});

test("findValidPayload picks the latest (rightmost) valid payload when multiple exist", () => {
	const output = [
		'{"status":"error","summary":"first attempt"}',
		"retrying...",
		'{"status":"success","summary":"final attempt"}',
	].join("\n");
	assert.deepEqual(findValidPayload(output)?.payload, {
		status: "success",
		summary: "final attempt",
	});
});

test("synthesizeFallbackPayload constructs a success payload with diagnostic context", () => {
	const fallback = synthesizeFallbackPayload("line1\nline2\nlast meaningful line\n", "done");
	assert.equal(fallback.status, "success");
	assert.match(fallback.summary, /without emitting a structured JSON payload/);
	assert.match(fallback.notes ?? "", /agent_status=done/);
	assert.match(fallback.output ?? "", /last meaningful line/);
});

test("run names are unique-friendly and shell-safe", () => {
	assert.equal(makeRunName("Code Reviewer!", "ABCDEF123456"), "code-reviewer-abcdef12");
});
