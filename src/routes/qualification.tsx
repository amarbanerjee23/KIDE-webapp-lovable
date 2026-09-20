import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, CircleSlash, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { synthesize } from "@/lib/kide/synthesis";
import { qualify, VALIDATED_DEVICE_LIMIT } from "@/lib/kide/qualification";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";

const title = "Synthesis Qualification — KIDE";
const description =
  "The evidence that the synthesis algorithm may be trusted for this model set: every rule checked, every algorithm property tested, and the scale it was validated at.";

export const Route = createFileRoute("/qualification")({
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
  component: Qualification,
});

function StatusIcon({ status }: { status: "pass" | "fail" | "not-applicable" }) {
  if (status === "pass") return <CircleCheck className="size-4 shrink-0 text-emerald-400" />;
  if (status === "fail") return <CircleAlert className="size-4 shrink-0 text-destructive" />;
  return <CircleSlash className="size-4 shrink-0 text-muted-foreground" />;
}

function Qualification() {
  const sources = useWorkspaceSources();
  const { report, qualification } = useMemo(() => {
    const workspace = linkFrom(sources);
    const synthesisReport = synthesize(workspace);
    return { report: synthesisReport, qualification: qualify(workspace, synthesisReport) };
  }, [sources]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft />
            Workbench
          </Link>
        </Button>
        <div>
          <h1 className="text-sm font-semibold">Synthesis qualification</h1>
          <p className="text-[10px] text-muted-foreground">
            {qualification.qualificationVersion} · generator {qualification.generator}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/synthesis">Synthesis review</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/trust">Trust centre</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <section
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            qualification.qualified
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          <ShieldCheck
            className={`mt-0.5 size-5 ${qualification.qualified ? "text-emerald-400" : "text-destructive"}`}
          />
          <div>
            <h2 className="text-sm font-semibold">
              {qualification.qualified
                ? "Qualified — synthesis results may be approved for release"
                : "Not qualified — approval and export stay blocked"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {qualification.rulesChecked} rules checked, {qualification.rulesFailed} failed ·{" "}
              {qualification.properties.length} algorithm properties tested,{" "}
              {qualification.propertiesFailed} failed · {qualification.deviceCount} device
              interfaces (validated up to {VALIDATED_DEVICE_LIMIT}) · {report.candidates.length}{" "}
              candidate designs.
            </p>
            {qualification.blockedReasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-destructive">
                {qualification.blockedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Qualification rules
          </h2>
          <div className="space-y-2">
            {qualification.rules.map((rule) => (
              <article key={rule.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <StatusIcon status={rule.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{rule.id}</span>
                      <h3 className="text-sm font-medium">{rule.title}</h3>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{rule.detail}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{rule.rationale}</p>
                    <p className="mt-1 text-[10px] italic text-muted-foreground/70">{rule.source}</p>
                    {rule.elements.length > 0 ? (
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {rule.elements.map((element) => (
                          <li
                            key={element}
                            className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive"
                          >
                            {element}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Comparison with the desktop KIDE tool
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            {qualification.conformance.total} reference model sets are run through this engine and
            compared with the result the desktop transformation is specified to produce.{" "}
            {qualification.conformance.failed} differ.
          </p>
          <div className="space-y-2">
            {qualification.conformance.cases.map((entry) => (
              <article key={entry.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <StatusIcon status={entry.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">{entry.id}</span>
                      <h3 className="text-sm font-medium">{entry.title}</h3>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {entry.provenance === "eclipse-reference" ? "repository models" : "derived variant"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">{entry.source}</p>
                    {entry.differences.length > 0 ? (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-destructive">
                        {entry.differences.map((difference) => (
                          <li key={difference}>{difference}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Algorithm properties
          </h2>
          <div className="space-y-2">
            {qualification.properties.map((property) => (
              <article
                key={property.id}
                className="flex items-start gap-2 rounded-lg border border-border bg-card p-3"
              >
                <StatusIcon status={property.status} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{property.id}</span>
                    <h3 className="text-sm font-medium">{property.title}</h3>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{property.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
