import fs from 'fs';
import path from 'path';
import { MigrationCreator } from '../lib/migration-creator';

describe('MigrationCreator', () => {
  let tempDir: string;
  let migrationCreator: MigrationCreator;

  beforeEach(() => {
    // Create a temporary directory for tests
    tempDir = path.join(__dirname, 'temp_migrations');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const migrationsDir = path.join(tempDir, 'migrations');
    migrationCreator = new MigrationCreator(migrationsDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('createMigration', () => {
    it('should create a migration file with correct structure', () => {
      const testSql =
        'ALTER TABLE users MODIFY COLUMN id INT AUTO_INCREMENT FIRST;';
      const migrationName = 'test_migration';

      const result = migrationCreator.createMigration(testSql, migrationName);

      // Check that result contains expected properties
      expect(result.success).toBe(true);
      expect(result.migrationDir).toBeDefined();
      expect(result.migrationFile).toBeDefined();
      expect(result.migrationName).toBeDefined();

      // Verify migration directory exists and has correct format
      expect(fs.existsSync(result.migrationDir)).toBe(true);
      expect(result.migrationName).toMatch(/^\d{14}_test_migration$/);

      // Verify migration.sql file exists and contains correct content
      expect(fs.existsSync(result.migrationFile)).toBe(true);
      expect(path.basename(result.migrationFile)).toBe('migration.sql');

      const fileContent = fs.readFileSync(result.migrationFile, 'utf-8');
      expect(fileContent).toBe(testSql);
    });

    it('should generate timestamps in correct format', () => {
      const testSql = 'ALTER TABLE test MODIFY COLUMN id INT FIRST;';
      const migrationName = 'timestamp_test';

      const result = migrationCreator.createMigration(testSql, migrationName);

      expect(result.success).toBe(true);

      // Extract timestamp from migration name
      const timestampMatch = result.migrationName.match(/^(\d{14})_/);
      expect(timestampMatch).not.toBeNull();

      const timestamp = timestampMatch![1];
      expect(timestamp).toMatch(/^\d{14}$/); // YYYYMMDDHHMMSS format

      // Check that the timestamp is recent (within last minute)
      const year = parseInt(timestamp.substring(0, 4));
      const month = parseInt(timestamp.substring(4, 6));
      const day = parseInt(timestamp.substring(6, 8));
      const hour = parseInt(timestamp.substring(8, 10));
      const minute = parseInt(timestamp.substring(10, 12));
      const second = parseInt(timestamp.substring(12, 14));

      const timestampDate = new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        second,
      );
      const now = new Date();
      const diffMs = now.getTime() - timestampDate.getTime();

      // Should be within 1 minute (60000 ms)
      expect(diffMs).toBeLessThan(60000);
      expect(diffMs).toBeGreaterThanOrEqual(0);
    });

    it('should use default migration name when none provided', () => {
      const testSql = 'ALTER TABLE test MODIFY COLUMN id INT FIRST;';

      const result = migrationCreator.createMigration(testSql);

      expect(result.success).toBe(true);
      expect(result.migrationName).toMatch(/^\d{14}_sync_column_order$/);
    });

    it('should handle empty SQL gracefully', () => {
      const testSql = '';
      const migrationName = 'empty_migration';

      const result = migrationCreator.createMigration(testSql, migrationName);

      expect(result.success).toBe(true);

      const fileContent = fs.readFileSync(result.migrationFile, 'utf-8');
      expect(fileContent).toBe('');
    });

    it('should handle multi-line SQL', () => {
      const testSql = `ALTER TABLE users MODIFY COLUMN id INT AUTO_INCREMENT FIRST;
ALTER TABLE users MODIFY COLUMN name VARCHAR(255) AFTER id;
ALTER TABLE users MODIFY COLUMN email VARCHAR(255) AFTER name;`;

      const migrationName = 'multiline_test';

      const result = migrationCreator.createMigration(testSql, migrationName);

      expect(result.success).toBe(true);

      const fileContent = fs.readFileSync(result.migrationFile, 'utf-8');
      expect(fileContent).toBe(testSql);
    });

    it('should create migrations directory if it does not exist', () => {
      const nonExistentMigrationsDir = path.join(
        tempDir,
        'non_existent_migrations',
      );
      const migrationCreatorWithNewDir = new MigrationCreator(
        nonExistentMigrationsDir,
      );
      const testSql = 'ALTER TABLE test MODIFY COLUMN id INT FIRST;';
      const migrationName = 'create_dir_test';

      const result = migrationCreatorWithNewDir.createMigration(
        testSql,
        migrationName,
      );

      expect(result.success).toBe(true);
      expect(fs.existsSync(nonExistentMigrationsDir)).toBe(true);
    });

    it('should handle special characters in migration names', () => {
      const testSql = 'ALTER TABLE test MODIFY COLUMN id INT FIRST;';
      const migrationName = 'test-migration_with.special_chars';

      const result = migrationCreator.createMigration(testSql, migrationName);

      expect(result.success).toBe(true);
      expect(result.migrationName).toMatch(
        /^\d{14}_test-migration_with\.special_chars$/,
      );
    });

    it('should handle file system errors gracefully', () => {
      const invalidMigrationsDir = '/invalid/path/that/cannot/be/created';
      const migrationCreatorWithInvalidDir = new MigrationCreator(
        invalidMigrationsDir,
      );
      const testSql = 'ALTER TABLE test MODIFY COLUMN id INT FIRST;';
      const migrationName = 'error_test';

      const result = migrationCreatorWithInvalidDir.createMigration(
        testSql,
        migrationName,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.migrationDir).toBe('');
      expect(result.migrationFile).toBe('');
      expect(result.migrationName).toBe('');
    });
  });

  describe('unique timestamps', () => {
    it('should generate unique migration names when called multiple times', () => {
      const migrationNames = new Set();

      // Generate multiple migrations quickly
      for (let i = 0; i < 5; i++) {
        const result = migrationCreator.createMigration(
          'ALTER TABLE test MODIFY COLUMN id INT FIRST;',
          `test_${i}`,
        );
        expect(result.success).toBe(true);
        migrationNames.add(result.migrationName);
      }

      // All migration names should be unique
      expect(migrationNames.size).toBe(5);
    });
  });
});
