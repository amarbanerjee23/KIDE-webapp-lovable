# Legacy migration history

Files `0000` through `0003` in this directory are retained only as historical records of
the previous Supabase-backed deployment.

They are **not** the migration path for PR24 or later self-hosted installations and must not be
applied to a clean KIDE PostgreSQL database.

The active self-hosted application schema is `db/kide-application-schema.sql`. Better Auth owns
its own authentication tables and applies its supported PostgreSQL migration through the Better
Auth migration API. Future Drizzle-generated migrations use `drizzle/generated`.
