import { describe, expect, test } from "bun:test";
import { createActor, fromPromise, waitFor } from "xstate";
import { parseParadigm } from "../../src/engine/parser.js";
import { translateToMachine, type PhaseOutput } from "../../src/engine/machine.js";

function buildAndRun(yaml: string, phaseResults: Record<string, PhaseOutput>) {
  const config = parseParadigm(yaml);
  const { machine } = translateToMachine(config);

  // Build actor overrides for regular phases AND fork child phases
  const actors: Record<string, any> = {};
  for (const phaseName of Object.keys(config.phases)) {
    const phase = config.phases[phaseName]!;
    if (phase.type === "final") continue;
    if (phase.type === "fork") {
      // Fork children get their own actors
      for (const childName of phase.fork_phases ?? []) {
        const actorName = `run_${childName}`;
        actors[actorName] = fromPromise(async () => {
          const result = phaseResults[childName];
          if (!result) throw new Error(`No result provided for fork child ${childName}`);
          return result;
        });
      }
      continue;
    }
    const actorName = `run_${phaseName}`;
    actors[actorName] = fromPromise(async () => {
      const result = phaseResults[phaseName];
      if (!result) throw new Error(`No result provided for phase ${phaseName}`);
      return result;
    });
  }

  const provided = machine.provide({ actors } as any);
  return createActor(provided);
}

