import { describe, expect, it } from "vitest";
import { CORPUS, runCase, runCorpus, workspaceForCase } from "./corpus";
import { synthesize } from "./synthesis";
import { exportModelSet, importModelSet, EXCHANGE_FORMAT } from "./model-exchange";
import { SAMPLE_WORKSPACE } from "@/lib/dsl/samples";

describe("comparison corpus", () => {
  it("every case matches the desktop transformation expectations", () => {
    const result = runCorpus();
    const failures = result.cases.filter((entry) => entry.status === "fail");
    expect(failures.map((f) => `${f.id}: ${f.differences.join(" ")}`)).toEqual([]);
    expect(result.conformant).toBe(true);
    expect(result.total).toBe(CORPUS.length);
  });

  it("runs deterministically", () => {
    expect(JSON.stringify(runCorpus())).toBe(JSON.stringify(runCorpus()));
  });

  it("produces byte-identical control models for the reference case", () => {
    const entry = CORPUS[0]!;
    const a = synthesize(workspaceForCase(entry)).candidates.map((c) => c.generatedMnc);
    const b = synthesize(workspaceForCase(entry)).candidates.map((c) => c.generatedMnc);
    expect(a).toEqual(b);
    expect(a.length).toBe(3);
  });

  it("detects a deviation when an expectation is wrong", () => {
    const broken = {
      ...CORPUS[0]!,
      expect: {
        ...CORPUS[0]!.expect,
        candidates: [
          {
            id: "candidate-consolidated",
            controlNodes: [
              { name: "WrongController", componentInterface: "Vehicle", activities: ["MoveToWaypoint"] },
            ],
          },
        ],
      },
    };
    const result = runCase(broken);
    expect(result.status).toBe("fail");
    expect(result.differences.length).toBeGreaterThan(0);
  });
});

describe("model set import and export", () => {
  const sources = Object.fromEntries(SAMPLE_WORKSPACE.map((f) => [f.path, f.source]));

  it("round-trips a full model set", () => {
    const doc = exportModelSet(sources, "2026-01-01T00:00:00.000Z");
    expect(doc.format).toBe(EXCHANGE_FORMAT);
    const back = importModelSet(JSON.stringify(doc));
    expect(back.ok).toBe(true);
    expect(back.sources).toEqual(sources);
  });

  it("rejects an altered file", () => {
    const doc = exportModelSet(sources);
    doc.files[0]!.source += "\n// tampered";
    const back = importModelSet(JSON.stringify(doc));
    expect(back.ok).toBe(false);
    expect(back.problems[0]).toContain("checksum");
  });

  it("rejects a foreign file", () => {
    expect(importModelSet("not json").ok).toBe(false);
    expect(importModelSet(JSON.stringify({ format: "other", files: [] })).ok).toBe(false);
  });
});
