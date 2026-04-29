import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import Table from 'cli-table3';
import { rawClient, tableName } from '../db';

export async function showTableInfo(): Promise<void> {
  console.log('\n📊 Table Information\n');

  try {
    const result = await rawClient.send(new DescribeTableCommand({ TableName: tableName }));

    const table = result.Table;
    if (!table) {
      console.log('Table not found. Run: yarn setup');
      return;
    }

    // Basic info
    const infoTable = new Table({
      head: ['Property', 'Value'],
      colWidths: [25, 40],
    });

    infoTable.push(
      ['Table Name', table.TableName || ''],
      ['Status', table.TableStatus || ''],
      ['Item Count', String(table.ItemCount || 0)],
      ['Size (bytes)', String(table.TableSizeBytes || 0)],
      ['Creation Date', table.CreationDateTime?.toISOString() || '']
    );

    console.log(infoTable.toString());

    // Key Schema
    console.log('\n🔑 Key Schema\n');
    const keyTable = new Table({
      head: ['Attribute', 'Type'],
      colWidths: [25, 20],
    });

    for (const key of table.KeySchema || []) {
      keyTable.push([key.AttributeName || '', key.KeyType || '']);
    }

    console.log(keyTable.toString());

    // GSIs
    if (table.GlobalSecondaryIndexes && table.GlobalSecondaryIndexes.length > 0) {
      console.log('\n📇 Global Secondary Indexes (GSI)\n');

      for (const gsi of table.GlobalSecondaryIndexes) {
        const gsiTable = new Table({
          head: [`GSI: ${gsi.IndexName}`, 'Value'],
          colWidths: [25, 40],
        });

        const keySchema = gsi.KeySchema?.map((k) => `${k.AttributeName} (${k.KeyType})`).join(', ');

        gsiTable.push(
          ['Key Schema', keySchema || ''],
          ['Status', gsi.IndexStatus || ''],
          ['Projection', gsi.Projection?.ProjectionType || ''],
          ['Item Count', String(gsi.ItemCount || 0)]
        );

        console.log(gsiTable.toString());
      }
    }

    // Attribute Definitions
    console.log('\n📋 Attribute Definitions\n');
    const attrTable = new Table({
      head: ['Attribute', 'Type'],
      colWidths: [25, 20],
    });

    for (const attr of table.AttributeDefinitions || []) {
      const typeMap: Record<string, string> = {
        S: 'String',
        N: 'Number',
        B: 'Binary',
      };
      attrTable.push([
        attr.AttributeName || '',
        typeMap[attr.AttributeType || ''] || attr.AttributeType || '',
      ]);
    }

    console.log(attrTable.toString());
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      console.log('❌ Table does not exist. Run: yarn setup');
    } else {
      throw error;
    }
  }
}
