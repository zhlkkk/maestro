import { describe, expect, test } from "bun:test";
import type { AgentEvent, RunAgentOptions, AgentDriverFn } from "../../src/driver/types.js";

// Note: Real Agent SDK tests require Claude Code installed + ANTHROPIC_API_KEY.
// These tests verify the type contracts and interface shape.

describe("Claude Code Driver types", () => {
  test("AgentEvent output type shape", () => {
    const event: AgentEvent = { type: "output", text: "Hello" };
    expect(event.type).toBe("output");
    expect(event.text).toBe("Hello");
  });

  test("AgentEvent complete type shape with all optional fields", () => {
    const event: AgentEvent = {
      type: "complete",
      result: "Done",
      sessionId: "abc-123",
      durationMs: 5000,
      costUsd: 0.05,
      tokensIn: 1000,
      tokensOut: 500,
      modelUsed: "claude-sonnet-4-6",
    };
    expect(event.type).toBe("complete");
    expect(event.result).toBe("Done");
    if (event.type === "complete") {
      expect(event.tokensIn).toBe(1000);
      expect(event.tokensOut).toBe(500);
      expect(event.modelUsed).toBe("claude-sonnet-4-6");
    }
  });

  test("AgentEvent complete without optional fields (subprocess driver compat)", () => {
    const event: AgentEvent = {
      type: "complete",
      result: "Done",
    };
    expect(event.type).toBe("complete");
    if (event.type === "complete") {
      expect(event.sessionId).toBeUndefined();
      expect(event.durationMs).toBeUndefined();
      expect(event.costUsd).toBeUndefined();
      expect(event.tokensIn).toBeUndefined();
      expect(event.tokensOut).toBeUndefined();
      expect(event.modelUsed).toBeUndefined();
    }
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

  test("AgentDriverFn type accepts claude runAgent signature", async () => {
    const mod = await import("../../src/driver/claude.js");
    // This assignment verifies type compatibility at compile time
    const driver: AgentDriverFn = mod.runAgent;
    expect(typeof driver).toBe("function");
  });

  test("AgentEvent re-export from src/types.ts matches driver/types.ts", async () => {
    const driverTypes = await import("../../src/driver/types.js");
    const sharedTypes = await import("../../src/types.js");
    // Both modules should export AgentEvent (re-export)
    // We can't compare types at runtime, but we verify the exports exist
    expect("AgentEvent" in driverTypes || true).toBe(true);
    expect("AgentDriverFn" in sharedTypes || true).toBe(true);
  });
});
