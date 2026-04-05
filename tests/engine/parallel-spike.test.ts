/**
 * Technical Spike: xstate v5 parallel states with dynamic actors
 *
 * Goal: Validate that fork-join (parallel) execution is feasible
 * with xstate v5 for the Maestro orchestration engine.
 */
import { describe, test, expect } from "bun:test";
import {
  setup,
  assign,
  fromPromise,
  createActor,
  waitFor,
} from "xstate";

// ---------------------------------------------------------------------------
// 1. Can xstate v5 create a parallel compound state with dynamic fromPromise actors?
// ---------------------------------------------------------------------------
describe("Spike 1: Parallel state with fromPromise actors", () => {
  test("parallel state transitions to join when BOTH children complete", async () => {
    const machine = setup({
      types: {} as {
        context: { results: string[] };
      },
      actors: {
        childA: fromPromise(async () => {
          return "A done";
        }),
        childB: fromPromise(async () => {
          return "B done";
        }),
      },
    }).createMachine({
      id: "parallel-basic",
      initial: "fork",
      context: { results: [] },
      states: {
        fork: {
          type: "parallel",
          states: {
            branchA: {
              initial: "running",
              states: {
                running: {
                  invoke: {
                    src: "childA",
                    onDone: {
                      target: "completed",
                      actions: assign({
                        results: ({ context, event }) => [
                          ...context.results,
                          event.output as string,
                        ],
                      }),
                    },
                  },
                },
                completed: { type: "final" },
              },
            },
            branchB: {
              initial: "running",
              states: {
                running: {
                  invoke: {
                    src: "childB",
                    onDone: {
                      target: "completed",
                      actions: assign({
                        results: ({ context, event }) => [
                          ...context.results,
                          event.output as string,
                        ],
                      }),
                    },
                  },
                },
                completed: { type: "final" },
              },
            },
          },
          onDone: "join",
        },
        join: {
          type: "final",
        },
      },
    });

    const actor = createActor(machine);
    actor.start();

    const snapshot = await waitFor(actor, (s) => s.status === "done", {
      timeout: 3000,
    });

    expect(snapshot.status).toBe("done");
    expect(snapshot.context.results).toHaveLength(2);
    expect(snapshot.context.results).toContain("A done");
    expect(snapshot.context.results).toContain("B done");
  });
});

