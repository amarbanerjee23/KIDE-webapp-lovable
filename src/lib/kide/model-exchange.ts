/**
 * Import and export of a complete model set.
 *
 * The exchange format is a single JSON document holding every model file with
 * its language, plus the checksum of each file so an imported set can be shown
 * to be exactly what was exported.
 */
import { dslKindForPath, type DslKind } from "@/lib/dsl";
import { MAX_WORKING_COPY_FILES, validateWorkingCopySources } from "@/lib/project-working-copy";
import { normalizeWorkspaceFilePath } from "@/lib/kide/workspace-files";
import { sha256 } from "./sha256";

export const EXCHANGE_FORMAT = "kide.modelset/1";
// Allows the complete 5M-character server-side source budget even when the
// JSON document escapes characters. Reject oversized uploads before file.text().
export const MAX_MODEL_SET_IMPORT_BYTES = 40 * 1024 * 1024;

export function isAcceptableModelSetSize(size: number): boolean {
  return Number.isSafeInteger(size) && size >= 0 && size <= MAX_MODEL_SET_IMPORT_BYTES;
}

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

export function exportModelSet(
  sources: Record<string, string>,
  exportedAt = new Date().toISOString(),
): ExchangeDocument {
  const validated = validateWorkingCopySources(sources);
  const files = Object.keys(validated)
    .sort()
    .map((path) => {
      const source = validated[path]!;
      const kind = dslKindForPath(path);
      if (!kind) throw new Error(`Cannot export unsupported model file "${path}".`);
      return { path, kind, source, sha256: sha256(source) };
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
  if (!isAcceptableModelSetSize(text.length)) {
    return { ...empty, problems: ["Model set is too large (maximum 40 MiB)."] };
  }
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
      problems: [
        `Unsupported file format. Expected ${EXCHANGE_FORMAT}, found ${String(doc?.format ?? "nothing")}.`,
      ],
    };
  }
  if (!Array.isArray(doc.files) || doc.files.length === 0) {
    return { ...empty, problems: ["The file contains no models."] };
  }
  if (doc.files.length > MAX_WORKING_COPY_FILES) {
    return {
      ...empty,
      problems: [`Workspace may contain at most ${MAX_WORKING_COPY_FILES} files.`],
    };
  }

  const problems: string[] = [];
  const sources: Record<string, string> = {};
  const paths = new Set<string>();
  for (const file of doc.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.source !== "string" ||
      typeof file.kind !== "string"
    ) {
      problems.push("One entry is missing its model path, language or content.");
      continue;
    }

    const kind = dslKindForPath(file.path);
    if (!kind || kind !== file.kind) {
      problems.push(`"${file.path}" has an unknown or mismatched model language.`);
      continue;
    }

    try {
      if (normalizeWorkspaceFilePath(file.path, kind) !== file.path) {
        problems.push(`"${file.path}" is not a normalized model path.`);
        continue;
      }
    } catch {
      problems.push(`"${file.path}" is not a safe model path.`);
      continue;
    }

    const identity = file.path.toLowerCase();
    if (paths.has(identity)) {
      problems.push(`Duplicate model file "${file.path}".`);
      continue;
    }
    paths.add(identity);

    if (typeof file.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      problems.push(`"${file.path}" is missing a valid SHA-256 checksum.`);
      continue;
    }
    if (file.sha256 !== sha256(file.source)) {
      problems.push(`"${file.path}" has been altered since export — its checksum does not match.`);
      continue;
    }

    sources[file.path] = file.source;
  }

  if (problems.length > 0) return { ...empty, problems };

  // A checksum-valid JSON document can still exceed the PostgreSQL working-copy
  // contract. Never let the UI replace the current workspace with unsaveable data.
  try {
    const validated = validateWorkingCopySources(sources);
    return {
      ok: true,
      problems: [],
      sources: validated,
      fileCount: Object.keys(validated).length,
    };
  } catch (error) {
    return {
      ...empty,
      problems: [error instanceof Error ? error.message : "Invalid model sources."],
    };
  }
}
