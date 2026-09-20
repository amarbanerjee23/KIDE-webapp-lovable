import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, CreditCard, Receipt, Sparkles } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { getBillingStatus } from "@/lib/billing.functions";
import { getWorkspace } from "@/lib/teams.functions";

const title = "Plan & billing — KIDE";
const description =
  "Your KIDE subscription plan, usage, payment method and invoices for your engineering organization.";

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

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$0",
    cadence: "forever",
    blurb: "Evaluate KIDE with a small team.",
    features: ["1 organization", "3 projects", "5 team members", "Community support"],
  },
  {
    id: "professional",
    name: "Professional",
    price: "$49",
    cadence: "per user / month",
    blurb: "For teams shipping verified control designs.",
    features: [
      "Unlimited projects",
      "Unlimited team members",
      "Review workflow & audit history",
      "Qualified synthesis with evidence bundles",
      "Priority support",
    ],
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "annual agreement",
    blurb: "For regulated, multi-site engineering programs.",
    features: [
      "Everything in Professional",
      "Single sign-on (SSO / SAML)",
      "Dedicated qualification support",
      "Custom data residency",
      "Named success engineer",
    ],
  },
] as const;

function BillingPage() {
  const load = useServerFn(getWorkspace);
  const billing = useServerFn(getBillingStatus);
  const [email, setEmail] = useState("");
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [activePlan, setActivePlan] = useState<string | null>(null);
  const [payments, setPayments] = useState<
    Array<{ id: string; plan: string; amount: number; currency: string; status: string; created_at: string }>
  >([]);

  useEffect(() => {
    void (async () => {
      const data = await load();
      setEmail(data.email);
      setOrgs(data.organizations.map((org) => ({ id: org.id, name: org.name, role: org.role })));
      const status = await billing();
      const paid = status.organizations.find((org) => org.subscription?.status === "active");
      setActivePlan(paid?.subscription?.plan ?? null);
      setPayments(status.organizations.flatMap((org) => org.payments));
    })();
  }, []);

  const canManage = orgs.some((org) => org.role === "owner" || org.role === "administrator");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader />
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">Plan &amp; billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>

        {/* Current plan */}
        <section className="mt-6 rounded-md border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Current plan</p>
              <p className="mt-1 text-lg font-semibold">
                {activePlan ? `${activePlan[0]!.toUpperCase()}${activePlan.slice(1)}` : "Starter — free"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activePlan
                  ? "Your subscription is active. Billing is handled by the open-source Hyperswitch payment orchestrator."
                  : "Upgrade any time — checkout runs on your own open-source Hyperswitch instance, so KIDE never sees card details."}
              </p>
            </div>
            <span className="rounded-full border border-data/50 bg-data/10 px-3 py-1 text-xs font-medium text-data">
              Active
            </span>
          </div>
          {!canManage && orgs.length > 0 && (
            <p className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              Only organization owners and administrators can change the plan.
            </p>
          )}
        </section>

        {/* Plan tiers */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <section
              key={plan.id}
              className={`flex flex-col rounded-md border bg-card p-5 ${
                "highlight" in plan && plan.highlight ? "border-primary" : "border-border"
              }`}
            >
              {"highlight" in plan && plan.highlight && (
                <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Sparkles className="size-3" /> Recommended
                </span>
              )}
              <h2 className="text-sm font-semibold">{plan.name}</h2>
              <p className="mt-2 text-2xl font-semibold">{plan.price}</p>
              <p className="text-[11px] text-muted-foreground">{plan.cadence}</p>
              <p className="mt-2 text-xs text-muted-foreground">{plan.blurb}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-data" />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.id === "professional" ? (
                <Button asChild className="mt-5" disabled={!canManage && orgs.length > 0}>
                  <Link to="/checkout" search={{ plan: "professional" }}>
                    Upgrade
                  </Link>
                </Button>
              ) : (
                <Button
                  className="mt-5"
                  variant="outline"
                  disabled={plan.id === "starter"}
                  title={plan.id === "enterprise" ? "Contact sales for an annual agreement" : undefined}
                >
                  {plan.id === "starter" ? "Current plan" : "Contact sales"}
                </Button>
              )}
            </section>
          ))}
        </div>

        {/* Payment method + invoices */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-md border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <CreditCard className="size-4 text-muted-foreground" /> Payment method
            </h2>
            <p className="px-4 py-5 text-xs text-muted-foreground">
              No payment method on file. When payments are connected, your card is handled securely
              by the checkout provider — KIDE never sees or stores card numbers.
            </p>
          </section>
          <section className="rounded-md border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <Receipt className="size-4 text-muted-foreground" /> Invoices
            </h2>
            {payments.length === 0 ? (
              <p className="px-4 py-5 text-xs text-muted-foreground">
                No invoices yet. Past invoices and receipts will appear here once a paid plan is
                active.
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
          Questions about plans? <Link to="/projects" className="text-primary">Back to your projects</Link>
        </p>
      </div>
    </main>
  );
}
