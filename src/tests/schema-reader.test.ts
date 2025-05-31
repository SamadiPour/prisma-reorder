import { SchemaReader } from '../lib/schema-reader';
import { join } from 'path';

describe('SchemaReader', () => {
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
    const analysis = await testSchema(
      join(process.cwd(), 'prisma', 'schema.prisma'),
      'mysql',
      true,
    );
    expect(analysis.errors).toHaveLength(0);
  });

  it('should handle PostgreSQL schema as unsupported', async () => {
    const analysis = await testSchema(
      join(process.cwd(), 'prisma', 'postgres-schema.prisma'),
      'postgresql',
      false,
    );
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
    const schemaReader = new SchemaReader(
      join(process.cwd(), 'prisma', 'schema.prisma'),
    );
    const modelNames = await schemaReader.getModelNames();

    expect(Array.isArray(modelNames)).toBeTruthy();
  });

  it('should retrieve field order for existing model', async () => {
    const schemaReader = new SchemaReader(
      join(process.cwd(), 'prisma', 'schema.prisma'),
    );

    // Assuming 'User' model exists in the schema
    await expect(
      schemaReader.getModelFieldOrder('User'),
    ).resolves.toBeDefined();
  });

  it('should throw error for non-existent model field order', async () => {
    const schemaReader = new SchemaReader(
      join(process.cwd(), 'prisma', 'schema.prisma'),
    );

    await expect(
      schemaReader.getModelFieldOrder('NonExistentModel'),
    ).rejects.toThrow();
  });
});
