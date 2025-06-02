import { DatabaseConnector } from '../lib/database-connector';

// Mock PrismaClient to avoid actual database connections in tests
const mockPrismaClient = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrismaClient),
}));

describe('DatabaseConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with MySQL provider', () => {
      const connector = new DatabaseConnector('mysql');
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(DatabaseConnector);
    });

    it('should initialize with MariaDB provider', () => {
      const connector = new DatabaseConnector('mariadb');
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(DatabaseConnector);
    });
  });

  describe('connection management', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector('mysql');
    });

    it('should connect to database', async () => {
      await connector.connect();
      expect(mockPrismaClient.$connect).toHaveBeenCalledTimes(1);
    });

    it('should disconnect from database', async () => {
      await connector.disconnect();
      expect(mockPrismaClient.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('should test connection successfully', async () => {
      const result = await connector.testConnection();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockPrismaClient.$queryRaw).toHaveBeenCalled();
    });

    it('should handle connection test failure', async () => {
      const errorMessage = 'Connection failed';
      mockPrismaClient.$queryRaw.mockRejectedValue(new Error(errorMessage));

      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe('metadata retrieval', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector('mysql');
    });

    describe('getTableMetadata', () => {
      it('should retrieve table metadata for MySQL', async () => {
        const mockColumns = [
          {
            columnName: 'id',
            dataType: 'int',
            columnType: 'int(11)',
            isNullable: 'NO',
            columnDefault: null,
            extra: 'auto_increment',
            columnKey: 'PRI',
            ordinalPosition: 1,
          },
          {
            columnName: 'email',
            dataType: 'varchar',
            columnType: 'varchar(255)',
            isNullable: 'NO',
            columnDefault: null,
            extra: '',
            columnKey: 'UNI',
            ordinalPosition: 2,
          },
          {
            columnName: 'name',
            dataType: 'varchar',
            columnType: 'varchar(100)',
            isNullable: 'YES',
            columnDefault: null,
            extra: '',
            columnKey: '',
            ordinalPosition: 3,
          },
        ];

        mockPrismaClient.$queryRawUnsafe.mockResolvedValue(mockColumns);

        const metadata = await connector.getTableMetadata('users');

        expect(metadata.name).toBe('users');
        expect(metadata.columns).toHaveLength(3);

        // Check first column (id)
        expect(metadata.columns[0]).toMatchObject({
          name: 'id',
          type: 'int(11) NOT NULL AUTO_INCREMENT',
          nullable: false,
          isAutoIncrement: true,
          isPrimaryKey: true,
          isUnique: false,
          position: 1,
        });

        // Check second column (email)
        expect(metadata.columns[1]).toMatchObject({
          name: 'email',
          type: 'varchar(255) NOT NULL',
          nullable: false,
          isAutoIncrement: false,
          isPrimaryKey: false,
          isUnique: true,
          position: 2,
        });

        // Check third column (name)
        expect(metadata.columns[2]).toMatchObject({
          name: 'name',
          type: 'varchar(100)',
          nullable: true,
          isAutoIncrement: false,
          isPrimaryKey: false,
          isUnique: false,
          position: 3,
        });
      });

      it('should sort columns by position', async () => {
        const mockColumns = [
          {
            columnName: 'name',
            dataType: 'varchar',
            columnType: 'varchar(255)',
            isNullable: 'YES',
            columnDefault: null,
            extra: '',
            columnKey: '',
            ordinalPosition: 3,
          },
          {
            columnName: 'id',
            dataType: 'int',
            columnType: 'int(11)',
            isNullable: 'NO',
            columnDefault: null,
            extra: 'auto_increment',
            columnKey: 'PRI',
            ordinalPosition: 1,
          },
          {
            columnName: 'email',
            dataType: 'varchar',
            columnType: 'varchar(255)',
            isNullable: 'NO',
            columnDefault: null,
            extra: '',
            columnKey: 'UNI',
            ordinalPosition: 2,
          },
        ];

        mockPrismaClient.$queryRawUnsafe.mockResolvedValue(mockColumns);

        const metadata = await connector.getTableMetadata('users');

        expect(metadata.columns[0].name).toBe('id');
        expect(metadata.columns[0].position).toBe(1);
        expect(metadata.columns[1].name).toBe('email');
        expect(metadata.columns[1].position).toBe(2);
        expect(metadata.columns[2].name).toBe('name');
        expect(metadata.columns[2].position).toBe(3);
      });
    });

    describe('getTablesMetadata', () => {
      it('should retrieve metadata for multiple tables', async () => {
        const usersColumns = [
          {
            columnName: 'id',
            dataType: 'int',
            columnType: 'int(11)',
            isNullable: 'NO',
            columnDefault: null,
            extra: 'auto_increment',
            columnKey: 'PRI',
            ordinalPosition: 1,
          },
        ];

        const postsColumns = [
          {
            columnName: 'id',
            dataType: 'int',
            columnType: 'int(11)',
            isNullable: 'NO',
            columnDefault: null,
            extra: 'auto_increment',
            columnKey: 'PRI',
            ordinalPosition: 1,
          },
          {
            columnName: 'title',
            dataType: 'varchar',
            columnType: 'varchar(255)',
            isNullable: 'NO',
            columnDefault: null,
            extra: '',
            columnKey: '',
            ordinalPosition: 2,
          },
        ];

        mockPrismaClient.$queryRawUnsafe
          .mockResolvedValueOnce(usersColumns)
          .mockResolvedValueOnce(postsColumns);

        const metadata = await connector.getTablesMetadata(['users', 'posts']);

        expect(metadata).toHaveLength(2);
        expect(metadata[0].name).toBe('users');
        expect(metadata[0].columns).toHaveLength(1);
        expect(metadata[1].name).toBe('posts');
        expect(metadata[1].columns).toHaveLength(2);
      });

      it('should handle empty table list', async () => {
        const metadata = await connector.getTablesMetadata([]);
        expect(metadata).toHaveLength(0);
      });
    });

    describe('column type mapping', () => {
      it('should handle various MySQL column types', async () => {
        const mockColumns = [
          {
            columnName: 'int_field',
            dataType: 'int',
            columnType: 'int(11)',
            isNullable: 'NO',
            columnDefault: null,
            extra: '',
            columnKey: '',
            ordinalPosition: 1,
          },
          {
            columnName: 'varchar_field',
            dataType: 'varchar',
            columnType: 'varchar(255)',
            isNullable: 'YES',
            columnDefault: 'default_value',
            extra: '',
            columnKey: '',
            ordinalPosition: 2,
          },
          {
            columnName: 'text_field',
            dataType: 'text',
            columnType: 'text',
            isNullable: 'YES',
            columnDefault: null,
            extra: '',
            columnKey: '',
            ordinalPosition: 3,
          },
          {
            columnName: 'datetime_field',
            dataType: 'datetime',
            columnType: 'datetime',
            isNullable: 'NO',
            columnDefault: 'CURRENT_TIMESTAMP',
            extra: 'DEFAULT_GENERATED',
            columnKey: '',
            ordinalPosition: 4,
          },
        ];

        mockPrismaClient.$queryRawUnsafe.mockResolvedValue(mockColumns);

        const metadata = await connector.getTableMetadata('test_table');

        expect(metadata.columns[0].type).toBe('int(11) NOT NULL');
        expect(metadata.columns[1].type).toBe(
          "varchar(255) DEFAULT 'default_value'",
        );
        expect(metadata.columns[1].defaultValue).toBe('default_value');
        expect(metadata.columns[2].type).toBe('text');
        expect(metadata.columns[3].type).toBe(
          'datetime NOT NULL DEFAULT CURRENT_TIMESTAMP DEFAULT_GENERATED',
        );
        expect(metadata.columns[3].defaultValue).toBe('CURRENT_TIMESTAMP');
      });
    });
  });

  describe('SQL execution', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector('mysql');
    });

    it('should execute raw SQL statements', async () => {
      const sql = 'ALTER TABLE users ADD COLUMN test VARCHAR(255)';
      mockPrismaClient.$executeRawUnsafe.mockResolvedValue(1);

      const result = await connector.executeRaw(sql);

      expect(mockPrismaClient.$executeRawUnsafe).toHaveBeenCalledWith(sql);
      expect(result).toBe(1);
    });

    it('should handle SQL execution errors', async () => {
      const sql = 'INVALID SQL STATEMENT';
      const error = new Error('SQL syntax error');
      mockPrismaClient.$executeRawUnsafe.mockRejectedValue(error);

      await expect(connector.executeRaw(sql)).rejects.toThrow(
        'SQL syntax error',
      );
    });
  });

  describe('error handling', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector('mysql');
    });

    it('should handle database connection errors', async () => {
      const error = new Error('Connection timeout');
      mockPrismaClient.$connect.mockRejectedValue(error);

      await expect(connector.connect()).rejects.toThrow('Connection timeout');
    });

    it('should handle query errors gracefully', async () => {
      const error = new Error('Table does not exist');
      mockPrismaClient.$queryRawUnsafe.mockRejectedValue(error);

      await expect(connector.getTableMetadata('nonexistent')).rejects.toThrow(
        'Table does not exist',
      );
    });
  });

  describe('provider-specific behavior', () => {
    it('should use MySQL-specific queries for mysql provider', async () => {
      const connector = new DatabaseConnector('mysql');
      mockPrismaClient.$queryRawUnsafe.mockResolvedValue([]);

      await connector.getTableMetadata('test_table');

      expect(mockPrismaClient.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'),
        'test_table',
      );
    });

    it('should use MySQL-specific queries for mariadb provider', async () => {
      const connector = new DatabaseConnector('mariadb');
      mockPrismaClient.$queryRawUnsafe.mockResolvedValue([]);

      await connector.getTableMetadata('test_table');

      expect(mockPrismaClient.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'),
        'test_table',
      );
    });
  });
});
