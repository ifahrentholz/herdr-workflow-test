import test from "node:test";
import assert from "node:assert/strict";
import {
	MIN_HEIGHT_AFTER_DOWN_SPLIT,
	MIN_WIDTH_AFTER_RIGHT_SPLIT,
	buildWorkerStartArgs,
	chooseSplitDirection,
	extractPaneRef,
	extractWorkspaceId,
	getHerdrRuntimeError,
	getPiIntegrationRequirementError,
	makePiCommand,
	parsePiIntegrationStatus,
	shellQuote,
} from "./lifecycle.ts";

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

test("makePiCommand safely carries multiline initial prompts", () => {
	assert.equal(
		makePiCommand(["--no-session", "line 1\nline 2 with 'quote'"]),
		"pi '--no-session' 'line 1\nline 2 with '\\''quote'\\'''",
	);
});

test("buildWorkerStartArgs defaults to right-split and no-focus", () => {
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

test("buildWorkerStartArgs honors a caller-provided split direction", () => {
	const args = buildWorkerStartArgs({
		runName: "developer-abc",
		cwd: "/repo",
		piArgs: ["--no-session"],
		split: "down",
	});
	assert.equal(args[args.indexOf("--split") + 1], "down");
});

test("chooseSplitDirection prefers right when there is plenty of horizontal room", () => {
	assert.equal(chooseSplitDirection({ paneCount: 1, columns: 240, rows: 60 }), "right");
	assert.equal(chooseSplitDirection({ paneCount: 2, columns: 320, rows: 80 }), "right");
});

test("chooseSplitDirection switches to down when a right-split would be too narrow", () => {
	// Single pane that is only 120 cols wide → right would yield 60 cols per half, below MIN.
	assert.equal(chooseSplitDirection({ paneCount: 1, columns: 120, rows: 60 }), "down");
});

test("chooseSplitDirection accounts for existing horizontal splits diluting the focused pane", () => {
	// 200 cols already divided across 3 right-split panes → ~66 cols each → narrower than MIN after another right split.
	assert.equal(chooseSplitDirection({ paneCount: 3, columns: 200, rows: 60 }), "down");
});

test("chooseSplitDirection falls back to right for sparse panes when terminal size is unknown", () => {
	assert.equal(chooseSplitDirection({ paneCount: 1 }), "right");
	assert.equal(chooseSplitDirection({ paneCount: 2 }), "right");
});

test("chooseSplitDirection falls back to down once enough panes accumulate without geometry info", () => {
	assert.equal(chooseSplitDirection({ paneCount: 3 }), "down");
	assert.equal(chooseSplitDirection({ paneCount: 10 }), "down");
});

test("chooseSplitDirection thresholds are sensibly chosen", () => {
	assert.ok(MIN_WIDTH_AFTER_RIGHT_SPLIT >= 60);
	assert.ok(MIN_HEIGHT_AFTER_DOWN_SPLIT >= 10);
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

	assert.equal(extractPaneRef(output), "w653e52a6f42d22-3");
});

test("extractPaneRef parses Herdr agent start JSON with a top-level agent shape", () => {
	const output = JSON.stringify({
		agent: {
			pane_id: "w653e52a6f42d22-4",
		},
	});

	assert.equal(extractPaneRef(output), "w653e52a6f42d22-4");
});

test("extractPaneRef returns null when no pane_id is present (no silent fallback)", () => {
	assert.equal(extractPaneRef(""), null);
	assert.equal(extractPaneRef("some unexpected log line"), null);
	assert.equal(extractPaneRef(JSON.stringify({ result: { agent: { name: "x" } } })), null);
});

test("extractWorkspaceId returns the workspace id from agent start JSON", () => {
	const output = JSON.stringify({
		result: {
			agent: {
				pane_id: "p-1",
				workspace_id: "w-7",
			},
		},
	});
	assert.equal(extractWorkspaceId(output), "w-7");
	assert.equal(extractWorkspaceId("no json"), null);
});

test("runtime guard error is explicit about Herdr requirement", () => {
	assert.match(getHerdrRuntimeError(new Error("socket missing")), /Herdr runtime is required/);
	assert.match(getHerdrRuntimeError(new Error("socket missing")), /socket missing/);
});

test("parsePiIntegrationStatus recognises current/outdated/not-installed states", () => {
	const installed = parsePiIntegrationStatus([
		"claude: current (v5) (/Users/x/.claude/hooks/herdr-agent-state.sh)",
		"pi: current (v2) (/Users/x/.pi/agent/extensions/herdr-agent-state.ts)",
	].join("\n"));
	assert.equal(installed.state, "current");

	const missing = parsePiIntegrationStatus([
		"pi: not installed (/Users/x/.pi/agent/extensions/herdr-agent-state.ts)",
	].join("\n"));
	assert.equal(missing.state, "not-installed");

	const outdated = parsePiIntegrationStatus([
		"pi: outdated (v1, latest v2) (/Users/x/.pi/agent/extensions/herdr-agent-state.ts)",
	].join("\n"));
	assert.equal(outdated.state, "outdated");

	const noPiLine = parsePiIntegrationStatus("claude: current (v5)\nomp: not installed");
	assert.equal(noPiLine.state, "unknown");
});

test("pi integration requirement error is actionable", () => {
	assert.match(
		getPiIntegrationRequirementError({ state: "not-installed", rawLine: "pi: not installed (/p)" }),
		/herdr integration install pi/,
	);
	assert.match(
		getPiIntegrationRequirementError({ state: "outdated", rawLine: "pi: outdated (v1)" }),
		/outdated/,
	);
});
