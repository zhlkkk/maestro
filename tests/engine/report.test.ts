import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createEventLogger } from "../../src/engine/logger.js";
import { generateReport } from "../../src/engine/report.js";
import type { MaestroEvent } from "../../src/types.js";

let testDir: string;

beforeAll(() => {
  testDir = join(tmpdir(), `maestro-report-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function logEvents(runId: string, events: MaestroEvent[]): string {
  const logger = createEventLogger(testDir, runId);
  for (const e of events) logger.log(e);
  return logger.getFilePath();
}

describe("generateReport", () => {
  test("generates markdown report for successful pipeline", () => {
    const eventsPath = logEvents("success-run", [
      { timestamp: "2026-04-03T12:00:00Z", type: "PIPELINE_START", data: { paradigm: "TDD", task: "Add auth" } },
      { timestamp: "2026-04-03T12:00:01Z", type: "PHASE_START", phase: "WriteTests", data: { agent: "A" } },
      { timestamp: "2026-04-03T12:00:30Z", type: "PHASE_COMPLETE", phase: "WriteTests", data: { status: "complete", duration_ms: 29000 } },
      { timestamp: "2026-04-03T12:00:31Z", type: "PHASE_START", phase: "Implement", data: { agent: "B" } },
      { timestamp: "2026-04-03T12:01:00Z", type: "PHASE_COMPLETE", phase: "Implement", data: { status: "complete", duration_ms: 29000 } },
      { timestamp: "2026-04-03T12:01:01Z", type: "PIPELINE_COMPLETE", data: { final_phase: "Done" } },
    ]);

    const reportPath = generateReport(eventsPath, testDir, "success-run");
    expect(existsSync(reportPath)).toBe(true);

    const content = readFileSync(reportPath, "utf-8");
    expect(content).toContain("# Maestro Run Report");
    expect(content).toContain("**Paradigm:** TDD");
    expect(content).toContain("**Task:** Add auth");
    expect(content).toContain("✔");
    expect(content).toContain("WriteTests");
    expect(content).toContain("Implement");
  });

  test("generates report for failed pipeline with details", () => {
    const eventsPath = logEvents("fail-run", [
      { timestamp: "2026-04-03T12:00:00Z", type: "PIPELINE_START", data: { paradigm: "TDD", task: "Add auth" } },
      { timestamp: "2026-04-03T12:00:01Z", type: "PHASE_START", phase: "Review", data: { agent: "QA" } },
      { timestamp: "2026-04-03T12:00:30Z", type: "PHASE_FAILED", phase: "Review", data: { error: "Missing output file", duration_ms: 29000 } },
      { timestamp: "2026-04-03T12:00:31Z", type: "PIPELINE_FAILED", data: { error: "Pipeline ended in FAILED state" } },
    ]);

    const reportPath = generateReport(eventsPath, testDir, "fail-run");
    const content = readFileSync(reportPath, "utf-8");

    expect(content).toContain("✖");
    expect(content).toContain("Failed");
    expect(content).toContain("Failure Details");
    expect(content).toContain("Missing output file");
  });

  test("shows retries in report", () => {
    const eventsPath = logEvents("retry-run", [
      { timestamp: "2026-04-03T12:00:00Z", type: "PIPELINE_START", data: { paradigm: "TDD", task: "test" } },
      { timestamp: "2026-04-03T12:00:01Z", type: "PHASE_START", phase: "Review", data: {} },
      { timestamp: "2026-04-03T12:00:10Z", type: "PHASE_COMPLETE", phase: "Review", data: { status: "rejected", duration_ms: 9000 } },
      { timestamp: "2026-04-03T12:00:11Z", type: "PHASE_RETRY", phase: "Review", data: {} },
      { timestamp: "2026-04-03T12:00:12Z", type: "PHASE_START", phase: "Review", data: {} },
      { timestamp: "2026-04-03T12:00:20Z", type: "PHASE_COMPLETE", phase: "Review", data: { status: "approved", duration_ms: 8000 } },
      { timestamp: "2026-04-03T12:00:21Z", type: "PIPELINE_COMPLETE", data: {} },
    ]);

    const reportPath = generateReport(eventsPath, testDir, "retry-run");
    const content = readFileSync(reportPath, "utf-8");

    // Should show 1 retry
    expect(content).toContain("| 1 |");
  });
});
