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

export interface PhaseListProps {
  phases: PhaseInfo[];
  /** Map from fork phase name to its child phase names */
  forkChildren?: Record<string, string[]>;
}

function PhaseRow({ phase, indent = 0 }: { phase: PhaseInfo; indent?: number }) {
  return (
    <Box key={phase.name} gap={1}>
      {indent > 0 && <Text>{"  ".repeat(indent)}</Text>}
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
  );
}

export function PhaseList({ phases, forkChildren }: PhaseListProps) {
  // Collect child phase names into a Set for quick lookup
  const childNames = new Set<string>();
  if (forkChildren) {
    for (const children of Object.values(forkChildren)) {
      for (const c of children) childNames.add(c);
    }
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {phases.map((phase) => {
        // Skip phases that are fork children — they are rendered under their parent
        if (childNames.has(phase.name)) return null;

        const children = forkChildren?.[phase.name];
        if (children && children.length > 0) {
          // Render fork parent + indented children
          return (
            <Box key={phase.name} flexDirection="column">
              <PhaseRow phase={phase} />
              {children.map((childName) => {
                const childPhase = phases.find((p) => p.name === childName);
                if (!childPhase) return null;
                return <PhaseRow key={childName} phase={childPhase} indent={1} />;
              })}
            </Box>
          );
        }

        return <PhaseRow key={phase.name} phase={phase} />;
      })}
    </Box>
  );
}
