import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Result of creating a migration
 */
export interface MigrationCreationResult {
  migrationDir: string;
  migrationFile: string;
  migrationName: string;
  success: boolean;
  error?: string;
}

/**
 * Migration creator for generating new Prisma migration files
 */
export class MigrationCreator {
  private readonly migrationsDir: string;

  constructor(migrationsDir?: string) {
    this.migrationsDir =
      migrationsDir || join(process.cwd(), 'prisma', 'migrations');
  }

  /**
   * Create a new migration file with the provided SQL content
   */
  public createMigration(
    sql: string,
    migrationName?: string,
  ): MigrationCreationResult {
    try {
      // Generate migration name with timestamp
      const timestamp = this.generateTimestamp();
      const name = migrationName || 'sync_column_order';
      const fullMigrationName = `${timestamp}_${name}`;

      // Create migration directory
      const migrationDir = join(this.migrationsDir, fullMigrationName);
      const migrationFile = join(migrationDir, 'migration.sql');

      // Ensure migrations directory exists
      const migrationsPath = resolve(this.migrationsDir);
      if (!existsSync(migrationsPath)) {
        mkdirSync(migrationsPath, { recursive: true });
      }

      // Create specific migration directory
      if (!existsSync(migrationDir)) {
        mkdirSync(migrationDir, { recursive: true });
      }

      // Write migration SQL file
      writeFileSync(migrationFile, sql, 'utf-8');

      return {
        migrationDir,
        migrationFile,
        migrationName: fullMigrationName,
        success: true,
      };
    } catch (error) {
      return {
        migrationDir: '',
        migrationFile: '',
        migrationName: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate a timestamp in Prisma migration format (YYYYMMDDHHMMSS)
   */
  private generateTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hour}${minute}${second}`;
  }
}