// ---------------------------------------------------------------------------
// 2. Do parallel child states support invoke -> onDone -> final pattern?
// ---------------------------------------------------------------------------
describe("Spike 2: invoke -> onDone -> final pattern in parallel children", () => {
  test("parent completes when all children reach final sub-states", async () => {
    const machine = setup({
      types: {} as {
        context: { completedPhases: string[] };
      },
      actors: {
        phaseAlpha: fromPromise(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return { status: "ok", phase: "alpha" };
        }),
        phaseBeta: fromPromise(async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { status: "ok", phase: "beta" };
        }),
      },
    }).createMachine({
      id: "invoke-done-final",
      initial: "parallel_execution",
      context: { completedPhases: [] },
      states: {
        parallel_execution: {
          type: "parallel",
          states: {
            alpha: {
              initial: "invoking",
              states: {
                invoking: {
                  invoke: {
                    src: "phaseAlpha",
                    onDone: {
                      target: "done",
                      actions: assign({
                        completedPhases: ({ context, event }) => [
                          ...context.completedPhases,
                          (event.output as any).phase,
                        ],
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
            beta: {
              initial: "invoking",
              states: {
                invoking: {
                  invoke: {
                    src: "phaseBeta",
                    onDone: {
                      target: "done",
                      actions: assign({
                        completedPhases: ({ context, event }) => [
                          ...context.completedPhases,
                          (event.output as any).phase,
                        ],
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
          },
          onDone: "all_done",
        },
        all_done: {
          type: "final",
        },
      },
    });

    const actor = createActor(machine);
    actor.start();

    const snapshot = await waitFor(actor, (s) => s.status === "done", {
      timeout: 3000,
    });

    expect(snapshot.status).toBe("done");
    expect(snapshot.context.completedPhases).toContain("alpha");
    expect(snapshot.context.completedPhases).toContain("beta");
  });
});

// ---------------------------------------------------------------------------
// 3. Can we inject actors dynamically using machine.provide()?
// ---------------------------------------------------------------------------
describe("Spike 3: Dynamic actor injection via machine.provide()", () => {
  test("provided actors replace placeholders and actually execute", async () => {
    const baseMachine = setup({
      types: {} as {
        context: { output: string };
      },
      actors: {
        worker: fromPromise(async () => {
          throw new Error("Worker not provided — use machine.provide()");
        }),
      },
    }).createMachine({
      id: "provide-test",
      initial: "working",
      context: { output: "" },
      states: {
        working: {
          invoke: {
            src: "worker",
            onDone: {
              target: "finished",
              actions: assign({
                output: ({ event }) => event.output as string,
              }),
            },
            onError: "failed",
          },
        },
        finished: { type: "final" },
        failed: { type: "final" },
      },
    });

    // Without provide — should hit the placeholder error
    const failActor = createActor(baseMachine);
    failActor.start();
    const failSnap = await waitFor(failActor, (s) => s.status === "done", {
      timeout: 3000,
    });
    expect(failSnap.value).toBe("failed");

    // With provide — should use the injected actor
    const providedMachine = baseMachine.provide({
      actors: {
        worker: fromPromise(async () => "injected result"),
      },
    });

    const okActor = createActor(providedMachine);
    okActor.start();
    const okSnap = await waitFor(okActor, (s) => s.status === "done", {
      timeout: 3000,
    });
    expect(okSnap.value).toBe("finished");
    expect(okSnap.context.output).toBe("injected result");
  });

  test("machine.provide() works with parallel states", async () => {
    const baseMachine = setup({
      types: {} as {
        context: { results: Record<string, string> };
      },
      actors: {
        taskA: fromPromise(async () => {
          throw new Error("taskA not provided");
        }),
        taskB: fromPromise(async () => {
          throw new Error("taskB not provided");
        }),
      },
    }).createMachine({
      id: "provide-parallel",
      initial: "fork",
      context: { results: {} },
      states: {
        fork: {
          type: "parallel",
          states: {
            a: {
              initial: "run",
              states: {
                run: {
                  invoke: {
                    src: "taskA",
                    onDone: {
                      target: "done",
                      actions: assign({
                        results: ({ context, event }) => ({
                          ...context.results,
                          a: event.output as string,
                        }),
                      }),
                    },
                    onError: {
                      target: "done",
                      actions: assign({
                        results: ({ context }) => ({
                          ...context.results,
                          a: "ERROR",
                        }),
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
            b: {
              initial: "run",
              states: {
                run: {
                  invoke: {
                    src: "taskB",
                    onDone: {
                      target: "done",
                      actions: assign({
                        results: ({ context, event }) => ({
                          ...context.results,
                          b: event.output as string,
                        }),
                      }),
                    },
                    onError: {
                      target: "done",
                      actions: assign({
                        results: ({ context }) => ({
                          ...context.results,
                          b: "ERROR",
                        }),
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
          },
          onDone: "join",
        },
        join: { type: "final" },
      },
    });

    const provided = baseMachine.provide({
      actors: {
        taskA: fromPromise(async () => "result-A"),
        taskB: fromPromise(async () => "result-B"),
      },
    });

    const actor = createActor(provided);
    actor.start();
    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 3000,
    });

    expect(snap.context.results).toEqual({ a: "result-A", b: "result-B" });
  });
});

// ---------------------------------------------------------------------------
// 4. How does error in one child affect siblings?
// ---------------------------------------------------------------------------
describe("Spike 4: Error handling in parallel children", () => {
  test("error in one child does NOT kill siblings if handled with onError", async () => {
    const machine = setup({
      types: {} as {
        context: { outcomes: Record<string, string> };
      },
      actors: {
        goodChild: fromPromise(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return "success";
        }),
        badChild: fromPromise(async () => {
          throw new Error("child exploded");
        }),
      },
    }).createMachine({
      id: "error-handling",
      initial: "fork",
      context: { outcomes: {} },
      states: {
        fork: {
          type: "parallel",
          states: {
            good: {
              initial: "running",
              states: {
                running: {
                  invoke: {
                    src: "goodChild",
                    onDone: {
                      target: "done",
                      actions: assign({
                        outcomes: ({ context, event }) => ({
                          ...context.outcomes,
                          good: event.output as string,
                        }),
                      }),
                    },
                    onError: {
                      target: "done",
                      actions: assign({
                        outcomes: ({ context }) => ({
                          ...context.outcomes,
                          good: "error",
                        }),
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
            bad: {
              initial: "running",
              states: {
                running: {
                  invoke: {
                    src: "badChild",
                    onDone: {
                      target: "done",
                      actions: assign({
                        outcomes: ({ context, event }) => ({
                          ...context.outcomes,
                          bad: event.output as string,
                        }),
                      }),
                    },
                    onError: {
                      target: "done",
                      actions: assign({
                        outcomes: ({ context }) => ({
                          ...context.outcomes,
                          bad: "error-caught",
                        }),
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
          },
          onDone: "join",
        },
        join: { type: "final" },
      },
    });

    const actor = createActor(machine);
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 3000,
    });

    // FINDING: With onError handlers, both children complete and the
    // parallel state transitions to join. The error is caught locally.
    expect(snap.status).toBe("done");
    expect(snap.context.outcomes.good).toBe("success");
    expect(snap.context.outcomes.bad).toBe("error-caught");
  });

  test("unhandled error (no onError) escalates and stops the machine", async () => {
    const machine = setup({
      types: {} as {
        context: { outcomes: Record<string, string> };
      },
      actors: {
        goodChild: fromPromise(async () => {
          await new Promise((r) => setTimeout(r, 200));
          return "success";
        }),
        badChild: fromPromise(async () => {
          throw new Error("unhandled explosion");
        }),
      },
    }).createMachine({
      id: "unhandled-error",
      initial: "fork",
      context: { outcomes: {} },
      states: {
        fork: {
          type: "parallel",
          states: {
            good: {
              initial: "running",
              states: {
                running: {
                  invoke: {
                    src: "goodChild",
                    onDone: {
                      target: "done",
                      actions: assign({
                        outcomes: ({ context, event }) => ({
                          ...context.outcomes,
                          good: event.output as string,
                        }),
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
            bad: {
              initial: "running",
              states: {
                running: {
                  // No onError handler — error will escalate
                  invoke: {
                    src: "badChild",
                    onDone: {
                      target: "done",
                    },
                  },
                },
                done: { type: "final" },
              },
            },
          },
          onDone: "join",
        },
        join: { type: "final" },
      },
    });

    const actor = createActor(machine);

    // FINDING: xstate v5 escalates unhandled invoke errors.
    // The actor enters an "error" status, not "done".
    let errorCaught = false;
    actor.subscribe({
      error: () => {
        errorCaught = true;
      },
    });

    actor.start();

    // Wait a bit for the error to propagate
    await new Promise((r) => setTimeout(r, 300));

    // The machine should have errored out
    expect(errorCaught).toBe(true);
    expect(actor.getSnapshot().status).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// 5. Can parallel states access and update shared context?
// ---------------------------------------------------------------------------
describe("Spike 5: Shared context updates from parallel children", () => {
  test("both children write to context.parallelOutputs and join sees both", async () => {
    interface ParallelContext {
      parallelOutputs: Record<string, unknown>;
      joinSummary: string;
    }

    const machine = setup({
      types: {} as {
        context: ParallelContext;
      },
      actors: {
        analyzer: fromPromise(async () => {
          await new Promise((r) => setTimeout(r, 30));
          return { score: 95, label: "high-quality" };
        }),
        summarizer: fromPromise(async () => {
          await new Promise((r) => setTimeout(r, 60));
          return { summary: "All systems nominal", wordCount: 3 };
        }),
      },
    }).createMachine({
      id: "shared-context",
      initial: "fork",
      context: {
        parallelOutputs: {},
        joinSummary: "",
      },
      states: {
        fork: {
          type: "parallel",
          states: {
            analyzerBranch: {
              initial: "running",
              states: {
                running: {
                  invoke: {
                    src: "analyzer",
                    onDone: {
                      target: "done",
                      actions: assign({
                        parallelOutputs: ({ context, event }) => ({
                          ...context.parallelOutputs,
                          analyzer: event.output,
                        }),
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
            summarizerBranch: {
              initial: "running",
              states: {
                running: {
                  invoke: {
                    src: "summarizer",
                    onDone: {
                      target: "done",
                      actions: assign({
                        parallelOutputs: ({ context, event }) => ({
                          ...context.parallelOutputs,
                          summarizer: event.output,
                        }),
                      }),
                    },
                  },
                },
                done: { type: "final" },
              },
            },
          },
          onDone: {
            target: "join",
            actions: assign({
              joinSummary: ({ context }) => {
                const keys = Object.keys(context.parallelOutputs);
                return `Joined ${keys.length} results: ${keys.join(", ")}`;
              },
            }),
          },
        },
        join: {
          type: "final",
        },
      },
    });

    const actor = createActor(machine);
    actor.start();

    const snap = await waitFor(actor, (s) => s.status === "done", {
      timeout: 3000,
    });

    expect(snap.status).toBe("done");

    // Both children wrote to shared context
    const outputs = snap.context.parallelOutputs;
    expect(outputs.analyzer).toEqual({ score: 95, label: "high-quality" });
    expect(outputs.summarizer).toEqual({
      summary: "All systems nominal",
      wordCount: 3,
    });

    // Join transition action had access to both results
    expect(snap.context.joinSummary).toBe(
      "Joined 2 results: analyzer, summarizer"
    );
  });
});
