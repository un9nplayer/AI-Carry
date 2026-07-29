import crypto from 'node:crypto';
import type { Config } from './schema.js';

// Decryption settings using a machine/user specific secret or a fallback key
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const DEFAULT_KEY_SALT = 'aicarry-salt-key';

function getEncryptionKey(): Buffer {
  const secret = process.env.AICARRY_ENCRYPTION_KEY || 'default-aicarry-fallback-encryption-secret-key-32bytes!';
  return crypto.scryptSync(secret, DEFAULT_KEY_SALT, 32);
}

/**
 * Encrypt a string value (like an API key)
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an encrypted string value
 */
export function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // Not encrypted, return as is (raw key)
      return encryptedText;
    }
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // If decryption fails, it might be a raw key
    return encryptedText;
  }
}

/**
 * Resolves API Keys by merging config values with process.env, decrypting them if needed.
 */
export function resolveApiKeys(config: Config): Record<string, string> {
  const keys: Record<string, string> = {};

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    keys.openai = process.env.OPENAI_API_KEY;
  } else if (config.apiKeys?.openai) {
    keys.openai = decrypt(config.apiKeys.openai);
  }

  // Anthropic / Claude
  if (process.env.ANTHROPIC_API_KEY) {
    keys.anthropic = process.env.ANTHROPIC_API_KEY;
  } else if (config.apiKeys?.anthropic) {
    keys.anthropic = decrypt(config.apiKeys.anthropic);
  }

  // Gemini
  if (process.env.GEMINI_API_KEY) {
    keys.gemini = process.env.GEMINI_API_KEY;
  } else if (config.apiKeys?.gemini) {
    keys.gemini = decrypt(config.apiKeys.gemini);
  }

  // OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    keys.openrouter = process.env.OPENROUTER_API_KEY;
  } else if (config.apiKeys?.openrouter) {
    keys.openrouter = decrypt(config.apiKeys.openrouter);
  }

  // Nvidia NIM
  if (process.env.NVIDIA_API_KEY) {
    keys.nvidia = process.env.NVIDIA_API_KEY;
  } else if (config.apiKeys?.nvidia) {
    keys.nvidia = decrypt(config.apiKeys.nvidia);
  }

  // Ollama uses host (default localhost:11434)
  if (process.env.OLLAMA_HOST) {
    keys.ollama = process.env.OLLAMA_HOST;
  } else {
    keys.ollama = 'http://127.0.0.1:11434';
  }

  return keys;
}
