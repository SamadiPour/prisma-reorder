#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SyncCommand, FixMigrationCommand } from './commands';

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8'),
);
const { version } = packageJson;

const program = new Command();

program
  .name('prisma-reorder')
  .description('CLI tool for reordering Prisma schema columns')
  .version(version);

// sync command (main command)
program
  .command('sync')
  .description(
    'Generate SQL to sync database column order to match Prisma schema field order',
  )
  .option(
    '-m, --model [models...]',
    'Specify specific model names to reorder (defaults to all models)',
  )
  .option(
    '-s, --schema [path]',
    'Path to Prisma schema file',
    './prisma/schema.prisma',
  )
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const syncCommand = new SyncCommand();
    await syncCommand.execute(options);
  });

// fix-migration command
program
  .command('fix-migration')
  .description('Fix column order issues in the latest migration file')
  .option(
    '-m, --migrations-dir [path]',
    'Path to migrations directory',
    './prisma/migrations',
  )
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    const fixCommand = new FixMigrationCommand();
    await fixCommand.execute(options);
  });

program.parse(process.argv);
