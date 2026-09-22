import { afterEach, describe, expect, it, vi } from "vitest";
import { getRemoteSynthesis, startRemoteSynthesis } from "./synthesis-client";

function response(
  body: unknown,
  init?: { ok?: boolean; status?: number; statusText?: string },
): Response {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  const statusText = init?.statusText ?? "OK";
  return {
    ok,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remote synthesis client", () => {
  it("posts a synthesis request without an undefined AbortSignal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ jobId: "job-1", status: "queued" }, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await startRemoteSynthesis({
      projectId: "project-1",
      activities: [{ name: "Move", capabilityUri: "urn:kide:Move" }],
    });

    expect(result).toEqual({ jobId: "job-1", status: "queued" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/synthesis");
    expect(init.method).toBe("POST");
    expect(init).not.toHaveProperty("signal");
    expect(JSON.parse(String(init.body))).toEqual({
      projectId: "project-1",
      activities: [{ name: "Move", capabilityUri: "urn:kide:Move" }],
    });
  });

  it("passes an AbortSignal only when supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ jobId: "job-2", status: "queued" }, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await startRemoteSynthesis(
      {
        projectId: "project-2",
        activities: [{ name: "Stop", capabilityUri: "urn:kide:Stop" }],
      },
      controller.signal,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("URL-encodes job identifiers and surfaces API failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ jobId: "job/with space", status: "running" }))
      .mockResolvedValueOnce(
        response("backend unavailable", {
          ok: false,
          status: 503,
          statusText: "Unavailable",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getRemoteSynthesis("job/with space");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/synthesis/job%2Fwith%20space");

    await expect(getRemoteSynthesis("failed")).rejects.toThrow("KIDE API 503: backend unavailable");
  });
});