describe("translateToMachine", () => {
  test("linear 3-phase paradigm transitions correctly", async () => {
    const actor = buildAndRun(
      `
name: "Linear"
agents:
  A:
    driver: test
phases:
  Step1:
    agent: A
    output_file: out.md
    next: Step2
  Step2:
    agent: A
    output_file: out.md
    next: Done
  Done:
    type: final
`,
      {
        Step1: { status: "complete" },
        Step2: { status: "complete" },
      }
    );

    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.status).toBe("done");
  });

  test("conditional routing: approved → Done", async () => {
    const actor = buildAndRun(
      `
name: "Conditional"
agents:
  A:
    driver: test
phases:
  Review:
    agent: A
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Review
    max_retries: 3
  Done:
    type: final
`,
      { Review: { status: "approved" } }
    );

    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.status).toBe("done");
    // Should end in Done, not __FAILED
    expect(snapshot.value).toBe("Done");
  });

  test("conditional routing: rejected → loops back", async () => {
    let callCount = 0;
    const config = parseParadigm(`
name: "RetryLoop"
agents:
  A:
    driver: test
phases:
  Code:
    agent: A
    output_file: CODE.md
    next: Review
  Review:
    agent: A
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Code
    max_retries: 3
  Done:
    type: final
`);
    const { machine } = translateToMachine(config);

    const actors: Record<string, any> = {
      run_Code: fromPromise(async () => {
        callCount++;
        return { status: "complete" };
      }),
      run_Review: fromPromise(async () => {
        if (callCount <= 1) return { status: "rejected" };
        return { status: "approved" };
      }),
    };

    const provided = machine.provide({ actors } as any);
    const actor = createActor(provided);
    actor.start();

    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("Done");
    expect(callCount).toBe(2); // Code ran twice (initial + after rejection)
  });

  test("case-insensitive status matching", async () => {
    const actor = buildAndRun(
      `
name: "CaseTest"
agents:
  A:
    driver: test
phases:
  Review:
    agent: A
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Review
    max_retries: 1
  Done:
    type: final
`,
      { Review: { status: "Approved" } } // Uppercase A
    );

    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("Done");
  });

  test("whitespace-trimmed status matching", async () => {
    const actor = buildAndRun(
      `
name: "TrimTest"
agents:
  A:
    driver: test
phases:
  Review:
    agent: A
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Review
    max_retries: 1
  Done:
    type: final
`,
      { Review: { status: "  approved  " } } // Extra spaces
    );

    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("Done");
  });

  test("unmatched status → __FAILED", async () => {
    const actor = buildAndRun(
      `
name: "UnmatchedTest"
agents:
  A:
    driver: test
phases:
  Review:
    agent: A
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Review
    max_retries: 1
  Done:
    type: final
`,
      { Review: { status: "unknown_status" } }
    );

    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("__FAILED");
  });

  test("max_retries exceeded → __FAILED", async () => {
    let reviewCount = 0;
    const config = parseParadigm(`
name: "MaxRetry"
agents:
  A:
    driver: test
phases:
  Code:
    agent: A
    output_file: CODE.md
    next: Review
  Review:
    agent: A
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Code
    max_retries: 2
  Done:
    type: final
`);
    const { machine } = translateToMachine(config);

    const actors: Record<string, any> = {
      run_Code: fromPromise(async () => ({ status: "complete" })),
      run_Review: fromPromise(async () => {
        reviewCount++;
        return { status: "rejected" }; // Always reject
      }),
    };

    const provided = machine.provide({ actors } as any);
    const actor = createActor(provided);
    actor.start();

    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("__FAILED");
    expect(reviewCount).toBeLessThanOrEqual(3); // Initial + 2 retries max
  });

  test("actor error → __FAILED", async () => {
    const config = parseParadigm(`
name: "ErrorTest"
agents:
  A:
    driver: test
phases:
  Work:
    agent: A
    output_file: out.md
    next: Done
  Done:
    type: final
`);
    const { machine } = translateToMachine(config);

    const actors: Record<string, any> = {
      run_Work: fromPromise(async () => {
        throw new Error("Agent crashed!");
      }),
    };

    const provided = machine.provide({ actors } as any);
    const actor = createActor(provided);
    actor.start();

    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("__FAILED");
  });

  test("full 6-phase combined-workflow topology", () => {
    const config = parseParadigm(`
name: "Combined Workflow"
agents:
  Facilitator:
    driver: claude-code
  Engineer:
    driver: claude-code
  Reviewer:
    driver: claude-code
phases:
  Brainstorm:
    agent: Facilitator
    output_file: BRAINSTORM.md
    next: LockKnowledge
  LockKnowledge:
    agent: Facilitator
    output_file: KNOWLEDGE.md
    next: DeepPlan
  DeepPlan:
    agent: Facilitator
    output_file: PLAN.md
    next: Execute
  Execute:
    agent: Engineer
    output_file: EXECUTE.md
    next: Review
  Review:
    agent: Reviewer
    output_file: REVIEW.md
    next_if:
      approved: CompoundLearnings
      rejected: Execute
    max_retries: 3
  CompoundLearnings:
    agent: Facilitator
    output_file: LEARNINGS.md
    next: Done
  Done:
    type: final
`);

    const { machine, initialPhase, phaseNames } = translateToMachine(config);
    expect(initialPhase).toBe("Brainstorm");
    expect(phaseNames).toHaveLength(7); // 6 + Done
    // Machine should be created without errors
    expect(machine).toBeDefined();
    expect(machine.id).toBe("Combined-Workflow");
  });

  // Fork-join tests
  test("fork phase with 2 children completes when both finish", async () => {
    const actor = buildAndRun(
      `
name: "ForkTest"
agents:
  Worker:
    driver: test
phases:
  Analyze:
    agent: Worker
    output_file: ANALYSIS.md
    next: ParallelFix
  ParallelFix:
    type: fork
    phases: [FixFE, FixBE]
    next: Verify
  FixFE:
    agent: Worker
    output_file: FIX_FE.md
  FixBE:
    agent: Worker
    output_file: FIX_BE.md
  Verify:
    agent: Worker
    output_file: VERIFY.md
    next: Done
  Done:
    type: final
`,
      {
        Analyze: { status: "complete" },
        FixFE: { status: "fixed" },
        FixBE: { status: "fixed" },
        Verify: { status: "verified" },
      }
    );

    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("Done");
    expect(snapshot.context.parallelOutputs.FixFE).toEqual({ status: "fixed" });
    expect(snapshot.context.parallelOutputs.FixBE).toEqual({ status: "fixed" });
  });

  test("fork child error transitions to child failed state (parallel still completes)", async () => {
    const config = parseParadigm(`
name: "ForkError"
agents:
  Worker:
    driver: test
phases:
  Fork:
    type: fork
    phases: [ChildA, ChildB]
    next: Done
  ChildA:
    agent: Worker
    output_file: A.md
  ChildB:
    agent: Worker
    output_file: B.md
  Done:
    type: final
`);
    const { machine } = translateToMachine(config);

    const actors: Record<string, any> = {
      run_ChildA: fromPromise(async () => ({ status: "ok" })),
      run_ChildB: fromPromise(async () => {
        throw new Error("ChildB failed!");
      }),
    };

    const provided = machine.provide({ actors } as any);
    const actor = createActor(provided);
    actor.start();

    // Both children reach final (one via done, one via failed), so parallel completes
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("Done");
  });

  test("mixed paradigm: serial → fork → serial → conditional", async () => {
    const actor = buildAndRun(
      `
name: "MixedFlow"
agents:
  A:
    driver: test
phases:
  Plan:
    agent: A
    output_file: PLAN.md
    next: ParallelWork
  ParallelWork:
    type: fork
    phases: [WorkA, WorkB]
    next: Review
  WorkA:
    agent: A
    output_file: WORK_A.md
  WorkB:
    agent: A
    output_file: WORK_B.md
  Review:
    agent: A
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Plan
    max_retries: 1
  Done:
    type: final
`,
      {
        Plan: { status: "planned" },
        WorkA: { status: "done" },
        WorkB: { status: "done" },
        Review: { status: "approved" },
      }
    );

    actor.start();
    const snapshot = await waitFor(actor, (s) => s.status === "done", { timeout: 5000 });
    expect(snapshot.value).toBe("Done");
  });
});
