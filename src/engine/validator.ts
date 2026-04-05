import type { ParadigmConfig, ValidationError } from "./types.js";

/**
 * Validate a parsed ParadigmConfig for structural integrity.
 * Returns an array of validation errors (empty = valid).
 */
export function validateParadigm(config: ParadigmConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  // Schema version check
  if (config.maestro_version && config.maestro_version !== "1") {
    errors.push({
      path: "maestro_version",
      message: `Unsupported paradigm version "${config.maestro_version}". M1 only supports version "1".`,
    });
  }

  // Must have at least one agent and one phase
  if (Object.keys(config.agents).length === 0) {
    errors.push({ path: "agents", message: "At least one agent must be defined" });
  }
  if (Object.keys(config.phases).length === 0) {
    errors.push({ path: "phases", message: "At least one phase must be defined" });
  }

  const phaseNames = new Set(Object.keys(config.phases));
  const agentNames = new Set(Object.keys(config.agents));

  // Collect fork child phases (they are referenced but have special rules)
  const forkChildPhases = new Set<string>();
  for (const [, phase] of Object.entries(config.phases)) {
    if (phase.type === "fork" && phase.fork_phases) {
      for (const child of phase.fork_phases) {
        forkChildPhases.add(child);
      }
    }
  }

  // Validate each phase
  for (const [name, phase] of Object.entries(config.phases)) {
    // Fork phase validation
    if (phase.type === "fork") {
      if (!phase.fork_phases || phase.fork_phases.length === 0) {
        errors.push({
          path: `phases.${name}.phases`,
          message: "Fork phase must list child phases in 'phases'",
        });
      } else {
        for (const child of phase.fork_phases) {
          if (!phaseNames.has(child)) {
            errors.push({
              path: `phases.${name}.phases`,
              message: `Fork child "${child}" does not exist. Available phases: ${[...phaseNames].join(", ")}`,
            });
          }
          const childPhase = config.phases[child];
          if (childPhase?.type === "fork") {
            errors.push({
              path: `phases.${name}.phases`,
              message: `Nested fork not supported: child "${child}" is also a fork phase`,
            });
          }
          if (childPhase?.next_if) {
            errors.push({
              path: `phases.${child}.next_if`,
              message: `Fork child "${child}" cannot use next_if (conditional routing not supported in parallel branches)`,
            });
          }
        }
      }
      if (!phase.next) {
        errors.push({
          path: `phases.${name}.next`,
          message: "Fork phase must have 'next' to specify the join target",
        });
      }
      // Fork phases don't need agent, output_file, or next_if — skip remaining checks
      continue;
    }

    // Agent reference (required for non-final, non-fork phases)
    if (phase.type !== "final" && !phase.agent) {
      errors.push({
        path: `phases.${name}.agent`,
        message: "Non-final phase must have an agent",
      });
    } else if (phase.type !== "final" && phase.agent && !agentNames.has(phase.agent)) {
      errors.push({
        path: `phases.${name}.agent`,
        message: `References nonexistent agent "${phase.agent}". Available agents: ${[...agentNames].join(", ")}`,
      });
    }

    // Non-final phases must have output_file (skip fork children — they need output_file too)
    if (phase.type !== "final" && !phase.output_file) {
      errors.push({
        path: `phases.${name}.output_file`,
        message: "Non-final phase must have an output_file",
      });
    }

    // Must have exactly one of: next, next_if, type: final, or be a fork child
    const hasNext = !!phase.next;
    const hasNextIf = !!phase.next_if && Object.keys(phase.next_if).length > 0;
    const isFinal = phase.type === "final";
    const isForkChild = forkChildPhases.has(name);

    // Fork children don't need next/next_if — they implicitly complete within the fork
    if (!hasNext && !hasNextIf && !isFinal && !isForkChild) {
      errors.push({
        path: `phases.${name}`,
        message: "Phase must have 'next', 'next_if', or 'type: final'",
      });
    }

    // Validate next target exists
    if (phase.next && !phaseNames.has(phase.next)) {
      errors.push({
        path: `phases.${name}.next`,
        message: `Target phase "${phase.next}" does not exist. Available phases: ${[...phaseNames].join(", ")}`,
      });
    }

    // Validate next_if targets exist
    if (phase.next_if) {
      for (const [status, target] of Object.entries(phase.next_if)) {
        if (!phaseNames.has(target)) {
          errors.push({
            path: `phases.${name}.next_if.${status}`,
            message: `Target phase "${target}" does not exist. Available phases: ${[...phaseNames].join(", ")}`,
          });
        }
      }
    }

    // Validate timeout_s is positive
    if (phase.timeout_s !== undefined && phase.timeout_s <= 0) {
      errors.push({
        path: `phases.${name}.timeout_s`,
        message: "timeout_s must be positive",
      });
    }

    // Validate max_retries is non-negative
    if (phase.max_retries !== undefined && phase.max_retries < 0) {
      errors.push({
        path: `phases.${name}.max_retries`,
        message: "max_retries must be non-negative",
      });
    }
  }

  // Validate handoff_routing
  if (config.handoff_routing) {
    for (const [source, targets] of Object.entries(config.handoff_routing)) {
      if (!agentNames.has(source)) {
        errors.push({
          path: `handoff_routing.${source}`,
          message: `Source agent "${source}" does not exist`,
        });
      }
      for (const target of targets) {
        if (!agentNames.has(target)) {
          errors.push({
            path: `handoff_routing.${source}`,
            message: `Target agent "${target}" does not exist`,
          });
        }
      }
    }

    // Validate phase transitions respect handoff_routing
    for (const [phaseName, phase] of Object.entries(config.phases)) {
      if (phase.type === "final") continue;

      const phaseAgent = phase.agent;
      const allowedTargets = config.handoff_routing[phaseAgent];
      if (!allowedTargets) continue;

      const targetPhases = phase.next
        ? [phase.next]
        : phase.next_if
          ? Object.values(phase.next_if)
          : [];

      for (const targetPhaseName of targetPhases) {
        const targetPhase = config.phases[targetPhaseName];
        if (!targetPhase || targetPhase.type === "final") continue;

        const targetAgent = targetPhase.agent;
        if (targetAgent !== phaseAgent && !allowedTargets.includes(targetAgent)) {
          errors.push({
            path: `phases.${phaseName}`,
            message: `Transition to "${targetPhaseName}" (agent: ${targetAgent}) violates handoff_routing. Agent "${phaseAgent}" can only hand off to: ${allowedTargets.join(", ")}`,
          });
        }
      }
    }
  }

  // Detect unreachable terminal cycles (phases that loop without a final exit)
  const cycleErrors = detectDeadlockCycles(config);
  errors.push(...cycleErrors);

  // Must have at least one final phase
  const hasFinal = Object.values(config.phases).some((p) => p.type === "final");
  if (!hasFinal) {
    errors.push({
      path: "phases",
      message: "At least one phase must have type: final",
    });
  }

  return errors;
}

