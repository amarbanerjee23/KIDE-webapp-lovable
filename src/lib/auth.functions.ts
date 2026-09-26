import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authReadiness, authRuntimeReadiness, ensureAuthSchema, getAuth } from "@/lib/auth.server";

export const getAuthReadiness = createServerFn({ method: "GET" }).handler(async () => {
  return authRuntimeReadiness();
});

export const getServerSession = createServerFn({ method: "GET" }).handler(async () => {
  const readiness = authReadiness();
  if (!readiness.configured) return null;

  try {
    await ensureAuthSchema();
    return await getAuth().api.getSession({ headers: getRequestHeaders() });
  } catch (error) {
    console.error(
      "[KIDE Auth Session] Session validation failed closed.",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
});
