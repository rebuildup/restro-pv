// ES3 artifact check for generated JSX, adapted from Aulymo_v04.
// ExtendScript is an ES3-era engine: parse with acorn ecmaVersion 3,
// reject non-ASCII bytes, known Babel/runtime helpers, nested conditionals,
// and expressions that mix || and && (ExtendScript evaluates them differently).
import * as acorn from "acorn";
import { type AstNode, isNode, logicalOperatorsOf, walk } from "./logical-operators.ts";

export type Es3Violation = { line: number; column: number; message: string };

const HELPER_PATTERN =
  /^(_(createForOfIteratorHelper|unsupportedIterableToArray|arrayLikeToArray|iterableToArray|nonIterable|toConsumableArray|arrayWithoutHoles|arrayWithHoles|iterableToArrayLimit|slicedToArray|classCallCheck|createClass|defineProperty|extends|inherits|getPrototypeOf|setPrototypeOf|possibleConstructorReturn|objectSpread|objectWithoutProperties|typeof|assertThisInitialized|callSuper|construct|wrapNativeSuper|readOnlyError|get|set)\w*|regeneratorRuntime)$/;

function lineAndColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset).split("\n");
  return { line: before.length, column: (before[before.length - 1] ?? "").length + 1 };
}

function nonAsciiViolations(source: string): Es3Violation[] {
  const found: Es3Violation[] = [];
  source.split("\n").forEach((text, index) => {
    for (let column = 0; column < text.length; column++) {
      const code = text.charCodeAt(column);
      if (code > 0x7f) {
        found.push({
          line: index + 1,
          column: column + 1,
          message: `non-ASCII character U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
        });
      }
    }
  });
  return found;
}

export function checkEs3(source: string): Es3Violation[] {
  const violations: Es3Violation[] = [...nonAsciiViolations(source)];
  let program: AstNode;
  try {
    program = acorn.parse(source, {
      ecmaVersion: 3,
      allowReserved: "never",
      sourceType: "script",
      locations: true,
    }) as unknown as AstNode;
  } catch (error) {
    const err = error as { message: string; loc?: { line: number; column: number } };
    violations.push({
      line: err.loc?.line ?? 0,
      column: (err.loc?.column ?? 0) + 1,
      message: `ES3 parse error: ${err.message}`,
    });
    return violations;
  }

  walk(program, (node) => {
    if (node.type === "Identifier" && HELPER_PATTERN.test(String(node.name))) {
      violations.push({
        ...lineAndColumn(source, node.start),
        message: `Babel/helper identifier ${String(node.name)} is not allowed`,
      });
    }
    return true;
  });

  walk(program, (node) => {
    if (node.type !== "ConditionalExpression") return true;
    let nested = false;
    for (const key of ["test", "consequent", "alternate"]) {
      const child = node[key];
      if (isNode(child)) {
        walk(child, (inner) => {
          if (inner.type === "ConditionalExpression") nested = true;
          return !nested;
        });
      }
    }
    if (nested)
      violations.push({
        ...lineAndColumn(source, node.start),
        message: "nested conditional expression is not allowed",
      });
    return true;
  });

  walk(program, (node) => {
    if (node.type !== "LogicalExpression") return true;
    const operators = logicalOperatorsOf(node);
    if (operators.has("||") && operators.has("&&")) {
      violations.push({
        ...lineAndColumn(source, node.start),
        message: "mixed || and && in one expression is not allowed",
      });
      return false;
    }
    return true;
  });

  return violations;
}
