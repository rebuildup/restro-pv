export type AstNode = { type: string; start: number; end: number; [key: string]: unknown };

export function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";
}

export function walk(node: AstNode, visit: (node: AstNode) => boolean): void {
  if (!visit(node)) return;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "range") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) walk(item, visit);
    } else if (isNode(value)) {
      walk(value, visit);
    }
  }
}

export function logicalOperatorsOf(node: AstNode): Set<string> {
  const operators = new Set<string>();
  const pending: AstNode[] = [node];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current.type !== "LogicalExpression") continue;
    operators.add(String(current.operator));
    for (const operand of [current.left, current.right]) {
      if (isNode(operand)) pending.push(operand);
    }
  }
  return operators;
}
