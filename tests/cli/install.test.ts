import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCommand } from "../../src/cli/install.js";
import { readParadigmIndex } from "../../src/cli/paradigm-registry.js";
import { runCommand } from "../../src/cli/run.js";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "maestro-install-test-"));
}

function createPack(root: string, name = "Demo Pack"): string {
  const packDir = join(root, "pack");
  mkdirSync(join(packDir, "prompts"), { recursive: true });
  writeFileSync(
    join(packDir, "paradigm.yaml"),
    `name: "${name}"
description: "Install test pack"
maestro_version: "1"
version: "0.1.0"
author: "tests"
tags: ["test"]
license: "MIT"
agents:
  Worker:
    driver: generic-cli
    command: ["/bin/sh", "-c", "true"]
phases:
  Work:
    agent: Worker
    prompt_file: prompts/work.md
    output_file: RESULT.md
    next: Done
  Done:
    type: final
`,
    "utf-8"
  );
  writeFileSync(join(packDir, "prompts", "work.md"), "{{task}}\n", "utf-8");
  writeFileSync(join(packDir, "README.md"), "# Test Pack\n", "utf-8");
  return packDir;
}

function git(args: string[], cwd: string): void {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  if (proc.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(proc.stderr));
  }
}

describe("installCommand", () => {
  test("installs a local pack and writes registry index", async () => {
    const root = tempRoot();
    const packDir = createPack(root);
    const registryDir = join(root, "registry");

    try {
      const code = await installCommand(packDir, { dir: registryDir });
      const index = readParadigmIndex(registryDir);

      expect(code).toBe(0);
      expect(existsSync(join(registryDir, "demo-pack", "paradigm.yaml"))).toBe(true);
      expect(index.paradigms).toHaveLength(1);
      expect(index.paradigms[0]).toMatchObject({
        name: "demo-pack",
        version: "0.1.0",
        author: "tests",
        tags: ["test"],
        license: "MIT",
        maestroVersion: "1",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("dry-run validates without writing files", async () => {
    const root = tempRoot();
    const packDir = createPack(root);
    const registryDir = join(root, "registry");

    try {
      const code = await installCommand(packDir, {
        dir: registryDir,
        dryRun: true,
      });

      expect(code).toBe(0);
      expect(existsSync(registryDir)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses duplicate install unless forced", async () => {
    const root = tempRoot();
    const packDir = createPack(root);
    const registryDir = join(root, "registry");

    try {
      const first = await installCommand(packDir, { dir: registryDir });
      const duplicate = await installCommand(packDir, { dir: registryDir });
      const forced = await installCommand(packDir, { dir: registryDir, force: true });

      expect(first).toBe(0);
      expect(duplicate).toBe(2);
      expect(forced).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("installs from a Git URL source", async () => {
    const root = tempRoot();
    const repo = createPack(root, "Git Pack");
    const registryDir = join(root, "registry");

    try {
      git(["init"], repo);
      git(["add", "."], repo);
      git(["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init"], repo);

      const code = await installCommand(`file://${repo}`, { dir: registryDir });

      expect(code).toBe(0);
      expect(existsSync(join(registryDir, "git-pack", "paradigm.yaml"))).toBe(true);
      expect(existsSync(join(registryDir, "git-pack", ".git"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("installed pack can be resolved by name during dry-run", async () => {
    const root = tempRoot();
    const packDir = createPack(root, "Name Run Pack");
    const installedDir = join(process.cwd(), ".maestro", "paradigms", "name-run-pack");
    const indexPath = join(process.cwd(), ".maestro", "paradigms", "index.json");
    const previousIndex = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : undefined;

    try {
      rmSync(installedDir, { recursive: true, force: true });
      const installCode = await installCommand(packDir, { force: true });
      const runCode = await runCommand("name-run-pack", {
        task: "smoke",
        dryRun: true,
      });

      expect(installCode).toBe(0);
      expect(runCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(installedDir, { recursive: true, force: true });
      if (previousIndex === undefined) {
        rmSync(indexPath, { force: true });
      } else {
        writeFileSync(indexPath, previousIndex, "utf-8");
      }
    }
  });
});
