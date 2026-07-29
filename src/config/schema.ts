import { z } from 'zod';

export const ToolPermissionSchema = z.enum(['safe', 'readonly', 'interactive', 'dangerous']);
export type ToolPermission = z.infer<typeof ToolPermissionSchema>;

export const ThemeSchema = z.enum(['dark', 'light', 'minimal', 'cyberpunk', 'monochrome']);
export type Theme = z.infer<typeof ThemeSchema>;

export const ApiKeysSchema = z.object({
  openai: z.string().optional(),
  anthropic: z.string().optional(),
  gemini: z.string().optional(),
  openrouter: z.string().optional(),
  nvidia: z.string().optional(),
}).default({});

export const ConfigSchema = z.object({
  defaultModel: z.string().default('gemini-2.5-pro'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().default(4096),
  streaming: z.boolean().default(true),
  toolPermissions: ToolPermissionSchema.default('interactive'),
  theme: ThemeSchema.default('dark'),
  autosave: z.boolean().default(true),
  contextThreshold: z.number().min(0.1).max(1.0).default(0.85),
  retryCount: z.number().int().nonnegative().default(3),
  apiKeys: ApiKeysSchema,
}).default({});

export type Config = z.infer<typeof ConfigSchema>;
