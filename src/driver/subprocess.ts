import type { AgentEvent, AgentDriverFn, RunAgentOptions } from "./types.js";

/** Configuration for creating a subprocess-based agent driver. */
export interface SubprocessDriverConfig {
  /** The command to spawn (e.g. "codex", "gemini"). */
  command: string;
  /** Build the argument list from the prompt, working directory, and options. */
  buildArgs: (
    prompt: string,
    workdir: string,
    options: RunAgentOptions
  ) => string[];
  /** Optional JSON-line parser for structured output (e.g. --json mode). */
  parseJsonLine?: (line: string) => AgentEvent | null;
  /** Optional extractor to derive usage metrics from collected events. */
  extractUsage?: (events: AgentEvent[]) => {
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
  };
}

/**
 * Factory that creates an AgentDriverFn backed by a child process.
 *
 * The returned async generator:
 *  - Spawns the configured command via Bun.spawn()
 *  - Streams stdout line-by-line, yielding output events
 *  - Handles AbortController (SIGTERM → 5 s grace → SIGKILL)
 *  - Yields a complete or error event on process exit
 */
export function createSubprocessDriver(
  config: SubprocessDriverConfig
): AgentDriverFn {
  return async function* (
    prompt: string,
    workdir: string,
    options: RunAgentOptions = {}
  ): AsyncGenerator<AgentEvent> {
    const abortController = options.abortController ?? new AbortController();
    const args = config.buildArgs(prompt, workdir, options);

    let proc: ReturnType<typeof Bun.spawn>;

    try {
      proc = Bun.spawn([config.command, ...args], {
        cwd: workdir,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      yield {
        type: "error",
        error:
          err instanceof Error
            ? err
            : new Error(`Failed to spawn "${config.command}": ${String(err)}`),
      };
      return;
    }

    // Wire up abort handling: SIGTERM → 5 s grace → SIGKILL
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // Process may have already exited — ignore.
        }
      }, 5000);
    };

    if (abortController.signal.aborted) {
      onAbort();
    } else {
      abortController.signal.addEventListener("abort", onAbort, { once: true });
    }

    const collectedEvents: AgentEvent[] = [];
    const outputChunks: string[] = [];

    // Stream stdout line-by-line
    try {
      const stdout = proc.stdout as ReadableStream<Uint8Array>;
      const reader = stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);

          if (line.length === 0) continue;

          if (config.parseJsonLine) {
            const parsed = config.parseJsonLine(line);
            if (parsed) {
              collectedEvents.push(parsed);
              yield parsed;
            }
          } else {
            outputChunks.push(line);
            const event: AgentEvent = { type: "output", text: line };
            collectedEvents.push(event);
            yield event;
          }
        }
      }

      // Handle any remaining content in the buffer (no trailing newline)
      if (buffer.length > 0) {
        if (config.parseJsonLine) {
          const parsed = config.parseJsonLine(buffer);
          if (parsed) {
            collectedEvents.push(parsed);
            yield parsed;
          }
        } else {
          outputChunks.push(buffer);
          const event: AgentEvent = { type: "output", text: buffer };
          collectedEvents.push(event);
          yield event;
        }
      }
    } catch (err) {
      // stdout read errors are handled below via exit code
    }

    // Wait for process exit
    const exitCode = await proc.exited;

    // Clean up abort listener
    abortController.signal.removeEventListener("abort", onAbort);

    if (aborted) {
      yield {
        type: "error",
        error: new Error("Agent execution was aborted"),
      };
      return;
    }

    if (exitCode === 0) {
      const usage = config.extractUsage?.(collectedEvents);
      yield {
        type: "complete",
        result: outputChunks.join("\n"),
        ...(usage?.tokensIn !== undefined && { tokensIn: usage.tokensIn }),
        ...(usage?.tokensOut !== undefined && { tokensOut: usage.tokensOut }),
        ...(usage?.costUsd !== undefined && { costUsd: usage.costUsd }),
      };
    } else {
      // Collect stderr for error reporting
      let stderr = "";
      try {
        stderr = await new Response(proc.stderr as ReadableStream).text();
      } catch {
        // stderr may not be readable — ignore.
      }
      yield {
        type: "error",
        error: new Error(
          `Process "${config.command}" exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`
        ),
      };
    }
  };
}
