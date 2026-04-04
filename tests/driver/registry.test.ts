import { describe, expect, test } from "bun:test";
import {
  registerDriver,
  getDriver,
  listDrivers,
  validateDrivers,
} from "../../src/driver/registry.js";
import type { AgentDriverFn } from "../../src/driver/types.js";

// Stub driver for testing
async function* stubDriver(): AsyncGenerator<any> {
  yield { type: "output", text: "stub" };
  yield { type: "complete", result: "done" };
}

describe("Driver Registry", () => {
  test("claude-code driver is registered by default", () => {
    const drivers = listDrivers();
    expect(drivers).toContain("claude-code");
  });

  test("getDriver returns claude-code driver", () => {
    const driver = getDriver("claude-code");
    expect(typeof driver).toBe("function");
  });

  test("getDriver throws for unknown driver with available list", () => {
    expect(() => getDriver("nonexistent")).toThrow(
      /Unknown driver "nonexistent"/
    );
    expect(() => getDriver("nonexistent")).toThrow(/claude-code/);
  });

  test("registerDriver adds a new driver", () => {
    registerDriver("test-stub", () => stubDriver as AgentDriverFn);
    const driver = getDriver("test-stub");
    expect(typeof driver).toBe("function");
    expect(listDrivers()).toContain("test-stub");
  });

  test("registerDriver overwrites existing registration", () => {
    let callCount = 0;
    const factory1: AgentDriverFn = stubDriver as any;
    const factory2: AgentDriverFn = function* () {
      callCount++;
    } as any;

    registerDriver("overwrite-test", () => factory1);
    registerDriver("overwrite-test", () => factory2);

    const driver = getDriver("overwrite-test");
    expect(driver).toBe(factory2);
  });

  test("validateDrivers passes for registered drivers", () => {
    expect(() => validateDrivers(["claude-code"])).not.toThrow();
  });

  test("validateDrivers throws for unregistered drivers", () => {
    expect(() => validateDrivers(["claude-code", "unknown-driver"])).toThrow(
      /Unregistered driver\(s\): unknown-driver/
    );
  });

  test("validateDrivers lists available drivers in error", () => {
    expect(() => validateDrivers(["bad"])).toThrow(/Available:/);
    expect(() => validateDrivers(["bad"])).toThrow(/claude-code/);
  });

  test("validateDrivers passes for empty array", () => {
    expect(() => validateDrivers([])).not.toThrow();
  });
});
