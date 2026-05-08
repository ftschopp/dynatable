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
  const names: Record<string, string> = {};
  const projectionParts: string[] = [];

  attrs.forEach((attr) => {
    const placeholder = `#${attr}`;
    names[placeholder] = attr;
    projectionParts.push(placeholder);
  });

  return {
    ProjectionExpression: projectionParts.join(', '),
    ExpressionAttributeNames: names,
  };
}
