import { describe, expect, test } from "bun:test";
import { getDriver, listDrivers } from "../../src/driver/registry.js";
import {
  buildCodexArgs,
  extractCodexUsage,
  parseCodexJsonLine,
} from "../../src/driver/codex.js";

describe("Codex Driver", () => {
  test("codex driver is registered in the registry", () => {
    expect(listDrivers()).toContain("codex");
  });

  test("getDriver('codex') returns a function", () => {
    const driver = getDriver("codex");
    expect(typeof driver).toBe("function");
  });

  test("runCodexAgent module exports correctly", async () => {
    const mod = await import("../../src/driver/codex.js");
    expect(typeof mod.runCodexAgent).toBe("function");
  });

  test("codex driver type is compatible with AgentDriverFn", async () => {
    const mod = await import("../../src/driver/codex.js");
    const { runCodexAgent } = mod;
    // Verify the function signature accepts the right parameters
    expect(runCodexAgent.length).toBeGreaterThanOrEqual(2); // prompt, workdir
  });
});

describe("Codex JSONL parsing", () => {
  test("buildCodexArgs uses JSON exec mode and routes workdir/model", () => {
    expect(buildCodexArgs("do work", "/tmp/repo", { model: "gpt-5" })).toEqual([
      "exec",
      "--json",
      "--ephemeral",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C",
      "/tmp/repo",
      "-m",
      "gpt-5",
      "do work",
    ]);
  });

  test("parseCodexJsonLine handles agent_message", () => {
    expect(parseCodexJsonLine(JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "hello" },
    }))).toEqual({ type: "output", text: "hello" });
  });

  test("parseCodexJsonLine handles command_execution output", () => {
    expect(parseCodexJsonLine(JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "bun test",
        aggregated_output: "pass",
      },
    }))).toEqual({ type: "output", text: "[cmd] bun test\npass" });
  });

  test("extractCodexUsage reads turn.completed usage", () => {
    expect(extractCodexUsage({
      events: [],
      rawLines: [],
      jsonLines: [
        {
          type: "turn.completed",
          model: "gpt-5",
          usage: {
            input_tokens: 123,
            output_tokens: 45,
            cost_usd: 0.0123,
          },
        },
      ],
    })).toEqual({
      tokensIn: 123,
      tokensOut: 45,
      costUsd: 0.0123,
      modelUsed: "gpt-5",
    });
  });

  test("extractCodexUsage tolerates missing or non-numeric usage fields", () => {
    expect(extractCodexUsage({
      events: [],
      rawLines: [],
      jsonLines: [
        {
          type: "turn.completed",
          usage: {
            input_tokens: "123",
            output_tokens: null,
          },
        },
      ],
    })).toEqual({});
  });
});
