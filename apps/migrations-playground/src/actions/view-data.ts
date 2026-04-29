import { select } from '@inquirer/prompts';
import Table from 'cli-table3';
import { scanAllItems, getItemsByEntityType } from '../db';

function formatValue(value: any): string {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export async function showAllData(): Promise<void> {
  console.log('\n📦 All Data in Table\n');

  const items = await scanAllItems();

  if (items.length === 0) {
    console.log('No items found. Use "Seed Sample Data" to add some.\n');
    return;
  }

  // Group by entity type (based on PK prefix)
  const grouped = new Map<string, typeof items>();

  for (const item of items) {
    const pk = item.PK as string;
    const prefix = pk.split('#')[0] || 'OTHER';

    if (!grouped.has(prefix)) {
      grouped.set(prefix, []);
    }
    grouped.get(prefix)!.push(item);
  }

  // Display each group
  for (const [prefix, groupItems] of grouped) {
    console.log(`\n── ${prefix} (${groupItems.length} items) ──\n`);

    // Get all unique keys from items
    const allKeys = new Set<string>();
    for (const item of groupItems) {
      Object.keys(item).forEach((k) => allKeys.add(k));
    }

    // Priority keys first
    const priorityKeys = ['PK', 'SK', 'GSI1PK', 'GSI1SK'];
    const otherKeys = [...allKeys].filter((k) => !priorityKeys.includes(k)).sort();
    const orderedKeys = [...priorityKeys.filter((k) => allKeys.has(k)), ...otherKeys];

    // Limit columns for readability
    const displayKeys = orderedKeys.slice(0, 8);

    const table = new Table({
      head: displayKeys,
      colWidths: displayKeys.map(() => 20),
      wordWrap: true,
    });

    for (const item of groupItems.slice(0, 10)) {
      table.push(displayKeys.map((k) => truncate(formatValue(item[k]), 18)));
    }

    console.log(table.toString());

    if (groupItems.length > 10) {
      console.log(`  ... and ${groupItems.length - 10} more items\n`);
    }
  }

  console.log(`\nTotal: ${items.length} items\n`);
}

export async function showDataByEntity(): Promise<void> {
  const items = await scanAllItems();

  if (items.length === 0) {
    console.log('\nNo items found. Use "Seed Sample Data" to add some.\n');
    return;
  }

  // Get unique prefixes
  const prefixes = new Set<string>();
  for (const item of items) {
    const pk = item.PK as string;
    const prefix = pk.split('#')[0] || 'OTHER';
    prefixes.add(prefix);
  }

  const entityType = await select({
    message: 'Select entity type:',
    choices: [...prefixes].map((p) => ({
      name: `${p}#`,
      value: p,
    })),
  });

  console.log(`\n📦 Items with PK starting with "${entityType}#"\n`);

  const filteredItems = await getItemsByEntityType(`${entityType}#`);

  if (filteredItems.length === 0) {
    console.log('No items found.\n');
    return;
  }

  // Get all unique keys
  const allKeys = new Set<string>();
  for (const item of filteredItems) {
    Object.keys(item).forEach((k) => allKeys.add(k));
  }

  const priorityKeys = ['PK', 'SK'];
  const otherKeys = [...allKeys]
    .filter((k) => !priorityKeys.includes(k) && !k.startsWith('GSI'))
    .sort();
  const orderedKeys = [...priorityKeys.filter((k) => allKeys.has(k)), ...otherKeys];

  const displayKeys = orderedKeys.slice(0, 10);

  const table = new Table({
    head: displayKeys,
    wordWrap: true,
  });

  for (const item of filteredItems) {
    table.push(displayKeys.map((k) => truncate(formatValue(item[k]), 25)));
  }

  console.log(table.toString());
  console.log(`\nTotal: ${filteredItems.length} items\n`);
}
