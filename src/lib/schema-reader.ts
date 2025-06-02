import { getSchema } from '@mrleebo/prisma-ast';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  type PrismaField,
  type PrismaModel,
  type SchemaAnalysis,
  SUPPORTED_PROVIDERS,
  type SupportedProvider,
} from '../types';

// Re-export for convenience
export { SUPPORTED_PROVIDERS } from '../types';

/**
 * Schema reader class for parsing and analyzing Prisma schema files
 */
export class SchemaReader {
  private readonly schemaPath: string;

  constructor(schemaPath?: string) {
    this.schemaPath =
      schemaPath || join(process.cwd(), 'prisma', 'schema.prisma');
  }

  /**
   * Reads and analyzes the Prisma schema file
   */
  public async analyzeSchema(): Promise<SchemaAnalysis> {
    try {
      // Resolve the absolute path to avoid relative path issues
      const absolutePath = resolve(this.schemaPath);
      const schemaContent = readFileSync(absolutePath, 'utf-8');
      const schema = getSchema(schemaContent);

      const errors: string[] = [];

      // Find datasource
      const datasource = schema.list.find((item) => item.type === 'datasource');
      if (!datasource) {
        errors.push('No datasource found in schema');
        return {
          provider: 'unknown',
          models: [],
          isSupported: false,
          errors,
        };
      }

      // Extract provider
      const providerProperty = datasource.assignments?.find(
        (assignment) =>
          assignment.type === 'assignment' && assignment.key === 'provider',
      );

      if (
        !providerProperty ||
        providerProperty.type !== 'assignment' ||
        !providerProperty.value
      ) {
        errors.push('No provider specified in datasource');
        return {
          provider: 'unknown',
          models: [],
          isSupported: false,
          errors,
        };
      }

      const provider = String(providerProperty.value)
        .replace(/"/g, '')
        .toLowerCase();
      const isSupported = SUPPORTED_PROVIDERS.includes(
        provider as SupportedProvider,
      );

      if (!isSupported) {
        errors.push(
          `Provider "${provider}" is not supported. Supported providers: ${SUPPORTED_PROVIDERS.join(
            ', ',
          )}`,
        );
      }

      // Extract models
      const models = schema.list
        .filter((item) => item.type === 'model')
        .map((model) => this.parseModel(model));

      return {
        provider: provider as any, // Return actual provider even if not supported
        models,
        isSupported,
        errors,
      };
    } catch (error) {
      return {
        provider: 'unknown',
        models: [],
        isSupported: false,
        errors: [
          `Failed to read or parse schema: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        ],
      };
    }
  }

  /**
   * Parses a model from the schema AST
   */
  private parseModel(model: any): PrismaModel {
    const fields: PrismaField[] = [];

    if (model.properties) {
      for (const property of model.properties) {
        if (property.type === 'field') {
          const field = this.parseField(property);
          fields.push(field);
        }
      }
    }

    return {
      name: model.name,
      fields,
    };
  }

  /**
   * Parses a field from the model AST
   */
  private parseField(field: any): PrismaField {
    const attributes: string[] = [];
    let isId = false;
    let isUnique = false;
    let hasDefault = false;
    let isRelation = false;

    // Parse attributes
    if (field.attributes) {
      for (const attr of field.attributes) {
        const attrName = attr.name;
        attributes.push(attrName);

        switch (attrName) {
          case 'id':
            isId = true;
            break;
          case 'unique':
            isUnique = true;
            break;
          case 'default':
            hasDefault = true;
            break;
          case 'relation':
            isRelation = true;
            break;
        }
      }
    }

    // Check if field type indicates a relation (starts with uppercase and not a primitive type)
    const fieldType = field.fieldType || '';
    const primitiveTypes = [
      'String',
      'Int',
      'Float',
      'Boolean',
      'DateTime',
      'Json',
      'Bytes',
      'Decimal',
      'BigInt',
    ];

    // If it's an array type, check the base type
    const baseType = fieldType.replace('[]', '');

    if (
      baseType.match(/^[A-Z]/) &&
      !primitiveTypes.includes(baseType) &&
      !isRelation
    ) {
      isRelation = true;
    }

    return {
      name: field.name,
      type: fieldType,
      isOptional: field.optional || false,
      isId,
      isUnique,
      hasDefault,
      isRelation,
      attributes,
    };
  }

  /**
   * Gets model names from the schema
   */
  public async getModelNames(): Promise<string[]> {
    const analysis = await this.analyzeSchema();
    return analysis.models.map((model) => model.name);
  }

  /**
   * Gets field order for a specific model
   */
  public async getModelFieldOrder(modelName: string): Promise<string[]> {
    const analysis = await this.analyzeSchema();
    const model = analysis.models.find((m) => m.name === modelName);

    if (!model) {
      throw new Error(`Model "${modelName}" not found in schema`);
    }

    // Return only non-relation fields as those are the ones that have columns in the database
    return model.fields
      .filter((field) => !field.isRelation)
      .map((field) => field.name);
  }

  /**
   * Validates if the current schema uses a supported database
   */
  public async validateSupportedDatabase(): Promise<{
    isSupported: boolean;
    provider: string;
    errors: string[];
  }> {
    const analysis = await this.analyzeSchema();

    return {
      isSupported: analysis.isSupported,
      provider: analysis.provider,
      errors: analysis.errors,
    };
  }

  /**
   * Gets complete schema analysis
   */
  public async getSchemaAnalysis(): Promise<SchemaAnalysis> {
    return this.analyzeSchema();
  }

  /**
   * Get the actual table name for a model (considering @@map directive)
   */
  public async getTableName(modelName: string): Promise<string> {
    try {
      const absolutePath = resolve(this.schemaPath);
      const schemaContent = readFileSync(absolutePath, 'utf-8');
      const schema = getSchema(schemaContent);

      const model = schema.list.find(
        (item) => item.type === 'model' && item.name === modelName,
      ) as any;

      if (!model) {
        throw new Error(`Model "${modelName}" not found in schema`);
      }

      // Look for @@map attribute
      if (model.properties) {
        for (const property of model.properties) {
          if (property.type === 'blockAttribute' && property.name === 'map') {
            // Extract the table name from @@map("table_name")
            if (property.args && property.args.length > 0) {
              const mapValue = property.args[0];
              if (typeof mapValue === 'string') {
                return mapValue.replace(/"/g, ''); // Remove quotes
              }
            }
          }
        }
      }

      // If no @@map found, return the model name
      return modelName;
    } catch (error) {
      // If we can't read the schema, fall back to model name
      return modelName;
    }
  }

  /**
   * Get field to column name mapping for a model (considering @map directives)
   */
  public async getFieldColumnMapping(
    modelName: string,
  ): Promise<Map<string, string>> {
    const mapping = new Map<string, string>();

    try {
      const absolutePath = resolve(this.schemaPath);
      const schemaContent = readFileSync(absolutePath, 'utf-8');
      const schema = getSchema(schemaContent);

      const model = schema.list.find(
        (item) => item.type === 'model' && item.name === modelName,
      ) as any;

      if (!model || !model.properties) {
        return mapping;
      }

      for (const property of model.properties) {
        if (property.type === 'field') {
          const fieldName = property.name;
          let columnName = fieldName; // Default to field name

          // Look for @map attribute on the field
          if (property.attributes) {
            for (const attr of property.attributes) {
              if (attr.name === 'map') {
                if (attr.args && attr.args.length > 0) {
                  const mapValue = attr.args[0];
                  if (typeof mapValue === 'string') {
                    columnName = mapValue.replace(/"/g, ''); // Remove quotes
                  }
                }
                break;
              }
            }
          }

          mapping.set(fieldName, columnName);
        }
      }
    } catch (error) {
      // If we can't read the schema, return empty mapping (will fall back to field names)
    }

    return mapping;
  }
}
