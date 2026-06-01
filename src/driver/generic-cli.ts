import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSubprocessDriver } from "./subprocess.js";
import type { AgentDriverFn } from "./types.js";

export const runGenericCliAgent: AgentDriverFn = async function* (
  prompt,
  workdir,
  options = {}
) {
  const command = options.command;
  if (!command || command.length === 0 || !command[0]) {
    yield {
      type: "error",
      error: new Error("generic-cli requires a non-empty command array"),
    };
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "maestro-generic-cli-"));
  const promptFile = join(tempDir, "prompt.md");
  writeFileSync(promptFile, prompt, "utf-8");

  const driver = createSubprocessDriver({
    command: command[0],
    buildArgs: () => command.slice(1),
    buildEnv: () => ({
      MAESTRO_PROMPT_FILE: promptFile,
      MAESTRO_WORKDIR: workdir,
      MAESTRO_OUTPUT_FILE: options.outputFile,
      MAESTRO_MODEL: options.model,
    }),
  });

  try {
    yield* driver(prompt, workdir, options);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};
