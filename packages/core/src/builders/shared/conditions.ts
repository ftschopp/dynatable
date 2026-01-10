import { Condition } from './types';

/**
 * Builds a DynamoDB expression from a condition tree
 */
export function buildExpression(condition: Condition): {
  expression: string;
  names: Record<string, string>;
  values: Record<string, any>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, any> = {};

  function processCondition(cond: Condition): string {
    // If it's a combinator (AND/OR)
    if (cond.operator && cond.children) {
      const childExpressions = cond.children
        .map((child) => processCondition(child))
        .filter((expr) => expr.length > 0);

      if (childExpressions.length === 0) return '';
      if (childExpressions.length === 1) return childExpressions[0]!;

      const combined = childExpressions.map((expr) => `(${expr})`).join(` ${cond.operator} `);

      return cond.isNegated ? `NOT (${combined})` : combined;
    }

    // It's a leaf condition
    if (cond.names) {
      Object.assign(names, cond.names);
    }
    if (cond.values) {
      Object.assign(values, cond.values);
    }

    return cond.isNegated ? `NOT (${cond.expression})` : cond.expression;
  }

  const expression = processCondition(condition);

  return { expression, names, values };
}

/**
 * Combines multiple conditions into a DynamoDB-compatible expression object.
 */
export function buildConditionExpr(conditions: Condition[]) {
  const expression = conditions.map((c) => c.expression).join(' AND ');
  const names = Object.assign({}, ...conditions.map((c) => c.names ?? {}));
  const values = Object.assign({}, ...conditions.map((c) => c.values ?? {}));

  return {
    ConditionExpression: expression || undefined,
    ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
    ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
  };
}
