import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession },
}));

import { getActiveBrowserSession } from "./active-session";

describe("active browser session validation", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("returns a Better Auth session and user when the server validates the cookie", async () => {
    const session = { id: "session-1", userId: "user-1" };
    const user = { id: "user-1", email: "engineer@example.com" };

    getSession.mockResolvedValue({
      data: { session, user },
      error: null,
    });

    const result = await getActiveBrowserSession();

    expect(result?.session).toBe(session);
    expect(result?.user).toBe(user);
  });

  it("rejects an empty session", async () => {
    getSession.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(getActiveBrowserSession()).resolves.toBeNull();
  });

  it("rejects a failed session lookup", async () => {
    getSession.mockResolvedValue({
      data: null,
      error: { message: "invalid session" },
    });

    await expect(getActiveBrowserSession()).resolves.toBeNull();
  });
});
