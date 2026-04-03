import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, RunAgentOptions } from "./types.js";

/**
 * Run a Claude Code agent in a specified working directory.
 * Returns an async iterable of AgentEvents (output/complete/error).
 */
export async function* runAgent(
  prompt: string,
  workdir: string,
  options: RunAgentOptions = {}
): AsyncGenerator<AgentEvent> {
  const abortController = options.abortController ?? new AbortController();

  try {
    const q = query({
      prompt,
      options: {
        cwd: workdir,
        abortController,
        systemPrompt: options.systemPrompt,
        allowedTools: options.allowedTools,
        maxTurns: options.maxTurns ?? 50,
        maxBudgetUsd: options.maxBudgetUsd,
        model: options.model,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    for await (const message of q) {
      switch (message.type) {
        case "assistant": {
          // Extract text content from the assistant message
          const textBlocks = message.message.content.filter(
            (b: any) => b.type === "text"
          );
          for (const block of textBlocks) {
            if ("text" in block && block.text) {
              yield { type: "output", text: block.text };
            }
          }
          break;
        }

        case "result": {
          if (message.subtype === "success") {
            yield {
              type: "complete",
              result: message.result,
              sessionId: "", // session_id is on assistant messages
              durationMs: message.duration_ms,
              costUsd: message.total_cost_usd,
            };
          } else {
            // error_during_execution, error_max_turns, error_max_budget_usd
            yield {
              type: "error",
              error: new Error(
                `Agent failed: ${message.subtype}${message.is_error ? " (error)" : ""}`
              ),
            };
          }
          break;
        }

        // Ignore other message types (system, stream_event, etc.)
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      yield { type: "error", error: new Error("Agent execution was aborted") };
    } else {
      yield {
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }
}
