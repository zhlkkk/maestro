import React from "react";
import { Box, Text } from "ink";

const MAX_LINES = 200;

export interface OutputPanelProps {
  lines: string[];
  maxLines?: number;
}

/**
 * Displays the last N lines of agent output.
 * Uses a simple tail view — always shows the most recent lines.
 */
export function OutputPanel({ lines, maxLines = 20 }: OutputPanelProps) {
  const visibleLines = lines.slice(-maxLines);

  if (visibleLines.length === 0) {
    return (
      <Box>
        <Text dimColor>Waiting for agent output...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visibleLines.map((line, i) => (
        <Text key={i} wrap="truncate">
          {line}
        </Text>
      ))}
    </Box>
  );
}

/**
 * Circular buffer for accumulating output lines.
 * Call addText() with raw text from agent output events.
 */
export function createOutputBuffer(maxLines: number = MAX_LINES) {
  let buffer: string[] = [];

  return {
    addText(text: string): void {
      const newLines = text.split("\n");
      buffer = [...buffer, ...newLines].slice(-maxLines);
    },

    getLines(): string[] {
      return buffer;
    },

    clear(): void {
      buffer = [];
    },
  };
}
