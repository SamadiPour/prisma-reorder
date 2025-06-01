import { MigrationFixer } from '../lib/migration-fixer';
import { type FixMigrationOptions } from '../types';

/**
 * Fix migration command implementation - fixes column order in migration files
 */
export class FixMigrationCommand {
  /**
   * Execute the fix-migration command
   */
  public async execute(options: FixMigrationOptions): Promise<void> {
    const { migrationsDir, verbose = false, apply = false } = options;

    if (verbose) {
      console.log('🔍 Checking latest migration for column order issues...');
      console.log(
        `Migrations directory: ${migrationsDir || 'prisma/migrations'}`,
      );
    }

    try {
      const fixer = new MigrationFixer(migrationsDir);
      const latestMigration = fixer.getLatestMigration();

      if (!latestMigration) {
        console.log('ℹ️  No migration files found');
        return;
      }

      if (verbose) {
        console.log(`📄 Latest migration: ${latestMigration}`);
      }

      const result = await fixer.fixLatestMigration();

      if (!result) {
        console.log('✅ Latest migration does not require column order fixes');
        return;
      }

      console.log(`\n🔧 Found column order issues in: ${result.migrationFile}`);
      console.log(`📝 Changes needed: ${result.changes.length}\n`);

      if (verbose) {
        result.changes.forEach((change) => {
          console.log(`   - ${change}`);
        });
        console.log();
      }

      console.log('📋 Original SQL:');
      console.log(result.originalSql);
      console.log('\n🔧 Fixed SQL:');
      console.log(result.fixedSql);

      if (apply) {
        console.log('\n💾 Applying fixes to migration file...');
        const success = await fixer.applyFixes();
        if (success) {
          console.log('✅ Migration file has been updated successfully');
        } else {
          console.log('❌ Failed to apply fixes to migration file');
        }
      } else {
        console.log(
          '\n💡 To apply these fixes, run the command again with --apply flag',
        );
      }
    } catch (error) {
      console.error('❌ Error during migration fix operation:');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }
}
