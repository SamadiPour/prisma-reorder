# Prisma Column Order Manager

A TypeScript-based NPM package that enhances the developer experience with Prisma ORM by enabling automatic column reordering in supported SQL databases (MySQL, MariaDB, and SQLite) to match the column order defined in the Prisma schema.

## 🎯 Features

- **Column Synchronization**: Create migrations to sync database column order to match Prisma schema field order
- **Migration Fixing**: Fix column order in migration files to respect schema field order
- **Database Support**: Support for MySQL and MariaDB databases
- **CLI Interface**: Easy-to-use command-line interface for all operations

## 🚀 Installation

```bash
npm install prisma-reorder
# or
yarn add prisma-reorder
```

## 📋 Supported Databases

✅ **MySQL** - Full support for column reordering  
✅ **MariaDB** - Full support for column reordering  
❌ **SQLite** - Not supported (limitations in column reordering without table recreation)  
❌ **PostgreSQL** - Not supported (limitations in column reordering)  
❌ **SQL Server** - Not supported (limitations in column reordering)

## Basic Usage

### Sync Column Order

```bash
npx prisma-reorder sync
npx prisma-reorder sync --schema custom/path/schema.prisma
npx prisma-reorder sync --model User Post  # Sync specific models
npx prisma-reorder sync --verbose          # Show detailed output
```

### Fix Migration Files

```bash
npx prisma-reorder fix-migration                              # Check latest migration for column order issues
npx prisma-reorder fix-migration --apply                      # Apply fixes directly to migration file
npx prisma-reorder fix-migration --migrations-dir ./migrations # Custom migrations directory
npx prisma-reorder fix-migration --verbose                    # Show detailed output
```

## 🔧 How it Works

### Fix Migration Command Example

Given this Prisma schema:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  bio       String?  // Should be positioned after 'name'
  avatar    String?  // Should be positioned after 'bio'
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

When you have a migration file containing:

```sql
ALTER TABLE `User` ADD COLUMN `bio` TEXT;
ALTER TABLE `User` ADD COLUMN `avatar` VARCHAR(255);
```

Running `npx prisma-reorder fix-migration` will detect and fix the positioning:

```sql
ALTER TABLE `User` ADD COLUMN `bio` TEXT AFTER `name`;
ALTER TABLE `User` ADD COLUMN `avatar` VARCHAR(255) AFTER `bio`;
```

## 📚 Programmatic API

The Schema Reader module is currently implemented and provides the foundation for all schema analysis operations:

```typescript
import { SchemaReader, SUPPORTED_PROVIDERS } from 'prisma-reorder';

// Create a schema reader (defaults to prisma/schema.prisma)
const reader = new SchemaReader();

// Validate database support
const validation = await reader.validateSupportedDatabase();
console.log(`Provider: ${validation.provider}`);
console.log(`Supported: ${validation.isSupported}`);

// Get model names
const models = await reader.getModelNames();
console.log('Models:', models); // ['User', 'Post', 'Profile']

// Get field order for a model (only database columns, not relations)
const userFields = await reader.getModelFieldOrder('User');
console.log('User fields:', userFields); // ['id', 'email', 'name', 'createdAt']
```

### Advanced Analysis

```typescript
// Get complete schema analysis
const analysis = await reader.getSchemaAnalysis();

console.log(`Database: ${analysis.provider}`);
console.log(`Supported: ${analysis.isSupported}`);
console.log(`Models found: ${analysis.models.length}`);

// Analyze each model
analysis.models.forEach((model) => {
  console.log(`\nModel: ${model.name}`);
  model.fields.forEach((field) => {
    const tags = [];
    if (field.isId) tags.push('ID');
    if (field.isUnique) tags.push('UNIQUE');
    if (field.isRelation) tags.push('RELATION');

    console.log(`  ${field.name}: ${field.type} ${tags.join(' ')}`);
  });
});
```

## 🛠️ Development

To contribute to this project:

```bash
# Clone the repository
git clone <repository-url>
cd prisma-reorder

# Install dependencies
npm install

# Build the project
npm run build

# Test the CLI locally
npx . sync --help
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
