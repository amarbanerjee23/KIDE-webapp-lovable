import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, CreditCard, Receipt } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { getBillingStatus } from "@/lib/billing.functions";
import { getWorkspace } from "@/lib/teams.functions";

const title = "Plan & billing — KIDE";
const description =
  "KIDE free evaluation access and historical payment records for your engineering organization.";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

const EVALUATION_FEATURES = [
  "Organization and project workspaces",
  "Five editable real-world starter projects",
  "Saved models, checkpoints and team reviews",
  "Deterministic synthesis and release evidence",
] as const;

function BillingPage() {
  const load = useServerFn(getWorkspace);
  const billing = useServerFn(getBillingStatus);
  const [email, setEmail] = useState("");
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [statuses, setStatuses] = useState<
    Awaited<ReturnType<typeof getBillingStatus>>["organizations"]
  >([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await load();
        const status = await billing();
        if (!active) return;
        setEmail(data.email);
        setOrgs(data.organizations.map((org) => ({ id: org.id, name: org.name, role: org.role })));
        setStatuses(status.organizations);
        setSelectedOrgId((current) => current || data.organizations[0]?.id || "");
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load billing details.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedStatus = statuses.find((org) => org.id === selectedOrgId);
  const activePlan =
    selectedStatus?.subscription?.status === "active" ? selectedStatus.subscription.plan : null;
  const payments = selectedStatus?.payments ?? [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader />
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">Plan &amp; billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
        {loadError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Billing information could not be loaded: {loadError}
          </p>
        )}
        {orgs.length > 1 && (
          <label className="mt-4 block max-w-sm text-xs font-medium">
            Organization
            <select
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Current plan */}
        <section className="mt-6 rounded-md border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                Current plan
              </p>
              <p className="mt-1 text-lg font-semibold">
                {activePlan
                  ? `${activePlan[0]!.toUpperCase()}${activePlan.slice(1)}`
                  : "Evaluation — free"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activePlan
                  ? "An existing subscription is recorded. New paid checkouts are unavailable in v1.0.0."
                  : "Free evaluation is available in v1.0.0. No paid plans or checkout are offered in this release."}
              </p>
            </div>
            <span className="rounded-full border border-data/50 bg-data/10 px-3 py-1 text-xs font-medium text-data">
              {activePlan ? "Recorded active" : "Free evaluation"}
            </span>
          </div>
        </section>

        {/* This release deliberately has no numeric quotas or paid upgrade actions. */}
        <section className="mt-6 max-w-xl rounded-md border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Evaluation access</h2>
          <p className="mt-2 text-2xl font-semibold">$0</p>
          <p className="mt-2 text-xs text-muted-foreground">
            No payment is required for the KIDE v1.0.0 evaluation.
          </p>
          <ul className="mt-4 space-y-2">
            {EVALUATION_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-xs">
                <Check className="mt-0.5 size-3.5 shrink-0 text-data" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Paid subscriptions, enforced plan quotas and enterprise integrations are not included in
            this evaluation release. Future commercial availability and pricing are undecided.
          </p>
          <Button className="mt-5" variant="outline" disabled>
            Current evaluation access
          </Button>
        </section>

        {/* Payment availability and historical transaction records */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-md border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <CreditCard className="size-4 text-muted-foreground" /> Payment method
            </h2>
            <p className="px-4 py-5 text-xs text-muted-foreground">
              No payment method is needed or collected during the v1.0.0 free evaluation. Paid
              checkout is unavailable in this release.
            </p>
          </section>
          <section className="rounded-md border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <Receipt className="size-4 text-muted-foreground" /> Payment history
            </h2>
            {payments.length === 0 ? (
              <p className="px-4 py-5 text-xs text-muted-foreground">
                No payment records for this organization. KIDE v1.0.0 does not accept new payments.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between px-4 py-2.5 text-xs"
                  >
                    <span>
                      {payment.plan} — ${(payment.amount / 100).toFixed(2)}{" "}
                      {payment.currency.toUpperCase()}
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {new Date(payment.created_at).toLocaleDateString()}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          payment.status === "succeeded"
                            ? "bg-data/10 text-data"
                            : payment.status === "failed"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-activity/10 text-activity"
                        }`}
                      >
                        {payment.status}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Return to your workspace?{" "}
          <Link to="/projects" className="text-primary underline underline-offset-2">
            Back to your projects
          </Link>
        </p>
      </div>
    </main>
  );
}
