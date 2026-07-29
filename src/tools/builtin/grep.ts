import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolOutput } from '../types.js';

export class GrepTool implements Tool {
  name = 'grep';
  description = 'Search for a string pattern in files recursively';
  permissions = 'readonly' as const;
  enabled = true;
  arguments = {
    query: {
      type: 'string' as const,
      description: 'The search term/pattern to scan for',
      required: true,
    },
    dir: {
      type: 'string' as const,
      description: 'The directory to search in (defaults to current directory)',
      required: false,
    },
  };

  async run(args: { query: string; dir?: string }): Promise<ToolOutput> {
    const searchDir = args.dir || '.';
    const query = args.query;

    if (!fs.existsSync(searchDir)) {
      return { success: false, output: '', error: `Directory not found: ${searchDir}` };
    }

    const matches: string[] = [];

    const walk = (currentDir: string) => {
      const files = fs.readdirSync(currentDir);
      for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
        const fullPath = path.join(currentDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else {
            // Check file content
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(query)) {
              const lines = content.split('\n');
              lines.forEach((line, index) => {
                if (line.includes(query)) {
                  matches.push(`${fullPath}:${index + 1}: ${line.trim()}`);
                }
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    };

    try {
      walk(searchDir);
      return {
        success: true,
        output: matches.length > 0 ? matches.slice(0, 100).join('\n') : 'No matches found.',
      };
    } catch (error: any) {
      return { success: false, output: '', error: error.message };
    }
  }
}
