import React from "react";
import { Box, Text } from "ink";
import { Timer } from "./timer.js";

export type PhaseStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PhaseInfo {
  name: string;
  status: PhaseStatus;
  startTime?: number;
  durationMs?: number;
}

const STATUS_ICONS: Record<PhaseStatus, string> = {
  pending: "○",
  running: "◉",
  completed: "✔",
  failed: "✖",
  skipped: "−",
};

const STATUS_COLORS: Record<PhaseStatus, string> = {
  pending: "gray",
  running: "yellow",
  completed: "green",
  failed: "red",
  skipped: "gray",
};

export function PhaseList({ phases }: { phases: PhaseInfo[] }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {phases.map((phase) => (
        <Box key={phase.name} gap={1}>
          <Text color={STATUS_COLORS[phase.status]}>
            {STATUS_ICONS[phase.status]}
          </Text>
          <Text bold={phase.status === "running"}>{phase.name}</Text>
          {phase.status === "running" && phase.startTime && (
            <Timer startTime={phase.startTime} active />
          )}
          {phase.durationMs != null && (
            <Text dimColor>({(phase.durationMs / 1000).toFixed(1)}s)</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
