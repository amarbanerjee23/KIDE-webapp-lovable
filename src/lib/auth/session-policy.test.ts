import { describe, expect, it } from "vitest";
import {
  isPathSessionVerified,
  isPublicSessionPath,
  requiresActiveSession,
} from "./session-policy";

describe("client session route policy", () => {
  it("keeps only home and auth public", () => {
    expect(isPublicSessionPath("/")).toBe(true);
    expect(isPublicSessionPath("/auth")).toBe(true);
  });

  it.each([
    "/projects",
    "/overview",
    "/designer",
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

  it("does not authorize one protected route with another route's verification", () => {
    expect(
      isPathSessionVerified("/designer", {
        status: "authenticated",
        verifiedPath: "/projects",
      }),
    ).toBe(false);
  });

  it("renders a protected route only after that exact path is verified", () => {
    expect(
      isPathSessionVerified("/designer", {
        status: "authenticated",
        verifiedPath: "/designer",
      }),
    ).toBe(true);
  });

  it("always allows public routes through the root gate", () => {
    expect(
      isPathSessionVerified("/", {
        status: "anonymous",
        verifiedPath: null,
      }),
    ).toBe(true);
    expect(
      isPathSessionVerified("/auth", {
        status: "checking",
        verifiedPath: null,
      }),
    ).toBe(true);
  });
});
