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

// Re-export AgentEvent and AgentDriverFn from the canonical source
export type { AgentEvent, AgentDriverFn } from "./driver/types.js";
