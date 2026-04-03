import React, { useState, useEffect } from "react";
import { Text } from "ink";

interface TimerProps {
  startTime: number;
  active: boolean;
}

export function Timer({ startTime, active }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime, active]);

  const seconds = (elapsed / 1000).toFixed(1);
  return <Text dimColor>{seconds}s</Text>;
}
