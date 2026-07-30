import React from 'react';
import { render } from 'ink';
import os from 'node:os';
import { initConfig, getConfig } from './config/index.js';
import { getDb } from './sessions/db.js';
import { ModelManager } from './models/manager.js';
import { App } from './ui/App.js';
import { executeSlashCommand } from './cli/commands.js';
import { parseToolCalls, executeToolCalls } from './tools/executor.js';
import { TerminalTool } from './tools/builtin/terminal.js';
import { createSession, getSessionHistory, addMessageToSession, updateSessionModel, listSessions, deleteSession } from './sessions/manager.js';

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

  // Active working directory — always keep the model informed
  const activeDir = TerminalTool.activeCwd || process.cwd();

  const toolDocs = `
Available XML Tools (use ONLY in BUILD mode):

<terminal>\ncommand here\n</terminal>
<cat>\nfile path\n</cat>
<grep>\nsearch string\n</grep>
<write>\n{"path": "relative/path", "content": "full file content"}\n</write>
<edit>\n{"path": "relative/path", "target": "exact block to replace", "replacement": "new block"}\n</edit>
<webfetch>\n{"url": "https://..."}\n</webfetch>
<websearch>\n{"query": "..."}\n</websearch>
`;

  const planPrompt = `You are AI Carry, a terminal-first agentic AI for software development and offensive security.

You are currently in PLAN mode (read-only). In this mode:
- Think carefully and ask clarifying questions before you propose any plan.
- Identify ambiguities: ask the user what OS, language, tool constraints, or scope they have in mind.
- Once you have enough information, write a clear numbered plan with expected commands and outcomes.
- Do NOT output any XML tool tags in Plan mode. Explain what you *would* do, not do it.
- At the end of your plan, tell the user to switch to Build mode (Tab key) to execute.

Current Working Directory: ${activeDir}
OS: ${osName} (${platform})
`;

  const buildPrompt = `You are AI Carry, a terminal-first agentic AI for software development and offensive security.

You are currently in BUILD mode (execution). In this mode:
- Execute tasks immediately using XML tool calls. Do not ask for confirmation unless the action is destructive.
- Always use the active working directory (${activeDir}) as your base for relative paths.
- Use <terminal> for shell commands, <write> to create files, <edit> to modify files, <cat> to read files.
- Chain multiple tool calls sequentially. After each tool result, evaluate and continue automatically.
- Handle errors gracefully: if a command fails, try an alternative approach and report what happened.
- Track a mental # Todos list: list what's done [✓] and what's next [·] after each step.
- OS: ${osName} (${platform}). All commands must be compatible with this OS.
${toolDocs}
`;

  const baseSystemPrompt = activeMode === 'build' ? buildPrompt : planPrompt;

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

// Enter alternative screen buffer, clear screen, and move cursor to 1,1
process.stdout.write('\u001b[?1049h\u001b[2J\u001b[H');

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
    initialTheme: getConfig().theme,
  })
);

let restored = false;
const restoreScreen = () => {
  if (restored) return;
  restored = true;
  // Restore primary screen buffer cleanly — no chat history dump
  process.stdout.write('\u001b[?1049l');
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
