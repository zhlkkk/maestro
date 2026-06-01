import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initParadigmCommand } from "../../src/cli/init.js";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "maestro-init-test-"));
}

describe("initParadigmCommand", () => {
  test("dry-run prints planned files without writing", async () => {
    const root = tempRoot();
    const target = join(root, "demo");

    try {
      const code = await initParadigmCommand("demo", {
        dir: target,
        dryRun: true,
      });

      expect(code).toBe(0);
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("creates the expected paradigm pack tree", async () => {
    const root = tempRoot();
    const target = join(root, "demo");

    try {
      const code = await initParadigmCommand("demo", { dir: target });

      expect(code).toBe(0);
      expect(readFileSync(join(target, "paradigm.yaml"), "utf-8")).toContain(
        "driver: generic-cli"
      );
      expect(readFileSync(join(target, "prompts", "implement.md"), "utf-8")).toContain(
        "{{task}}"
      );
      expect(readFileSync(join(target, "README.md"), "utf-8")).toContain(
        "maestro run paradigm.yaml"
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses a non-empty target directory unless forced", async () => {
    const root = tempRoot();
    const target = join(root, "demo");

    try {
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, "existing.txt"), "keep", "utf-8");

      const refused = await initParadigmCommand("demo", { dir: target });
      const forced = await initParadigmCommand("demo", { dir: target, force: true });

      expect(refused).toBe(2);
      expect(forced).toBe(0);
      expect(existsSync(join(target, "existing.txt"))).toBe(true);
      expect(existsSync(join(target, "paradigm.yaml"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
