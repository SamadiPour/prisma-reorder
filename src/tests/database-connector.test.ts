import { DatabaseConnector } from '../lib/database-connector';
import mysql from 'mysql2/promise';

// Mock mysql2 to avoid actual database connections in tests
const mockConnection = {
  execute: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};

jest.mock('mysql2/promise', () => ({
  createConnection: jest.fn(),
}));

const mockMysql = mysql as jest.Mocked<typeof mysql>;

describe('DatabaseConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up the mock to return our mock connection
    mockMysql.createConnection.mockResolvedValue(mockConnection as any);
  });

  describe('initialization', () => {
    it('should initialize with MySQL provider', () => {
      const connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(DatabaseConnector);
    });

    it('should initialize with MariaDB provider', () => {
      const connector = new DatabaseConnector(
        'mariadb',
        'mysql://test:test@localhost:3306/test',
      );
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(DatabaseConnector);
    });
  });

  describe('connection management', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
    });

    it('should connect to database', async () => {
      await connector.connect();
      expect(mockMysql.createConnection).toHaveBeenCalledTimes(1);
    });

    it('should disconnect from database', async () => {
      await connector.connect();
      await connector.disconnect();
      expect(mockConnection.end).toHaveBeenCalledTimes(1);
    });

    it('should test connection successfully', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const result = await connector.testConnection();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockConnection.execute).toHaveBeenCalledWith('SELECT 1 as test');
    });

    it('should handle connection test failure', async () => {
      const errorMessage = 'Connection failed';
      mockConnection.execute.mockRejectedValue(new Error(errorMessage));

      const result = await connector.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe('metadata retrieval', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
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

        mockConnection.execute.mockResolvedValue([mockColumns]);

        await connector.connect();
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

        mockConnection.execute.mockResolvedValue([mockColumns]);

        await connector.connect();
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

        mockConnection.execute
          .mockResolvedValueOnce([usersColumns])
          .mockResolvedValueOnce([postsColumns]);

        await connector.connect();
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

        mockConnection.execute.mockResolvedValue([mockColumns]);

        await connector.connect();
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
      connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
    });

    it('should execute raw SQL statements', async () => {
      const sql = 'ALTER TABLE users ADD COLUMN test VARCHAR(255)';
      mockConnection.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await connector.connect();
      const result = await connector.executeRaw(sql);

      expect(mockConnection.execute).toHaveBeenCalledWith(sql);
      expect(result).toEqual({ affectedRows: 1 });
    });

    it('should handle SQL execution errors', async () => {
      const sql = 'INVALID SQL STATEMENT';
      const error = new Error('SQL syntax error');
      mockConnection.execute.mockRejectedValue(error);

      await connector.connect();
      await expect(connector.executeRaw(sql)).rejects.toThrow(
        'SQL syntax error',
      );
    });
  });

  describe('error handling', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
    });

    it('should handle database connection errors', async () => {
      const error = new Error('Connection timeout');
      mockMysql.createConnection.mockRejectedValue(error);

      await expect(connector.connect()).rejects.toThrow('Connection timeout');
    });

    it('should handle query errors gracefully', async () => {
      const error = new Error('Table does not exist');
      mockConnection.execute.mockRejectedValue(error);

      await connector.connect();
      await expect(connector.getTableMetadata('nonexistent')).rejects.toThrow(
        'Table does not exist',
      );
    });
  });

  describe('provider-specific behavior', () => {
    it('should use MySQL-specific queries for mysql provider', async () => {
      const connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
      mockConnection.execute.mockResolvedValue([[]]);

      await connector.connect();
      await connector.getTableMetadata('test_table');

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'),
        ['test_table'],
      );
    });

    it('should use MySQL-specific queries for mariadb provider', async () => {
      const connector = new DatabaseConnector(
        'mariadb',
        'mysql://test:test@localhost:3306/test',
      );
      mockConnection.execute.mockResolvedValue([[]]);

      await connector.connect();
      await connector.getTableMetadata('test_table');

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'),
        ['test_table'],
      );
    });
  });

  describe('table existence check', () => {
    let connector: DatabaseConnector;

    beforeEach(() => {
      connector = new DatabaseConnector(
        'mysql',
        'mysql://test:test@localhost:3306/test',
      );
    });

    it('should return true for existing table', async () => {
      mockConnection.execute.mockResolvedValue([[{ TABLE_NAME: 'users' }]]);

      await connector.connect();
      const exists = await connector.tableExists('users');

      expect(exists).toBe(true);
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('INFORMATION_SCHEMA.TABLES'),
        ['users'],
      );
    });

    it('should return false for non-existing table', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const exists = await connector.tableExists('nonexistent');

      expect(exists).toBe(false);
    });

    it('should return false on query error', async () => {
      mockConnection.execute.mockRejectedValue(new Error('Query error'));

      const exists = await connector.tableExists('test');

      expect(exists).toBe(false);
    });
  });
});
