import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * Utility functions for file operations
 */
export class FileUtils {
  /**
   * Check if a file exists
   */
  static exists(filePath: string): boolean {
    try {
      return existsSync(resolve(filePath));
    } catch {
      return false;
    }
  }

  /**
   * Resolve file path and validate existence
   */
  static validatePath(filePath: string, description: string): string {
    const absolutePath = resolve(filePath);

    if (!this.exists(absolutePath)) {
      throw new Error(`${description} not found: ${absolutePath}`);
    }

    return absolutePath;
  }
}
