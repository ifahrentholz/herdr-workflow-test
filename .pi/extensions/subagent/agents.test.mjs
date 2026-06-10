import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function writeAgent(dir, filename, frontmatter, body = "System prompt body") {
	mkdirSync(dir, { recursive: true });
	const fm = Object.entries(frontmatter)
		.map(([key, value]) => `${key}: ${value}`)
		.join("\n");
	writeFileSync(join(dir, filename), `---\n${fm}\n---\n\n${body}\n`);
}

async function loadAgentsModule(userAgentDir) {
	process.env.PI_CODING_AGENT_DIR = userAgentDir;
	return import(`./agents.ts?test=${Date.now()}-${Math.random()}`);
}

test("discovers user agents for user scope and parses tools/model/system prompt", async () => {
	const root = mkdtempSync(join(tmpdir(), "subagent-agents-"));
	const userRoot = join(root, "user");
	writeAgent(join(userRoot, "agents"), "developer.md", {
		name: "developer",
		description: "Writes code",
		tools: "read, write, bash",
		model: "gpt-test",
	}, "Developer system prompt");

	const { discoverAgents } = await loadAgentsModule(userRoot);
	const result = discoverAgents(root, "user");

	assert.equal(result.projectAgentsDir, null);
	assert.equal(result.agents.length, 1);
	assert.deepEqual(result.agents[0], {
		name: "developer",
		description: "Writes code",
		tools: ["read", "write", "bash"],
		model: "gpt-test",
		systemPrompt: "Developer system prompt",
		source: "user",
		filePath: join(userRoot, "agents", "developer.md"),
	});
});

test("discovers nearest project .pi/agents and project scope excludes user agents", async () => {
	const root = mkdtempSync(join(tmpdir(), "subagent-agents-"));
	const userRoot = join(root, "user");
	writeAgent(join(userRoot, "agents"), "developer.md", { name: "developer", description: "User dev" });
	writeAgent(join(root, ".pi", "agents"), "reviewer.md", { name: "reviewer", description: "Project review" });
	const nested = join(root, "src", "nested");
	mkdirSync(nested, { recursive: true });

	const { discoverAgents } = await loadAgentsModule(userRoot);
	const result = discoverAgents(nested, "project");

	assert.equal(result.projectAgentsDir, join(root, ".pi", "agents"));
	assert.deepEqual(result.agents.map((agent) => `${agent.name}:${agent.source}`), ["reviewer:project"]);
});

test("both scope preserves project override precedence by agent name", async () => {
	const root = mkdtempSync(join(tmpdir(), "subagent-agents-"));
	const userRoot = join(root, "user");
	writeAgent(join(userRoot, "agents"), "developer.md", { name: "developer", description: "User dev" }, "user prompt");
	writeAgent(join(root, ".pi", "agents"), "developer.md", { name: "developer", description: "Project dev" }, "project prompt");

	const { discoverAgents } = await loadAgentsModule(userRoot);
	const result = discoverAgents(root, "both");

	assert.equal(result.agents.length, 1);
	assert.equal(result.agents[0].source, "project");
	assert.equal(result.agents[0].description, "Project dev");
	assert.equal(result.agents[0].systemPrompt, "project prompt");
});
