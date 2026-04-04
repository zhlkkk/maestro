import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { readEvents } from "../engine/logger.js";
import type { MaestroEvent } from "../types.js";

export type PlaybackSpeed = "1x" | "2x" | "10x" | "max";

export interface ReplayCommandOptions {
  speed: PlaybackSpeed;
}

/**
 * Parse a speed string into a numeric multiplier (or Infinity for "max").
 */
function speedMultiplier(speed: PlaybackSpeed): number {
  switch (speed) {
    case "1x":
      return 1;
    case "2x":
      return 2;
    case "10x":
      return 10;
    case "max":
      return Infinity;
  }
}

/**
 * Compute delay between two events based on their timestamps and playback speed.
 */
function computeDelay(prev: MaestroEvent, curr: MaestroEvent, multiplier: number): number {
  if (!isFinite(multiplier)) return 0;

  const prevTime = new Date(prev.timestamp).getTime();
  const currTime = new Date(curr.timestamp).getTime();
  const delta = Math.max(0, currTime - prevTime);

  return delta / multiplier;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replay events from a JSONL file through the console.
 * In a future version this will render through the Ink dashboard;
 * for now it prints events to the console (matching run.ts behavior).
 */
export async function replayCommand(
  eventsFile: string,
  options: ReplayCommandOptions
): Promise<number> {
  const resolvedPath = resolve(eventsFile);
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Events file not found: ${resolvedPath}`);
    return 2;
  }

  const events = readEvents(resolvedPath);
  if (events.length === 0) {
    console.error("Error: No events found in file");
    return 2;
  }

  const multiplier = speedMultiplier(options.speed);

  console.log(`🎼 Maestro Replay — ${events.length} events (speed: ${options.speed})\n`);

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;

    // Delay between events for non-max speeds
    if (i > 0 && isFinite(multiplier)) {
      const delay = computeDelay(events[i - 1]!, event, multiplier);
      if (delay > 0) {
        await sleep(delay);
      }
    }

    // Render event (same format as run.ts console output)
    switch (event.type) {
      case "PIPELINE_START":
        console.log(`▶ Pipeline started`);
        break;
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
      case "AGENT_OUTPUT":
        // Skip agent output in replay for cleaner display
        break;
    }
  }

  console.log(`\nReplay finished (${events.length} events)`);
  return 0;
}
