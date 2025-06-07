import mysql from 'mysql2/promise';
import {
  SupportedProvider,
  DatabaseConfig,
  TableMetadata,
  ColumnMetadata,
} from '../types';

/**
 * Standalone database connector for fetching column metadata
 */
export class DatabaseConnector {
  private connection: mysql.Connection | null = null;
  private readonly provider: SupportedProvider;
  private config: DatabaseConfig;

  constructor(provider: SupportedProvider, databaseUrl: string) {
    this.provider = provider;
    this.config = this.parseDatabaseUrl(databaseUrl);
  }

  /**
   * Parse database URL into connection configuration
   */
  private parseDatabaseUrl(databaseUrl: string): DatabaseConfig {
    const url = new URL(databaseUrl);

    return {
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port, 10) : 3306,
      user: url.username || 'root',
      password: url.password || '',
      database: url.pathname.replace('/', '') || 'test',
    };
  }

  /**
   * Connect to the database
   */
  public async connect(): Promise<void> {
    if (this.connection) {
      return; // Already connected
    }

    this.connection = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
    });
  }

  /**
   * Disconnect from the database
   */
  public async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  /**
   * Get column metadata for a specific table
   */
  public async getTableMetadata(tableName: string): Promise<TableMetadata> {
    const columns = await this.getColumnMetadata(tableName);
    return {
      name: tableName,
      columns: columns.sort((a, b) => a.position - b.position),
    };
  }

  /**
   * Get column metadata for multiple tables
   */
  public async getTablesMetadata(
    tableNames: string[],
  ): Promise<TableMetadata[]> {
    const results: TableMetadata[] = [];

    for (const tableName of tableNames) {
      const metadata = await this.getTableMetadata(tableName);
      results.push(metadata);
    }

    return results;
  }

  /**
   * Execute raw SQL statements
   */
  public async executeRaw(sql: string): Promise<any> {
    if (!this.connection) {
      throw new Error('Database connection not established');
    }

    const [result] = await this.connection.execute(sql);
    return result;
  }

  /**
   * Get column metadata using raw SQL queries
   */
  private async getColumnMetadata(
    tableName: string,
  ): Promise<ColumnMetadata[]> {
    switch (this.provider) {
      case 'mysql':
      case 'mariadb':
        return await this.getMySQLColumnMetadata(tableName);
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  /**
   * Get MySQL/MariaDB column metadata
   */
  private async getMySQLColumnMetadata(
    tableName: string,
  ): Promise<ColumnMetadata[]> {
    if (!this.connection) {
      throw new Error('Database connection not established');
    }

    const query = `
      SELECT COLUMN_NAME      as columnName,
             DATA_TYPE        as dataType,
             COLUMN_TYPE      as columnType,
             IS_NULLABLE      as isNullable,
             COLUMN_DEFAULT   as columnDefault,
             EXTRA            as extra,
             COLUMN_KEY       as columnKey,
             ORDINAL_POSITION as ordinalPosition
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;

    const [rows] = await this.connection.execute(query, [tableName]);
    const result = rows as any[];

    return result.map((row: any, index: number) => ({
      name: row.columnName,
      type: this.buildColumnTypeDefinition(row),
      nullable: row.isNullable === 'YES',
      defaultValue: row.columnDefault,
      isAutoIncrement: row.extra.toLowerCase().includes('auto_increment'),
      isPrimaryKey: row.columnKey === 'PRI',
      isUnique: row.columnKey === 'UNI',
      extra: row.extra,
      position: Number(row.ordinalPosition) || index + 1,
    }));
  }

  /**
   * Build complete column type definition for MySQL/MariaDB
   */
  private buildColumnTypeDefinition(row: any): string {
    let definition = row.columnType;

    // Add NOT NULL constraint
    if (row.isNullable === 'NO') {
      definition += ' NOT NULL';
    }

    // Add DEFAULT value
    if (row.columnDefault !== null) {
      // Handle different default value types
      if (row.columnDefault === 'CURRENT_TIMESTAMP') {
        definition += ` DEFAULT ${row.columnDefault}`;
      } else if (
        typeof row.columnDefault === 'string' &&
        !['NULL', 'CURRENT_TIMESTAMP'].includes(row.columnDefault.toUpperCase())
      ) {
        definition += ` DEFAULT '${row.columnDefault}'`;
      } else {
        definition += ` DEFAULT ${row.columnDefault}`;
      }
    }

    // Add AUTO_INCREMENT
    if (row.extra.toLowerCase().includes('auto_increment')) {
      definition += ' AUTO_INCREMENT';
    }

    // Add other extra attributes
    const extraParts = row.extra
      .toLowerCase()
      .split(' ')
      .filter((part: string) => part && part !== 'auto_increment');

    if (extraParts.length > 0) {
      definition += ` ${extraParts.join(' ').toUpperCase()}`;
    }

    return definition;
  }

  /**
   * Test database connection
   */
  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.connection) {
        await this.connect();
      }

      // Try a simple query to verify the connection works
      await this.connection!.execute('SELECT 1 as test');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown connection error',
      };
    }
  }

  /**
   * Check if table exists in the database
   */
  public async tableExists(tableName: string): Promise<boolean> {
    try {
      if (!this.connection) {
        await this.connect();
      }

      switch (this.provider) {
        case 'mysql':
        case 'mariadb':
          const [rows] = await this.connection!.execute(
            `SELECT TABLE_NAME
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?`,
            [tableName],
          );
          return (rows as any[]).length > 0;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }
}
