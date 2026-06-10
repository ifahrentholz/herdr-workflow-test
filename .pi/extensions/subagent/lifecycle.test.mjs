import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerStartArgs, shellQuote, makePiCommand, getHerdrRuntimeError, extractPaneRef } from "./lifecycle.ts";

test("shellQuote safely quotes worker command arguments", () => {
	assert.equal(shellQuote("simple"), "'simple'");
	assert.equal(shellQuote("has space"), "'has space'");
	assert.equal(shellQuote("it's ok"), "'it'\\''s ok'");
});

test("makePiCommand builds an interactive pi command from args", () => {
	assert.equal(
		makePiCommand(["--no-session", "--model", "gpt test", "--tools", "read,bash"]),
		"pi '--no-session' '--model' 'gpt test' '--tools' 'read,bash'",
	);
});

test("buildWorkerStartArgs starts an ephemeral Herdr agent in current context split", () => {
	const args = buildWorkerStartArgs({
		runName: "developer-abc123",
		cwd: "/repo/path",
		piArgs: ["--no-session", "--tools", "read,bash"],
	});

	assert.deepEqual(args, [
		"agent",
		"start",
		"developer-abc123",
		"--cwd",
		"/repo/path",
		"--split",
		"right",
		"--no-focus",
		"--",
		"bash",
		"-lc",
		"pi '--no-session' '--tools' 'read,bash'",
	]);
});

test("extractPaneRef parses Herdr agent start JSON output", () => {
	const output = JSON.stringify({
		id: "cli:agent:start",
		result: {
			agent: {
				name: "developer-abc123",
				pane_id: "w653e52a6f42d22-3",
				tab_id: "w653e52a6f42d22:1",
				workspace_id: "w653e52a6f42d22",
			},
			type: "agent_started",
		},
	});

	assert.equal(extractPaneRef(output, "developer-abc123"), "w653e52a6f42d22-3");
});

test("extractPaneRef parses Herdr agent start JSON with a top-level agent shape", () => {
	const output = JSON.stringify({
		agent: {
			pane_id: "w653e52a6f42d22-4",
		},
	});

	assert.equal(extractPaneRef(output, "developer-abc123"), "w653e52a6f42d22-4");
});

test("runtime guard error is explicit about Herdr requirement", () => {
	assert.match(getHerdrRuntimeError(new Error("socket missing")), /Herdr runtime is required/);
	assert.match(getHerdrRuntimeError(new Error("socket missing")), /socket missing/);
});
