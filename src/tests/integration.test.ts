import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MigrationFixer } from '../lib/migration-fixer';
import { setupSchemaManager, TEST_SCHEMAS } from './test-schemas';

describe('Migration Fixer Integration', () => {
  let schemaManager: ReturnType<typeof setupSchemaManager>;
  const testDir = join(__dirname, './migration-fix');
  const migrationsDir = join(testDir, 'prisma/migrations/202310010000_initial');
  const migrationFile = join(migrationsDir, 'migration.sql');
  const schemaFile = join(testDir, 'prisma/schema.prisma');

  beforeEach(() => {
    schemaManager = setupSchemaManager('integration');
    // Create test directories
    mkdirSync(migrationsDir, { recursive: true });
    mkdirSync(join(testDir, 'prisma'), { recursive: true });
  });

  afterEach(() => {
    // Cleanup test schemas
    schemaManager.cleanup();
    // Cleanup - remove any created directories and files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should fix column positions in migration file', async () => {
    // 1. Create a test migration with unpositioned columns
    const originalSql = `-- Test migration for integration test
ALTER TABLE \`User\` ADD COLUMN \`testField1\` VARCHAR(100);
ALTER TABLE \`User\` ADD COLUMN \`testField2\` TEXT;
ALTER TABLE \`Post\` ADD COLUMN \`testField3\` INTEGER DEFAULT 0;`;

    writeFileSync(migrationFile, originalSql);

    // 2. Update schema to include test fields in specific positions
    const testSchema = TEST_SCHEMAS.integration;
    writeFileSync(schemaFile, testSchema);

    // 3. Run the migration fixer
    const fixer = new MigrationFixer(
      join(testDir, 'prisma/migrations'),
      schemaFile,
    );

    const fixResult = await fixer.fixLatestMigration();
    expect(fixResult).toBeTruthy();
    expect(fixResult?.fixedSql).toBeTruthy();

    // Write the fixed SQL back to the migration file
    if (fixResult?.fixedSql) {
      writeFileSync(migrationFile, fixResult.fixedSql);
    }

    // 4. Verify the migration was fixed
    const fixedSql = readFileSync(migrationFile, 'utf-8');
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
