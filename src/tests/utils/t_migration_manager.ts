import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Predefined migration SQL templates for testing different scenarios
 */
export const MIGRATION_TEMPLATES = {
  // Basic ADD COLUMN operations
  addSingleColumn: {
    name: 'add_single_column',
    sql: `-- Migration: Add single column
ALTER TABLE \`User\` ADD COLUMN \`newField\` VARCHAR(255) NOT NULL;`,
  },

  addMultipleColumns: {
    name: 'add_multiple_columns',
    sql: `-- Migration: Add multiple columns
ALTER TABLE \`User\` ADD COLUMN \`firstName\` VARCHAR(100),
                     ADD COLUMN \`lastName\` VARCHAR(100);
ALTER TABLE \`Post\` ADD COLUMN \`tags\` JSON;`,
  },

  // Positioning scenarios
  addColumnFirst: {
    name: 'add_column_first',
    sql: `-- Migration: Add column that should be first
ALTER TABLE \`User\` ADD COLUMN \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY;`,
  },

  addColumnMiddle: {
    name: 'add_column_middle',
    sql: `-- Migration: Add column in middle position
ALTER TABLE \`User\` ADD COLUMN \`middleField\` VARCHAR(50);`,
  },

  addColumnLast: {
    name: 'add_column_last',
    sql: `-- Migration: Add column at the end
ALTER TABLE \`User\` ADD COLUMN \`createdAt\` DATETIME DEFAULT CURRENT_TIMESTAMP;`,
  },

  // Complex scenarios
  mixedOperations: {
    name: 'mixed_operations',
    sql: `-- Migration: Mixed operations
CREATE TABLE \`NewTable\` (
  \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  \`name\` VARCHAR(255) NOT NULL
);

ALTER TABLE \`User\` ADD COLUMN \`testField1\` VARCHAR(100);
ALTER TABLE \`User\` ADD COLUMN \`testField2\` TEXT;
ALTER TABLE \`Post\` ADD COLUMN \`testField3\` INTEGER DEFAULT 0;

DROP INDEX \`some_index\` ON \`User\`;`,
  },

  // Integration test scenario
  integration: {
    name: 'integration_test',
    sql: `-- Test migration for integration test
ALTER TABLE \`User\` ADD COLUMN \`testField1\` VARCHAR(100);
ALTER TABLE \`User\` ADD COLUMN \`testField2\` TEXT;
ALTER TABLE \`Post\` ADD COLUMN \`testField3\` INTEGER DEFAULT 0;`,
  },

  // Edge cases
  withComments: {
    name: 'with_comments',
    sql: `-- Migration with extensive comments
/* This is a block comment */
ALTER TABLE \`User\` ADD COLUMN \`commentedField\` VARCHAR(255); -- inline comment
-- Another line comment
ALTER TABLE \`Post\` ADD COLUMN \`anotherField\` INT;`,
  },

  emptyMigration: {
    name: 'empty_migration',
    sql: `-- Empty migration file
-- This migration contains no actual operations`,
  },

  invalidSql: {
    name: 'invalid_sql',
    sql: `-- Invalid SQL for error testing
ALTER TABLE NonExistentTable ADD COLUMN invalidColumn INVALID_TYPE;
INVALID SQL STATEMENT;`,
  },
} as const;

/**
 * Interface for migration configuration
 */
export interface MigrationConfig {
  name: string;
  sql: string;
  timestamp?: string;
  description?: string;
}

/**
 * Interface for migration file structure
 */
export interface MigrationFile {
  migrationDir: string;
  migrationFile: string;
  relativePath: string;
}

/**
 * Centralized migration manager for tests
 */
export class TMigrationManager {
  private readonly tempDir: string;
  private readonly migrationsBaseDir: string;
  private createdMigrations: MigrationFile[] = [];

  constructor(testName?: string) {
    const baseTempDir = tmpdir();
    const timestamp = Date.now();
    const dirName = testName
      ? `prisma-reorder-migrations-${testName}-${timestamp}`
      : `prisma-reorder-migrations-${timestamp}`;

    this.tempDir = join(baseTempDir, dirName);
    this.migrationsBaseDir = join(this.tempDir, 'prisma', 'migrations');

    if (!existsSync(this.migrationsBaseDir)) {
      mkdirSync(this.migrationsBaseDir, { recursive: true });
    }
  }

  /**
   * Create a migration from a predefined template
   */
  createMigrationFromTemplate(
    templateKey: keyof typeof MIGRATION_TEMPLATES,
    customTimestamp?: string,
  ): MigrationFile {
    const template = MIGRATION_TEMPLATES[templateKey];
    return this.createMigration({
      name: template.name,
      sql: template.sql,
      timestamp: customTimestamp,
    });
  }

