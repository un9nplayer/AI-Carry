import { execa } from 'execa';
import type { Tool, ToolOutput } from '../types.js';

export class TerminalTool implements Tool {
  name = 'terminal';
  description = 'Run a command in the system terminal shell';
  permissions = 'dangerous' as const;
  enabled = true;
  arguments = {
    command: {
      type: 'string' as const,
      description: 'The exact shell command line to run',
      required: true,
    },
  };

  async run(args: { command: string }): Promise<ToolOutput> {
    try {
      const result = await execa(args.command, {
        shell: true,
        reject: false,
        timeout: 30000,
      });

      const hasError = result.exitCode !== 0;
      return {
        success: !hasError,
        output: result.stdout || result.stderr || `Command completed with exit code: ${result.exitCode}`,
        error: hasError ? (result.stderr || result.stdout || `Command failed with exit code: ${result.exitCode}`) : undefined,
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
