import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolOutput } from '../types.js';
import { TerminalTool } from './terminal.js';

export class WriteTool implements Tool {
  name = 'write';
  description = 'Write or overwrite a file with specified content';
  permissions = 'dangerous' as const;
  enabled = true;
  arguments = {
    path: {
      type: 'string' as const,
      description: 'The path of the file to write (relative to active directory)',
      required: true,
    },
    content: {
      type: 'string' as const,
      description: 'The full text content to write into the file',
      required: true,
    },
  };

  async run(args: { path: string; content: string }): Promise<ToolOutput> {
    try {
      if (!args.path) {
        return { success: false, output: '', error: 'Missing path argument' };
      }

      // Resolve the path against the active working directory of TerminalTool (persistent shell sandbox)
      const activeCwd = (TerminalTool as any).activeCwd || process.cwd();
      const resolvedPath = path.resolve(activeCwd, args.path);

      // Create parent directories if they don't exist
      const parentDir = path.dirname(resolvedPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, args.content || '', 'utf8');

      return {
        success: true,
        output: `Successfully wrote file to: ${resolvedPath}`,
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
