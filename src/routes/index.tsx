import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Code2, GitBranch, Network, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const title = "KIDE — Knowledge-integrated systems engineering";
const description =
  "Design explainable control systems from requirements and device knowledge, with qualified synthesis, verification evidence and governed release.";

export const Route = createFileRoute("/")({
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
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-7xl items-center px-5 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <img src="/favicon.png" alt="" className="size-9" />
          <span className="text-lg font-semibold">KIDE</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth">
              Start engineering
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase text-primary">
            Knowledge-integrated design environment
          </p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Engineer control systems with evidence, not assumptions.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Connect intent, device knowledge and executable activities. KIDE synthesizes
            deterministic control designs, explains every decision and blocks unsafe releases.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Open your workspace
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">Create account</Link>
            </Button>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <Proof
              icon={ShieldCheck}
              title="Qualified synthesis"
              text="Deterministic rules with independent validation."
            />
            <Proof
              icon={GitBranch}
              title="Complete traceability"
              text="Every output links back to intent and knowledge."
            />
            <Proof
              icon={Code2}
              title="Five linked DSLs"
              text="Semantic editing across the complete model set."
            />
          </div>
        </div>

        <div className="min-h-[460px] border border-border bg-card p-4 shadow-2xl shadow-background sm:p-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <img src="/favicon.png" alt="" className="size-8" />
              <div>
                <p className="text-sm font-semibold">Autonomous Routing</p>
                <p className="text-[11px] text-muted-foreground">Release baseline 12</p>
              </div>
            </div>
            <span className="border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
              QUALIFIED
            </span>
          </div>

          <div className="mt-5 grid grid-cols-[120px_1fr] gap-4 sm:grid-cols-[140px_1fr]">
            <div className="space-y-2 border-r border-border pr-3 sm:pr-4">
              {[
                "Intent",
                "Knowledge",
                "Capabilities",
                "Activities",
                "Synthesis",
                "Verification",
                "Release",
              ].map((step, index) => (
                <div
                  key={step}
                  className={`flex items-center gap-2 px-2 py-2 text-[10px] sm:text-[11px] ${
                    index === 3 ? "bg-secondary text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <span className="grid size-5 shrink-0 place-items-center border border-border font-mono text-[9px]">
                    {index + 1}
                  </span>
                  {step}
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold">Mission Planning Activity</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Semantic graph · all references resolved
              </p>
              <div className="mt-8 space-y-5">
                {["Plan route", "Move to waypoint", "Recharge"].map((node, index) => (
                  <div key={node} className="relative border border-border bg-background p-3">
                    <div className="flex items-center gap-2">
                      <Network className="size-4 shrink-0 text-capability" />
                      <span className="text-xs font-medium">{node}</span>
                      <Check className="ml-auto size-3.5 text-primary" />
                    </div>
                    {index < 2 && (
                      <span className="absolute left-6 top-full h-5 border-l border-dashed border-primary" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            <Stat value="5" label="linked models" />
            <Stat value="0" label="errors" />
            <Stat value="6/6" label="gates passed" />
          </div>
        </div>
      </section>
    </main>
  );
}

function Proof({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <div className="border-l-2 border-primary pl-3">
      <Icon className="size-4 text-primary" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-lg font-semibold text-primary">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
