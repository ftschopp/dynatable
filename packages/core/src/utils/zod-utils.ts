/* eslint-disable @typescript-eslint/no-explicit-any */
// -------------------- Zod Conversion --------------------

import { AttributeDefinition, ModelDefinition } from '@/core/types';
import { z, ZodObject, ZodType } from 'zod';

/**
 * Converts an attribute definition to a Zod schema type
 */
export const typeToZod = (attr: AttributeDefinition): ZodType => {
  const zodType: ZodType =
    attr.type === String
      ? z.string()
      : attr.type === Number
        ? z.number()
        : attr.type === Boolean
          ? z.boolean()
          : attr.type === Date
            ? z.date()
            : z.unknown();

  return attr.required ? zodType : zodType.optional();
};

/**
 * Converts a model definition to a Zod object schema
 * Uses passthrough mode to allow additional fields like createdAt/updatedAt
 * that are added by applyPostDefaults when timestamps are enabled
 */
export const modelToZod = (model: ModelDefinition): ZodObject<any> => {
  const shape: Record<string, ZodType> = {};
  for (const [key, attr] of Object.entries(model.attributes)) {
    shape[key] = typeToZod(attr);
  }
  return z.object(shape).passthrough();
};
