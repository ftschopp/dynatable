/* eslint-disable @typescript-eslint/no-explicit-any */

import { ModelDefinition } from '@/core/types';
import { extractTemplateVars } from '@/utils/model-utils';

/**
 * Validates that all required key fields are present in the key object
 * @throws Error if any required key fields are missing
 */
export function validateKeyFields(
  modelName: string,
  model: ModelDefinition,
  key: Record<string, unknown>,
  operation?: string
): void {
  // Extract required fields from key templates
  const requiredFields = new Set<string>();
  if (model.key) {
    for (const keyDef of Object.values(model.key)) {
      extractTemplateVars(keyDef.value).forEach((field) => requiredFields.add(field));
    }
  }

  // Check if all required fields are present
  const missingFields = Array.from(requiredFields).filter((field) => key[field] === undefined);

  if (missingFields.length > 0) {
    const operationSuffix = operation ? ` for ${operation}` : '';
    throw new Error(
      `[${modelName}] Missing required key field(s)${operationSuffix}: ${missingFields.join(', ')}. ` +
        `Required fields: ${Array.from(requiredFields).join(', ')}`
    );
  }
}
