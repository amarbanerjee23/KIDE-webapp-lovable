import type { Model } from "./kide-dsl";

/** Canonical KIDE source for a parsed model. Round-trips structure, not comments. */
export function serializeModel(model: Model): string {
  return (
    model.capabilities
      .map((capability) => {
        const body = capability.activities
          .map((activity) => {
            const relations = [
              ...activity.requires.map((r) => `    requires ${r}`),
              ...activity.produces.map((p) => `    produces ${p}`),
            ];
            return [
              `  activity ${activity.id} "${activity.label}" {`,
              ...relations,
              "  }",
            ].join("\n");
          })
          .join("\n");
        return [
          `capability ${capability.id} "${capability.label}" {`,
          body,
          "}",
        ]
          .filter((part) => part !== "")
          .join("\n");
      })
      .join("\n\n") + "\n"
  );
}

export function identifierFromLabel(label: string): string {
  const cleaned = label.replace(/[^A-Za-z0-9 _]/g, "").trim();
  const id = cleaned
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z_]/.test(id) ? id : `Item${id}`;
}
