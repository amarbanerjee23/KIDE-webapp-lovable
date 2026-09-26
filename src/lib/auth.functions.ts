import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authRuntimeReadiness, getAuth } from "@/lib/auth.server";

export const getAuthReadiness = createServerFn({ method: "GET" }).handler(async () => {
  return authRuntimeReadiness();
});

export const getServerSession = createServerFn({ method: "GET" }).handler(async () => {
  const readiness = await authRuntimeReadiness();
  if (!readiness.operational) return null;

  return getAuth().api.getSession({ headers: getRequestHeaders() });
});
