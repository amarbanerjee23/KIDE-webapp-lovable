import { createFileRoute } from "@tanstack/react-router";
import { ensureAuthSchema, getAuth } from "@/lib/auth.server";

async function handle(request: Request) {
  try {
    await ensureAuthSchema();
    return await getAuth().handler(request);
  } catch (error) {
    console.error("[KIDE Auth]", error);
    return Response.json(
      { error: "Authentication service is not configured or the database is unavailable." },
      { status: 503 },
    );
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
