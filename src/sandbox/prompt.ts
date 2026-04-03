import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const MAX_INLINE_SIZE = 100 * 1024; // 100KB

export interface PromptAssemblyResult {
  prompt: string;
  /** If prompt exceeded MAX_INLINE_SIZE, it was written to this temp file */
  tempFilePath?: string;
}

/**
 * Assemble a prompt from a template file with variable interpolation.
 * Replaces {{task}} and {{previous_output}} placeholders.
 */
export function assemblePrompt(
  promptFilePath: string,
  task: string,
  previousOutput: string = ""
): PromptAssemblyResult {
  if (!existsSync(promptFilePath)) {
    throw new Error(`Prompt file not found: ${promptFilePath}`);
  }

  let template = readFileSync(promptFilePath, "utf-8");

  // Replace template variables
  template = template.replaceAll("{{task}}", task);
  template = template.replaceAll("{{previous_output}}", previousOutput);

  // Check size limit
  const size = Buffer.byteLength(template, "utf-8");
  if (size > MAX_INLINE_SIZE) {
    const tempPath = join(tmpdir(), `maestro-prompt-${randomUUID().slice(0, 8)}.md`);
    writeFileSync(tempPath, template, "utf-8");
    return { prompt: `Read the prompt from file: ${tempPath}`, tempFilePath: tempPath };
  }

  return { prompt: template };
}

/**
 * Read the content of an output_file from a worktree.
 * Returns the raw content or null if the file doesn't exist.
 */
export function readOutputFile(worktreePath: string, outputFileName: string): string | null {
  const filePath = join(worktreePath, outputFileName);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}
