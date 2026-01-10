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
      if (attr.generate === 'ulid') {
        result[key] = ulid();
      } else if (attr.generate === 'uuid') {
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
