import { describe, expect, it } from "vitest";
import { isPublicSessionPath, requiresActiveSession } from "./session-policy";

describe("client session route policy", () => {
  it("keeps only home and auth public", () => {
    expect(isPublicSessionPath("/")).toBe(true);
    expect(isPublicSessionPath("/auth")).toBe(true);
  });

  it.each([
    "/projects",
    "/overview",
    "/models",
    "/workbench",
    "/synthesis",
    "/scenario",
    "/trust",
    "/release",
    "/qualification",
    "/catalogue",
  ])("requires an active session for %s", (pathname) => {
    expect(requiresActiveSession(pathname)).toBe(true);
  });

  it("treats unknown client routes as session-required", () => {
    expect(requiresActiveSession("/anything-else")).toBe(true);
  });
});
