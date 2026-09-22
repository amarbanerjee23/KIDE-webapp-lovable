import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRemoteSynthesis,
  startRemoteSynthesis,
  synthesisEventsEndpoint,
  watchRemoteSynthesis,
} from "./synthesis-client";

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

function request() {
  return {
    projectId: "project-1",
    activities: [{ name: "Move", capabilityUri: "urn:kide:Move" }],
    capabilityMachines: [
      {
        capabilityUri: "urn:kide:Move",
        sessionType: "urn:kide:sync",
        states: ["idle", "done"],
        startStates: ["idle"],
        endStates: ["done"],
        transitions: [{ source: "idle", target: "done", event: "finish" }],
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remote synthesis client", () => {
  it("builds an encoded progress-stream endpoint", () => {
    expect(synthesisEventsEndpoint("job/with space")).toBe(
      "/api/v1/synthesis/job%2Fwith%20space/events",
    );
  });

  it("falls back to polling when EventSource is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        jobId: "job-3",
        status: "completed",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("EventSource", undefined);
    const onUpdate = vi.fn();

    const close = watchRemoteSynthesis("job-3", { onUpdate });
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    close();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/synthesis/job-3",
      {},
    );
    expect(onUpdate).toHaveBeenCalledWith({
      jobId: "job-3",
      status: "completed",
    });
  });

  it("posts the complete COMPOSEMACHINES contract", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ jobId: "job-1", status: "queued" }, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await startRemoteSynthesis(request());

    expect(result).toEqual({ jobId: "job-1", status: "queued" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/synthesis");
    expect(init.method).toBe("POST");
    expect(init).not.toHaveProperty("signal");
    expect(JSON.parse(String(init.body))).toEqual(request());
  });

  it("passes an AbortSignal only when supplied", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ jobId: "job-2", status: "queued" }, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await startRemoteSynthesis(request(), controller.signal);

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
