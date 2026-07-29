const COMMANDS = [
  '/help',
  '/model',
  '/models',
  '/new-chat',
  '/chat list',
  '/chat load',
  '/chat rename',
  '/chat delete',
  '/plan',
  '/build',
  '/clear',
  '/exit',
];

const MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'claude-3-opus',
  'ollama/llama3',
  'ollama/mistral',
  'nvidia/llama3-70b',
];

/**
 * Given the current input line, returns a list of completion suggestions.
 */
export function getAutocompleteSuggestions(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return [];
  }

  // Model completions
  if (trimmed.startsWith('/model ')) {
    const modelInput = trimmed.slice(7).toLowerCase();
    return MODELS.filter((m) => m.toLowerCase().startsWith(modelInput)).map((m) => `/model ${m}`);
  }

  // All slash command completions
  return COMMANDS.filter((cmd) => cmd.startsWith(trimmed));
}
