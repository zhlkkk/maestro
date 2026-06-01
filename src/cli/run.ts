import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { parseParadigmFile } from "../engine/parser.js";
import { validateParadigm } from "../engine/validator.js";
import { dryRun, formatDryRunOutput } from "../engine/dry-run.js";
import { runPipeline } from "../engine/runner.js";
import { createEventLogger } from "../engine/logger.js";
import { generateReport } from "../engine/report.js";
import { randomUUID } from "node:crypto";
import { findInstalledParadigm } from "./paradigm-registry.js";

export interface RunCommandOptions {
  task: string;
  dryRun?: boolean;
}

export async function runCommand(
  paradigmPath: string,
  options: RunCommandOptions
): Promise<number> {
  // Validate inputs
  const resolvedPath = resolveParadigmPath(paradigmPath);
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Paradigm file not found: ${resolvedPath}`);
    return 2;
  }

  if (!options.task || options.task.trim() === "") {
    console.error("Error: --task is required and must be non-empty");
    return 2;
  }

  if (options.task.length > 5000) {
    console.error("Error: --task must be 5000 characters or less");
    return 2;
  }

  // Parse paradigm
  let config;
  try {
    config = parseParadigmFile(resolvedPath);
  } catch (err) {
    console.error(`Error parsing paradigm: ${err instanceof Error ? err.message : err}`);
    return 2;
  }

  // Validate
  const errors = validateParadigm(config);
  if (errors.length > 0) {
    console.error("Paradigm validation failed:");
    for (const e of errors) {
      console.error(`  ✖ ${e.path}: ${e.message}`);
    }
    return 2;
  }

  // Dry run mode
  if (options.dryRun) {
    const result = dryRun(config);
    console.log(formatDryRunOutput(result));
    return result.valid ? 0 : 2;
  }

  // Full run
  const repoRoot = process.cwd();
  const runId = randomUUID().slice(0, 8);
  const logger = createEventLogger(repoRoot, runId);

  // Set up abort controller for Ctrl-C
  const abortController = new AbortController();
  const sigintHandler = () => {
    console.log("\n⏹ Received Ctrl-C, aborting pipeline...");
    abortController.abort();
  };
  process.on("SIGINT", sigintHandler);

  try {
    console.log(`🎼 Maestro — ${config.name}`);
    console.log(`Task: ${options.task}`);
    console.log(`Run ID: ${runId}\n`);

    const result = await runPipeline(config, {
      task: options.task,
      repoRoot,
      abortSignal: abortController.signal,
      onEvent: (event) => {
        logger.log(event);

        // Simple console output (Ink dashboard integration in future)
        switch (event.type) {
          case "PHASE_START":
            console.log(`◉ ${event.phase} — running...`);
            break;
          case "PHASE_COMPLETE":
            console.log(
              `✔ ${event.phase} — ${event.data.status} (${((event.data.duration_ms as number) / 1000).toFixed(1)}s)`
            );
            break;
          case "PHASE_FAILED":
            console.error(`✖ ${event.phase} — FAILED: ${event.data.error}`);
            break;
          case "PHASE_TIMEOUT":
            console.error(`⏱ ${event.phase} — TIMEOUT`);
            break;
          case "PIPELINE_COMPLETE":
            console.log("\n✔ Pipeline completed successfully");
            break;
          case "PIPELINE_FAILED":
            console.error(`\n✖ Pipeline failed: ${event.data.error}`);
            break;
        }
      },
    });

    // Generate report
    try {
      const reportPath = generateReport(logger.getFilePath(), repoRoot, runId);
      console.log(`\nReport: ${reportPath}`);
      console.log(`Events: ${logger.getFilePath()}`);
    } catch {
      // Report generation failure is non-fatal
    }

    return result.success ? 0 : 1;
  } finally {
    process.removeListener("SIGINT", sigintHandler);
  }
}

function resolveParadigmPath(paradigmPath: string): string {
  const resolvedPath = resolve(paradigmPath);
  if (existsSync(resolvedPath)) return resolvedPath;

  const installed = findInstalledParadigm(paradigmPath);
  return installed?.paradigm ?? resolvedPath;
}
