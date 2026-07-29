import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadSkillPrompt(skillName: string): string {
  // Safe default system prompt
  const defaultPrompt = 'You are a professional software engineer and offensive security assistant.';

  try {
    const builtinPath = path.join(__dirname, 'builtin', `${skillName}.md`);
    if (fs.existsSync(builtinPath)) {
      return fs.readFileSync(builtinPath, 'utf8');
    }
  } catch {
    // Ignore errors and use default
  }

  return defaultPrompt;
}
