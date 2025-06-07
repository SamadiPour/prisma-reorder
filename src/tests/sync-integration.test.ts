import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MigrationCreator } from '../lib/migration-creator';
import { ColumnReorderGenerator } from '../lib/column-reorder';
import { DatabaseConnector } from '../lib/database-connector';
import { SchemaReader } from '../lib/schema-reader';

// Mock dependencies
jest.mock('../lib/database-connector');
jest.mock('../lib/schema-reader');

const MockedDatabaseConnector = DatabaseConnector as jest.MockedClass<
  typeof DatabaseConnector
>;
const MockedSchemaReader = SchemaReader as jest.MockedClass<
  typeof SchemaReader
>;

/**
 * Integration test for the complete migration creation workflow
 */
describe('Sync Command Integration', () => {
  let tempDir: string;
  let schemaPath: string;
  let migrationsDir: string;

  beforeEach(() => {
    // Create temporary directory structure
    tempDir = join(tmpdir(), `prisma-reorder-integration-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    schemaPath = join(tempDir, 'schema.prisma');
    migrationsDir = join(tempDir, 'migrations');
    mkdirSync(migrationsDir, { recursive: true });

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up temporary directory and all its contents
    if (existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors but log them for debugging
        console.warn('Failed to clean up temporary directory:', error);
      }
    }

    // Additional cleanup: check for any migration files in the current working directory
    // that might have been created by mistake
    try {
      const currentWorkingDir = process.cwd();
      const prismaMigrationsPath = join(
        currentWorkingDir,
        'prisma',
        'migrations',
      );

      if (existsSync(prismaMigrationsPath)) {
        // Look for any migrations with our test pattern
        const fs = require('fs');
        const migrationDirs = fs
          .readdirSync(prismaMigrationsPath, { withFileTypes: true })
          .filter((dirent: any) => dirent.isDirectory())
          .map((dirent: any) => dirent.name)
          .filter((name: string) => name.includes('sync_column_order'));

        // Remove any test migration directories that shouldn't be there
        migrationDirs.forEach((migrationDir: string) => {
          const fullPath = join(prismaMigrationsPath, migrationDir);
          try {
            rmSync(fullPath, { recursive: true, force: true });
            console.warn(`Cleaned up stray test migration: ${fullPath}`);
          } catch (error) {
            console.warn(
              `Failed to clean up stray migration ${fullPath}:`,
              error,
            );
          }
        });

        // Remove empty prisma directories if they exist and are empty
        try {
          const items = fs.readdirSync(prismaMigrationsPath);
          if (items.length === 0) {
            rmSync(prismaMigrationsPath, { recursive: true, force: true });

            // Also check if prisma directory is now empty and remove it
            const prismaPath = join(currentWorkingDir, 'prisma');
            const prismaItems = fs.readdirSync(prismaPath);
            if (prismaItems.length === 0) {
              rmSync(prismaPath, { recursive: true, force: true });
            }
          }
        } catch (error) {
          // Ignore errors when cleaning up empty directories
        }
      }
    } catch (error) {
      // Ignore errors in additional cleanup
      console.warn('Error during additional cleanup:', error);
    }

    // Clean up any environment variables that might have been set
    delete process.env.DATABASE_URL;
  });

  it('should create migration for schema column reordering', async () => {
    let migrationResult: any = null;

    try {
      // Create a test schema with columns that need reordering
      const testSchema = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`;

      writeFileSync(schemaPath, testSchema);

      // Mock DATABASE_URL in environment
      process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';

      // Mock schema reader
      const mockSchemaReader = new MockedSchemaReader();
      mockSchemaReader.getSchemaAnalysis = jest.fn().mockResolvedValue({
        provider: 'mysql',
        models: [
          {
            name: 'User',
            fields: [
              {
                name: 'id',
                type: 'Int',
                isOptional: false,
                isId: true,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'email',
                type: 'String',
                isOptional: false,
                isId: false,
                isUnique: true,
                hasDefault: false,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'name',
                type: 'String',
                isOptional: true,
                isId: false,
                isUnique: false,
                hasDefault: false,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'createdAt',
                type: 'DateTime',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'updatedAt',
                type: 'DateTime',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
            ],
          },
          {
            name: 'Post',
            fields: [
              {
                name: 'id',
                type: 'Int',
                isOptional: false,
                isId: true,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'title',
                type: 'String',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: false,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'content',
                type: 'String',
                isOptional: true,
                isId: false,
                isUnique: false,
                hasDefault: false,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'published',
                type: 'Boolean',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'authorId',
                type: 'Int',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: false,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'createdAt',
                type: 'DateTime',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'updatedAt',
                type: 'DateTime',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
            ],
          },
        ],
        isSupported: true,
        errors: [],
      });

      mockSchemaReader.getDatabaseUrl = jest
        .fn()
        .mockResolvedValue('mysql://test:test@localhost:3306/test');
      mockSchemaReader.getModelFieldOrder = jest
        .fn()
        .mockResolvedValueOnce([
          'id',
          'email',
          'name',
          'createdAt',
          'updatedAt',
        ]) // User
        .mockResolvedValueOnce([
          'id',
          'title',
          'content',
          'published',
          'authorId',
          'createdAt',
          'updatedAt',
        ]); // Post
      mockSchemaReader.getFieldColumnMapping = jest
        .fn()
        .mockResolvedValueOnce(
          new Map([
            ['id', 'id'],
            ['email', 'email'],
            ['name', 'name'],
            ['createdAt', 'createdAt'],
            ['updatedAt', 'updatedAt'],
          ]),
        )
        .mockResolvedValueOnce(
          new Map([
            ['id', 'id'],
            ['title', 'title'],
            ['content', 'content'],
            ['published', 'published'],
            ['authorId', 'authorId'],
            ['createdAt', 'createdAt'],
            ['updatedAt', 'updatedAt'],
          ]),
        );
      mockSchemaReader.getTableName = jest
        .fn()
        .mockResolvedValueOnce('User')
        .mockResolvedValueOnce('Post');

      // Mock database connector with columns in wrong order
      const mockDbConnector = new MockedDatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      mockDbConnector.connect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.disconnect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.tableExists = jest.fn().mockResolvedValue(true);
      mockDbConnector.getTableMetadata = jest
        .fn()
        .mockResolvedValueOnce({
          name: 'User',
          columns: [
            {
              name: 'updatedAt',
              type: 'datetime',
              nullable: false,
              defaultValue: 'CURRENT_TIMESTAMP',
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 1,
            },
            {
              name: 'createdAt',
              type: 'datetime',
              nullable: false,
              defaultValue: 'CURRENT_TIMESTAMP',
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 2,
            },
            {
              name: 'name',
              type: 'varchar(191)',
              nullable: true,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 3,
            },
            {
              name: 'email',
              type: 'varchar(191)',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: true,
              extra: '',
              position: 4,
            },
            {
              name: 'id',
              type: 'int',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: true,
              isPrimaryKey: true,
              isUnique: false,
              extra: 'auto_increment',
              position: 5,
            },
          ],
        })
        .mockResolvedValueOnce({
          name: 'Post',
          columns: [
            {
              name: 'updatedAt',
              type: 'datetime',
              nullable: false,
              defaultValue: 'CURRENT_TIMESTAMP',
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 1,
            },
            {
              name: 'createdAt',
              type: 'datetime',
              nullable: false,
              defaultValue: 'CURRENT_TIMESTAMP',
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 2,
            },
            {
              name: 'authorId',
              type: 'int',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 3,
            },
            {
              name: 'published',
              type: 'tinyint(1)',
              nullable: false,
              defaultValue: '0',
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 4,
            },
            {
              name: 'content',
              type: 'text',
              nullable: true,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 5,
            },
            {
              name: 'title',
              type: 'varchar(191)',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 6,
            },
            {
              name: 'id',
              type: 'int',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: true,
              isPrimaryKey: true,
              isUnique: false,
              extra: 'auto_increment',
              position: 7,
            },
          ],
        });

      // Set up mocks
      MockedSchemaReader.mockImplementation(() => mockSchemaReader);
      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);

      // Initialize column reorder generator and migration creator
      const columnReorderGenerator = new ColumnReorderGenerator(schemaPath);
      const migrationCreator = new MigrationCreator(migrationsDir);

      // Generate SQL for all models
      const results = await columnReorderGenerator.generateReorderSQL();

      // Combine all SQL statements
      const allSql = results
        .map((result) => result.sql.join('\n'))
        .join('\n\n');

      // Create migration
      migrationResult = migrationCreator.createMigration(
        allSql,
        'sync_column_order',
      );

      // Verify migration was created successfully
      expect(migrationResult.success).toBe(true);
      expect(migrationResult.migrationName).toMatch(
        /^\d{14}_sync_column_order$/,
      );
      expect(existsSync(migrationResult.migrationDir)).toBe(true);
      expect(existsSync(migrationResult.migrationFile)).toBe(true);

      // Verify migration file contains expected SQL
      const migrationContent = readFileSync(
        migrationResult.migrationFile,
        'utf-8',
      );
      expect(migrationContent).toContain('ALTER TABLE `User`');
      expect(migrationContent).toContain('ALTER TABLE `Post`');
      expect(migrationContent).toContain('MODIFY COLUMN');

      // Verify SQL ordering follows schema order
      expect(migrationContent).toContain('MODIFY COLUMN `id`');
      expect(migrationContent).toContain('FIRST');
      expect(migrationContent).toContain('AFTER');
    } finally {
      // Clean up created migration files and directories
      if (migrationResult && migrationResult.success) {
        try {
          if (existsSync(migrationResult.migrationFile)) {
            rmSync(migrationResult.migrationFile, { force: true });
          }
          if (existsSync(migrationResult.migrationDir)) {
            rmSync(migrationResult.migrationDir, {
              recursive: true,
              force: true,
            });
          }
        } catch (error) {
          // Ignore cleanup errors but log them for debugging
          console.warn('Failed to clean up migration files:', error);
        }
      }

      // Clean up environment
      delete process.env.DATABASE_URL;
    }
  });

  it('should handle models with no reordering needed', async () => {
    let migrationResult: any = null;

    try {
      const testSchema = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
}`;

      writeFileSync(schemaPath, testSchema);

      // Mock DATABASE_URL in environment
      process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';

      // Mock schema reader
      const mockSchemaReader = new MockedSchemaReader();
      mockSchemaReader.getSchemaAnalysis = jest.fn().mockResolvedValue({
        provider: 'mysql',
        models: [
          {
            name: 'User',
            fields: [
              {
                name: 'id',
                type: 'Int',
                isOptional: false,
                isId: true,
                isUnique: false,
                hasDefault: true,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'email',
                type: 'String',
                isOptional: false,
                isId: false,
                isUnique: true,
                hasDefault: false,
                isRelation: false,
                attributes: [],
              },
              {
                name: 'name',
                type: 'String',
                isOptional: true,
                isId: false,
                isUnique: false,
                hasDefault: false,
                isRelation: false,
                attributes: [],
              },
            ],
          },
        ],
        isSupported: true,
        errors: [],
      });

      mockSchemaReader.getDatabaseUrl = jest
        .fn()
        .mockResolvedValue('mysql://test:test@localhost:3306/test');
      mockSchemaReader.getModelFieldOrder = jest
        .fn()
        .mockResolvedValue(['id', 'email', 'name']);
      mockSchemaReader.getFieldColumnMapping = jest.fn().mockResolvedValue(
        new Map([
          ['id', 'id'],
          ['email', 'email'],
          ['name', 'name'],
        ]),
      );
      mockSchemaReader.getTableName = jest.fn().mockResolvedValue('User');

      // Mock database connector - columns already in correct order
      const mockDbConnector = new MockedDatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      mockDbConnector.connect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.disconnect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.tableExists = jest.fn().mockResolvedValue(true);
      mockDbConnector.getTableMetadata = jest.fn().mockResolvedValue({
        name: 'User',
        columns: [
          {
            name: 'id',
            type: 'int',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: true,
            isPrimaryKey: true,
            isUnique: false,
            extra: 'auto_increment',
            position: 1,
          },
          {
            name: 'email',
            type: 'varchar(191)',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: true,
            extra: '',
            position: 2,
          },
          {
            name: 'name',
            type: 'varchar(191)',
            nullable: true,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: false,
            extra: '',
            position: 3,
          },
        ],
      });

      // Set up mocks
      MockedSchemaReader.mockImplementation(() => mockSchemaReader);
      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);

      const columnReorderGenerator = new ColumnReorderGenerator(schemaPath);
      const migrationCreator = new MigrationCreator(migrationsDir);

      const results = await columnReorderGenerator.generateReorderSQL();

      // Should return empty array since no reordering is needed
      expect(results).toEqual([]);

      // Create migration with empty SQL
      migrationResult = migrationCreator.createMigration(
        '',
        'sync_column_order',
      );

      expect(migrationResult.success).toBe(true);

      const migrationContent = readFileSync(
        migrationResult.migrationFile,
        'utf-8',
      );
      expect(migrationContent).toBe('');
    } finally {
      // Clean up created migration files and directories
      if (migrationResult && migrationResult.success) {
        try {
          if (existsSync(migrationResult.migrationFile)) {
            rmSync(migrationResult.migrationFile, { force: true });
          }
          if (existsSync(migrationResult.migrationDir)) {
            rmSync(migrationResult.migrationDir, {
              recursive: true,
              force: true,
            });
          }
        } catch (error) {
          // Ignore cleanup errors but log them for debugging
          console.warn('Failed to clean up migration files:', error);
        }
      }

      // Clean up environment
      delete process.env.DATABASE_URL;
    }
  });
});
