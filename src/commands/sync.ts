import { ColumnReorderGenerator } from '../lib/column-reorder';
import { SchemaReader } from '../lib/schema-reader';
import { type SyncOptions } from '../types';

/**
 * Sync command implementation - reorders database columns to match schema
 */
export class SyncCommand {
  /**
   * Execute the sync command
   */
  public async execute(options: SyncOptions): Promise<void> {
    const {
      model: targetModels,
      schema: schemaPath,
      verbose = false,
    } = options;

    if (verbose) {
      console.log('🔄 Starting column reorder sync...');
      console.log(`Schema path: ${schemaPath || 'prisma/schema.prisma'}`);
      if (targetModels?.length) {
        console.log(`Target models: ${targetModels.join(', ')}`);
      }
    }

    try {
      // Validate schema first
      const schemaReader = new SchemaReader(schemaPath);
      const validation = await schemaReader.validateSupportedDatabase();

      if (!validation.isSupported) {
        console.error(
          `❌ Database provider "${validation.provider}" is not supported`,
        );
        console.error('Supported providers: mysql, mariadb');
        if (validation.errors.length > 0) {
          validation.errors.forEach((error) => console.error(`   ${error}`));
        }
        process.exit(1);
      }

      if (verbose) {
        console.log(
          `✅ Database provider "${validation.provider}" is supported`,
        );
      }

      // Generate reorder SQL
      const generator = new ColumnReorderGenerator(schemaPath);
      const results = await generator.generateReorderSQL(targetModels);

      if (results.length === 0) {
        console.log('✅ All columns are already in the correct order');
        return;
      }

      console.log(
        `\n📋 Found ${results.length} model(s) that need column reordering:\n`,
      );

      for (const result of results) {
        console.log(`🔧 Model: ${result.model}`);
        console.log(`   Changes needed: ${result.changes.length}`);

        if (verbose) {
          result.changes.forEach((change) => {
            console.log(
              `   - Move "${change.column}" from position ${change.fromPosition} to ${change.toPosition}`,
            );
          });
        }

        console.log('\n   Generated SQL:');
        result.sql.forEach((sql) => {
          console.log(`   ${sql}`);
        });
        console.log();
      }
    } catch (error) {
      console.error('❌ Error during sync operation:');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }
}
