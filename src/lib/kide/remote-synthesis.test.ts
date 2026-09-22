import { describe, expect, it } from "vitest";
import { linkWorkspace, SAMPLE_WORKSPACE } from "@/lib/dsl";
import { buildRemoteSynthesisRequest } from "./remote-synthesis";

describe("remote synthesis request builder", () => {
  it("derives a deterministic capability contract from the reference workspace", () => {
    const workspace = linkWorkspace(SAMPLE_WORKSPACE);
    const built = buildRemoteSynthesisRequest(workspace);

    expect(built.issues).toEqual([]);
    expect(built.request?.projectId).toBe("MissionPlanning");
    expect(built.request?.activities).toEqual([
      {
        name: "MoveToWaypoint",
        capabilityUri: "http://iiit.serc.com/ontologies/capability.owl#Navigate",
      },
      {
        name: "RechargeStep",
        capabilityUri: "http://iiit.serc.com/ontologies/capability.owl#Recharge",
      },
    ]);
    expect(built.request?.executionPlan).toEqual([
      {
        kind: "sequential",
        activities: ["MoveToWaypoint", "RechargeStep"],
      },
    ]);

    const navigate = built.request?.capabilityMachines.find((machine) =>
      machine.capabilityUri.endsWith("#Navigate"),
    );
    expect(navigate?.sessionType).toBeUndefined();
    expect(navigate?.states).toEqual(["Idle", "Moving", "Charging"]);
    expect(navigate?.startStates).toEqual(["Idle"]);
    expect(navigate?.endStates).toEqual(["Idle"]);
    expect(navigate?.transitions).toContainEqual({
      source: "Idle",
      target: "Moving",
      event: "command:MoveTo",
    });
  });

  it("fails closed when device operating-state metadata is absent", () => {
    const files = SAMPLE_WORKSPACE.map((file) => ({
      ...file,
      source:
        file.kind === "mncspec"
          ? file.source.replace(
              /\n  operatingStates \{[\s\S]*?\n  \}\n  IPaddress/,
              "\n  IPaddress",
            )
          : file.source,
    }));
    const built = buildRemoteSynthesisRequest(linkWorkspace(files));

    expect(built.request).toBeNull();
    expect(built.issues.some((issue) => issue.includes("must declare operating states"))).toBe(
      true,
    );
  });

  it("does not flatten a branching capability workflow into a false sequence", () => {
    const files = SAMPLE_WORKSPACE.map((file) => ({
      ...file,
      source:
        file.kind === "activity"
          ? file.source.replace(
              "from BatteryLow => nextActivity : RechargeStep",
              "from BatteryLow => nextActivity : MoveToWaypoint",
            )
          : file.source,
    }));
    const built = buildRemoteSynthesisRequest(linkWorkspace(files));

    expect(built.request).toBeNull();
    expect(built.issues.some((issue) => issue.includes("multiple capability"))).toBe(true);
  });
});
