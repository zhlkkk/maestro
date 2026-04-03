/** Events emitted by the Claude Code driver during agent execution */
export type AgentEvent =
  | { type: "output"; text: string }
  | { type: "complete"; result: string; sessionId: string; durationMs: number; costUsd: number }
  | { type: "error"; error: Error };

/** Options for running an agent */
export interface RunAgentOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  abortController?: AbortController;
}
