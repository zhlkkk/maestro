import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runPipeline } from "../../src/engine/runner.js";
import { registerDriver } from "../../src/driver/registry.js";
import type { AgentDriverFn } from "../../src/driver/types.js";
import type { ParadigmConfig } from "../../src/engine/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("runPipeline", () => {
  test("emits PHASE_RETRY when a phase reuses its worktree", async () => {
    const repoRoot = await createGitRepo();
    const driverName = uniqueDriverName("retry");
    let callCount = 0;

    registerDriver(driverName, () => async function* (_prompt, workdir) {
      callCount += 1;
      const step = [
        { file: "CODE.md", status: "complete" },
        { file: "REVIEW.md", status: "rejected" },
        { file: "CODE.md", status: "complete" },
        { file: "REVIEW.md", status: "approved" },
      ][callCount - 1];

      if (!step) throw new Error(`Unexpected driver call ${callCount}`);

      writePhaseOutput(workdir, step.file, step.status);
      yield { type: "complete", result: step.status };
    } satisfies AgentDriverFn);

    const result = await runPipeline({
      name: "Retry Runner",
      agents: {
        A: { driver: driverName },
      },
      phases: {
        Code: {
          agent: "A",
          output_file: "CODE.md",
          next: "Review",
        },
        Review: {
          agent: "A",
          output_file: "REVIEW.md",
          next_if: {
            approved: "Done",
            rejected: "Code",
          },
          max_retries: 2,
        },
        Done: { agent: "", type: "final" },
      },
    }, {
      task: "retry once",
      repoRoot,
    });

    expect(result.success).toBe(true);
    expect(callCount).toBe(4);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "PHASE_RETRY",
      phase: "Code",
      data: { attempt: 2 },
    }));
  });

  test("uses pre-fork handoff for every child and aggregates child handoffs into join", async () => {
    const repoRoot = await createGitRepo();
    const suffix = randomUUID().slice(0, 8);
    const preDriver = `test-pre-${suffix}`;
    const childADriver = `test-child-a-${suffix}`;
    const childBDriver = `test-child-b-${suffix}`;
    const joinDriver = `test-join-${suffix}`;
    const observations: Record<string, boolean> = {};

    registerDriver(preDriver, () => async function* (_prompt, workdir) {
      writeFileSync(join(workdir, "shared.txt"), "from pre", "utf-8");
      writePhaseOutput(workdir, "PRE.md", "complete", "pre-output");
      yield { type: "complete", result: "pre" };
    } satisfies AgentDriverFn);

    registerDriver(childADriver, () => async function* (prompt, workdir) {
      observations.childAReceivedPreOutput = prompt.includes("pre-output");
      observations.childAReceivedPreFile = readFileSync(join(workdir, "shared.txt"), "utf-8") === "from pre";
      observations.childADidNotReceiveSibling = !existsSync(join(workdir, "child-b.txt"));
      writeFileSync(join(workdir, "child-a.txt"), "from child A", "utf-8");
      writePhaseOutput(workdir, "A.md", "complete", "child-a-output");
      yield { type: "complete", result: "a" };
    } satisfies AgentDriverFn);

    registerDriver(childBDriver, () => async function* (prompt, workdir) {
      observations.childBReceivedPreOutput = prompt.includes("pre-output");
      observations.childBReceivedPreFile = readFileSync(join(workdir, "shared.txt"), "utf-8") === "from pre";
      observations.childBDidNotReceiveSibling = !existsSync(join(workdir, "child-a.txt"));
      writeFileSync(join(workdir, "child-b.txt"), "from child B", "utf-8");
      writePhaseOutput(workdir, "B.md", "complete", "child-b-output");
      yield { type: "complete", result: "b" };
    } satisfies AgentDriverFn);

    registerDriver(joinDriver, () => async function* (prompt, workdir) {
      observations.joinReceivedAOutput = prompt.includes("child-a-output");
      observations.joinReceivedBOutput = prompt.includes("child-b-output");
      observations.joinReceivedPreFile = readFileSync(join(workdir, "shared.txt"), "utf-8") === "from pre";
      observations.joinReceivedAFile = readFileSync(join(workdir, "child-a.txt"), "utf-8") === "from child A";
      observations.joinReceivedBFile = readFileSync(join(workdir, "child-b.txt"), "utf-8") === "from child B";
      writePhaseOutput(workdir, "JOIN.md", "complete", "joined");
      yield { type: "complete", result: "join" };
    } satisfies AgentDriverFn);

    const config: ParadigmConfig = {
      name: "Fork Runner",
      agents: {
        PreAgent: { driver: preDriver },
        ChildAAgent: { driver: childADriver },
        ChildBAgent: { driver: childBDriver },
        JoinAgent: { driver: joinDriver },
      },
      phases: {
        Pre: {
          agent: "PreAgent",
          output_file: "PRE.md",
          next: "Parallel",
        },
        Parallel: {
          agent: "",
          type: "fork",
          fork_phases: ["ChildA", "ChildB"],
          next: "Join",
        },
        ChildA: {
          agent: "ChildAAgent",
          output_file: "A.md",
        },
        ChildB: {
          agent: "ChildBAgent",
          output_file: "B.md",
        },
        Join: {
          agent: "JoinAgent",
          output_file: "JOIN.md",
          next: "Done",
        },
        Done: { agent: "", type: "final" },
      },
    };

    const result = await runPipeline(config, {
      task: "fork handoff",
      repoRoot,
    });

    expect(result.success).toBe(true);
    expect(observations).toEqual({
      childAReceivedPreOutput: true,
      childAReceivedPreFile: true,
      childADidNotReceiveSibling: true,
      childBReceivedPreOutput: true,
      childBReceivedPreFile: true,
      childBDidNotReceiveSibling: true,
      joinReceivedAOutput: true,
      joinReceivedBOutput: true,
      joinReceivedPreFile: true,
      joinReceivedAFile: true,
      joinReceivedBFile: true,
    });
  });

  test("aborts fork siblings when one child fails", async () => {
    const repoRoot = await createGitRepo();
    const suffix = randomUUID().slice(0, 8);
    const failDriver = `test-fail-${suffix}`;
    const slowDriver = `test-slow-${suffix}`;
    const observations: Record<string, boolean> = {};

    registerDriver(failDriver, () => async function* () {
      await sleep(20);
      yield { type: "error", error: new Error("child failed") };
    } satisfies AgentDriverFn);

    registerDriver(slowDriver, () => async function* (_prompt, _workdir, options) {
      observations.slowStarted = true;
      await waitForAbort(options?.abortController?.signal);
      observations.slowAborted = true;
      throw new Error("slow child aborted");
    } satisfies AgentDriverFn);

    const result = await runPipeline(forkConfig({
      childADriver: failDriver,
      childBDriver: slowDriver,
    }), {
      task: "abort sibling",
      repoRoot,
    });

    expect(result.success).toBe(false);
    expect(observations).toEqual({
      slowStarted: true,
      slowAborted: true,
    });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "PHASE_FAILED",
      phase: "ChildA",
      data: expect.objectContaining({ reason: "agent_error" }),
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "AGENT_OUTPUT",
      phase: "ChildB",
      data: expect.objectContaining({
        text: expect.stringContaining("Aborted by fork sibling ChildA"),
      }),
    }));
  });

  test("fails join when fork children modify the same handoff path", async () => {
    const repoRoot = await createGitRepo();
    const suffix = randomUUID().slice(0, 8);
    const childADriver = `test-conflict-a-${suffix}`;
    const childBDriver = `test-conflict-b-${suffix}`;
    const joinDriver = `test-conflict-join-${suffix}`;
    const observations: Record<string, boolean> = {};

    registerDriver(childADriver, () => async function* (_prompt, workdir) {
      writeFileSync(join(workdir, "shared.txt"), "from child A", "utf-8");
      writePhaseOutput(workdir, "A.md", "complete", "child-a-output");
      yield { type: "complete", result: "a" };
    } satisfies AgentDriverFn);

    registerDriver(childBDriver, () => async function* (_prompt, workdir) {
      writeFileSync(join(workdir, "shared.txt"), "from child B", "utf-8");
      writePhaseOutput(workdir, "B.md", "complete", "child-b-output");
      yield { type: "complete", result: "b" };
    } satisfies AgentDriverFn);

    registerDriver(joinDriver, () => async function* (_prompt, workdir) {
      observations.joinRan = true;
      writePhaseOutput(workdir, "JOIN.md", "complete", "joined");
      yield { type: "complete", result: "join" };
    } satisfies AgentDriverFn);

    const result = await runPipeline(forkConfig({
      childADriver,
      childBDriver,
      joinDriver,
    }), {
      task: "conflict",
      repoRoot,
    });

    expect(result.success).toBe(false);
    expect(observations.joinRan).toBeUndefined();
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "PHASE_FAILED",
      phase: "Join",
      data: expect.objectContaining({
        reason: "fork_handoff_conflict",
        conflict_path: "shared.txt",
        conflict_phases: ["ChildA", "ChildB"],
      }),
    }));
  });

  test("aborts fork siblings when one child times out", async () => {
    const repoRoot = await createGitRepo();
    const suffix = randomUUID().slice(0, 8);
    const timeoutDriver = `test-timeout-${suffix}`;
    const siblingDriver = `test-timeout-sibling-${suffix}`;
    const observations: Record<string, boolean> = {};

    registerDriver(timeoutDriver, () => async function* (_prompt, _workdir, options) {
      observations.timeoutChildStarted = true;
      await waitForAbort(options?.abortController?.signal);
      observations.timeoutChildAborted = true;
      throw new Error("timeout child aborted");
    } satisfies AgentDriverFn);

    registerDriver(siblingDriver, () => async function* (_prompt, _workdir, options) {
      observations.siblingStarted = true;
      await waitForAbort(options?.abortController?.signal);
      observations.siblingAborted = true;
      throw new Error("sibling aborted");
    } satisfies AgentDriverFn);

    const config = forkConfig({
      childADriver: timeoutDriver,
      childBDriver: siblingDriver,
    });
    config.phases.ChildA!.timeout_s = 0.05;

    const result = await runPipeline(config, {
      task: "timeout sibling",
      repoRoot,
    });

    expect(result.success).toBe(false);
    expect(observations).toEqual({
      timeoutChildStarted: true,
      timeoutChildAborted: true,
      siblingStarted: true,
      siblingAborted: true,
    });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "PHASE_TIMEOUT",
      phase: "ChildA",
    }));
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "AGENT_OUTPUT",
      phase: "ChildB",
      data: expect.objectContaining({
        text: expect.stringContaining("Aborted by fork sibling ChildA"),
      }),
    }));
  });

  test("fails join when one fork child deletes and another modifies the same path", async () => {
    const repoRoot = await createGitRepo();
    const suffix = randomUUID().slice(0, 8);
    const deleteDriver = `test-delete-${suffix}`;
    const modifyDriver = `test-modify-${suffix}`;
    const joinDriver = `test-delete-modify-join-${suffix}`;
    const observations: Record<string, boolean> = {};

    registerDriver(deleteDriver, () => async function* (_prompt, workdir) {
      rmSync(join(workdir, "README.md"));
      writePhaseOutput(workdir, "A.md", "complete", "deleted");
      yield { type: "complete", result: "deleted" };
    } satisfies AgentDriverFn);

    registerDriver(modifyDriver, () => async function* (_prompt, workdir) {
      writeFileSync(join(workdir, "README.md"), "# Changed\n", "utf-8");
      writePhaseOutput(workdir, "B.md", "complete", "modified");
      yield { type: "complete", result: "modified" };
    } satisfies AgentDriverFn);

    registerDriver(joinDriver, () => async function* (_prompt, workdir) {
      observations.joinRan = true;
      writePhaseOutput(workdir, "JOIN.md", "complete", "joined");
      yield { type: "complete", result: "join" };
    } satisfies AgentDriverFn);

    const result = await runPipeline(forkConfig({
      childADriver: deleteDriver,
      childBDriver: modifyDriver,
      joinDriver,
    }), {
      task: "delete modify conflict",
      repoRoot,
    });

    expect(result.success).toBe(false);
    expect(observations.joinRan).toBeUndefined();
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "PHASE_FAILED",
      phase: "Join",
      data: expect.objectContaining({
        reason: "fork_handoff_conflict",
        conflict_path: "README.md",
        conflict_phases: ["ChildA", "ChildB"],
      }),
    }));
  });
});

