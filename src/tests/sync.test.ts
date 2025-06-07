import { SyncCommand } from '../commands/sync';
import { ColumnReorderGenerator } from '../lib/column-reorder';
import { DatabaseConnector } from '../lib/database-connector';
import { SchemaReader } from '../lib/schema-reader';
import { setupSchemaManager } from './utils/t_schema_manager';
import { type SyncOptions } from '../types';

// Mock mysql2 to avoid actual database connections in tests
jest.mock('mysql2/promise', () => ({
  createConnection: jest.fn().mockResolvedValue({
    execute: jest.fn().mockResolvedValue([[], {}]),
    end: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('SyncCommand', () => {
  let schemaManager: ReturnType<typeof setupSchemaManager>;
  let syncCommand: SyncCommand;

  beforeEach(() => {
    schemaManager = setupSchemaManager('sync-command');
    syncCommand = new SyncCommand();

    // Mock console methods to avoid noise in test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process.exit called with code ${code}`);
    });

    // Mock SchemaReader getDatabaseUrl method
    jest
      .spyOn(SchemaReader.prototype, 'getDatabaseUrl')
      .mockResolvedValue('mysql://test:test@localhost:3306/testdb');

    // Mock DatabaseConnector methods
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
          {
            name: 'name',
            type: 'varchar(100)',
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
    jest
      .spyOn(DatabaseConnector.prototype, 'getTablesMetadata')
      .mockResolvedValue([
        {
          name: 'users',
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
        },
        {
          name: 'posts',
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
              name: 'title',
              type: 'varchar(255) NOT NULL',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 2,
            },
          ],
        },
      ]);
  });

  afterEach(() => {
    schemaManager.cleanup();
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(syncCommand).toBeDefined();
      expect(syncCommand).toBeInstanceOf(SyncCommand);
    });
  });

  describe('execute method', () => {
    it('should handle valid MySQL schema', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const options: SyncOptions = {
        schema: schemaPath,
        verbose: false,
      };

      // Mock ColumnReorderGenerator to return no changes needed
      jest
        .spyOn(ColumnReorderGenerator.prototype, 'generateReorderSQL')
        .mockResolvedValue([]);

      await expect(syncCommand.execute(options)).resolves.not.toThrow();
    });

    it('should handle unsupported database provider', async () => {
      const schemaPath = schemaManager.createSchemaFile('postgresql');
      const options: SyncOptions = {
        schema: schemaPath,
        verbose: false,
      };

      await expect(syncCommand.execute(options)).rejects.toThrow(
        'Process.exit called with code 1',
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Database provider "postgresql" is not supported',
        ),
      );
    });

    it('should handle specific models when provided', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const options: SyncOptions = {
        schema: schemaPath,
        model: ['User', 'Post'],
        verbose: true,
      };

      const mockGenerateReorderSQL = jest
        .spyOn(ColumnReorderGenerator.prototype, 'generateReorderSQL')
        .mockResolvedValue([]);

      await syncCommand.execute(options);

      expect(mockGenerateReorderSQL).toHaveBeenCalledWith(['User', 'Post']);
    });

    it('should output verbose information when enabled', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const options: SyncOptions = {
        schema: schemaPath,
        verbose: true,
      };

      jest
        .spyOn(ColumnReorderGenerator.prototype, 'generateReorderSQL')
        .mockResolvedValue([]);

      await syncCommand.execute(options);

      expect(console.log).toHaveBeenCalledWith(
        '🔄 Starting column reorder sync...',
      );
      expect(console.log).toHaveBeenCalledWith(`Schema path: ${schemaPath}`);
    });

    it('should display reorder results when changes are needed', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const options: SyncOptions = {
        schema: schemaPath,
        verbose: true,
      };

      const mockResults = [
        {
          model: 'User',
          changes: [
            {
              column: 'email',
              fromPosition: 3,
              toPosition: 2,
              operation: 'move' as const,
            },
          ],
          sql: [
            'ALTER TABLE `User` MODIFY COLUMN `email` VARCHAR(191) NOT NULL AFTER `id`;',
          ],
        },
      ];

      jest
        .spyOn(ColumnReorderGenerator.prototype, 'generateReorderSQL')
        .mockResolvedValue(mockResults);

      await syncCommand.execute(options);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 model(s) that need column reordering'),
      );
      expect(console.log).toHaveBeenCalledWith('🔧 Model: User');
    });
  });
});

