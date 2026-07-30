import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolOutput } from '../types.js';
import { TerminalTool } from './terminal.js';

export class EditTool implements Tool {
  name = 'edit';
  description = 'Perform exact search and replace edits on a file';
  permissions = 'dangerous' as const;
  enabled = true;
  arguments = {
    path: {
      type: 'string' as const,
      description: 'The path of the file to edit (relative to active directory)',
      required: true,
    },
    target: {
      type: 'string' as const,
      description: 'The exact block of code to search for inside the file',
      required: true,
    },
    replacement: {
      type: 'string' as const,
      description: 'The new block of code to replace the target with',
      required: true,
    },
  };

  async run(args: { path: string; target: string; replacement: string }): Promise<ToolOutput> {
    try {
      if (!args.path) {
        return { success: false, output: '', error: 'Missing path argument' };
      }
      if (args.target === undefined || args.replacement === undefined) {
        return { success: false, output: '', error: 'Missing target or replacement arguments' };
      }

      // Resolve file path
      const activeCwd = (TerminalTool as any).activeCwd || process.cwd();
      const resolvedPath = path.resolve(activeCwd, args.path);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, output: '', error: `File not found: ${resolvedPath}` };
      }

      const content = fs.readFileSync(resolvedPath, 'utf8');

      // Check if target exists and is unique
      const occurrences = content.split(args.target).length - 1;
      if (occurrences === 0) {
        return {
          success: false,
          output: '',
          error: `Target content not found in the file: ${args.target}`,
        };
      }
      if (occurrences > 1) {
        return {
          success: false,
          output: '',
          error: `Multiple occurrences of the target content found (${occurrences}). The target must be a unique block.`,
        };
      }

      // Replace the unique block
      const newContent = content.replace(args.target, args.replacement);
      fs.writeFileSync(resolvedPath, newContent, 'utf8');

      return {
        success: true,
        output: `Successfully edited ${resolvedPath}`,
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
