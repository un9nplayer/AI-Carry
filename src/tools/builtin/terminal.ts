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

  public static activeCwd: string = process.cwd();

  async run(args: { command: string }): Promise<ToolOutput> {
    try {
      // Execute the command ONCE in the persistent working directory
      const result = await execa(args.command, {
        shell: true,
        reject: false,
        timeout: 60000,
        cwd: TerminalTool.activeCwd,
      });

      // Separately query pwd to track any directory changes
      const pwdResult = await execa('pwd', {
        shell: true,
        reject: false,
        cwd: TerminalTool.activeCwd,
      });
      if (pwdResult.exitCode === 0 && pwdResult.stdout.trim()) {
        TerminalTool.activeCwd = pwdResult.stdout.trim();
      }

      const exitCode = result.exitCode ?? 0;
      const hasError = exitCode !== 0;
      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      const combinedOutput = [stdout, stderr].filter(Boolean).join('\n');

      return {
        success: !hasError,
        output: combinedOutput || `Command exited with code ${exitCode}`,
        error: hasError ? (combinedOutput || `Command failed with exit code ${exitCode}`) : undefined,
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
