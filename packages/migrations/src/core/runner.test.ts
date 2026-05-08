/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { MigrationRunner } from './runner';
import type { MigrationConfig } from '../types';

const baseConfig: MigrationConfig = {
  tableName: 'TestTable',
  client: { region: 'us-east-1' },
};

function makeRunner() {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
  return new MigrationRunner(client, baseConfig);
}

describe('MigrationRunner.up - input validation', () => {
  test('throws when limit is 0', async () => {
    await expect(makeRunner().up({ limit: 0 })).rejects.toThrow(/positive integer/);
  });

  test('throws when limit is negative', async () => {
    await expect(makeRunner().up({ limit: -3 })).rejects.toThrow(/positive integer/);
  });

  test('throws when limit is NaN', async () => {
    await expect(makeRunner().up({ limit: NaN })).rejects.toThrow(/positive integer/);
  });

  test('throws when limit is a non-integer (1.5)', async () => {
    await expect(makeRunner().up({ limit: 1.5 })).rejects.toThrow(/positive integer/);
  });
});

describe('MigrationRunner.down - input validation', () => {
  test('throws when steps is 0', async () => {
    await expect(makeRunner().down(0)).rejects.toThrow(/positive integer/);
  });

  test('throws when steps is negative', async () => {
    await expect(makeRunner().down(-5)).rejects.toThrow(/positive integer/);
  });

  test('throws when steps is NaN', async () => {
    await expect(makeRunner().down(Number.NaN)).rejects.toThrow(/positive integer/);
  });

  test('throws when steps is a non-integer', async () => {
    await expect(makeRunner().down(2.5)).rejects.toThrow(/positive integer/);
  });
});
