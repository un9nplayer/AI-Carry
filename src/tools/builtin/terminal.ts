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
      const trimmedCmd = args.command.trim();

      // Execute command in persistent active directory
      const result = await execa(trimmedCmd, {
        shell: true,
        reject: false,
        timeout: 120000, // 2 min timeout for recon tools
        cwd: TerminalTool.activeCwd,
      });

      // Update tracked directory if pwd changed
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
      const stdout = (result.stdout || '').trim();
      const stderr = (result.stderr || '').trim();

      if (hasError) {
        const errText = stderr || stdout || `Process exited with code ${exitCode}`;
        return {
          success: false,
          output: errText,
          error: errText,
        };
      }

      // Success case
      const outputText = stdout || stderr || `Done (${trimmedCmd})`;
      return {
        success: true,
        output: outputText,
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.message || String(error),
        error: error.message || String(error),
      };
    }
  }
}
