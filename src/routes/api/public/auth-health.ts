import { createFileRoute } from "@tanstack/react-router";
import { authRuntimeReadiness } from "@/lib/auth.server";

export const Route = createFileRoute("/api/public/auth-health")({
  server: {
    handlers: {
      GET: async () => {
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
      },
    },
  },
});
