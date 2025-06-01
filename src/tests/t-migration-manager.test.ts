import { readFileSync } from 'fs';
import {
  MIGRATION_SCENARIOS,
  setupMigrationManager,
} from './utils/t_migration_manager';
import { TEST_SCHEMAS } from './utils/t_schema_manager';

describe('TestMigrationManager', () => {
  let migrationManager: ReturnType<typeof setupMigrationManager>;

  beforeEach(() => {
    migrationManager = setupMigrationManager('migration-manager');
  });

  afterEach(() => {
    migrationManager.cleanup();
  });

  describe('Template-based migration creation', () => {
    it('should create migration from template', () => {
      const migration =
        migrationManager.createMigrationFromTemplate('addSingleColumn');

      expect(migration.migrationFile).toContain('migration.sql');
      expect(migration.migrationDir).toContain('add_single_column');

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toContain('ALTER TABLE `User` ADD COLUMN `newField`');
    });

    it('should create multiple migrations with different templates', () => {
      const migration1 =
        migrationManager.createMigrationFromTemplate('addSingleColumn');
      const migration2 =
        migrationManager.createMigrationFromTemplate('mixedOperations');

      expect(migration1.migrationDir).not.toBe(migration2.migrationDir);

      const content1 = readFileSync(migration1.migrationFile, 'utf-8');
      const content2 = readFileSync(migration2.migrationFile, 'utf-8');

      expect(content1).toContain('ADD COLUMN `newField`');
      expect(content2).toContain('CREATE TABLE `NewTable`');
    });
  });

  describe('Custom migration creation', () => {
    it('should create custom migration', () => {
      const customSql = 'ALTER TABLE `User` ADD COLUMN `customField` TEXT;';
      const migration = migrationManager.createMigration({
        name: 'custom_test',
        sql: customSql,
      });

      expect(migration.migrationDir).toContain('custom_test');

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toBe(customSql);
    });

    it('should create migration with custom timestamp', () => {
      const customTimestamp = '20231201120000';
      const migration = migrationManager.createMigration({
        name: 'timestamped_test',
        sql: 'SELECT 1;',
        timestamp: customTimestamp,
      });

      expect(migration.migrationDir).toContain(customTimestamp);
    });
  });

  describe('Migration sequence creation', () => {
    it('should create sequential migrations in chronological order', () => {
      const migrations = migrationManager.createMigrationSequence([
        { name: 'first', sql: 'CREATE TABLE test1 (id INT);' },
        { name: 'second', sql: 'CREATE TABLE test2 (id INT);' },
        { name: 'third', sql: 'CREATE TABLE test3 (id INT);' },
      ]);

      expect(migrations).toHaveLength(3);

      // Verify chronological order
      const allMigrations = migrationManager.getAllMigrations();
      expect(allMigrations[0].migrationDir).toContain('first');
      expect(allMigrations[1].migrationDir).toContain('second');
      expect(allMigrations[2].migrationDir).toContain('third');
    });
  });

  describe('Latest migration tracking', () => {
    it('should return null when no migrations exist', () => {
      const latest = migrationManager.getLatestMigration();
      expect(latest).toBeNull();
    });

    it('should return latest migration correctly', () => {
      // Create migrations with specific timestamps
      const migration1 = migrationManager.createMigration({
        name: 'old',
        sql: 'SELECT 1;',
        timestamp: '20231201120000',
      });

      const migration2 = migrationManager.createMigration({
        name: 'new',
        sql: 'SELECT 2;',
        timestamp: '20231201130000',
      });

      const latest = migrationManager.getLatestMigration();
      expect(latest?.migrationFile).toBe(migration2.migrationFile);
    });
  });

  describe('Prisma project creation', () => {
    it('should create complete Prisma project structure', () => {
      const schemaContent = TEST_SCHEMAS.mysql;
      const project = migrationManager.createPrismaProject(schemaContent);

      expect(project.projectDir).toBeTruthy();
      expect(project.schemaFile).toContain('schema.prisma');
      expect(project.migrationsDir).toContain('migrations');

      const content = readFileSync(project.schemaFile, 'utf-8');
      expect(content).toContain('provider = "mysql"');
    });
  });

  describe('Migration scenarios', () => {
    it('should execute basic add column scenario', () => {
      const migration = MIGRATION_SCENARIOS.basicAddColumn(migrationManager);

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toContain('ADD COLUMN `newField`');
    });

    it('should execute integration test scenario', () => {
      const migration = MIGRATION_SCENARIOS.integrationTest(migrationManager);

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toContain('testField1');
      expect(content).toContain('testField2');
      expect(content).toContain('testField3');
    });

    it('should execute complex migration scenario', () => {
      const migration = MIGRATION_SCENARIOS.complexMigration(migrationManager);

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toContain('CREATE TABLE');
      expect(content).toContain('ADD COLUMN');
      expect(content).toContain('DROP INDEX');
    });

    it('should execute sequential migrations scenario', () => {
      const migrations =
        MIGRATION_SCENARIOS.sequentialMigrations(migrationManager);

      expect(migrations).toHaveLength(3);

      const contents = migrations.map((m) =>
        readFileSync(m.migrationFile, 'utf-8'),
      );
      expect(contents[0]).toContain('CREATE TABLE `users`');
      expect(contents[1]).toContain('ADD COLUMN `email`');
      expect(contents[2]).toContain('ADD COLUMN `name`');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty migration template', () => {
      const migration =
        migrationManager.createMigrationFromTemplate('emptyMigration');

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toContain('Empty migration file');
      expect(content).toContain('no actual operations');
    });

    it('should handle migration with comments', () => {
      const migration =
        migrationManager.createMigrationFromTemplate('withComments');

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toContain('/* This is a block comment */');
      expect(content).toContain('-- inline comment');
    });

    it('should handle invalid SQL template', () => {
      const migration =
        migrationManager.createMigrationFromTemplate('invalidSql');

      const content = readFileSync(migration.migrationFile, 'utf-8');
      expect(content).toContain('INVALID SQL STATEMENT');
    });
  });

  describe('File structure validation', () => {
    it('should create proper migration directory structure', () => {
      const migration =
        migrationManager.createMigrationFromTemplate('addSingleColumn');

      expect(migration.migrationDir).toMatch(/\d{14}_add_single_column$/);
      expect(migration.migrationFile).toMatch(/migration\.sql$/);
      expect(migration.relativePath).toContain('prisma/migrations');
    });

    it('should create unique migration directories', () => {
      const migration1 =
        migrationManager.createMigrationFromTemplate('addSingleColumn');
      // Wait a tiny bit to ensure different timestamps
      const migration2 = migrationManager.createMigration({
        name: 'add_single_column_2',
        sql: 'ALTER TABLE `User` ADD COLUMN `anotherField` VARCHAR(255);',
      });

      expect(migration1.migrationDir).not.toBe(migration2.migrationDir);
    });
  });
});
