import { describe, expect, it } from "vitest";
import {
  assertWorkingCopyVersion,
  coerceStoredSources,
  validateWorkingCopySources,
  WORKING_COPY_CONFLICT_MESSAGE,
  WORKING_COPY_LABEL,
} from "./project-working-copy";

describe("project working-copy storage contract", () => {
  it("uses an internal sentinel label", () => {
    expect(WORKING_COPY_LABEL).toBe("__kide_working_copy__");
  });

  it("accepts bounded source maps including an empty project", () => {
    expect(validateWorkingCopySources({})).toEqual({});
    expect(
      validateWorkingCopySources({
        "model.dml": "DataModel Demo {}",
        "mission.activity": "ActivityDiagram Demo {}",
      }),
    ).toEqual({
      "model.dml": "DataModel Demo {}",
      "mission.activity": "ActivityDiagram Demo {}",
    });
  });

  it("rejects invalid source maps", () => {
    expect(() => validateWorkingCopySources(null)).toThrow("object");
    expect(() => validateWorkingCopySources([])).toThrow("object");
    expect(() => validateWorkingCopySources("text")).toThrow("object");
    expect(() => validateWorkingCopySources({ "bad\0path.dml": "DataModel Demo {}" })).toThrow(
      "invalid file",
    );
    expect(() => validateWorkingCopySources({ "": "DataModel Demo {}" })).toThrow("invalid file");
    expect(() => validateWorkingCopySources({ "model.dml": 42 })).toThrow("invalid file");
  });

  it("enforces file-count, path, per-file and aggregate storage limits", () => {
    expect(
      validateWorkingCopySources(
        Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`f${index}.dml`, "x"])),
      ),
    ).toHaveProperty("f99.dml", "x");

    expect(() =>
      validateWorkingCopySources(
        Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`f${index}.dml`, "x"])),
      ),
    ).toThrow("at most 100 files");

    expect(() =>
      validateWorkingCopySources({ [`${"a".repeat(509)}.dml`]: "x" }),
    ).toThrow("invalid file");

    expect(() =>
      validateWorkingCopySources({ "large.dml": "x".repeat(1_000_001) }),
    ).toThrow("storage limit");

    expect(() =>
      validateWorkingCopySources({
        "a.dml": "x".repeat(1_000_000),
        "b.dml": "x".repeat(1_000_000),
        "c.dml": "x".repeat(1_000_000),
        "d.dml": "x".repeat(1_000_000),
        "e.dml": "x".repeat(1_000_000),
        "f.dml": "x",
      }),
    ).toThrow("total storage limit");
  });

  it("coerces only string-valued stored sources and preserves empty maps", () => {
    expect(coerceStoredSources({})).toEqual({});
    expect(coerceStoredSources({ "model.dml": "DataModel Demo {}" })).toEqual({
      "model.dml": "DataModel Demo {}",
    });
    expect(coerceStoredSources({ "model.dml": 42 })).toBeNull();
  });

  it("accepts matching working-copy versions", () => {
    expect(() => assertWorkingCopyVersion(null, null)).not.toThrow();
    expect(() =>
      assertWorkingCopyVersion("2026-09-23T12:00:00.000Z", "2026-09-23T12:00:00.000Z"),
    ).not.toThrow();
  });

  it("rejects stale or unexpectedly-created working-copy versions", () => {
    expect(() =>
      assertWorkingCopyVersion("2026-09-23T12:00:00.000Z", "2026-09-23T12:00:01.000Z"),
    ).toThrow(WORKING_COPY_CONFLICT_MESSAGE);
    expect(() => assertWorkingCopyVersion(null, "2026-09-23T12:00:01.000Z")).toThrow(
      WORKING_COPY_CONFLICT_MESSAGE,
    );
    expect(() => assertWorkingCopyVersion("2026-09-23T12:00:01.000Z", null)).toThrow(
      WORKING_COPY_CONFLICT_MESSAGE,
    );
  });
});
