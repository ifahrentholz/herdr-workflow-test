import test from "node:test";
import assert from "node:assert/strict";
import { buildPromptRunArgs } from "./broker.ts";

test("buildPromptRunArgs sends delegated instructions via pane run", () => {
	assert.deepEqual(buildPromptRunArgs("pane-123", "do the work"), ["pane", "run", "pane-123", "do the work"]);
});
