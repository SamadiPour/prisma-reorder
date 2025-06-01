import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MigrationFixer } from '../lib/migration-fixer';

describe('Migration Fixer Integration', () => {
  const testDir = join(__dirname, './migration-fix');
  const migrationsDir = join(testDir, 'prisma/migrations/202310010000_initial');
  const migrationFile = join(migrationsDir, 'migration.sql');
  const schemaFile = join(testDir, 'prisma/schema.prisma');

  beforeEach(() => {
    // Create test directories
    mkdirSync(migrationsDir, { recursive: true });
    mkdirSync(join(testDir, 'prisma'), { recursive: true });
  });

  afterEach(() => {
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
    const testSchema = `datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id         Int      @id @default(autoincrement())
  testField1 String?  // Should be after id
  email      String   @unique
  name       String?
  testField2 String?  // Should be after name
  bio        String?
  avatar     String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  posts      Post[]
}

model Post {
  id         Int      @id @default(autoincrement())
  title      String
  content    String?
  testField3 Int      @default(0) // Should be after content
  status     String   @default("draft")
  published  Boolean  @default(false)
  authorId   Int
  author     User     @relation(fields: [authorId], references: [id])
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}`;

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
