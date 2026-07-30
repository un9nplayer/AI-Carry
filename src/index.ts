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
import { loadProjectContext } from './context/loader.js';
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

  const platform = os.platform();
  const osName = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux';
  const activeDir = TerminalTool.activeCwd || process.cwd();

  // ── System Prompts ───────────────────────────────────────────────────────────

  const toolDocs = `
XML Tool Reference (emit these tags to call tools — no quotes, no escaping):

<terminal>
COMMAND
</terminal>
  → Runs COMMAND in the shell. Use for: mkdir, ls, cd, apt, go install, subfinder, amass, etc.

<cat>
/path/to/file
</cat>
  → Read a file's content.

<write>
{"path": "relative/path/file.txt", "content": "full content here"}
</write>
  → Create or overwrite a file.

<edit>
{"path": "relative/path/file.txt", "target": "exact text to replace", "replacement": "new text"}
</edit>
  → Precise in-place edit.

<webfetch>
{"url": "https://example.com"}
</webfetch>
  → Fetch a URL and return its text.

<websearch>
{"query": "search terms"}
</websearch>
  → Web search.
`;

  const buildPrompt = `You are AI Carry, an autonomous terminal agent. Current mode: BUILD (execute immediately).

CRITICAL RULES — follow these without exception:
1. OUTPUT XML TOOL TAGS NOW. Do not ask questions. Do not write plans. Do not output JSON. Just act.
2. Start your response with the FIRST tool call. Example for "create folder foo":
   <terminal>
   mkdir -p foo
   </terminal>
3. After each tool result you receive, output the NEXT tool call immediately.
4. Keep going until the full task is complete. Do not stop after one tool.
5. When ALL steps are done, write a brief "Done." summary.
6. If a tool fails, diagnose inline and retry with a different command.
7. Never output a JSON todo list. Never say "I would" or "I'll". Just run the tools.

OS: ${osName} (${platform})
Working Directory: ${activeDir}
Shell: ${platform === 'win32' ? 'PowerShell' : 'bash'}

${toolDocs}`;

  const planPrompt = `You are AI Carry, a terminal-first AI assistant. Current mode: PLAN (read-only).

In PLAN mode:
- Ask 1-3 targeted clarifying questions if genuinely needed.
- Once you have enough context, write a numbered plan with exact commands.
- Do NOT output any XML tool tags — describe what you would run, don't run it.
- End by reminding the user: press Tab to switch to Build mode, then type "go" or "execute".

OS: ${osName} (${platform})
Working Directory: ${activeDir}`;

  // Load project context (.aicarry/AGENTS.md + CONTEXT.md)
  const projectContext = loadProjectContext(activeDir);
  const projectContextBlock = projectContext
    ? `\n\n---\n${projectContext}`
    : '';

  const baseSystemPrompt = (activeMode === 'build' ? buildPrompt : planPrompt) + projectContextBlock;

  // ── Agentic Execution Loop ───────────────────────────────────────────────────

  try {
    const MAX_ITERATIONS = 10;
    let fullOutput = '';
    let iteration = 0;

    // Build initial message list from DB history
    const getMessages = () => {
      const dbHistory = getSessionHistory(activeSessionId);
      const mapped = dbHistory.map((m) => ({
        role: (m.role === 'assistant' || m.role === 'system' ? m.role : 'user') as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      // If in Build mode, append a explicit execution system directive at the end if user requested execution
      if (activeMode === 'build') {
        const lastUserMsg = [...mapped].reverse().find(m => m.role === 'user')?.content.toLowerCase() || '';
        const executionTriggerWords = ['execute', 'go', 'do it', 'start', 'run', 'yes', 'proceed', 'ok'];
        const isTrigger = executionTriggerWords.some(w => lastUserMsg.includes(w));

        if (isTrigger || mapped.length <= 2) {
          mapped.push({
            role: 'system' as const,
            content: `CRITICAL INSTRUCTION: You are in BUILD mode now. The user wants you to execute immediately. Do NOT ask clarifying questions or write plans. Emit your first <terminal> command right now.`,
          });
        }
      }

      return [
        { role: 'system' as const, content: baseSystemPrompt },
        ...mapped,
      ];
    };

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      // Stream model response
      let iterationText = '';
      const messages = getMessages();
      const generator = modelManager.stream(messages);

      for await (const chunk of generator) {
        if (chunk.content) {
          // Clean out tokenizer artifact tokens like <unk>, [UNK], etc.
          const cleanChunk = chunk.content.replace(/<unk>|\[UNK\]|\[PAD\]/gi, '');
          if (cleanChunk) {
            iterationText += cleanChunk;
            if (onChunk) onChunk(cleanChunk);
          }
        }
      }

      if (!iterationText.trim()) break;

      // In Build mode: detect and execute tool calls
      if (activeMode === 'build') {
        const toolCalls = parseToolCalls(iterationText);

        if (toolCalls.length === 0) {
          // No tool calls found — save this turn and stop
          fullOutput += iterationText;
          addMessageToSession(activeSessionId, 'assistant', iterationText, 0, 0, 0);
          break;
        }

        // Execute tools and collect output
        const toolOutput = await executeToolCalls(toolCalls, async () => true);
        const toolResultBlock = `\n\n${toolOutput}`;

        // Stream the tool results back to the UI
        if (onChunk) onChunk(toolResultBlock);

        // Save this iteration: model output + tool results as one assistant turn
        const combinedTurn = iterationText + toolResultBlock;
        fullOutput += combinedTurn;
        addMessageToSession(activeSessionId, 'assistant', combinedTurn, 0, 0, 0);

        // If the model's last text (after tool calls) looks like it's done, stop
        const textAfterLastTag = iterationText.replace(/<\w+>[\s\S]*?<\/\w+>/g, '').trim();
        const isDone =
          textAfterLastTag.toLowerCase().includes('done') ||
          textAfterLastTag.toLowerCase().includes('complete') ||
          textAfterLastTag.toLowerCase().includes('finished') ||
          textAfterLastTag.toLowerCase().includes('all steps');

        if (isDone) break;

        // Otherwise continue — the model will see tool results and keep going
        continue;
      } else {
        // Plan mode: single turn, no loop
        fullOutput += iterationText;
        addMessageToSession(activeSessionId, 'assistant', iterationText, 0, 0, 0);
        break;
      }
    }

    // Return synced DB history to UI
    const finalDbHistory = getSessionHistory(activeSessionId);
    const mappedHistory = finalDbHistory.map((m) => ({
      role: (m.role === 'assistant' || m.role === 'system' ? m.role : 'user') as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    return { output: fullOutput, payload: { history: mappedHistory } };
  } catch (error: any) {
    const errMsg = `Error: ${error.message || String(error)}`;
    addMessageToSession(activeSessionId, 'assistant', errMsg, 0, 0, 0);
    return { output: errMsg };
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
