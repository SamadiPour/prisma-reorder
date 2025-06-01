import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { SchemaReader } from './schema-reader';
import { type MigrationFixResult } from '../types';

/**
 * Migration fixer for analyzing and fixing column order issues in Prisma migration files
 */
export class MigrationFixer {
  private readonly migrationsDir: string;
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

      // Check if migrations directory exists
      if (!readdirSync(migrationsPath).length) {
        return null;
      }

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

      // Check if the migration file exists
      try {
        statSync(migrationFile);
        return migrationFile;
      } catch {
        return null;
      }
    } catch (error) {
      // If migrations directory doesn't exist, return null instead of throwing
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
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

    // Extract all ADD COLUMN statements
    const addColumnStatements = this.extractAddColumnInfo(sql);

    if (addColumnStatements.length === 0) {
      return null; // No ADD COLUMN statements found
    }

    // Process statements in reverse order to avoid index issues when replacing
    const sortedStatements = addColumnStatements.sort(
      (a, b) => b.startIndex - a.startIndex,
    );

    for (const statement of sortedStatements) {
      const { tableName, columnName, definition, fullMatch } = statement;

      // Validate column exists in schema and get its position
      const validation = await this.validateColumn(tableName, columnName);

      if (!validation.exists) {
        continue; // Column not found in schema, skip
      }

      const { position, afterColumn } = validation;

      // Check if this column is already at the end (last position)
      // If so, no positioning is needed unless there's already positioning
      const model = analysis.models.find(
        (m) => m.name.toLowerCase() === tableName.toLowerCase(),
      );

      if (!model) continue;

      const totalNonRelationFields = model.fields.filter(
        (field) => !field.isRelation,
      ).length;
      const isLastColumn = position === totalNonRelationFields - 1;

      // Check if the ADD COLUMN already has FIRST or AFTER clause
      const hasPositioning = /\s+(FIRST|AFTER\s+`?\w+`?)\s*$/i.test(definition);

      if (isLastColumn && !hasPositioning) {
        // Column is supposed to be at the end and has no positioning clause
        // This is fine, MySQL will add it at the end by default
        continue;
      }

      // If the column already has the correct positioning, skip it
      if (hasPositioning) {
        const expectedPosition =
          position === 0 ? 'FIRST' : `AFTER \`${afterColumn}\``;
        const currentPositionMatch = definition.match(
          /\s+(FIRST|AFTER\s+`?(\w+)`?)\s*$/i,
        );

        if (currentPositionMatch) {
          const currentPosition = currentPositionMatch[1].trim();
          const normalizedCurrent = currentPosition.toUpperCase();
          const normalizedExpected = expectedPosition.toUpperCase();

          if (normalizedCurrent === normalizedExpected) {
            continue; // Already correctly positioned
          }
        }
      }

      // Remove any existing positioning from the definition
      const cleanDefinition = definition
        .replace(/\s+(FIRST|AFTER\s+`?\w+`?)\s*$/i, '')
        .trim();

      // Generate positioned ADD COLUMN statement
      let positionedSql: string;

      if (position === 0) {
        // First column
        positionedSql = `ALTER TABLE \`${tableName}\`
          ADD COLUMN \`${columnName}\` ${cleanDefinition} FIRST`;
      } else if (afterColumn) {
        // After specific column
        positionedSql = `ALTER TABLE \`${tableName}\`
          ADD COLUMN \`${columnName}\` ${cleanDefinition} AFTER \`${afterColumn}\``;
      } else {
        // Fallback - shouldn't happen but safety check
        continue;
      }

      // Preserve the ending (semicolon or comma)
      const ending = fullMatch.match(/[,;]\s*$/)?.[0] || '';

      // Replace in the SQL
      fixedSql = fixedSql.replace(fullMatch, positionedSql + ending);

      const positionDesc =
        position === 0 ? 'FIRST' : `AFTER \`${afterColumn}\``;
      changes.push(
        `Fixed column position for ${tableName}.${columnName} (${positionDesc})`,
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

  /**
   * Extract table and column information from ADD COLUMN statements
   */
  private extractAddColumnInfo(sql: string): Array<{
    tableName: string;
    columnName: string;
    definition: string;
    fullMatch: string;
    startIndex: number;
    endIndex: number;
  }> {
    const results: Array<{
      tableName: string;
      columnName: string;
      definition: string;
      fullMatch: string;
      startIndex: number;
      endIndex: number;
    }> = [];

    // Find all complete ALTER TABLE statements (including multi-line ones)
    // Split the SQL into potential statements first
    const statements = sql.split(';').filter((s) => s.trim());

    for (const statement of statements) {
      const trimmedStatement = statement.trim();

      // Skip if this doesn't contain ALTER TABLE and ADD COLUMN
      if (!/ALTER\s+TABLE.*ADD\s+COLUMN/i.test(trimmedStatement)) {
        continue;
      }

      // Extract table name from the ALTER TABLE statement
      const tableMatch = trimmedStatement.match(
        /ALTER\s+TABLE\s+`?(\w+)`?\s+/i,
      );
      if (!tableMatch) continue;

      const tableName = tableMatch[1];

      // Find the part after "ALTER TABLE tableName "
      const afterTable = trimmedStatement.substring(tableMatch[0].length);

      // Split by commas, but be careful about commas inside quotes/parentheses
      const addColumnParts = this.smartSplitAddColumns(afterTable);

      for (const part of addColumnParts) {
        const columnMatch = part
          .trim()
          .match(/ADD\s+COLUMN\s+`?(\w+)`?\s+(.+)/i);
        if (columnMatch) {
          const [, columnName, definition] = columnMatch;

          results.push({
            tableName,
            columnName,
            definition: definition.trim(),
            fullMatch: `ALTER TABLE \`${tableName}\`
              ADD COLUMN \`${columnName}\` ${definition.trim()}`,
            startIndex: sql.indexOf(trimmedStatement),
            endIndex: sql.indexOf(trimmedStatement) + trimmedStatement.length,
          });
        }
      }
    }

    return results;
  }

  /**
   * Smart split that respects parentheses and quotes when splitting ADD COLUMN statements
   */
  private smartSplitAddColumns(text: string): string[] {
    const parts: string[] = [];
    let current = '';
    let parenDepth = 0;
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const prevChar = i > 0 ? text[i - 1] : '';

      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar && prevChar !== '\\') {
        inQuotes = false;
        quoteChar = '';
      } else if (!inQuotes && char === '(') {
        parenDepth++;
      } else if (!inQuotes && char === ')') {
        parenDepth--;
      } else if (!inQuotes && parenDepth === 0 && char === ',') {
        // This is a top-level comma, check if it's separating ADD COLUMN statements
        const remaining = text.substring(i + 1).trim();
        if (remaining.toUpperCase().startsWith('ADD COLUMN')) {
          parts.push(current.trim());
          current = '';
          continue;
        }
      }

      current += char;
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  /**
   * Validate that the column exists in the schema
   */
  private async validateColumn(
    tableName: string,
    columnName: string,
  ): Promise<{
    exists: boolean;
    position: number;
    afterColumn?: string;
  }> {
    const analysis = await this.schemaReader.getSchemaAnalysis();

    const model = analysis.models.find(
      (m) => m.name.toLowerCase() === tableName.toLowerCase(),
    );

    if (!model) {
      return { exists: false, position: -1 };
    }

    const fieldOrder = model.fields
      .filter((field) => !field.isRelation)
      .map((field) => field.name);

    const position = fieldOrder.indexOf(columnName);

    if (position === -1) {
      return { exists: false, position: -1 };
    }

    return {
      exists: true,
      position,
      afterColumn: position > 0 ? fieldOrder[position - 1] : undefined,
    };
  }
}
