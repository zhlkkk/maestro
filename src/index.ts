#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { runCommand } from "./cli/run.js";
import { initParadigmCommand } from "./cli/init.js";
import { replayCommand, type PlaybackSpeed } from "./cli/replay.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
) as { version?: string };

const program = new Command();

program
  .name("maestro")
  .description("Multi-Agent R&D Orchestration Engine")
  .version(packageJson.version ?? "0.0.0");

program
  .command("init")
  .description("Initialize Maestro resources")
  .command("paradigm <name>")
  .description("Create a local paradigm pack")
  .option("--dir <dir>", "Target directory for the pack")
  .option("--dry-run", "Print files that would be created without writing")
  .option("--force", "Overwrite scaffold files in a non-empty target directory")
  .action(async (
    name: string,
    opts: { dir?: string; dryRun?: boolean; force?: boolean }
  ) => {
    const exitCode = await initParadigmCommand(name, opts);
    process.exit(exitCode);
  });

program
  .command("run")
  .description("Run a paradigm pipeline")
  .argument("<paradigm>", "Path to paradigm YAML file")
  .requiredOption("--task <task>", "Task description for the pipeline")
  .option("--dry-run", "Validate paradigm and simulate without running agents")
  .action(async (paradigm: string, opts: { task: string; dryRun?: boolean }) => {
    const exitCode = await runCommand(paradigm, {
      task: opts.task,
      dryRun: opts.dryRun,
    });
    process.exit(exitCode);
  });

program
  .command("replay <events-file>")
  .description("Replay a historical run from events.jsonl")
  .option("--speed <speed>", "Playback speed (1x, 2x, 10x, max)", "max")
  .action(async (eventsFile: string, opts: { speed: string }) => {
    const exitCode = await replayCommand(eventsFile, {
      speed: opts.speed as PlaybackSpeed,
    });
    process.exit(exitCode);
  });

program.parse();
