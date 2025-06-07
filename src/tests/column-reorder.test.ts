import { ColumnReorderGenerator } from '../lib/column-reorder';
import { SchemaReader } from '../lib/schema-reader';
import { DatabaseConnector } from '../lib/database-connector';
import { setupSchemaManager } from './utils/t_schema_manager';

// Mock dependencies
jest.mock('../lib/database-connector');
jest.mock('../lib/schema-reader');

const MockedDatabaseConnector = DatabaseConnector as jest.MockedClass<
  typeof DatabaseConnector
>;
const MockedSchemaReader = SchemaReader as jest.MockedClass<
  typeof SchemaReader
>;

describe('ColumnReorderGenerator', () => {
  let schemaManager: ReturnType<typeof setupSchemaManager>;
  let generator: ColumnReorderGenerator;

  beforeEach(() => {
    schemaManager = setupSchemaManager('column-reorder-generator');
    jest.clearAllMocks();
  });

  afterEach(() => {
    schemaManager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default schema path', () => {
      generator = new ColumnReorderGenerator();
      expect(generator).toBeDefined();
      expect(generator).toBeInstanceOf(ColumnReorderGenerator);
    });

    it('should initialize with custom schema path', () => {
      const customPath = '/custom/schema.prisma';
      generator = new ColumnReorderGenerator(customPath);
      expect(generator).toBeDefined();
    });
  });

  describe('generateReorderSQL', () => {
    beforeEach(() => {
      const schemaPath = schemaManager.createSchemaFile('mysql');
      generator = new ColumnReorderGenerator(schemaPath);
    });

    it('should throw error for unsupported database provider', async () => {
      // Mock schema analysis to return unsupported provider
      const mockSchemaReader = new MockedSchemaReader();
      mockSchemaReader.getSchemaAnalysis = jest.fn().mockResolvedValue({
        provider: 'postgresql',
        models: [],
        isSupported: false,
        errors: [],
      });

      // Replace the schema reader instance
      (generator as any).schemaReader = mockSchemaReader;

      await expect(generator.generateReorderSQL()).rejects.toThrow(
        'Database provider "postgresql" is not supported for column reordering',
      );
    });

    it('should handle empty models list', async () => {
      // Mock schema analysis
      const mockSchemaReader = new MockedSchemaReader();
      mockSchemaReader.getSchemaAnalysis = jest.fn().mockResolvedValue({
        provider: 'mysql',
        models: [],
        isSupported: true,
        errors: [],
      });

      // Mock database connector
      const mockDbConnector = new MockedDatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      mockDbConnector.connect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.disconnect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.getTablesMetadata = jest.fn().mockResolvedValue([]);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      const result = await generator.generateReorderSQL();

      expect(result).toEqual([]);
      expect(mockDbConnector.connect).toHaveBeenCalled();
      expect(mockDbConnector.disconnect).toHaveBeenCalled();
    });

    it('should generate reorder SQL when columns are out of order', async () => {
      // Mock schema analysis with User model
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
            ],
          },
        ],
        isSupported: true,
        errors: [],
      });

      // Mock getTableName and getFieldColumnMapping
      mockSchemaReader.getTableName = jest.fn().mockResolvedValue('User');
      mockSchemaReader.getModelFieldOrder = jest
        .fn()
        .mockResolvedValue(['id', 'email', 'name', 'createdAt']);
      mockSchemaReader.getFieldColumnMapping = jest.fn().mockResolvedValue(
        new Map([
          ['id', 'id'],
          ['email', 'email'],
          ['name', 'name'],
          ['createdAt', 'createdAt'],
        ]),
      );

      // Mock database connector with tableExists
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
            name: 'email',
            type: 'varchar',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: true,
            extra: '',
            position: 3,
          },
          {
            name: 'name',
            type: 'varchar',
            nullable: true,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: false,
            extra: '',
            position: 4,
          },
        ],
      });
      mockDbConnector.getTablesMetadata = jest.fn().mockResolvedValue([
        {
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
              name: 'email',
              type: 'varchar',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: true,
              extra: '',
              position: 3,
            },
            {
              name: 'name',
              type: 'varchar',
              nullable: true,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 4,
            },
          ],
        },
      ]);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      const result = await generator.generateReorderSQL();

      expect(result).toHaveLength(1);
      expect(result[0].model).toBe('User');
      expect(result[0].changes).toHaveLength(3); // email, name, and createdAt need to move
      expect(result[0].sql).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ALTER TABLE'),
          expect.stringContaining('MODIFY COLUMN'),
        ]),
      );
    });

    it('should return empty array when columns are already in correct order', async () => {
      // Mock schema analysis
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

      // Mock getTableName and getFieldColumnMapping
      mockSchemaReader.getTableName = jest.fn().mockResolvedValue('User');
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

      // Mock database connector with columns in correct order
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
            type: 'varchar',
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
            type: 'varchar',
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
      mockDbConnector.getTablesMetadata = jest.fn().mockResolvedValue([
        {
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
              type: 'varchar',
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
              type: 'varchar',
              nullable: true,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 3,
            },
          ],
        },
      ]);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      const result = await generator.generateReorderSQL();

      expect(result).toEqual([]);
    });

    it('should filter models when specific model names provided', async () => {
      // Mock schema analysis with multiple models
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
            ],
          },
        ],
        isSupported: true,
        errors: [],
      });

      // Mock getTableName and getFieldColumnMapping
      mockSchemaReader.getTableName = jest.fn().mockResolvedValue('User');
      mockSchemaReader.getModelFieldOrder = jest
        .fn()
        .mockResolvedValue(['id', 'email']);
      mockSchemaReader.getFieldColumnMapping = jest.fn().mockResolvedValue(
        new Map([
          ['id', 'id'],
          ['email', 'email'],
        ]),
      );

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
            type: 'varchar',
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
      mockDbConnector.getTablesMetadata = jest.fn().mockResolvedValue([
        {
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
              type: 'varchar',
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
      ]);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      await generator.generateReorderSQL(['User']);

      // Verify that User table existence was checked
      expect(mockDbConnector.tableExists).toHaveBeenCalledWith('User');
    });

    it('should throw error for non-existent model names', async () => {
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
            ],
          },
        ],
        isSupported: true,
        errors: [],
      });

      const mockDbConnector = new MockedDatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      mockDbConnector.connect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.disconnect = jest.fn().mockResolvedValue(undefined);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      await expect(
        generator.generateReorderSQL(['NonExistentModel']),
      ).rejects.toThrow('Models not found in schema: NonExistentModel');
    });

    it('should handle database connection errors gracefully', async () => {
      const mockSchemaReader = new MockedSchemaReader();
      mockSchemaReader.getSchemaAnalysis = jest.fn().mockResolvedValue({
        provider: 'mysql',
        models: [],
        isSupported: true,
        errors: [],
      });

      const mockDbConnector = new MockedDatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      mockDbConnector.connect = jest
        .fn()
        .mockRejectedValue(new Error('Connection failed'));
      mockDbConnector.disconnect = jest.fn().mockResolvedValue(undefined);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      await expect(generator.generateReorderSQL()).rejects.toThrow(
        'Connection failed',
      );
      expect(mockDbConnector.disconnect).toHaveBeenCalled(); // Should still disconnect on error
    });

    it('should generate correct MySQL MODIFY COLUMN syntax', async () => {
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

      // Mock getTableName and getFieldColumnMapping
      mockSchemaReader.getTableName = jest.fn().mockResolvedValue('User');
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
            name: 'name',
            type: 'varchar',
            nullable: true,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: false,
            extra: '',
            position: 2,
          },
          {
            name: 'email',
            type: 'varchar',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: true,
            extra: '',
            position: 3,
          },
        ],
      });
      mockDbConnector.getTablesMetadata = jest.fn().mockResolvedValue([
        {
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
              name: 'name',
              type: 'varchar',
              nullable: true,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: false,
              extra: '',
              position: 2,
            },
            {
              name: 'email',
              type: 'varchar',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: true,
              extra: '',
              position: 3,
            },
          ],
        },
      ]);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      const result = await generator.generateReorderSQL();

      expect(result).toHaveLength(1);
      expect(result[0].sql).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ALTER TABLE `User`'),
          expect.stringContaining('MODIFY COLUMN `email`'),
          expect.stringContaining('AFTER `id`'),
          expect.stringContaining('MODIFY COLUMN `name`'),
          expect.stringContaining('AFTER `email`'),
        ]),
      );
    });

    it('should handle MariaDB provider with same logic as MySQL', async () => {
      const mockSchemaReader = new MockedSchemaReader();
      mockSchemaReader.getSchemaAnalysis = jest.fn().mockResolvedValue({
        provider: 'mariadb',
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
            ],
          },
        ],
        isSupported: true,
        errors: [],
      });

      // Mock getTableName and getFieldColumnMapping
      mockSchemaReader.getTableName = jest.fn().mockResolvedValue('User');
      mockSchemaReader.getModelFieldOrder = jest
        .fn()
        .mockResolvedValue(['id', 'email']);
      mockSchemaReader.getFieldColumnMapping = jest.fn().mockResolvedValue(
        new Map([
          ['id', 'id'],
          ['email', 'email'],
        ]),
      );

      const mockDbConnector = new MockedDatabaseConnector(
        'mariadb',
        'mysql://test:test@localhost:3306/test',
      );
      mockDbConnector.connect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.disconnect = jest.fn().mockResolvedValue(undefined);
      mockDbConnector.tableExists = jest.fn().mockResolvedValue(true);
      mockDbConnector.getTableMetadata = jest.fn().mockResolvedValue({
        name: 'User',
        columns: [
          {
            name: 'email',
            type: 'varchar',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: true,
            extra: '',
            position: 1,
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
            position: 2,
          },
        ],
      });
      mockDbConnector.getTablesMetadata = jest.fn().mockResolvedValue([
        {
          name: 'User',
          columns: [
            {
              name: 'email',
              type: 'varchar',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: true,
              extra: '',
              position: 1,
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
              position: 2,
            },
          ],
        },
      ]);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      const result = await generator.generateReorderSQL();

      expect(result).toHaveLength(1);
      expect(result[0].model).toBe('User');
      expect(result[0].sql).toEqual(
        expect.arrayContaining([expect.stringContaining('ALTER TABLE `User`')]),
      );
    });
  });

  describe('column comparison logic', () => {
    it('should ignore relation fields when comparing', async () => {
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
                name: 'posts',
                type: 'Post',
                isOptional: false,
                isId: false,
                isUnique: false,
                hasDefault: false,
                isRelation: true,
                attributes: [],
              }, // Relation field
            ],
          },
        ],
        isSupported: true,
        errors: [],
      });

      // Mock getTableName and getFieldColumnMapping
      mockSchemaReader.getTableName = jest.fn().mockResolvedValue('User');
      mockSchemaReader.getModelFieldOrder = jest
        .fn()
        .mockResolvedValue(['id', 'email', 'posts']);
      mockSchemaReader.getFieldColumnMapping = jest.fn().mockResolvedValue(
        new Map([
          ['id', 'id'],
          ['email', 'email'],
          // Note: posts is a relation field so it won't have a column mapping
        ]),
      );

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
            type: 'varchar',
            nullable: false,
            defaultValue: null,
            isAutoIncrement: false,
            isPrimaryKey: false,
            isUnique: true,
            extra: '',
            position: 2,
          },
          // Note: posts relation field should not appear in database columns
        ],
      });
      mockDbConnector.getTablesMetadata = jest.fn().mockResolvedValue([
        {
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
              type: 'varchar',
              nullable: false,
              defaultValue: null,
              isAutoIncrement: false,
              isPrimaryKey: false,
              isUnique: true,
              extra: '',
              position: 2,
            },
            // Note: posts relation field should not appear in database columns
          ],
        },
      ]);

      MockedDatabaseConnector.mockImplementation(() => mockDbConnector);
      (generator as any).schemaReader = mockSchemaReader;

      const result = await generator.generateReorderSQL();

      // Should not require any changes since relation fields are ignored
      expect(result).toEqual([]);
    });
  });
});
