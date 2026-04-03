import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createWorktreeManager, cleanupStaleWorktrees } from "../../src/sandbox/worktree.js";

let testRepoDir: string;

beforeAll(() => {
  // Create a temporary git repo for testing
  testRepoDir = join(tmpdir(), `maestro-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testRepoDir, { recursive: true });
  execFileSync("git", ["init"], { cwd: testRepoDir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: testRepoDir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: testRepoDir, stdio: "pipe" });

  // Create initial commit
  writeFileSync(join(testRepoDir, "README.md"), "# Test Repo");
  execFileSync("git", ["add", "."], { cwd: testRepoDir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: testRepoDir, stdio: "pipe" });
});

afterAll(() => {
  // Clean up temp repo
  rmSync(testRepoDir, { recursive: true, force: true });
});

describe("WorktreeManager", () => {
  test("creates a worktree for a phase", () => {
    const mgr = createWorktreeManager(testRepoDir, "test-run-1");
    try {
      const wtPath = mgr.getWorktree("Plan");
      expect(existsSync(wtPath)).toBe(true);
      expect(existsSync(join(wtPath, "README.md"))).toBe(true);
    } finally {
      mgr.cleanup();
    }
  });

  test("reuses worktree on second call for same phase", () => {
    const mgr = createWorktreeManager(testRepoDir, "test-run-2");
    try {
      const path1 = mgr.getWorktree("Code");
      const path2 = mgr.getWorktree("Code");
      expect(path1).toBe(path2);
    } finally {
      mgr.cleanup();
    }
  });

  test("creates separate worktrees for different phases", () => {
    const mgr = createWorktreeManager(testRepoDir, "test-run-3");
    try {
      const path1 = mgr.getWorktree("Plan");
      const path2 = mgr.getWorktree("Code");
      expect(path1).not.toBe(path2);
      expect(existsSync(path1)).toBe(true);
      expect(existsSync(path2)).toBe(true);
    } finally {
      mgr.cleanup();
    }
  });

  test("cleanup removes all worktrees", () => {
    const mgr = createWorktreeManager(testRepoDir, "test-run-4");
    const path1 = mgr.getWorktree("Plan");
    const path2 = mgr.getWorktree("Code");
    expect(existsSync(path1)).toBe(true);

    mgr.cleanup();
    // Worktree directories should be removed
    expect(existsSync(path1)).toBe(false);
    expect(existsSync(path2)).toBe(false);
  });

  test("preserves content across retries (reuse)", () => {
    const mgr = createWorktreeManager(testRepoDir, "test-run-5");
    try {
      const wtPath = mgr.getWorktree("Execute");
      // Write a file in the worktree (simulating agent output)
      writeFileSync(join(wtPath, "agent-output.txt"), "first run");

      // Second call should reuse — file should still be there
      const wtPath2 = mgr.getWorktree("Execute");
      expect(wtPath).toBe(wtPath2);
      const content = require("node:fs").readFileSync(join(wtPath2, "agent-output.txt"), "utf-8");
      expect(content).toBe("first run");
    } finally {
      mgr.cleanup();
    }
  });
});

describe("cleanupStaleWorktrees", () => {
  test("cleans up stale worktrees from crashed runs", () => {
    const mgr = createWorktreeManager(testRepoDir, "stale-run");
    const wtPath = mgr.getWorktree("Orphan");
    expect(existsSync(wtPath)).toBe(true);

    // Don't call cleanup — simulate a crash
    // Now call cleanupStaleWorktrees
    cleanupStaleWorktrees(testRepoDir);

    // Stale worktree should be gone
    expect(existsSync(wtPath)).toBe(false);
  });

  test("no-op when no stale worktrees exist", () => {
    // Should not throw
    cleanupStaleWorktrees(testRepoDir);
  });
});
