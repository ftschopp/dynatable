/* eslint-disable @typescript-eslint/no-explicit-any */
import { Table } from '../../src/table';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

/**
 * End-to-end evidence for two write-path bugs:
 *
 *  - `type: Date` attributes used to reach lib-dynamodb as raw Date objects,
 *    which the marshaller rejects ("Unsupported type") or, with
 *    convertClassInstanceToMap, silently writes as `{}`.
 *  - Non-function `default: []` / `default: {}` were assigned by reference, so
 *    every item created without the field shared one instance.
 *
 * These go through the real entity API (Table → entities.X.put/batchWrite →
 * dbParams) so they exercise the exact pipeline a consumer hits.
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
        tags: { type: Array, default: [], items: { type: String } },
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

describe('write-path: mutable default isolation', () => {
  test('two items created without `tags` get independent arrays', () => {
    const p1 = table.entities.Event.put({
      id: '1',
      name: 'a',
      occurredAt: new Date(),
    }).dbParams();
    const p2 = table.entities.Event.put({
      id: '2',
      name: 'b',
      occurredAt: new Date(),
    }).dbParams();

    expect(p1.Item!.tags).toEqual([]);
    expect(p2.Item!.tags).toEqual([]);
    expect(p1.Item!.tags).not.toBe(p2.Item!.tags);
  });

  test('mutating one item never leaks into a later create', () => {
    const p1 = table.entities.Event.put({
      id: '1',
      name: 'a',
      occurredAt: new Date(),
    }).dbParams();

    (p1.Item!.tags as string[]).push('leaked');

    const p2 = table.entities.Event.put({
      id: '2',
      name: 'b',
      occurredAt: new Date(),
    }).dbParams();

    // The regression: without cloning, this would be ['leaked'].
    expect(p2.Item!.tags).toEqual([]);
  });
});
