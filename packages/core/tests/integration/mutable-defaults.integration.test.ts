import { Table } from '../../src/table';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * End-to-end evidence that non-function `default: []` / `default: {}` are no
 * longer shared by reference across items.
 *
 * A non-function default lives once on the schema object. Assigned by
 * reference, every item created without the field aliased that single instance
 * — mutating one (`item.tags.push(...)`) poisoned the schema default and every
 * later create. Driven through the real Table → entity → dbParams pipeline.
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

describe('write-path: mutable default isolation', () => {
  test('two items created without `tags` get independent arrays', () => {
    const p1 = table.entities.Event.put({ id: '1', name: 'a' }).dbParams();
    const p2 = table.entities.Event.put({ id: '2', name: 'b' }).dbParams();

    expect(p1.Item!.tags).toEqual([]);
    expect(p2.Item!.tags).toEqual([]);
    expect(p1.Item!.tags).not.toBe(p2.Item!.tags);
  });

  test('mutating one item never leaks into a later create', () => {
    const p1 = table.entities.Event.put({ id: '1', name: 'a' }).dbParams();

    (p1.Item!.tags as string[]).push('leaked');

    const p2 = table.entities.Event.put({ id: '2', name: 'b' }).dbParams();

    // The regression: without cloning, this would be ['leaked'].
    expect(p2.Item!.tags).toEqual([]);
  });
});
