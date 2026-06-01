import { createSubprocessDriver } from "./subprocess.js";
import type { RunAgentOptions } from "./types.js";

/**
 * Gemini CLI driver using `gemini` command in headless prompt mode.
 * Built on the shared subprocess driver base.
 *
 * Verified against Gemini CLI 0.42.0. Output is treated as raw text lines.
 */
export const runGeminiAgent = createSubprocessDriver({
  command: "gemini",
  buildArgs: buildGeminiArgs,
  parseJsonLine: undefined,
  extractUsage: undefined,
});

export function buildGeminiArgs(
  prompt: string,
  _workdir: string,
  options: RunAgentOptions
): string[] {
  const args = ["--prompt", prompt];
  if (options.model) {
    args.push("--model", options.model);
  }
  return args;
}
