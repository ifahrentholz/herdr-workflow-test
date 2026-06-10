export function buildPromptRunArgs(paneRef: string, prompt: string): string[] {
	return ["pane", "run", paneRef, prompt];
}
