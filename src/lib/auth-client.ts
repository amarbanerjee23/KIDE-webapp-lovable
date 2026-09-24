import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const AUTH_CHANGED_EVENT = "kide:auth-changed";

export function notifyAuthChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}
