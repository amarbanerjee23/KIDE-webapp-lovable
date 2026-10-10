import { describe, expect, it } from "vitest";
import { exportModelSet, importModelSet } from "@/lib/kide/model-exchange";

describe("verified model-set exchange", () => {
  const custom = {
    "custom/Sensors.dml": "DataModel Sensors {\n}\n",
    "robot/Control.mncspec": "Model Robot\n\nInterfaceDescription Device {\n}\n",
  };

  it("round-trips arbitrary customer-authored model paths without sample filenames", () => {
    const exported = exportModelSet(custom, "2026-10-10T00:00:00Z");
    expect(exported.files).toHaveLength(2);
    const imported = importModelSet(JSON.stringify(exported));
    expect(imported).toMatchObject({
      ok: true,
      problems: [],
      sources: custom,
      fileCount: 2,
    });
  });

  it("rejects missing checksums rather than accepting unverified content", () => {
    const exported = exportModelSet(custom);
    const [first] = exported.files;
    expect(first).toBeDefined();
    delete (first as { sha256?: string }).sha256;
    const imported = importModelSet(JSON.stringify(exported));
    expect(imported.ok).toBe(false);
    expect(imported.problems.join(" ")).toContain("SHA-256");
    expect(imported.sources).toEqual({});
  });

  it("rejects content corruption and reports no partial import", () => {
    const exported = exportModelSet(custom);
    exported.files[0]!.source += "unexpected";
    const imported = importModelSet(JSON.stringify(exported));
    expect(imported.ok).toBe(false);
    expect(imported.problems.join(" ")).toContain("checksum does not match");
    expect(imported.sources).toEqual({});
  });

  it("rejects duplicate paths including case-insensitive aliases", () => {
    const exported = exportModelSet(custom);
    exported.files.push({
      ...exported.files[0]!,
      path: exported.files[0]!.path.toUpperCase().replace(".DML", ".dml"),
    });
    const imported = importModelSet(JSON.stringify(exported));
    expect(imported.ok).toBe(false);
    expect(imported.problems.join(" ")).toContain("Duplicate model file");
  });

  it("rejects malformed paths, wrong languages and unsupported formats", () => {
    const traversal = exportModelSet(custom);
    traversal.files[0]!.path = "../bad.dml";
    expect(importModelSet(JSON.stringify(traversal)).ok).toBe(false);

    const mismatched = exportModelSet(custom);
    mismatched.files[0]!.kind = "activity";
    expect(importModelSet(JSON.stringify(mismatched)).ok).toBe(false);

    const unsupported = exportModelSet(custom);
    unsupported.format = "other/999";
    expect(importModelSet(JSON.stringify(unsupported)).ok).toBe(false);
  });
});
