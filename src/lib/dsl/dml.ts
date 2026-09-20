import { BaseParser, ParseError } from "./parser-base";
import type {
  DataModelNode,
  DataPackageNode,
  ParameterNode,
  ParseResult,
} from "./ast";

/**
 * Parser for `com.dml.dsl.Dml` — the KIDE data modelling language (`.dml`).
 *
 * DataPackage: ('Package' name=EString)? (dataModelCollections+=DataModel*)
 */
class DmlParser extends BaseParser {
  parse(): DataPackageNode {
    const pkg: DataPackageNode = { node: "DataPackage", dataModels: [] };

    if (this.isKw("Package")) {
      this.next();
      pkg.name = this.eString("package name").value;
    }

    const seen = new Map<string, true>();
    while (!this.atEnd) {
      if (!this.isKw("DataModel")) {
        this.report(
          this.cur,
          `Expected 'DataModel' but found '${this.cur.value}'. A data model file contains an optional 'Package' declaration followed by 'DataModel' blocks.`,
          "dml.unexpected-top-level",
        );
        this.recoverTo(["DataModel"]);
        continue;
      }
      try {
        const model = this.dataModel();
        if (seen.has(model.name)) {
          this.report(
            { ...this.cur, ...model, value: model.name, type: "id", raw: model.name },
            `Data model '${model.name}' is declared more than once.`,
            "dml.duplicate-data-model",
          );
        }
        seen.set(model.name, true);
        pkg.dataModels.push(model);
      } catch (error) {
        this.handle(error);
        this.recoverTo(["DataModel"]);
      }
    }

    return pkg;
  }

  private handle(error: unknown): void {
    if (error instanceof ParseError) {
      this.report(error.token, error.message, error.code);
      return;
    }
    throw error;
  }

  /**
   * DataModel: 'DataModel' name=EString '{'
   *   ('primitives' '{' Parameter (',' Parameter)* '}')? &
   *   ('composites' '{' [DataModel] (',' [DataModel])* '}')?
   * '}'
   */
  private dataModel(): DataModelNode {
    this.expectKw("DataModel");
    const nameToken = this.eString("data model name");
    this.expectPunct("{");

    const primitives: ParameterNode[] = [];
    const composites: string[] = [];
    let sawPrimitives = false;
    let sawComposites = false;

    while (!this.isPunct("}") && !this.atEnd) {
      if (this.isKw("primitives")) {
        const token = this.next();
        if (sawPrimitives) this.duplicate(token, "primitives");
        sawPrimitives = true;
        this.expectPunct("{");
        if (!this.isPunct("}")) {
          primitives.push(this.parameter());
          while (this.acceptPunct(",")) primitives.push(this.parameter());
        }
        this.expectPunct("}");
        continue;
      }
      if (this.isKw("composites")) {
        const token = this.next();
        if (sawComposites) this.duplicate(token, "composites");
        sawComposites = true;
        this.expectPunct("{");
        if (!this.isPunct("}")) {
          composites.push(...this.qualifiedRefList("dataModel"));
        }
        this.expectPunct("}");
        continue;
      }
      throw new ParseError(
        this.cur,
        `Expected 'primitives' or 'composites' but found '${this.cur.value}'.`,
      );
    }

    this.expectPunct("}");

    const duplicates = new Set<string>();
    const names = new Set<string>();
    for (const parameter of primitives) {
      if (names.has(parameter.name)) duplicates.add(parameter.name);
      names.add(parameter.name);
    }
    for (const parameter of primitives) {
      if (duplicates.has(parameter.name)) {
        this.diagnostics.push({
          severity: "error",
          message: `Parameter '${parameter.name}' is declared more than once in data model '${nameToken.value}'.`,
          code: "dml.duplicate-parameter",
          line: parameter.line,
          column: parameter.column,
          offset: parameter.offset,
          length: parameter.length,
        });
        duplicates.delete(parameter.name);
      }
    }

    return {
      node: "DataModel",
      primitives,
      composites,
      ...this.range(nameToken),
    };
  }
}

export function parseDml(source: string): ParseResult<DataPackageNode> {
  const parser = new DmlParser(source);
  let ast: DataPackageNode | null = null;
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
    kind: "dml",
    ast,
    diagnostics: parser.diagnostics,
    references: parser.references,
  };
}
