import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerStartArgs, shellQuote, makePiCommand, getHerdrRuntimeError } from "./lifecycle.ts";

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

test("runtime guard error is explicit about Herdr requirement", () => {
	assert.match(getHerdrRuntimeError(new Error("socket missing")), /Herdr runtime is required/);
	assert.match(getHerdrRuntimeError(new Error("socket missing")), /socket missing/);
});
