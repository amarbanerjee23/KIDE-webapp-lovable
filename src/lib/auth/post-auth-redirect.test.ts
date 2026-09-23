import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPostAuthRedirect,
  consumePostAuthRedirect,
  normalizePostAuthRedirect,
  rememberPostAuthRedirect,
} from "./post-auth-redirect";

describe("post-auth redirect normalization", () => {
  const origin = "https://kide.example.com";

  beforeEach(() => {
    window.sessionStorage.clear();
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
