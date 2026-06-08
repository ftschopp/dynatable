import { ModelDefinition } from '@/core/types';
import { UpdateAction } from '@/builders';
import { extractTemplateVars } from '@/utils/model-utils';

/**
 * Builds the SET actions that seed an `update()` so a create-via-update
 * (DynamoDB's UpdateItem is an upsert) produces a fully-formed item rather than
 * a half-written one.
 *
 * UpdateItem on a non-existent key writes only the Key (PK/SK) plus the caller's
 * explicit actions. That leaves two gaps versus `put()`, which writes the whole
 * validated model:
 *
 *  1. `_type` discriminator — `query()`/`scan()` filter on `#_type = :_type`, so
 *     an item created without it is silently invisible to both.
 *  2. Primary-key template variables (e.g. `id` in `PK: 'OPERATION#${id}'`) —
 *     they stay embedded inside the PK/SK strings and never become standalone
 *     columns, so a read with `cleanInternalKeys` (which strips PK/SK without
 *     reconstructing the vars) returns the item with `id: undefined`.
 *
 * Seeding both here mirrors how `put()` materializes the model. The update
 * builder stays agnostic — it just processes the actions it is handed. Two
 * properties make the seed safe to inject:
 *
 *  - Fixed `:_type` / `:_key_<attr>` placeholders keep these values out of the
 *    builder's value-name counter, so they never perturb the numbering of the
 *    caller's own `.set()` values (`:name_0`, …).
 *  - The key-var actions write the exact value already encoded in the Key, so
 *    they can never drift, and they bypass the PK-template immutability guard
 *    because that guard only inspects the caller's `.set()` payload — not the
 *    seeded actions handed to the builder.
 *
 * @param model     - The entity's model definition (source of the key templates)
 * @param modelName - The entity name, written as the `_type` discriminator
 * @param key       - The template-variable-bearing key passed to `update()`
 *                    (e.g. `{ id: '123' }`)
 * @returns The SET actions to seed the update builder's `set` list with.
 */
export const buildUpsertSeedActions = (
  model: ModelDefinition,
  modelName: string,
  key: Record<string, unknown>
): UpdateAction[] => {
  const seed: UpdateAction[] = [
    {
      expression: '#_type = :_type',
      names: { '#_type': '_type' },
      values: { ':_type': modelName },
    },
  ];

  // Collect every variable referenced by the primary-key templates (a var may
  // appear in both PK and SK; the Set dedupes it to a single SET action).
  const keyTemplateVars = new Set<string>();
  for (const keyDef of Object.values(model.key)) {
    for (const v of extractTemplateVars(keyDef.value)) keyTemplateVars.add(v);
  }

  for (const v of keyTemplateVars) {
    // A missing var would already have been caught by validateKeyFields; guard
    // anyway so we never emit an action with an undefined value.
    if (key[v] === undefined) continue;
    seed.push({
      expression: `#${v} = :_key_${v}`,
      names: { [`#${v}`]: v },
      values: { [`:_key_${v}`]: key[v] },
    });
  }

  return seed;
};
