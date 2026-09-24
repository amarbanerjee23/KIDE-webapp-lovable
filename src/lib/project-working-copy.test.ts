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
    expect(() => validateWorkingCopySources({ "bad\0path.dml": "DataModel Demo {}" })).toThrow(
      "invalid file",
    );
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
  });
});
