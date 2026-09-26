import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseCredentials, databaseSocketPath, databaseUrl } from "@/lib/database.server";

describe("database runtime configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the production DATABASE_URL without exposing a fallback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://kide_app:secret@localhost:5432/kide");

    expect(databaseUrl()).toBe("postgresql://kide_app:secret@localhost:5432/kide");
  });

  it("fails closed when production DATABASE_URL is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");

    expect(() => databaseUrl()).toThrow("DATABASE_URL is required in production.");
  });

  it("exposes the Cloud SQL Unix socket only when configured", () => {
    vi.stubEnv(
      "INSTANCE_UNIX_SOCKET",
      "/cloudsql/project-b2a69875-a9ec-40fe-b15:us-central1:kide-web-app",
    );
    expect(databaseSocketPath()).toBe(
      "/cloudsql/project-b2a69875-a9ec-40fe-b15:us-central1:kide-web-app",
    );

    vi.stubEnv("INSTANCE_UNIX_SOCKET", "");
    expect(databaseSocketPath()).toBeUndefined();
  });

  it("parses URL-safe credentials for the pg Cloud SQL socket path", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://kide_app:p%40ss%3Aword@localhost:5432/kide");

    expect(databaseCredentials()).toEqual({
      user: "kide_app",
      password: "p@ss:word",
      database: "kide",
    });
  });

  it("rejects malformed database URLs before opening a socket connection", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "https://example.test/not-postgres");
    expect(() => databaseCredentials()).toThrow(
      "DATABASE_URL must use the postgres or postgresql protocol.",
    );

    vi.stubEnv("DATABASE_URL", "postgresql://localhost/");
    expect(() => databaseCredentials()).toThrow(
      "DATABASE_URL must include a database user and database name.",
    );
  });
});
