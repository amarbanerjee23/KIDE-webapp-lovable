import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureAuthSchema, getAuth } from "@/lib/auth.server";
import { ensureApplicationSchema } from "@/lib/application-schema.server";
import { getDatabase } from "@/lib/database.server";

export const requireKideAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: request headers are unavailable.");

  await Promise.all([ensureAuthSchema(), ensureApplicationSchema()]);

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user?.id) throw new Error("Unauthorized: active session required.");

  return next({
    context: {
      db: getDatabase(),
      userId: session.user.id,
      user: session.user,
    },
  });
});
