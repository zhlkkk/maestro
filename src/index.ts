#!/usr/bin/env bun
import { Command } from "commander";
import { runCommand } from "./cli/run.js";
import { replayCommand, type PlaybackSpeed } from "./cli/replay.js";

const program = new Command();

program
  .name("maestro")
  .description("Multi-Agent R&D Orchestration Engine")
  .version("0.1.0");

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
