import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { ConfigReaderOptions } from '../types';

export class ConfigReader {
  private readonly env: Record<string, string | undefined> = {};

  constructor(options: ConfigReaderOptions = {}) {
    const { envPath = '.env', verbose = false } = options;
    const resolvedPath = resolve(envPath);

    if (verbose) {
      console.log(`🔍 Looking for environment file at: ${resolvedPath}`);
    }

    // Only try to load .env file if it exists
    if (existsSync(resolvedPath)) {
      // Load environment variables from the specified file
      const result = config({ path: resolvedPath });

      if (result.error) {
        throw new Error(
          `Error loading environment file: ${result.error.message}`,
        );
      }

      // Expand environment variables (support for ${VAR} interpolation)
      const expandedResult = expand(result);

      if (expandedResult.error) {
        throw new Error(
          `Error expanding environment variables: ${expandedResult.error.message}`,
        );
      }

      if (verbose) {
        console.log(`✅ Successfully loaded environment from: ${resolvedPath}`);
      }

      this.env = expandedResult.parsed || {};
    } else {
      if (verbose) {
        console.log(
          `📝 No .env file found at: ${resolvedPath}, using system environment variables only`,
        );
      }

      this.env = {};
    }
  }

  get(key: string): string | undefined {
    return this.env[key] ?? process.env[key];
  }

  getAll(): Record<string, string | undefined> {
    return { ...process.env, ...this.env };
  }
}
