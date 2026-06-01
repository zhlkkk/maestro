import { describe, expect, test } from "bun:test";
import { parseParadigm } from "../../src/engine/parser.js";
import { validateParadigm } from "../../src/engine/validator.js";

function validate(yaml: string) {
  const config = parseParadigm(yaml);
  return validateParadigm(config);
}

function expectError(yaml: string, pattern: RegExp) {
  const errors = validate(yaml);
  const match = errors.find((e) => pattern.test(e.message));
  expect(match).toBeDefined();
  return match!;
}

function expectNoErrors(yaml: string) {
  const errors = validate(yaml);
  expect(errors).toHaveLength(0);
}

const VALID = `
name: "Valid"
agents:
  Worker:
    driver: claude-code
phases:
  Work:
    agent: Worker
    output_file: RESULT.md
    next: Done
  Done:
    type: final
`;

describe("validateParadigm", () => {
  test("valid minimal paradigm passes", () => {
    expectNoErrors(VALID);
  });

  test("valid full paradigm with routing passes", () => {
    expectNoErrors(`
name: "Full"
agents:
  PM:
    driver: claude-code
  Dev:
    driver: claude-code
  QA:
    driver: claude-code
phases:
  Plan:
    agent: PM
    output_file: PLAN.md
    next: Code
  Code:
    agent: Dev
    output_file: CODE.md
    next: Review
  Review:
    agent: QA
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Code
    max_retries: 3
  Done:
    type: final
handoff_routing:
  PM: [Dev]
  Dev: [QA, PM]
  QA: [Dev, PM]
`);
  });

  test("nonexistent agent reference in phase", () => {
    expectError(
      `
name: "Bad"
agents:
  Worker:
    driver: claude-code
phases:
  Work:
    agent: Ghost
    output_file: RESULT.md
    next: Done
  Done:
    type: final
`,
      /nonexistent agent "Ghost"/
    );
  });

  test("nonexistent phase in next target", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Work:
    agent: A
    output_file: out.md
    next: Nowhere
  Done:
    type: final
`,
      /Target phase "Nowhere" does not exist/
    );
  });

  test("nonexistent phase in next_if target", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Review:
    agent: A
    output_file: out.md
    next_if:
      approved: Done
      rejected: Ghost
  Done:
    type: final
`,
      /Target phase "Ghost" does not exist/
    );
  });

  test("missing output_file on non-final phase", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Work:
    agent: A
    next: Done
  Done:
    type: final
`,
      /must have an output_file/
    );
  });

  test("phase without next, next_if, or final type", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Orphan:
    agent: A
    output_file: out.md
  Done:
    type: final
`,
      /must have 'next', 'next_if', or 'type: final'/
    );
  });

  test("no final phase", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Loop:
    agent: A
    output_file: out.md
    next: Loop
`,
      /must have type: final/
    );
  });

  test("unsupported maestro_version", () => {
    expectError(
      `
name: "Bad"
maestro_version: "2"
agents:
  A:
    driver: test
phases:
  Done:
    type: final
`,
      /Unsupported paradigm schema version "2"/
    );
  });

  test("valid metadata fields pass", () => {
    expectNoErrors(`
name: "Metadata"
maestro_version: "1"
version: "0.1.0"
author: "Maestro Team"
tags: ["automation", "review"]
license: "MIT"
homepage: "https://example.com"
agents:
  A:
    driver: test
phases:
  Done:
    type: final
`);
  });

  test("invalid metadata fields report validation errors", () => {
    const errors = validate(`
name: "Metadata"
version: ""
tags: []
agents:
  A:
    driver: test
phases:
  Done:
    type: final
`);

    expect(errors).toContainEqual({
      path: "version",
      message: "version must be a non-empty string when provided",
    });
    expect(errors).toContainEqual({
      path: "tags",
      message: "tags must be a non-empty string array when provided",
    });
  });

  test("non-string metadata tags report validation errors", () => {
    const errors = validate(`
name: "Metadata"
tags: ["ok", 42]
agents:
  A:
    driver: test
phases:
  Done:
    type: final
`);

    expect(errors).toContainEqual({
      path: "tags",
      message: "tags must be a non-empty string array when provided",
    });
  });

  test("generic-cli agent requires command", () => {
    const error = expectError(
      `
name: "Generic"
agents:
  A:
    driver: generic-cli
phases:
  Work:
    agent: A
    output_file: out.md
    next: Done
  Done:
    type: final
`,
      /generic-cli agents must define/
    );

    expect(error.path).toBe("agents.A.command");
  });

  test("generic-cli agent with command passes", () => {
    expectNoErrors(`
name: "Generic"
agents:
  A:
    driver: generic-cli
    command: ["/bin/sh", "-c", "true"]
phases:
  Work:
    agent: A
    output_file: out.md
    next: Done
  Done:
    type: final
`);
  });

  test("handoff_routing references nonexistent agent", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Done:
    type: final
handoff_routing:
  Ghost: [A]
`,
      /Source agent "Ghost" does not exist/
    );
  });

  test("handoff_routing target agent does not exist", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Done:
    type: final
handoff_routing:
  A: [Ghost]
`,
      /Target agent "Ghost" does not exist/
    );
  });

  test("circular reference without exit detected", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  X:
    agent: A
    output_file: out.md
    next: Y
  Y:
    agent: A
    output_file: out.md
    next: X
`,
      /Circular reference detected/
    );
  });

  test("circular reference WITH max_retries is allowed", () => {
    expectNoErrors(`
name: "OK"
agents:
  A:
    driver: test
  B:
    driver: test
phases:
  Code:
    agent: A
    output_file: CODE.md
    next: Review
  Review:
    agent: B
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Code
    max_retries: 3
  Done:
    type: final
`);
  });

  test("circular reference WITH exit path is allowed", () => {
    expectNoErrors(`
name: "OK"
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
  Done:
    type: final
`);
  });

  test("handoff_routing violation detected", () => {
    expectError(
      `
name: "Bad"
agents:
  PM:
    driver: test
  Dev:
    driver: test
  QA:
    driver: test
phases:
  Plan:
    agent: PM
    output_file: PLAN.md
    next: Review
  Review:
    agent: QA
    output_file: REVIEW.md
    next: Done
  Done:
    type: final
handoff_routing:
  PM: [Dev]
  Dev: [QA]
  QA: [Dev]
`,
      /violates handoff_routing/
    );
  });

  // Fork phase validation
  test("valid fork phase with child phases passes", () => {
    expectNoErrors(`
name: "ForkValid"
agents:
  Worker:
    driver: claude-code
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
`);
  });

  test("fork phase missing phases list", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Fork:
    type: fork
    next: Done
  Done:
    type: final
`,
      /must list child phases/
    );
  });

  test("fork phase references nonexistent child", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Fork:
    type: fork
    phases: [Ghost]
    next: Done
  Done:
    type: final
`,
      /Fork child "Ghost" does not exist/
    );
  });

  test("nested fork not allowed", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Outer:
    type: fork
    phases: [Inner]
    next: Done
  Inner:
    type: fork
    phases: [Done]
    next: Done
  Done:
    type: final
`,
      /Nested fork not supported/
    );
  });

  test("fork child with next_if not allowed", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Fork:
    type: fork
    phases: [Child]
    next: Done
  Child:
    agent: A
    output_file: out.md
    next_if:
      ok: Done
      fail: Done
  Done:
    type: final
`,
      /cannot use next_if/
    );
  });

  test("fork phase without next (join target) is invalid", () => {
    expectError(
      `
name: "Bad"
agents:
  A:
    driver: test
phases:
  Fork:
    type: fork
    phases: [Child]
  Child:
    agent: A
    output_file: out.md
  Done:
    type: final
`,
      /must have 'next' to specify the join target/
    );
  });
});
