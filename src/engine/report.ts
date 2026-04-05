import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MaestroEvent } from "../types.js";
import { readEvents } from "./logger.js";

export interface PhaseReport {
  name: string;
  status: "completed" | "failed" | "timeout" | "skipped";
  durationMs?: number;
  retries: number;
  agentStatus?: string;
  error?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  modelUsed?: string;
}

export interface PipelineReport {
  paradigm: string;
  task: string;
  success: boolean;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  phases: PhaseReport[];
}

/**
 * Generate a markdown run report from events.
 */
export function generateReport(
  eventsFilePath: string,
  repoRoot: string,
  runId: string
): string {
  const events = readEvents(eventsFilePath);
  const report = buildReport(events);
  const markdown = formatReportMarkdown(report);

  // Write to .maestro/reports/
  const reportsDir = join(repoRoot, ".maestro", "reports");
  mkdirSync(reportsDir, { recursive: true });

  const reportPath = join(reportsDir, `run-${runId}.md`);
  writeFileSync(reportPath, markdown, "utf-8");

  return reportPath;
}

function buildReport(events: MaestroEvent[]): PipelineReport {
  const pipelineStart = events.find((e) => e.type === "PIPELINE_START");
  const pipelineEnd = events.find(
    (e) => e.type === "PIPELINE_COMPLETE" || e.type === "PIPELINE_FAILED"
  );

  const phaseStarts = events.filter((e) => e.type === "PHASE_START");
  const phaseCompletes = events.filter((e) => e.type === "PHASE_COMPLETE");
  const phaseFails = events.filter((e) => e.type === "PHASE_FAILED");
  const phaseTimeouts = events.filter((e) => e.type === "PHASE_TIMEOUT");
  const phaseRetries = events.filter((e) => e.type === "PHASE_RETRY");

  const phases: PhaseReport[] = [];
  const phaseNames = [...new Set(phaseStarts.map((e) => e.phase!))];

  for (const name of phaseNames) {
    const complete = phaseCompletes.find((e) => e.phase === name);
    const fail = phaseFails.find((e) => e.phase === name);
    const timeout = phaseTimeouts.find((e) => e.phase === name);
    const retryCount = phaseRetries.filter((e) => e.phase === name).length;

    let status: PhaseReport["status"] = "skipped";
    let durationMs: number | undefined;
    let agentStatus: string | undefined;
    let error: string | undefined;

    if (complete) {
      status = "completed";
      durationMs = complete.data.duration_ms as number;
      agentStatus = complete.data.status as string;
    } else if (timeout) {
      status = "timeout";
    } else if (fail) {
      status = "failed";
      durationMs = fail.data.duration_ms as number;
      error = fail.data.error as string;
    }

    const costUsd = complete?.data.cost_usd as number | undefined;
    const tokensIn = complete?.data.tokens_in as number | undefined;
    const tokensOut = complete?.data.tokens_out as number | undefined;
    const modelUsed = complete?.data.model_used as string | undefined;

    phases.push({ name, status, durationMs, retries: retryCount, agentStatus, error, costUsd, tokensIn, tokensOut, modelUsed });
  }

  const startTime = pipelineStart?.timestamp ?? "";
  const endTime = pipelineEnd?.timestamp ?? "";
  const totalDurationMs =
    startTime && endTime
      ? new Date(endTime).getTime() - new Date(startTime).getTime()
      : 0;

  return {
    paradigm: (pipelineStart?.data.paradigm as string) ?? "unknown",
    task: (pipelineStart?.data.task as string) ?? "unknown",
    success: pipelineEnd?.type === "PIPELINE_COMPLETE",
    startTime,
    endTime,
    totalDurationMs,
    phases,
  };
}

function formatReportMarkdown(report: PipelineReport): string {
  const statusIcon = report.success ? "✔" : "✖";
  const lines: string[] = [
    `# Maestro Run Report`,
    "",
    `**Paradigm:** ${report.paradigm}`,
    `**Task:** ${report.task}`,
    `**Status:** ${statusIcon} ${report.success ? "Success" : "Failed"}`,
    `**Duration:** ${(report.totalDurationMs / 1000).toFixed(1)}s`,
    `**Started:** ${report.startTime}`,
    `**Ended:** ${report.endTime}`,
    "",
    "## Phase Summary",
    "",
    "| Phase | Status | Duration | Retries | Agent Status |",
    "|-------|--------|----------|---------|--------------|",
  ];

  for (const phase of report.phases) {
    const icon =
      phase.status === "completed" ? "✔" :
      phase.status === "failed" ? "✖" :
      phase.status === "timeout" ? "⏱" : "○";
    const duration = phase.durationMs ? `${(phase.durationMs / 1000).toFixed(1)}s` : "-";
    lines.push(
      `| ${icon} ${phase.name} | ${phase.status} | ${duration} | ${phase.retries} | ${phase.agentStatus ?? "-"} |`
    );
  }

  // Add cost summary if any phase has usage data
  const hasUsageData = report.phases.some(
    (p) => p.costUsd != null || p.tokensIn != null || p.tokensOut != null || p.modelUsed != null
  );

  if (hasUsageData) {
    lines.push("", "## Cost Summary", "");
    lines.push("| Phase | Model | Tokens In | Tokens Out | Cost |");
    lines.push("|-------|-------|-----------|------------|------|");

    let totalCost = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let hasCost = false;
    let hasTokensIn = false;
    let hasTokensOut = false;

    for (const phase of report.phases) {
      const model = phase.modelUsed ?? "N/A";
      const tokIn = phase.tokensIn != null ? String(phase.tokensIn) : "N/A";
      const tokOut = phase.tokensOut != null ? String(phase.tokensOut) : "N/A";
      const cost = phase.costUsd != null ? `$${phase.costUsd.toFixed(4)}` : "N/A";

      if (phase.costUsd != null) { totalCost += phase.costUsd; hasCost = true; }
      if (phase.tokensIn != null) { totalTokensIn += phase.tokensIn; hasTokensIn = true; }
      if (phase.tokensOut != null) { totalTokensOut += phase.tokensOut; hasTokensOut = true; }

      lines.push(`| ${phase.name} | ${model} | ${tokIn} | ${tokOut} | ${cost} |`);
    }

    const totalTokIn = hasTokensIn ? String(totalTokensIn) : "N/A";
    const totalTokOut = hasTokensOut ? String(totalTokensOut) : "N/A";
    const totalCostStr = hasCost ? `$${totalCost.toFixed(4)}` : "N/A";
    lines.push(`| **Total** | - | ${totalTokIn} | ${totalTokOut} | ${totalCostStr} |`);
  }

  // Add failure details if any
  const failures = report.phases.filter((p) => p.error);
  if (failures.length > 0) {
    lines.push("", "## Failure Details", "");
    for (const phase of failures) {
      lines.push(`### ${phase.name}`, "", `${phase.error}`, "");
    }
  }

  lines.push("");
  return lines.join("\n");
}
