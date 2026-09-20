import { tokenize, type Token } from "./lexer";
import {
  PRIMITIVE_VALUE_TYPES,
  type Diagnostic,
  type Named,
  type ParameterNode,
  type PrimitiveValue,
  type PrimitiveValueType,
  type RefKind,
  type Reference,
  type Severity,
} from "./ast";

export class ParseError extends Error {
  constructor(
    public token: Token,
    message: string,
    public code = "parse.unexpected",
  ) {
    super(message);
    this.name = "ParseError";
  }
}

const EOF_TOKEN: Token = {
  type: "eof",
  value: "<end of file>",
  raw: "",
  offset: 0,
  length: 0,
  line: 1,
  column: 1,
};

/**
 * Recursive-descent parser base shared by all five KIDE languages.
 * Implements the pieces every grammar inherits from `com.dml.dsl.Dml`:
 * EString, QualifiedName, Parameter, PrimitiveValue and the numeric terminals.
 */
export class BaseParser {
  protected tokens: Token[];
  protected pos = 0;
  readonly diagnostics: Diagnostic[] = [];
  readonly references: Reference[] = [];

  constructor(protected source: string) {
    this.tokens = tokenize(source);
  }

  /* ---------------------------------------------------------------- */
  /* Token access                                                      */
  /* ---------------------------------------------------------------- */

