import postgres from "postgres";

export type KideDatabase = ReturnType<typeof postgres>;

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

export function getDatabase(): KideDatabase {
  if (!database) {
    database = postgres(databaseUrl(), {
      max: Number(process.env["KIDE_DB_POOL_SIZE"] ?? "10"),
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return database;
}
