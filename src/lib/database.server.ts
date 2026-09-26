import postgres from "postgres";

export type KideDatabase = ReturnType<typeof postgres>;

export interface DatabaseCredentials {
  user: string;
  password: string;
  database: string;
}

const LOCAL_DATABASE_URL = "postgres://kide:kide@127.0.0.1:5432/kide";

let database: KideDatabase | undefined;

export function databaseUrl(): string {
  const configured = process.env["DATABASE_URL"]?.trim();
  if (configured) return configured;

  if (process.env["NODE_ENV"] !== "production") {
    return LOCAL_DATABASE_URL;
  }

  throw new Error("DATABASE_URL is required in production.");
}

export function databaseSocketPath(): string | undefined {
  const configured = process.env["INSTANCE_UNIX_SOCKET"]?.trim();
  return configured || undefined;
}

export function databaseCredentials(): DatabaseCredentials {
  const raw = databaseUrl();
  const parsed = new URL(raw);

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));

  if (!user || !databaseName) {
    throw new Error("DATABASE_URL must include a database user and database name.");
  }

  return {
    user,
    password,
    database: databaseName,
  };
}

export function getDatabase(): KideDatabase {
  if (!database) {
    const socketPath = databaseSocketPath();
    database = postgres(databaseUrl(), {
      ...(socketPath ? { path: socketPath } : {}),
      max: Number(process.env["KIDE_DB_POOL_SIZE"] ?? "10"),
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return database;
}
