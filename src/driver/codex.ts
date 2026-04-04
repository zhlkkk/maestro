import type { AgentEvent, RunAgentOptions } from "./types.js";
import { createSubprocessDriver } from "./subprocess.js";

/**
 * Codex CLI driver using `codex exec --json` for structured JSONL output.
 * Built on the shared subprocess driver base.
 */
export const runCodexAgent = createSubprocessDriver({
  command: "codex",
  buildArgs: (prompt, workdir, options) => {
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C", workdir,
    ];
    if (options.model) {
      args.push("-m", options.model);
    }
    args.push(prompt);
    return args;
  },
  parseJsonLine: (line) => {
    try {
      const data = JSON.parse(line);
      switch (data.type) {
        case "item.completed": {
          const item = data.item;
          if (item?.type === "agent_message" && item.text) {
            return { type: "output", text: item.text };
          }
          if (item?.type === "command_execution" && item.aggregated_output) {
            return { type: "output", text: `[cmd] ${item.command}\n${item.aggregated_output}` };
          }
          return null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  },
  extractUsage: (events) => {
    // Codex turn.completed usage is in the raw JSON stream.
    // Since parseJsonLine only returns AgentEvents, we handle usage
    // extraction separately — for now return undefined (usage comes
    // from the JSONL stream if we enhance parseJsonLine later).
    return {};
  },
});
