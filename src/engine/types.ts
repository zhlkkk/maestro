/** Configuration for a single agent in the paradigm */
export interface AgentConfig {
  description?: string;
  driver: string;
  command?: string[];
  system_prompt_file?: string;
  system_prompt?: string;
  tools?: string[];
  model?: string;
}

/** Configuration for a single phase in the paradigm */
export interface PhaseConfig {
  agent: string;
  prompt_file?: string;
  output_file?: string;
  next?: string;
  next_if?: Record<string, string>;
  timeout_s?: number;
  max_retries?: number;
  /** Phase type: "final" for terminal, "fork" for parallel execution */
  type?: "final" | "fork";
  model?: string;
  /** For fork phases: list of child phase names to run in parallel */
  fork_phases?: string[];
}

/** Top-level paradigm configuration parsed from YAML */
export interface ParadigmConfig {
  name: string;
  description?: string;
  maestro_version?: string;
  version?: string;
  author?: string;
  tags?: string[];
  license?: string;
  homepage?: string;
  entry_agent?: string;
  agents: Record<string, AgentConfig>;
  phases: Record<string, PhaseConfig>;
  handoff_routing?: Record<string, string[]>;
}

/** Validation error with field path and message */
export interface ValidationError {
  path: string;
  message: string;
}
