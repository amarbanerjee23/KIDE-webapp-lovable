import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE } from "@/lib/dsl";
import { synthesize } from "./synthesis";
import { buildAssurance } from "./assurance";
import { buildRelease } from "./release";
import { buildCatalogue } from "./catalogue";
import { sha256 } from "./sha256";

const workspace = () => linkWorkspace(SAMPLE_WORKSPACE.map((f) => ({ ...f })));

describe("assurance", () => {
  it("passes every gate for the reference workspace", () => {
    const ws = workspace();
    const assurance = buildAssurance(ws, synthesize(ws), null);
    expect(assurance.blockers).toBe(0);
    expect(assurance.releasable).toBe(true);
    expect(assurance.gates.every((gate) => gate.status === "pass")).toBe(true);
  });

  it("traces every workflow step to a control node", () => {
    const ws = workspace();
    const assurance = buildAssurance(ws, synthesize(ws), null);
    expect(assurance.traceability.length).toBeGreaterThan(0);
    expect(assurance.tracedPercent).toBe(100);
  });

  it("raises a blocker and blocks release when a model is broken", () => {
    const broken = SAMPLE_WORKSPACE.map((file) =>
      file.path.endsWith(".cap") ? { ...file, source: `${file.source}\n???` } : { ...file },
    );
    const ws = linkWorkspace(broken);
    const assurance = buildAssurance(ws, synthesize(ws), null);
    expect(assurance.blockers).toBeGreaterThan(0);
    expect(assurance.releasable).toBe(false);
  });
});

describe("release", () => {
  it("produces a deterministic checksummed bundle", () => {
    const ws = workspace();
    const report = synthesize(ws);
    const assurance = buildAssurance(ws, report, null);
    const a = buildRelease(ws, report, assurance, "1.0.0");
    const b = buildRelease(ws, report, assurance, "1.0.0");
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.manifestHash).toHaveLength(64);
    expect(a.releasable).toBe(true);
    expect(a.artifacts.length).toBeGreaterThan(SAMPLE_WORKSPACE.length);
  });

  it("marks the bundle blocked when gates fail", () => {
    const broken = SAMPLE_WORKSPACE.map((file) =>
      file.path.endsWith(".activity") ? { ...file, source: `${file.source}\n???` } : { ...file },
    );
    const ws = linkWorkspace(broken);
    const report = synthesize(ws);
    const bundle = buildRelease(ws, report, buildAssurance(ws, report, null), "1.0.0");
    expect(bundle.releasable).toBe(false);
    expect(bundle.blockedBy.length).toBeGreaterThan(0);
  });
});

describe("catalogue", () => {
  it("lists capabilities with their device interfaces and usage", () => {
    const catalogue = buildCatalogue(workspace());
    expect(catalogue.capabilities.length).toBeGreaterThan(0);
    expect(catalogue.eligibleCount).toBe(catalogue.capabilities.length);
    expect(catalogue.devices.length).toBeGreaterThan(0);
    expect(catalogue.capabilities.some((entry) => entry.usedBy.length > 0)).toBe(true);
  });

  it("explains why a capability is not eligible", () => {
    const patched = SAMPLE_WORKSPACE.map((file) =>
      file.path.endsWith(".cap")
        ? { ...file, source: file.source.replace("fireable commands : MoveTo", "fireable commands : NotARealCommand") }
        : { ...file },
    );
    const catalogue = buildCatalogue(linkWorkspace(patched));
    const rejected = catalogue.capabilities.filter((entry) => !entry.eligible);
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected[0]!.reasons.join(" ")).toContain("NotARealCommand");
  });
});

describe("sha256", () => {
  it("matches known digests", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
