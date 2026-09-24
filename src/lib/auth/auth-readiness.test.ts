import { afterEach, describe, expect, it, vi } from "vitest";
import { authReadiness } from "@/lib/auth.server";

describe("production auth readiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed in production when required configuration is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    expect(authReadiness()).toEqual({
      configured: false,
      googleConfigured: false,
    });
  });

  it("requires a 32+ character production secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.stubEnv("BETTER_AUTH_URL", "https://kide.example.com");
    vi.stubEnv("BETTER_AUTH_SECRET", "too-short");

    expect(authReadiness().configured).toBe(false);
  });

  it("becomes configured only when all production requirements are present", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.stubEnv("BETTER_AUTH_URL", "https://kide.example.com");
    vi.stubEnv("BETTER_AUTH_SECRET", "01234567890123456789012345678901");

    expect(authReadiness().configured).toBe(true);
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

    expect(authReadiness().configured).toBe(true);
  });
});
