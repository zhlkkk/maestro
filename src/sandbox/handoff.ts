import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

export interface HandoffResult {
  added: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Copy changed files from source worktree to target worktree.
 * Uses `git status --porcelain` to detect all changes (tracked + untracked).
 */
export function copyHandoff(sourceWorktree: string, targetWorktree: string): HandoffResult {
  const result: HandoffResult = { added: [], modified: [], deleted: [] };

  let statusOutput: string;
  try {
    statusOutput = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: sourceWorktree,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
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
    const filePath = line.slice(3);

    // Handle renamed files (format: "R  old -> new")
    if (statusCode.trim().startsWith("R")) {
      const parts = filePath.split(" -> ");
      if (parts.length === 2) {
        deleteFileInTarget(targetWorktree, parts[0]!.trim());
        copyFileToTarget(sourceWorktree, targetWorktree, parts[1]!.trim());
        result.deleted.push(parts[0]!.trim());
        result.added.push(parts[1]!.trim());
      }
      continue;
    }

    // Deleted files
    if (statusCode.includes("D")) {
      deleteFileInTarget(targetWorktree, filePath);
      result.deleted.push(filePath);
      continue;
    }

    // Added, modified, or untracked files
    if (
      statusCode.includes("A") ||
      statusCode.includes("M") ||
      statusCode.includes("?") // Untracked
    ) {
      copyFileToTarget(sourceWorktree, targetWorktree, filePath);

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
