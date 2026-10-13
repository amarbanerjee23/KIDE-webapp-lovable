/** Only transport/transient server failures retry automatically. Never retry
 * optimistic conflicts, permission errors, invalid inputs, or unknown failures.
 */
export const MAX_WORKSPACE_SAVE_RETRIES = 3;

export function isTransientWorkspaceSaveError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:failed to fetch|networkerror|network request failed|load failed|timeout|timed out|econnreset|econnrefused|etimedout|http\s*(?:429|50[0234])|status\s*(?:429|50[0234])|\b(?:429|50[0234])\b|temporarily unavailable)/i.test(
    message,
  );
}

export function retryWorkspaceSaveDelay(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Retry attempt must be a positive integer.");
  }
  return Math.min(1000 * 2 ** (attempt - 1), 4000);
}
