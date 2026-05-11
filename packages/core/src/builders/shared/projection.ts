/**
 * Builds a `ProjectionExpression` together with the matching
 * `ExpressionAttributeNames` map so that any attribute — including
 * DynamoDB reserved words like `name`, `date`, `status`, `type`, `data`,
 * `count`, `size`, `value`, `time`, `year`, `source`, … — is referenced
 * via a `#placeholder`.
 *
 * Without this indirection DynamoDB rejects the request with
 * `ValidationException: Attribute name is a reserved keyword`.
 */
export function buildProjectionExpression(attrs: string[]): {
  ProjectionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
} {
  return {
    ProjectionExpression: attrs.map((attr) => `#${attr}`).join(', '),
    ExpressionAttributeNames: Object.fromEntries(attrs.map((attr) => [`#${attr}`, attr])),
  };
}
