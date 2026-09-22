import { describe, expect, it } from "vitest";
import { SAMPLE_WORKSPACE } from "@/lib/dsl";
import { validateStandaloneSynthesisInput } from "./standalone-synthesis-contract";

describe("standalone synthesis contract", () => {
  it("accepts the KIDE reference workspace", () => {
    const input = validateStandaloneSynthesisInput({ files: SAMPLE_WORKSPACE });
    expect(input.files).toHaveLength(SAMPLE_WORKSPACE.length);
  });

  it("rejects duplicate paths", () => {
    const file = SAMPLE_WORKSPACE[0];
    expect(() =>
      validateStandaloneSynthesisInput({ files: [file, file] }),
    ).toThrow("duplicate workspace path");
  });

  it("rejects unknown DSL kinds", () => {
    expect(() =>
      validateStandaloneSynthesisInput({
        files: [{ path: "model.txt", kind: "txt", source: "x" }],
      }),
    ).toThrow("not a supported KIDE DSL");
  });

  it("rejects oversized source payloads", () => {
    expect(() =>
      validateStandaloneSynthesisInput({
        files: [{ path: "model.dml", kind: "dml", source: "x".repeat(1_000_001) }],
      }),
    ).toThrow("per-file limit");
  });
});