  protected peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1] ?? EOF_TOKEN;
  }

  protected get cur(): Token {
    return this.peek(0);
  }

  protected get atEnd(): boolean {
    return this.cur.type === "eof";
  }

  protected next(): Token {
    const token = this.cur;
    if (!this.atEnd) this.pos += 1;
    return token;
  }

  /** True when the current token is the keyword `word` (an ID terminal). */
  protected isKw(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.type === "id" && token.value === word && token.raw[0] !== "^";
  }

  protected isPunct(sym: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.type === "punct" && token.value === sym;
  }

  protected acceptKw(word: string): boolean {
    if (this.isKw(word)) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  protected acceptPunct(sym: string): boolean {
    if (this.isPunct(sym)) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  protected expectKw(word: string): Token {
    if (!this.isKw(word)) {
      throw new ParseError(this.cur, `Expected '${word}' but found '${this.cur.value}'.`);
    }
    return this.next();
  }

  protected expectPunct(sym: string): Token {
    if (!this.isPunct(sym)) {
      throw new ParseError(this.cur, `Expected '${sym}' but found '${this.cur.value}'.`);
    }
    return this.next();
  }

  /* ---------------------------------------------------------------- */
  /* Diagnostics                                                       */
  /* ---------------------------------------------------------------- */

  protected report(
    token: Token,
    message: string,
    code: string,
    severity: Severity = "error",
  ): void {
    this.diagnostics.push({
      severity,
      message,
      code,
      line: token.line,
      column: token.column,
      offset: token.offset,
      length: Math.max(token.length, 1),
    });
  }

  protected recordRef(kind: RefKind, name: string, token: Token): string {
    this.references.push({
      kind,
      name,
      line: token.line,
      column: token.column,
      offset: token.offset,
      length: Math.max(name.length, 1),
    });
    return name;
  }

  protected range(token: Token): Named {
    return {
      name: token.value,
      line: token.line,
      column: token.column,
      offset: token.offset,
      length: Math.max(token.length, 1),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Dml terminals shared by every grammar                             */
  /* ---------------------------------------------------------------- */

  /** EString returns ecore::EString: STRING | ID; */
  protected eString(what = "name"): Token {
    if (this.cur.type === "id" || this.cur.type === "string") {
      return this.next();
    }
    throw new ParseError(this.cur, `Expected a ${what} but found '${this.cur.value}'.`);
  }

  /** QualifiedName: ID ('.' ID)*; */
  protected qualifiedName(): { value: string; token: Token } {
    const first = this.cur;
    if (first.type !== "id" && first.type !== "string") {
      throw new ParseError(this.cur, `Expected a name but found '${this.cur.value}'.`);
    }
    this.next();
    let value = first.value;
    while (this.isPunct(".") && this.peek(1).type === "id") {
      this.next();
      value += "." + this.next().value;
    }
    return { value, token: first };
  }

  protected qualifiedRef(kind: RefKind): string {
    const { value, token } = this.qualifiedName();
    return this.recordRef(kind, value, token);
  }

  /** Comma-separated list of qualified references. */
  protected qualifiedRefList(kind: RefKind): string[] {
    const out: string[] = [this.qualifiedRef(kind)];
    while (this.acceptPunct(",")) {
      if (this.cur.type !== "id" && this.cur.type !== "string") break;
      out.push(this.qualifiedRef(kind));
    }
    return out;
  }

  protected isPrimitiveValueType(offset = 0): boolean {
    const token = this.peek(offset);
    return (
      token.type === "id" &&
      PRIMITIVE_VALUE_TYPES.includes(token.value as PrimitiveValueType)
    );
  }

  protected primitiveValueType(): PrimitiveValueType {
    const token = this.next();
    return token.value as PrimitiveValueType;
  }

  /** EInt returns ecore::EInt: '-'? INT; */
  protected eInt(): number {
    const negative = this.acceptPunct("-");
    if (this.cur.type !== "int") {
      throw new ParseError(this.cur, `Expected an integer but found '${this.cur.value}'.`);
    }
    const value = Number.parseInt(this.next().value, 10);
    return negative ? -value : value;
  }

  /** EFloat returns ecore::EFloat: '-'? INT? '.' INT (('E'|'e') '-'? INT)?; */
  protected eFloat(): number {
    const start = this.cur;
    let text = "";
    if (this.acceptPunct("-")) text += "-";
    if (this.cur.type === "int") text += this.next().value;
    if (this.acceptPunct(".")) {
      text += ".";
      if (this.cur.type !== "int") {
        throw new ParseError(this.cur, "Expected digits after the decimal point.");
      }
      text += this.next().value;
    } else if (text === "" || text === "-") {
      throw new ParseError(start, `Expected a number but found '${start.value}'.`);
    }
    if (this.isKw("E") || this.isKw("e")) {
      this.next();
      text += "e";
      if (this.acceptPunct("-")) text += "-";
      if (this.cur.type !== "int") {
        throw new ParseError(this.cur, "Expected digits in the exponent.");
      }
      text += this.next().value;
    }
    return Number.parseFloat(text);
  }

  /**
   * PrimitiveValue: IntValue | FloatValue | StringValue | BoolValue |
   *                 DateValue | ArrayValues | AbstractObjectValue
   */
  protected primitiveValue(): PrimitiveValue {
    if (this.isPunct("[")) {
      this.next();
      const values: PrimitiveValue[] = [];
      if (!this.isPunct("]")) {
        values.push(this.primitiveValue());
        while (this.acceptPunct(",")) values.push(this.primitiveValue());
      }
      this.expectPunct("]");
      return { kind: "array", values };
    }

    if (this.cur.type === "string") {
      return { kind: "string", value: this.next().value };
    }

    if (this.isKw("true") || this.isKw("false")) {
      return { kind: "bool", value: this.next().value === "true" };
    }

    if (this.cur.type === "int" || this.isPunct("-") || this.isPunct(".")) {
      const negative = this.acceptPunct("-");
      if (this.isPunct(".")) {
        this.pos -= negative ? 1 : 0;
        return { kind: "float", value: this.eFloat() };
      }
      if (this.cur.type !== "int") {
        throw new ParseError(this.cur, `Expected a value but found '${this.cur.value}'.`);
      }
      const first = Number.parseInt(this.next().value, 10);

      // EDate: Day '-' Month '-' Year
      if (this.isPunct("-") && this.peek(1).type === "int") {
        this.next();
        const month = Number.parseInt(this.next().value, 10);
        this.expectPunct("-");
        if (this.cur.type !== "int") {
          throw new ParseError(this.cur, "Expected a year in the date value.");
        }
        const year = Number.parseInt(this.next().value, 10);
        return { kind: "date", day: negative ? -first : first, month, year };
      }

      // EFloat continuation
      if (this.isPunct(".") && this.peek(1).type === "int") {
        this.next();
        const frac = this.next().value;
        const value = Number.parseFloat(`${first}.${frac}`);
        return { kind: "float", value: negative ? -value : value };
      }

      return { kind: "int", value: negative ? -first : first };
    }

    if (this.cur.type === "id") {
      return { kind: "object", value: this.next().value };
    }

    throw new ParseError(this.cur, `Expected a value but found '${this.cur.value}'.`);
  }

  /**
   * Parameter: SimpleType | AbstractType | ArrayType
   *
   * Disambiguation follows the Xtext lookahead: a PrimitiveValueType keyword
   * starts a SimpleType or an ArrayType; anything else is a DataModel cross
   * reference (AbstractType or a typed ArrayType).
   */
  protected parameter(): ParameterNode {
    if (this.isPrimitiveValueType()) {
      const type = this.primitiveValueType();
      if (this.isPunct("[") && this.isPunct("]", 1)) {
        this.next();
        this.next();
        const nameToken = this.eString("array name");
        const values = this.arrayInitialiser();
        return {
          node: "ArrayType",
          primitiveType: type,
          values,
          ...this.range(nameToken),
        };
      }
      const nameToken = this.eString("parameter name");
      let value: PrimitiveValue | undefined;
      if (this.acceptPunct("=")) value = this.primitiveValue();
      return { node: "SimpleType", type, value, ...this.range(nameToken) };
    }

    const { value: typeRef, token } = this.qualifiedName();
    this.recordRef("dataModel", typeRef, token);

    if (this.isPunct("[") && this.isPunct("]", 1)) {
      this.next();
      this.next();
      const nameToken = this.eString("array name");
      const values = this.arrayInitialiser();
      return {
        node: "ArrayType",
        dataModelType: typeRef,
        values,
        ...this.range(nameToken),
      };
    }

    const nameToken = this.eString("parameter name");
    let value: string | undefined;
    if (this.acceptPunct("=")) {
      if (this.cur.type !== "id") {
        throw new ParseError(this.cur, "Expected an object value identifier.");
      }
      value = this.next().value;
    }
    return { node: "AbstractType", typeRef, value, ...this.range(nameToken) };
  }

  private arrayInitialiser(): PrimitiveValue[] {
    const values: PrimitiveValue[] = [];
    if (this.acceptPunct("=")) {
      this.expectPunct("[");
      if (!this.isPunct("]")) {
        values.push(this.primitiveValue());
        while (this.acceptPunct(",")) values.push(this.primitiveValue());
      }
      this.expectPunct("]");
    }
    return values;
  }

  protected parameterList(terminator: string): ParameterNode[] {
    const out: ParameterNode[] = [];
    if (this.isPunct(terminator)) return out;
    out.push(this.parameter());
    while (this.acceptPunct(",")) out.push(this.parameter());
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Error recovery                                                    */
  /* ---------------------------------------------------------------- */

  /** Skips tokens until one of `anchors` (an ID keyword) or EOF is reached. */
  protected recoverTo(anchors: string[]): void {
    let depth = 0;
    while (!this.atEnd) {
      if (this.isPunct("{") || this.isPunct("[") || this.isPunct("(")) depth += 1;
      if (this.isPunct("}") || this.isPunct("]") || this.isPunct(")")) {
        depth = Math.max(0, depth - 1);
      }
      this.pos += 1;
      if (depth === 0 && anchors.some((a) => this.isKw(a))) return;
    }
  }

  /** Consumes a balanced block that failed to parse, starting at '{'. */
  protected skipBalanced(): void {
    if (!this.isPunct("{")) return;
    let depth = 0;
    while (!this.atEnd) {
      if (this.isPunct("{")) depth += 1;
      else if (this.isPunct("}")) {
        depth -= 1;
        if (depth === 0) {
          this.pos += 1;
          return;
        }
      }
      this.pos += 1;
    }
  }

  protected duplicate(token: Token, section: string): void {
    this.report(
      token,
      `'${section}' is declared more than once in this block.`,
      "grammar.duplicate-section",
    );
  }
}
