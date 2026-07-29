import type { ToolPermission } from '../config/schema.js';

export interface ToolArgument {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  default?: any;
}

export interface ToolOutput {
  success: boolean;
  output: string;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  permissions: ToolPermission;
  arguments: Record<string, ToolArgument>;
  run(args: Record<string, any>): Promise<ToolOutput>;
  enabled: boolean;
}

export interface ToolCall {
  tool: string;
  args: Record<string, any>;
  rawXml: string;
}
