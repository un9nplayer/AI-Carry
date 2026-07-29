import { getConfig } from '../config/index.js';
import type { ToolPermission } from '../config/schema.js';

const DANGEROUS_COMMANDS = [
  'rm',
  'mv',
  'chmod',
  'iptables',
  'shutdown',
  'mkfs',
  'dd',
  'systemctl',
  'sudo',
];

export function validatePermission(toolName: string, toolPerm: ToolPermission, args: Record<string, any>): {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
} {
  const config = getConfig();
  const currentLevel = config.toolPermissions; // safe | readonly | interactive | dangerous

  // Level hierarchy mapper: safe (0) < readonly (1) < interactive (2) < dangerous (3)
  const levels = {
    safe: 0,
    readonly: 1,
    interactive: 2,
    dangerous: 3,
  };

  const currentVal = levels[currentLevel];
  const requiredVal = levels[toolPerm];

  if (currentVal < requiredVal) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `Tool '${toolName}' requires '${toolPerm}' mode, but current setting is '${currentLevel}'.`,
    };
  }

  // Check dangerous content in terminal tool commands
  if (toolName === 'terminal' && args.command) {
    const cmdStr = String(args.command).trim().toLowerCase();
    const commandName = cmdStr.split(/\s+/)[0];

    // If command matches any dangerous command keywords
    const isDangerous = DANGEROUS_COMMANDS.some((badCmd) =>
      cmdStr.startsWith(badCmd) || cmdStr.includes(` ${badCmd} `) || cmdStr.includes(`;${badCmd}`) || cmdStr.includes(`&&${badCmd}`)
    );

    if (isDangerous) {
      if (currentLevel === 'dangerous') {
        // Even in dangerous, prompt for confirmation for safety
        return { allowed: true, requiresConfirmation: true };
      }
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Command execution contains dangerous operations blocked in '${currentLevel}' mode.`,
      };
    }
  }

  if (toolPerm === 'dangerous') {
    return { allowed: true, requiresConfirmation: true };
  }

  return { allowed: true, requiresConfirmation: false };
}
