import { describe, expect, it } from "vitest";
import {
  exportModelSet,
  importModelSet,
  isAcceptableModelSetSize,
  MAX_MODEL_SET_IMPORT_BYTES,
} from "@/lib/kide/model-exchange";
import { sha256 } from "@/lib/kide/sha256";

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

  it("round-trips uppercase extensions supported by the editor and PostgreSQL", () => {
    const sources = { "nested/Controller.MNCSPEC": "Model Controller", "PLANT.DML": "DataModel Plant {}" };
    const exported = exportModelSet(sources);
    expect(exported.files.map((file) => file.kind).sort()).toEqual(["dml", "mncspec"]);
    expect(importModelSet(JSON.stringify(exported))).toMatchObject({
      ok: true,
      sources,
      fileCount: 2,
    });
  });

  it("enforces the same 100-file limit before replacing a project", () => {
    const sources = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`models/${index}.dml`, "DataModel Test {}"]),
    );
    const exported = exportModelSet(sources);
    expect(importModelSet(JSON.stringify(exported))).toMatchObject({
      ok: true,
      fileCount: 100,
      sources,
    });

    expect(() => exportModelSet({ ...sources, "extra.dml": "DataModel Extra {}" })).toThrow(
      "at most 100 files",
    );
    exported.files.push({ ...exported.files[0]!, path: "extra.dml" });
    const imported = importModelSet(JSON.stringify(exported));
    expect(imported).toMatchObject({ ok: false, sources: {}, fileCount: 0 });
    expect(imported.problems.join(" ")).toContain("at most 100 files");
  });

  it("refuses a checksum-valid model that exceeds the per-file storage limit", () => {
    const file = exportModelSet({ "large.dml": "x".repeat(1_000_000) });
    file.files[0]!.source += "y";
    file.files[0]!.sha256 = sha256(file.files[0]!.source);
    const outcome = importModelSet(JSON.stringify(file));
    expect(outcome).toMatchObject({ ok: false, sources: {}, fileCount: 0 });
    expect(outcome.problems.join(" ")).toContain("storage limit");
  });

  it("refuses a checksum-valid model set that exceeds the aggregate storage limit", () => {
    const source = "x".repeat(900_000);
    const large = {
      format: "kide.modelset/1",
      exportedAt: "2026-10-10T00:00:00Z",
      files: Array.from({ length: 6 }, (_, index) => ({
        path: `models/${index}.dml`,
        kind: "dml",
        source,
        sha256: sha256(source),
      })),
    };
    expect(() =>
      exportModelSet(Object.fromEntries(large.files.map((file) => [file.path, file.source]))),
    ).toThrow("total storage limit");
    const outcome = importModelSet(JSON.stringify(large));
    expect(outcome).toMatchObject({ ok: false, sources: {}, fileCount: 0 });
    expect(outcome.problems.join(" ")).toContain("total storage limit");
  });

  it("screens large upload sizes before loading or parsing the file", () => {
    expect(isAcceptableModelSetSize(0)).toBe(true);
    expect(isAcceptableModelSetSize(MAX_MODEL_SET_IMPORT_BYTES)).toBe(true);
    for (const size of [-1, Number.NaN, 1.5, MAX_MODEL_SET_IMPORT_BYTES + 1]) {
      expect(isAcceptableModelSetSize(size)).toBe(false);
    }
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
