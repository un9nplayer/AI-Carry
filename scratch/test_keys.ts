import React, { useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import fs from 'node:fs';
import path from 'node:path';

const LOG_FILE = path.join(process.cwd(), 'scratch/key_log.txt');
fs.writeFileSync(LOG_FILE, 'Keypress Log Started\n', 'utf8');

function KeyDebugger() {
  useInput((input, key) => {
    const logMsg = `input: ${JSON.stringify(input)}, key: ${JSON.stringify(key)}\n`;
    fs.appendFileSync(LOG_FILE, logMsg, 'utf8');
    
    if (key.escape) {
      process.exit(0);
    }
  });

  return (
    <Box padding={1} borderStyle="single" borderColor="green">
      <Text color="green">Press keys to log them to scratch/key_log.txt. Press Escape to exit.</Text>
    </Box>
  );
}

render(<KeyDebugger />);
