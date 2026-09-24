import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authReadiness, ensureAuthSchema, getAuth } from "@/lib/auth.server";

export const getAuthReadiness = createServerFn({ method: "GET" }).handler(async () => {
  return authReadiness();
});

export const getServerSession = createServerFn({ method: "GET" }).handler(async () => {
  const readiness = authReadiness();
  if (!readiness.configured) return null;

  await ensureAuthSchema();
  return getAuth().api.getSession({ headers: getRequestHeaders() });
});
