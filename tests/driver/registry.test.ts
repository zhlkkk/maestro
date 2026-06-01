import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  registerDriver,
  getDriver,
  listDrivers,
  validateDrivers,
  loadDriverPlugin,
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

  test("generic-cli driver is registered by default", () => {
    const drivers = listDrivers();
    expect(drivers).toContain("generic-cli");
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

  test("loadDriverPlugin registers a local module export", async () => {
    const dir = mkdtempSync(join(tmpdir(), "maestro-driver-plugin-test-"));
    const pluginPath = join(dir, "plugin.js");

    try {
      writeFileSync(
        pluginPath,
        `export async function* runAgent() {
  yield { type: "output", text: "plugin" };
  yield { type: "complete", result: "done" };
}
`,
        "utf-8"
      );

      await loadDriverPlugin("local-plugin-test", pluginPath);

      const driver = getDriver("local-plugin-test");
      const events = [];
      for await (const event of driver("prompt", "/tmp")) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: "output", text: "plugin" },
        { type: "complete", result: "done" },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
