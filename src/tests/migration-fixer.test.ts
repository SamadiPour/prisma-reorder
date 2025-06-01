import { MigrationFixer } from '../lib/migration-fixer';

describe('MigrationFixer', () => {
  describe('extractAddColumnInfo', () => {
    it('should extract ADD COLUMN statements correctly', () => {
      const fixer = new MigrationFixer();

      // @formatter:off
      // prettier-ignore
      const sql = `
        ALTER TABLE \`User\` ADD COLUMN \`newField\` VARCHAR(255) NOT NULL;
        ALTER TABLE posts ADD COLUMN status ENUM('draft', 'published') DEFAULT 'draft';
        ALTER TABLE \`Profile\` ADD COLUMN \`avatar\` TEXT,
                                 ADD COLUMN \`bio\` TEXT;
      `;
      // @formatter:on

      // Access private method for testing (using type assertion)
      const extractMethod = (fixer as any).extractAddColumnInfo.bind(fixer);
      const results = extractMethod(sql);

      expect(results).toHaveLength(4);
      expect(results[0]).toMatchObject({
        tableName: 'User',
        columnName: 'newField',
        definition: 'VARCHAR(255) NOT NULL',
      });
      expect(results[1]).toMatchObject({
        tableName: 'posts',
        columnName: 'status',
        definition: "ENUM('draft', 'published') DEFAULT 'draft'",
      });
      expect(results[2]).toMatchObject({
        tableName: 'Profile',
        columnName: 'avatar',
        definition: 'TEXT',
      });
      expect(results[3]).toMatchObject({
        tableName: 'Profile',
        columnName: 'bio',
        definition: 'TEXT',
      });
    });
  });

  describe('fixMigrationSql', () => {
    function mockSchemaReader(
      fixer: any,
      analysis: any,
      validateMap: Record<string, any>,
    ) {
      // Mock getSchemaAnalysis
      fixer.schemaReader.getSchemaAnalysis = jest
        .fn()
        .mockResolvedValue(analysis);
      // Mock validateColumn
      fixer.validateColumn = jest.fn((table: string, column: string) => {
        const key = `${table}.${column}`;
        return Promise.resolve(validateMap[key] || { exists: false });
      });
    }

    it('should fix ADD COLUMN statements with correct positioning', async () => {
      // @formatter:off
      // prettier-ignore
      const sql = `ALTER TABLE \`User\` ADD COLUMN \`newField\` VARCHAR(255) NOT NULL;`;
      // @formatter:on
      const fixer = new MigrationFixer();
      const analysis = {
        isSupported: true,
        provider: 'mysql',
        models: [
          {
            name: 'User',
            fields: [
              { name: 'id', isRelation: false },
              { name: 'email', isRelation: false },
              { name: 'name', isRelation: false },
              { name: 'newField', isRelation: false },
              { name: 'createdAt', isRelation: false },
            ],
          },
        ],
      };
      // newField should be after 'name' (index 3)
      const validateMap = {
        'User.newField': { exists: true, position: 3, afterColumn: 'name' },
      };
      mockSchemaReader(fixer as any, analysis, validateMap);
      const result = await (fixer as any).fixMigrationSql(sql);
      expect(result.sql).toContain('AFTER `name`');
      expect(result.changes[0]).toMatch(/Fixed column position/);
    });

    it('should not modify columns that are already in the correct position (last)', async () => {
      // @formatter:off
      // prettier-ignore
      const sql = `ALTER TABLE \`User\` ADD COLUMN \`createdAt\` DATETIME NOT NULL;`;
      // @formatter:on
      const fixer = new MigrationFixer();
      const analysis = {
        isSupported: true,
        provider: 'mysql',
        models: [
          {
            name: 'User',
            fields: [
              { name: 'id', isRelation: false },
              { name: 'email', isRelation: false },
              { name: 'createdAt', isRelation: false },
            ],
          },
        ],
      };
      // createdAt is last (index 2)
      const validateMap = {
        'User.createdAt': { exists: true, position: 2, afterColumn: 'email' },
      };
      mockSchemaReader(fixer as any, analysis, validateMap);
      const result = await (fixer as any).fixMigrationSql(sql);
      // Should return null (no changes needed)
      expect(result).toBeNull();
    });

    it('should handle FIRST positioning correctly', async () => {
      // @formatter:off
      // prettier-ignore
      const sql = `ALTER TABLE \`User\` ADD COLUMN \`id\` INT NOT NULL;`;
      // @formatter:on
      const fixer = new MigrationFixer();
      const analysis = {
        isSupported: true,
        provider: 'mysql',
        models: [
          {
            name: 'User',
            fields: [
              { name: 'id', isRelation: false },
              { name: 'email', isRelation: false },
              { name: 'name', isRelation: false },
            ],
          },
        ],
      };
      // id is first (index 0)
      const validateMap = {
        'User.id': { exists: true, position: 0, afterColumn: undefined },
      };
      mockSchemaReader(fixer as any, analysis, validateMap);
      const result = await (fixer as any).fixMigrationSql(sql);
      expect(result.sql).toContain('FIRST');
      expect(result.changes[0]).toMatch(/FIRST/);
    });
  });
});
