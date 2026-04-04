import { createActor, fromPromise, waitFor } from "xstate";
import type { ParadigmConfig } from "./types.js";
import { translateToMachine, type PhaseOutput } from "./machine.js";
import { createWorktreeManager, cleanupStaleWorktrees } from "../sandbox/worktree.js";
import { copyHandoff } from "../sandbox/handoff.js";
import { assemblePrompt, readOutputFile } from "../sandbox/prompt.js";
import { parseOutputFile } from "./output-parser.js";
import { getDriver, validateDrivers } from "../driver/registry.js";
import type { MaestroEvent, MaestroEventType } from "../types.js";

export interface RunnerOptions {
  task: string;
  repoRoot: string;
  onEvent?: (event: MaestroEvent) => void;
  abortSignal?: AbortSignal;
}

export interface RunResult {
  success: boolean;
  finalPhase: string;
  events: MaestroEvent[];
  error?: string;
}

const DEFAULT_TIMEOUT_S = 300; // 5 minutes

/**
 * Run a paradigm pipeline end-to-end.
 *
 * Creates worktrees, translates the paradigm to an xstate machine,
 * injects real agent execution actors, and runs the state machine to completion.
 */
export async function runPipeline(
  config: ParadigmConfig,
  options: RunnerOptions
): Promise<RunResult> {
  const events: MaestroEvent[] = [];
  const emit = (type: MaestroEventType, phase?: string, data: Record<string, unknown> = {}) => {
    const event: MaestroEvent = {
      timestamp: new Date().toISOString(),
      type,
      phase,
      data,
    };
    events.push(event);
    options.onEvent?.(event);
  };

  // Validate all driver references before starting (fail fast)
  const driverNames = [...new Set(
    Object.values(config.agents).map((a) => a.driver ?? "claude-code")
  )];
  validateDrivers(driverNames);

  // Clean up stale worktrees from previous crashed runs
  cleanupStaleWorktrees(options.repoRoot);

  const worktreeManager = createWorktreeManager(options.repoRoot);
  const phaseOrder = Object.keys(config.phases);
  let lastPhaseWorktree: string | undefined;
  let lastPhaseOutputFile: string | undefined;
  let lastPhaseOutputContent: string | undefined;

  emit("PIPELINE_START", undefined, { paradigm: config.name, task: options.task });

  try {
    const { machine } = translateToMachine(config);

    // Build real actor implementations for each phase
    const actors: Record<string, any> = {};

    for (const [phaseName, phase] of Object.entries(config.phases)) {
      if (phase.type === "final") continue;

      const actorName = `run_${phaseName}`;
      actors[actorName] = fromPromise(async (): Promise<PhaseOutput> => {
        // Check abort signal
        if (options.abortSignal?.aborted) {
          throw new Error("Pipeline aborted");
        }

        const startTime = Date.now();
        emit("PHASE_START", phaseName, { agent: phase.agent });

        // 1. Prepare worktree
        const worktreePath = worktreeManager.getWorktree(phaseName);

        // 2. Copy changes from previous phase (if any)
        if (lastPhaseWorktree) {
          copyHandoff(lastPhaseWorktree, worktreePath);
        }

        // 3. Assemble prompt
        const previousOutput = lastPhaseOutputContent ?? "";
        let prompt: string;

        if (phase.prompt_file) {
          const assembled = assemblePrompt(phase.prompt_file, options.task, previousOutput);
          prompt = assembled.prompt;
        } else {
          // No prompt_file — construct inline prompt
          prompt = `Task: ${options.task}`;
          if (previousOutput) {
            prompt += `\n\n## Previous Phase Output\n${previousOutput}`;
          }
        }

        // Add system prompt from agent config
        const agentConfig = config.agents[phase.agent];
        const systemPrompt = agentConfig?.system_prompt ?? undefined;
        const resolvedModel = phase.model ?? agentConfig?.model ?? undefined;
        const driverName = agentConfig?.driver ?? "claude-code";
        const driver = getDriver(driverName);

        // 4. Run agent with timeout
        const timeoutMs = (phase.timeout_s ?? DEFAULT_TIMEOUT_S) * 1000;
        const abortController = new AbortController();

        // Link parent abort signal
        if (options.abortSignal) {
          options.abortSignal.addEventListener("abort", () => abortController.abort(), { once: true });
        }

        const timeoutId = setTimeout(() => {
          abortController.abort();
          emit("PHASE_TIMEOUT", phaseName, { timeout_s: phase.timeout_s ?? DEFAULT_TIMEOUT_S });
        }, timeoutMs);

        try {
          for await (const event of driver(prompt, worktreePath, {
            systemPrompt,
            allowedTools: agentConfig?.tools,
            model: resolvedModel,
            abortController,
          })) {
            switch (event.type) {
              case "output":
                emit("AGENT_OUTPUT", phaseName, { text: event.text });
                break;
              case "complete": {
                const duration = event.durationMs != null ? `${event.durationMs}ms` : "unknown";
                const cost = event.costUsd != null ? `$${event.costUsd.toFixed(4)}` : "N/A";
                emit("AGENT_OUTPUT", phaseName, {
                  text: `[Agent completed in ${duration}, cost: ${cost}]`,
                });
                break;
              }
              case "error":
                throw event.error;
            }
          }
        } finally {
          clearTimeout(timeoutId);
        }

        // 5. Read and parse output_file
        if (!phase.output_file) {
          throw new Error(`Phase "${phaseName}" has no output_file configured`);
        }

        const outputContent = readOutputFile(worktreePath, phase.output_file);
        const parsed = parseOutputFile(outputContent, phase.output_file);

        if (!parsed.success) {
          emit("PHASE_FAILED", phaseName, {
            error: parsed.error,
            duration_ms: Date.now() - startTime,
          });
          throw new Error(parsed.error);
        }

        // Track for next phase handoff
        lastPhaseWorktree = worktreePath;
        lastPhaseOutputFile = phase.output_file;
        lastPhaseOutputContent = parsed.rawContent;

        const durationMs = Date.now() - startTime;
        emit("PHASE_COMPLETE", phaseName, {
          status: parsed.status,
          duration_ms: durationMs,
        });

        return { status: parsed.status };
      });
    }

    // Provide real actors to the machine
    const provided = machine.provide({ actors } as any);
    const actor = createActor(provided, {
      input: { task: options.task },
    });

    actor.start();

    // Wait for the machine to reach a final state
    const snapshot = await waitFor(actor, (s) => s.status === "done", {
      timeout: 24 * 60 * 60 * 1000, // 24 hours max (individual phases have their own timeouts)
    });

    const finalState = String(snapshot.value);
    const success = finalState !== "__FAILED";

    if (success) {
      emit("PIPELINE_COMPLETE", undefined, { final_phase: finalState });
    } else {
      emit("PIPELINE_FAILED", undefined, {
        final_phase: finalState,
        error: "Pipeline ended in FAILED state",
      });
    }

    return {
      success,
      finalPhase: finalState,
      events,
      error: success ? undefined : "Pipeline ended in FAILED state",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    emit("PIPELINE_FAILED", undefined, { error: errorMsg });
    return {
      success: false,
      finalPhase: "__ERROR",
      events,
      error: errorMsg,
    };
  } finally {
    worktreeManager.cleanup();
  }
}
