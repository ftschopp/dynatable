import { OpBuilder } from './types';

/**
 * Creates a scoped OpBuilder with its own counter for unique value placeholders.
 * Each builder instance maintains isolated state to prevent naming conflicts.
 */
export function createOpBuilder(): OpBuilder {
  let valueCounter = 0;

  /**
   * Generates a unique value placeholder name within this builder's scope
   */
  function getUniqueValueName(baseName: string): string {
    return `${baseName}_${valueCounter++}`;
  }

  return {
    eq: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `#${attr.name} = :${valueName}`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    ne: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `#${attr.name} <> :${valueName}`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    lt: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `#${attr.name} < :${valueName}`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    lte: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `#${attr.name} <= :${valueName}`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    gt: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `#${attr.name} > :${valueName}`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    gte: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `#${attr.name} >= :${valueName}`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    between: (attr, low, high) => {
      const lowName = getUniqueValueName(`${attr.name}_low`);
      const highName = getUniqueValueName(`${attr.name}_high`);
      return {
        expression: `#${attr.name} BETWEEN :${lowName} AND :${highName}`,
        names: { [`#${attr.name}`]: attr.name },
        values: {
          [`:${lowName}`]: low,
          [`:${highName}`]: high,
        },
      };
    },
    beginsWith: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `begins_with(#${attr.name}, :${valueName})`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    contains: (attr, value) => {
      const valueName = getUniqueValueName(attr.name);
      return {
        expression: `contains(#${attr.name}, :${valueName})`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: value },
      };
    },
    exists: (attr) => ({
      expression: `attribute_exists(#${attr.name})`,
      names: { [`#${attr.name}`]: attr.name },
    }),
    notExists: (attr) => ({
      expression: `attribute_not_exists(#${attr.name})`,
      names: { [`#${attr.name}`]: attr.name },
    }),
    attributeType: (attr, type) => {
      const valueName = getUniqueValueName(`${attr.name}_type`);
      return {
        expression: `attribute_type(#${attr.name}, :${valueName})`,
        names: { [`#${attr.name}`]: attr.name },
        values: { [`:${valueName}`]: type },
      };
    },
    in: (attr, values) => {
      const valueNames = values.map((_, i) => getUniqueValueName(`${attr.name}_in${i}`));
      const placeholders = valueNames.map((name) => `:${name}`).join(', ');
      const valuesObj: Record<string, any> = {};
      valueNames.forEach((name, i) => {
        valuesObj[`:${name}`] = values[i];
      });

      return {
        expression: `#${attr.name} IN (${placeholders})`,
        names: { [`#${attr.name}`]: attr.name },
        values: valuesObj,
      };
    },
    size: (attr) => {
      const sizeExpr = `size(#${attr.name})`;
      const names = { [`#${attr.name}`]: attr.name };

      return {
        eq: (value: number) => {
          const valueName = getUniqueValueName(`${attr.name}_size`);
          return {
            expression: `${sizeExpr} = :${valueName}`,
            names,
            values: { [`:${valueName}`]: value },
          };
        },
        ne: (value: number) => {
          const valueName = getUniqueValueName(`${attr.name}_size`);
          return {
            expression: `${sizeExpr} <> :${valueName}`,
            names,
            values: { [`:${valueName}`]: value },
          };
        },
        lt: (value: number) => {
          const valueName = getUniqueValueName(`${attr.name}_size`);
          return {
            expression: `${sizeExpr} < :${valueName}`,
            names,
            values: { [`:${valueName}`]: value },
          };
        },
        lte: (value: number) => {
          const valueName = getUniqueValueName(`${attr.name}_size`);
          return {
            expression: `${sizeExpr} <= :${valueName}`,
            names,
            values: { [`:${valueName}`]: value },
          };
        },
        gt: (value: number) => {
          const valueName = getUniqueValueName(`${attr.name}_size`);
          return {
            expression: `${sizeExpr} > :${valueName}`,
            names,
            values: { [`:${valueName}`]: value },
          };
        },
        gte: (value: number) => {
          const valueName = getUniqueValueName(`${attr.name}_size`);
          return {
            expression: `${sizeExpr} >= :${valueName}`,
            names,
            values: { [`:${valueName}`]: value },
          };
        },
      };
    },
    and: (...conditions) => ({
      expression: '',
      operator: 'AND',
      children: conditions,
    }),
    or: (...conditions) => ({
      expression: '',
      operator: 'OR',
      children: conditions,
    }),
    not: (condition) => ({
      ...condition,
      isNegated: true,
    }),
  };
}

/**
 * @deprecated Use createOpBuilder() instead to avoid global state.
 * This export is maintained for backward compatibility.
 */
export const opBuilder: OpBuilder = createOpBuilder();
