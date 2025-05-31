import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { SchemaReader } from './schema-reader';
import { type MigrationFixResult } from '../types';

/**
 * Migration fixer for analyzing and fixing column order issues in Prisma migration files
 */
export class MigrationFixer {
  private migrationsDir: string;
  private schemaReader: SchemaReader;

  constructor(migrationsDir?: string, schemaPath?: string) {
    this.migrationsDir =
      migrationsDir || join(process.cwd(), 'prisma', 'migrations');
    this.schemaReader = new SchemaReader(schemaPath);
  }

  /**
   * Get the latest migration file
   */
  public getLatestMigration(): string | null {
    try {
      const migrationsPath = resolve(this.migrationsDir);
      const entries = readdirSync(migrationsPath);

      // Filter directories and sort by name (which should be timestamp-based)
      const migrationDirs = entries
        .filter((entry) => {
          const fullPath = join(migrationsPath, entry);
          return statSync(fullPath).isDirectory();
        })
        .sort()
        .reverse(); // Latest first

      if (migrationDirs.length === 0) {
        return null;
      }

      // Look for migration.sql in the latest directory
      const latestDir = migrationDirs[0];
      const migrationFile = join(migrationsPath, latestDir, 'migration.sql');

      return migrationFile;
    } catch (error) {
      throw new Error(
        `Failed to find latest migration: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Fix column order issues in the latest migration file
   */
  public async fixLatestMigration(): Promise<MigrationFixResult | null> {
    const latestMigration = this.getLatestMigration();

    if (!latestMigration) {
      return null;
    }

    try {
      const originalSql = readFileSync(latestMigration, 'utf-8');
      const fixedResult = await this.fixMigrationSql(originalSql);

      if (!fixedResult) {
        return null; // No fixes needed
      }

      return {
        migrationFile: latestMigration,
        originalSql: originalSql,
        fixedSql: fixedResult.sql,
        changes: fixedResult.changes,
      };
    } catch (error) {
      throw new Error(
        `Failed to fix migration: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Analyze and fix SQL migration content
   */
  private async fixMigrationSql(
    sql: string,
  ): Promise<{ sql: string; changes: string[] } | null> {
    const changes: string[] = [];
    let fixedSql = sql;

    // Get schema analysis to understand correct field order
    const analysis = await this.schemaReader.getSchemaAnalysis();

    if (!analysis.isSupported) {
      throw new Error(
        `Database provider "${analysis.provider}" is not supported for migration fixes`,
      );
    }

    // Look for ADD COLUMN statements
    const addColumnRegex =
      /ALTER TABLE\s+`?(\w+)`?\s+ADD COLUMN\s+`?(\w+)`?\s+([^,;]+)(?:,|\s*;|\s*$)/gi;
    let match;

    while ((match = addColumnRegex.exec(sql)) !== null) {
      const [fullMatch, tableName, columnName, columnDefinition] = match;

      // Find the corresponding model
      const model = analysis.models.find(
        (m) => m.name.toLowerCase() === tableName.toLowerCase(),
      );

      if (!model) {
        continue; // Skip if model not found in schema
      }

      // Get the correct position for this column
      const fieldOrder = model.fields
        .filter((field) => !field.isRelation)
        .map((field) => field.name);

      const columnIndex = fieldOrder.indexOf(columnName);

      if (columnIndex === -1) {
        continue; // Column not found in schema
      }

      // Generate positioned ADD COLUMN statement
      let positionedSql: string;

      if (columnIndex === 0) {
        // First column
        positionedSql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition.trim()} FIRST`;
      } else {
        // After specific column
        const afterColumn = fieldOrder[columnIndex - 1];
        positionedSql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition.trim()} AFTER \`${afterColumn}\``;
      }

      // Replace in the SQL
      fixedSql = fixedSql.replace(
        fullMatch,
        positionedSql + (fullMatch.endsWith(';') ? ';' : ''),
      );
      changes.push(
        `Fixed column position for ${tableName}.${columnName} (position ${
          columnIndex + 1
        })`,
      );
    }

    return changes.length > 0 ? { sql: fixedSql, changes } : null;
  }

  /**
   * Apply fixes to the latest migration file
   */
  public async applyFixes(): Promise<boolean> {
    const result = await this.fixLatestMigration();

    if (!result) {
      return false; // No fixes needed
    }

    try {
      writeFileSync(result.migrationFile, result.fixedSql, 'utf-8');
      return true;
    } catch (error) {
      throw new Error(
        `Failed to write fixed migration: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
