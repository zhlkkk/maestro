import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execGit } from "./git.js";

const WORKTREE_BASE = ".maestro/worktrees";

export interface WorktreeManager {
  runId: string;
  repoRoot: string;

  /** Create or reuse a worktree for a phase */
  getWorktree(phaseName: string): Promise<string>;

  /** Clean up all worktrees for this run */
  cleanup(): Promise<void>;
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

    async getWorktree(phaseName: string): Promise<string> {
      const existing = created.get(phaseName);
      if (existing && existsSync(existing)) {
        return existing;
      }

      const worktreePath = join(baseDir, phaseName);
      mkdirSync(worktreePath, { recursive: true });

      try {
        await execGit(["worktree", "add", "--detach", worktreePath, "HEAD"], resolvedRoot);
      } catch {
        // If worktree already exists (stale), remove and retry
        try {
          await execGit(["worktree", "remove", "--force", worktreePath], resolvedRoot);
        } catch {
          // Ignore
        }
        rmSync(worktreePath, { recursive: true, force: true });
        mkdirSync(worktreePath, { recursive: true });
        await execGit(["worktree", "add", "--detach", worktreePath, "HEAD"], resolvedRoot);
      }

      created.set(phaseName, worktreePath);
      return worktreePath;
    },

    async cleanup(): Promise<void> {
      for (const [, worktreePath] of created) {
        try {
          await execGit(["worktree", "remove", "--force", worktreePath], resolvedRoot);
        } catch {
          rmSync(worktreePath, { recursive: true, force: true });
        }
      }
      created.clear();

      if (existsSync(baseDir)) {
        rmSync(baseDir, { recursive: true, force: true });
      }

      try {
        await execGit(["worktree", "prune"], resolvedRoot);
      } catch {
        // Ignore
      }
    },
  };
}

/**
 * Clean up stale worktrees from crashed runs.
 */
export async function cleanupStaleWorktrees(repoRoot: string): Promise<void> {
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
            await execGit(["worktree", "remove", "--force", worktreePath], resolvedRoot);
          } catch {
            rmSync(worktreePath, { recursive: true, force: true });
          }
        }
      } catch {
        // Ignore
      }
      rmSync(runDir, { recursive: true, force: true });
    }

    await execGit(["worktree", "prune"], resolvedRoot);
  } catch {
    // Best effort cleanup
  }
}
