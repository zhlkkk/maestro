import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { readEvents } from "../../src/engine/logger.js";
import { replayCommand } from "../../src/cli/replay.js";
import type { MaestroEvent } from "../../src/types.js";

let testDir: string;

beforeAll(() => {
  testDir = join(tmpdir(), `maestro-replay-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function createEventsFile(events: MaestroEvent[]): string {
  const filePath = join(testDir, `events-${randomUUID().slice(0, 8)}.jsonl`);
  const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("replay command", () => {
  test("parses arguments and replays events at max speed", async () => {
    const events: MaestroEvent[] = [
      {
        timestamp: "2026-04-03T12:00:00Z",
        type: "PIPELINE_START",
        data: { paradigm: "test" },
      },
      {
        timestamp: "2026-04-03T12:00:01Z",
        type: "PHASE_START",
        phase: "Plan",
        data: { agent: "Facilitator" },
      },
      {
        timestamp: "2026-04-03T12:00:05Z",
        type: "PHASE_COMPLETE",
        phase: "Plan",
        data: { status: "success", duration_ms: 4000 },
      },
      {
        timestamp: "2026-04-03T12:00:06Z",
        type: "PIPELINE_COMPLETE",
        data: {},
      },
    ];

    const filePath = createEventsFile(events);
    const exitCode = await replayCommand(filePath, { speed: "max" });
    expect(exitCode).toBe(0);
  });

  test("returns error for nonexistent file", async () => {
    const exitCode = await replayCommand("/nonexistent/events.jsonl", { speed: "max" });
    expect(exitCode).toBe(2);
  });

  test("returns error for empty events file", async () => {
    const filePath = join(testDir, "empty.jsonl");
    writeFileSync(filePath, "", "utf-8");
    const exitCode = await replayCommand(filePath, { speed: "max" });
    expect(exitCode).toBe(2);
  });
});

describe("readEvents for replay", () => {
  test("correctly reads JSONL file with multiple event types", () => {
    const events: MaestroEvent[] = [
      {
        timestamp: "2026-04-03T12:00:00Z",
        type: "PIPELINE_START",
        data: { paradigm: "coder-v1" },
      },
      {
        timestamp: "2026-04-03T12:00:01Z",
        type: "PHASE_START",
        phase: "Code",
        data: { agent: "Coder" },
      },
      {
        timestamp: "2026-04-03T12:00:10Z",
        type: "AGENT_OUTPUT",
        phase: "Code",
        data: { text: "Writing code..." },
      },
      {
        timestamp: "2026-04-03T12:01:00Z",
        type: "PHASE_COMPLETE",
        phase: "Code",
        data: { status: "success", duration_ms: 59000 },
      },
      {
        timestamp: "2026-04-03T12:01:01Z",
        type: "PIPELINE_COMPLETE",
        data: {},
      },
    ];

    const filePath = createEventsFile(events);
    const result = readEvents(filePath);

    expect(result).toHaveLength(5);
    expect(result[0]!.type).toBe("PIPELINE_START");
    expect(result[0]!.data.paradigm).toBe("coder-v1");
    expect(result[1]!.type).toBe("PHASE_START");
    expect(result[1]!.phase).toBe("Code");
    expect(result[2]!.type).toBe("AGENT_OUTPUT");
    expect(result[2]!.data.text).toBe("Writing code...");
    expect(result[3]!.type).toBe("PHASE_COMPLETE");
    expect(result[3]!.data.duration_ms).toBe(59000);
    expect(result[4]!.type).toBe("PIPELINE_COMPLETE");
  });

  test("preserves event timestamps for replay timing", () => {
    const events: MaestroEvent[] = [
      {
        timestamp: "2026-04-03T12:00:00.000Z",
        type: "PHASE_START",
        phase: "Plan",
        data: {},
      },
      {
        timestamp: "2026-04-03T12:00:05.500Z",
        type: "PHASE_COMPLETE",
        phase: "Plan",
        data: { status: "success", duration_ms: 5500 },
      },
    ];

    const filePath = createEventsFile(events);
    const result = readEvents(filePath);

    expect(result).toHaveLength(2);
    // Verify timestamps are preserved for replay timing calculation
    const t0 = new Date(result[0]!.timestamp).getTime();
    const t1 = new Date(result[1]!.timestamp).getTime();
    expect(t1 - t0).toBe(5500);
  });
});
