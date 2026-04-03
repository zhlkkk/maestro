import { describe, expect, test } from "bun:test";
import { parseParadigm } from "../../src/engine/parser.js";
import { dryRun, formatDryRunOutput } from "../../src/engine/dry-run.js";

describe("dryRun", () => {
  test("valid paradigm passes", () => {
    const config = parseParadigm(`
name: "Test"
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
    const result = dryRun(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.phases).toHaveLength(2);
  });

  test("invalid paradigm returns errors", () => {
    const config = parseParadigm(`
name: "Bad"
agents:
  A:
    driver: test
phases:
  Work:
    agent: Ghost
    output_file: out.md
    next: Done
  Done:
    type: final
`);
    const result = dryRun(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Ghost");
  });

  test("detects unreachable phases", () => {
    const config = parseParadigm(`
name: "Unreachable"
agents:
  A:
    driver: test
phases:
  Start:
    agent: A
    output_file: out.md
    next: Done
  Orphan:
    agent: A
    output_file: out.md
    next: Done
  Done:
    type: final
`);
    const result = dryRun(config);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Orphan");
    expect(result.warnings[0]).toContain("unreachable");
  });

  test("reports phase transitions correctly", () => {
    const config = parseParadigm(`
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
`);
    const result = dryRun(config);
    expect(result.valid).toBe(true);

    const reviewPhase = result.phases.find((p) => p.name === "Review");
    expect(reviewPhase).toBeDefined();
    expect(reviewPhase!.transitions).toHaveLength(2);
    expect(reviewPhase!.hasRetryLimit).toBe(true);
  });

  test("formatDryRunOutput for valid paradigm", () => {
    const config = parseParadigm(`
name: "Test"
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
    const result = dryRun(config);
    const output = formatDryRunOutput(result);
    expect(output).toContain("✔ Paradigm is valid");
    expect(output).toContain("Work");
    expect(output).toContain("Done");
  });

  test("formatDryRunOutput for invalid paradigm", () => {
    const config = parseParadigm(`
name: "Bad"
agents:
  A:
    driver: test
phases:
  Work:
    agent: Ghost
    output_file: out.md
    next: Done
  Done:
    type: final
`);
    const result = dryRun(config);
    const output = formatDryRunOutput(result);
    expect(output).toContain("✖ Validation FAILED");
  });
});
