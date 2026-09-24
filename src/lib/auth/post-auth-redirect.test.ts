import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPostAuthRedirect,
  consumePostAuthRedirect,
  normalizePostAuthRedirect,
  rememberPostAuthRedirect,
} from "./post-auth-redirect";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("post-auth redirect normalization", () => {
  const origin = "https://kide.example.com";

  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin },
      sessionStorage: createMemoryStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves a same-origin application destination", () => {
    expect(
      normalizePostAuthRedirect("https://kide.example.com/projects?tab=active#latest", origin),
    ).toBe("/projects?tab=active#latest");
  });

  it("rejects external destinations", () => {
    expect(normalizePostAuthRedirect("https://evil.example.com/steal", origin)).toBe("/projects");
  });

  it("prevents auth and root redirect loops", () => {
    expect(normalizePostAuthRedirect("/auth", origin)).toBe("/projects");
    expect(normalizePostAuthRedirect("/", origin)).toBe("/projects");
  });

  it("falls back safely for malformed or missing destinations", () => {
    expect(normalizePostAuthRedirect(undefined, origin)).toBe("/projects");
    expect(normalizePostAuthRedirect("http://[bad", origin)).toBe("/projects");
  });

  it("clears a stale protected destination before an explicit home sign-in", () => {
    rememberPostAuthRedirect("/designer");
    clearPostAuthRedirect();

    expect(consumePostAuthRedirect()).toBe("/projects");
  });
});
