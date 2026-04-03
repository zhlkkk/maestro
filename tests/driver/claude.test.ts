import { describe, expect, test } from "bun:test";
import type { AgentEvent, RunAgentOptions } from "../../src/driver/types.js";

// Note: Real Agent SDK tests require Claude Code installed + ANTHROPIC_API_KEY.
// These tests verify the type contracts and interface shape.

describe("Claude Code Driver types", () => {
  test("AgentEvent output type shape", () => {
    const event: AgentEvent = { type: "output", text: "Hello" };
    expect(event.type).toBe("output");
    expect(event.text).toBe("Hello");
  });

  test("AgentEvent complete type shape", () => {
    const event: AgentEvent = {
      type: "complete",
      result: "Done",
      sessionId: "abc-123",
      durationMs: 5000,
      costUsd: 0.05,
    };
    expect(event.type).toBe("complete");
    expect(event.result).toBe("Done");
  });

  test("AgentEvent error type shape", () => {
    const event: AgentEvent = {
      type: "error",
      error: new Error("Agent crashed"),
    };
    expect(event.type).toBe("error");
    expect(event.error.message).toBe("Agent crashed");
  });

  test("RunAgentOptions defaults", () => {
    const opts: RunAgentOptions = {};
    expect(opts.systemPrompt).toBeUndefined();
    expect(opts.allowedTools).toBeUndefined();
    expect(opts.maxTurns).toBeUndefined();
  });

  test("RunAgentOptions with all fields", () => {
    const opts: RunAgentOptions = {
      systemPrompt: "You are a test agent",
      allowedTools: ["Read", "Bash"],
      maxTurns: 10,
      maxBudgetUsd: 1.0,
      model: "claude-sonnet-4-6",
      abortController: new AbortController(),
    };
    expect(opts.systemPrompt).toBe("You are a test agent");
    expect(opts.allowedTools).toHaveLength(2);
    expect(opts.maxTurns).toBe(10);
  });

  test("runAgent module exports correctly", async () => {
    const mod = await import("../../src/driver/claude.js");
    expect(typeof mod.runAgent).toBe("function");
  });
});
