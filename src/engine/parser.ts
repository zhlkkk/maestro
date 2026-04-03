import { parse as parseYaml } from "yaml";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import type { ParadigmConfig } from "./types.js";

/**
 * Parse a YAML paradigm file and return a typed ParadigmConfig.
 * File paths (prompt_file, system_prompt_file) are resolved relative
 * to the paradigm file's directory.
 */
export function parseParadigmFile(filePath: string): ParadigmConfig {
  const absolutePath = resolve(filePath);
  const baseDir = dirname(absolutePath);
  const content = readFileSync(absolutePath, "utf-8");
  return parseParadigm(content, baseDir);
}

/**
 * Parse a YAML string into a ParadigmConfig.
 * @param content - YAML string
 * @param baseDir - Base directory for resolving relative file paths (defaults to cwd)
 */
export function parseParadigm(
  content: string,
  baseDir: string = process.cwd()
): ParadigmConfig {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ParserError(`YAML parse error: ${msg}`);
  }

  if (!raw || typeof raw !== "object") {
    throw new ParserError("Paradigm file must contain a YAML object");
  }

  const obj = raw as Record<string, unknown>;

  const config: ParadigmConfig = {
    name: expectString(obj, "name"),
    description: optionalString(obj, "description"),
    maestro_version: optionalString(obj, "maestro_version"),
    entry_agent: optionalString(obj, "entry_agent"),
    agents: parseAgents(obj.agents),
    phases: parsePhases(obj.phases, baseDir),
    handoff_routing: parseRouting(obj.handoff_routing),
  };

  // Resolve system_prompt_file paths relative to paradigm file
  for (const [name, agent] of Object.entries(config.agents)) {
    if (agent.system_prompt_file) {
      agent.system_prompt_file = resolve(baseDir, agent.system_prompt_file);
    }
  }

  return config;
}

function parseAgents(raw: unknown): Record<string, import("./types.js").AgentConfig> {
  if (!raw || typeof raw !== "object") {
    throw new ParserError("Missing or invalid 'agents' section");
  }
  const agents: Record<string, import("./types.js").AgentConfig> = {};
  for (const [name, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") {
      throw new ParserError(`agents.${name} must be an object`);
    }
    const a = val as Record<string, unknown>;
    agents[name] = {
      description: optionalString(a, "description"),
      driver: typeof a.driver === "string" ? a.driver : "claude-code",
      system_prompt_file: optionalString(a, "system_prompt_file"),
      system_prompt: optionalString(a, "system_prompt"),
      tools: Array.isArray(a.tools) ? a.tools.map(String) : undefined,
    };
  }
  return agents;
}

function parsePhases(
  raw: unknown,
  baseDir: string
): Record<string, import("./types.js").PhaseConfig> {
  if (!raw || typeof raw !== "object") {
    throw new ParserError("Missing or invalid 'phases' section");
  }
  const phases: Record<string, import("./types.js").PhaseConfig> = {};
  for (const [name, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") {
      throw new ParserError(`phases.${name} must be an object`);
    }
    const p = val as Record<string, unknown>;
    const phase: import("./types.js").PhaseConfig = {
      agent: typeof p.agent === "string" ? p.agent : "",
      output_file: optionalString(p, "output_file"),
      next: optionalString(p, "next"),
      timeout_s: typeof p.timeout_s === "number" ? p.timeout_s : undefined,
      max_retries: typeof p.max_retries === "number" ? p.max_retries : undefined,
      type: p.type === "final" ? "final" : undefined,
    };

    if (p.prompt_file && typeof p.prompt_file === "string") {
      phase.prompt_file = resolve(baseDir, p.prompt_file);
    }

    if (p.next_if && typeof p.next_if === "object") {
      phase.next_if = {};
      for (const [k, v] of Object.entries(p.next_if as Record<string, unknown>)) {
        phase.next_if[k] = String(v);
      }
    }

    phases[name] = phase;
  }
  return phases;
}

function parseRouting(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const routing: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    routing[k] = Array.isArray(v) ? v.map(String) : [];
  }
  return routing;
}

function expectString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  if (typeof val !== "string" || val.trim() === "") {
    throw new ParserError(`Missing required field '${key}' (must be a non-empty string)`);
  }
  return val;
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === "string" ? val : undefined;
}

export class ParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParserError";
  }
}
