import fs from 'node:fs';
import type { Tool, ToolOutput } from '../types.js';

export class CatTool implements Tool {
  name = 'cat';
  description = 'Read the contents of a file';
  permissions = 'readonly' as const;
  enabled = true;
  arguments = {
    path: {
      type: 'string' as const,
      description: 'The absolute or relative path to the file',
      required: true,
    },
  };

  async run(args: { path: string }): Promise<ToolOutput> {
    try {
      if (!fs.existsSync(args.path)) {
        return {
          success: false,
          output: '',
          error: `File not found: ${args.path}`,
        };
      }

      const stat = fs.statSync(args.path);
      if (stat.isDirectory()) {
        return {
          success: false,
          output: '',
          error: `Path is a directory: ${args.path}`,
        };
      }

      // Truncate size limit (100KB)
      const LIMIT = 100 * 1024;
      if (stat.size > LIMIT) {
        const fileContent = fs.readFileSync(args.path, 'utf8');
        return {
          success: true,
          output: fileContent.slice(0, LIMIT) + '\n\n[TRUNCATED: File exceeds 100KB limit]',
        };
      }

      const fileContent = fs.readFileSync(args.path, 'utf8');
      return {
        success: true,
        output: fileContent,
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message || String(error),
      };
    }
  }
}
