/**
 * Shared lexer for the KIDE DSL family.
 *
 * All five Xtext grammars (Dml, Operation, Capability, Mnc, ActivityDiagram)
 * derive from `org.eclipse.xtext.common.Terminals`, so they share one token
 * vocabulary: ID, STRING, INT, ML/SL comments and punctuation.
 */

export type TokenType = "id" | "string" | "int" | "punct" | "eof";

export interface Token {
  type: TokenType;
  /** Raw source text of the token (string tokens carry the unquoted value). */
  value: string;
  /** Original text including quotes, for string tokens. */
  raw: string;
  offset: number;
  length: number;
  line: number;
  column: number;
}

const PUNCT_2 = ["=>", "->", ".*"];
const PUNCT_1 = "{}[]()<>,:;=+-*/&|.'\"!?%@#~^";

const ID_START = /[A-Za-z_]/;
const ID_PART = /[A-Za-z0-9_]/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const push = (type: TokenType, value: string, raw: string, start: number) => {
    tokens.push({
      type,
      value,
      raw,
      offset: start,
      length: raw.length,
      line,
      column: start - lineStart + 1,
    });
  };

  const at = (index: number): string => source[index] ?? "";

  while (i < source.length) {
    const ch = at(i);

    if (ch === "\n") {
      i += 1;
      line += 1;
      lineStart = i;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f") {
      i += 1;
      continue;
    }

    // Comments
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") {
          line += 1;
          lineStart = i + 1;
        }
        i += 1;
      }
      i += 2;
      continue;
    }

    // Strings (Xtext Terminals allows both quote styles)
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i += 1;
      let value = "";
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < source.length) {
          value += source[i + 1];
          i += 2;
          continue;
        }
        if (source[i] === "\n") {
          line += 1;
          lineStart = i + 1;
        }
        value += source[i];
        i += 1;
      }
      i += 1; // closing quote (tolerates EOF)
      push("string", value, source.slice(start, i), start);
      continue;
    }

    // Identifiers (Xtext allows a leading ^ escape)
    if (ID_START.test(ch) || (ch === "^" && ID_START.test(source[i + 1] ?? ""))) {
      const start = i;
      if (ch === "^") i += 1;
      const nameStart = i;
      while (i < source.length && ID_PART.test(at(i))) i += 1;
      push("id", source.slice(nameStart, i), source.slice(start, i), start);
      continue;
    }

    // Integers (floats / dates / ip addresses are composed by the parsers)
    if (ch >= "0" && ch <= "9") {
      const start = i;
      while (i < source.length && at(i) >= "0" && at(i) <= "9") i += 1;
      push("int", source.slice(start, i), source.slice(start, i), start);
      continue;
    }

    const two = source.slice(i, i + 2);
    if (PUNCT_2.includes(two)) {
      push("punct", two, two, i);
      i += 2;
      continue;
    }

    if (PUNCT_1.includes(ch)) {
      push("punct", ch, ch, i);
      i += 1;
      continue;
    }

    // Unknown character: emit as punctuation so the parser can report it.
    push("punct", ch, ch, i);
    i += 1;
  }

  tokens.push({
    type: "eof",
    value: "<end of file>",
    raw: "",
    offset: source.length,
    length: 0,
    line,
    column: source.length - lineStart + 1,
  });

  return tokens;
}
