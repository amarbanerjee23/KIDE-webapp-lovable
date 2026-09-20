/**
 * Import and export of a complete model set.
 *
 * The exchange format is a single JSON document holding every model file with
 * its language, plus the checksum of each file so an imported set can be shown
 * to be exactly what was exported.
 */
import { DSL_LANGUAGES, type DslKind } from "@/lib/dsl";
import { SAMPLE_WORKSPACE } from "@/lib/dsl/samples";
import { sha256 } from "./sha256";

export const EXCHANGE_FORMAT = "kide.modelset/1";

export interface ExchangeFile {
  path: string;
  kind: DslKind;
  source: string;
  sha256: string;
}

export interface ExchangeDocument {
  format: string;
  exportedAt: string;
  files: ExchangeFile[];
}

function kindFor(path: string): DslKind | null {
  const language = DSL_LANGUAGES.find((entry) => path.endsWith(entry.extension));
  return language?.kind ?? null;
}

export function exportModelSet(
  sources: Record<string, string>,
  exportedAt = new Date().toISOString(),
): ExchangeDocument {
  const files = Object.keys(sources)
    .sort()
    .map((path) => {
      const source = sources[path] ?? "";
      return { path, kind: kindFor(path) ?? "dml", source, sha256: sha256(source) };
    });
  return { format: EXCHANGE_FORMAT, exportedAt, files };
}

export interface ImportOutcome {
  ok: boolean;
  problems: string[];
  sources: Record<string, string>;
  fileCount: number;
}

/** Reads an exported model set back, refusing anything it cannot verify. */
export function importModelSet(text: string): ImportOutcome {
  const empty: ImportOutcome = { ok: false, problems: [], sources: {}, fileCount: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...empty, problems: ["This file is not a KIDE model set — it is not valid JSON."] };
  }

  const doc = parsed as Partial<ExchangeDocument>;
  if (doc?.format !== EXCHANGE_FORMAT) {
    return {
      ...empty,
      problems: [`Unsupported file format. Expected ${EXCHANGE_FORMAT}, found ${String(doc?.format ?? "nothing")}.`],
    };
  }
  if (!Array.isArray(doc.files) || doc.files.length === 0) {
    return { ...empty, problems: ["The file contains no models."] };
  }

  const problems: string[] = [];
  const sources: Record<string, string> = {};
  for (const file of doc.files) {
    if (typeof file?.path !== "string" || typeof file?.source !== "string") {
      problems.push("One entry is missing its file name or its content.");
      continue;
    }
    if (!kindFor(file.path)) {
      problems.push(`"${file.path}" is not one of the five KIDE model languages.`);
      continue;
    }
    if (typeof file.sha256 === "string" && file.sha256 !== sha256(file.source)) {
      problems.push(`"${file.path}" has been altered since it was exported — its checksum does not match.`);
      continue;
    }
    sources[file.path] = file.source;
  }

  const expected = SAMPLE_WORKSPACE.map((file) => file.path);
  for (const path of expected) {
    if (!(path in sources)) problems.push(`The model set is missing ${path}.`);
  }

  return {
    ok: problems.length === 0,
    problems,
    sources,
    fileCount: Object.keys(sources).length,
  };
}
