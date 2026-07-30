import type { Tool } from './types.js';
import { TerminalTool } from './builtin/terminal.js';
import { CatTool } from './builtin/cat.js';
import { GrepTool } from './builtin/grep.js';
import { WriteTool } from './builtin/write.js';
import { EditTool } from './builtin/edit.js';
import { WebFetchTool } from './builtin/webfetch.js';
import { WebSearchTool } from './builtin/websearch.js';

export class ToolRegistry {
  private static instance: ToolRegistry | null = null;
  private tools: Map<string, Tool> = new Map();

  private constructor() {
    // Register built-in tools
    this.register(new TerminalTool());
    this.register(new CatTool());
    this.register(new GrepTool());
    this.register(new WriteTool());
    this.register(new EditTool());
    this.register(new WebFetchTool());
    this.register(new WebSearchTool());
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  public register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  public listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  public clear(): void {
    this.tools.clear();
  }
}
