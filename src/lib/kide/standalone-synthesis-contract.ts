import type { DslKind, WorkspaceFile } from "@/lib/dsl";

export interface StandaloneSynthesisInput {
  files: WorkspaceFile[];
}

const DSL_KINDS = new Set<DslKind>(["dml", "op", "mncspec", "cap", "activity"]);
const MAX_FILES = 100;
const MAX_PATH_LENGTH = 512;
const MAX_SOURCE_CHARACTERS = 1_000_000;
const MAX_TOTAL_SOURCE_CHARACTERS = 5_000_000;

export function validateStandaloneSynthesisInput(data: unknown): StandaloneSynthesisInput {
  if (typeof data !== "object" || data === null || !("files" in data)) {
    throw new Error("files is required");
  }

  const rawFiles = (data as { files?: unknown }).files;
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    throw new Error("files must be a non-empty array");
  }
  if (rawFiles.length > MAX_FILES) {
    throw new Error(`files exceeds the maximum of ${MAX_FILES}`);
  }

  const seen = new Set<string>();
  let totalCharacters = 0;
  const files: WorkspaceFile[] = rawFiles.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`files[${index}] must be an object`);
    }

    const file = raw as { path?: unknown; kind?: unknown; source?: unknown };
    if (
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      file.path.length > MAX_PATH_LENGTH ||
      file.path.includes("\0")
    ) {
      throw new Error(`files[${index}].path is invalid`);
    }
    if (seen.has(file.path)) {
      throw new Error(`duplicate workspace path '${file.path}'`);
    }
    seen.add(file.path);

    if (typeof file.kind !== "string" || !DSL_KINDS.has(file.kind as DslKind)) {
      throw new Error(`files[${index}].kind is not a supported KIDE DSL`);
    }
    if (typeof file.source !== "string") {
      throw new Error(`files[${index}].source must be a string`);
    }
    if (file.source.length > MAX_SOURCE_CHARACTERS) {
      throw new Error(`files[${index}].source exceeds the per-file limit`);
    }

    totalCharacters += file.source.length;
    if (totalCharacters > MAX_TOTAL_SOURCE_CHARACTERS) {
      throw new Error("workspace source exceeds the total request limit");
    }

    return {
      path: file.path,
      kind: file.kind as DslKind,
      source: file.source,
    };
  });

  return { files };
}
