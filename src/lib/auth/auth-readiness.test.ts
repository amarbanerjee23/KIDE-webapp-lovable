import { afterEach, describe, expect, it, vi } from "vitest";
import { authReadiness } from "@/lib/auth.server";
import { authReadinessIssues, authReadinessSummary } from "@/lib/auth/readiness";

describe("production auth readiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports every missing production requirement without exposing values", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    const readiness = authReadiness();
    expect(readiness).toEqual({
      configured: false,
      googleConfigured: false,
      requirements: {
        databaseUrl: "missing",
        betterAuthUrl: "missing",
        betterAuthSecret: "missing",
      },
    });

    expect(authReadinessIssues(readiness).map((issue) => issue.code)).toEqual([
      "DATABASE_URL_MISSING",
      "BETTER_AUTH_URL_MISSING",
      "BETTER_AUTH_SECRET_MISSING",
    ]);
  });

  it("reports only DATABASE_URL when the database is the missing dependency", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://kide.example.com");
    vi.stubEnv("BETTER_AUTH_SECRET", "01234567890123456789012345678901");

    const readiness = authReadiness();
    expect(readiness.configured).toBe(false);
    expect(authReadinessIssues(readiness)).toEqual([
      {
        code: "DATABASE_URL_MISSING",
        message: "The PostgreSQL database is not configured.",
        operatorHint: "Set DATABASE_URL to a reachable PostgreSQL connection string.",
      },
    ]);
  });

  it("reports only BETTER_AUTH_URL when the public auth URL is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "01234567890123456789012345678901");

    const readiness = authReadiness();
    expect(authReadinessIssues(readiness).map((issue) => issue.code)).toEqual([
      "BETTER_AUTH_URL_MISSING",
    ]);
  });

  it("distinguishes a missing secret from a configured-but-too-short secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.stubEnv("BETTER_AUTH_URL", "https://kide.example.com");
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    expect(authReadinessIssues(authReadiness()).map((issue) => issue.code)).toEqual([
      "BETTER_AUTH_SECRET_MISSING",
    ]);

    vi.stubEnv("BETTER_AUTH_SECRET", "too-short");
    const shortReadiness = authReadiness();
    expect(shortReadiness.requirements.betterAuthSecret).toBe("too_short");
    expect(authReadinessIssues(shortReadiness).map((issue) => issue.code)).toEqual([
      "BETTER_AUTH_SECRET_TOO_SHORT",
    ]);
    expect(authReadinessSummary(shortReadiness)).toContain("too short");
  });

  it("becomes configured only when all production requirements are present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.stubEnv("BETTER_AUTH_URL", "https://kide.example.com");
    vi.stubEnv("BETTER_AUTH_SECRET", "01234567890123456789012345678901");

    expect(authReadiness()).toEqual({
      configured: true,
      googleConfigured: false,
      requirements: {
        databaseUrl: "ready",
        betterAuthUrl: "ready",
        betterAuthSecret: "ready",
      },
    });
  });

  it("requires both Google OAuth values before advertising Google sign-in", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(authReadiness().googleConfigured).toBe(false);

    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    expect(authReadiness().googleConfigured).toBe(true);
  });

  it("allows development defaults without production secrets", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    expect(authReadiness()).toEqual({
      configured: true,
      googleConfigured: false,
      requirements: {
        databaseUrl: "ready",
        betterAuthUrl: "ready",
        betterAuthSecret: "ready",
      },
    });
  });
});