  /**
   * Create a custom migration
   */
  createMigration(config: MigrationConfig): MigrationFile {
    const timestamp = config.timestamp || this.generateTimestamp();
    const migrationName = `${timestamp}_${config.name}`;
    const migrationDir = join(this.migrationsBaseDir, migrationName);
    const migrationFile = join(migrationDir, 'migration.sql');

    // Create migration directory
    if (!existsSync(migrationDir)) {
      mkdirSync(migrationDir, { recursive: true });
    }

    // Write migration SQL
    writeFileSync(migrationFile, config.sql, 'utf-8');

    const migrationFileInfo: MigrationFile = {
      migrationDir,
      migrationFile,
      relativePath: join(
        'prisma',
        'migrations',
        migrationName,
        'migration.sql',
      ),
    };

    this.createdMigrations.push(migrationFileInfo);
    return migrationFileInfo;
  }

  /**
   * Create multiple migrations in chronological order
   */
  createMigrationSequence(configs: MigrationConfig[]): MigrationFile[] {
    return configs.map((config, index) => {
      const baseTimestamp = Date.now() - (configs.length - index) * 1000;
      const timestamp =
        config.timestamp || this.timestampFromNumber(baseTimestamp);

      return this.createMigration({
        ...config,
        timestamp,
      });
    });
  }

  /**
   * Get the latest migration (most recent timestamp)
   */
  getLatestMigration(): MigrationFile | null {
    if (this.createdMigrations.length === 0) {
      return null;
    }

    // Sort by timestamp (extracted from directory name)
    const sorted = [...this.createdMigrations].sort((a, b) => {
      const timestampA = this.extractTimestamp(a.migrationDir);
      const timestampB = this.extractTimestamp(b.migrationDir);
      return timestampB.localeCompare(timestampA);
    });

    return sorted[0];
  }

  /**
   * Get all created migrations sorted by timestamp
   */
  getAllMigrations(): MigrationFile[] {
    return [...this.createdMigrations].sort((a, b) => {
      const timestampA = this.extractTimestamp(a.migrationDir);
      const timestampB = this.extractTimestamp(b.migrationDir);
      return timestampA.localeCompare(timestampB);
    });
  }

  /**
   * Get the migrations directory path
   */
  getMigrationsDir(): string {
    return this.migrationsBaseDir;
  }

  /**
   * Get the project temp directory path
   */
  getTempDir(): string {
    return this.tempDir;
  }

  /**
   * Create a complete Prisma project structure
   */
  createPrismaProject(schemaContent: string): {
    projectDir: string;
    schemaFile: string;
    migrationsDir: string;
  } {
    const projectDir = this.tempDir;
    const prismaDir = join(projectDir, 'prisma');
    const schemaFile = join(prismaDir, 'schema.prisma');

    // Ensure prisma directory exists
    if (!existsSync(prismaDir)) {
      mkdirSync(prismaDir, { recursive: true });
    }

    // Write schema file
    writeFileSync(schemaFile, schemaContent, 'utf-8');

    return {
      projectDir,
      schemaFile,
      migrationsDir: this.migrationsBaseDir,
    };
  }

  /**
   * Clean up all created files and directories
   */
  cleanup(): void {
    try {
      if (existsSync(this.tempDir)) {
        rmSync(this.tempDir, { recursive: true, force: true });
      }
      this.createdMigrations = [];
    } catch (error) {
      console.warn(`Failed to cleanup test migrations: ${error}`);
    }
  }

  /**
   * Generate a timestamp in Prisma migration format
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

  /**
   * Convert a number timestamp to Prisma format
   */
  private timestampFromNumber(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hour}${minute}${second}`;
  }

  /**
   * Extract timestamp from migration directory name
   */
  private extractTimestamp(migrationDir: string): string {
    const dirName = migrationDir.split('/').pop() || '';
    return dirName.split('_')[0] || '';
  }
}

/**
 * Helper function to create a test migration manager for Jest tests
 */
export function setupMigrationManager(testName?: string): TMigrationManager {
  return new TMigrationManager(testName);
}

/**
 * Common migration scenarios for quick test setup
 */
export const MIGRATION_SCENARIOS = {
  /**
   * Basic scenario: single ADD COLUMN operation
   */
  basicAddColumn: (manager: TMigrationManager) => {
    return manager.createMigrationFromTemplate('addSingleColumn');
  },

  /**
   * Integration scenario: multiple ADD COLUMN operations for integration tests
   */
  integrationTest: (manager: TMigrationManager) => {
    return manager.createMigrationFromTemplate('integration');
  },

  /**
   * Complex scenario: mixed operations with multiple tables
   */
  complexMigration: (manager: TMigrationManager) => {
    return manager.createMigrationFromTemplate('mixedOperations');
  },

  /**
   * Sequential migrations: create a series of migrations
   */
  sequentialMigrations: (manager: TMigrationManager) => {
    return manager.createMigrationSequence([
      { name: 'initial', sql: 'CREATE TABLE `users` (`id` INT PRIMARY KEY);' },
      {
        name: 'add_email',
        sql: 'ALTER TABLE `users` ADD COLUMN `email` VARCHAR(255);',
      },
      {
        name: 'add_name',
        sql: 'ALTER TABLE `users` ADD COLUMN `name` VARCHAR(100);',
      },
    ]);
  },
} as const;
