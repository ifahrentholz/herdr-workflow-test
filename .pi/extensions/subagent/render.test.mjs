import test from "node:test";
import assert from "node:assert/strict";
import { getLifecycleIcon, formatLifecycleSummary } from "./render.ts";

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
