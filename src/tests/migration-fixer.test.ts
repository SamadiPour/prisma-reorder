import { readFileSync } from 'fs';
import { MigrationFixer } from '../lib/migration-fixer';
import {
  MIGRATION_SCENARIOS,
  setupMigrationManager,
} from './utils/t_migration_manager';
import { setupSchemaManager } from './utils/t_schema_manager';

describe('MigrationFixer', () => {
  let migrationManager: ReturnType<typeof setupMigrationManager>;
  let schemaManager: ReturnType<typeof setupSchemaManager>;

  beforeEach(() => {
    migrationManager = setupMigrationManager('migration-fixer');
    schemaManager = setupSchemaManager('migration-fixer');
  });

  afterEach(() => {
    migrationManager.cleanup();
    schemaManager.cleanup();
  });

  describe('extractAddColumnInfo', () => {
    it('should extract ADD COLUMN statements correctly', () => {
      // Use migration template for extraction testing
      const migration =
        migrationManager.createMigrationFromTemplate('extractColumns');
      const sql = readFileSync(migration.migrationFile, 'utf-8');
      const fixer = new MigrationFixer();

      // Access private method for testing (using type assertion)
      const extractMethod = (fixer as any).extractAddColumnInfo.bind(fixer);
      const results = extractMethod(sql);

      expect(results).toHaveLength(4);
      expect(results[0]).toMatchObject({
        tableName: 'User',
        columnName: 'newField',
        definition: 'VARCHAR(255) NOT NULL',
      });
      expect(results[1]).toMatchObject({
        tableName: 'posts',
        columnName: 'status',
        definition: "ENUM('draft', 'published') DEFAULT 'draft'",
      });
      expect(results[2]).toMatchObject({
        tableName: 'Profile',
        columnName: 'avatar',
        definition: 'TEXT',
      });
      expect(results[3]).toMatchObject({
        tableName: 'Profile',
        columnName: 'bio',
        definition: 'TEXT',
      });
    });
  });

  describe('fixMigrationSql', () => {
    it('should fix ADD COLUMN statements with correct positioning', async () => {
      const { projectDir, schemaFile, migrationsDir, migration } =
        MIGRATION_SCENARIOS.migrationFixerTests.singleColumnPositioning(
          migrationManager,
        );

      const fixer = new MigrationFixer(migrationsDir, schemaFile);
      const result = await fixer.fixLatestMigration();

      expect(result).not.toBeNull();
      expect(result?.fixedSql).toContain('AFTER `name`');
      expect(result?.changes[0]).toMatch(/Fixed column position/);
    });

    it('should not modify columns that are already in the correct position (last)', async () => {
      const { projectDir, schemaFile, migrationsDir, migration } =
        MIGRATION_SCENARIOS.migrationFixerTests.correctPosition(
          migrationManager,
        );

      const fixer = new MigrationFixer(migrationsDir, schemaFile);
      const result = await fixer.fixLatestMigration();

      // Should return null (no changes needed) because column is already in correct position
      expect(result).toBeNull();
    });

    it('should handle FIRST positioning correctly', async () => {
      const { projectDir, schemaFile, migrationsDir, migration } =
        MIGRATION_SCENARIOS.migrationFixerTests.firstPosition(migrationManager);

      const fixer = new MigrationFixer(migrationsDir, schemaFile);
      const result = await fixer.fixLatestMigration();

      expect(result).not.toBeNull();
      expect(result?.fixedSql).toContain('FIRST');
      expect(result?.changes[0]).toMatch(/FIRST/);
    });

    it('should handle ALTER TABLE with both DROP and ADD operations', async () => {
      const { projectDir, schemaFile, migrationsDir, migration } =
        MIGRATION_SCENARIOS.migrationFixerTests.dropAndAdd(migrationManager);

      const fixer = new MigrationFixer(migrationsDir, schemaFile);
      const result = await fixer.fixLatestMigration();

      expect(result).not.toBeNull();
      expect(result?.fixedSql).toContain('AFTER `email`');
      expect(result?.fixedSql).toContain('DROP COLUMN `oldField`');
      expect(result?.fixedSql).toContain(
        'ADD COLUMN `newField` INTEGER NULL AFTER `email`',
      );
      expect(result?.changes[0]).toMatch(
        /Fixed column position for user\.newField \(AFTER `email`\)/,
      );
    });

    it('should handle complex ALTER TABLE with multiple DROP and ADD operations', async () => {
      const { projectDir, schemaFile, migrationsDir, migration } =
        MIGRATION_SCENARIOS.migrationFixerTests.complexDropAndAdd(
          migrationManager,
        );

      const fixer = new MigrationFixer(migrationsDir, schemaFile);
      const result = await fixer.fixLatestMigration();

      expect(result).not.toBeNull();
      expect(result?.fixedSql).toContain(
        'ADD COLUMN `bio` TEXT NULL AFTER `avatar`',
      );
      expect(result?.fixedSql).toContain(
        'ADD COLUMN `avatar` VARCHAR(255) NULL AFTER `userId`',
      );
      expect(result?.fixedSql).toContain('DROP COLUMN `deprecated1`');
      expect(result?.fixedSql).toContain('DROP COLUMN `deprecated2`');
      expect(result?.changes).toHaveLength(2);
      expect(result?.changes).toContain(
        'Fixed column position for Profile.avatar (AFTER `userId`)',
      );
      expect(result?.changes).toContain(
        'Fixed column position for Profile.bio (AFTER `avatar`)',
      );
    });
  });
});
