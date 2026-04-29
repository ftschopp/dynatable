# Migrations Playground

Interactive CLI to test and visualize DynamoDB migrations.

## Quick Start

```bash
# 1. Start DynamoDB Local
yarn docker:up

# 2. Create the table
yarn setup

# 3. Run the interactive CLI
yarn start
```

## Available Commands

| Command               | Description                     |
| --------------------- | ------------------------------- |
| `yarn docker:up`      | Start DynamoDB Local + Admin UI |
| `yarn docker:down`    | Stop containers                 |
| `yarn docker:reset`   | Reset everything (delete data)  |
| `yarn setup`          | Create the DynamoDB table       |
| `yarn start`          | Run interactive CLI             |
| `yarn migrate:status` | Show migration status           |
| `yarn migrate:up`     | Run pending migrations          |
| `yarn migrate:down`   | Rollback last migration         |

## CLI Features

The interactive CLI provides:

- **View Table Info** - Structure, indexes, and stats
- **View Data** - Browse all data or filter by entity type
- **Seed Data** - Insert sample Users, Products, and Orders
- **Clear Data** - Delete all items
- **Migration Status** - See pending/applied migrations
- **Run Migrations** - Execute with optional limit
- **Rollback** - Undo migrations step by step
- **Snapshots** - Save and compare data before/after migrations

## Sample Migrations

The playground includes 5 example migrations:

| Version | Name                   | What it does                                               |
| ------- | ---------------------- | ---------------------------------------------------------- |
| 0.1.0   | initial_setup          | Baseline schema documentation                              |
| 0.2.0   | add_user_email         | Adds `email` and `emailVerified` to Users                  |
| 0.3.0   | add_product_metadata   | Adds `sku`, `weight`, `dimensions`, `lowStock` to Products |
| 0.4.0   | transform_order_status | Transforms `status` string to `statusInfo` object          |
| 1.0.0   | add_audit_fields       | Adds `updatedAt` and `_version` to ALL entities            |

## Recommended Test Flow

1. **Setup**

   ```bash
   yarn docker:up
   yarn setup
   yarn start
   ```

2. **In the CLI:**
   - Seed sample data (Users + Products + Orders)
   - View data to see initial state
   - Take a snapshot (before)
   - Run migrations (one at a time)
   - View data to see changes
   - Take another snapshot (after)
   - Compare snapshots
   - Try rollback to undo changes

## DynamoDB Admin UI

Open http://localhost:8101 to visually browse the table data.

## Creating New Migrations

```bash
# From CLI menu: "Create New Migration"
# Or directly:
yarn migrate:create my_migration_name --type patch
yarn migrate:create new_feature --type minor
yarn migrate:create breaking_change --type major
```
