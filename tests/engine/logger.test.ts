import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createEventLogger, readEvents } from "../../src/engine/logger.js";
import type { MaestroEvent } from "../../src/types.js";

let testDir: string;

beforeAll(() => {
  testDir = join(tmpdir(), `maestro-logger-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("EventLogger", () => {
  test("logs events as NDJSON", () => {
    const logger = createEventLogger(testDir, "test-run-1");

    const event1: MaestroEvent = {
      timestamp: "2026-04-03T12:00:00Z",
      type: "PIPELINE_START",
      data: { paradigm: "test" },
    };
    const event2: MaestroEvent = {
      timestamp: "2026-04-03T12:01:00Z",
      type: "PHASE_START",
      phase: "Plan",
      data: { agent: "Facilitator" },
    };

    logger.log(event1);
    logger.log(event2);

    const content = readFileSync(logger.getFilePath(), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);

    const parsed1 = JSON.parse(lines[0]!);
    expect(parsed1.type).toBe("PIPELINE_START");

    const parsed2 = JSON.parse(lines[1]!);
    expect(parsed2.type).toBe("PHASE_START");
    expect(parsed2.phase).toBe("Plan");
  });

  test("creates .maestro directory if missing", () => {
    const subDir = join(testDir, "sub");
    mkdirSync(subDir, { recursive: true });
    const logger = createEventLogger(subDir, "test-run-2");

    logger.log({
      timestamp: "2026-04-03T12:00:00Z",
      type: "PIPELINE_START",
      data: {},
    });

    const content = readFileSync(logger.getFilePath(), "utf-8");
    expect(content.trim()).not.toBe("");
  });
});

describe("readEvents", () => {
  test("reads events from JSONL file", () => {
    const logger = createEventLogger(testDir, "test-run-3");

    for (let i = 0; i < 5; i++) {
      logger.log({
        timestamp: new Date().toISOString(),
        type: "AGENT_OUTPUT",
        phase: "Code",
        data: { text: `line ${i}` },
      });
    }

    const events = readEvents(logger.getFilePath());
    expect(events).toHaveLength(5);
    expect(events[0]!.data.text).toBe("line 0");
    expect(events[4]!.data.text).toBe("line 4");
  });

  test("skips corrupted lines gracefully", () => {
    const { appendFileSync } = require("node:fs");
    const logger = createEventLogger(testDir, "test-run-4");

    logger.log({
      timestamp: "2026-04-03T12:00:00Z",
      type: "PIPELINE_START",
      data: {},
    });

    // Append a corrupted line
    appendFileSync(logger.getFilePath(), "not valid json\n");

    logger.log({
      timestamp: "2026-04-03T12:01:00Z",
      type: "PIPELINE_COMPLETE",
      data: {},
    });

    const events = readEvents(logger.getFilePath());
    expect(events).toHaveLength(2); // Corrupted line skipped
    expect(events[0]!.type).toBe("PIPELINE_START");
    expect(events[1]!.type).toBe("PIPELINE_COMPLETE");
  });

  test("returns empty array for nonexistent file", () => {
    const events = readEvents("/nonexistent/file.jsonl");
    expect(events).toHaveLength(0);
  });
});
