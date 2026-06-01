import { describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCommand } from "../../src/cli/install.js";
import { listParadigmsCommand } from "../../src/cli/list.js";
import { initParadigmCommand } from "../../src/cli/init.js";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "maestro-list-test-"));
}

describe("listParadigmsCommand", () => {
  test("prints an empty registry message", async () => {
    const root = tempRoot();
    const registryDir = join(root, "registry");
    const log = spyOn(console, "log").mockImplementation(() => {});

    try {
      const code = await listParadigmsCommand({ dir: registryDir });
      const output = log.mock.calls.flat().join("\n");

      expect(code).toBe(0);
      expect(output).toContain("No installed paradigms found");
      expect(output).toContain(registryDir);
    } finally {
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("lists installed paradigms from a custom registry", async () => {
    const root = tempRoot();
    const packDir = join(root, "pack");
    const registryDir = join(root, "registry");
    const log = spyOn(console, "log").mockImplementation(() => {});

    try {
      await initParadigmCommand("demo", { dir: packDir });
      await installCommand(packDir, { dir: registryDir });

      const code = await listParadigmsCommand({ dir: registryDir });
      const output = log.mock.calls.flat().join("\n");

      expect(code).toBe(0);
      expect(output).toContain("Installed paradigms");
      expect(output).toContain("| demo | 0.1.0 |");
    } finally {
      log.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
