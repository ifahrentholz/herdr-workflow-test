import test from "node:test";
import assert from "node:assert/strict";
import { formatLifecycleSummary, formatSubagentPayload, getLifecycleIcon } from "./render.ts";

test("lifecycle icons are concise and state-oriented", () => {
	assert.equal(getLifecycleIcon("completed"), "✓");
	assert.equal(getLifecycleIcon("failed"), "✗");
	assert.equal(getLifecycleIcon("waiting"), "⏳");
	assert.equal(getLifecycleIcon("spawned"), "⏳");
});

test("formatLifecycleSummary avoids legacy mode and token accounting", () => {
	const text = formatLifecycleSummary({
		agent: "developer",
		state: "completed",
		runName: "developer-abc123",
		cleanup: "closed",
	});

	assert.equal(text, "✓ developer completed (developer-abc123) cleanup:closed");
	assert.doesNotMatch(text, /parallel|chain|tokens|usage|cost/i);
});

test("formatLifecycleSummary includes pane ref only for non-completed runs", () => {
	assert.equal(
		formatLifecycleSummary({ agent: "reviewer", state: "failed", paneRef: "pane-123", cleanup: "kept-open" }),
		"✗ reviewer failed cleanup:kept-open pane:pane-123",
	);
	assert.equal(
		formatLifecycleSummary({ agent: "reviewer", state: "completed", paneRef: "pane-123", cleanup: "closed" }),
		"✓ reviewer completed cleanup:closed",
	);
});

test("formatSubagentPayload renders summary JSON fields instead of dumping JSON", () => {
	const text = formatSubagentPayload({
		status: "success",
		summary: "Created files",
		output: "PASS",
		filesChanged: ["ingos_world.html", "ingos_world.js"],
		tests: ["node --test"],
		notes: "No blockers",
	});

	assert.match(text, /^SUCCESS: Created files/);
	assert.match(text, /Output:\nPASS/);
	assert.match(text, /Files changed:\n- ingos_world\.html\n- ingos_world\.js/);
	assert.match(text, /Tests:\n- node --test/);
	assert.match(text, /Notes:\nNo blockers/);
	assert.doesNotMatch(text, /"status"|"summary"|\{.*\}/s);
});
