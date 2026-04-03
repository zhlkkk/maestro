// Shared type definitions for Maestro

/** Event emitted by the orchestration engine */
export interface MaestroEvent {
  timestamp: string;
  type: MaestroEventType;
  phase?: string;
  data: Record<string, unknown>;
}

export type MaestroEventType =
  | "PIPELINE_START"
  | "PHASE_START"
  | "AGENT_OUTPUT"
  | "PHASE_COMPLETE"
  | "PHASE_FAILED"
  | "PHASE_TIMEOUT"
  | "PHASE_RETRY"
  | "PIPELINE_COMPLETE"
  | "PIPELINE_FAILED";

/** Events emitted by agent drivers */
export type AgentEvent =
  | { type: "output"; text: string }
  | { type: "complete"; result: string; sessionId?: string }
  | { type: "error"; error: Error };
