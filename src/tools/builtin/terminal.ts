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

  private static activeCwd: string = process.cwd();

  async run(args: { command: string }): Promise<ToolOutput> {
    try {
      // Execute the command in the persistent working directory
      const result = await execa(args.command, {
        shell: true,
        reject: false,
        timeout: 30000,
        cwd: TerminalTool.activeCwd,
      });

      // If the command completed successfully, detect if it was a cd command to update our tracked directory
      if (result.exitCode === 0) {
        const trimmedCmd = args.command.trim();
        // Match things like: cd path, cd .. && something, cd sub; othercmd
        // To be safe and fully accurate, we query the shell for its current directory after executing the sequence
        const pwdResult = await execa(`${args.command} && pwd`, {
          shell: true,
          reject: false,
          cwd: TerminalTool.activeCwd,
        });
        if (pwdResult.exitCode === 0 && pwdResult.stdout) {
          TerminalTool.activeCwd = pwdResult.stdout.trim();
        }
      }

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
