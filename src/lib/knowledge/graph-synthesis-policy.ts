export interface GraphSynthesisProductionPolicy {
  productionEnabled: boolean;
  killSwitch: boolean;
  enabled: boolean;
  reason: string;
}

function explicitTrue(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function resolveGraphSynthesisProductionPolicy(
  env: Record<string, string | undefined>,
): GraphSynthesisProductionPolicy {
  const productionEnabled = explicitTrue(env["KIDE_GRAPH_SYNTHESIS_PRODUCTION_ENABLED"]);
  const killSwitch = explicitTrue(env["KIDE_GRAPH_SYNTHESIS_KILL_SWITCH"]);

  return {
    productionEnabled,
    killSwitch,
    enabled: productionEnabled && !killSwitch,
    reason: killSwitch
      ? "Graph-assisted synthesis production promotion is disabled by the runtime kill switch."
      : productionEnabled
        ? "Graph-assisted synthesis production promotion is enabled."
        : "Graph-assisted synthesis production promotion has not been enabled at runtime.",
  };
}
