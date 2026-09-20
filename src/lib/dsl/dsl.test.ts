import { describe, expect, it } from "vitest";
import {
  dslKindForPath,
  linkWorkspace,
  parseActivity,
  parseCapability,
  parseDml,
  parseMnc,
  parseOperation,
  type Diagnostic,
} from "./index";

/**
 * Conformance corpus taken verbatim from the KIDE repository
 * (`qualification/golden/languages/valid`).
 */
const GOLDEN = {
  dml: `Package Golden
DataModel Payload {
  primitives { int value }
}
`,
  op: `Operation Inspect() {
}
`,
  mncspec: `Model Golden
InterfaceDescription Device {
  commands {
    Start[]
  }
  events {
    Publish Ready[]
  }
}
`,
  cap: `Capability Observe compatible component interface Device {
  providesControlCapabilities {
    fireable commands : Start
    receivable events : Ready
  }
}
`,
  activity: `ActivityDiagram GoldenWorkflow
has activities {
  Activity ObserveStep {
    requireCapability : Observe { Start, Ready }
    nextActivity : ObserveStep
  }
}
`,
};

const errors = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.severity === "error");

describe("file kind detection", () => {
  it("maps each KIDE extension to its language", () => {
    expect(dslKindForPath("Ecre.dml")).toBe("dml");
    expect(dslKindForPath("Ecre.mncspec")).toBe("mncspec");
    expect(dslKindForPath("Loading.cap")).toBe("cap");
    expect(dslKindForPath("MissionPlanning.activity")).toBe("activity");
    expect(dslKindForPath("Tools.op")).toBe("op");
    expect(dslKindForPath("notes.txt")).toBeNull();
  });
});

describe("golden models parse without errors", () => {
  it("parses the data model", () => {
    const result = parseDml(GOLDEN.dml);
    expect(errors(result.diagnostics)).toEqual([]);
    expect(result.ast?.name).toBe("Golden");
    expect(result.ast?.dataModels).toHaveLength(1);
    expect(result.ast?.dataModels[0]?.primitives[0]).toMatchObject({
      node: "SimpleType",
      type: "int",
      name: "value",
    });
  });

  it("parses the operation model", () => {
    const result = parseOperation(GOLDEN.op);
    expect(errors(result.diagnostics)).toEqual([]);
    expect(result.ast?.operations[0]?.name).toBe("Inspect");
  });

  it("parses the MNC model", () => {
    const result = parseMnc(GOLDEN.mncspec);
    expect(errors(result.diagnostics)).toEqual([]);
    const iface = result.ast?.interfaces[0];
    expect(iface?.name).toBe("Device");
    expect(iface?.commands.map((c) => c.name)).toEqual(["Start"]);
    expect(iface?.events[0]).toMatchObject({ name: "Ready", publish: true });
  });

  it("parses the capability model", () => {
    const result = parseCapability(GOLDEN.cap);
    expect(errors(result.diagnostics)).toEqual([]);
    const capability = result.ast?.capabilities[0];
    expect(capability?.name).toBe("Observe");
    expect(capability?.componentInterface).toEqual(["Device"]);
    expect(capability?.providesControlCapabilities?.commands).toEqual(["Start"]);
    expect(capability?.providesControlCapabilities?.events).toEqual(["Ready"]);
  });

  it("parses the activity model", () => {
    const result = parseActivity(GOLDEN.activity);
    expect(errors(result.diagnostics)).toEqual([]);
    const diagram = result.ast?.diagrams[0];
    expect(diagram?.name).toBe("GoldenWorkflow");
    expect(diagram?.activities[0]).toMatchObject({
      name: "ObserveStep",
      bindCapability: "Observe",
      nextActivity: "ObserveStep",
    });
    expect(diagram?.activities[0]?.useControlCapabilities).toEqual(["Start", "Ready"]);
  });
});

