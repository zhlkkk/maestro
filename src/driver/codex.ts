import type { AgentEvent, RunAgentOptions } from "./types.js";
import type { ExtractedUsage, UsageExtractionContext } from "./subprocess.js";
import { createSubprocessDriver } from "./subprocess.js";

/**
 * Codex CLI driver using `codex exec --json` for structured JSONL output.
 * Built on the shared subprocess driver base.
 */
export const runCodexAgent = createSubprocessDriver({
  command: "codex",
  buildArgs: buildCodexArgs,
  parseJsonLine: parseCodexJsonLine,
  extractUsage: extractCodexUsage,
});

export function buildCodexArgs(
  prompt: string,
  workdir: string,
  options: RunAgentOptions
): string[] {
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
}

export function parseCodexJsonLine(line: string): AgentEvent | null {
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
}

export function extractCodexUsage(context: UsageExtractionContext): ExtractedUsage {
  const result: ExtractedUsage = {};

  for (const line of context.jsonLines) {
    if (!isRecord(line)) continue;

    const usage = findUsageObject(line);
    if (usage) {
      result.tokensIn = firstNumber(
        usage.input_tokens,
        usage.inputTokens,
        usage.prompt_tokens,
        usage.promptTokens,
        usage.tokens_in,
        usage.tokensIn
      ) ?? result.tokensIn;
      result.tokensOut = firstNumber(
        usage.output_tokens,
        usage.outputTokens,
        usage.completion_tokens,
        usage.completionTokens,
        usage.tokens_out,
        usage.tokensOut
      ) ?? result.tokensOut;
      result.costUsd = firstNumber(
        usage.cost_usd,
        usage.costUsd,
        usage.total_cost_usd,
        usage.totalCostUsd
      ) ?? result.costUsd;
    }

    result.modelUsed = firstString(
      line.model,
      isRecord(line.response) ? line.response.model : undefined,
      isRecord(line.turn) ? line.turn.model : undefined,
      isRecord(line.item) ? line.item.model : undefined
    ) ?? result.modelUsed;
  }

  return result;
}

function findUsageObject(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;

  if (isRecord(value.usage)) return value.usage;
  if (isRecord(value.response) && isRecord(value.response.usage)) return value.response.usage;
  if (isRecord(value.turn) && isRecord(value.turn.usage)) return value.turn.usage;
  if (isRecord(value.item) && isRecord(value.item.usage)) return value.item.usage;

  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
