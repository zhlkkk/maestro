import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createWorktreeManager } from "../../src/sandbox/worktree.js";
import { copyHandoff } from "../../src/sandbox/handoff.js";

let testRepoDir: string;

beforeAll(() => {
  testRepoDir = join(tmpdir(), `maestro-handoff-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testRepoDir, { recursive: true });
  execFileSync("git", ["init"], { cwd: testRepoDir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: testRepoDir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: testRepoDir, stdio: "pipe" });
  writeFileSync(join(testRepoDir, "README.md"), "# Test");
  writeFileSync(join(testRepoDir, "existing.txt"), "original content");
  execFileSync("git", ["add", "."], { cwd: testRepoDir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: testRepoDir, stdio: "pipe" });
});

afterAll(() => {
  rmSync(testRepoDir, { recursive: true, force: true });
});

describe("copyHandoff", () => {
  test("detects added files", async () => {
    const mgr = createWorktreeManager(testRepoDir, "handoff-1");
    try {
      const src = await mgr.getWorktree("PhaseA");
      const dst = await mgr.getWorktree("PhaseB");

      // Add a new file in source worktree
      writeFileSync(join(src, "new-file.txt"), "new content");

      const result = await copyHandoff(src, dst);
      expect(result.added).toContain("new-file.txt");
      expect(existsSync(join(dst, "new-file.txt"))).toBe(true);
      expect(readFileSync(join(dst, "new-file.txt"), "utf-8")).toBe("new content");
    } finally {
      await mgr.cleanup();
    }
  });

  test("detects modified files", async () => {
    const mgr = createWorktreeManager(testRepoDir, "handoff-2");
    try {
      const src = await mgr.getWorktree("PhaseA");
      const dst = await mgr.getWorktree("PhaseB");

      // Modify an existing file
      writeFileSync(join(src, "existing.txt"), "modified content");
      execFileSync("git", ["add", "existing.txt"], { cwd: src, stdio: "pipe" });

      const result = await copyHandoff(src, dst);
      expect(result.modified).toContain("existing.txt");
      expect(readFileSync(join(dst, "existing.txt"), "utf-8")).toBe("modified content");
    } finally {
      await mgr.cleanup();
    }
  });

  test("detects deleted files", async () => {
    const mgr = createWorktreeManager(testRepoDir, "handoff-3");
    try {
      const src = await mgr.getWorktree("PhaseA");
      const dst = await mgr.getWorktree("PhaseB");

      // Delete a file in source
      rmSync(join(src, "existing.txt"));
      execFileSync("git", ["add", "existing.txt"], { cwd: src, stdio: "pipe" });

      const result = await copyHandoff(src, dst);
      expect(result.deleted).toContain("existing.txt");
      expect(existsSync(join(dst, "existing.txt"))).toBe(false);
    } finally {
      await mgr.cleanup();
    }
  });

  test("no changes returns empty handoff", async () => {
    const mgr = createWorktreeManager(testRepoDir, "handoff-4");
    try {
      const src = await mgr.getWorktree("PhaseA");
      const dst = await mgr.getWorktree("PhaseB");

      const result = await copyHandoff(src, dst);
      expect(result.added).toHaveLength(0);
      expect(result.modified).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
    } finally {
      await mgr.cleanup();
    }
  });

  test("handles nested directory creation", async () => {
    const mgr = createWorktreeManager(testRepoDir, "handoff-5");
    try {
      const src = await mgr.getWorktree("PhaseA");
      const dst = await mgr.getWorktree("PhaseB");

      // Create nested file
      mkdirSync(join(src, "src", "lib"), { recursive: true });
      writeFileSync(join(src, "src", "lib", "utils.ts"), "export const x = 1;");

      const result = await copyHandoff(src, dst);
      expect(result.added).toContain("src/lib/utils.ts");
      expect(existsSync(join(dst, "src", "lib", "utils.ts"))).toBe(true);
    } finally {
      await mgr.cleanup();
    }
  });
});
