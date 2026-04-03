import {
  setup,
  assign,
  fromPromise,
  createActor,
  type AnyStateMachine,
  type AnyActorRef,
} from "xstate";
import type { ParadigmConfig, PhaseConfig } from "./types.js";

/** Context carried through the state machine */
export interface MachineContext {
  lastStatus: string;
  retries: Record<string, number>;
  task: string;
}

/** Output returned by each phase actor */
export interface PhaseOutput {
  status: string;
}

/** Result of translating a paradigm config to an xstate machine */
export interface TranslatedMachine {
  machine: AnyStateMachine;
  initialPhase: string;
  phaseNames: string[];
}

/**
 * Translate a validated ParadigmConfig into an xstate v5 state machine.
 *
 * Each non-final phase becomes an invoke state with a placeholder actor.
 * Use machine.provide() to inject real actor implementations.
 *
 * Conditional routing (next_if) uses always transitions with guards
 * that compare context.lastStatus against each key (case-insensitive).
 */
export function translateToMachine(config: ParadigmConfig): TranslatedMachine {
  const guards: Record<string, any> = {};
  const actors: Record<string, any> = {};
  const states: Record<string, any> = {};

  const phaseEntries = Object.entries(config.phases);
  const firstPhaseName = phaseEntries[0]?.[0];
  if (!firstPhaseName) {
    throw new Error("Paradigm has no phases");
  }

  for (const [phaseName, phase] of phaseEntries) {
    if (phase.type === "final") {
      states[phaseName] = { type: "final" as const };
      continue;
    }

    const actorName = `run_${phaseName}`;
    actors[actorName] = fromPromise(async () => {
      throw new Error(`Actor ${actorName} not provided. Use machine.provide() to inject.`);
    });

    if (phase.next_if) {
      // Routing sub-state: always transitions with inline guard functions
      const routingTransitions: any[] = [];
      const maxRetries = phase.max_retries;

      for (const [statusKey, target] of Object.entries(phase.next_if)) {
        const normalizedKey = statusKey.toLowerCase().trim();
        const isRetryPath = maxRetries !== undefined && isBackwardTransition(phaseName, target, config);

        if (isRetryPath) {
          // Retry path: status matches AND retry count not exceeded
          const guardName = `${phaseName}_is_${statusKey}_with_retry`;
          guards[guardName] = ({ context }: { context: MachineContext }) =>
            context.lastStatus.toLowerCase().trim() === normalizedKey &&
            (context.retries[phaseName] ?? 0) < maxRetries;

          routingTransitions.push({
            guard: guardName,
            target,
            actions: assign({
              retries: ({ context }: { context: MachineContext }) => ({
                ...context.retries,
                [phaseName]: (context.retries[phaseName] ?? 0) + 1,
              }),
            }),
          });
        } else {
          // Normal path: just status matching
          const guardName = `${phaseName}_is_${statusKey}`;
          guards[guardName] = ({ context }: { context: MachineContext }) =>
            context.lastStatus.toLowerCase().trim() === normalizedKey;

          routingTransitions.push({ guard: guardName, target });
        }
      }

      // Fallback: unmatched status OR retries exceeded → __FAILED
      routingTransitions.push({ target: "__FAILED" });

      const routingStateName = `${phaseName}__routing`;
      states[routingStateName] = {
        always: routingTransitions,
      };

      // Main phase state: invoke actor, on done → routing
      states[phaseName] = {
        invoke: {
          src: actorName,
          onDone: {
            target: routingStateName,
            actions: assign({
              lastStatus: ({ event }: any) => {
                const output = event.output as PhaseOutput;
                return output?.status ?? "";
              },
            }),
          },
          onError: {
            target: "__FAILED",
          },
        },
      };
    } else if (phase.next) {
      // Simple linear transition
      states[phaseName] = {
        invoke: {
          src: actorName,
          onDone: { target: phase.next },
          onError: { target: "__FAILED" },
        },
      };
    }
  }

  // Add __FAILED terminal state
  states["__FAILED"] = { type: "final" as const };

  const machine = setup({
    types: {} as {
      context: MachineContext;
    },
    guards: guards as any,
    actors: actors as any,
  }).createMachine({
    id: config.name.replace(/\s+/g, "-"),
    initial: firstPhaseName,
    context: {
      lastStatus: "",
      retries: {},
      task: "",
    },
    states,
  });

  return {
    machine,
    initialPhase: firstPhaseName,
    phaseNames: phaseEntries.map(([name]) => name),
  };
}

/** Check if transitioning from source to target is a "backward" transition */
function isBackwardTransition(
  source: string,
  target: string,
  config: ParadigmConfig
): boolean {
  const phaseOrder = Object.keys(config.phases);
  const sourceIdx = phaseOrder.indexOf(source);
  const targetIdx = phaseOrder.indexOf(target);
  return targetIdx < sourceIdx;
}
