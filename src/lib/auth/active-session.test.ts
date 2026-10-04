import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession },
}));

import { getActiveBrowserSession, waitForActiveBrowserSession } from "./active-session";

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

  it("bypasses Better Auth cookie cache when validating the active session", async () => {
    getSession.mockResolvedValue({
      data: null,
      error: null,
    });

    await getActiveBrowserSession();

    expect(getSession).toHaveBeenCalledWith({
      query: {
        disableCookieCache: true,
      },
    });
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

  it("retries transient empty session reads after successful authentication", async () => {
    const session = { id: "session-2", userId: "user-2" };
    const user = { id: "user-2", email: "eventual@example.com" };
    getSession
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { session, user }, error: null });

    const result = await waitForActiveBrowserSession({
      attempts: 3,
      delayMs: 0,
      attemptTimeoutMs: 100,
    });

    expect(result?.session).toBe(session);
    expect(getSession).toHaveBeenCalledTimes(3);
  });

  it("fails closed when session readiness never arrives", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    await expect(
      waitForActiveBrowserSession({
        attempts: 3,
        delayMs: 0,
        attemptTimeoutMs: 100,
      }),
    ).resolves.toBeNull();
    expect(getSession).toHaveBeenCalledTimes(3);
  });
});
