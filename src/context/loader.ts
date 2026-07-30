import fs from 'node:fs';
import path from 'node:path';

/**
 * Loads AGENTS.md and CONTEXT.md from the nearest .aicarry/ directory
 * (searching cwd upward, then home directory).
 */
export function loadProjectContext(cwd: string): string {
  const sections: string[] = [];

  const searchDirs = [cwd, ...getAncestors(cwd), process.env.HOME || ''];

  for (const dir of searchDirs) {
    const aicarryDir = path.join(dir, '.aicarry');
    if (!fs.existsSync(aicarryDir)) continue;

    for (const filename of ['AGENTS.md', 'CONTEXT.md']) {
      const filePath = path.join(aicarryDir, filename);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8').trim();
          if (content) sections.push(content);
        } catch {
          // Skip unreadable files
        }
      }
    }
    break; // Use first .aicarry directory found
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Loads a named skill from .aicarry/skills/<name>.md
 */
export function loadSkill(name: string, cwd: string): string | null {
  const searchDirs = [cwd, ...getAncestors(cwd), process.env.HOME || ''];

  for (const dir of searchDirs) {
    const skillPath = path.join(dir, '.aicarry', 'skills', `${name}.md`);
    if (fs.existsSync(skillPath)) {
      try {
        return fs.readFileSync(skillPath, 'utf8').trim();
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Lists all available skills in .aicarry/skills/
 */
export function listSkills(cwd: string): string[] {
  const searchDirs = [cwd, ...getAncestors(cwd), process.env.HOME || ''];

  for (const dir of searchDirs) {
    const skillsDir = path.join(dir, '.aicarry', 'skills');
    if (!fs.existsSync(skillsDir)) continue;
    try {
      return fs.readdirSync(skillsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
    } catch {
      return [];
    }
  }
  return [];
}

function getAncestors(dir: string): string[] {
  const result: string[] = [];
  let current = path.dirname(dir);
  while (current !== dir) {
    result.push(current);
    dir = current;
    current = path.dirname(current);
  }
  return result;
}
