import { createFileRoute } from "@tanstack/react-router";
import { authRuntimeReadiness, ensureAuthSchema, getAuth } from "@/lib/auth.server";

async function authHealthResponse() {
  const readiness = await authRuntimeReadiness();
  return Response.json(
    {
      status: readiness.operational ? "ready" : "unavailable",
      configured: readiness.configured,
      operational: readiness.operational,
      runtimeIssue: readiness.runtimeIssue,
      requirements: readiness.requirements,
      googleConfigured: readiness.googleConfigured,
    },
    {
      status: readiness.operational ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/auth/health") {
      return authHealthResponse();
    }

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
