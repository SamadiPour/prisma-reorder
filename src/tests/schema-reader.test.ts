import { SchemaReader } from '../lib/schema-reader';
import { setupSchemaManager } from './utils/t_schema_manager';

describe('SchemaReader', () => {
  let schemaManager: ReturnType<typeof setupSchemaManager>;

  beforeEach(() => {
    schemaManager = setupSchemaManager('schema-reader');
  });

  afterEach(() => {
    schemaManager.cleanup();
  });

  // Helper function to create test cases
  const testSchema = async (
    schemaPath: string,
    expectedProvider: string,
    shouldBeSupported: boolean,
  ) => {
    const schemaReader = new SchemaReader(schemaPath);
    const analysis = await schemaReader.getSchemaAnalysis();

    // Test provider matching
    expect(analysis.provider).toBe(expectedProvider);

    // Test support status
    expect(analysis.isSupported).toBe(shouldBeSupported);

    // Ensure models array exists
    expect(analysis.models).toBeDefined();
    expect(Array.isArray(analysis.models)).toBeTruthy();

    return analysis;
  };

  // Test cases
  it('should correctly analyze MySQL schema', async () => {
    const mysqlSchemaPath = schemaManager.createSchemaFile('mysql');
    const analysis = await testSchema(mysqlSchemaPath, 'mysql', true);
    expect(analysis.errors).toHaveLength(0);
  });

  it('should handle PostgreSQL schema as unsupported', async () => {
    const postgresSchemaPath = schemaManager.createSchemaFile('postgresql');
    const analysis = await testSchema(postgresSchemaPath, 'postgresql', false);
    expect(analysis.errors.length).toBeGreaterThan(0);
  });

  it('should handle missing schema file gracefully', async () => {
    const schemaReader = new SchemaReader('nonexistent.prisma');
    const analysis = await schemaReader.getSchemaAnalysis();

    expect(analysis.provider).toBe('unknown');
    expect(analysis.isSupported).toBeFalsy();
    expect(analysis.models).toHaveLength(0);
    expect(analysis.errors.length).toBeGreaterThan(0);
  });

  it('should correctly identify model names', async () => {
    const mysqlSchemaPath = schemaManager.createSchemaFile('mysql');
    const schemaReader = new SchemaReader(mysqlSchemaPath);
    const modelNames = await schemaReader.getModelNames();

    expect(Array.isArray(modelNames)).toBeTruthy();
    expect(modelNames).toContain('User');
    expect(modelNames).toContain('Post');
    expect(modelNames).toContain('Profile');
  });

  it('should retrieve field order for existing model', async () => {
    const mysqlSchemaPath = schemaManager.createSchemaFile('mysql');
    const schemaReader = new SchemaReader(mysqlSchemaPath);

    // User model exists in the test schema
    const fieldOrder = await schemaReader.getModelFieldOrder('User');
    expect(fieldOrder).toBeDefined();
    expect(fieldOrder).toContain('id');
    expect(fieldOrder).toContain('email');
    expect(fieldOrder).toContain('name');
  });

  it('should throw error for non-existent model field order', async () => {
    const mysqlSchemaPath = schemaManager.createSchemaFile('mysql');
    const schemaReader = new SchemaReader(mysqlSchemaPath);

    await expect(
      schemaReader.getModelFieldOrder('NonExistentModel'),
    ).rejects.toThrow();
  });

  describe('Database URL extraction', () => {
    it('should extract database URL from env variable', async () => {
      // Create a schema with env variable
      const schemaContent = `
        generator client {
          provider = "prisma-client-js"
        }

        datasource db {
          provider = "mysql"
          url      = env("DATABASE_URL")
        }

        model User {
          id   Int    @id @default(autoincrement())
          name String
        }
      `;

      const schemaPath = schemaManager.createCustomSchemaFile(schemaContent);

      // Mock environment variable
      const originalEnv = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/testdb';

      try {
        const schemaReader = new SchemaReader(schemaPath);
        const databaseUrl = await schemaReader.getDatabaseUrl();
        expect(databaseUrl).toBe('mysql://user:pass@localhost:3306/testdb');
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env.DATABASE_URL = originalEnv;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });

    it('should extract plain string database URL', async () => {
      // Create a schema with plain string URL
      const schemaContent = `
        generator client {
          provider = "prisma-client-js"
        }

        datasource db {
          provider = "mysql"
          url      = "mysql://user:pass@localhost:3306/testdb"
        }

        model User {
          id   Int    @id @default(autoincrement())
          name String
        }
      `;

      const schemaPath = schemaManager.createCustomSchemaFile(schemaContent);
      const schemaReader = new SchemaReader(schemaPath);
      const databaseUrl = await schemaReader.getDatabaseUrl();
      expect(databaseUrl).toBe('mysql://user:pass@localhost:3306/testdb');
    });

    it('should throw error when environment variable is not found', async () => {
      // Create a schema with non-existent env variable
      const schemaContent = `
        generator client {
          provider = "prisma-client-js"
        }

        datasource db {
          provider = "mysql"
          url      = env("NON_EXISTENT_DB_URL")
        }

        model User {
          id   Int    @id @default(autoincrement())
          name String
        }
      `;

      const schemaPath = schemaManager.createCustomSchemaFile(schemaContent);
      const schemaReader = new SchemaReader(schemaPath);

      await expect(schemaReader.getDatabaseUrl()).rejects.toThrow(
        'Environment variable "NON_EXISTENT_DB_URL" not found',
      );
    });

    it('should throw error when no datasource is found', async () => {
      // Create a schema without datasource
      const schemaContent = `
        generator client {
          provider = "prisma-client-js"
        }

        model User {
          id   Int    @id @default(autoincrement())
          name String
        }
      `;

      const schemaPath = schemaManager.createCustomSchemaFile(schemaContent);
      const schemaReader = new SchemaReader(schemaPath);

      await expect(schemaReader.getDatabaseUrl()).rejects.toThrow(
        'No datasource found in schema',
      );
    });

    it('should throw error when no url is specified in datasource', async () => {
      // Create a schema without url in datasource
      const schemaContent = `
        generator client {
          provider = "prisma-client-js"
        }

        datasource db {
          provider = "mysql"
        }

        model User {
          id   Int    @id @default(autoincrement())
          name String
        }
      `;

      const schemaPath = schemaManager.createCustomSchemaFile(schemaContent);
      const schemaReader = new SchemaReader(schemaPath);

      await expect(schemaReader.getDatabaseUrl()).rejects.toThrow(
        'No url specified in datasource',
      );
    });
  });
});
