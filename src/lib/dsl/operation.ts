import { BaseParser, ParseError } from "./parser-base";
import type { OperationDescriptionsNode, OperationNode, ParseResult } from "./ast";

/**
 * Parser for `com.operation.dsl.Operation` (`.op`), which extends Dml.
 *
 * Operation: 'Operation' name=EString '(' (Parameter (',' Parameter)*)? ')'
 *   '{' ('execute' executableScript=EString)? ('return' outputParameters=Parameter)? '}'
 */
class OperationParser extends BaseParser {
  parse(): OperationDescriptionsNode {
    const root: OperationDescriptionsNode = {
      node: "OperationDescriptions",
      operations: [],
    };
    const seen = new Set<string>();

    while (!this.atEnd) {
      if (!this.isKw("Operation")) {
        this.report(
          this.cur,
          `Expected 'Operation' but found '${this.cur.value}'. An operation file contains only 'Operation' declarations.`,
          "op.unexpected-top-level",
        );
        this.recoverTo(["Operation"]);
        continue;
      }
      try {
        const operation = this.operation();
        if (seen.has(operation.name)) {
          this.diagnostics.push({
            severity: "error",
            message: `Operation '${operation.name}' is declared more than once.`,
            code: "op.duplicate-operation",
            line: operation.line,
            column: operation.column,
            offset: operation.offset,
            length: operation.length,
          });
        }
        seen.add(operation.name);
        root.operations.push(operation);
      } catch (error) {
        if (error instanceof ParseError) {
          this.report(error.token, error.message, error.code);
          this.recoverTo(["Operation"]);
        } else {
          throw error;
        }
      }
    }

    return root;
  }

  private operation(): OperationNode {
    this.expectKw("Operation");
    const nameToken = this.eString("operation name");
    this.expectPunct("(");
    const inputParameters = this.parameterList(")");
    this.expectPunct(")");
    this.expectPunct("{");

    let executableScript: string | undefined;
    let outputParameter = undefined;

    if (this.isKw("execute")) {
      this.next();
      executableScript = this.eString("script reference").value;
    }
    if (this.isKw("return")) {
      this.next();
      outputParameter = this.parameter();
    }

    if (!this.isPunct("}")) {
      throw new ParseError(
        this.cur,
        `Expected 'execute', 'return' or '}' but found '${this.cur.value}'.`,
      );
    }
    this.expectPunct("}");

    const node: OperationNode = {
      node: "Operation",
      inputParameters,
      ...this.range(nameToken),
    };
    if (executableScript !== undefined) node.executableScript = executableScript;
    if (outputParameter !== undefined) node.outputParameter = outputParameter;
    return node;
  }
}

export function parseOperation(source: string): ParseResult<OperationDescriptionsNode> {
  const parser = new OperationParser(source);
  let ast: OperationDescriptionsNode | null = null;
  try {
    ast = parser.parse();
  } catch (error) {
    if (error instanceof ParseError) {
      parser.diagnostics.push({
        severity: "error",
        message: error.message,
        code: error.code,
        line: error.token.line,
        column: error.token.column,
        offset: error.token.offset,
        length: Math.max(error.token.length, 1),
      });
    } else {
      throw error;
    }
  }
  return {
    kind: "op",
    ast,
    diagnostics: parser.diagnostics,
    references: parser.references,
  };
}
