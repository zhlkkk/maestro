import { describe, expect, test } from "bun:test";
import { parseParadigm, ParserError } from "../../src/engine/parser.js";

const MINIMAL_PARADIGM = `
name: "Test"
agents:
  Worker:
    driver: claude-code
phases:
  DoWork:
    agent: Worker
    output_file: RESULT.md
    next: Done
  Done:
    type: final
`;

const FULL_PARADIGM = `
name: "Full Team"
description: "A full test paradigm"
agents:
  Facilitator:
    description: "Project lead"
    driver: claude-code
    system_prompt: "You are a facilitator"
    tools: [handoff, bash]
  Engineer:
    description: "Coder"
    driver: claude-code
    system_prompt_file: prompts/engineer.md
  Reviewer:
    description: "QA"
    driver: claude-code
phases:
  Plan:
    agent: Facilitator
    prompt_file: prompts/plan.md
    output_file: PLAN.md
    next: Code
  Code:
    agent: Engineer
    prompt_file: prompts/code.md
    output_file: CODE_DONE.md
    next: Review
  Review:
    agent: Reviewer
    prompt_file: prompts/review.md
    output_file: REVIEW.md
    next_if:
      approved: Done
      rejected: Code
    max_retries: 3
  Done:
    type: final
handoff_routing:
  Facilitator: [Engineer]
  Engineer: [Reviewer, Facilitator]
  Reviewer: [Engineer, Facilitator]
`;

describe("parseParadigm", () => {
  test("parses minimal paradigm", () => {
    const config = parseParadigm(MINIMAL_PARADIGM);
    expect(config.name).toBe("Test");
    expect(Object.keys(config.agents)).toEqual(["Worker"]);
    expect(Object.keys(config.phases)).toEqual(["DoWork", "Done"]);
    expect(config.phases.DoWork?.next).toBe("Done");
    expect(config.phases.Done?.type).toBe("final");
  });

  test("parses full paradigm with 3 agents, 4 phases, routing", () => {
    const config = parseParadigm(FULL_PARADIGM);
    expect(config.name).toBe("Full Team");
    expect(config.description).toBe("A full test paradigm");
    expect(Object.keys(config.agents)).toHaveLength(3);
    expect(Object.keys(config.phases)).toHaveLength(4);
    expect(config.agents.Facilitator?.system_prompt).toBe("You are a facilitator");
    expect(config.agents.Engineer?.system_prompt_file).toContain("prompts/engineer.md");
    expect(config.agents.Facilitator?.tools).toEqual(["handoff", "bash"]);
    expect(config.phases.Review?.next_if).toEqual({ approved: "Done", rejected: "Code" });
    expect(config.phases.Review?.max_retries).toBe(3);
    expect(config.handoff_routing?.Facilitator).toEqual(["Engineer"]);
  });

  test("handles inline system_prompt and system_prompt_file", () => {
    const config = parseParadigm(FULL_PARADIGM);
    expect(config.agents.Facilitator?.system_prompt).toBe("You are a facilitator");
    expect(config.agents.Facilitator?.system_prompt_file).toBeUndefined();
    expect(config.agents.Engineer?.system_prompt).toBeUndefined();
    expect(config.agents.Engineer?.system_prompt_file).toBeDefined();
  });

  test("throws on malformed YAML", () => {
    expect(() => parseParadigm("{{invalid yaml:")).toThrow(ParserError);
    expect(() => parseParadigm("{{invalid yaml:")).toThrow(/YAML parse error/);
  });

  test("throws on missing name field", () => {
    expect(() =>
      parseParadigm(`
agents:
  A:
    driver: test
phases:
  P:
    agent: A
    output_file: out.md
    next: Done
  Done:
    type: final
`)
    ).toThrow(/Missing required field 'name'/);
  });

  test("throws on missing agents section", () => {
    expect(() => parseParadigm(`name: "Test"\nphases:\n  Done:\n    type: final`)).toThrow(
      /Missing or invalid 'agents'/
    );
  });

  test("throws on missing phases section", () => {
    expect(() =>
      parseParadigm(`name: "Test"\nagents:\n  A:\n    driver: test`)
    ).toThrow(/Missing or invalid 'phases'/);
  });

  test("defaults maestro_version to undefined when absent", () => {
    const config = parseParadigm(MINIMAL_PARADIGM);
    expect(config.maestro_version).toBeUndefined();
  });

  test("parses maestro_version when present", () => {
    const config = parseParadigm(`
name: "Versioned"
maestro_version: "1"
agents:
  A:
    driver: test
phases:
  Done:
    type: final
`);
    expect(config.maestro_version).toBe("1");
  });

  test("parses phase-level model field", () => {
    const config = parseParadigm(`
name: "ModelRouting"
agents:
  Worker:
    driver: claude-code
phases:
  DoWork:
    agent: Worker
    output_file: RESULT.md
    model: "gpt-4o"
    next: Done
  Done:
    type: final
`);
    expect(config.phases.DoWork?.model).toBe("gpt-4o");
    expect(config.phases.Done?.model).toBeUndefined();
  });

  test("parses agent-level model field", () => {
    const config = parseParadigm(`
name: "AgentModel"
agents:
  Worker:
    driver: claude-code
    model: "claude-sonnet"
phases:
  DoWork:
    agent: Worker
    output_file: RESULT.md
    next: Done
  Done:
    type: final
`);
    expect(config.agents.Worker?.model).toBe("claude-sonnet");
  });

  test("backward compat: paradigm without model fields parses correctly", () => {
    const config = parseParadigm(MINIMAL_PARADIGM);
    expect(config.agents.Worker?.model).toBeUndefined();
    expect(config.phases.DoWork?.model).toBeUndefined();
    expect(config.phases.Done?.model).toBeUndefined();
  });
});
