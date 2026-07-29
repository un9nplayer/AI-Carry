import { ModelManager } from '../models/manager.js';
import { getConfig, updateConfig } from '../config/index.js';
import {
  createSession,
  listSessions,
  renameSession,
  deleteSession,
  updateSessionModel,
} from '../sessions/manager.js';

export interface CommandResult {
  handled: boolean;
  output: string;
  action?: 'exit' | 'new-chat' | 'load-chat' | 'clear' | 'mode-change' | 'select-model' | 'model-change';
  payload?: any;
}

export async function executeSlashCommand(
  input: string,
  modelManager: ModelManager,
  currentSessionId: string | null,
  setMode: (mode: 'plan' | 'build') => void
): Promise<CommandResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { handled: false, output: '' };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  switch (command) {
    case '/help':
      return {
        handled: true,
        output: `Available Commands:
  /help                             Show this menu
  /model <name>                     Switch active model
  /models                           List available models
  /new-chat                         Create a new chat session
  /chat list                        List all sessions
  /chat load <id>                   Load a specific session
  /chat rename <new name>           Rename the current session
  /chat delete <id>                 Delete a specific session
  /plan                             Switch to Plan Mode (no tool execution)
  /build                            Switch to Build Mode (runs tools/commands)
  /config [<key> <value>]           View or update settings (e.g. /config toolPermissions dangerous)
  /clear                            Clear screen
  /exit                             Exit the application`,
      };

    case '/model':
      if (args.length === 0) {
        return { handled: true, output: '', action: 'select-model' };
      }
      modelManager.setModel(args[0]);
      if (currentSessionId) {
        updateSessionModel(currentSessionId, args[0]);
      }
      return { handled: true, output: `Switched model to: ${args[0]}`, action: 'model-change', payload: args[0] };

    case '/models': {
      return { handled: true, output: '', action: 'select-model' };
    }

    case '/new-chat': {
      const model = modelManager.getActiveModel();
      const session = createSession('New Conversation', model);
      return {
        handled: true,
        output: `Created new chat session: "${session.title}" (ID: ${session.id})`,
        action: 'new-chat',
        payload: session.id,
      };
    }

    case '/chat': {
      const sub = args[0];
      if (sub === 'list') {
        const sessions = listSessions();
        if (sessions.length === 0) {
          return { handled: true, output: 'No chat sessions found. Type /new-chat to start one.' };
        }
        const formatted = sessions
          .map((s) => `[${s.id.slice(0, 8)}] "${s.title}" (${s.model})`)
          .join('\n');
        return { handled: true, output: `Chat Sessions:\n${formatted}` };
      }

      if (sub === 'load') {
        const id = args[1];
        if (!id) return { handled: true, output: 'Usage: /chat load <session-id>' };
        // Try exact match or partial match on first 8 chars
        const match = listSessions().find((s) => s.id === id || s.id.startsWith(id));
        if (!match) return { handled: true, output: `Session ID '${id}' not found.` };
        return {
          handled: true,
          output: `Loaded session: "${match.title}"`,
          action: 'load-chat',
          payload: match.id,
        };
      }

      if (sub === 'rename') {
        if (!currentSessionId) return { handled: true, output: 'No active session to rename.' };
        const newName = args.join(' ');
        if (!newName) return { handled: true, output: 'Usage: /chat rename <new name>' };
        renameSession(currentSessionId, newName);
        return { handled: true, output: `Renamed session to: "${newName}"` };
      }

      if (sub === 'delete') {
        const id = args[1];
        if (!id) return { handled: true, output: 'Usage: /chat delete <session-id>' };
        const match = listSessions().find((s) => s.id === id || s.id.startsWith(id));
        if (!match) return { handled: true, output: `Session ID '${id}' not found.` };
        deleteSession(match.id);
        return { handled: true, output: `Deleted session: "${match.title}"` };
      }

      return { handled: true, output: 'Usage: /chat [list | load | rename | delete]' };
    }

    case '/plan':
      setMode('plan');
      return { handled: true, output: 'Switched to Plan Mode (Safe, no commands or tools will run).', action: 'mode-change', payload: 'plan' };

    case '/build':
      setMode('build');
      return { handled: true, output: 'Switched to Build Mode (Interactive tool execution enabled).', action: 'mode-change', payload: 'build' };

    case '/clear':
      return { handled: true, output: '', action: 'clear' };

    case '/config': {
      if (args.length === 0) {
        const config = getConfig();
        return {
          handled: true,
          output: `Current Config:\n` +
            `  defaultModel:    ${config.defaultModel}\n` +
            `  temperature:     ${config.temperature}\n` +
            `  toolPermissions: ${config.toolPermissions}\n` +
            `  theme:           ${config.theme}`
        };
      }
      const key = args[0];
      const val = args[1];
      if (!val) {
        return { handled: true, output: `Usage: /config <key> <value>` };
      }
      try {
        let typedVal: any = val;
        if (val === 'true') typedVal = true;
        if (val === 'false') typedVal = false;
        if (!isNaN(Number(val))) typedVal = Number(val);

        updateConfig({ [key]: typedVal });
        return { handled: true, output: `Updated config key "${key}" to: ${val}` };
      } catch (error: any) {
        return { handled: true, output: `Failed to update config: ${error.message || String(error)}` };
      }
    }

    case '/exit':
      return { handled: true, output: 'Exiting AICarry...', action: 'exit' };

    default:
      return { handled: true, output: `Unknown command: ${command}. Type /help for assistance.` };
  }
}
