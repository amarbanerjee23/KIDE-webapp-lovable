export const WORKING_COPY_LABEL = "__kide_working_copy__";
export const WORKING_COPY_CONFLICT_MESSAGE =
  "This project changed in another browser session. Your local edits are preserved; reload before saving again.";

const MAX_WORKING_COPY_FILES = 100;
const MAX_WORKING_COPY_PATH_LENGTH = 512;
const MAX_WORKING_COPY_FILE_CHARACTERS = 1_000_000;
const MAX_WORKING_COPY_TOTAL_CHARACTERS = 5_000_000;

export function validateWorkingCopySources(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Workspace sources must be an object.");
  }

  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_WORKING_COPY_FILES) {
    throw new Error(`Workspace must contain between 1 and ${MAX_WORKING_COPY_FILES} files.`);
  }

  const sources: Record<string, string> = {};
  let totalCharacters = 0;

  for (const [path, source] of entries) {
    if (
      path.length === 0 ||
      path.length > MAX_WORKING_COPY_PATH_LENGTH ||
      path.includes("\0") ||
      typeof source !== "string"
    ) {
      throw new Error("Workspace contains an invalid file.");
    }

    if (source.length > MAX_WORKING_COPY_FILE_CHARACTERS) {
      throw new Error(`Workspace file '${path}' exceeds the storage limit.`);
    }

    totalCharacters += source.length;
    if (totalCharacters > MAX_WORKING_COPY_TOTAL_CHARACTERS) {
      throw new Error("Workspace exceeds the total storage limit.");
    }

    sources[path] = source;
  }

  return sources;
}

export function coerceStoredSources(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const entries = Object.entries(value);
  if (entries.length === 0) return null;

  const sources: Record<string, string> = {};
  for (const [path, source] of entries) {
    if (typeof source !== "string") return null;
    sources[path] = source;
  }
  return sources;
}
