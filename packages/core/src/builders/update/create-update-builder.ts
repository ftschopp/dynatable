/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { buildExpression, AttrBuilder, Condition, createOpBuilder, AttrRef } from '../shared';
import { UpdateBuilder, UpdateAction, IndexContext } from './types';
import { DynamoDBLogger } from '../../utils/dynamodb-logger';
import { computeIndexUpdates, extractTemplateVars } from '../../utils/model-utils';

/**
 * Pull the LHS attribute name out of a SET-action expression like
 * `#GSI1PK = :v_0` → `'GSI1PK'`. Returns `undefined` for shapes the
 * builder doesn't emit so callers can ignore them safely.
 */
function extractAttrName(action: UpdateAction): string | undefined {
  const m = action.expression.match(/^\s*#([A-Za-z0-9_]+)\s*=/);
  return m?.[1];
}

/**
 * Pull the attribute name from any update action (set / remove / add / delete).
 * Each action emitted by this builder carries exactly one entry in `names`
 * mapping `#<attr>` → `<attr>`, so the value side of that map is the source
 * of truth regardless of the surrounding expression syntax.
 */
function actionAttrName(action: UpdateAction): string | undefined {
  if (!action.names) return undefined;
  const values = Object.values(action.names);
  return values[0];
}

/**
 * Reject `undefined` before it reaches DynamoDB. SET / ADD / DELETE /
 * setIfNotExists all encode the value into `ExpressionAttributeValues` — an
 * `undefined` there is either silently dropped by the marshaller (when
 * `removeUndefinedValues` is on, which then fails server-side with an unused
 * expression value error) or rejected outright. Catching it at the call site
 * gives a useful error and a pointer to the right primitive.
 *
 * `null` is intentionally allowed — DynamoDB has a NULL attribute type and
 * the caller may legitimately want to write it.
 */
function assertNoUndefined(
  method: 'set' | 'setIfNotExists' | 'add' | 'delete',
  payload: Record<string, unknown> | { attr: string; value: unknown }
): void {
  const undefinedKeys =
    'attr' in payload
      ? payload.value === undefined
        ? [payload.attr]
        : []
      : Object.entries(payload)
          .filter(([, v]) => v === undefined)
          .map(([k]) => k);

  if (undefinedKeys.length === 0) return;

  const guidance =
    method === 'set'
      ? `Use .remove(attr) to clear an attribute, or filter undefined out ` +
        `before calling .set().`
      : method === 'setIfNotExists'
      ? `setIfNotExists requires a concrete value; omit the key or filter ` +
        `it out.`
      : `.${method}() requires a concrete value for each attribute.`;

  throw new Error(
    `.${method}() received undefined for key(s) [${undefinedKeys.join(', ')}]. ` +
      `DynamoDB cannot encode undefined in ExpressionAttributeValues. ${guidance}`
  );
}

/**
 * Creates an UpdateBuilder for an item key and table.
 *
 * When `indexContext` is provided, fields written via `.set()` that participate
 * in any secondary-index template are detected and the affected index keys are
 * recomputed automatically and included in the SET expression. If a template
 * cannot be fully resolved from the primary-key vars plus the updates, building
 * the params throws — the caller must include the missing fields in `.set()`.
 */
export function createUpdateBuilder<Model>(
  tableName: string,
  key: Partial<Model>,
  client: DynamoDBClient,
  prevConditions: Condition[] = [],
  updateActions: {
    set: UpdateAction[];
    remove: UpdateAction[];
    add: UpdateAction[];
    delete: UpdateAction[];
  } = { set: [], remove: [], add: [], delete: [] },
  returnMode: 'NONE' | 'ALL_OLD' | 'ALL_NEW' | 'UPDATED_OLD' | 'UPDATED_NEW' = 'NONE',
  valueCounter = 0,
  enableTimestamps = false,
  logger?: DynamoDBLogger,
  indexContext?: IndexContext,
  setInputs: Record<string, any> = {},
  consumedCapacity?: 'INDEXES' | 'TOTAL' | 'NONE',
  // Tracks attributes targeted by `.setIfNotExists()` separately from
  // `setInputs`. Index recomputation reads `setInputs` to resolve template
  // values; conditional writes can't supply a static value (DynamoDB picks
  // current vs `:v` at write time), so they must NOT participate in template
  // resolution — but the PK-template / index-template guards still need to
  // see them to reject schema-incompatible usage.
  setIfNotExistsInputs: Record<string, any> = {}
): UpdateBuilder<Model> {
  const conditions = [...prevConditions];

  const getUniqueValueName = (baseName: string): string => {
    return `${baseName}_${valueCounter++}`;
  };

  const normalizeAttr = (attr: keyof Model | AttrRef): string => {
    if (typeof attr === 'string') {
      return attr;
    }
    return (attr as AttrRef).name;
  };

  const build = (): UpdateBuilder<Model> => ({
    where(fn) {
      const attrs = new Proxy({} as AttrBuilder<Model>, {
        get(_, prop: string) {
          return { name: prop };
        },
      });
      const opBuilder = createOpBuilder();
      const condition = fn(attrs, opBuilder);
      return createUpdateBuilder(
        tableName,
        key,
        client,
        [...conditions, condition],
        updateActions,
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs,
        consumedCapacity,
        setIfNotExistsInputs
      );
    },

    set(attrOrUpdates: keyof Model | AttrRef | Partial<Model>, value?: any) {
      // When no value is provided and the first arg is a plain object,
      // treat it as a Partial<Model>. The AttrRef overload always passes
      // a value, so it's handled by the single-update path below.
      if (
        value === undefined &&
        typeof attrOrUpdates === 'object' &&
        attrOrUpdates !== null
      ) {
        // Multiple updates case
        const updates = attrOrUpdates as Partial<Model>;
        assertNoUndefined('set', updates as Record<string, unknown>);
        const newActions: UpdateAction[] = [];
        const newSetInputs = { ...setInputs };

        for (const [attr, val] of Object.entries(updates)) {
          const attrName = attr;
          const valueName = getUniqueValueName(attrName);
          newActions.push({
            expression: `#${attrName} = :${valueName}`,
            names: { [`#${attrName}`]: attrName },
            values: { [`:${valueName}`]: val },
          });
          newSetInputs[attrName] = val;
        }

        return createUpdateBuilder(
          tableName,
          key,
          client,
          conditions,
          { ...updateActions, set: [...updateActions.set, ...newActions] },
          returnMode,
          valueCounter,
          enableTimestamps,
          logger,
          indexContext,
          newSetInputs,
          consumedCapacity,
          setIfNotExistsInputs
        );
      }

      // Single update case
      const attrName = normalizeAttr(attrOrUpdates as keyof Model | AttrRef);
      assertNoUndefined('set', { attr: attrName, value });
      const valueName = getUniqueValueName(attrName);
      const action: UpdateAction = {
        expression: `#${attrName} = :${valueName}`,
        names: { [`#${attrName}`]: attrName },
        values: { [`:${valueName}`]: value },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, set: [...updateActions.set, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        { ...setInputs, [attrName]: value },
        consumedCapacity,
        setIfNotExistsInputs
      );
    },

    setIfNotExists(
      attrOrUpdates: keyof Model | AttrRef | Partial<Model>,
      value?: any
    ) {
      // Object form: treat as Partial<Model>. The AttrRef overload always
      // passes a value, so it routes through the single-update path below.
      if (
        value === undefined &&
        typeof attrOrUpdates === 'object' &&
        attrOrUpdates !== null
      ) {
        const updates = attrOrUpdates as Partial<Model>;
        assertNoUndefined('setIfNotExists', updates as Record<string, unknown>);
        const newActions: UpdateAction[] = [];
        const newSetIfNotExistsInputs = { ...setIfNotExistsInputs };

        for (const [attr, val] of Object.entries(updates)) {
          const attrName = attr;
          const valueName = getUniqueValueName(attrName);
          newActions.push({
            expression: `#${attrName} = if_not_exists(#${attrName}, :${valueName})`,
            names: { [`#${attrName}`]: attrName },
            values: { [`:${valueName}`]: val },
          });
          newSetIfNotExistsInputs[attrName] = val;
        }

        return createUpdateBuilder(
          tableName,
          key,
          client,
          conditions,
          { ...updateActions, set: [...updateActions.set, ...newActions] },
          returnMode,
          valueCounter,
          enableTimestamps,
          logger,
          indexContext,
          setInputs,
          consumedCapacity,
          newSetIfNotExistsInputs
        );
      }

      // Single update case
      const attrName = normalizeAttr(attrOrUpdates as keyof Model | AttrRef);
      assertNoUndefined('setIfNotExists', { attr: attrName, value });
      const valueName = getUniqueValueName(attrName);
      const action: UpdateAction = {
        expression: `#${attrName} = if_not_exists(#${attrName}, :${valueName})`,
        names: { [`#${attrName}`]: attrName },
        values: { [`:${valueName}`]: value },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, set: [...updateActions.set, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs,
        consumedCapacity,
        { ...setIfNotExistsInputs, [attrName]: value }
      );
    },

    setDefined(updates: Partial<Model>) {
      // Split the payload, then route through the public `.set()` and
      // `.remove()` paths so all of their guards apply unchanged: PK
      // template immutability, GSI template guard 2 (which will reject
      // any `undefined` targeting a GSI-template field), dedup, and the
      // index-key recomputation triggered by `setInputs`. Composing the
      // builder instead of re-emitting actions keeps the surface area
      // of this method as close to zero as possible.
      const defined: Record<string, unknown> = {};
      const toRemove: string[] = [];
      for (const [attr, val] of Object.entries(updates)) {
        if (val === undefined) {
          toRemove.push(attr);
        } else {
          defined[attr] = val;
        }
      }
      let next: UpdateBuilder<Model> = build();
      if (Object.keys(defined).length > 0) {
        next = next.set(defined as Partial<Model>);
      }
      for (const attr of toRemove) {
        next = next.remove(attr as keyof Model);
      }
      return next;
    },

    remove(attr) {
      const attrName = normalizeAttr(attr);
      const action: UpdateAction = {
        expression: `#${attrName}`,
        names: { [`#${attrName}`]: attrName },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, remove: [...updateActions.remove, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs,
        consumedCapacity,
        setIfNotExistsInputs
      );
    },

    add(attr, value) {
      const attrName = normalizeAttr(attr);
      assertNoUndefined('add', { attr: attrName, value });
      const valueName = getUniqueValueName(attrName);
      const action: UpdateAction = {
        expression: `#${attrName} :${valueName}`,
        names: { [`#${attrName}`]: attrName },
        values: { [`:${valueName}`]: value },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, add: [...updateActions.add, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs,
        consumedCapacity,
        setIfNotExistsInputs
      );
    },

    delete(attr, value) {
      const attrName = normalizeAttr(attr);
      assertNoUndefined('delete', { attr: attrName, value });
      const valueName = getUniqueValueName(attrName);
      const action: UpdateAction = {
        expression: `#${attrName} :${valueName}`,
        names: { [`#${attrName}`]: attrName },
        values: { [`:${valueName}`]: value },
      };
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        { ...updateActions, delete: [...updateActions.delete, action] },
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs,
        consumedCapacity,
        setIfNotExistsInputs
      );
    },

    returning(mode) {
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        updateActions,
        mode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs,
        consumedCapacity,
        setIfNotExistsInputs
      );
    },

    returnConsumedCapacity(mode) {
      return createUpdateBuilder(
        tableName,
        key,
        client,
        conditions,
        updateActions,
        returnMode,
        valueCounter,
        enableTimestamps,
        logger,
        indexContext,
        setInputs,
        mode,
        setIfNotExistsInputs
      );
    },

    dbParams() {
      // Clone updateActions to avoid mutation
      const actionsToProcess = { ...updateActions, set: [...updateActions.set] };

      // Auto-recompute secondary-index keys whose templates depend on any
      // updated field. If a template can't be fully resolved from the primary
      // key vars + the .set() payload, we throw — recomputing from the
      // existing item would require an extra read the builder won't do.
      if (indexContext) {
        // Collect the attribute name targeted by every update action,
        // grouped by op. `setInputs` carries the .set() payload (already
        // structured) — for remove/add/delete we read from the action's
        // attribute-name map.
        const setFields = Object.keys(setInputs);
        const setIfNotExistsFields = Object.keys(setIfNotExistsInputs);
        const removeFields = updateActions.remove
          .map(actionAttrName)
          .filter((n): n is string => !!n);
        const addFields = updateActions.add
          .map(actionAttrName)
          .filter((n): n is string => !!n);
        const deleteFields = updateActions.delete
          .map(actionAttrName)
          .filter((n): n is string => !!n);

        // Guard 1: primary-key template fields are immutable in DynamoDB.
        // The Key on the UpdateItem request fixes the row to operate on; if
        // the user changes a field that participates in the PK/SK template,
        // the row's PK doesn't move (DynamoDB doesn't allow that) but the
        // attribute does — leaving an inconsistent row whose PK encodes the
        // old value. Catch this on every op (.set / .setIfNotExists /
        // .remove / .add / .delete) before it leaves the process.
        const primaryKeyTemplateVars = new Set<string>();
        for (const keyDef of Object.values(indexContext.model.key)) {
          for (const v of extractTemplateVars(keyDef.value)) {
            primaryKeyTemplateVars.add(v);
          }
        }
        const allTouched = [
          ...setFields,
          ...setIfNotExistsFields,
          ...removeFields,
          ...addFields,
          ...deleteFields,
        ];
        const pkConflicts = [
          ...new Set(allTouched.filter((f) => primaryKeyTemplateVars.has(f))),
        ];
        if (pkConflicts.length > 0) {
          throw new Error(
            `Cannot update field(s) [${pkConflicts.join(', ')}] — they participate ` +
              `in the primary key template, which is immutable in DynamoDB. To ` +
              `"rename" a primary-key value, delete the old item and put a new one ` +
              `(ideally inside a transactWrite for atomicity).`
          );
        }

        // Guard 2: .add() / .remove() / .delete() against a field used in a
        // SECONDARY-index template. The recompute path needs an explicit new
        // value to resolve the template — ADD increments without exposing
        // the new value, REMOVE strips the field entirely, and DELETE
        // mutates a Set without naming a scalar. Switching to .set(field,
        // newValue) lets the recompute path handle it correctly.
        //
        // Guard 3: .setIfNotExists() against a field used in a SECONDARY-index
        // template. The resolved value is decided by DynamoDB at write time
        // (current attr vs `:v`), so the recompute path cannot statically
        // produce a value that's guaranteed consistent with the stored
        // attribute. Allowing it would silently corrupt the index whenever
        // the conditional write keeps the existing value.
        if (indexContext.model.index) {
          const indexTemplateVars = new Set<string>();
          for (const indexDef of Object.values(indexContext.model.index)) {
            for (const v of extractTemplateVars(indexDef.value)) {
              indexTemplateVars.add(v);
            }
          }
          const nonSetTouches = [...removeFields, ...addFields, ...deleteFields];
          const gsiConflicts = [
            ...new Set(nonSetTouches.filter((f) => indexTemplateVars.has(f))),
          ];
          if (gsiConflicts.length > 0) {
            throw new Error(
              `Cannot use .add() / .remove() / .delete() on field(s) ` +
                `[${gsiConflicts.join(', ')}] — they participate in a ` +
                `secondary-index template, and the affected index key cannot be ` +
                `recomputed without an explicit new value. Use .set(field, ` +
                `newValue) instead so the index key is recomputed atomically.`
            );
          }

          const ifNotExistsGsiConflicts = [
            ...new Set(setIfNotExistsFields.filter((f) => indexTemplateVars.has(f))),
          ];
          if (ifNotExistsGsiConflicts.length > 0) {
            throw new Error(
              `Cannot use .setIfNotExists() on field(s) ` +
                `[${ifNotExistsGsiConflicts.join(', ')}] — they participate in a ` +
                `secondary-index template, and if_not_exists() may keep the ` +
                `existing value at write time, which would leave the index key ` +
                `inconsistent with the stored attribute. Either restructure the ` +
                `schema so this field is not part of any GSI template, or perform ` +
                `a get + conditional .set() in two steps.`
            );
          }
        }

        const { actions: idxActions, missing } = computeIndexUpdates(
          indexContext.model,
          indexContext.keyVars,
          setInputs
        );
        if (missing.length > 0) {
          const details = missing
            .map(
              (m) =>
                `  - ${m.index} ("${m.template}"): missing ${m.missing.join(', ')}`
            )
            .join('\n');
          throw new Error(
            `Update touches fields that participate in secondary index templates, ` +
              `but the templates cannot be fully resolved from the update payload. ` +
              `Include the missing fields in .set():\n${details}`
          );
        }
        // If the user's `.set()` already targets the same index-key
        // attribute (e.g. `.set('GSI1PK', 'foo')`), refuse to silently
        // emit a second SET against the same path. DynamoDB rejects
        // `SET #GSI1PK = :a, #GSI1PK = :b` outright, and namespacing the
        // placeholders only hides which one wins. Force the caller to
        // resolve the conflict explicitly.
        const userSetKeys = new Set(actionsToProcess.set.map(extractAttrName));
        userSetKeys.delete(undefined);
        const conflicts = Object.keys(idxActions).filter((k) => userSetKeys.has(k));
        if (conflicts.length > 0) {
          throw new Error(
            `Update would write the same secondary-index key twice: ` +
              `[${conflicts.join(', ')}] is recomputed from the index template AND ` +
              `set explicitly via .set(). Either remove the explicit .set() and let ` +
              `the recomputation handle it, or include all template variables in ` +
              `.set() so you take full control.`
          );
        }
        for (const [indexName, resolved] of Object.entries(idxActions)) {
          const valueName = getUniqueValueName(indexName);
          actionsToProcess.set.push({
            expression: `#${indexName} = :${valueName}`,
            names: { [`#${indexName}`]: indexName },
            values: { [`:${valueName}`]: resolved },
          });
        }
      }

      // Add updatedAt timestamp if enabled
      if (enableTimestamps) {
        const now = new Date().toISOString();
        const timestampAction: UpdateAction = {
          expression: `#updatedAt = :updatedAt_ts`,
          names: { '#updatedAt': 'updatedAt' },
          values: { ':updatedAt_ts': now },
        };
        actionsToProcess.set = [...actionsToProcess.set, timestampAction];
      }

      // Dedup guard: DynamoDB rejects overlapping document paths inside a
      // SET expression (e.g. `SET #foo = :a, #foo = :b` → ValidationException
      // "Two document paths overlap"). Catch the common footguns —
      // .set().set() on the same key, .set() + .setIfNotExists() on the
      // same key, and enableTimestamps + .set/.setIfNotExists('updatedAt')
      // — before the network round-trip. Runs AFTER the timestamp injection
      // so #updatedAt collisions are also reported.
      const setActionNames = actionsToProcess.set
        .map(actionAttrName)
        .filter((n): n is string => !!n);
      const duplicateSetAttrs = [
        ...new Set(
          setActionNames.filter(
            (n, i) => setActionNames.indexOf(n) !== i
          )
        ),
      ];
      if (duplicateSetAttrs.length > 0) {
        throw new Error(
          `Update would emit multiple SET actions targeting the same ` +
            `attribute(s) [${duplicateSetAttrs.join(', ')}]. DynamoDB rejects ` +
            `overlapping document paths. Check that you're not combining ` +
            `.set() and .setIfNotExists() on the same field, calling .set() ` +
            `twice for the same key, or targeting an attribute that ` +
            `enableTimestamps already manages (updatedAt).`
        );
      }

      const buildSection = (
        label: 'SET' | 'REMOVE' | 'ADD' | 'DELETE',
        actions: UpdateAction[],
        includeValues: boolean
      ) =>
        actions.length === 0
          ? null
          : {
              part: `${label} ${actions.map((a) => a.expression).join(', ')}`,
              names: Object.assign({}, ...actions.map((a) => a.names ?? {})) as Record<
                string,
                string
              >,
              values: includeValues
                ? (Object.assign({}, ...actions.map((a) => a.values ?? {})) as Record<
                    string,
                    any
                  >)
                : {},
            };

      const sections = [
        buildSection('SET', actionsToProcess.set, true),
        buildSection('REMOVE', updateActions.remove, false),
        buildSection('ADD', updateActions.add, true),
        buildSection('DELETE', updateActions.delete, true),
      ].filter((s): s is NonNullable<typeof s> => s !== null);

      const updateExpression = sections.map((s) => s.part).join(' ');
      const allNames: Record<string, string> = Object.assign(
        {},
        ...sections.map((s) => s.names)
      );
      const allValues: Record<string, any> = Object.assign(
        {},
        ...sections.map((s) => s.values)
      );

      // DynamoDB rejects an UpdateCommand without an UpdateExpression
      // ("ValidationException: ExpressionAttributeNames must not be empty"
      // or worse, "Member must not be null"). Throw a clearer error
      // before the request leaves the process so the caller knows they
      // forgot to call .set/.add/.remove/.delete.
      if (!updateExpression) {
        throw new Error(
          'Update has no SET, REMOVE, ADD, or DELETE actions. Add at least one ' +
            'before calling dbParams() / execute(). To check for existence without ' +
            'modifying anything, use a get() instead.'
        );
      }

      // Build ConditionExpression from conditions
      const conditionResult =
        conditions.length > 0
          ? buildExpression(
              conditions.length === 1 && conditions[0]
                ? conditions[0]
                : { expression: '', operator: 'AND' as const, children: conditions }
            )
          : { expression: '', names: {} as Record<string, string>, values: {} as Record<string, any> };

      const expressionAttributeNames = { ...allNames, ...conditionResult.names };
      const expressionAttributeValues = { ...allValues, ...conditionResult.values };

      return {
        TableName: tableName,
        Key: key,
        ...(updateExpression && { UpdateExpression: updateExpression }),
        ...(conditionResult.expression && { ConditionExpression: conditionResult.expression }),
        ...(Object.keys(expressionAttributeNames).length && {
          ExpressionAttributeNames: expressionAttributeNames,
        }),
        ...(Object.keys(expressionAttributeValues).length && {
          ExpressionAttributeValues: expressionAttributeValues,
        }),
        ...(consumedCapacity && { ReturnConsumedCapacity: consumedCapacity }),
        ...(returnMode !== 'NONE' && { ReturnValues: returnMode }),
      } as any;
    },

    async execute() {
      const params = build().dbParams();
      const response = await client.send(new UpdateCommand(params));
      logger?.log('UpdateCommand', params, response);

      // Return the item based on returnMode
      if (response.Attributes) {
        return response.Attributes as Model;
      }

      // If no attributes returned (NONE mode), return undefined
      return undefined as unknown as Model;
    },
  });

  return build();
}