describe("workspace linking", () => {
  it("resolves references across all five golden models", () => {
    const workspace = linkWorkspace([
      { path: "golden.dml", kind: "dml", source: GOLDEN.dml },
      { path: "golden.op", kind: "op", source: GOLDEN.op },
      { path: "golden.mncspec", kind: "mncspec", source: GOLDEN.mncspec },
      { path: "golden.cap", kind: "cap", source: GOLDEN.cap },
      { path: "golden.activity", kind: "activity", source: GOLDEN.activity },
    ]);
    expect(workspace.errorCount).toBe(0);
  });

  it("reports a capability bound to an unknown interface item", () => {
    const workspace = linkWorkspace([
      { path: "golden.mncspec", kind: "mncspec", source: GOLDEN.mncspec },
      {
        path: "broken.cap",
        kind: "cap",
        source: `Capability Observe compatible component interface Device {
  providesControlCapabilities {
    fireable commands : Stop
  }
}
`,
      },
    ]);
    const messages = workspace.files.flatMap((f) => f.diagnostics.map((d) => d.code));
    expect(messages).toContain("link.unknown-command");
  });

  it("reports an activity bound to an unknown capability", () => {
    const workspace = linkWorkspace([
      { path: "golden.cap", kind: "cap", source: GOLDEN.cap },
      { path: "golden.mncspec", kind: "mncspec", source: GOLDEN.mncspec },
      {
        path: "broken.activity",
        kind: "activity",
        source: `ActivityDiagram W
has activities {
  Activity Step { requireCapability : Missing nextActivity : Step }
}
`,
      },
    ]);
    const codes = workspace.files.flatMap((f) => f.diagnostics.map((d) => d.code));
    expect(codes).toContain("link.unknown-capability");
  });
});

describe("invalid models are rejected", () => {
  it("rejects the golden invalid fixtures for every language", () => {
    expect(errors(parseDml("!!!").diagnostics).length).toBeGreaterThan(0);
    expect(errors(parseOperation("!!!").diagnostics).length).toBeGreaterThan(0);
    expect(errors(parseMnc("!!!").diagnostics).length).toBeGreaterThan(0);
    expect(errors(parseCapability("!!!").diagnostics).length).toBeGreaterThan(0);
    expect(errors(parseActivity("!!!").diagnostics).length).toBeGreaterThan(0);
  });

  it("rejects an activity that never states what performs it", () => {
    const result = parseActivity(`ActivityDiagram W
has activities {
  Activity Step { nextActivity : Step }
}
`);
    expect(result.diagnostics.some((d) => d.code === "activity.missing-performer")).toBe(true);
  });

  it("rejects a duplicate data model name", () => {
    const result = parseDml(`DataModel A { primitives { int x } }
DataModel A { primitives { int y } }
`);
    expect(result.diagnostics.some((d) => d.code === "dml.duplicate-data-model")).toBe(true);
  });

  it("rejects duplicate interface item names", () => {
    const result = parseMnc(`Model M
InterfaceDescription I {
  commands { Go[] Go[] }
}
`);
    expect(result.diagnostics.some((d) => d.code === "mnc.duplicate-interface-item")).toBe(true);
  });

  it("rejects a contradictory parameter check", () => {
    const result = parseMnc(`Model M
InterfaceDescription I {
  commands { Go[ int speed ] }
}
ControlNode N implements interface I {
  CommandResponseBlock {
    Command Go {
      Validate { parameters speed [ Min Value = 10 Max Value = 5 ] }
    }
  }
}
`);
    expect(
      result.diagnostics.some((d) => d.code === "mnc.contradictory-parameter-check"),
    ).toBe(true);
  });

  it("flags an unreachable activity", () => {
    const result = parseActivity(`ActivityDiagram W
has activities {
  Activity A { requireCapability : "Move" nextActivity : A },
  Activity B { requireCapability : "Stop" nextActivity : B }
}
`);
    expect(result.diagnostics.some((d) => d.code === "activity.unreachable-activity")).toBe(true);
  });
});

describe("determinism", () => {
  it("produces identical results for repeated parses", () => {
    for (const [kind, source] of Object.entries(GOLDEN)) {
      const a = JSON.stringify(
        linkWorkspace([{ path: `a.${kind}`, kind: kind as never, source }]),
        (_key, value) => (value instanceof Set ? [...value].sort() : value),
      );
      const b = JSON.stringify(
        linkWorkspace([{ path: `a.${kind}`, kind: kind as never, source }]),
        (_key, value) => (value instanceof Set ? [...value].sort() : value),
      );
      expect(a).toEqual(b);
    }
  });
});

describe("reference workspace", () => {
  it("links the bundled five-language example with no errors", async () => {
    const { SAMPLE_WORKSPACE } = await import("./samples");
    const workspace = linkWorkspace(SAMPLE_WORKSPACE);
    const problems = workspace.files.flatMap((file) =>
      file.diagnostics.map((d) => `${file.path}:${d.line} ${d.code} ${d.message}`),
    );
    expect(problems).toEqual([]);
  });
});
