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

    // Group statements by ALTER TABLE (same fullMatch)
    const alterTableGroups = new Map<string, typeof addColumnStatements>();
    for (const statement of addColumnStatements) {
      const key = statement.fullMatch;
      if (!alterTableGroups.has(key)) {
        alterTableGroups.set(key, []);
      }
      alterTableGroups.get(key)!.push(statement);
    }

    // Process each ALTER TABLE statement
    for (const [originalAlterTable, statements] of alterTableGroups) {
      let modifiedAlterTable = originalAlterTable;
      const alterTableChanges: string[] = [];

      for (const statement of statements) {
        const { tableName, columnName, definition } = statement;

        // Validate column exists in schema and get its position
        const validation = await this.validateColumn(tableName, columnName);

        if (!validation.exists) {
          continue; // Column not found in schema, skip
        }

        const { position, afterColumn } = validation;

        // Check if this column is already at the end (last position)
        const model = analysis.models.find(
          (m) => m.name.toLowerCase() === tableName.toLowerCase(),
        );

        if (!model) continue;

        const totalNonRelationFields = model.fields.filter(
          (field) => !field.isRelation,
        ).length;
        const isLastColumn = position === totalNonRelationFields - 1;

        // Check if the ADD COLUMN already has FIRST or AFTER clause
        const hasPositioning = /\s+(FIRST|AFTER\s+`?\w+`?)\s*$/i.test(
          definition,
        );

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

        // Generate the positioning clause
        let positioningClause = '';
        if (position === 0) {
          positioningClause = ' FIRST';
        } else if (afterColumn) {
          positioningClause = ` AFTER \`${afterColumn}\``;
        }

        // Create the search pattern for the original ADD COLUMN clause
        const originalAddColumn = `ADD COLUMN \`${columnName}\` ${definition}`;
        const newAddColumn = `ADD COLUMN \`${columnName}\` ${cleanDefinition}${positioningClause}`;

        // Replace the specific ADD COLUMN clause in the ALTER TABLE statement
        modifiedAlterTable = modifiedAlterTable.replace(
          originalAddColumn,
          newAddColumn,
        );

        const positionDesc =
          position === 0 ? 'FIRST' : `AFTER \`${afterColumn}\``;
        alterTableChanges.push(
          `Fixed column position for ${tableName}.${columnName} (${positionDesc})`,
        );
      }

      // Replace the original ALTER TABLE statement with the modified one
      if (alterTableChanges.length > 0) {
        fixedSql = fixedSql.replace(originalAlterTable, modifiedAlterTable);
        changes.push(...alterTableChanges);
      }
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

    // Find ALTER TABLE statements (including multi-line ones)
    const alterTableRegex = /ALTER\s+TABLE\s+`?(\w+)`?\s+(.*?);/gis;
    let match;

    while ((match = alterTableRegex.exec(sql)) !== null) {
      const [fullMatch, tableName, alterContent] = match;
      const startIndex = match.index;
      const endIndex = match.index + fullMatch.length;

      // Check if this ALTER TABLE contains ADD COLUMN statements
      if (!/ADD\s+COLUMN/i.test(alterContent)) {
        continue;
      }

      // Parse individual ADD COLUMN statements within this ALTER TABLE
      const addColumnMatches = this.parseAddColumns(alterContent);

      for (const addColumn of addColumnMatches) {
        results.push({
          tableName,
          columnName: addColumn.columnName,
          definition: addColumn.definition,
          fullMatch: fullMatch,
          startIndex: startIndex,
          endIndex: endIndex,
        });
      }
    }

    return results;
  }

  /**
   * Parse ADD COLUMN statements from ALTER TABLE content
   */
  private parseAddColumns(alterContent: string): Array<{
    columnName: string;
    definition: string;
  }> {
    const results: Array<{ columnName: string; definition: string }> = [];

    // Split by ADD COLUMN but be careful about commas and positioning clauses
    const parts = alterContent.split(/,\s*(?=ADD\s+COLUMN)/i);

    for (const part of parts) {
      const trimmedPart = part.trim();
      const addColumnMatch = trimmedPart.match(
        /ADD\s+COLUMN\s+`?(\w+)`?\s+(.+?)(?=\s*(?:,\s*ADD\s+COLUMN|$))/is,
      );

      if (addColumnMatch) {
        const [, columnName, definition] = addColumnMatch;
        results.push({
          columnName,
          definition: definition.trim(),
        });
      }
    }

    return results;
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
