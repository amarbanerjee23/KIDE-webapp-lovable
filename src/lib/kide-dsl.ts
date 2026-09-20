export type Activity = {
  id: string;
  label: string;
  requires: string[];
  produces: string[];
  line: number;
};

export type Capability = {
  id: string;
  label: string;
  activities: Activity[];
  line: number;
};

export type Diagnostic = {
  line: number;
  message: string;
  severity: "error" | "warning";
};

export type Model = {
  capabilities: Capability[];
  resources: string[];
  diagnostics: Diagnostic[];
};

const CAP_RE = /^capability\s+([A-Za-z_][\w]*)\s*(?:"([^"]*)")?\s*\{?\s*$/;
const ACT_RE = /^activity\s+([A-Za-z_][\w]*)\s*(?:"([^"]*)")?\s*\{?\s*$/;
const REL_RE = /^(requires|produces)\s+([A-Za-z_][\w]*)\s*$/;

function humanize(id: string) {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

export function parseModel(source: string): Model {
  const capabilities: Capability[] = [];
  const diagnostics: Diagnostic[] = [];
  const resourceOrder: string[] = [];

  let currentCap: Capability | null = null;
  let currentAct: Activity | null = null;

  const addResource = (name: string) => {
    if (!resourceOrder.includes(name)) resourceOrder.push(name);
  };

  source.split("\n").forEach((raw, i) => {
    const line = i + 1;
    const text = raw.replace(/\/\/.*$/, "").trim();
    if (!text) return;

    if (text === "}") {
      if (currentAct) currentAct = null;
      else if (currentCap) currentCap = null;
      else
        diagnostics.push({
          line,
          severity: "error",
          message: "Extra closing brace — there is nothing open to close here.",
        });
      return;
    }

    const cap = text.match(CAP_RE);
    if (cap) {
      if (currentCap) {
        diagnostics.push({
          line,
          severity: "error",
          message: `Capability "${currentCap.label}" was never closed. Add a } before starting a new capability.`,
        });
      }
      const capId = cap[1] ?? "Unnamed";
      const nextCap: Capability = {
        id: capId,
        label: cap[2] || humanize(capId),
        activities: [],
        line,
      };
      currentAct = null;
      currentCap = nextCap;
      capabilities.push(nextCap);
      return;
    }

    const act = text.match(ACT_RE);
    if (act) {
      const owner: Capability | null = currentCap;
      if (!owner) {
        diagnostics.push({
          line,
          severity: "error",
          message: `Activity "${act[2] || act[1]}" has no owning capability. Move it inside a capability block.`,
        });
        return;
      }
      const actId = act[1] ?? "Unnamed";
      const nextAct: Activity = {
        id: actId,
        label: act[2] || humanize(actId),
        requires: [],
        produces: [],
        line,
      };
      currentAct = nextAct;
      owner.activities.push(nextAct);
      return;
    }

    const rel = text.match(REL_RE);
    if (rel) {
      const holder: Activity | null = currentAct;
      const kind = rel[1] ?? "";
      const target = rel[2] ?? "";
      if (!holder) {
        diagnostics.push({
          line,
          severity: "error",
          message: `"${kind} ${target}" must sit inside an activity block.`,
        });
        return;
      }
      addResource(target);
      if (kind === "requires") holder.requires.push(target);
      else holder.produces.push(target);
      return;
    }

    diagnostics.push({
      line,
      severity: "error",
      message: `Not something KIDE understands. Try: capability Name "Label" { … }, activity Name "Label" { … }, requires X, or produces X.`,
    });
  });

  const unclosed = currentCap as Capability | null;
  if (unclosed) {
    diagnostics.push({
      line: unclosed.line,
      severity: "error",
      message: `Capability "${unclosed.label}" is missing its closing }.`,
    });
  }


  for (const c of capabilities) {
    if (c.activities.length === 0) {
      diagnostics.push({
        line: c.line,
        severity: "warning",
        message: `Capability "${c.label}" has no activities, so it will not appear in any transformation.`,
      });
    }
  }

  const produced = new Set(
    capabilities.flatMap((c) => c.activities.flatMap((a) => a.produces)),
  );
  for (const c of capabilities) {
    for (const a of c.activities) {
      for (const r of a.requires) {
        if (!produced.has(r)) {
          diagnostics.push({
            line: a.line,
            severity: "warning",
            message: `"${a.label}" needs ${r}, but no activity produces it. Add a producer or mark it as external.`,
          });
        }
      }
    }
  }

  return { capabilities, resources: resourceOrder, diagnostics };
}

export const SAMPLES: { name: string; blurb: string; source: string }[] = [
  {
    name: "Mission planning",
    blurb: "Two capabilities exchanging a route model",
    source: `// KIDE model — capabilities own activities, activities exchange artefacts
capability FleetOps "Fleet Operations" {
  activity CollectTelemetry "Collect Telemetry" {
    produces TelemetryStream
  }
  activity PlanRoute "Plan Route" {
    requires TelemetryStream
    produces RoutePlan
  }
}

capability Dispatch "Dispatch Control" {
  activity AssignVehicle "Assign Vehicle" {
    requires RoutePlan
    produces Assignment
  }
  activity NotifyDriver "Notify Driver" {
    requires Assignment
  }
}
`,
  },
  {
    name: "Activity to MNC",
    blurb: "Transformation chain feeding the MNC metamodel",
    source: `capability Modelling "Activity Modelling" {
  activity AuthorActivity "Author Activity Model" {
    produces ActivityModel
  }
  activity Validate "Validate Activity Model" {
    requires ActivityModel
    produces ValidatedActivity
  }
}

capability Transformation "Activity to MNC" {
  activity Transform "Transform to MNC" {
    requires ValidatedActivity
    produces MncModel
  }
  activity Render "Render Sirius Diagram" {
    requires MncModel
  }
}
`,
  },
  {
    name: "With a warning",
    blurb: "Shows how KIDE explains a broken model",
    source: `capability Intake "Knowledge Intake" {
  activity Ingest "Ingest Source" {
    requires ExternalFeed
    produces RawKnowledge
  }
}

capability Curation "Curation" {
}
`,
  },
];
