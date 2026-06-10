import test from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_TIMEOUT_MS,
	PROGRESS_INTERVAL_MS,
	READ_LINES,
	TERMINAL_AGENT_STATUSES,
	WAIT_CHUNK_MS,
	buildAgentReadArgs,
	buildPaneCloseArgs,
	buildPaneGetArgs,
	buildPaneListArgs,
	buildPaneReadArgs,
	buildWaitAgentStatusArgs,
	parseAgentStatus,
	parsePaneCount,
	shouldEmitProgress,
} from "./wait.ts";

test("wait policy defaults match PRD", () => {
	assert.equal(DEFAULT_TIMEOUT_MS, 20 * 60 * 1000);
	assert.equal(PROGRESS_INTERVAL_MS, 30_000);
	assert.equal(WAIT_CHUNK_MS, 30_000);
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

test("buildPaneGetArgs targets a single pane for agent_status polling", () => {
	assert.deepEqual(buildPaneGetArgs("pane-123"), ["pane", "get", "pane-123"]);
});

test("buildPaneListArgs scopes to a workspace when provided", () => {
	assert.deepEqual(buildPaneListArgs(), ["pane", "list"]);
	assert.deepEqual(buildPaneListArgs("w-1"), ["pane", "list", "--workspace", "w-1"]);
});

test("buildWaitAgentStatusArgs encodes the documented wait-agent-status CLI", () => {
	assert.deepEqual(buildWaitAgentStatusArgs("pane-123", "done", 30_000), [
		"wait",
		"agent-status",
		"pane-123",
		"--status",
		"done",
		"--timeout",
		"30000",
	]);
});

test("parseAgentStatus extracts agent_status from herdr pane get JSON", () => {
	const stdout = JSON.stringify({ id: "cli:pane:get", result: { pane: { agent_status: "working", pane_id: "p-1" } } });
	assert.equal(parseAgentStatus(stdout), "working");
});

test("parseAgentStatus returns null for unknown shapes and malformed JSON", () => {
	assert.equal(parseAgentStatus("not json"), null);
	assert.equal(parseAgentStatus(JSON.stringify({ result: { pane: {} } })), null);
	assert.equal(parseAgentStatus(JSON.stringify({ result: { pane: { agent_status: "bogus" } } })), null);
});

test("parsePaneCount returns the number of panes from herdr pane list JSON", () => {
	const stdout = JSON.stringify({ result: { panes: [{ pane_id: "1" }, { pane_id: "2" }, { pane_id: "3" }] } });
	assert.equal(parsePaneCount(stdout), 3);
});

test("parsePaneCount returns null when the shape is unrecognized", () => {
	assert.equal(parsePaneCount("garbage"), null);
	assert.equal(parsePaneCount(JSON.stringify({ result: {} })), null);
});

test("TERMINAL_AGENT_STATUSES identifies done and idle as terminal", () => {
	assert.ok(TERMINAL_AGENT_STATUSES.has("done"));
	assert.ok(TERMINAL_AGENT_STATUSES.has("idle"));
	assert.ok(!TERMINAL_AGENT_STATUSES.has("working"));
	assert.ok(!TERMINAL_AGENT_STATUSES.has("blocked"));
	assert.ok(!TERMINAL_AGENT_STATUSES.has("unknown"));
});

test("progress emits periodically and not before interval", () => {
	assert.equal(shouldEmitProgress(1_000, 1_000), true);
	assert.equal(shouldEmitProgress(999, 1_000), false);
});
