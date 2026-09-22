import { describe, expect, it } from "vitest";
import {
  coerceStoredSources,
  validateWorkingCopySources,
  WORKING_COPY_LABEL,
} from "./project-working-copy";

describe("project working-copy storage contract", () => {
  it("uses an internal sentinel label", () => {
    expect(WORKING_COPY_LABEL).toBe("__kide_working_copy__");
  });

  it("accepts a bounded source map", () => {
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
    expect(() => validateWorkingCopySources({})).toThrow("between 1 and");
    expect(() => validateWorkingCopySources({ "bad\0path.dml": "DataModel Demo {}" })).toThrow(
      "invalid file",
    );
  });

  it("coerces only string-valued stored sources", () => {
    expect(coerceStoredSources({ "model.dml": "DataModel Demo {}" })).toEqual({
      "model.dml": "DataModel Demo {}",
    });
    expect(coerceStoredSources({ "model.dml": 42 })).toBeNull();
  });
});
