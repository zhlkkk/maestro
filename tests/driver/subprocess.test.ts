import { describe, expect, test } from "bun:test";
import { createSubprocessDriver, type SubprocessDriverConfig } from "../../src/driver/subprocess.js";
import type { AgentEvent } from "../../src/driver/types.js";

describe("Subprocess Driver", () => {
  test("spawns echo command and receives output + complete", async () => {
    const driver = createSubprocessDriver({
      command: "echo",
      buildArgs: (prompt) => [prompt],
      parseLine: null as any, // no JSON parsing
    });

    const events: AgentEvent[] = [];
    for await (const event of driver("hello world", "/tmp")) {
      events.push(event);
    }

    const outputEvents = events.filter((e) => e.type === "output");
    const completeEvents = events.filter((e) => e.type === "complete");

    expect(outputEvents.length).toBeGreaterThanOrEqual(1);
    expect(completeEvents).toHaveLength(1);
    expect(outputEvents[0].type === "output" && outputEvents[0].text).toContain("hello world");
  });

  test("non-zero exit code yields error event with stderr", async () => {
    const driver = createSubprocessDriver({
      command: "bash",
      buildArgs: () => ["-c", "echo 'oops' >&2; exit 1"],
      parseLine: null as any,
    });

    const events: AgentEvent[] = [];
    for await (const event of driver("test", "/tmp")) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    if (errorEvents[0].type === "error") {
      expect(errorEvents[0].error.message).toContain("exited with code 1");
      expect(errorEvents[0].error.message).toContain("oops");
    }
  });

  test("command not found yields error event", async () => {
    const driver = createSubprocessDriver({
      command: "nonexistent_command_xyz",
      buildArgs: () => [],
      parseLine: null as any,
    });

    const events: AgentEvent[] = [];
    for await (const event of driver("test", "/tmp")) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
  });

  test("empty stdout yields complete with empty result", async () => {
    const driver = createSubprocessDriver({
      command: "true",
      buildArgs: () => [],
      parseLine: null as any,
    });

    const events: AgentEvent[] = [];
    for await (const event of driver("test", "/tmp")) {
      events.push(event);
    }

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
    if (complete?.type === "complete") {
      expect(complete.result).toBe("");
    }
  });

  test("parseJsonLine mode parses structured output", async () => {
    const driver = createSubprocessDriver({
      command: "bash",
      buildArgs: () => ["-c", 'echo \'{"type":"msg","text":"hello"}\'; echo \'{"type":"done"}\''],
      parseJsonLine: (line) => {
        try {
          const data = JSON.parse(line);
          if (data.type === "msg") return { type: "output", text: data.text };
          return null;
        } catch {
          return null;
        }
      },
    });

    const events: AgentEvent[] = [];
    for await (const event of driver("test", "/tmp")) {
      events.push(event);
    }

    const outputs = events.filter((e) => e.type === "output");
    expect(outputs).toHaveLength(1);
    if (outputs[0].type === "output") {
      expect(outputs[0].text).toBe("hello");
    }
  });

  test("abort controller terminates process", async () => {
    const ac = new AbortController();
    const driver = createSubprocessDriver({
      command: "sleep",
      buildArgs: () => ["60"],
      parseLine: null as any,
    });

    // Abort after 100ms
    setTimeout(() => ac.abort(), 100);

    const events: AgentEvent[] = [];
    for await (const event of driver("test", "/tmp", { abortController: ac })) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toHaveLength(1);
    if (errorEvents[0].type === "error") {
      expect(errorEvents[0].error.message).toContain("aborted");
    }
  });

  test("extractUsage populates complete event", async () => {
    const driver = createSubprocessDriver({
      command: "echo",
      buildArgs: () => ["done"],
      parseJsonLine: undefined,
      extractUsage: () => ({ tokensIn: 100, tokensOut: 50, costUsd: 0.01 }),
    });

    const events: AgentEvent[] = [];
    for await (const event of driver("test", "/tmp")) {
      events.push(event);
    }

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
    if (complete?.type === "complete") {
      expect(complete.tokensIn).toBe(100);
      expect(complete.tokensOut).toBe(50);
      expect(complete.costUsd).toBe(0.01);
    }
  });
});
