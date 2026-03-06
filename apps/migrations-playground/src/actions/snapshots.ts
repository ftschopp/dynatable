import * as fs from 'fs';
import * as path from 'path';
import { select } from '@inquirer/prompts';
import Table from 'cli-table3';
import { scanAllItems } from '../db';

const SNAPSHOTS_DIR = '.snapshots';

interface Snapshot {
  name: string;
  timestamp: string;
  itemCount: number;
  items: Record<string, any>[];
}

function ensureSnapshotsDir(): void {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
  } catch (error) {
    throw new Error(`Failed to create snapshots directory: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getSnapshotFiles(): string[] {
  ensureSnapshotsDir();
  return fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
}

function loadSnapshot(filename: string): Snapshot {
  const filepath = path.join(SNAPSHOTS_DIR, filename);
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load snapshot '${filename}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function showSnapshot(): Promise<void> {
  ensureSnapshotsDir();

  const items = await scanAllItems();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `snapshot-${timestamp}`;
  const filename = `${name}.json`;

  const snapshot: Snapshot = {
    name,
    timestamp: new Date().toISOString(),
    itemCount: items.length,
    items,
  };

  try {
    fs.writeFileSync(
      path.join(SNAPSHOTS_DIR, filename),
      JSON.stringify(snapshot, null, 2)
    );
  } catch (error) {
    throw new Error(`Failed to save snapshot: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`\n✅ Snapshot saved: ${filename}`);
  console.log(`   Items: ${items.length}`);
  console.log(`   Path: ${SNAPSHOTS_DIR}/${filename}\n`);

  // Show entities breakdown
  const entities = new Map<string, number>();
  for (const item of items) {
    const type = item.entityType || item.PK?.split('#')[0] || 'Unknown';
    entities.set(type, (entities.get(type) || 0) + 1);
  }

  if (entities.size > 0) {
    console.log('   Breakdown:');
    for (const [type, count] of entities) {
      console.log(`     - ${type}: ${count}`);
    }
    console.log('');
  }
}

export async function compareSnapshots(): Promise<void> {
  const files = getSnapshotFiles();

  if (files.length < 2) {
    console.log('\nNeed at least 2 snapshots to compare.');
    console.log('Use "Take Snapshot" to create snapshots before and after migrations.\n');
    return;
  }

  const beforeFile = await select({
    message: 'Select BEFORE snapshot:',
    choices: files.map((f) => ({
      name: f,
      value: f,
    })),
  });

  const afterFile = await select({
    message: 'Select AFTER snapshot:',
    choices: files
      .filter((f) => f !== beforeFile)
      .map((f) => ({
        name: f,
        value: f,
      })),
  });

  const before = loadSnapshot(beforeFile);
  const after = loadSnapshot(afterFile);

  console.log('\n📊 Snapshot Comparison\n');
  console.log(`Before: ${beforeFile} (${before.itemCount} items)`);
  console.log(`After:  ${afterFile} (${after.itemCount} items)\n`);

  // Create maps for comparison
  const beforeMap = new Map<string, Record<string, any>>();
  const afterMap = new Map<string, Record<string, any>>();

  for (const item of before.items) {
    const key = `${item.PK}|${item.SK}`;
    beforeMap.set(key, item);
  }

  for (const item of after.items) {
    const key = `${item.PK}|${item.SK}`;
    afterMap.set(key, item);
  }

  // Find differences
  const added: Record<string, any>[] = [];
  const removed: Record<string, any>[] = [];
  const modified: Array<{
    key: string;
    before: Record<string, any>;
    after: Record<string, any>;
    changes: string[];
  }> = [];

  // Find added and modified
  for (const [key, afterItem] of afterMap) {
    const beforeItem = beforeMap.get(key);

    if (!beforeItem) {
      added.push(afterItem);
    } else {
      // Check for modifications
      const changes: string[] = [];

      const allKeys = new Set([
        ...Object.keys(beforeItem),
        ...Object.keys(afterItem),
      ]);

      for (const k of allKeys) {
        const bv = JSON.stringify(beforeItem[k]);
        const av = JSON.stringify(afterItem[k]);

        if (bv !== av) {
          if (beforeItem[k] === undefined) {
            changes.push(`+ ${k}: ${av}`);
          } else if (afterItem[k] === undefined) {
            changes.push(`- ${k}: ${bv}`);
          } else {
            changes.push(`~ ${k}: ${bv} → ${av}`);
          }
        }
      }

      if (changes.length > 0) {
        modified.push({ key, before: beforeItem, after: afterItem, changes });
      }
    }
  }

  // Find removed
  for (const [key, beforeItem] of beforeMap) {
    if (!afterMap.has(key)) {
      removed.push(beforeItem);
    }
  }

  // Display results
  const summaryTable = new Table({
    head: ['Change Type', 'Count'],
    colWidths: [20, 15],
  });

  summaryTable.push(
    ['Added', added.length],
    ['Removed', removed.length],
    ['Modified', modified.length],
    ['Unchanged', afterMap.size - added.length - modified.length]
  );

  console.log(summaryTable.toString());

  // Show details
  if (added.length > 0) {
    console.log('\n✅ Added Items:\n');
    for (const item of added.slice(0, 5)) {
      console.log(`  + ${item.PK} | ${item.SK}`);
      if (item.entityType) console.log(`    Type: ${item.entityType}`);
    }
    if (added.length > 5) {
      console.log(`  ... and ${added.length - 5} more`);
    }
  }

  if (removed.length > 0) {
    console.log('\n❌ Removed Items:\n');
    for (const item of removed.slice(0, 5)) {
      console.log(`  - ${item.PK} | ${item.SK}`);
    }
    if (removed.length > 5) {
      console.log(`  ... and ${removed.length - 5} more`);
    }
  }

  if (modified.length > 0) {
    console.log('\n📝 Modified Items:\n');
    for (const mod of modified.slice(0, 5)) {
      console.log(`  ${mod.before.PK} | ${mod.before.SK}`);
      for (const change of mod.changes.slice(0, 3)) {
        console.log(`    ${change}`);
      }
      if (mod.changes.length > 3) {
        console.log(`    ... and ${mod.changes.length - 3} more changes`);
      }
    }
    if (modified.length > 5) {
      console.log(`  ... and ${modified.length - 5} more modified items`);
    }
  }

  console.log('');
}
