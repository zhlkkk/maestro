import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGenericCliAgent } from "../../src/driver/generic-cli.js";
import type { AgentEvent } from "../../src/driver/types.js";

async function collectEvents(
  gen: AsyncGenerator<AgentEvent>
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

describe("runGenericCliAgent", () => {
  test("runs a command in the worktree with Maestro environment variables", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "maestro-generic-cli-test-"));

    try {
      const events = await collectEvents(
        runGenericCliAgent("hello from prompt", workdir, {
          command: [
            "/bin/sh",
            "-c",
            [
              'printf "stdout:"',
              'cat "$MAESTRO_PROMPT_FILE"',
              'printf "%s" "$MAESTRO_MODEL" > model.txt',
              'printf "status: approved\\n\\nDone\\n" > "$MAESTRO_OUTPUT_FILE"',
            ].join("; "),
          ],
          outputFile: "RESULT.md",
          model: "test-model",
        })
      );

      const output = events.find((event) => event.type === "output");
      const complete = events.find((event) => event.type === "complete");

      expect(output).toMatchObject({
        type: "output",
        text: "stdout:hello from prompt",
      });
      expect(complete).toMatchObject({
        type: "complete",
        result: "stdout:hello from prompt",
      });
      expect(readFileSync(join(workdir, "RESULT.md"), "utf-8")).toContain("Done");
      expect(readFileSync(join(workdir, "model.txt"), "utf-8")).toBe("test-model");
    } finally {
      rmSync(workdir, { recursive: true, force: true });
    }
  });

  test("returns an error event when command is missing", async () => {
    const events = await collectEvents(
      runGenericCliAgent("prompt", "/tmp", {})
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "error",
      error: expect.objectContaining({
        message: "generic-cli requires a non-empty command array",
      }),
    });
  });
});
