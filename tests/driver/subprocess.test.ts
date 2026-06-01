import { describe, expect, test } from "bun:test";
import {
  createSubprocessDriver,
  type SubprocessDriverConfig,
} from "../../src/driver/subprocess.js";
import type { AgentEvent, AgentDriverFn } from "../../src/driver/types.js";

/** Collect all events from an async generator into an array. */
async function collectEvents(
  gen: AsyncGenerator<AgentEvent>
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/** Minimal config that spawns a shell command via /bin/sh -c. */
function shellDriver(shellCmd: string): SubprocessDriverConfig {
  return {
    command: "/bin/sh",
    buildArgs: () => ["-c", shellCmd],
  };
}

describe("createSubprocessDriver", () => {
  test("returns a function matching AgentDriverFn", () => {
    const driver: AgentDriverFn = createSubprocessDriver(
      shellDriver("echo hi")
    );
    expect(typeof driver).toBe("function");
  });

  test("happy path: echo produces output + complete events", async () => {
    const driver = createSubprocessDriver(shellDriver('echo "hello world"'));
    const events = await collectEvents(driver("ignored", "/tmp"));

    const outputs = events.filter((e) => e.type === "output");
    const completes = events.filter((e) => e.type === "complete");

    expect(outputs.length).toBeGreaterThanOrEqual(1);
    expect(completes).toHaveLength(1);

    // The output text should contain "hello world"
    const allText = outputs
      .map((e) => (e.type === "output" ? e.text : ""))
      .join("\n");
    expect(allText).toContain("hello world");

    // Complete event should have the result
    const complete = completes[0]!;
    if (complete.type === "complete") {
      expect(complete.result).toContain("hello world");
    }
  });

  test("multiline output yields one event per line", async () => {
    const driver = createSubprocessDriver(
      shellDriver('printf "line1\\nline2\\nline3\\n"')
    );
    const events = await collectEvents(driver("ignored", "/tmp"));

    const outputs = events.filter((e) => e.type === "output");
    expect(outputs).toHaveLength(3);
    expect(outputs.map((e) => (e.type === "output" ? e.text : ""))).toEqual([
      "line1",
      "line2",
      "line3",
    ]);
  });

  test("error path: non-zero exit yields error event with stderr", async () => {
    const driver = createSubprocessDriver(
      shellDriver('echo "oops" >&2; exit 1')
    );
    const events = await collectEvents(driver("ignored", "/tmp"));

    const errors = events.filter((e) => e.type === "error");
    expect(errors).toHaveLength(1);

    const err = errors[0]!;
    if (err.type === "error") {
      expect(err.error.message).toContain("exited with code 1");
      expect(err.error.message).toContain("oops");
    }
  });

  test("error path: command not found yields error event", async () => {
    const config: SubprocessDriverConfig = {
      command: "__nonexistent_command_maestro_test__",
      buildArgs: () => [],
    };
    const driver = createSubprocessDriver(config);
    const events = await collectEvents(driver("ignored", "/tmp"));

    const errors = events.filter((e) => e.type === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);

    const err = errors[0]!;
    expect(err.type).toBe("error");
  });

  test("empty stdout yields complete with empty result", async () => {
    const driver = createSubprocessDriver(shellDriver("true"));
    const events = await collectEvents(driver("ignored", "/tmp"));

    const outputs = events.filter((e) => e.type === "output");
    const completes = events.filter((e) => e.type === "complete");

    expect(outputs).toHaveLength(0);
    expect(completes).toHaveLength(1);

    if (completes[0]!.type === "complete") {
      expect(completes[0]!.result).toBe("");
    }
  });

  test("AbortController abort terminates the process", async () => {
    const abortController = new AbortController();

    // Long-running process
    const driver = createSubprocessDriver(shellDriver("sleep 60"));

    const eventPromise = collectEvents(
      driver("ignored", "/tmp", { abortController })
    );

    // Abort after a short delay
    setTimeout(() => abortController.abort(), 100);

    const events = await eventPromise;

    const errors = events.filter((e) => e.type === "error");
    expect(errors).toHaveLength(1);

    if (errors[0]!.type === "error") {
      expect(errors[0]!.error.message).toContain("aborted");
    }
  });

  test("parseJsonLine is used when provided", async () => {
    // Emit JSON lines from the subprocess
    const driver = createSubprocessDriver({
      command: "/bin/sh",
      buildArgs: () => [
        "-c",
        'echo \'{"type":"output","text":"parsed"}\'; echo \'{"type":"output","text":"also parsed"}\'',
      ],
      parseJsonLine: (line: string) => {
        try {
          const obj = JSON.parse(line);
          if (obj.type === "output" && typeof obj.text === "string") {
            return { type: "output", text: obj.text };
          }
        } catch {
          // Not valid JSON — skip.
        }
        return null;
      },
    });

    const events = await collectEvents(driver("ignored", "/tmp"));

    const outputs = events.filter((e) => e.type === "output");
    expect(outputs).toHaveLength(2);
    expect(outputs.map((e) => (e.type === "output" ? e.text : ""))).toEqual([
      "parsed",
      "also parsed",
    ]);
  });

  test("extractUsage populates complete event metrics", async () => {
    const driver = createSubprocessDriver({
      command: "/bin/sh",
      buildArgs: () => ["-c", 'echo "done"'],
      extractUsage: () => ({
        tokensIn: 100,
        tokensOut: 200,
        costUsd: 0.01,
      }),
    });

    const events = await collectEvents(driver("ignored", "/tmp"));

    const completes = events.filter((e) => e.type === "complete");
    expect(completes).toHaveLength(1);

    const complete = completes[0]!;
    if (complete.type === "complete") {
      expect(complete.tokensIn).toBe(100);
      expect(complete.tokensOut).toBe(200);
      expect(complete.costUsd).toBe(0.01);
    }
  });

  test("extractUsage receives raw and parsed JSON lines", async () => {
    let receivedRawLines: string[] = [];
    let receivedJsonLines: unknown[] = [];

    const driver = createSubprocessDriver({
      command: "/bin/sh",
      buildArgs: () => [
        "-c",
        'printf \'{"type":"item.completed","usage":{"input_tokens":12}}\\nplain\\n\'',
      ],
      parseJsonLine: () => null,
      extractUsage: ({ rawLines, jsonLines }) => {
        receivedRawLines = rawLines;
        receivedJsonLines = jsonLines;
        return {
          tokensIn: 12,
          modelUsed: "gpt-test",
        };
      },
    });

    const events = await collectEvents(driver("ignored", "/tmp"));
    const complete = events.find((event) => event.type === "complete");

    expect(receivedRawLines).toEqual([
      '{"type":"item.completed","usage":{"input_tokens":12}}',
      "plain",
    ]);
    expect(receivedJsonLines).toEqual([
      { type: "item.completed", usage: { input_tokens: 12 } },
    ]);
    expect(complete).toMatchObject({
      type: "complete",
      tokensIn: 12,
      modelUsed: "gpt-test",
    });
  });

  test("buildEnv merges environment variables into subprocess", async () => {
    const driver = createSubprocessDriver({
      command: "/bin/sh",
      buildArgs: () => ["-c", 'printf "%s" "$MAESTRO_TEST_ENV"'],
      buildEnv: () => ({ MAESTRO_TEST_ENV: "available" }),
    });

    const events = await collectEvents(driver("ignored", "/tmp"));
    const complete = events.find((event) => event.type === "complete");

    expect(complete).toMatchObject({
      type: "complete",
      result: "available",
    });
  });

  test("buildArgs receives prompt, workdir, and options", async () => {
    let receivedPrompt = "";
    let receivedWorkdir = "";
    let receivedOptions: unknown = null;

    const driver = createSubprocessDriver({
      command: "/bin/sh",
      buildArgs: (prompt, workdir, options) => {
        receivedPrompt = prompt;
        receivedWorkdir = workdir;
        receivedOptions = options;
        return ["-c", "true"];
      },
    });

    await collectEvents(
      driver("test prompt", "/test/dir", { maxTurns: 5 })
    );

    expect(receivedPrompt).toBe("test prompt");
    expect(receivedWorkdir).toBe("/test/dir");
    expect(receivedOptions).toEqual({ maxTurns: 5 });
  });
});
