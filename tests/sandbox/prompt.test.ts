import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { assemblePrompt, readOutputFile } from "../../src/sandbox/prompt.js";

let testDir: string;

beforeAll(() => {
  testDir = join(tmpdir(), `maestro-prompt-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("assemblePrompt", () => {
  test("replaces {{task}} and {{previous_output}}", () => {
    const promptFile = join(testDir, "test-prompt.md");
    writeFileSync(promptFile, "Task: {{task}}\n\nPrevious: {{previous_output}}");

    const result = assemblePrompt(promptFile, "Add auth", "Code looks good");
    expect(result.prompt).toBe("Task: Add auth\n\nPrevious: Code looks good");
    expect(result.tempFilePath).toBeUndefined();
  });

  test("empty previous_output for first phase", () => {
    const promptFile = join(testDir, "first-phase.md");
    writeFileSync(promptFile, "Do this: {{task}}\nContext: {{previous_output}}");

    const result = assemblePrompt(promptFile, "Init project");
    expect(result.prompt).toBe("Do this: Init project\nContext: ");
  });

  test("throws on missing prompt file", () => {
    expect(() => assemblePrompt("/nonexistent/file.md", "task")).toThrow(
      /Prompt file not found/
    );
  });

  test("writes to temp file when prompt exceeds 100KB", () => {
    const promptFile = join(testDir, "large-prompt.md");
    const largeContent = "{{task}}\n" + "x".repeat(110 * 1024);
    writeFileSync(promptFile, largeContent);

    const result = assemblePrompt(promptFile, "test");
    expect(result.tempFilePath).toBeDefined();
    expect(result.prompt).toContain("Read the prompt from file:");
    expect(existsSync(result.tempFilePath!)).toBe(true);

    // Clean up temp file
    rmSync(result.tempFilePath!, { force: true });
  });

  test("replaces all occurrences of {{task}}", () => {
    const promptFile = join(testDir, "multi-task.md");
    writeFileSync(promptFile, "Task 1: {{task}}\nTask 2: {{task}}");

    const result = assemblePrompt(promptFile, "Build API");
    expect(result.prompt).toBe("Task 1: Build API\nTask 2: Build API");
  });
});

describe("readOutputFile", () => {
  test("reads existing output file", () => {
    const wtDir = join(testDir, "worktree");
    mkdirSync(wtDir, { recursive: true });
    writeFileSync(join(wtDir, "RESULT.md"), "---\nstatus: approved\n---\nLooks good");

    const content = readOutputFile(wtDir, "RESULT.md");
    expect(content).toBe("---\nstatus: approved\n---\nLooks good");
  });

  test("returns null for missing file", () => {
    const content = readOutputFile(testDir, "NONEXISTENT.md");
    expect(content).toBeNull();
  });
});
