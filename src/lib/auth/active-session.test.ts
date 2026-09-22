import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { auth },
}));

import { getActiveBrowserSession } from "./active-session";

describe("active browser session validation", () => {
  beforeEach(() => {
    auth.getSession.mockReset();
    auth.getUser.mockReset();
    auth.signOut.mockReset();
    auth.signOut.mockResolvedValue({ error: null });
  });

  it("accepts a cached session only when Supabase validates the same user", async () => {
    const session = { user: { id: "user-1" } };
    const user = { id: "user-1" };

    auth.getSession.mockResolvedValue({
      data: { session },
      error: null,
    });
    auth.getUser.mockResolvedValue({
      data: { user },
      error: null,
    });

    const result = await getActiveBrowserSession();

    expect(result?.session).toBe(session);
    expect(result?.user).toBe(user);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("rejects an empty cached session without attempting protected access", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getActiveBrowserSession()).resolves.toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects and clears a stale cached session when current-user validation fails", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    });

    await expect(getActiveBrowserSession()).resolves.toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects a session whose validated user does not match the cached session", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });
    auth.getUser.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });

    await expect(getActiveBrowserSession()).resolves.toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
