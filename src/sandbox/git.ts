/**
 * Async git command helper using Bun.spawn().
 * Shared by worktree.ts and handoff.ts to avoid blocking the event loop.
 */
export async function execGit(args: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
  }
  return await new Response(proc.stdout).text();
}
