import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE } from "@/lib/dsl";
import { synthesize } from "./synthesis";
import { verifyStandaloneSynthesis } from "./standalone-synthesis.server";

describe("standalone Node synthesis verification", () => {
  it("matches the browser/shared deterministic synthesis engine exactly", () => {
    const local = synthesize(linkWorkspace(SAMPLE_WORKSPACE));
    const server = verifyStandaloneSynthesis(SAMPLE_WORKSPACE);

    expect(server).toEqual(local);
    expect(server.ready).toBe(true);
    expect(server.candidates.length).toBeGreaterThan(0);
    expect(server.candidates.every((candidate) => candidate.validation.errors === 0)).toBe(true);
  });
});
