import type { ParadigmConfig } from "./types.js";
import { validateParadigm } from "./validator.js";
import { translateToMachine } from "./machine.js";

export interface DryRunResult {
  valid: boolean;
  errors: string[];
  phases: DryRunPhase[];
  warnings: string[];
}

export interface DryRunPhase {
  name: string;
  agent: string;
  isFinal: boolean;
  transitions: { condition: string; target: string }[];
  hasRetryLimit: boolean;
  timeoutS: number;
}

const DEFAULT_TIMEOUT_S = 300;

/**
 * Validate a paradigm and simulate the state machine without running agents.
 * Reports validation errors, phase topology, and reachability warnings.
 */
export function dryRun(config: ParadigmConfig): DryRunResult {
  // 1. Validate
  const validationErrors = validateParadigm(config);
  if (validationErrors.length > 0) {
    return {
      valid: false,
      errors: validationErrors.map((e) => `${e.path}: ${e.message}`),
      phases: [],
      warnings: [],
    };
  }

  // 2. Build phase info
  const phases: DryRunPhase[] = [];
  for (const [name, phase] of Object.entries(config.phases)) {
    const transitions: { condition: string; target: string }[] = [];

    if (phase.next) {
      transitions.push({ condition: "always", target: phase.next });
    }
    if (phase.next_if) {
      for (const [status, target] of Object.entries(phase.next_if)) {
        transitions.push({ condition: `status=${status}`, target });
      }
    }

    phases.push({
      name,
      agent: phase.agent ?? "(final)",
      isFinal: phase.type === "final",
      transitions,
      hasRetryLimit: phase.max_retries !== undefined,
      timeoutS: phase.timeout_s ?? DEFAULT_TIMEOUT_S,
    });
  }

  // 3. Check reachability from first phase
  const warnings: string[] = [];
  const firstPhase = Object.keys(config.phases)[0]!;
  const reachable = new Set<string>();
  const queue = [firstPhase];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);

    const phase = config.phases[current];
    if (!phase) continue;

    if (phase.next && !reachable.has(phase.next)) queue.push(phase.next);
    if (phase.next_if) {
      for (const target of Object.values(phase.next_if)) {
        if (!reachable.has(target)) queue.push(target);
      }
    }
  }

  for (const name of Object.keys(config.phases)) {
    if (!reachable.has(name)) {
      warnings.push(`Phase "${name}" is unreachable from the initial phase "${firstPhase}"`);
    }
  }

  // 4. Try to create the machine (catches translator errors)
  try {
    translateToMachine(config);
  } catch (err) {
    return {
      valid: false,
      errors: [`Machine translation failed: ${err instanceof Error ? err.message : String(err)}`],
      phases,
      warnings,
    };
  }

  return { valid: true, errors: [], phases, warnings };
}

/**
 * Format dry-run results for terminal output.
 */
export function formatDryRunOutput(result: DryRunResult): string {
  const lines: string[] = [];

  if (!result.valid) {
    lines.push("✖ Validation FAILED\n");
    for (const err of result.errors) {
      lines.push(`  ✖ ${err}`);
    }
    return lines.join("\n");
  }

  lines.push("✔ Paradigm is valid\n");
  lines.push("Phases:");

  for (const phase of result.phases) {
    const icon = phase.isFinal ? "◼" : "○";
    lines.push(`  ${icon} ${phase.name} (agent: ${phase.agent}, timeout: ${phase.timeoutS}s)`);

    for (const t of phase.transitions) {
      lines.push(`    → ${t.target} [${t.condition}]`);
    }

    if (phase.hasRetryLimit) {
      lines.push(`    ↻ has retry limit`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("\nWarnings:");
    for (const w of result.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return lines.join("\n");
}
