/**
 * Type definitions for Prisma Column Order Manager
 */

/**
 * Supported database providers for column reordering
 */
export const SUPPORTED_PROVIDERS = ['mysql', 'mariadb'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Represents a field in a Prisma model
 */
export interface PrismaField {
  name: string;
  type: string;
  isOptional: boolean;
  isId: boolean;
  isUnique: boolean;
  hasDefault: boolean;
  isRelation: boolean;
  attributes: string[];
}

/**
 * Represents a Prisma model with its fields
 */
export interface PrismaModel {
  name: string;
  fields: PrismaField[];
}

/**
 * Schema analysis result
 */
export interface SchemaAnalysis {
  provider: string;
  models: PrismaModel[];
  isSupported: boolean;
  errors: string[];
}

/**
 * Column reorder operation result
 */
export interface ReorderResult {
  model: string;
  changes: ColumnChange[];
  sql: string[];
}

/**
 * Represents a column change operation
 */
export interface ColumnChange {
  column: string;
  fromPosition: number;
  toPosition: number;
  operation: 'move' | 'add' | 'modify';
}

/**
 * Migration fix result
 */
export interface MigrationFixResult {
  migrationFile: string;
  originalSql: string;
  fixedSql: string;
  changes: string[];
}

/**
 * Options for reading configuration from .env files
 */
export interface ConfigReaderOptions {
  envPath?: string;
  verbose?: boolean;
}

/**
 * CLI command options
 */
export interface SyncOptions {
  model?: string[];
  schema?: string;
  verbose?: boolean;
}

export interface FixMigrationOptions {
  migrationsDir?: string;
  verbose?: boolean;
  apply?: boolean;
}