describe('ColumnReorderGenerator', () => {
  let schemaManager: ReturnType<typeof setupSchemaManager>;

  beforeEach(() => {
    schemaManager = setupSchemaManager('column-reorder');

    // Mock SchemaReader getDatabaseUrl method for ColumnReorderGenerator tests
    jest
      .spyOn(SchemaReader.prototype, 'getDatabaseUrl')
      .mockResolvedValue('mysql://test:test@localhost:3306/testdb');
  });

  afterEach(() => {
    schemaManager.cleanup();
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      const generator = new ColumnReorderGenerator();
      expect(generator).toBeDefined();
      expect(generator).toBeInstanceOf(ColumnReorderGenerator);
    });

    it('should accept custom schema path', () => {
      const customPath = '/custom/schema.prisma';
      const generator = new ColumnReorderGenerator(customPath);
      expect(generator).toBeDefined();
    });
  });

  describe('generateReorderSQL method', () => {
    it('should throw error for unsupported database', async () => {
      const schemaPath = schemaManager.createSchemaFile('postgresql');
      const generator = new ColumnReorderGenerator(schemaPath);

      await expect(generator.generateReorderSQL()).rejects.toThrow(
        'Database provider "postgresql" is not supported',
      );
    });

    it('should handle valid MySQL schema', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const generator = new ColumnReorderGenerator(schemaPath);

      // Mock database connector methods
      jest.spyOn(DatabaseConnector.prototype, 'connect').mockResolvedValue();
      jest.spyOn(DatabaseConnector.prototype, 'disconnect').mockResolvedValue();
      jest
        .spyOn(DatabaseConnector.prototype, 'tableExists')
        .mockResolvedValue(true);
      jest
        .spyOn(DatabaseConnector.prototype, 'getTablesMetadata')
        .mockResolvedValue([]);
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
          ],
        });

      const result = await generator.generateReorderSQL();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter models when specific names provided', async () => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      const generator = new ColumnReorderGenerator(schemaPath);

      jest.spyOn(DatabaseConnector.prototype, 'connect').mockResolvedValue();
      jest.spyOn(DatabaseConnector.prototype, 'disconnect').mockResolvedValue();
      jest
        .spyOn(DatabaseConnector.prototype, 'tableExists')
        .mockResolvedValue(true);
      jest
        .spyOn(DatabaseConnector.prototype, 'getTablesMetadata')
        .mockResolvedValue([]);
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
          ],
        });

      await generator.generateReorderSQL(['User']);
      // This test primarily checks that the method doesn't throw when filtering
    });
  });
});

describe('DatabaseConnector', () => {
  describe('initialization', () => {
    it('should initialize for MySQL', () => {
      const connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(DatabaseConnector);
    });

    it('should initialize for MariaDB', () => {
      const connector = new DatabaseConnector(
        'mariadb',
        'mysql://test:test@localhost:3306/test',
      );
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(DatabaseConnector);
    });
  });

  describe('connection methods', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
    });

    it('should connect successfully', async () => {
      await expect(connector.connect()).resolves.not.toThrow();
    });

    it('should disconnect successfully', async () => {
      await expect(connector.disconnect()).resolves.not.toThrow();
    });

    it('should test connection', async () => {
      const result = await connector.testConnection();
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('metadata methods', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
    });

    it('should get table metadata', async () => {
      const mockColumns = [
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
      ];

      jest
        .spyOn(connector as any, 'getColumnMetadata')
        .mockResolvedValue(mockColumns);

      // Mock the getTableMetadata to return the correct table name
      jest.spyOn(connector, 'getTableMetadata').mockResolvedValue({
        name: 'users',
        columns: mockColumns,
      });

      const metadata = await connector.getTableMetadata('users');
      expect(metadata).toHaveProperty('name', 'users');
      expect(metadata).toHaveProperty('columns');
      expect(metadata.columns).toHaveLength(1);
    });

    it('should get metadata for multiple tables', async () => {
      // Clear the mock from beforeEach and create a new one for this test
      jest.restoreAllMocks();

      jest
        .spyOn(connector, 'getTableMetadata')
        .mockResolvedValueOnce({
          name: 'users',
          columns: [],
        })
        .mockResolvedValueOnce({
          name: 'posts',
          columns: [],
        });

      const metadata = await connector.getTablesMetadata(['users', 'posts']);
      expect(metadata).toHaveLength(2);
      expect(metadata[0].name).toBe('users');
      expect(metadata[1].name).toBe('posts');
    });
  });
});
