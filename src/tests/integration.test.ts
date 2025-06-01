import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MigrationFixer } from '../lib/migration-fixer';
import { setupSchemaManager, TEST_SCHEMAS } from './utils/t_schema_manager';
import { setupMigrationManager, MIGRATION_SCENARIOS } from './utils/t_migration_manager';

describe('Migration Fixer Integration', () => {
  let schemaManager: ReturnType<typeof setupSchemaManager>;
  let migrationManager: ReturnType<typeof setupMigrationManager>;

  beforeEach(() => {
    schemaManager = setupSchemaManager('integration');
    migrationManager = setupMigrationManager('integration');
  });

  afterEach(() => {
    // Cleanup test schemas and migrations
    schemaManager.cleanup();
    migrationManager.cleanup();
  });

  it('should fix column positions in migration file', async () => {
    // 1. Create a Prisma project structure with schema
    const schemaContent = TEST_SCHEMAS.integration;
    const { projectDir, schemaFile, migrationsDir } = migrationManager.createPrismaProject(schemaContent);

    // 2. Create a test migration with unpositioned columns using the migration manager
    const migration = migrationManager.createMigrationFromTemplate('integration');

    // 3. Run the migration fixer
    const fixer = new MigrationFixer(migrationsDir, schemaFile);

    const fixResult = await fixer.fixLatestMigration();
    expect(fixResult).toBeTruthy();
    expect(fixResult?.fixedSql).toBeTruthy();

    // Write the fixed SQL back to the migration file
    if (fixResult?.fixedSql) {
      writeFileSync(migration.migrationFile, fixResult.fixedSql);
    }

    // 4. Verify the migration was fixed
    const fixedSql = readFileSync(migration.migrationFile, 'utf-8');
    const expectedPositioning = [
      'AFTER `id`',
      'AFTER `name`',
      'AFTER `content`',
    ];

    for (const expected of expectedPositioning) {
      expect(fixedSql).toContain(expected);
    }

    // 5. Verify that all necessary changes were made
    const secondFixResult = await fixer.fixLatestMigration();
    expect(secondFixResult).toBeNull(); // null means no fixes needed
  });
});
