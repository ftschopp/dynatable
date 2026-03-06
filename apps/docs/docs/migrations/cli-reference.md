---
sidebar_position: 3
title: CLI Reference
---

# CLI Reference

## Commands

### `init`

Initialize migrations in your project.

```bash
dynatable-migrate init
```

Creates:
- `migrations/` directory
- `dynatable.config.js` configuration file

---

### `create <name>`

Create a new migration file.

```bash
dynatable-migrate create <name> [options]
```

**Arguments:**
- `name` - Migration name (snake_case recommended)

**Options:**

| Option | Short | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Custom config file path |
| `--type <type>` | `-t` | Version bump: `major`, `minor`, or `patch` (default: patch) |
| `--explicit <version>` | `-e` | Explicit semver version (e.g., 2.0.0) |

**Examples:**

```bash
# Patch bump (default): 0.1.0 -> 0.1.1
dynatable-migrate create fix_typo

# Minor bump: 0.1.1 -> 0.2.0
dynatable-migrate create add_notifications --type minor

# Major bump: 0.2.0 -> 1.0.0
dynatable-migrate create breaking_change --type major

# Explicit version
dynatable-migrate create hotfix --explicit 0.1.2
```

---

### `up`

Run pending migrations.

```bash
dynatable-migrate up [options]
```

**Options:**

| Option | Short | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Custom config file path |
| `--limit <number>` | `-l` | Limit number of migrations to run |
| `--dry-run` | `-d` | Preview changes without applying |

**Examples:**

```bash
# Run all pending
dynatable-migrate up

# Preview what would run
dynatable-migrate up --dry-run

# Run only next migration
dynatable-migrate up --limit 1

# Use custom config
dynatable-migrate up --config ./prod.config.js
```

---

### `down`

Rollback migrations.

```bash
dynatable-migrate down [options]
```

**Options:**

| Option | Short | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Custom config file path |
| `--steps <number>` | `-s` | Number of migrations to rollback (default: 1) |
| `--dry-run` | `-d` | Preview changes without applying |

**Examples:**

```bash
# Rollback last migration
dynatable-migrate down

# Rollback last 3 migrations
dynatable-migrate down --steps 3

# Preview rollback
dynatable-migrate down --dry-run
```

---

### `status`

Show migration status.

```bash
dynatable-migrate status [options]
```

**Options:**

| Option | Short | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Custom config file path |

**Example Output:**

```
📊 Migration Status

Table: MyApp
Current version: 0.2.0
Migrations directory: ./migrations

✅ Applied (2):
   0.1.0 - add_user_email (2025-03-29 10:00:00)
   0.2.0 - normalize_usernames (2025-03-29 11:00:00)

⏳ Pending (1):
   0.3.0 - change_photo_sort_key

Total: 3 migration(s)
```

## Semantic Versioning

Migrations use semver for version numbers:

| Bump Type | When to Use | Example |
|-----------|-------------|---------|
| **Major** | Breaking schema changes | 0.2.0 → 1.0.0 |
| **Minor** | New features, new entity types | 0.1.0 → 0.2.0 |
| **Patch** | Bug fixes, small adjustments | 0.1.0 → 0.1.1 |

## Programmatic Usage

You can also use the migration runner in code:

```typescript
import {
  MigrationRunner,
  loadConfig,
  createDynamoDBClient,
} from '@ftschopp/dynatable-migrations';

async function runMigrations() {
  const config = await loadConfig();
  const client = createDynamoDBClient(config);
  const runner = new MigrationRunner(client, config);

  // Get status
  const status = await runner.status();

  // Run migrations
  await runner.up();
  await runner.up({ limit: 1, dryRun: true });

  // Rollback
  await runner.down({ steps: 1 });
}
```

## Available Exports

```typescript
// Core classes
export { MigrationRunner } from './core/runner';
export { MigrationLoader } from './core/loader';
export { DynamoDBMigrationTracker } from './core/tracker';

// Config
export { loadConfig, ConfigLoader } from './core/config';
export { createDynamoDBClient } from './core/client';

// Commands
export { createMigration } from './commands/create';
export { runMigrations } from './commands/up';
export { rollbackMigrations } from './commands/down';
export { showStatus } from './commands/status';
export { initProject } from './commands/init';

// Types
export * from './types';
```