/**
 * Detect cycles in phase transitions that have no exit path.
 * A cycle is a deadlock if none of its phases have:
 * - A next_if path leading outside the cycle
 * - max_retries set (which would abort after N retries)
 */
function detectDeadlockCycles(config: ParadigmConfig): ValidationError[] {
  const errors: ValidationError[] = [];
  const phases = config.phases;
  const phaseNames = Object.keys(phases);

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const [name, phase] of Object.entries(phases)) {
    const targets: string[] = [];
    if (phase.next) targets.push(phase.next);
    if (phase.next_if) targets.push(...Object.values(phase.next_if));
    adj.set(name, targets);
  }

  // Find SCCs using iterative Tarjan's
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let idx = 0;
  const sccs: string[][] = [];

  // Iterative Tarjan's algorithm
  for (const startNode of phaseNames) {
    if (index.has(startNode)) continue;

    const callStack: { node: string; neighborIdx: number; neighbors: string[] }[] = [];
    index.set(startNode, idx);
    lowlink.set(startNode, idx);
    idx++;
    onStack.add(startNode);
    stack.push(startNode);

    callStack.push({ node: startNode, neighborIdx: 0, neighbors: adj.get(startNode) ?? [] });

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1]!;

      if (frame.neighborIdx < frame.neighbors.length) {
        const w = frame.neighbors[frame.neighborIdx]!;
        frame.neighborIdx++;

        if (!index.has(w)) {
          index.set(w, idx);
          lowlink.set(w, idx);
          idx++;
          onStack.add(w);
          stack.push(w);
          callStack.push({ node: w, neighborIdx: 0, neighbors: adj.get(w) ?? [] });
        } else if (onStack.has(w)) {
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node)!, lowlink.get(w)!));
        }
      } else {
        // All neighbors visited
        if (lowlink.get(frame.node) === index.get(frame.node)) {
          const scc: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            scc.push(w);
          } while (w !== frame.node);
          sccs.push(scc);
        }

        callStack.pop();
        if (callStack.length > 0) {
          const parent = callStack[callStack.length - 1]!;
          lowlink.set(parent.node, Math.min(lowlink.get(parent.node)!, lowlink.get(frame.node)!));
        }
      }
    }
  }

  // Check each SCC with >1 node for deadlock
  for (const scc of sccs) {
    if (scc.length <= 1) continue;

    const sccSet = new Set(scc);
    let hasExit = false;
    let hasRetryLimit = false;

    for (const name of scc) {
      const phase = phases[name]!;

      // Check if any transition leads outside the SCC
      const targets = adj.get(name) ?? [];
      for (const t of targets) {
        if (!sccSet.has(t)) {
          hasExit = true;
          break;
        }
      }

      // Check if phase has max_retries
      if (phase.max_retries !== undefined && phase.max_retries >= 0) {
        hasRetryLimit = true;
      }

      if (hasExit || hasRetryLimit) break;
    }

    if (!hasExit && !hasRetryLimit) {
      errors.push({
        path: `phases.[${scc.join(", ")}]`,
        message: `Circular reference detected with no exit path. Phases ${scc.join(" → ")} form a cycle with no 'next_if' path leading outside and no 'max_retries' to break the loop.`,
      });
    }
  }

  return errors;
}
