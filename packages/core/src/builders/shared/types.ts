/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared types for DynamoDB builders
 */

/**
 * Condition object for DynamoDB expressions
 */
export type Condition = {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, any>;
  operator?: 'AND' | 'OR';
  isNegated?: boolean;
  children?: Condition[];
};

/**
 * Attribute reference for building expressions
 */
export type AttrRef = {
  name: string;
  path?: string;
};

/**
 * Type-safe attribute builder for models
 * Note: All properties are required (non-optional) to ensure type safety in expressions
 */
export type AttrBuilder<Model> = {
  [K in keyof Model]-?: AttrRef;
};

/**
 * Available operators for building conditions
 */
export type OpBuilder = {
  // Comparison operators
  eq: (attr: AttrRef, value: any) => Condition;
  ne: (attr: AttrRef, value: any) => Condition;
  lt: (attr: AttrRef, value: any) => Condition;
  lte: (attr: AttrRef, value: any) => Condition;
  gt: (attr: AttrRef, value: any) => Condition;
  gte: (attr: AttrRef, value: any) => Condition;
  between: (attr: AttrRef, low: any, high: any) => Condition;

  // String/Set operators
  beginsWith: (attr: AttrRef, value: string) => Condition;
  contains: (attr: AttrRef, value: any) => Condition;

  // Attribute existence operators
  exists: (attr: AttrRef) => Condition;
  notExists: (attr: AttrRef) => Condition;

  // Type checking
  attributeType: (
    attr: AttrRef,
    type: 'S' | 'N' | 'B' | 'SS' | 'NS' | 'BS' | 'M' | 'L' | 'NULL' | 'BOOL'
  ) => Condition;

  // IN operator
  in: (attr: AttrRef, values: any[]) => Condition;

  // Size function
  size: (attr: AttrRef) => SizeRef;

  // Logical operators
  and: (...conditions: Condition[]) => Condition;
  or: (...conditions: Condition[]) => Condition;
  not: (condition: Condition) => Condition;
};

/**
 * Reference to the size() function result for comparisons
 */
export type SizeRef = {
  eq: (value: number) => Condition;
  ne: (value: number) => Condition;
  lt: (value: number) => Condition;
  lte: (value: number) => Condition;
  gt: (value: number) => Condition;
  gte: (value: number) => Condition;
};

/**
 * Base interface for executable builders
 */
export interface ExecutableBuilder<Result> {
  dbParams(): any;
  execute(): Promise<Result>;
}

/**
 * Base interface for operation builders with conditions
 */
export interface OperationBuilder<Model> {
  where(fn: (attr: AttrBuilder<Model>, op: OpBuilder) => Condition): this;
  dbParams(): any;
  execute(): Promise<Model>;
}
