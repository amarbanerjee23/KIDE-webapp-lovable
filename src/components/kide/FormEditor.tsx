import { useState } from "react";
import { Box, Plus, Trash2, X } from "lucide-react";
import type { Model } from "@/lib/kide-dsl";
import { identifierFromLabel, serializeModel } from "@/lib/kide-serialize";
import { Button } from "@/components/ui/button";

type Props = {
  model: Model;
  onChange: (source: string) => void;
};

function clone(model: Model): Model {
  return {
    ...model,
    capabilities: model.capabilities.map((c) => ({
      ...c,
      activities: c.activities.map((a) => ({
        ...a,
        requires: [...a.requires],
        produces: [...a.produces],
      })),
    })),
  };
}

export function FormEditor({ model, onChange }: Props) {
  const [draftResource, setDraftResource] = useState<Record<string, string>>({});

  const commit = (mutate: (next: Model) => void) => {
    const next = clone(model);
    mutate(next);
    onChange(serializeModel(next));
  };

  if (model.capabilities.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-sm font-medium">No capabilities yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add the first capability to start describing this system.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() =>
              commit((next) =>
                next.capabilities.push({
                  id: "NewCapability",
                  label: "New Capability",
                  activities: [],
                  line: 0,
                }),
              )
            }
          >
            <Plus />
            Add capability
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {model.capabilities.map((capability, ci) => (
          <section key={`${capability.id}-${ci}`} className="rounded-md border border-border bg-card">
            <header className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Box className="size-4 text-capability" />
              <input
                aria-label={`Capability name for ${capability.label}`}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={capability.label}
                onChange={(event) =>
                  commit((next) => {
                    const target = next.capabilities[ci];
                    if (!target) return;
                    target.label = event.target.value;
                    target.id = identifierFromLabel(event.target.value) || target.id;
                  })
                }
              />
              <span className="font-mono text-[10px] text-muted-foreground">{capability.id}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Remove ${capability.label}`}
                onClick={() => commit((next) => next.capabilities.splice(ci, 1))}
              >
                <Trash2 />
              </Button>
            </header>

            <div className="space-y-3 p-3">
              {capability.activities.map((activity, ai) => (
                <div key={`${activity.id}-${ai}`} className="rounded-md border border-border/70 bg-background p-3">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`Activity name for ${activity.label}`}
                      className="h-8 flex-1 rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={activity.label}
                      onChange={(event) =>
                        commit((next) => {
                          const target = next.capabilities[ci]?.activities[ai];
                          if (!target) return;
                          target.label = event.target.value;
                          target.id = identifierFromLabel(event.target.value) || target.id;
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Remove ${activity.label}`}
                      onClick={() => commit((next) => next.capabilities[ci]?.activities.splice(ai, 1))}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(["requires", "produces"] as const).map((kind) => {
                      const key = `${ci}-${ai}-${kind}`;
                      return (
                        <div key={kind}>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                            {kind === "requires" ? "Inputs" : "Outputs"}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {activity[kind].map((resource, ri) => (
                              <span
                                key={`${resource}-${ri}`}
                                className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-[10px] ${
                                  kind === "requires"
                                    ? "border-resource/40 bg-resource/10 text-resource"
                                    : "border-activity/40 bg-activity/10 text-activity"
                                }`}
                              >
                                {resource}
                                <button
                                  type="button"
                                  aria-label={`Remove ${resource}`}
                                  onClick={() =>
                                    commit((next) =>
                                      next.capabilities[ci]?.activities[ai]?.[kind].splice(ri, 1),
                                    )
                                  }
                                >
                                  <X className="size-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <form
                            className="mt-2 flex gap-1.5"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const value = (draftResource[key] ?? "").trim();
                              if (!value) return;
                              commit((next) =>
                                next.capabilities[ci]?.activities[ai]?.[kind].push(
                                  identifierFromLabel(value),
                                ),
                              );
                              setDraftResource((prev) => ({ ...prev, [key]: "" }));
                            }}
                          >
                            <input
                              aria-label={`Add ${kind} artefact to ${activity.label}`}
                              placeholder="Artefact name"
                              className="h-7 flex-1 rounded-md border border-input bg-card px-2 font-mono text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={draftResource[key] ?? ""}
                              onChange={(event) =>
                                setDraftResource((prev) => ({ ...prev, [key]: event.target.value }))
                              }
                            />
                            <Button type="submit" variant="outline" size="sm" className="h-7 px-2">
                              <Plus />
                            </Button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  commit((next) =>
                    next.capabilities[ci]?.activities.push({
                      id: "NewActivity",
                      label: "New Activity",
                      requires: [],
                      produces: [],
                      line: 0,
                    }),
                  )
                }
              >
                <Plus />
                Add activity
              </Button>
            </div>
          </section>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            commit((next) =>
              next.capabilities.push({
                id: "NewCapability",
                label: "New Capability",
                activities: [],
                line: 0,
              }),
            )
          }
        >
          <Plus />
          Add capability
        </Button>
        <p className="pb-4 text-[11px] text-muted-foreground">
          Form edits rewrite the model in canonical form. Comments written in Source mode are not kept.
        </p>
      </div>
    </div>
  );
}
