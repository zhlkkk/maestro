import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createActor, fromPromise, waitFor } from "xstate";
import type { ParadigmConfig } from "./types.js";
import { translateToMachine, type PhaseOutput } from "./machine.js";
import { createWorktreeManager, cleanupStaleWorktrees } from "../sandbox/worktree.js";
import { copyHandoff, generateDiffSummary, listHandoffChanges } from "../sandbox/handoff.js";
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

interface HandoffConflict {
  path: string;
  phases: string[];
}

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
  await cleanupStaleWorktrees(options.repoRoot);

  const worktreeManager = createWorktreeManager(options.repoRoot);
  let lastPhaseWorktree: string | undefined;
  let lastPhaseOutputContent: string | undefined;

  emit("PIPELINE_START", undefined, { paradigm: config.name, task: options.task });

  try {
    const { machine } = translateToMachine(config);

    // Track worktree state per phase for multi-path handoff
    const phaseWorktrees = new Map<string, string>();
    const phaseOutputs = new Map<string, string>();
    const retryCounts = new Map<string, number>();
    const forkByChild = new Map<string, string>();
    const forkInputs = new Map<string, { worktree?: string; output?: string }>();
    const joinSourcesByPhase = new Map<string, string[]>();
    const joinForkByPhase = new Map<string, string>();
    const forkControllers = new Map<string, Map<string, AbortController>>();

    for (const [phaseName, phase] of Object.entries(config.phases)) {
      if (phase.type === "fork" && phase.fork_phases && phase.next) {
        for (const childName of phase.fork_phases) {
          forkByChild.set(childName, phaseName);
        }
        joinSourcesByPhase.set(phase.next, phase.fork_phases);
        joinForkByPhase.set(phase.next, phaseName);
      }
    }

    // Build real actor implementations for each phase
    const actors: Record<string, any> = {};

    // Helper to create a phase actor
    const createPhaseActor = (phaseName: string, phase: typeof config.phases[string]) => {
      return fromPromise(async (): Promise<PhaseOutput> => {
        // Check abort signal
        if (options.abortSignal?.aborted) {
          throw new Error("Pipeline aborted");
        }

        const startTime = Date.now();
        const isRetry = phaseWorktrees.has(phaseName);
        const forkName = forkByChild.get(phaseName);
        let failureEmitted = false;
        let abortController: AbortController | undefined;

        const emitPhaseFailed = (error: string, data: Record<string, unknown> = {}) => {
          if (failureEmitted) return;
          failureEmitted = true;
          emit("PHASE_FAILED", phaseName, {
            error,
            duration_ms: Date.now() - startTime,
            ...data,
          });
        };

        const abortForkSiblings = (reason: string) => {
          if (!forkName) return;
          const controllers = forkControllers.get(forkName);
          if (!controllers) return;

          for (const [siblingName, siblingController] of controllers) {
            if (siblingName !== phaseName && !siblingController.signal.aborted) {
              siblingController.abort();
              emit("AGENT_OUTPUT", siblingName, {
                text: `[Aborted by fork sibling ${phaseName}: ${reason}]`,
              });
            }
          }
        };

        if (isRetry) {
          const retryCount = (retryCounts.get(phaseName) ?? 0) + 1;
          retryCounts.set(phaseName, retryCount);
          emit("PHASE_RETRY", phaseName, { attempt: retryCount + 1 });
        }

        emit("PHASE_START", phaseName, { agent: phase.agent, retry: isRetry });

        // 1. Prepare worktree
        const worktreePath = await worktreeManager.getWorktree(phaseName);

        // 2. Resolve handoff sources. Fork children share the pre-fork snapshot,
        // and the join target receives every child branch instead of just the last
        // child that happened to finish.
        const joinSources = joinSourcesByPhase.get(phaseName);
        const handoffSources: string[] = [];
        let sourceOutput = lastPhaseOutputContent ?? "";

        if (joinSources && joinSources.every((childName) => phaseWorktrees.has(childName))) {
          const joinForkName = joinForkByPhase.get(phaseName);
          const baseWorktree = joinForkName ? forkInputs.get(joinForkName)?.worktree : undefined;
          const conflict = await findHandoffConflict(joinSources, phaseWorktrees, baseWorktree);
          if (conflict) {
            const error = `Fork handoff conflict before "${phaseName}": ${conflict.path} changed by ${conflict.phases.join(", ")}`;
            emitPhaseFailed(error, {
              reason: "fork_handoff_conflict",
              conflict_path: conflict.path,
              conflict_phases: conflict.phases,
            });
            throw new Error(error);
          }

          for (const childName of joinSources) {
            const childWorktree = phaseWorktrees.get(childName);
            if (childWorktree) handoffSources.push(childWorktree);
          }
          sourceOutput = joinSources
            .map((childName) => `## ${childName}\n${phaseOutputs.get(childName) ?? ""}`)
            .join("\n\n");
        } else if (forkName) {
          if (!forkInputs.has(forkName)) {
            forkInputs.set(forkName, {
              worktree: lastPhaseWorktree,
              output: lastPhaseOutputContent,
            });
          }

          const forkInput = forkInputs.get(forkName);
          if (forkInput?.worktree) handoffSources.push(forkInput.worktree);
          sourceOutput = forkInput?.output ?? "";
        } else if (lastPhaseWorktree) {
          handoffSources.push(lastPhaseWorktree);
        }

        for (const sourceWorktree of handoffSources) {
          await copyHandoff(sourceWorktree, worktreePath);
        }

        // 3. Assemble prompt — use incremental mode for retries
        let previousOutput: string;

        if (isRetry && lastPhaseOutputContent) {
          // Incremental handoff: diff summary + review feedback instead of full output
          const diffSummary = await generateDiffSummary(worktreePath);
          previousOutput = `## Review Feedback\n${lastPhaseOutputContent}\n\n## Changes Made\n${diffSummary}`;
        } else {
          previousOutput = sourceOutput;
        }

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
        abortController = new AbortController();

        if (forkName) {
          let controllers = forkControllers.get(forkName);
          if (!controllers) {
            controllers = new Map();
            forkControllers.set(forkName, controllers);
          }
          controllers.set(phaseName, abortController);
        }

        // Link parent abort signal
        if (options.abortSignal) {
          options.abortSignal.addEventListener("abort", () => abortController.abort(), { once: true });
        }

        const timeoutId = setTimeout(() => {
          abortController.abort();
          emit("PHASE_TIMEOUT", phaseName, { timeout_s: phase.timeout_s ?? DEFAULT_TIMEOUT_S });
          abortForkSiblings("timeout");
        }, timeoutMs);

        let completeEvent: Extract<import("../driver/types.js").AgentEvent, { type: "complete" }> | undefined;

        try {
          for await (const event of driver(prompt, worktreePath, {
            systemPrompt,
            allowedTools: agentConfig?.tools,
            model: resolvedModel,
            command: agentConfig?.command,
            outputFile: phase.output_file,
            abortController,
          })) {
            switch (event.type) {
              case "output":
                emit("AGENT_OUTPUT", phaseName, { text: event.text });
                break;
              case "complete": {
                completeEvent = event;
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
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          emitPhaseFailed(errorMsg, {
            reason: abortController.signal.aborted ? "aborted" : "agent_error",
          });
          abortForkSiblings(errorMsg);
          throw err;
        } finally {
          clearTimeout(timeoutId);
          if (forkName) {
            forkControllers.get(forkName)?.delete(phaseName);
          }
        }

        // 5. Read and parse output_file
        if (!phase.output_file) {
          throw new Error(`Phase "${phaseName}" has no output_file configured`);
        }

        const outputContent = readOutputFile(worktreePath, phase.output_file);
        const parsed = parseOutputFile(outputContent, phase.output_file);

        if (!parsed.success) {
          emitPhaseFailed(parsed.error, { reason: "output_parse_error" });
          abortForkSiblings(parsed.error);
          throw new Error(parsed.error);
        }

        // Track for next phase handoff (both single-path and multi-path)
        lastPhaseWorktree = worktreePath;
        lastPhaseOutputContent = parsed.rawContent;
        phaseWorktrees.set(phaseName, worktreePath);
        phaseOutputs.set(phaseName, parsed.rawContent);

        const durationMs = Date.now() - startTime;
        emit("PHASE_COMPLETE", phaseName, {
          status: parsed.status,
          duration_ms: durationMs,
          tokens_in: completeEvent?.tokensIn,
          tokens_out: completeEvent?.tokensOut,
          cost_usd: completeEvent?.costUsd,
          model_used: completeEvent?.modelUsed,
        });

        return { status: parsed.status };
      });
    };

    for (const [phaseName, phase] of Object.entries(config.phases)) {
      if (phase.type === "final") continue;

      if (phase.type === "fork" && phase.fork_phases) {
        // Fork phase: create actors for each child, not for the fork itself
        for (const childName of phase.fork_phases) {
          const childPhase = config.phases[childName];
          if (!childPhase) continue;
          actors[`run_${childName}`] = createPhaseActor(childName, childPhase);
        }
        continue;
      }

      actors[`run_${phaseName}`] = createPhaseActor(phaseName, phase);
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
    await worktreeManager.cleanup();
  }
}

async function findHandoffConflict(
  phaseNames: string[],
  phaseWorktrees: Map<string, string>,
  baseWorktree?: string
): Promise<HandoffConflict | undefined> {
  const ownersByPath = new Map<string, string[]>();

  for (const phaseName of phaseNames) {
    const worktree = phaseWorktrees.get(phaseName);
    if (!worktree) continue;

    const changes = await listHandoffChanges(worktree);
    const touchedPaths = new Set([
      ...changes.added,
      ...changes.modified,
      ...changes.deleted,
    ]);

    for (const path of touchedPaths) {
      if (baseWorktree && pathMatchesBase(worktree, baseWorktree, path)) {
        continue;
      }

      const owners = ownersByPath.get(path) ?? [];
      owners.push(phaseName);
      ownersByPath.set(path, owners);
    }
  }

  for (const [path, owners] of ownersByPath) {
    if (owners.length > 1) {
      return { path, phases: owners };
    }
  }

  return undefined;
}

function pathMatchesBase(worktree: string, baseWorktree: string, relativePath: string): boolean {
  const currentPath = join(worktree, relativePath);
  const basePath = join(baseWorktree, relativePath);
  const currentExists = existsSync(currentPath);
  const baseExists = existsSync(basePath);

  if (!currentExists && !baseExists) return true;
  if (currentExists !== baseExists) return false;

  try {
    const currentStat = statSync(currentPath);
    const baseStat = statSync(basePath);

    if (currentStat.isDirectory() || baseStat.isDirectory()) {
      return currentStat.isDirectory() && baseStat.isDirectory();
    }

    return readFileSync(currentPath).equals(readFileSync(basePath));
  } catch {
    return false;
  }
}
