import { readFileSync } from 'fs';
import {
  MigrationAssertions,
  quickSetup,
  withMigrationTest,
} from './utils/t_utils';

describe('Migration System Examples', () => {
  describe('Using Quick Setup Functions', () => {
    it(
      'should test single column addition',
      withMigrationTest(
        quickSetup.singleColumn,
        async ({ fixer, migration }) => {
          const originalSql = readFileSync(migration.migrationFile, 'utf-8');

          const fixResult = await fixer.fixLatestMigration();

          if (fixResult) {
            MigrationAssertions.assertMigrationFixed(
              originalSql,
              fixResult.fixedSql,
            );
          } else {
            MigrationAssertions.assertNoFixNeeded(fixResult);
          }
        },
      ),
    );

    it(
      'should test multiple columns addition',
      withMigrationTest(
        quickSetup.multipleColumns,
        async ({ fixer, migration }) => {
          MigrationAssertions.assertMigrationStructure(migration);

          const sql = readFileSync(migration.migrationFile, 'utf-8');
          expect(sql).toContain('ADD COLUMN `firstName`');
          expect(sql).toContain('ADD COLUMN `lastName`');

          await fixer.fixLatestMigration();
        },
      ),
    );

    it(
      'should test integration scenario',
      withMigrationTest(
        quickSetup.integration,
        async ({ fixer, migration }) => {
          const fixResult = await fixer.fixLatestMigration();
          expect(fixResult).toBeTruthy();

          if (fixResult) {
            MigrationAssertions.assertColumnPositioning(fixResult.fixedSql, [
              'AFTER `id`',
              'AFTER `name`',
              'AFTER `content`',
            ]);
          }
        },
      ),
    );

    it(
      'should test custom SQL',
      withMigrationTest(
        () =>
          quickSetup.custom(
            'ALTER TABLE `User` ADD COLUMN `customField` VARCHAR(255);',
            'custom_test',
          ),
        async ({ migration, fixer }) => {
          const sql = readFileSync(migration.migrationFile, 'utf-8');
          expect(sql).toContain('customField');

          // Test the fixer with custom SQL
          await fixer.fixLatestMigration();
        },
      ),
    );
  });

  describe('Using Sequential Migrations', () => {
    it(
      'should handle multiple migrations in sequence',
      withMigrationTest(
        quickSetup.sequential,
        async ({ migrations, migrationManager, fixer }) => {
          expect(migrations).toHaveLength(3);

          // Verify chronological order
          const allMigrations = migrationManager.getAllMigrations();
          expect(allMigrations[0].migrationDir).toContain('initial');
          expect(allMigrations[1].migrationDir).toContain('add_email');
          expect(allMigrations[2].migrationDir).toContain('add_name');

          // Test fixing the latest migration
          const latest = migrationManager.getLatestMigration();
          expect(latest?.migrationFile).toBe(allMigrations[2].migrationFile);

          await fixer.fixLatestMigration();
        },
      ),
    );
  });

  describe('Advanced Migration Testing', () => {
    it(
      'should test mixed operations',
      withMigrationTest(
        quickSetup.mixedOperations,
        async ({ migration, fixer }) => {
          const sql = readFileSync(migration.migrationFile, 'utf-8');

          // Verify mixed operations are present
          expect(sql).toContain('CREATE TABLE');
          expect(sql).toContain('ALTER TABLE');
          expect(sql).toContain('DROP INDEX');

          // The fixer should only process ADD COLUMN operations
          const fixResult = await fixer.fixLatestMigration();

          if (fixResult) {
            // Should contain CREATE and DROP operations unchanged
            expect(fixResult.fixedSql).toContain('CREATE TABLE');
            expect(fixResult.fixedSql).toContain('DROP INDEX');
          }
        },
      ),
    );

    it(
      'should handle edge cases properly',
      withMigrationTest(
        () =>
          quickSetup.custom(
            `
        -- Complex migration with comments
        /* Block comment */
        ALTER TABLE \`User\` ADD COLUMN \`field1\` VARCHAR(255); -- Inline comment
        
        -- Another comment
        ALTER TABLE \`Post\` ADD COLUMN \`field2\` TEXT,
                             ADD COLUMN \`field3\` INT;
      `,
            'complex_test',
          ),
        async ({ migration, fixer }) => {
          const sql = readFileSync(migration.migrationFile, 'utf-8');

          expect(sql).toContain('/* Block comment */');
          expect(sql).toContain('-- Inline comment');
          expect(sql).toContain('field1');
          expect(sql).toContain('field2');
          expect(sql).toContain('field3');

          await fixer.fixLatestMigration();
        },
      ),
    );
  });

  describe('Error Handling', () => {
    it(
      'should handle empty migrations gracefully',
      withMigrationTest(
        () =>
          quickSetup.custom(
            '-- Empty migration with only comments\n-- No actual SQL operations',
            'empty_test',
          ),
        async ({ fixer }) => {
          const fixResult = await fixer.fixLatestMigration();
          // Should return null for migrations with no ADD COLUMN operations
          MigrationAssertions.assertNoFixNeeded(fixResult);
        },
      ),
    );

    it(
      'should handle malformed SQL gracefully',
      withMigrationTest(
        () =>
          quickSetup.custom(
            'INVALID SQL STATEMENT;\nALTER TABLE User ADD COLUMN valid_field VARCHAR(255);',
            'malformed_test',
          ),
        async ({ fixer }) => {
          // The fixer should still extract valid ADD COLUMN statements
          const fixResult = await fixer.fixLatestMigration();

          if (fixResult) {
            expect(fixResult.fixedSql).toContain('valid_field');
          }
        },
      ),
    );
  });
});
