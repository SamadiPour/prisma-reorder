import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Test schema definitions that can be used across different test files.
 */
export const TEST_SCHEMAS = {
  mysql: `// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
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
  posts     Post[]
  profile   Profile?
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Profile {
  id     Int     @id @default(autoincrement())
  bio    String?
  userId Int     @unique
  user   User    @relation(fields: [userId], references: [id])
}`,

  mariadb: `// Test schema with MariaDB
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Company {
  id        Int      @id @default(autoincrement())
  name      String
  industry  String?
  employees Employee[]
  createdAt DateTime @default(now())
}

model Employee {
  id        Int     @id @default(autoincrement())
  firstName String
  lastName  String
  email     String  @unique
  companyId Int
  company   Company @relation(fields: [companyId], references: [id])
}`,

  postgresql: `// Test schema with PostgreSQL (unsupported)
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String?
}`,

  sqlite: `// Test schema with SQLite (unsupported)
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model Product {
  id    Int    @id @default(autoincrement())
  name  String
  price Float
}`,

  invalid: `// Invalid schema for testing error handling
generator client {
  provider = "prisma-client-js"
}

// Missing datasource block intentionally

model InvalidModel {
  // Missing id field
  name String
}`,

  integration: `datasource db {
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
}`,
};

/**
 * Utility class for managing temporary test schema files.
 * Creates schema files in a temporary directory and provides cleanup.
 */
export class SchemaManager {
  private readonly tempDir: string;
  private createdFiles: string[] = [];

  constructor(testName?: string) {
    // Create a unique temp directory for this test run
    const baseTempDir = tmpdir();
    const timestamp = Date.now();
    const dirName = testName
      ? `prisma-reorder-test-${testName}-${timestamp}`
      : `prisma-reorder-test-${timestamp}`;
    this.tempDir = join(baseTempDir, dirName);

    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Create a temporary schema file with the specified content.
   */
  createSchemaFile(
    schemaType: keyof typeof TEST_SCHEMAS,
    fileName = 'schema.prisma',
  ): string {
    const filePath = join(this.tempDir, fileName);
    const content = TEST_SCHEMAS[schemaType];

    writeFileSync(filePath, content, 'utf-8');
    this.createdFiles.push(filePath);

    return filePath;
  }

  /**
   * Create a custom schema file with the provided content.
   */
  createCustomSchemaFile(content: string, fileName = 'schema.prisma'): string {
    const filePath = join(this.tempDir, fileName);

    writeFileSync(filePath, content, 'utf-8');
    this.createdFiles.push(filePath);

    return filePath;
  }

  /**
   * Create multiple schema files for testing different providers.
   */
  createMultipleSchemas(): { [key: string]: string } {
    return {
      mysql: this.createSchemaFile('mysql', 'mysql-schema.prisma'),
      mariadb: this.createSchemaFile('mariadb', 'mariadb-schema.prisma'),
      postgresql: this.createSchemaFile('postgresql', 'postgres-schema.prisma'),
      sqlite: this.createSchemaFile('sqlite', 'sqlite-schema.prisma'),
      invalid: this.createSchemaFile('invalid', 'invalid-schema.prisma'),
    };
  }

  /**
   * Get the temporary directory path.
   */
  getTempDir(): string {
    return this.tempDir;
  }

  /**
   * Get all created file paths.
   */
  getCreatedFiles(): string[] {
    return [...this.createdFiles];
  }

  /**
   * Clean up all created files and directories.
   */
  cleanup(): void {
    try {
      if (existsSync(this.tempDir)) {
        rmSync(this.tempDir, { recursive: true, force: true });
      }
      this.createdFiles = [];
    } catch (error) {
      console.warn(`Failed to cleanup test schema files: ${error}`);
    }
  }
}

/**
 * Helper function to create a test schema manager for Jest tests.
 * Returns a manager instance - you should call cleanup manually or use beforeEach/afterEach.
 */
export function setupSchemaManager(testName?: string): SchemaManager {
  return new SchemaManager(testName);
}
