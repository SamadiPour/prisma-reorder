import { SchemaReader } from '../lib/schema-reader';
import { ColumnReorderGenerator } from '../lib/column-reorder';
import { DatabaseConnector } from '../lib/database-connector';
import { MigrationFixer } from '../lib/migration-fixer';
import { setupSchemaManager } from './utils/t_schema_manager';
import { setupMigrationManager } from './utils/t_migration_manager';

// Mock PrismaClient for performance tests
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('Performance Tests', () => {
  let schemaManager: ReturnType<typeof setupSchemaManager>;
  let migrationManager: ReturnType<typeof setupMigrationManager>;

  beforeEach(() => {
    schemaManager = setupSchemaManager('performance');
    migrationManager = setupMigrationManager('performance');

    // Mock DatabaseConnector methods for performance tests
    jest.spyOn(DatabaseConnector.prototype, 'connect').mockResolvedValue();
    jest.spyOn(DatabaseConnector.prototype, 'disconnect').mockResolvedValue();
    jest
      .spyOn(DatabaseConnector.prototype, 'tableExists')
      .mockResolvedValue(true);
    jest
      .spyOn(DatabaseConnector.prototype, 'getTableMetadata')
      .mockResolvedValue({
        name: 'User',
        columns: [
          {
            name: 'id',
            type: 'int(11) NOT NULL AUTO_INCREMENT',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: true,
            isPrimaryKey: true,
            isUnique: true,
            extra: 'auto_increment',
            position: 1,
          },
          {
            name: 'email',
            type: 'varchar(255) NOT NULL',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: true,
            extra: '',
            position: 2,
          },
        ],
      });
    jest
      .spyOn(DatabaseConnector.prototype, 'getTablesMetadata')
      .mockResolvedValue([]);
  });

  afterEach(() => {
    schemaManager.cleanup();
    migrationManager.cleanup();
  });

  describe('Schema Reading Performance', () => {
    it('should read small schema files quickly', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const schemaReader = new SchemaReader(schemaPath);

      const startTime = performance.now();
      const analysis = await schemaReader.getSchemaAnalysis();
      const duration = performance.now() - startTime;

      expect(analysis).toBeDefined();
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle medium-sized schemas efficiently', async () => {
      // Create schema with 20 models, each with 10 fields
      let mediumSchema = `
        generator client {
          provider = "prisma-client-js"
        }
        
        datasource db {
          provider = "mysql"
          url      = env("DATABASE_URL")
        }
      `;

      for (let i = 0; i < 20; i++) {
        mediumSchema += `
        model Model${i} {
          id Int @id @default(autoincrement())
        `;

        for (let j = 0; j < 10; j++) {
          mediumSchema += `field${j} String${j % 2 === 0 ? '?' : ''}\n`;
        }

        mediumSchema += '}\n';
      }

      const schemaPath = schemaManager.createCustomSchemaFile(mediumSchema);
      const schemaReader = new SchemaReader(schemaPath);

      const startTime = performance.now();
      const analysis = await schemaReader.getSchemaAnalysis();
      const duration = performance.now() - startTime;

      expect(analysis.models).toHaveLength(20);
      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });

    it('should handle large schemas within reasonable time', async () => {
      // Create schema with 50 models, each with 15 fields
      let largeSchema = `
        generator client {
          provider = "prisma-client-js"
        }
        
        datasource db {
          provider = "mysql"
          url      = env("DATABASE_URL")
        }
      `;

      for (let i = 0; i < 50; i++) {
        largeSchema += `
        model Model${i} {
          id Int @id @default(autoincrement())
          createdAt DateTime @default(now())
          updatedAt DateTime @updatedAt
        `;

        for (let j = 0; j < 15; j++) {
          const fieldType =
            j % 3 === 0 ? 'String' : j % 3 === 1 ? 'Int' : 'Boolean';
          const optional = j % 4 === 0 ? '?' : '';
          largeSchema += `field${j} ${fieldType}${optional}\n`;
        }

        largeSchema += '}\n';
      }

      const schemaPath = schemaManager.createCustomSchemaFile(largeSchema);
      const schemaReader = new SchemaReader(schemaPath);

      const startTime = performance.now();
      const analysis = await schemaReader.getSchemaAnalysis();
      const duration = performance.now() - startTime;

      expect(analysis.models).toHaveLength(50);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Column Reorder Generation Performance', () => {
    it('should generate reorder SQL quickly for single model', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const generator = new ColumnReorderGenerator(schemaPath);

      const startTime = performance.now();
      const results = await generator.generateReorderSQL(['User']);
      const duration = performance.now() - startTime;

      expect(Array.isArray(results)).toBe(true);
      expect(duration).toBeLessThan(200); // Should complete within 200ms
    });

    it('should handle multiple models efficiently', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const generator = new ColumnReorderGenerator(schemaPath);

      const startTime = performance.now();
      const results = await generator.generateReorderSQL();
      const duration = performance.now() - startTime;

      expect(Array.isArray(results)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should scale reasonably with number of models', async () => {
      // Create schema with many models
      let manyModelsSchema = `
        generator client {
          provider = "prisma-client-js"
        }
        
        datasource db {
          provider = "mysql"
          url      = env("DATABASE_URL")
        }
      `;

      const modelCount = 30;
      for (let i = 0; i < modelCount; i++) {
        manyModelsSchema += `
        model Model${i} {
          id Int @id @default(autoincrement())
          field1 String
          field2 Int?
          field3 DateTime @default(now())
        }
        `;
      }

      const schemaPath = schemaManager.createCustomSchemaFile(manyModelsSchema);
      const generator = new ColumnReorderGenerator(schemaPath);

      const startTime = performance.now();
      const results = await generator.generateReorderSQL();
      const duration = performance.now() - startTime;

      expect(Array.isArray(results)).toBe(true);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });

  describe('Migration Fixing Performance', () => {
    it('should process small migration files quickly', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');

      const smallMigration = `-- AddColumn
ALTER TABLE \`User\` ADD COLUMN \`email\` VARCHAR(191) NOT NULL;`;

      migrationManager.createMigration({
        name: '20230101000000_small',
        sql: smallMigration,
      });

      const fixer = new MigrationFixer(
        migrationManager.getMigrationsDir(),
        schemaPath,
      );

      const startTime = performance.now();
      const result = await fixer.fixLatestMigration();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle migrations with many ADD COLUMN operations', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');

      let largeMigration = '-- Multiple ADD COLUMN operations\n';
      for (let i = 0; i < 20; i++) {
        largeMigration += `ALTER TABLE \`User\` ADD COLUMN \`field${i}\` VARCHAR(255);\n`;
      }

      migrationManager.createMigration({
        name: '20230101000000_large',
        sql: largeMigration,
      });

      const fixer = new MigrationFixer(
        migrationManager.getMigrationsDir(),
        schemaPath,
      );

      const startTime = performance.now();
      const result = await fixer.fixLatestMigration();
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });
  });

  describe('Memory Usage', () => {
    it('should not consume excessive memory with large schemas', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create large schema
      let hugeSchema = `
        generator client {
          provider = "prisma-client-js"
        }
        
        datasource db {
          provider = "mysql"
          url      = env("DATABASE_URL")
        }
      `;

      for (let i = 0; i < 100; i++) {
        hugeSchema += `
        model Model${i} {
          id Int @id @default(autoincrement())
        `;

        for (let j = 0; j < 20; j++) {
          hugeSchema += `field${j} String?\n`;
        }

        hugeSchema += '}\n';
      }

      const schemaPath = schemaManager.createCustomSchemaFile(hugeSchema);
      const schemaReader = new SchemaReader(schemaPath);

      await schemaReader.getSchemaAnalysis();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should cleanup memory after multiple operations', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform multiple operations
      for (let i = 0; i < 20; i++) {
        const schemaReader = new SchemaReader(schemaPath);
        await schemaReader.getSchemaAnalysis();

        const generator = new ColumnReorderGenerator(schemaPath);
        await generator.generateReorderSQL();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory should not increase significantly
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024); // Less than 20MB
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent schema readings efficiently', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');

      const startTime = performance.now();

      // Run 10 concurrent schema analyses
      const promises = Array.from({ length: 10 }, async () => {
        const schemaReader = new SchemaReader(schemaPath);
        return schemaReader.getSchemaAnalysis();
      });

      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      // All results should be consistent
      results.forEach((result) => {
        expect(result.isSupported).toBe(true);
        expect(result.provider).toBe('mysql');
      });
    });

    it('should handle concurrent column reorder generations', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');

      const startTime = performance.now();

      // Run 5 concurrent reorder generations
      const promises = Array.from({ length: 5 }, async () => {
        const generator = new ColumnReorderGenerator(schemaPath);
        return generator.generateReorderSQL();
      });

      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

      // All results should be arrays
      results.forEach((result) => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('Stress Testing', () => {
    it('should handle rapid successive operations', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');

      const operations: Promise<any>[] = [];

      // Queue up many operations rapidly
      for (let i = 0; i < 50; i++) {
        const operation = (async () => {
          const schemaReader = new SchemaReader(schemaPath);
          const analysis = await schemaReader.getSchemaAnalysis();

          if (i % 2 === 0) {
            const generator = new ColumnReorderGenerator(schemaPath);
            return generator.generateReorderSQL();
          }

          return analysis;
        })();

        operations.push(operation);
      }

      const startTime = performance.now();
      const results = await Promise.all(operations);
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain performance under sustained load', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const durations: number[] = [];

      // Run 10 iterations to measure sustained performance
      for (let iteration = 0; iteration < 10; iteration++) {
        const startTime = performance.now();

        const schemaReader = new SchemaReader(schemaPath);
        await schemaReader.getSchemaAnalysis();

        const generator = new ColumnReorderGenerator(schemaPath);
        await generator.generateReorderSQL();

        const duration = performance.now() - startTime;
        durations.push(duration);
      }

      // Performance should remain consistent (no degradation)
      const averageDuration =
        durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      expect(averageDuration).toBeLessThan(1000); // Average should be under 1 second
      expect(maxDuration).toBeLessThan(1500); // No single operation should take over 1.5 seconds

      // Check that performance doesn't degrade significantly over time
      const firstHalf = durations.slice(0, 5);
      const secondHalf = durations.slice(5);

      const firstHalfAvg =
        firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      // Second half shouldn't be more than 50% slower than first half
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 1.5);
    });
  });
});
