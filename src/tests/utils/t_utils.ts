import { MigrationFixer } from '../../lib/migration-fixer';
import { setupSchemaManager, TEST_SCHEMAS } from './t_schema_manager';
import {
  MIGRATION_SCENARIOS,
  setupMigrationManager,
} from './t_migration_manager';

/**
 * Test utilities for common migration testing scenarios
 */
export class MigrationTestUtils {
  /**
   * Create a complete test environment with schema and migration
   */
  static async setupIntegrationTest() {
    const schemaManager = setupSchemaManager('integration-util');
    const migrationManager = setupMigrationManager('integration-util');

    // Create Prisma project with integration schema
    const { projectDir, schemaFile, migrationsDir } =
      migrationManager.createPrismaProject(TEST_SCHEMAS.integration);

    // Create test migration
    const migration =
      migrationManager.createMigrationFromTemplate('integration');

    // Create migration fixer
    const fixer = new MigrationFixer(migrationsDir, schemaFile);

    return {
      schemaManager,
      migrationManager,
      projectDir,
      schemaFile,
      migrationsDir,
      migration,
      fixer,
      cleanup: () => {
        schemaManager.cleanup();
        migrationManager.cleanup();
      },
    };
  }

  /**
   * Create a test environment for testing specific migration templates
   */
  static async setupMigrationTest(
    templateKey: keyof typeof import('./t_migration_manager').MIGRATION_TEMPLATES,
    schemaKey: keyof typeof TEST_SCHEMAS = 'mysql',
  ) {
    const schemaManager = setupSchemaManager(`template-${templateKey}`);
    const migrationManager = setupMigrationManager(`template-${templateKey}`);

    const { projectDir, schemaFile, migrationsDir } =
      migrationManager.createPrismaProject(TEST_SCHEMAS[schemaKey]);

    const migration = migrationManager.createMigrationFromTemplate(templateKey);
    const fixer = new MigrationFixer(migrationsDir, schemaFile);

    return {
      schemaManager,
      migrationManager,
      projectDir,
      schemaFile,
      migrationsDir,
      migration,
      fixer,
      cleanup: () => {
        schemaManager.cleanup();
        migrationManager.cleanup();
      },
    };
  }

  /**
   * Create a test environment with sequential migrations
   */
  static async setupSequentialMigrationTest() {
    const schemaManager = setupSchemaManager('sequential');
    const migrationManager = setupMigrationManager('sequential');

    const { projectDir, schemaFile, migrationsDir } =
      migrationManager.createPrismaProject(TEST_SCHEMAS.mysql);

    const migrations =
      MIGRATION_SCENARIOS.sequentialMigrations(migrationManager);
    const fixer = new MigrationFixer(migrationsDir, schemaFile);

    return {
      schemaManager,
      migrationManager,
      projectDir,
      schemaFile,
      migrationsDir,
      migrations,
      fixer,
      cleanup: () => {
        schemaManager.cleanup();
        migrationManager.cleanup();
      },
    };
  }

  /**
   * Create a simple test environment with custom SQL
   */
  static async setupCustomMigrationTest(
    customSql: string,
    migrationName = 'custom',
  ) {
    const schemaManager = setupSchemaManager(`custom-${migrationName}`);
    const migrationManager = setupMigrationManager(`custom-${migrationName}`);

    const { projectDir, schemaFile, migrationsDir } =
      migrationManager.createPrismaProject(TEST_SCHEMAS.mysql);

    const migration = migrationManager.createMigration({
      name: migrationName,
      sql: customSql,
    });

    const fixer = new MigrationFixer(migrationsDir, schemaFile);

    return {
      schemaManager,
      migrationManager,
      projectDir,
      schemaFile,
      migrationsDir,
      migration,
      fixer,
      cleanup: () => {
        schemaManager.cleanup();
        migrationManager.cleanup();
      },
    };
  }
}

/**
 * Jest helper for creating test environments with automatic cleanup
 */
export function withMigrationTest<T>(
  setupFn: () => Promise<T & { cleanup: () => void }>,
  testFn: (env: T) => Promise<void> | void,
) {
  return async () => {
    const env = await setupFn();
    try {
      await testFn(env);
    } finally {
      env.cleanup();
    }
  };
}

/**
 * Common assertions for migration testing
 */
export class MigrationAssertions {
  /**
   * Assert that SQL contains proper column positioning
   */
  static assertColumnPositioning(sql: string, expectedPositions: string[]) {
    for (const position of expectedPositions) {
      expect(sql).toContain(position);
    }
  }

  /**
   * Assert that a migration was properly fixed
   */
  static assertMigrationFixed(originalSql: string, fixedSql: string) {
    expect(fixedSql).not.toBe(originalSql);
    expect(fixedSql).toMatch(/AFTER `\w+`|FIRST/);
  }

  /**
   * Assert that no migration fix was needed
   */
  static assertNoFixNeeded(fixResult: any) {
    expect(fixResult).toBeNull();
  }

  /**
   * Assert migration file structure
   */
  static assertMigrationStructure(migration: any) {
    expect(migration.migrationDir).toBeTruthy();
    expect(migration.migrationFile).toMatch(/migration\.sql$/);
    expect(migration.relativePath).toContain('prisma/migrations');
  }
}

/**
 * Quick setup functions for common scenarios
 */
export const quickSetup = {
  /**
   * Basic integration test setup
   */
  integration: () => MigrationTestUtils.setupIntegrationTest(),

  /**
   * Single column addition test
   */
  singleColumn: () => MigrationTestUtils.setupMigrationTest('addSingleColumn'),

  /**
   * Multiple columns addition test
   */
  multipleColumns: () =>
    MigrationTestUtils.setupMigrationTest('addMultipleColumns'),

  /**
   * Mixed operations test
   */
  mixedOperations: () =>
    MigrationTestUtils.setupMigrationTest('mixedOperations'),

  /**
   * Sequential migrations test
   */
  sequential: () => MigrationTestUtils.setupSequentialMigrationTest(),

  /**
   * Custom SQL test
   */
  custom: (sql: string, name?: string) =>
    MigrationTestUtils.setupCustomMigrationTest(sql, name),
};
