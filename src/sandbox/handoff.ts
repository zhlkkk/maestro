import { copyFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { execGit } from "./git.js";

export interface HandoffResult {
  added: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Uses `git status --porcelain` to detect all changes (tracked + untracked).
 */
export async function listHandoffChanges(sourceWorktree: string): Promise<HandoffResult> {
  const result: HandoffResult = { added: [], modified: [], deleted: [] };

  let statusOutput: string;
  try {
    statusOutput = (await execGit(["status", "--porcelain", "-uall"], sourceWorktree)).trim();
  } catch {
    return result;
  }

  if (!statusOutput) return result;

  const lines = statusOutput.split("\n");
  for (const line of lines) {
    if (line.length < 3) continue;

    // git status --porcelain format: XY filename
    // X = index status, Y = worktree status
    const statusCode = line.slice(0, 2);
    const filePath = line[2] === " " ? line.slice(3) : line.slice(2).trimStart();

    // Handle renamed files (format: "R  old -> new")
    if (statusCode.trim().startsWith("R")) {
      const parts = filePath.split(" -> ");
      if (parts.length === 2) {
        result.deleted.push(parts[0]!.trim());
        result.added.push(parts[1]!.trim());
      }
      continue;
    }

    // Deleted files
    if (statusCode.includes("D")) {
      result.deleted.push(filePath);
      continue;
    }

    // Added, modified, or untracked files
    if (
      statusCode.includes("A") ||
      statusCode.includes("M") ||
      statusCode.includes("?") // Untracked
    ) {
      // Classify: untracked or newly added = "added", modified = "modified"
      if (statusCode.includes("?") || statusCode.includes("A")) {
        result.added.push(filePath);
      } else {
        result.modified.push(filePath);
      }
    }
  }

  return result;
}

/**
 * Copy changed files from source worktree to target worktree.
 */
export async function copyHandoff(sourceWorktree: string, targetWorktree: string): Promise<HandoffResult> {
  const result = await listHandoffChanges(sourceWorktree);

  for (const filePath of result.deleted) {
    deleteFileInTarget(targetWorktree, filePath);
  }

  for (const filePath of [...result.added, ...result.modified]) {
    copyFileToTarget(sourceWorktree, targetWorktree, filePath);
  }

  return result;
}

function copyFileToTarget(source: string, target: string, relativePath: string): void {
  const srcPath = join(source, relativePath);
  const dstPath = join(target, relativePath);

  if (!existsSync(srcPath)) return;
  // Skip directories — only copy files
  try { if (statSync(srcPath).isDirectory()) return; } catch { return; }

  const dstDir = dirname(dstPath);
  mkdirSync(dstDir, { recursive: true });
  copyFileSync(srcPath, dstPath);
}

function deleteFileInTarget(target: string, relativePath: string): void {
  const dstPath = join(target, relativePath);
  if (existsSync(dstPath)) {
    rmSync(dstPath, { force: true });
  }
}

const MAX_DIFF_SIZE = 50 * 1024; // 50KB

/**
 * Generate a diff summary for a worktree's changes.
 * Used for incremental handoff in retry loops — provides a concise
 * view of what changed instead of full file content.
 */
export async function generateDiffSummary(worktreePath: string): Promise<string> {
  const parts: string[] = [];

  // Get diff stat (file-level summary)
  try {
    const stat = (await execGit(["diff", "--stat", "HEAD"], worktreePath)).trim();
    if (stat) {
      parts.push("### Changes Summary\n```\n" + stat + "\n```");
    }
  } catch {
    // No git diff available — fall back to status
  }

  // Get actual diff (limited size)
  try {
    let diff = (await execGit(["diff", "HEAD"], worktreePath)).trim();
    if (diff) {
      if (Buffer.byteLength(diff, "utf-8") > MAX_DIFF_SIZE) {
        diff = diff.slice(0, MAX_DIFF_SIZE) + "\n... (truncated, see worktree for full diff)";
      }
      parts.push("### Diff\n```diff\n" + diff + "\n```");
    }
  } catch {
    // No diff available
  }

  // Also capture untracked files
  try {
    const untracked = (await execGit(["ls-files", "--others", "--exclude-standard"], worktreePath)).trim();
    if (untracked) {
      parts.push("### New Files\n" + untracked.split("\n").map(f => `- ${f}`).join("\n"));
    }
  } catch {
    // Ignore
  }

  return parts.join("\n\n") || "(no changes detected)";
}
