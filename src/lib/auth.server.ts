import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { databaseUrl } from "@/lib/database.server";
import type { AuthReadiness, AuthRuntimeReadiness } from "@/lib/auth/readiness";

const LOCAL_AUTH_URL = "http://localhost:3000";
const LOCAL_AUTH_SECRET = "kide-local-development-secret-change-before-production-2026";

let authDatabasePool: Pool | undefined;

function getAuthDatabasePool(): Pool {
  authDatabasePool ??= new Pool({
    connectionString: databaseUrl(),
    connectionTimeoutMillis: Number(process.env["KIDE_AUTH_DB_CONNECT_TIMEOUT_MS"] ?? "5000"),
    max: Number(process.env["KIDE_AUTH_DB_POOL_SIZE"] ?? "10"),
  });
  return authDatabasePool;
}

function createAuth() {
  const googleClientId = process.env["GOOGLE_CLIENT_ID"]?.trim();
  const googleClientSecret = process.env["GOOGLE_CLIENT_SECRET"]?.trim();

  return betterAuth({
    appName: "KIDE",
    baseURL: authUrl(),
    secret: authSecret(),
    database: getAuthDatabasePool(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              prompt: "select_account" as const,
            },
          }
        : undefined,
    advanced: {
      database: {
        generateId: "uuid" as const,
      },
    },
    // Browser sign-in/sign-up uses authClient -> /api/auth/* -> auth.handler.
    // The raw Better Auth response already carries Set-Cookie headers. Avoid
    // the TanStack server-action cookie plugin here: KIDE does not call
    // cookie-setting auth.api methods from server actions.
  });
}

type KideAuth = ReturnType<typeof createAuth>;

let authInstance: KideAuth | undefined;
let authMigration: Promise<void> | undefined;

function authUrl(): string {
  const configured = process.env["BETTER_AUTH_URL"]?.trim();
  if (configured) return configured;
  if (process.env["NODE_ENV"] !== "production") return LOCAL_AUTH_URL;
  throw new Error("BETTER_AUTH_URL is required in production.");
}

function authSecret(): string {
  const configured = process.env["BETTER_AUTH_SECRET"]?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env["NODE_ENV"] !== "production") return LOCAL_AUTH_SECRET;
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters in production.");
}

export function authReadiness(): AuthReadiness {
  const production = process.env["NODE_ENV"] === "production";
  const databasePresent = Boolean(process.env["DATABASE_URL"]?.trim());
  const authUrlPresent = Boolean(process.env["BETTER_AUTH_URL"]?.trim());
  const secretValue = process.env["BETTER_AUTH_SECRET"]?.trim() ?? "";
  const secretPresent = secretValue.length > 0;
  const secretValid = secretValue.length >= 32;

  const requirements: AuthReadiness["requirements"] = production
    ? {
        databaseUrl: databasePresent ? "ready" : "missing",
        betterAuthUrl: authUrlPresent ? "ready" : "missing",
        betterAuthSecret: !secretPresent ? "missing" : secretValid ? "ready" : "too_short",
      }
    : {
        databaseUrl: "ready",
        betterAuthUrl: "ready",
        betterAuthSecret: "ready",
      };

  const googleConfigured = Boolean(
    process.env["GOOGLE_CLIENT_ID"]?.trim() && process.env["GOOGLE_CLIENT_SECRET"]?.trim(),
  );

  return {
    configured:
      requirements.databaseUrl === "ready" &&
      requirements.betterAuthUrl === "ready" &&
      requirements.betterAuthSecret === "ready",
    googleConfigured,
    requirements,
  };
}

export function getAuth(): KideAuth {
  authInstance ??= createAuth();
  return authInstance;
}

export async function ensureAuthSchema(): Promise<void> {
  if (!authMigration) {
    authMigration = (async () => {
      const auth = getAuth();
      const { runMigrations } = await getMigrations(auth.options);
      await runMigrations();
    })().catch((error) => {
      authMigration = undefined;
      throw error;
    });
  }
  await authMigration;
}

export async function authRuntimeReadiness(): Promise<AuthRuntimeReadiness> {
  const readiness = authReadiness();
  if (!readiness.configured) {
    return {
      ...readiness,
      operational: false,
      runtimeIssue: "configuration",
    };
  }

  try {
    await getAuthDatabasePool().query("SELECT 1");
    await ensureAuthSchema();
    return {
      ...readiness,
      operational: true,
      runtimeIssue: null,
    };
  } catch (error) {
    console.error(
      "[KIDE Auth Readiness] Better Auth database/schema check failed.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return {
      ...readiness,
      operational: false,
      runtimeIssue: "database_unavailable",
    };
  }
}
