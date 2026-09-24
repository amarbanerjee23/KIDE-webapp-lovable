import schemaSql from "../../db/kide-application-schema.sql?raw";
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
