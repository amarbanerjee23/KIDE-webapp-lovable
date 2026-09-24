import schemaSql from "../../drizzle/migrations/0004_self_hosted_postgres_cutover.sql?raw";
import { getDatabase } from "@/lib/database.server";

let applicationMigration: Promise<void> | undefined;

export async function ensureApplicationSchema(): Promise<void> {
  if (!applicationMigration) {
    applicationMigration = (async () => {
      const db = getDatabase();
      await db.unsafe(schemaSql);
    })().catch((error) => {
      applicationMigration = undefined;
      throw error;
    });
  }

  await applicationMigration;
}
