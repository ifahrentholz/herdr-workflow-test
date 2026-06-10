import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("hello_world.html contains overview text, app mount point, and script", async () => {
	const html = await readFile(new URL("./hello_world.html", import.meta.url), "utf8");

	assert.match(html, /kurzer Überblick|kurzen Überblick|overview/i);
	assert.match(html, /<div\s+id=["']app["']\s*>\s*<\/div>/i);
	assert.match(html, /<script\s+src=["']hello_world\.js["']\s*(?:defer\s*)?><\/script>/i);
});

test("hello_world.js renders dynamic text into #app", async () => {
	const script = await readFile(new URL("./hello_world.js", import.meta.url), "utf8");
	let renderedText = "";
	const context = {
		document: {
			getElementById(id) {
				assert.equal(id, "app");
				return {
					set textContent(value) {
						renderedText = value;
					},
				};
			},
		},
	};

	vm.runInNewContext(script, context);

	assert.match(renderedText, /Hello World/i);
});
