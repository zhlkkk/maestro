import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { MaestroEvent } from "../types.js";

export interface EventLogger {
  log(event: MaestroEvent): void;
  getFilePath(): string;
}

/**
 * Create an event logger that appends MaestroEvents to a JSONL file.
 * Each event is written synchronously (immediate flush) to prevent data loss on crash.
 */
export function createEventLogger(repoRoot: string, runId: string): EventLogger {
  const maestroDir = join(repoRoot, ".maestro");
  mkdirSync(maestroDir, { recursive: true });

  const filePath = join(maestroDir, `events-${runId}.jsonl`);

  return {
    log(event: MaestroEvent): void {
      const line = JSON.stringify(event) + "\n";
      appendFileSync(filePath, line, "utf-8");
    },

    getFilePath(): string {
      return filePath;
    },
  };
}

/**
 * Read events from a JSONL file. Skips corrupted lines gracefully.
 */
export function readEvents(filePath: string): MaestroEvent[] {
  if (!existsSync(filePath)) return [];

  const { readFileSync } = require("node:fs");
  const content = readFileSync(filePath, "utf-8") as string;
  const lines = content.split("\n").filter((l: string) => l.trim());

  const events: MaestroEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as MaestroEvent);
    } catch {
      // Skip corrupted lines — log warning if needed
    }
  }
  return events;
}
