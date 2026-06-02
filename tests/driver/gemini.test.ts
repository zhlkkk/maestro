import { describe, expect, test } from "bun:test";
import { getDriver, listDrivers } from "../../src/driver/registry.js";
import { buildGeminiArgs } from "../../src/driver/gemini.js";

describe("Gemini Driver", () => {
  test("gemini driver is registered in the registry", () => {
    expect(listDrivers()).toContain("gemini");
  });

  test("getDriver('gemini') returns a function", () => {
    const driver = getDriver("gemini");
    expect(typeof driver).toBe("function");
  });

  test("runGeminiAgent module exports correctly", async () => {
    const mod = await import("../../src/driver/gemini.js");
    expect(typeof mod.runGeminiAgent).toBe("function");
  });

  test("buildGeminiArgs uses Gemini 0.42 headless prompt mode", () => {
    expect(buildGeminiArgs("do work", "/tmp/repo", {})).toEqual([
      "--prompt",
      "do work",
    ]);
  });

  test("buildGeminiArgs includes model override when provided", () => {
    expect(buildGeminiArgs("do work", "/tmp/repo", { model: "gemini-2.5-pro" })).toEqual([
      "--prompt",
      "do work",
      "--model",
      "gemini-2.5-pro",
    ]);
  });
});
