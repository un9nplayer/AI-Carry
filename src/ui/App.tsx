import React, { useEffect, useState, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { execa } from 'execa';
import { renderMarkdown } from './markdown.js';
import { themes } from './themes.js';
import { TerminalTool } from '../tools/builtin/terminal.js';
import chalk from 'chalk';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AppProps {
  modelName: string;
  initialHistory: ChatMessage[];
  onCommand: (input: string, onChunk: (chunk: string) => void) => Promise<{ output: string; exit?: boolean; action?: string; payload?: any }>;
  onModelChange: (model: string) => void;
  onListModels: () => Promise<{ provider: string; models: string[] }[]>;
  onModeChange?: (mode: 'plan' | 'build') => void;
  onListSessions?: () => Promise<{ id: string; title: string; model: string; created_at: number }[]>;
  onDeleteSession?: (id: string) => Promise<void>;
  initialTheme?: string;
}

const FALLBACK_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'claude-3-opus'
];

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function findWordBoundaryLeft(text: string, cursor: number): number {
  if (cursor <= 0) return 0;
  let i = cursor - 1;
  // skip trailing spaces of the word
  while (i > 0 && text[i] === ' ') {
    i--;
  }
  // find start of the word (first space to the left or beginning of string)
  while (i > 0 && text[i - 1] !== ' ') {
    i--;
  }
  return i;
}

function findWordBoundaryRight(text: string, cursor: number): number {
  if (cursor >= text.length) return text.length;
  let i = cursor;
  // skip non-spaces (current word characters)
  while (i < text.length && text[i] !== ' ') {
    i++;
  }
  // skip spaces
  while (i < text.length && text[i] === ' ') {
    i++;
  }
  return i;
}

