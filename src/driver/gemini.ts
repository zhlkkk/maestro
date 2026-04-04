import { createSubprocessDriver } from "./subprocess.js";

/**
 * Gemini CLI driver using `gemini` command in non-interactive mode.
 * Built on the shared subprocess driver base.
 *
 * Note: Gemini CLI interface may evolve. This driver uses plain text mode
 * (no --json flag available as of 2026-04). Output is treated as raw text lines.
 */
export const runGeminiAgent = createSubprocessDriver({
  command: "gemini",
  buildArgs: (prompt, workdir, options) => {
    const args = [
      "--non-interactive",
      "--cwd", workdir,
    ];
    if (options.model) {
      args.push("--model", options.model);
    }
    // Prompt passed via stdin or as trailing argument
    args.push(prompt);
    return args;
  },
  // Gemini CLI does not support --json JSONL mode (as of 2026-04).
  // Output lines are treated as plain text agent output.
  parseJsonLine: undefined,
  extractUsage: undefined,
});
