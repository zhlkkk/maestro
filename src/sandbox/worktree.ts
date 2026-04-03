import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const WORKTREE_BASE = ".maestro/worktrees";

export interface WorktreeManager {
  runId: string;
  repoRoot: string;

  /** Create or reuse a worktree for a phase */
  getWorktree(phaseName: string): string;

  /** Clean up all worktrees for this run */
  cleanup(): void;
}

/**
 * Create a WorktreeManager for a pipeline run.
 * Worktrees are created under .maestro/worktrees/{runId}/{phaseName}/.
 */
export function createWorktreeManager(repoRoot: string, runId?: string): WorktreeManager {
  const resolvedRoot = resolve(repoRoot);
  const id = runId ?? randomUUID().slice(0, 8);
  const baseDir = join(resolvedRoot, WORKTREE_BASE, id);
  const created = new Map<string, string>();

  return {
    runId: id,
    repoRoot: resolvedRoot,

    getWorktree(phaseName: string): string {
      const existing = created.get(phaseName);
      if (existing && existsSync(existing)) {
        return existing;
      }

      const worktreePath = join(baseDir, phaseName);
      mkdirSync(worktreePath, { recursive: true });

      try {
        execFileSync("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], {
          cwd: resolvedRoot,
          stdio: "pipe",
        });
      } catch {
        // If worktree already exists (stale), remove and retry
        try {
          execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
            cwd: resolvedRoot,
            stdio: "pipe",
          });
        } catch {
          // Ignore
        }
        rmSync(worktreePath, { recursive: true, force: true });
        mkdirSync(worktreePath, { recursive: true });
        execFileSync("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], {
          cwd: resolvedRoot,
          stdio: "pipe",
        });
      }

      created.set(phaseName, worktreePath);
      return worktreePath;
    },

    cleanup() {
      for (const [, worktreePath] of created) {
        try {
          execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
            cwd: resolvedRoot,
            stdio: "pipe",
          });
        } catch {
          rmSync(worktreePath, { recursive: true, force: true });
        }
      }
      created.clear();

      if (existsSync(baseDir)) {
        rmSync(baseDir, { recursive: true, force: true });
      }

      try {
        execFileSync("git", ["worktree", "prune"], { cwd: resolvedRoot, stdio: "pipe" });
      } catch {
        // Ignore
      }
    },
  };
}

/**
 * Clean up stale worktrees from crashed runs.
 */
export function cleanupStaleWorktrees(repoRoot: string): void {
  const resolvedRoot = resolve(repoRoot);
  const baseDir = join(resolvedRoot, WORKTREE_BASE);

  if (!existsSync(baseDir)) return;

  try {
    const runDirs = readdirSync(baseDir);
    for (const runId of runDirs) {
      const runDir = join(baseDir, runId);
      try {
        const phaseDirs = readdirSync(runDir);
        for (const phase of phaseDirs) {
          const worktreePath = join(runDir, phase);
          try {
            execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
              cwd: resolvedRoot,
              stdio: "pipe",
            });
          } catch {
            rmSync(worktreePath, { recursive: true, force: true });
          }
        }
      } catch {
        // Ignore
      }
      rmSync(runDir, { recursive: true, force: true });
    }

    execFileSync("git", ["worktree", "prune"], { cwd: resolvedRoot, stdio: "pipe" });
  } catch {
    // Best effort cleanup
  }
}
