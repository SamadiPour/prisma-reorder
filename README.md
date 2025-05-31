# Prisma Column Order Manager

A TypeScript-based NPM package that enhances the developer experience with Prisma ORM by enabling automatic column reordering in supported SQL databases (MySQL, MariaDB, and SQLite) to match the column order defined in the Prisma schema.

## 🎯 Features

- **Column Synchronization**: Create migrations to sync database column order to match Prisma schema field order
- **Migration Fixing**: Fix column order in migration files to respect schema field order
- **Database Support**: Support for MySQL, MariaDB, and SQLite databases
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
✅ **SQLite** - Full support for column reordering  
❌ **PostgreSQL** - Not supported (limitations in column reordering)  
❌ **SQL Server** - Not supported (limitations in column reordering)

## 🛠️ CLI Usage

### Sync Column Order
```bash
npx prisma-reorder sync
npx prisma-reorder sync --schema custom/path/schema.prisma
npx prisma-reorder sync --model User Post  # Sync specific models
npx prisma-reorder sync --verbose          # Show detailed output
```

### Fix Migration Files
```bash
npx prisma-reorder fix-migration
npx prisma-reorder fix-migration --migrations-dir custom/migrations
npx prisma-reorder fix-migration --verbose
```

## 📚 Programmatic API

```typescript
// This API is not yet implemented
import { PrismaReorder } from 'prisma-reorder';

// Will be available in future versions
const reorder = new PrismaReorder('prisma/schema.prisma');
const migration = await reorder.generateColumnOrderMigration();
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
