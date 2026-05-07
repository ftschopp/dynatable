/* eslint-disable @typescript-eslint/no-explicit-any */

import { InferModel, KeyDefinition, ModelDefinition } from '@/core/types';
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
 * Internal DynamoDB keys that should be stripped when cleanInternalKeys is enabled
 */
const INTERNAL_KEYS = ['PK', 'SK', '_type'] as const;

/**
 * Removes internal DynamoDB keys from an item or array of items
 * @param data - Single item or array of items from DynamoDB
 * @returns Data with internal keys removed
 */
export const stripInternalKeys = <T>(data: T | T[] | undefined): T | T[] | undefined => {
  if (data === undefined || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripInternalKeys(item)) as T[];
  }

  if (typeof data === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (!INTERNAL_KEYS.includes(key as any)) {
        cleaned[key] = value;
      }
    }
    return cleaned as T;
  }

  return data;
};
