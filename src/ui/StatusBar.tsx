import React from 'react';
import { Box, Text } from 'ink';
import { themes } from './themes.js';

interface StatusBarProps {
  modelName: string;
  mode: 'plan' | 'build';
  tokenPercent: number;
  cost: number;
  theme: string;
}

export function StatusBar({ modelName, mode, tokenPercent, cost, theme = 'dark' }: StatusBarProps) {
  const colors = themes[theme] || themes.dark;
  const modeText = mode === 'plan' ? 'PLAN' : 'BUILD';

  return (
    <Box 
      borderStyle={colors.inkBorderStyle} 
      borderColor={colors.inkBorderColor} 
      paddingX={1} 
      justifyContent="space-between"
    >
      <Box gap={2}>
        <Text>{colors.primary('AI Carry')}</Text>
        <Text>{colors.muted('|')}</Text>
        <Text>{colors.secondary(`Model: ${modelName}`)}</Text>
        <Text>{colors.muted('|')}</Text>
        <Text>{mode === 'plan' ? colors.success(`Mode: ${modeText}`) : colors.error(`Mode: ${modeText}`)}</Text>
      </Box>
      <Box gap={2}>
        <Text>{colors.secondary(`Context: ${tokenPercent}%`)}</Text>
        <Text>{colors.muted('|')}</Text>
        <Text>{colors.success(`Cost: $${cost.toFixed(4)}`)}</Text>
      </Box>
    </Box>
  );
}