export function App({ modelName, initialHistory, onCommand, onModelChange, onListModels, onModeChange, onListSessions, onDeleteSession, initialTheme }: AppProps) {
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory);
  const [inputBuffer, setInputBuffer] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [mode, setMode] = useState<'plan' | 'build'>('plan');
  const [cost, setCost] = useState(0.0);
  const [contextPercent, setContextPercent] = useState(0);
  const [theme, setTheme] = useState(initialTheme || 'dark');
  const [copyNotification, setCopyNotification] = useState('');
  const colors = themes[theme] || themes.dark;
  const { exit } = useApp();

  const inputBufferRef = React.useRef(inputBuffer);
  const cursorPositionRef = React.useRef(cursorPosition);

  useEffect(() => {
    inputBufferRef.current = inputBuffer;
    cursorPositionRef.current = cursorPosition;
  }, [inputBuffer, cursorPosition]);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // Active and selection state
  const [activeModel, setActiveModel] = useState(modelName);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [focusedModelIndex, setFocusedModelIndex] = useState(0);
  const [availableModels, setAvailableModels] = useState<string[]>(FALLBACK_MODELS);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Chat history session list selector state
  const [showChatHistorySelector, setShowChatHistorySelector] = useState(false);
  const [sessionsList, setSessionsList] = useState<{ id: string; title: string; model: string; created_at: number }[]>([]);
  const [focusedSessionIndex, setFocusedSessionIndex] = useState(0);
  const [isFetchingSessions, setIsFetchingSessions] = useState(false);

  // Generating, streaming & thinking animation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingOutput, setStreamingOutput] = useState('');
  const [showThinkingDetails, setShowThinkingDetails] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Terminal resizing & scrolling
  const [terminalHeight, setTerminalHeight] = useState(process.stdout.rows || 24);
  const [scrollOffset, setScrollOffset] = useState(0);


  // Update terminal height on resize
  useEffect(() => {
    const handleResize = () => {
      setTerminalHeight(process.stdout.rows || 24);
    };
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  // Spinner animation effect
  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Elapsed timer effect
  useEffect(() => {
    if (!isGenerating) {
      setElapsedTime(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Process history into lines
  const chatLines: string[] = [];
  for (const msg of history) {
    // Skip internal system messages that are just mode/model notifications (visible in sidebar)
    if (msg.role === 'system' && (
      msg.content.startsWith('Switched mode to:') ||
      msg.content.startsWith('Switched active model to:') ||
      msg.content.startsWith('Welcome to AI Carry')
    )) {
      continue;
    }

    if (msg.role === 'user') {
      chatLines.push(colors.primary('  '));
      chatLines.push(colors.muted('  You'));
    } else if (msg.role === 'system') {
      chatLines.push('');
      chatLines.push(colors.muted('  ─── System ───'));
    } else {
      chatLines.push('');
      chatLines.push(colors.muted('  AI Carry'));
    }

    const rendered = renderMarkdown(msg.content);
    const lines = rendered.split('\n');
    for (const l of lines) {
      if (msg.role === 'user') {
        chatLines.push('  ' + l);
      } else {
        chatLines.push('  ' + l);
      }
    }
    chatLines.push('');
  }

  // Live streaming lines
  if (streamingOutput) {
    chatLines.push('');
    chatLines.push(colors.muted('  AI Carry'));
    const rendered = renderMarkdown(streamingOutput);
    const lines = rendered.split('\n');
    for (const l of lines) {
      chatLines.push('  ' + l);
    }
    chatLines.push('');
  }

  const chatLinesCount = chatLines.length;
  // Account for bottom prompt box (3), mode bar (1), footer (1), and padding
  const viewportHeight = Math.max(5, terminalHeight - 6);

  // Dynamic viewport adjustment when panels are shown during generation to keep box height strictly fixed
  let panelsHeight = 0;
  if (isGenerating) {
    panelsHeight += 2; // spinner block + spacing
    if (showThinkingDetails) {
      panelsHeight += 7; // details panel + borders + margins
    }
  }
  const currentViewportHeight = Math.max(3, viewportHeight - panelsHeight);

  // Auto scroll to bottom on new messages / streaming tokens
  useEffect(() => {
    setScrollOffset(Math.max(0, chatLinesCount - currentViewportHeight));
  }, [chatLinesCount, currentViewportHeight]);

  // Mouse scroll wheel support via raw SGR events & Linux keyboard shortcuts
  useEffect(() => {
    const handleRawInput = (data: Buffer) => {
      const str = data.toString('utf8');
      
      // Scroll handling
      if (str.startsWith('\u001b[<64;')) {
        setScrollOffset((prev) => Math.max(0, prev - 3));
        return;
      } else if (str.startsWith('\u001b[<65;')) {
        setScrollOffset((prev) => Math.min(Math.max(0, chatLinesCount - currentViewportHeight), prev + 3));
        return;
      }
      
      // Ctrl+Left / Alt+Left (Jump word left)
      if (str === '\u001b[1;5D' || str === '\u001b[5D' || str === '\u001b\u001b[D' || str === '\u001b[1;3D') {
        setCursorPosition((prev) => findWordBoundaryLeft(inputBufferRef.current, prev));
        return;
      }
      
      // Ctrl+Right / Alt+Right (Jump word right)
      if (str === '\u001b[1;5C' || str === '\u001b[5C' || str === '\u001b\u001b[C' || str === '\u001b[1;3C') {
        setCursorPosition((prev) => findWordBoundaryRight(inputBufferRef.current, prev));
        return;
      }

      // Raw Backspace (ASCII 127 Delete or ASCII 8 Backspace)
      if (str === '\u007f' || str === '\u0008') {
        const cur = cursorPositionRef.current;
        const buf = inputBufferRef.current;
        if (cur > 0) {
          const before = buf.slice(0, cur - 1);
          const after = buf.slice(cur);
          updateInput(before + after, cur - 1);
        }
        return;
      }

      // Raw Delete (Escape sequence for Delete key)
      if (str === '\u001b[3~') {
        const cur = cursorPositionRef.current;
        const buf = inputBufferRef.current;
        if (cur < buf.length) {
          const before = buf.slice(0, cur);
          const after = buf.slice(cur + 1);
          updateInput(before + after, cur);
        }
        return;
      }
    };

    process.stdin.on('data', handleRawInput);
    return () => {
      process.stdin.off('data', handleRawInput);
    };
  }, [chatLinesCount, currentViewportHeight]);

  const updateInput = (newVal: string, nextCursor: number) => {
    setUndoStack((prev) => [...prev, inputBuffer]);
    setRedoStack([]);
    setInputBuffer(newVal);
    setCursorPosition(nextCursor);
  };

  // Copy all chat messages to OS clipboard
  const copyToClipboard = async (text: string) => {
    // Strip ANSI escape sequences before copying
    const stripped = text.replace(/\u001b\[[0-9;]*[mGKHFJl]/g, '').replace(/\u001b\[[\u003c][0-9;]*[Mm]/g, '');
    const platform = process.platform;
    try {
      if (platform === 'linux') {
        try {
          await execa('xclip', ['-selection', 'clipboard'], { input: stripped, shell: false });
        } catch {
          await execa('xsel', ['--clipboard', '--input'], { input: stripped, shell: false });
        }
      } else if (platform === 'darwin') {
        await execa('pbcopy', { input: stripped, shell: false });
      } else {
        await execa('clip.exe', { input: stripped, shell: false });
      }
      setCopyNotification('✓ Copied to clipboard');
    } catch {
      setCopyNotification('✗ Copy failed (install xclip or xsel)');
    }
    setTimeout(() => setCopyNotification(''), 2500);
  };

  const buildChatText = (msgs: typeof history): string => {
    return msgs
      .filter(m => !(m.role === 'system' && (
        m.content.startsWith('Switched mode to:') ||
        m.content.startsWith('Switched active model to:') ||
        m.content.startsWith('Welcome to AI Carry')
      )))
      .map(m => {
        const label = m.role === 'user' ? 'You' : m.role === 'system' ? 'System' : 'AI Carry';
        return `${label}:\n${m.content}`;
      })
      .join('\n\n');
  };

  const openModelSelector = () => {
    setShowModelSelector(true);
    setIsFetchingModels(true);
    onListModels()
      .then((groups) => {
        const flat: string[] = [];
        for (const g of groups) {
          for (const m of g.models) {
            flat.push(m);
          }
        }
        if (flat.length > 0) {
          setAvailableModels(flat);
          const currentIdx = flat.indexOf(activeModel);
          if (currentIdx !== -1) {
            setFocusedModelIndex(currentIdx);
          } else {
            setFocusedModelIndex(0);
          }
        }
      })
      .catch(() => {
        // Fall back to current list
      })
      .finally(() => {
        setIsFetchingModels(false);
      });
  };

  const openChatHistorySelector = () => {
    if (!onListSessions) return;
    setShowChatHistorySelector(true);
    setIsFetchingSessions(true);
    onListSessions()
      .then((sessions) => {
        setSessionsList(sessions);
        setFocusedSessionIndex(0);
      })
      .catch(() => {})
      .finally(() => {
        setIsFetchingSessions(false);
      });
  };

  useInput(async (input, key) => {
    // Ignore Backspace and Delete since they are handled exclusively by the raw stdin listener
    if (key.backspace || key.delete || input === '\u007f' || input === '\u0008' || input === '\u001b[3~') {
      return;
    }

    if (showModelSelector) {
      if (isFetchingModels) {
        if (key.escape) {
          setShowModelSelector(false);
        }
        return;
      }
      if (key.upArrow) {
        setFocusedModelIndex((prev) => (prev > 0 ? prev - 1 : availableModels.length - 1));
      } else if (key.downArrow) {
        setFocusedModelIndex((prev) => (prev < availableModels.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        const selectedModel = availableModels[focusedModelIndex];
        setActiveModel(selectedModel);
        onModelChange(selectedModel);
        setShowModelSelector(false);
        // Don't clutter chat with model switch — the sidebar shows current model
      } else if (key.escape) {
        setShowModelSelector(false);
      }
      return;
    }

    if (showChatHistorySelector) {
      if (isFetchingSessions) {
        if (key.escape) {
          setShowChatHistorySelector(false);
        }
        return;
      }
      if (key.upArrow) {
        setFocusedSessionIndex((prev) => (prev > 0 ? prev - 1 : sessionsList.length - 1));
      } else if (key.downArrow) {
        setFocusedSessionIndex((prev) => (prev < sessionsList.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        const selected = sessionsList[focusedSessionIndex];
        if (selected) {
          const response = await onCommand(`/chat load ${selected.id}`, () => {});
          if (response.action === 'load-chat') {
            setHistory(response.payload.history);
          }
        }
        setShowChatHistorySelector(false);
      } else if (key.delete || input === 'd' || input === 'D') {
        const selected = sessionsList[focusedSessionIndex];
        if (selected && onDeleteSession) {
          await onDeleteSession(selected.id);
          // Refresh list
          const updated = sessionsList.filter((s) => s.id !== selected.id);
          setSessionsList(updated);
          setFocusedSessionIndex((prev) => Math.max(0, Math.min(prev, updated.length - 1)));
        }
      } else if (key.escape) {
        setShowChatHistorySelector(false);
      }
      return;
    }

    if (isGenerating) {
      if (input === 't' || input === 'T') {
        setShowThinkingDetails((prev) => !prev);
      }
      if (key.escape) {
        exit();
      }
      return;
    }

    // Ctrl+M opens model selector
    if (key.ctrl && input === 'm') {
      openModelSelector();
      return;
    }

    // Ctrl+H opens chat history selector
    if (key.ctrl && input === 'h') {
      openChatHistorySelector();
      return;
    }

    // Ctrl+Z Undo
    if (key.ctrl && input === 'z') {
      if (undoStack.length > 0) {
        const prevVal = undoStack[undoStack.length - 1];
        setUndoStack((prev) => prev.slice(0, -1));
        setRedoStack((prev) => [...prev, inputBuffer]);
        setInputBuffer(prevVal);
        setCursorPosition(prevVal.length);
      }
      return;
    }

    // Ctrl+Y: Copy chat to clipboard if input empty, otherwise Redo
    if (key.ctrl && input === 'y') {
      if (inputBuffer === '') {
        // Copy all chat messages to clipboard
        copyToClipboard(buildChatText(history));
      } else if (redoStack.length > 0) {
        const nextVal = redoStack[redoStack.length - 1];
        setRedoStack((prev) => prev.slice(0, -1));
        setUndoStack((prev) => [...prev, inputBuffer]);
        setInputBuffer(nextVal);
        setCursorPosition(nextVal.length);
      }
      return;
    }

    // Tab toggles mode if input is empty
    if (key.tab) {
      if (inputBuffer.trim() === '') {
        const nextMode = mode === 'plan' ? 'build' : 'plan';
        setMode(nextMode);
        if (onModeChange) {
          onModeChange(nextMode);
        }
        // Do NOT add to chat history — mode is visible in the sidebar already
      }
      return;
    }

    // Scroll vs Command History Navigation
    const canScroll = chatLinesCount > currentViewportHeight;
    if (key.upArrow) {
      if (canScroll) {
        setScrollOffset((prev) => Math.max(0, prev - 1));
      } else {
        // Cycle command history upward
        if (commandHistory.length > 0) {
          const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(nextIdx);
          setInputBuffer(commandHistory[nextIdx]);
          setCursorPosition(commandHistory[nextIdx].length);
        }
      }
      return;
    }
    if (key.downArrow) {
      if (canScroll) {
        const maxScroll = Math.max(0, chatLinesCount - currentViewportHeight);
        setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
      } else {
        // Cycle command history downward
        if (commandHistory.length > 0 && historyIndex !== -1) {
          const nextIdx = historyIndex + 1;
          if (nextIdx >= commandHistory.length) {
            setHistoryIndex(-1);
            setInputBuffer('');
            setCursorPosition(0);
          } else {
            setHistoryIndex(nextIdx);
            setInputBuffer(commandHistory[nextIdx]);
            setCursorPosition(commandHistory[nextIdx].length);
          }
        }
      }
      return;
    }

    // PageUp/Down always scroll
    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - 5));
      return;
    }
    if (key.pageDown) {
      const maxScroll = Math.max(0, chatLinesCount - currentViewportHeight);
      setScrollOffset((prev) => Math.min(maxScroll, prev + 5));
      return;
    }

    // Ctrl+P / Ctrl+N - Cycle command history explicitly
    if (key.ctrl && input === 'p') {
      if (commandHistory.length > 0) {
        const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIdx);
        setInputBuffer(commandHistory[nextIdx]);
        setCursorPosition(commandHistory[nextIdx].length);
      }
      return;
    }
    if (key.ctrl && input === 'n') {
      if (commandHistory.length > 0 && historyIndex !== -1) {
        const nextIdx = historyIndex + 1;
        if (nextIdx >= commandHistory.length) {
          setHistoryIndex(-1);
          setInputBuffer('');
          setCursorPosition(0);
        } else {
          setHistoryIndex(nextIdx);
          setInputBuffer(commandHistory[nextIdx]);
          setCursorPosition(commandHistory[nextIdx].length);
        }
      }
      return;
    }

    // Left / Right Arrow cursor navigation
    if (key.leftArrow) {
      if (key.ctrl) {
        setCursorPosition((prev) => findWordBoundaryLeft(inputBuffer, prev));
      } else {
        setCursorPosition((prev) => Math.max(0, prev - 1));
      }
      return;
    }
    if (key.rightArrow) {
      if (key.ctrl) {
        setCursorPosition((prev) => findWordBoundaryRight(inputBuffer, prev));
      } else {
        setCursorPosition((prev) => Math.min(inputBuffer.length, prev + 1));
      }
      return;
    }

    // Ctrl+A - Jump to start
    if ((key.ctrl && input === 'a') || (key as any).home || input === '\u001b[H' || input === '\u001b[1~') {
      setCursorPosition(0);
      return;
    }
    // Ctrl+E - Jump to end
    if ((key.ctrl && input === 'e') || (key as any).end || input === '\u001b[F' || input === '\u001b[4~') {
      setCursorPosition(inputBuffer.length);
      return;
    }

    // Ctrl+U - Clear from cursor to start of line
    if (key.ctrl && input === 'u') {
      const after = inputBuffer.slice(cursorPosition);
      updateInput(after, 0);
      return;
    }

    // Ctrl+K - Clear from cursor to end of line
    if (key.ctrl && input === 'k') {
      const before = inputBuffer.slice(0, cursorPosition);
      updateInput(before, cursorPosition);
      return;
    }

    // Ctrl+W - Delete word before cursor
    if (key.ctrl && input === 'w') {
      const before = inputBuffer.slice(0, cursorPosition);
      const after = inputBuffer.slice(cursorPosition);
      const trimmedBefore = before.trimEnd();
      const lastSpaceIdx = trimmedBefore.lastIndexOf(' ');
      const newBefore = lastSpaceIdx === -1 ? '' : trimmedBefore.slice(0, lastSpaceIdx + 1);
      updateInput(newBefore + after, newBefore.length);
      return;
    }

    // Ctrl+D - Delete char under cursor / exit if empty
    if (key.ctrl && input === 'd') {
      if (inputBuffer === '') {
        exit();
        return;
      }
      if (cursorPosition < inputBuffer.length) {
        const before = inputBuffer.slice(0, cursorPosition);
        const after = inputBuffer.slice(cursorPosition + 1);
        updateInput(before + after, cursorPosition);
      }
      return;
    }

    // Ctrl+L - Clear screen
    if (key.ctrl && input === 'l') {
      setHistory([]);
      setScrollOffset(0);
      return;
    }

    if (key.return) {
      const commandText = inputBuffer.trim();
      if (!commandText) return;

      // Add to command history
      setCommandHistory((prev) => [...prev, inputBuffer]);
      setHistoryIndex(-1);

      // Optimistically append user message
      setHistory((prev) => [...prev, { role: 'user', content: commandText }]);
      setInputBuffer('');
      setCursorPosition(0);
      setIsGenerating(true);
      setStreamingOutput('');
      setUndoStack([]);
      setRedoStack([]);

      try {
        const response = await onCommand(commandText, (chunk) => {
          setStreamingOutput((prev) => prev + chunk);
        });

        if (response.action === 'mode-change') {
          setMode(response.payload);
        }

        if (response.action === 'model-change') {
          setActiveModel(response.payload);
        }

        if (response.action === 'config-update') {
          if (response.payload.key === 'theme') {
            setTheme(response.payload.value);
          }
          if (response.payload.key === 'defaultModel') {
            setActiveModel(response.payload.value);
          }
        }

        if (response.action === 'select-model') {
          openModelSelector();
        }

        if (response.action === 'clear') {
          setHistory([]);
          setScrollOffset(0);
          setStreamingOutput('');
          setIsGenerating(false);
          return;
        }

        if (response.action === 'new-chat' || response.action === 'load-chat') {
          setHistory(response.payload.history);
          setStreamingOutput('');
          setIsGenerating(false);
          return;
        }

        if (response.exit) {
          exit();
          return;
        }

        setHistory((prev) => [...prev, { role: 'assistant', content: response.output }]);
      } catch (err: any) {
        setHistory((prev) => [...prev, { role: 'system', content: `Execution Error: ${err.message || String(err)}` }]);
      } finally {
        setIsGenerating(false);
        setStreamingOutput('');
      }
    } else if (key.backspace || input === '\u007f' || input === '\u0008') {
      if (cursorPosition > 0) {
        const before = inputBuffer.slice(0, cursorPosition - 1);
        const after = inputBuffer.slice(cursorPosition);
        updateInput(before + after, cursorPosition - 1);
      }
    } else if (key.delete || input === '\u001b[3~') {
      if (cursorPosition < inputBuffer.length) {
        const before = inputBuffer.slice(0, cursorPosition);
        const after = inputBuffer.slice(cursorPosition + 1);
        updateInput(before + after, cursorPosition);
      }
    } else if (key.escape) {
      exit();
    } else if (input) {
      if (!key.ctrl && !key.meta && !key.tab) {
        // Prevent raw ANSI escape sequences from leaking into input buffer as characters
        if (input.startsWith('\u001b') && input !== '\u001b') {
          return;
        }
        const before = inputBuffer.slice(0, cursorPosition);
        const after = inputBuffer.slice(cursorPosition);
        updateInput(before + input + after, cursorPosition + input.length);
      }
    }
  });

  const visibleLines = chatLines.slice(scrollOffset, scrollOffset + currentViewportHeight);
  const providerName = activeModel.includes('/') ? activeModel.split('/')[0].toUpperCase() : 'DEFAULT';

  // Calculate model selection visible window slice
  const maxVisibleModels = 8;
  let startIdx = 0;
  if (focusedModelIndex >= maxVisibleModels) {
    startIdx = Math.min(
      focusedModelIndex - Math.floor(maxVisibleModels / 2),
      availableModels.length - maxVisibleModels
    );
  }
  startIdx = Math.max(0, startIdx);
  const slicedModels = availableModels.slice(startIdx, startIdx + maxVisibleModels);

  // Calculate chat history visible window slice
  const maxVisibleSessions = 8;
  let sessionStartIdx = 0;
  if (focusedSessionIndex >= maxVisibleSessions) {
    sessionStartIdx = Math.min(
      focusedSessionIndex - Math.floor(maxVisibleSessions / 2),
      sessionsList.length - maxVisibleSessions
    );
  }
  sessionStartIdx = Math.max(0, sessionStartIdx);
  const slicedSessions = sessionsList.slice(sessionStartIdx, sessionStartIdx + maxVisibleSessions);

  // Render input line with block cursor
  const beforeCursor = inputBuffer.slice(0, cursorPosition);
  const cursorChar = inputBuffer[cursorPosition] || ' ';
  const afterCursor = inputBuffer.slice(cursorPosition + 1);

  const activeDir = TerminalTool.activeCwd || process.cwd();
  
  // Format sidebar token string
  const totalTokens = 1000000;
  const usedTokens = Math.round(totalTokens * (contextPercent / 100));
  const formatNumber = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\n))/g, ",");

  return (
    <Box flexDirection="column" paddingX={1} width="100%" height={terminalHeight}>
      {/* Main Area: Splits into Left Chat and Right Sidebar */}
      <Box flexDirection="row" flexGrow={1} flexShrink={1}>
        
        {/* Left Column: Chat History & Input Prompt */}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} marginRight={1}>
          
          {/* Scrollable history viewport */}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {showModelSelector ? (
              <Box flexDirection="column" paddingX={1} flexGrow={1}>
                <Text>{colors.primary('Select a Model (Use Up/Down Arrow & Enter to confirm)')}</Text>
                
                {isFetchingModels ? (
                  <Box marginTop={1}>
                    <Text>{colors.warning('⠋ Fetching live models from configured APIs...')}</Text>
                  </Box>
                ) : (
                  <Box flexDirection="column" marginTop={1}>
                    {startIdx > 0 && <Text>{colors.muted(`  ▲ ... (${startIdx} more models above) ...`)}</Text>}
                    
                    {slicedModels.map((model, idx) => {
                      const actualIdx = startIdx + idx;
                      const isFocused = actualIdx === focusedModelIndex;
                      const isActive = model === activeModel;
                      
                      let prefix = '  ';
                      if (isFocused) {
                        prefix = '● ';
                      }
                      
                      let label = model;
                      if (isActive) {
                        label += ' (Active)';
                      }
                      
                      const styledLabel = isFocused 
                        ? colors.primary(prefix + label) 
                        : isActive 
                          ? colors.warning(prefix + label) 
                          : colors.text(prefix + label);

                      return (
                        <Text key={model} bold={isFocused}>
                          {styledLabel}
                        </Text>
                      );
                    })}

                    {startIdx + maxVisibleModels < availableModels.length && (
                      <Text>{colors.muted(`  ▼ ... (${availableModels.length - (startIdx + maxVisibleModels)} more models below) ...`)}</Text>
                    )}
                  </Box>
                )}
                
                <Box marginTop={1}>
                  <Text>{colors.muted('Press Esc to cancel')}</Text>
                </Box>
              </Box>
            ) : showChatHistorySelector ? (
              <Box flexDirection="column" paddingX={1} flexGrow={1}>
                <Text>{colors.warning('Chat Sessions History (Enter: Load | Del/D: Delete | Esc: Exit)')}</Text>
                
                {isFetchingSessions ? (
                  <Box marginTop={1}>
                    <Text>{colors.warning('⠋ Fetching previous sessions...')}</Text>
                  </Box>
                ) : sessionsList.length === 0 ? (
                  <Box marginTop={1}>
                    <Text>{colors.muted('No previous chat sessions found.')}</Text>
                  </Box>
                ) : (
                  <Box flexDirection="column" marginTop={1}>
                    {sessionStartIdx > 0 && <Text>{colors.muted(`  ▲ ... (${sessionStartIdx} more sessions above) ...`)}</Text>}
                    
                    {slicedSessions.map((session, idx) => {
                      const actualIdx = sessionStartIdx + idx;
                      const isFocused = actualIdx === focusedSessionIndex;
                      
                      let prefix = '  ';
                      if (isFocused) {
                        prefix = '● ';
                      }
                      
                      const dateStr = new Date(session.created_at).toLocaleString();
                      const sessionLabel = `"${session.title}" [${session.model}] (${dateStr})`;
                      
                      const styledLabel = isFocused 
                        ? colors.warning(prefix + sessionLabel) 
                        : colors.text(prefix + sessionLabel);

                      return (
                        <Text key={session.id} bold={isFocused}>
                          {styledLabel}
                        </Text>
                      );
                    })}

                    {sessionStartIdx + maxVisibleSessions < sessionsList.length && (
                      <Text>{colors.muted(`  ▼ ... (${sessionsList.length - (sessionStartIdx + maxVisibleSessions)} more sessions below) ...`)}</Text>
                    )}
                  </Box>
                )}
                
                <Box marginTop={1}>
                  <Text>{colors.muted('Press Esc to cancel')}</Text>
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                {visibleLines.map((line, idx) => (
                  <Text key={idx}>{line}</Text>
                ))}

                {/* Animated Thinking & Expandable Details Panel */}
                  {isGenerating && (
                    <Box flexDirection="column" marginTop={1}>
                      <Box gap={1}>
                        <Text>{colors.warning(SPINNER_FRAMES[spinnerFrame])}</Text>
                        <Text>{colors.muted(`thinking... ${elapsedTime}s`)}</Text>
                        <Text>{colors.muted('  T: expand')}</Text>
                      </Box>

                      {showThinkingDetails && (
                        <Box flexDirection="column" borderStyle={colors.inkBorderStyle} borderColor={colors.inkBorderColor} paddingX={1} marginTop={1}>
                          <Text>{colors.muted('Thought details')}</Text>
                          <Text>{colors.muted(`  Model: ${activeModel}`)}</Text>
                          <Text>{colors.muted(`  Provider: ${providerName}`)}</Text>
                          <Text>{colors.muted(`  Mode: ${mode}`)}</Text>
                        </Box>
                      )}
                    </Box>
                  )}
              </Box>
            )}
          </Box>

          {/* Mode & Model Indicator Row */}
          <Box paddingX={1} marginBottom={0} marginTop={1}>
            <Text>
              {mode === 'plan'
                ? colors.success('plan')
                : colors.warning('build')}
              {colors.muted(` · ${activeModel}`)}
            </Text>
          </Box>

          {/* Input Prompt Box with vertical border styling matching OpenCode */}
          <Box 
            borderStyle="single" 
            borderColor={colors.inkBorderColor} 
            borderTop={true}
            borderBottom={true}
            borderLeft={true}
            borderRight={false}
            paddingX={1} 
            gap={1} 
            height={3}
            marginBottom={0}
          >
            {isGenerating ? (
              <Text>{colors.muted('Generating...')}</Text>
            ) : (
              <Box gap={0}>
                <Text>{colors.primary('>')}</Text>
                <Text>{beforeCursor}</Text>
                <Text inverse>{cursorChar}</Text>
                <Text>{afterCursor}</Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* Right Column: Themed Sidebar Panel */}
        <Box 
          width={30} 
          flexDirection="column" 
          justifyContent="space-between" 
          paddingLeft={2}
          borderStyle="single"
          borderColor={colors.inkBorderColor}
          borderLeft={true}
          borderRight={false}
          borderTop={false}
          borderBottom={false}
        >
          {/* Sidebar Top: Greeting and Metrics */}
          <Box flexDirection="column">
            <Box flexDirection="column" marginBottom={1}>
              <Text>{colors.muted('Greeting')}</Text>
              <Text>{colors.text('AI Carry')}</Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
              <Text>{colors.muted('Context')}</Text>
              <Text>{colors.text(`${formatNumber(usedTokens)} tokens`)}</Text>
              <Text>{colors.muted(`${contextPercent}% used`)}</Text>
              <Text>{colors.text(`$${cost.toFixed(4)} spent`)}</Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
              <Text>{colors.muted('Mode')}</Text>
              <Text>{mode === 'plan' ? colors.success('plan (read-only)') : colors.warning('build (execute)')}</Text>
            </Box>

            <Box flexDirection="column">
              <Text>{colors.muted('Model')}</Text>
              <Text>{colors.text(activeModel)}</Text>
            </Box>
          </Box>

          {/* Sidebar Bottom */}
          <Box gap={1} alignItems="center">
            <Text color="green">●</Text>
            <Text>{colors.muted('AI Carry 1.0.0')}</Text>
          </Box>
        </Box>
      </Box>

      {/* Footer Area: Full-width directory and shortcut indicators */}
      <Box flexDirection="row" justifyContent="space-between" borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} borderColor={colors.inkBorderColor} paddingX={1} height={2}>
        <Box gap={2}>
          <Text>{colors.muted(activeDir)}</Text>
          {copyNotification ? <Text>{colors.success(copyNotification)}</Text> : null}
        </Box>
        <Text>{colors.muted(
          showModelSelector 
            ? isFetchingModels 
              ? 'Esc: Cancel' 
              : '↑↓: Navigate | Enter: Select | Esc: Back'
            : showChatHistorySelector
              ? '↑↓: Navigate | Enter: Load | Del: Delete | Esc: Close'
              : isGenerating 
                ? 'T: Expand Thinking | Esc: Exit'
                : 'Tab: Mode | Ctrl+M: Model | Ctrl+H: History | Ctrl+Y: Copy'
        )}</Text>
      </Box>
    </Box>
  );
}
