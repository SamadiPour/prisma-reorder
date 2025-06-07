import { PrismaClient } from '@prisma/client';
import { type SupportedProvider } from '../types';

/**
 * Database column metadata
 */
export interface ColumnMetadata {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isAutoIncrement: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  extra: string;
  position: number;
}

/**
 * Database table metadata
 */
export interface TableMetadata {
  name: string;
  columns: ColumnMetadata[];
}

/**
 * Database connector for fetching column metadata
 */
export class DatabaseConnector {
  private prisma: PrismaClient;
  private provider: SupportedProvider;

  constructor(provider: SupportedProvider, databaseUrl?: string) {
    this.provider = provider;

    // Create PrismaClient with custom database URL if provided
    if (databaseUrl) {
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
      });
    } else {
      this.prisma = new PrismaClient();
    }
  }

  /**
   * Connect to the database
   */
  public async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  /**
   * Disconnect from the database
   */
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
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
    return await this.prisma.$executeRawUnsafe(sql);
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

    const result = (await this.prisma.$queryRawUnsafe(
      query,
      tableName,
    )) as any[];

    return result.map((row: any, index: number) => ({
      name: row.columnName,
      type: this.buildColumnTypeDefinition(row),
      nullable: row.isNullable === 'YES',
      defaultValue: row.columnDefault,
      isAutoIncrement: row.extra.toLowerCase().includes('auto_increment'),
      isPrimaryKey: row.columnKey === 'PRI',
      isUnique: row.columnKey === 'UNI',
      extra: row.extra,
      position: row.ordinalPosition || index + 1,
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
      await this.prisma.$connect();
      // Try a simple query to verify the connection works
      await this.prisma.$queryRaw`SELECT 1`;
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
      switch (this.provider) {
        case 'mysql':
        case 'mariadb':
          const result = (await this.prisma.$queryRawUnsafe(
            `SELECT TABLE_NAME
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?`,
            tableName,
          )) as any[];
          return result.length > 0;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }
}
