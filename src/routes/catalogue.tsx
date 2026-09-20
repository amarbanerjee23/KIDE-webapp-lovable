import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, CircleAlert, Cpu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCatalogue } from "@/lib/kide/catalogue";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";

const title = "Capability Catalogue — KIDE";
const description =
  "Browse every capability the devices offer, what it commands and observes, where it is already used, and why a capability is or is not eligible.";

export const Route = createFileRoute("/catalogue")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Catalogue,
});

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${tone}`}>{label}</span>
  );
}

function Catalogue() {
  const sources = useWorkspaceSources();
  const catalogue = useMemo(() => buildCatalogue(linkFrom(sources)), [sources]);
  const [query, setQuery] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);

  const capabilities = catalogue.capabilities.filter((entry) => {
    if (eligibleOnly && !entry.eligible) return false;
    const haystack = [entry.name, entry.componentInterface, ...entry.commands]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft />
            Workbench
          </Link>
        </Button>
        <div>
          <h1 className="text-sm font-semibold">Capability catalogue</h1>
          <p className="text-[10px] text-muted-foreground">
            {catalogue.eligibleCount} of {catalogue.capabilities.length} capabilities eligible ·{" "}
            {catalogue.devices.length} device interfaces
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find capabilities"
              className="h-8 w-56 rounded-md border border-input bg-background pl-8 pr-2 text-xs"
            />
          </label>
          <Button
            size="sm"
            variant={eligibleOnly ? "default" : "outline"}
            onClick={() => setEligibleOnly((value) => !value)}
          >
            Eligible only
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-5 p-5 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-2">
          {capabilities.map((entry) => (
            <article
              key={entry.name}
              className={`rounded-lg border p-4 ${
                entry.eligible ? "border-border bg-card" : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <header className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{entry.name}</h2>
                <span className="text-[11px] text-muted-foreground">
                  on {entry.componentInterface ?? "no interface"}
                </span>
                <span
                  className={`ml-auto flex items-center gap-1 text-[11px] ${
                    entry.eligible ? "text-primary" : "text-destructive"
                  }`}
                >
                  {entry.eligible ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                  {entry.eligible ? "Eligible" : "Not eligible"}
                </span>
              </header>

              <div className="mt-2 flex flex-wrap gap-1">
                {entry.commands.map((name) => (
                  <Chip key={`c${name}`} label={`cmd ${name}`} tone="bg-primary/10 text-primary" />
                ))}
                {entry.events.map((name) => (
                  <Chip key={`e${name}`} label={`obs ${name}`} tone="bg-muted text-muted-foreground" />
                ))}
                {entry.dataPoints.map((name) => (
                  <Chip key={`d${name}`} label={`data ${name}`} tone="bg-muted text-muted-foreground" />
                ))}
                {entry.alarms.map((name) => (
                  <Chip key={`a${name}`} label={`alarm ${name}`} tone="bg-destructive/10 text-destructive" />
                ))}
              </div>

              {entry.outcomes.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Reports outcomes: <span className="font-mono">{entry.outcomes.join(", ")}</span>
                </p>
              )}

              <p className="mt-2 text-[11px] text-muted-foreground">
                {entry.usedBy.length > 0
                  ? `Used by ${entry.usedBy.join(", ")}.`
                  : "Not used by any workflow step yet."}
              </p>

              {!entry.eligible && (
                <ul className="mt-2 space-y-1">
                  {entry.reasons.map((reason) => (
                    <li key={reason} className="text-[11px] text-destructive">
                      Why rejected: {reason}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {capabilities.length === 0 && (
            <p className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
              No capability matches that search.
            </p>
          )}
        </section>

        <aside className="space-y-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Cpu className="size-3.5" />
            Device interfaces
          </h2>
          {catalogue.devices.map((device) => (
            <div key={device.name} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-semibold">{device.name}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {device.commands.length} commands · {device.events.length} events ·{" "}
                {device.alarms.length} alarms · {device.dataPoints.length} data points
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {device.backedCapabilities.length > 0
                  ? `Backs ${device.backedCapabilities.join(", ")}.`
                  : "No capability uses this interface."}
              </p>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
