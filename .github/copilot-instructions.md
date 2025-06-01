# Prisma Column Order Manager (TypeScript NPM Extension)

Idea: Develop a TypeScript-based NPM package (Prisma extension/plugin) that enhances the developer experience with Prisma ORM by enabling automatic column reordering in supported SQL databases (MySQL and MariaDB) to match the column order defined in the Prisma schema.

## Motivation

Prisma ORM does not currently guarantee or enforce the order of columns in the physical database tables according to the order specified in the .prisma schema. While this has no impact on query results or functionality, it can lead to confusion during schema inspection, raw SQL querying, or interfacing with external tools that display column order (e.g., database clients, admin panels, analytics tools).
Maintaining a consistent column order improves readability, schema diff clarity, and developer confidence, especially in teams or open-source projects.

## Features & Commands

1. reorder-columns (Main Command)

   Analyzes the current Prisma schema and reorders the columns in each relevant table in the underlying database to match the field order in the schema file.

   - Operates safely by creating and running ALTER TABLE ... MODIFY COLUMN ... statements for MySQL/MariaDB.
   - Only generates the migration SQL and does not execute it automatically, allowing developers to review changes before applying.
   - Should optionally accept specific model names to limit scope.

2. check-latest-migration (Secondary Command)

   Scans the latest migration SQL file (from Prisma Migrate), and if it contains any ADD COLUMN operations, the tool will:

   - Validate whether the added column's order matches the schema.
   - If not, it will change the query to make the column appear in the correct order.
   - This ensures that any new columns added via migrations will also respect the defined order in the Prisma schema.

## Supported Databases

- ✅ MySQL
- ✅ MariaDB
- ❌ Not supported: PostgreSQL, SQL Server, SQLite — due to limitations in column reordering without dropping and recreating the table, or requiring full migration scripts.

## Safety & Limitations

- The tool must be used with caution in production environments; recommend backup or use on development/staging first.
- Must avoid any destructive operations unless explicitly approved by the user.

## Tech Stack & Ecosystem:

- TypeScript
- Prisma SDK & prisma-ast
- SQL generator/parser libraries
- File system utilities (to read migration files)
- CLI interface (using commander)