async function createGitRepo(): Promise<string> {
  const repoRoot = join(tmpdir(), `maestro-runner-test-${randomUUID().slice(0, 8)}`);
  tempDirs.push(repoRoot);
  mkdirSync(repoRoot, { recursive: true });
  writeFileSync(join(repoRoot, "README.md"), "# Test Repo\n", "utf-8");

  await run("git", ["init"], repoRoot);
  await run("git", ["add", "README.md"], repoRoot);
  await run("git", [
    "-c",
    "user.name=Maestro Test",
    "-c",
    "user.email=maestro@example.com",
    "commit",
    "-m",
    "chore: initial commit",
  ], repoRoot);

  return repoRoot;
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn([command, ...args], {
    cwd,
    stdout: "ignore",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr}`);
  }
}

function uniqueDriverName(prefix: string): string {
  return `test-${prefix}-${randomUUID().slice(0, 8)}`;
}

function forkConfig(drivers: {
  childADriver: string;
  childBDriver: string;
  joinDriver?: string;
}): ParadigmConfig {
  const joinDriver = drivers.joinDriver ?? uniqueDriverName("join-unused");
  registerDriver(joinDriver, () => async function* (_prompt, workdir) {
    writePhaseOutput(workdir, "JOIN.md", "complete", "joined");
    yield { type: "complete", result: "join" };
  } satisfies AgentDriverFn);

  return {
    name: "Fork Failure Runner",
    agents: {
      ChildAAgent: { driver: drivers.childADriver },
      ChildBAgent: { driver: drivers.childBDriver },
      JoinAgent: { driver: joinDriver },
    },
    phases: {
      Parallel: {
        agent: "",
        type: "fork",
        fork_phases: ["ChildA", "ChildB"],
        next: "Join",
      },
      ChildA: {
        agent: "ChildAAgent",
        output_file: "A.md",
      },
      ChildB: {
        agent: "ChildBAgent",
        output_file: "B.md",
      },
      Join: {
        agent: "JoinAgent",
        output_file: "JOIN.md",
        next: "Done",
      },
      Done: { agent: "", type: "final" },
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return Promise.reject(new Error("Missing abort signal"));
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function writePhaseOutput(
  workdir: string,
  fileName: string,
  status: string,
  body = ""
): void {
  writeFileSync(workdir + "/" + fileName, `---\nstatus: ${status}\n---\n\n${body}\n`, "utf-8");
}
