import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { Pool } from "pg";
import { databaseUrl } from "@/lib/database.server";

const LOCAL_AUTH_URL = "http://localhost:3000";
const LOCAL_AUTH_SECRET = "kide-local-development-secret-change-before-production-2026";

type KideAuth = ReturnType<typeof betterAuth>;

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

export function authReadiness() {
  const production = process.env["NODE_ENV"] === "production";
  const databaseConfigured = Boolean(process.env["DATABASE_URL"]?.trim()) || !production;
  const urlConfigured = Boolean(process.env["BETTER_AUTH_URL"]?.trim()) || !production;
  const secretConfigured =
    (process.env["BETTER_AUTH_SECRET"]?.trim().length ?? 0) >= 32 || !production;
  const googleConfigured = Boolean(
    process.env["GOOGLE_CLIENT_ID"]?.trim() && process.env["GOOGLE_CLIENT_SECRET"]?.trim(),
  );

  return {
    configured: databaseConfigured && urlConfigured && secretConfigured,
    googleConfigured,
  };
}

export function getAuth(): KideAuth {
  if (authInstance) return authInstance;

  const googleClientId = process.env["GOOGLE_CLIENT_ID"]?.trim();
  const googleClientSecret = process.env["GOOGLE_CLIENT_SECRET"]?.trim();

  authInstance = betterAuth({
    appName: "KIDE",
    baseURL: authUrl(),
    secret: authSecret(),
    database: new Pool({ connectionString: databaseUrl() }),
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
              prompt: "select_account",
            },
          }
        : undefined,
    advanced: {
      database: {
        generateId: "uuid",
      },
    },
    plugins: [tanstackStartCookies()],
  });

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
