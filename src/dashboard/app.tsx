import React, { useReducer } from "react";
import { Box, Text, Static } from "ink";
import { PhaseList, type PhaseInfo, type PhaseStatus } from "./phase-list.js";
import { OutputPanel, createOutputBuffer } from "./output-panel.js";
import type { MaestroEvent } from "../types.js";

interface DashboardState {
  phases: PhaseInfo[];
  outputLines: string[];
  pipelineStatus: "running" | "completed" | "failed";
  currentPhase?: string;
  completedPhases: Array<{ name: string; status: string; durationMs: number }>;
}

type DashboardAction = MaestroEvent;

const outputBuffer = createOutputBuffer();

function dashboardReducer(state: DashboardState, event: DashboardAction): DashboardState {
  switch (event.type) {
    case "PHASE_START": {
      const phaseName = event.phase!;
      return {
        ...state,
        currentPhase: phaseName,
        phases: state.phases.map((p) =>
          p.name === phaseName
            ? { ...p, status: "running" as PhaseStatus, startTime: Date.now() }
            : p
        ),
      };
    }

    case "AGENT_OUTPUT": {
      const text = event.data.text as string;
      outputBuffer.addText(text);
      return {
        ...state,
        outputLines: outputBuffer.getLines(),
      };
    }

    case "PHASE_COMPLETE": {
      const phaseName = event.phase!;
      const durationMs = (event.data.duration_ms as number) ?? 0;
      const status = event.data.status as string;
      return {
        ...state,
        phases: state.phases.map((p) =>
          p.name === phaseName
            ? { ...p, status: "completed" as PhaseStatus, durationMs }
            : p
        ),
        completedPhases: [
          ...state.completedPhases,
          { name: phaseName, status, durationMs },
        ],
      };
    }

    case "PHASE_FAILED":
    case "PHASE_TIMEOUT": {
      const phaseName = event.phase!;
      return {
        ...state,
        phases: state.phases.map((p) =>
          p.name === phaseName
            ? { ...p, status: "failed" as PhaseStatus }
            : p
        ),
      };
    }

    case "PIPELINE_COMPLETE":
      return { ...state, pipelineStatus: "completed" };

    case "PIPELINE_FAILED":
      return { ...state, pipelineStatus: "failed" };

    default:
      return state;
  }
}

export interface DashboardProps {
  phaseNames: string[];
  paradigmName: string;
  task: string;
}

export function Dashboard({ phaseNames, paradigmName, task }: DashboardProps) {
  const initialState: DashboardState = {
    phases: phaseNames.map((name) => ({ name, status: "pending" as PhaseStatus })),
    outputLines: [],
    pipelineStatus: "running",
    currentPhase: undefined,
    completedPhases: [],
  };

  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🎼 Maestro
        </Text>
        <Text> — {paradigmName}</Text>
      </Box>

      {/* Completed phases log */}
      <Static items={state.completedPhases}>
        {(phase) => (
          <Text key={`${phase.name}-${phase.durationMs}`} color="green">
            ✔ {phase.name} ({(phase.durationMs / 1000).toFixed(1)}s) → {phase.status}
          </Text>
        )}
      </Static>

      {/* Phase progress */}
      <PhaseList phases={state.phases} />

      {/* Agent output */}
      {state.currentPhase && (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Text dimColor>── {state.currentPhase} output ──</Text>
          <OutputPanel lines={state.outputLines} maxLines={15} />
        </Box>
      )}

      {/* Status bar */}
      <Box marginTop={1}>
        {state.pipelineStatus === "running" && (
          <Text color="yellow">Running...</Text>
        )}
        {state.pipelineStatus === "completed" && (
          <Text color="green" bold>Pipeline completed successfully</Text>
        )}
        {state.pipelineStatus === "failed" && (
          <Text color="red" bold>Pipeline failed</Text>
        )}
      </Box>
    </Box>
  );
}

/** Create a dispatch function for external event injection */
export function createDashboardDispatcher() {
  let dispatchFn: ((event: MaestroEvent) => void) | null = null;

  return {
    setDispatch(fn: (event: MaestroEvent) => void) {
      dispatchFn = fn;
    },
    dispatch(event: MaestroEvent) {
      dispatchFn?.(event);
    },
  };
}
