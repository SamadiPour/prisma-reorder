import { SchemaReader } from './schema-reader';
import {
  type ReorderResult,
  type ColumnChange,
  type SupportedProvider,
} from '../types';

/**
 * Column reorder generator for different database providers
 */
export class ColumnReorderGenerator {
  private schemaReader: SchemaReader;

  constructor(schemaPath?: string) {
    this.schemaReader = new SchemaReader(schemaPath);
  }

  /**
   * Generate SQL statements to reorder columns for all or specific models
   */
  public async generateReorderSQL(
    modelNames?: string[],
  ): Promise<ReorderResult[]> {
    const analysis = await this.schemaReader.getSchemaAnalysis();

    if (!analysis.isSupported) {
      throw new Error(
        `Database provider "${analysis.provider}" is not supported for column reordering`,
      );
    }

    const targetModels = modelNames
      ? analysis.models.filter((model) => modelNames.includes(model.name))
      : analysis.models;

    if (modelNames) {
      const missingModels = modelNames.filter(
        (name) => !analysis.models.some((model) => model.name === name),
      );
      if (missingModels.length > 0) {
        throw new Error(
          `Models not found in schema: ${missingModels.join(', ')}`,
        );
      }
    }

    const results: ReorderResult[] = [];

    for (const model of targetModels) {
      const result = await this.generateModelReorderSQL(
        model.name,
        analysis.provider as SupportedProvider,
      );
      if (result.changes.length > 0) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Generate SQL for reordering columns in a specific model
   */
  private async generateModelReorderSQL(
    modelName: string,
    provider: SupportedProvider,
  ): Promise<ReorderResult> {
    const schemaFieldOrder = await this.schemaReader.getModelFieldOrder(
      modelName,
    );

    // TODO: Get actual database column order by connecting to the database
    // For now, we'll simulate a different order for demonstration
    const currentDbOrder = [...schemaFieldOrder].reverse(); // Simulate reversed order

    const changes: ColumnChange[] = [];
    const sqlStatements: string[] = [];

    // Compare orders and generate changes
    for (let i = 0; i < schemaFieldOrder.length; i++) {
      const fieldName = schemaFieldOrder[i];
      const currentPosition = currentDbOrder.indexOf(fieldName);

      if (currentPosition !== i) {
        changes.push({
          column: fieldName,
          fromPosition: currentPosition,
          toPosition: i,
          operation: 'move',
        });

        // Generate SQL based on provider
        const sql = this.generateColumnReorderSQL(
          modelName,
          fieldName,
          schemaFieldOrder,
          i,
          provider,
        );
        if (sql) {
          sqlStatements.push(sql);
        }
      }
    }

    return {
      model: modelName,
      changes,
      sql: sqlStatements,
    };
  }

  /**
   * Generate provider-specific SQL for column reordering
   */
  private generateColumnReorderSQL(
    tableName: string,
    columnName: string,
    fieldOrder: string[],
    targetPosition: number,
    provider: SupportedProvider,
  ): string | null {
    switch (provider) {
      case 'mysql':
      case 'mariadb':
        return this.generateMySQLReorderSQL(
          tableName,
          columnName,
          fieldOrder,
          targetPosition,
        );

      case 'sqlite':
        // SQLite requires table recreation for column reordering
        return this.generateSQLiteReorderSQL(tableName, fieldOrder);

      default:
        return null;
    }
  }

  /**
   * Generate MySQL/MariaDB specific column reorder SQL
   */
  private generateMySQLReorderSQL(
    tableName: string,
    columnName: string,
    fieldOrder: string[],
    targetPosition: number,
  ): string {
    if (targetPosition === 0) {
      return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` /* TYPE */ FIRST;`;
    } else {
      const afterColumn = fieldOrder[targetPosition - 1];
      return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` /* TYPE */ AFTER \`${afterColumn}\`;`;
    }
  }

  /**
   * Generate SQLite specific column reorder SQL (table recreation)
   */
  private generateSQLiteReorderSQL(
    tableName: string,
    fieldOrder: string[],
  ): string {
    const orderedColumns = fieldOrder.map((field) => `\`${field}\``).join(', ');

    return `-- SQLite column reordering requires table recreation
-- TODO: Generate complete table recreation script
-- 1. CREATE TABLE ${tableName}_new WITH correct column order
-- 2. INSERT INTO ${tableName}_new (${orderedColumns}) SELECT ${orderedColumns} FROM ${tableName}
-- 3. DROP TABLE ${tableName}
-- 4. ALTER TABLE ${tableName}_new RENAME TO ${tableName}`;
  }
}
