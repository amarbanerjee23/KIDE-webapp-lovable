import { defineConfig } from "drizzle-kit";

// PR24 no longer uses the historical Supabase migration chain under
// drizzle/migrations. New generated Drizzle migrations, if introduced later,
// belong in this isolated self-hosted directory.
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/generated",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
