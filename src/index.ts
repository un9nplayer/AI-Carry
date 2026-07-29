import React from 'react';
import { render } from 'ink';
import os from 'node:os';
import chalk from 'chalk';
import { initConfig, getConfig } from './config/index.js';
import { getDb } from './sessions/db.js';
import { ModelManager } from './models/manager.js';
import { App } from './ui/App.js';
import { renderMarkdown } from './ui/markdown.js';
import { executeSlashCommand } from './cli/commands.js';
import { parseToolCalls, executeToolCalls } from './tools/executor.js';
import { createSession, getSession, getSessionHistory, addMessageToSession, updateSessionModel, listSessions, deleteSession } from './sessions/manager.js';

// Init config and database
initConfig();
getDb();

const modelManager = new ModelManager();

// Create default initial conversation session
const defaultSession = createSession('Workspace Chat', modelManager.getActiveModel());
let activeSessionId = defaultSession.id;
let activeMode: 'plan' | 'build' = 'plan';

const initialHistory = [
  {
    role: 'system' as const,
    content: 'Welcome to AI Carry. Type /help to see all available slash commands.',
  },
];

async function handleCommand(
  input: string,
  onChunk?: (chunk: string) => void
): Promise<{ output: string; exit?: boolean; action?: string; payload?: any }> {
  // 1. Process slash command first
  const setMode = (mode: 'plan' | 'build') => {
    activeMode = mode;
  };

  const commandResult = await executeSlashCommand(input, modelManager, activeSessionId, setMode);
  if (commandResult.handled) {
    if (commandResult.action === 'exit') {
      return { output: commandResult.output, exit: true };
    }
    if (commandResult.action === 'new-chat' || commandResult.action === 'load-chat') {
      activeSessionId = commandResult.payload;
      const dbHistory = getSessionHistory(activeSessionId);
      const mappedHistory = dbHistory.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));
      return {
        output: commandResult.output,
        action: commandResult.action,
        payload: { sessionId: activeSessionId, history: mappedHistory }
      };
    }
    return { output: commandResult.output, action: commandResult.action, payload: commandResult.payload };
  }

  // 2. Append user message to database
  addMessageToSession(activeSessionId, 'user', input);

  // 3. Get full conversation history to feed LLM context
  const dbHistory = getSessionHistory(activeSessionId);
  const mappedMessages = dbHistory.map((m) => ({
    role: (m.role === 'assistant' || m.role === 'system' ? m.role : 'user') as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  const config = getConfig();
  const platform = os.platform();
  const osName = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux';

  // Define XML tools system prompt instruction
  const baseSystemPrompt = `You are AI Carry, a terminal-first Agentic AI for offensive security and software development.
You have direct terminal/system access through XML-style tool calls.

Available XML Tools:
- Terminal shell runner:
<terminal>
command line here
</terminal>

- Cat file reader:
<cat>
file path here
</cat>

- Grep text finder:
<grep>
search query here
</grep>

Current Operating System: ${osName} (Platform: ${platform})
Current Mode: ${activeMode.toUpperCase()}
Current Tool Permission Level: ${config.toolPermissions.toUpperCase()}

You must ensure that all terminal commands and scripts you output are strictly compatible with the current operating system (${osName}).

${activeMode === 'build' 
  ? `You are in BUILD Mode. If tasks require checking files, running terminal processes, or creating directories, you MUST use the XML tags to execute them immediately. You have full permission to run terminal commands (toolPermissions is set to ${config.toolPermissions.toUpperCase()}). Do not ask for confirmation; output the tags directly.` 
  : 'You are in PLAN Mode. Outline your steps, command strategies, and findings in markdown. Do NOT output any XML tool tags.'}
`;

  const finalMessages = [
    { role: 'system' as const, content: baseSystemPrompt },
    ...mappedMessages,
  ];

  try {
    // 4. Generate AI response using streaming API
    let outputText = '';
    const generator = modelManager.stream(finalMessages);

    for await (const chunk of generator) {
      if (chunk.content) {
        outputText += chunk.content;
        if (onChunk) {
          onChunk(chunk.content);
        }
      }
    }

    // 5. If Build Mode, parse and run XML tool calls
    if (activeMode === 'build') {
      const toolCalls = parseToolCalls(outputText);
      if (toolCalls.length > 0) {
        // Confirmation callback logic for dangerous actions
        const confirmExecution = async (toolName: string, args: Record<string, any>) => {
          // Automatic approve for automated tool runs in building block (or customize if needed)
          return true;
        };
        const toolOutput = await executeToolCalls(toolCalls, confirmExecution);
        outputText += `\n\n${toolOutput}`;
        if (onChunk) {
          onChunk(`\n\n${toolOutput}`);
        }
      }
    }

    // 6. Save AI output to session history database
    addMessageToSession(
      activeSessionId,
      'assistant',
      outputText,
      0, // tokensIn and tokensOut can be estimated or calculated
      0,
      0
    );

    return { output: outputText };
  } catch (error: any) {
    return { output: `Error generating response: ${error.message || String(error)}` };
  }
}

// Start Ink UI
const ui = render(
  React.createElement(App, {
    modelName: modelManager.getActiveModel(),
    initialHistory: [],
    onCommand: handleCommand,
    onModelChange: (model: string) => {
      modelManager.setModel(model);
      updateSessionModel(activeSessionId, model);
    },
    onModeChange: (mode: 'plan' | 'build') => {
      activeMode = mode;
    },
    onListModels: () => modelManager.listAllProviderModels(),
    onListSessions: async () => {
      return listSessions().map((s) => ({
        id: s.id,
        title: s.title,
        model: s.model,
        created_at: s.created_at,
      }));
    },
    onDeleteSession: async (id: string) => {
      deleteSession(id);
    },
  })
);

let restored = false;
const restoreScreen = () => {
  if (restored) return;
  restored = true;
  process.stdout.write('\u001b[?1049l');

  // Print full session history to stdout so the user can scroll/copy natively
  try {
    const dbHistory = getSessionHistory(activeSessionId);
    if (dbHistory.length > 0) {
      console.log(chalk.gray('\n=== Session Chat History (Preserved for Copy/Paste) ===\n'));
      for (const msg of dbHistory) {
        let roleLabel = '';
        if (msg.role === 'user') {
          roleLabel = chalk.cyan.bold('👤 USER:');
        } else if (msg.role === 'system') {
          roleLabel = chalk.yellow.bold('⚙️ SYSTEM:');
        } else {
          roleLabel = chalk.white.bold('🤖 ASSISTANT:');
        }
        console.log(roleLabel);
        console.log(renderMarkdown(msg.content));
        console.log('');
      }
      console.log(chalk.gray('=======================================================\n'));
    }
  } catch (err) {
    // Silently ignore if DB or rendering fails on exit
  }
};

process.on('exit', restoreScreen);
process.on('SIGINT', () => {
  restoreScreen();
  process.exit(0);
});
process.on('SIGTERM', () => {
  restoreScreen();
  process.exit(0);
});
