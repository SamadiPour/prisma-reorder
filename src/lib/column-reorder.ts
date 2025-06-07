import { SchemaReader } from './schema-reader';
import { DatabaseConnector } from './database-connector';
import {
  ColumnChange,
  ColumnMetadata,
  ReorderResult,
  SupportedProvider,
} from '../types';

/**
 * Column reorder generator for different database providers
 */
export class ColumnReorderGenerator {
  private schemaReader: SchemaReader;
  private dbConnector: DatabaseConnector | null = null;

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

    const provider = analysis.provider as SupportedProvider;

    // Get database URL from schema
    const databaseUrl = await this.schemaReader.getDatabaseUrl();

    // Initialize database connector with the extracted URL
    this.dbConnector = new DatabaseConnector(provider, databaseUrl);

    try {
      await this.dbConnector.connect();

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
        const result = await this.generateModelReorderSQL(model.name, provider);
        if (result.changes.length > 0) {
          results.push(result);
        }
      }

      return results;
    } finally {
      if (this.dbConnector) {
        await this.dbConnector.disconnect();
      }
    }
  }

  /**
   * Generate SQL for reordering columns in a specific model
   */
  private async generateModelReorderSQL(
    modelName: string,
    provider: SupportedProvider,
  ): Promise<ReorderResult> {
    if (!this.dbConnector) {
      throw new Error('Database connector not initialized');
    }

    // Get schema field order
    const schemaFieldOrder = await this.schemaReader.getModelFieldOrder(
      modelName,
    );

    // Get field to column name mapping (considering @map directives)
    const fieldColumnMapping = await this.schemaReader.getFieldColumnMapping(
      modelName,
    );

    // Get actual database table name (considering @@map)
    const tableName = await this.schemaReader.getTableName(modelName);

    // Check if table exists in database
    const tableExists = await this.dbConnector.tableExists(tableName);
    if (!tableExists) {
      throw new Error(
        `Table "${tableName}" not found in database for model "${modelName}"`,
      );
    }

    // Get actual database table metadata
    const tableMetadata = await this.dbConnector.getTableMetadata(tableName);

    // Extract current column order from database
    const currentDbOrder = tableMetadata.columns.map(
      (col: ColumnMetadata) => col.name,
    );

    // Convert schema field order to column order using mapping
    const expectedColumnOrder = schemaFieldOrder
      .map((fieldName) => fieldColumnMapping.get(fieldName) || fieldName)
      .filter((columnName) => currentDbOrder.includes(columnName)); // Only include actual DB columns

    const changes: ColumnChange[] = [];
    const sqlStatements: string[] = [];

    // Compare orders and generate changes
    for (let i = 0; i < expectedColumnOrder.length; i++) {
      const columnName = expectedColumnOrder[i];
      const currentPosition = currentDbOrder.indexOf(columnName);

      if (currentPosition !== i) {
        // Find the original field name for better reporting
        const fieldName =
          schemaFieldOrder.find(
            (field) => (fieldColumnMapping.get(field) || field) === columnName,
          ) || columnName;

        changes.push({
          column: fieldName, // Use field name for reporting
          fromPosition: currentPosition,
          toPosition: i,
          operation: 'move',
        });

        // Find the column metadata
        const columnMetadata = tableMetadata.columns.find(
          (col: ColumnMetadata) => col.name === columnName,
        );
        if (!columnMetadata) {
          throw new Error(`Column metadata not found for ${columnName}`);
        }

        // Generate SQL based on provider
        const sql = this.generateColumnReorderSQL(
          tableName,
          columnName, // Use actual column name for SQL
          columnMetadata,
          expectedColumnOrder,
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
    columnMetadata: ColumnMetadata,
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
          columnMetadata,
          fieldOrder,
          targetPosition,
        );

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
    columnMetadata: ColumnMetadata,
    fieldOrder: string[],
    targetPosition: number,
  ): string {
    const columnDefinition = columnMetadata.type;

    if (targetPosition === 0) {
      return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${columnDefinition} FIRST;`;
    } else {
      const afterColumn = fieldOrder[targetPosition - 1];
      return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${columnDefinition} AFTER \`${afterColumn}\`;`;
    }
  }
}
