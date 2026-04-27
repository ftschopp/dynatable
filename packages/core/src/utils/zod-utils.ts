/* eslint-disable @typescript-eslint/no-explicit-any */
// -------------------- Zod Conversion --------------------

import { AttributeDefinition, ModelDefinition } from '@/core/types';
import { z, ZodObject, ZodType } from 'zod';

/**
 * Converts an attribute definition to a Zod schema type.
 * Supports scalars, nested objects (with schema), and arrays (with items).
 */
export const typeToZod = (attr: AttributeDefinition): ZodType => {
  let zodType: ZodType;

  if (attr.type === Object) {
    const schema = (attr as { schema?: Record<string, AttributeDefinition> }).schema;
    if (schema) {
      const shape: Record<string, ZodType> = {};
      for (const [key, nestedAttr] of Object.entries(schema)) {
        shape[key] = typeToZod(nestedAttr);
      }
      zodType = z.looseObject(shape);
    } else {
      zodType = z.record(z.string(), z.unknown());
    }
  } else if (attr.type === Array) {
    const items = (attr as { items?: AttributeDefinition }).items;
    zodType = items ? z.array(typeToZod(items)) : z.array(z.unknown());
  } else {
    zodType =
      attr.type === String
        ? z.string()
        : attr.type === Number
          ? z.number()
          : attr.type === Boolean
            ? z.boolean()
            : attr.type === Date
              ? z.date()
              : z.unknown();
  }

  const isGenerated = 'generate' in attr;
  return attr.required && !isGenerated ? zodType : zodType.optional();
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
  return z.looseObject(shape);
};
