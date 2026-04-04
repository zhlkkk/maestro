import type { AgentDriverFn } from "./types.js";
import { runAgent as claudeRunAgent } from "./claude.js";
import { runCodexAgent } from "./codex.js";

type DriverFactory = () => AgentDriverFn;

const registry = new Map<string, DriverFactory>();

/**
 * Register a named driver factory. The factory is called lazily on first use
 * to avoid import-time side effects for drivers that aren't needed.
 */
export function registerDriver(name: string, factory: DriverFactory): void {
  registry.set(name, factory);
}

/**
 * Retrieve a driver by name. Throws if the driver is not registered.
 */
export function getDriver(name: string): AgentDriverFn {
  const factory = registry.get(name);
  if (!factory) {
    const available = [...registry.keys()].join(", ") || "none";
    throw new Error(
      `Unknown driver "${name}". Available drivers: ${available}`
    );
  }
  return factory();
}

/**
 * List all registered driver names.
 */
export function listDrivers(): string[] {
  return [...registry.keys()];
}

/**
 * Validate that all agent driver references in a paradigm config are registered.
 * Call this before pipeline execution to fail fast.
 */
export function validateDrivers(driverNames: string[]): void {
  const unknown = driverNames.filter((name) => !registry.has(name));
  if (unknown.length > 0) {
    const available = [...registry.keys()].join(", ") || "none";
    throw new Error(
      `Unregistered driver(s): ${unknown.join(", ")}. Available: ${available}`
    );
  }
}

// Register built-in drivers
registerDriver("claude-code", () => claudeRunAgent);
registerDriver("codex", () => runCodexAgent);
