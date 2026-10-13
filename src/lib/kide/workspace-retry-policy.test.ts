import { describe, expect, it } from "vitest";
import {
  isTransientWorkspaceSaveError,
  MAX_WORKSPACE_SAVE_RETRIES,
  retryWorkspaceSaveDelay,
} from "./workspace-retry-policy";

describe("CAS-safe transient workspace retry policy", () => {
  it("retries only identifiable transport or transient HTTP failures", () => {
    for (const message of [
      "Failed to fetch",
      "NetworkError",
      "Request timed out",
      "HTTP 503 Service Unavailable",
      "status 429",
      "ECONNRESET",
    ]) {
      expect(isTransientWorkspaceSaveError(new Error(message))).toBe(true);
    }
    for (const message of [
      "Working copy changed in another browser session",
      "Forbidden",
      "Unauthorized",
      "Validation error: too many source files",
      "Bad request 400",
      "Unknown server error",
    ]) {
      expect(isTransientWorkspaceSaveError(new Error(message))).toBe(false);
    }
  });

  it("has finite exponential backoff and stops after three automatic retries", () => {
    expect(MAX_WORKSPACE_SAVE_RETRIES).toBe(3);
    expect([1, 2, 3].map(retryWorkspaceSaveDelay)).toEqual([1000, 2000, 4000]);
    expect(retryWorkspaceSaveDelay(8)).toBe(4000);
    expect(() => retryWorkspaceSaveDelay(0)).toThrow();
    expect(() => retryWorkspaceSaveDelay(1.5)).toThrow();
  });
});
