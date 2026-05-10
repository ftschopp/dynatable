/* eslint-disable @typescript-eslint/no-explicit-any */

import { IndexesDefinition, InferModel, KeyDefinition, ModelDefinition } from '@/core/types';
import { ulid } from 'ulid';

/**
 * Extracts all variable names from a template string
 * @param template - Template string with ${variable} syntax
 * @returns Array of variable names found in the template
 */
export const extractTemplateVars = (template: string): string[] => {
  const matches = template.matchAll(/\${(.*?)}/g);
  return Array.from(matches, (m) => m[1]).filter((v): v is string => v !== undefined);
};

/**
 * Resolves a string template with provided data
 * @throws Error if any required template variable is missing from data
 */
export const resolveTemplate = (template: string, data: Record<string, any>): string => {
  const missing: string[] = [];

  const result = template.replace(/\${(.*?)}/g, (_, key) => {
    const value = data[key];
    if (value === undefined) {
      missing.push(key);
      return `\${${key}}`; // Keep placeholder for error message
    }
    return String(value);
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required field(s) for key template: ${missing.join(', ')}. ` +
        `Template: "${template}"`
    );
  }

  return result;
};

/**
 * Resolves all keys or indexes for a model
 */
export const resolveKeys = <M extends ModelDefinition>(
  model: M,
  input: Record<string, any>,
  type: 'key' | 'index' | 'both' = 'key'
): Record<string, string> => {
  const out: Record<string, string> = {};
  const process = (keys?: Record<string, KeyDefinition>) => {
    if (!keys) return;
    for (const [k, def] of Object.entries(keys)) {
      out[k] = resolveTemplate(def.value, input);
    }
  };
  if (type === 'key' || type === 'both') process(model.key);
  if (type === 'index' || type === 'both') process(model.index);
  return out;
};

/**
 * Result of analyzing how a partial update affects a model's secondary index keys.
 *
 * `actions` maps index-attribute name → freshly resolved template value, ready to SET.
 * `missing` lists indexes whose template references at least one updated field but
 * cannot be fully resolved from `keyVars + updates`; those entries identify the
 * variables the caller must additionally provide.
 */
export type IndexUpdateAnalysis = {
  actions: Record<string, string>;
  missing: { index: string; template: string; missing: string[] }[];
};

/**
 * Determines which secondary-index keys must be recomputed given a partial update.
 *
 * An index is "affected" iff at least one of its template variables appears in
 * `updates`. For each affected index we attempt to resolve the template from the
 * union of `keyVars` (template vars carried in the primary key, e.g. `id`) and
 * `updates` (the user's `.set()` payload). If any template variable is missing
 * from that union, the index is reported in `missing` instead of `actions` —
 * recomputing it would require reading the existing item from DynamoDB, which
 * the builder intentionally does not do.
 */
export const computeIndexUpdates = <M extends ModelDefinition>(
  model: M,
  keyVars: Record<string, any>,
  updates: Record<string, any>
): IndexUpdateAnalysis => {
  const actions: Record<string, string> = {};
  const missing: { index: string; template: string; missing: string[] }[] = [];

  if (!model.index) return { actions, missing };

  const updateKeys = new Set(Object.keys(updates));
  const combined: Record<string, any> = { ...keyVars, ...updates };

  for (const [indexName, indexDef] of Object.entries(model.index)) {
    const templateVars = extractTemplateVars(indexDef.value);
    const isAffected = templateVars.some((v) => updateKeys.has(v));
    if (!isAffected) continue;

    const missingVars = templateVars.filter((v) => combined[v] === undefined);
    if (missingVars.length > 0) {
      missing.push({ index: indexName, template: indexDef.value, missing: missingVars });
      continue;
    }

    actions[indexName] = resolveTemplate(indexDef.value, combined);
  }

  return { actions, missing };
};

/**
 * Applies default and generated values to validated input
 */
export const applyPostDefaults = <M extends ModelDefinition>(
  model: M,
  validatedItem: Record<string, any>,
  options?: { isUpdate?: boolean; timestamps?: boolean }
): InferModel<M> => {
  const result: Record<string, any> = { ...validatedItem };

  for (const [key, attr] of Object.entries(model.attributes)) {
    if (result[key] === undefined) {
      const generate = 'generate' in attr ? attr.generate : undefined;
      if (generate === 'ulid') {
        result[key] = ulid();
      } else if (generate === 'uuid') {
        result[key] = crypto.randomUUID();
      } else if (attr.default !== undefined) {
        result[key] = typeof attr.default === 'function' ? attr.default() : attr.default;
      }
    }
  }

  // Apply timestamps if enabled
  const enableTimestamps = options?.timestamps ?? false;
  const isUpdate = options?.isUpdate ?? false;

  if (enableTimestamps) {
    const now = new Date().toISOString();

    // Only set createdAt on new items (not updates)
    if (!isUpdate && result.createdAt === undefined) {
      result.createdAt = now;
    }

    // Always set updatedAt
    result.updatedAt = now;
  }

  return result as InferModel<M>;
};

/**
 * Default fallback list used when the caller doesn't pass a schema-derived
 * set. Covers only the conventional primary-key column names (PK, SK) and
 * the entity-type discriminator. Real consumers should pass the
 * schema-derived list returned by {@link collectInternalKeyColumns} so that
 * GSI/LSI columns and custom-named primary keys are also stripped.
 */
const DEFAULT_INTERNAL_KEYS: readonly string[] = ['PK', 'SK', '_type'];

/**
 * Derives the list of column names that should be stripped from returned
 * items when `cleanInternalKeys` is enabled, based on the schema's index
 * configuration. Returns the union of every index's hash + sort columns
 * plus the `_type` discriminator.
 *
 * Examples:
 * - `{ primary: { hash: 'PK', sort: 'SK' }, gsi1: { hash: 'GSI1PK', sort: 'GSI1SK' } }`
 *   → `['PK', 'SK', 'GSI1PK', 'GSI1SK', '_type']`
 * - `{ primary: { hash: 'pk', sort: 'sk' } }` → `['pk', 'sk', '_type']`
 */
export const collectInternalKeyColumns = (
  indexes: IndexesDefinition | undefined
): string[] => {
  const cols = new Set<string>();
  if (indexes) {
    for (const idx of Object.values(indexes)) {
      if (idx?.hash) cols.add(idx.hash);
      if (idx?.sort) cols.add(idx.sort);
    }
  }
  cols.add('_type');
  return [...cols];
};

/**
 * Removes internal DynamoDB keys from an item or array of items.
 *
 * Recurses into nested plain objects and arrays so an `_type` / `PK` / `SK`
 * field embedded inside an attribute value (e.g. a denormalized snapshot
 * of another entity) is also stripped. Class instances such as `Date` are
 * passed through untouched — recursing into them would lose their type.
 *
 * @param data - Single item, array of items, or any nested value from DynamoDB
 * @param internalKeys - Column names to strip. Defaults to `['PK', 'SK', '_type']`
 *   for backwards compatibility; consumers operating on a real schema should
 *   derive the list with {@link collectInternalKeyColumns} so GSI/LSI keys
 *   and custom-named primary keys are also removed.
 * @returns Data with internal keys removed at every level
 */
export const stripInternalKeys = <T>(
  data: T | T[] | undefined,
  internalKeys: readonly string[] = DEFAULT_INTERNAL_KEYS
): T | T[] | undefined => {
  if (data === undefined || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripInternalKeys(item, internalKeys)) as T[];
  }

  // Only recurse into plain objects; preserve Date, Buffer, Set, Map,
  // and anything else with a non-Object prototype.
  if (typeof data === 'object' && Object.getPrototypeOf(data) === Object.prototype) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (internalKeys.includes(key)) continue;
      cleaned[key] = stripInternalKeys(value, internalKeys);
    }
    return cleaned as T;
  }

  return data;
};
