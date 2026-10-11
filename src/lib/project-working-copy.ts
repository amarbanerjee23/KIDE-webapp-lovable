export const WORKING_COPY_LABEL = "__kide_working_copy__";
export const WORKING_COPY_CONFLICT_MESSAGE =
  "This project changed in another browser session. Your local edits are preserved; reload before saving again.";

export const MAX_WORKING_COPY_FILES = 100;
const MAX_WORKING_COPY_PATH_LENGTH = 512;
const MAX_WORKING_COPY_FILE_CHARACTERS = 1_000_000;
const MAX_WORKING_COPY_TOTAL_CHARACTERS = 5_000_000;

// Match the editor/model-set importer's canonical relative path policy
// at the API boundary as well; direct calls cannot bypass UI validation.
const MODEL_EXTENSION = /\.(?:dml|op|mncspec|cap|activity)$/i;
const MODEL_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isCanonicalModelPath(path: string): boolean {
  if (
    path.length === 0 ||
    path.length > MAX_WORKING_COPY_PATH_LENGTH ||
    !MODEL_EXTENSION.test(path) ||
    path.trim() !== path
  ) {
    return false;
  }
  return path
    .split("/")
    .every((segment) => segment !== "." && segment !== ".." && MODEL_SEGMENT.test(segment));
}

export function validateWorkingCopySources(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Workspace sources must be an object.");
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_WORKING_COPY_FILES) {
    throw new Error(`Workspace may contain at most ${MAX_WORKING_COPY_FILES} files.`);
  }

  const seenPaths = new Set<string>();
  let totalCharacters = 0;
  for (const [path, source] of entries) {
    if (!isCanonicalModelPath(path) || typeof source !== "string") {
      throw new Error("Workspace contains an invalid file.");
    }

    const key = path.toLowerCase();
    if (seenPaths.has(key)) {
      throw new Error(`Workspace contains duplicate model path '${path}'.`);
    }
    seenPaths.add(key);

    if (source.length > MAX_WORKING_COPY_FILE_CHARACTERS) {
      throw new Error(`Workspace file '${path}' exceeds the storage limit.`);
    }
    totalCharacters += source.length;
    if (totalCharacters > MAX_WORKING_COPY_TOTAL_CHARACTERS) {
      throw new Error("Workspace exceeds the total storage limit.");
    }
  }

  // Rebuild rather than assigning untrusted keys into a mutable object.
  return Object.fromEntries(entries);
}

/** Old/corrupt PostgreSQL records are not valid workspace sources. */
export function coerceStoredSources(value: unknown): Record<string, string> | null {
  try {
    return validateWorkingCopySources(value);
  } catch {
    return null;
  }
}

/**
 * A missing working copy is an intentional new/empty project; an existing
 * corrupt working-copy row is different and must block the workspace loader.
 */
export function requireVerifiedStoredSources(value: unknown): Record<string, string> {
  const sources = coerceStoredSources(value);
  if (sources === null) {
    throw new Error(
      "This project's saved models failed integrity validation. Contact an administrator or restore a verified backup before editing.",
    );
  }
  return sources;
}

/** A named checkpoint may never impersonate the internal working copy. */
export function validateCheckpointLabel(value: unknown): string {
  if (typeof value !== "string") throw new Error("Checkpoint name must be text.");
  const label = value.trim().slice(0, 120) || "Checkpoint";
  if (label.toLowerCase() === WORKING_COPY_LABEL.toLowerCase()) {
    throw new Error("Checkpoint name is reserved for the internal working copy.");
  }
  if (
    Array.from(label).some((letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127)
  ) {
    throw new Error("Checkpoint name must not contain control characters.");
  }
  return label;
}

export function validateCheckpointCounts(errorCount: unknown, warningCount: unknown): void {
  if (
    !Number.isSafeInteger(errorCount) ||
    !Number.isSafeInteger(warningCount) ||
    (errorCount as number) < 0 ||
    (warningCount as number) < 0
  ) {
    throw new Error("Checkpoint diagnostic counts must be nonnegative integers.");
  }
}

export function assertWorkingCopyVersion(
  expectedSavedAt: string | null,
  actualSavedAt: string | null,
): void {
  if (expectedSavedAt !== actualSavedAt) {
    throw new Error(WORKING_COPY_CONFLICT_MESSAGE);
  }
}
