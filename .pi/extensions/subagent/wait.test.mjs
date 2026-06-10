import test from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_TIMEOUT_MS,
	PROGRESS_INTERVAL_MS,
	READ_LINES,
	buildAgentReadArgs,
	buildPaneCloseArgs,
	buildPaneReadArgs,
	shouldEmitProgress,
} from "./wait.ts";

test("wait policy defaults match PRD", () => {
	assert.equal(DEFAULT_TIMEOUT_MS, 20 * 60 * 1000);
	assert.equal(PROGRESS_INTERVAL_MS, 30_000);
	assert.equal(READ_LINES, 2_000);
});

test("read fallback command args prefer agent read then pane read shape", () => {
	assert.deepEqual(buildAgentReadArgs("developer-123"), [
		"agent",
		"read",
		"developer-123",
		"--source",
		"recent-unwrapped",
		"--lines",
		"2000",
	]);
	assert.deepEqual(buildPaneReadArgs("pane-123"), [
		"pane",
		"read",
		"pane-123",
		"--source",
		"recent-unwrapped",
		"--lines",
		"2000",
	]);
});

test("cleanup command closes pane only on success path", () => {
	assert.deepEqual(buildPaneCloseArgs("pane-123"), ["pane", "close", "pane-123"]);
});

test("progress emits periodically and not before interval", () => {
	assert.equal(shouldEmitProgress(1_000, 1_000), true);
	assert.equal(shouldEmitProgress(999, 1_000), false);
});
