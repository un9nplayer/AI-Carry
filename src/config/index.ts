import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConfigSchema, type Config } from './schema.js';
import { resolveApiKeys } from './keys.js';
import dotenv from 'dotenv';

// Load environmental variables from .env if present
dotenv.config();

const isTest = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test') || arg.includes('tsx'));
const CONFIG_DIR = isTest 
  ? path.join(process.cwd(), '.aicarry-test-temp') 
  : path.join(os.homedir(), '.aicarry');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

let currentConfig: Config = ConfigSchema.parse({});
let resolvedKeys: Record<string, string> = {};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Initializes configuration: ensures config dir & default file exist, parses them.
 */
export function initConfig(): Config {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    if (!fs.existsSync(CONFIG_FILE)) {
      const defaultConfig = ConfigSchema.parse({});
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
      currentConfig = defaultConfig;
    } else {
      const rawContent = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsedJSON = JSON.parse(rawContent);
      currentConfig = ConfigSchema.parse(parsedJSON);
    }
  } catch (error) {
    console.error(`Failed to load config from ${CONFIG_FILE}. Using defaults.`, error);
    currentConfig = ConfigSchema.parse({});
  }

  resolvedKeys = resolveApiKeys(currentConfig);
  return currentConfig;
}

/**
 * Gets the current active config schema object.
 */
export function getConfig(): Config {
  return currentConfig;
}

/**
 * Gets the resolved keys map.
 */
export function getApiKeys(): Record<string, string> {
  return resolvedKeys;
}

/**
 * Updates a configuration key and saves it back to the configuration file.
 */
export function updateConfig(newConfig: Partial<Config>): void {
  try {
    const updated = ConfigSchema.parse({
      ...currentConfig,
      ...newConfig,
    });
    currentConfig = updated;
    resolvedKeys = resolveApiKeys(currentConfig);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
  } catch (error) {
    console.error(`Failed to update config at ${CONFIG_FILE}`, error);
    throw error;
  }
}
