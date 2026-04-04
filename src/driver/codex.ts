import type { AgentEvent, RunAgentOptions } from "./types.js";

/**
 * Run a Codex CLI agent in non-interactive mode.
 * Uses `codex exec --json` for structured JSONL output.
 */
export async function* runCodexAgent(
  prompt: string,
  workdir: string,
  options: RunAgentOptions = {}
): AsyncGenerator<AgentEvent> {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--dangerously-bypass-approvals-and-sandbox",
    "-C", workdir,
  ];

  if (options.model) {
    args.push("-m", options.model);
  }

  args.push(prompt);

  const abortController = options.abortController ?? new AbortController();

  let proc: ReturnType<typeof Bun.spawn> | undefined;
  let aborted = false;

  // Handle abort
  const onAbort = () => {
    aborted = true;
    if (proc) {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc?.kill("SIGKILL"); } catch { /* already dead */ }
      }, 5000);
    }
  };
  abortController.signal.addEventListener("abort", onAbort, { once: true });

  try {
    proc = Bun.spawn(["codex", ...args], {
      cwd: workdir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = proc.stdout;
    if (!stdout || typeof stdout === "number") {
      yield { type: "error", error: new Error("Failed to capture codex stdout") };
      return;
    }

    const reader = (stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastResult = "";
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    // Stream stdout line by line, parse JSONL events
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        const parsed = parseCodexJsonLine(line);
        if (parsed) {
          if ("type" in parsed && parsed.type === "output") {
            yield parsed as AgentEvent;
            lastResult = parsed.text;
          } else if ("_usage" in parsed) {
            tokensIn = parsed._usage.tokensIn;
            tokensOut = parsed._usage.tokensOut;
          }
        }
      }
    }

    // Wait for process to exit
    const exitCode = await proc.exited;

    if (aborted) {
      yield { type: "error", error: new Error("Codex agent execution was aborted") };
      return;
    }

    if (exitCode !== 0) {
      const stderr = proc.stderr;
      const stderrText = stderr && typeof stderr !== "number"
        ? await new Response(stderr as ReadableStream).text()
        : "";
      yield {
        type: "error",
        error: new Error(
          `Codex exited with code ${exitCode}${stderrText ? `: ${stderrText.trim()}` : ""}`
        ),
      };
      return;
    }

    yield {
      type: "complete",
      result: lastResult,
      tokensIn,
      tokensOut,
      modelUsed: options.model,
    };
  } catch (err) {
    if (aborted) {
      yield { type: "error", error: new Error("Codex agent execution was aborted") };
    } else {
      yield {
        type: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  } finally {
    abortController.signal.removeEventListener("abort", onAbort);
  }
}

type ParsedLine =
  | { type: "output"; text: string }
  | { _usage: { tokensIn?: number; tokensOut?: number } };

/**
 * Parse a single JSONL line from codex exec --json output.
 * Returns a parsed event or null if the line should be skipped.
 */
function parseCodexJsonLine(line: string): ParsedLine | null {
  try {
    const data = JSON.parse(line);

    switch (data.type) {
      case "item.completed": {
        const item = data.item;
        if (item?.type === "agent_message" && item.text) {
          return { type: "output", text: item.text };
        }
        if (item?.type === "command_execution" && item.aggregated_output) {
          return { type: "output", text: `[cmd] ${item.command}\n${item.aggregated_output}` };
        }
        return null;
      }

      case "turn.completed": {
        if (data.usage) {
          return {
            _usage: {
              tokensIn: data.usage.input_tokens,
              tokensOut: data.usage.output_tokens,
            },
          };
        }
        return null;
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}
