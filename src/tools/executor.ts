import { ToolRegistry } from './registry.js';
import { validatePermission } from './permissions.js';
import type { ToolCall, ToolOutput } from './types.js';

/**
 * Extracts XML-like tags from content text.
 * Matches: <toolname>arguments</toolname>
 */
export function parseToolCalls(content: string): ToolCall[] {
  const registry = ToolRegistry.getInstance();
  const toolsList = registry.listTools();
  const toolCalls: ToolCall[] = [];

  for (const tool of toolsList) {
    // Regex matching <toolName>...</toolName>
    const regex = new RegExp(`<${tool.name}>([\\s\\S]*?)<\\/${tool.name}>`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const rawText = match[1].trim();
      let args: Record<string, any> = {};

      // Heuristic: If it looks like JSON, try parsing it, otherwise map to first argument
      if (rawText.startsWith('{') && rawText.endsWith('}')) {
        try {
          args = JSON.parse(rawText);
        } catch {
          // Fallback to plain string mapping
          const firstArg = Object.keys(tool.arguments)[0];
          args[firstArg] = rawText;
        }
      } else {
        const firstArg = Object.keys(tool.arguments)[0];
        args[firstArg] = rawText;
      }

      toolCalls.push({
        tool: tool.name,
        args,
        rawXml: match[0],
      });
    }
  }

  return toolCalls;
}

/**
 * Executes parsed tool calls, confirming dangerous actions if required.
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  confirmCallback?: (tool: string, args: Record<string, any>) => Promise<boolean>
): Promise<string> {
  const registry = ToolRegistry.getInstance();
  let resultBlock = '';

  for (const call of toolCalls) {
    const tool = registry.getTool(call.tool);
    if (!tool) {
      resultBlock += `<output tool="${call.tool}">Error: Tool not found in registry</output>\n`;
      continue;
    }

    // Validate permission
    const check = validatePermission(tool.name, tool.permissions, call.args);
    if (!check.allowed) {
      resultBlock += `<output tool="${tool.name}">Error: Permission Denied. ${check.reason || ''}</output>\n`;
      continue;
    }

    // Request interactive confirmation if needed
    if (check.requiresConfirmation && confirmCallback) {
      const approved = await confirmCallback(tool.name, call.args);
      if (!approved) {
        resultBlock += `<output tool="${tool.name}">Error: Execution cancelled by user.</output>\n`;
        continue;
      }
    }

    // Run tool
    const output: ToolOutput = await tool.run(call.args);
    if (output.success) {
      resultBlock += `<output tool="${tool.name}">\n${output.output}\n</output>\n`;
    } else {
      resultBlock += `<output tool="${tool.name}">\nError: ${output.error || 'Execution failed.'}\n</output>\n`;
    }
  }

  return resultBlock;
}
