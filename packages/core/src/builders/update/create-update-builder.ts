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
  consumedCapacity?: 'INDEXES' | 'TOTAL' | 'NONE'
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
        consumedCapacity
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
          consumedCapacity
        );
      }

      // Single update case
      const attrName = normalizeAttr(attrOrUpdates as keyof Model | AttrRef);
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
        consumedCapacity
      );
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
        consumedCapacity
      );
    },

    add(attr, value) {
      const attrName = normalizeAttr(attr);
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
        consumedCapacity
      );
    },

    delete(attr, value) {
      const attrName = normalizeAttr(attr);
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
        consumedCapacity
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
        consumedCapacity
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
        mode
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
        // old value. Catch this on every op (.set / .remove / .add / .delete)
        // before it leaves the process.
        const primaryKeyTemplateVars = new Set<string>();
        for (const keyDef of Object.values(indexContext.model.key)) {
          for (const v of extractTemplateVars(keyDef.value)) {
            primaryKeyTemplateVars.add(v);
          }
        }
        const allTouched = [...setFields, ...removeFields, ...addFields, ...deleteFields];
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
