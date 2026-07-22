/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table } from '../../src/table';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

/**
 * End-to-end evidence that `type: Date` attributes are serialized to ISO
 * strings on write.
 *
 * Zod coerces `type: Date` to a Date object at validation (`z.coerce.date()`).
 * Without serialization that Date reaches lib-dynamodb, whose marshaller has no
 * native Date type: it throws "Unsupported type" or, with
 * convertClassInstanceToMap, writes an empty map `{}`. Driven through the real
 * Table → entity → dbParams pipeline.
 */
const schema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',
  indexes: {
    primary: { hash: 'PK', sort: 'SK' },
  },
  models: {
    Event: {
      key: {
        PK: { type: String, value: 'EVENT#${id}' },
        SK: { type: String, value: 'EVENT#${id}' },
      },
      attributes: {
        id: { type: String, required: true },
        name: { type: String, required: true },
        occurredAt: { type: Date, required: true },
      },
    },
  },
} as const;

const table = new Table({
  name: 'EventsTable',
  client: new DynamoDBClient({}),
  schema,
});

describe('write-path: Date serialization (put)', () => {
  test('a Date attribute is written as an ISO string, not a Date object', () => {
    const params = table.entities.Event.put({
      id: '1',
      name: 'launch',
      occurredAt: new Date('2026-05-01T12:00:00.000Z'),
    }).dbParams();

    expect(typeof params.Item!.occurredAt).toBe('string');
    expect(params.Item!.occurredAt).toBe('2026-05-01T12:00:00.000Z');
  });

  test('the resulting Item is marshallable (the actual bug)', () => {
    const params = table.entities.Event.put({
      id: '1',
      name: 'launch',
      occurredAt: new Date('2026-05-01T12:00:00.000Z'),
    }).dbParams();

    // Before the fix, Item.occurredAt was a Date and this threw.
    expect(() => marshall(params.Item)).not.toThrow();
    expect(marshall(params.Item).occurredAt).toEqual({ S: '2026-05-01T12:00:00.000Z' });
  });

  test('an ISO string input is accepted and preserved', () => {
    const params = table.entities.Event.put({
      id: '1',
      name: 'launch',
      occurredAt: '2026-05-01T12:00:00.000Z' as any,
    }).dbParams();

    expect(params.Item!.occurredAt).toBe('2026-05-01T12:00:00.000Z');
    expect(() => marshall(params.Item)).not.toThrow();
  });
});

describe('write-path: Date serialization (batchWrite)', () => {
  test('every batched Item marshals cleanly', () => {
    const params = table.entities.Event.batchWrite([
      { id: '1', name: 'a', occurredAt: new Date('2026-01-01T00:00:00.000Z') },
      { id: '2', name: 'b', occurredAt: new Date('2026-02-02T00:00:00.000Z') },
    ]).dbParams();

    const requests = params.RequestItems!['EventsTable']!;
    expect(requests).toHaveLength(2);
    for (const req of requests) {
      const item = req.PutRequest!.Item!;
      expect(typeof item.occurredAt).toBe('string');
      expect(() => marshall(item)).not.toThrow();
    }
  });
});
