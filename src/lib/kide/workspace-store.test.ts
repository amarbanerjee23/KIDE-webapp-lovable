import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWorkspace,
  createWorkspaceFile,
  deleteWorkspaceFile,
  renameWorkspaceFile,
  replaceWorkspaceSources,
  setSource,
} from "@/lib/kide/workspace-store";

describe("browser editor model lifecycle persistence limits", () => {
  beforeEach(() => clearWorkspace());

  it("creates nested source files, supports edits and renames, then deletes them", () => {
    expect(createWorkspaceFile("custom/Telemetry", "dml")).toBe("custom/Telemetry.dml");
    expect(() => setSource("custom/Telemetry.dml", "DataModel Telemetry {}")).not.toThrow();
    expect(renameWorkspaceFile("custom/Telemetry.dml", "custom/Sensors", "dml")).toBe(
      "custom/Sensors.dml",
    );
    expect(() => setSource("custom/Sensors.dml", "DataModel Sensors {}")).not.toThrow();
    deleteWorkspaceFile("custom/Sensors.dml");
    expect(() => setSource("custom/Sensors.dml", "unowned edit")).toThrow("does not exist");
  });

  it("does not allow a 101st source file after 100 valid new model files", () => {
    for (let index = 0; index < 100; index += 1) {
      createWorkspaceFile(`models/Model${index}`, "dml");
    }
    expect(() => createWorkspaceFile("models/Model100", "dml")).toThrow("at most 100 files");
    deleteWorkspaceFile("models/Model0.dml");
    expect(createWorkspaceFile("models/Model100", "dml")).toBe("models/Model100.dml");
  });

  it("rejects a pasted model larger than the server limit without mutating saved sources", () => {
    replaceWorkspaceSources({ "safe.dml": "DataModel Safe {}" });
    expect(() => setSource("safe.dml", "x".repeat(1_000_001))).toThrow("storage limit");
    expect(() => setSource("safe.dml", "DataModel Updated {}")).not.toThrow();
  });

  it("rejects edit that exceeds the aggregate 5M-character budget", () => {
    const sources = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [`m${index}.dml`, "x".repeat(1_000_000)]),
    );
    replaceWorkspaceSources({ ...sources, "extra.dml": "" });
    expect(() => setSource("extra.dml", "extra")).toThrow("total storage limit");
    expect(() => setSource("extra.dml", "")).not.toThrow();
    expect(() => setSource("m0.dml", "x".repeat(999_990))).not.toThrow();
    expect(() => setSource("extra.dml", "extra")).not.toThrow();
  });

  it("rejects invalid replacements and renames without corrupting the source map", () => {
    replaceWorkspaceSources({ "nested/Device.dml": "DataModel Device {}" });
    expect(() =>
      replaceWorkspaceSources({ "nested/Device.dml": "valid", "../escape.dml": "invalid" }),
    ).toThrow("invalid file");
    expect(() => renameWorkspaceFile("nested/Device.dml", "nested/../danger", "dml")).toThrow(
      "invalid segment",
    );
    expect(() => setSource("nested/Device.dml", "DataModel DeviceAgain {}")).not.toThrow();
    expect(() => setSource("__proto__", "fake")).toThrow("does not exist");
  });
});
