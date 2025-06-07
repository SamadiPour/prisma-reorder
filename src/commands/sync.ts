import { ColumnReorderGenerator } from '../lib/column-reorder';
import { SchemaReader } from '../lib/schema-reader';
import { DatabaseConnector } from '../lib/database-connector';
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

      // Test database connection before proceeding
      if (verbose) {
        console.log('🔗 Testing database connection...');
      }

      // Get database URL from schema
      let databaseUrl: string;
      try {
        databaseUrl = await schemaReader.getDatabaseUrl();

        if (verbose) {
          console.log('📄 Database URL extracted from schema');
        }
      } catch (error) {
        console.error('❌ Failed to extract database URL from schema');
        console.error(
          `   Error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
        console.error(
          '   Please check your schema.prisma datasource configuration',
        );
        process.exit(1);
      }

      const tempConnector = new DatabaseConnector(
        validation.provider as any,
        databaseUrl,
      );
      const connectionTest = await tempConnector.testConnection();

      if (!connectionTest.success) {
        console.error('❌ Failed to connect to database');
        console.error(`   Error: ${connectionTest.error}`);
        console.error('   Please check your DATABASE_URL in .env file');
        process.exit(1);
      }

      await tempConnector.disconnect();

      if (verbose) {
        console.log('✅ Database connection successful');
      }

      // Generate reorder SQL
      const generator = new ColumnReorderGenerator(schemaPath);

      if (verbose) {
        console.log('🔍 Analyzing schema and database...');
      }

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

      console.log('\n✅ Column reorder SQL statements generated successfully!');
      console.log(
        '💡 Review the SQL statements above and execute them manually in your database.',
      );
    } catch (error) {
      console.error('❌ Error during sync operation:');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }
}
