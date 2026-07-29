import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  modelName: string;
  mode: 'plan' | 'build';
  tokenPercent: number;
  cost: number;
}

export function StatusBar({ modelName, mode, tokenPercent, cost }: StatusBarProps) {
  const modeText = mode === 'plan' ? 'PLAN' : 'BUILD';
  const modeColor = mode === 'plan' ? 'green' : 'red';

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Box gap={2}>
        <Text color="cyan" bold>AI Carry</Text>
        <Text color="gray">|</Text>
        <Text color="yellow">Model: {modelName}</Text>
        <Text color="gray">|</Text>
        <Text color={modeColor} bold>Mode: {modeText}</Text>
      </Box>
      <Box gap={2}>
        <Text color="magenta">Context: {tokenPercent}%</Text>
        <Text color="gray">|</Text>
        <Text color="green">Cost: ${cost.toFixed(4)}</Text>
      </Box>
    </Box>
  );
}
