import { describe, expect, test } from "bun:test";
import { getDriver, listDrivers } from "../../src/driver/registry.js";

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
});
