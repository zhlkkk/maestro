/** Events emitted by agent drivers during execution */
export type AgentEvent =
  | { type: "output"; text: string }
  | {
      type: "complete";
      result: string;
      sessionId?: string;
      durationMs?: number;
      costUsd?: number;
      tokensIn?: number;
      tokensOut?: number;
      modelUsed?: string;
    }
  | { type: "error"; error: Error };

/** Options for running an agent */
export interface RunAgentOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  command?: string[];
  outputFile?: string;
  abortController?: AbortController;
}

/**
 * Function signature that all agent drivers must implement.
 * Accepts a prompt, working directory, and options; yields AgentEvents.
 */
export type AgentDriverFn = (
  prompt: string,
  workdir: string,
  options?: RunAgentOptions
) => AsyncGenerator<AgentEvent>;
