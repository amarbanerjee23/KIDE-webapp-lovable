import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { createCheckout, PLAN_CATALOG, type CreateCheckoutResult } from "@/lib/billing.functions";
import { getWorkspace } from "@/lib/teams.functions";

const title = "Checkout — KIDE";
const description = "Upgrade your KIDE organization with the open-source Hyperswitch checkout.";

type Search = { plan?: string | undefined };

export const Route = createFileRoute("/_authenticated/checkout")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    plan: typeof search["plan"] === "string" ? (search["plan"] as string) : undefined,
  }),
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
  component: CheckoutPage,
});

type HyperWidget = {
  confirmPayment: (args: {
    elements: unknown;
    confirmParams: { return_url: string };
    redirect: "if_required";
  }) => Promise<{ error?: { message?: string }; paymentIntent?: { status?: string } }>;
};

function CheckoutPage() {
  const { plan } = Route.useSearch();
  const planId = plan && plan in PLAN_CATALOG ? (plan as keyof typeof PLAN_CATALOG) : "professional";
  const planInfo = PLAN_CATALOG[planId];

  const workspace = useServerFn(getWorkspace);
  const checkout = useServerFn(createCheckout);

  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [orgId, setOrgId] = useState("");
  const [session, setSession] = useState<CreateCheckoutResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [widgetReady, setWidgetReady] = useState(false);
  const [checkoutAttempt, setCheckoutAttempt] = useState(0);
  const widgetRef = useRef<HyperWidget | null>(null);
  const mountId = "hyper-payment-element";

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await workspace();
        if (!active) return;
        const manageable = data.organizations.filter(
          (org) => org.role === "owner" || org.role === "administrator",
        );
        setOrgs(manageable.map((org) => ({ id: org.id, name: org.name })));
        if (manageable[0]) setOrgId(manageable[0].id);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load organizations.");
      } finally {
        if (active) setLoadingOrganizations(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    setSession(null);
    setError("");
    setDone(false);
    setPaymentPending(false);
    setWidgetReady(false);
    widgetRef.current = null;
    void (async () => {
      try {
        const result = await checkout({ data: { organizationId: orgId, plan: planId } });
        if (active) setSession(result);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not start checkout.");
      }
    })();
    return () => { active = false; };
  }, [orgId, planId, checkoutAttempt]);

  useEffect(() => {
    if (!session?.configured) return;
    let active = true;
    const script = document.createElement("script");
    script.src = `${session.baseUrl}/v1/HyperLoader.js`;
    script.onload = () => {
      if (!active) return;
      const Hyper = (window as unknown as { Hyper?: new (key: string) => {
        elements: (opts: { clientSecret: string }) => {
          create: (kind: string) => { mount: (selector: string) => void };
        };
        confirmPayment: HyperWidget["confirmPayment"];
      } }).Hyper;
      if (!Hyper) {
        setError("The payment widget could not be loaded from your Hyperswitch instance.");
        return;
      }
      const hyper = new Hyper(session.publishableKey);
      const elements = hyper.elements({ clientSecret: session.clientSecret });
      elements.create("payment").mount(`#${mountId}`);
      widgetRef.current = hyper;
      setWidgetReady(true);
    };
    script.onerror = () =>
      setError("The payment widget could not be loaded from your Hyperswitch instance.");
    document.body.appendChild(script);
    return () => {
      active = false;
      script.remove();
      widgetRef.current = null;
    };
  }, [session]);

  async function pay() {
    if (!widgetRef.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await widgetRef.current.confirmPayment({
        elements: undefined,
        confirmParams: { return_url: `${window.location.origin}/billing` },
        redirect: "if_required",
      });
      if (result.error) setError(result.error.message ?? "Payment failed.");
      else if (result.paymentIntent?.status === "succeeded") setDone(true);
      else setPaymentPending(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader />
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {planInfo.name} — ${(planInfo.amount / 100).toFixed(0)} {planInfo.cadence}. Powered by the
          open-source Hyperswitch payment orchestrator; KIDE never sees card numbers.
        </p>

        {orgs.length > 1 && (
          <label className="mt-5 block text-xs font-medium">
            Organization
            <select
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <section className="mt-6 rounded-md border border-border bg-card p-5">
          {done || paymentPending ? (
            <div className="py-6 text-center">
              <ShieldCheck className="mx-auto size-8 text-data" />
              <p className="mt-3 text-sm font-semibold">
                {done ? "Payment confirmed" : "Payment submitted"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {done
                  ? "Your plan will show as active on the billing page after the payment webhook is processed."
                  : "The payment provider has not yet confirmed success. Check billing for updates before attempting another payment."}
              </p>
              <Button asChild className="mt-4">
                <Link to="/billing">Back to billing</Link>
              </Button>
            </div>
          ) : session === null ? (
            error ? (
              <div role="alert" className="space-y-3 text-sm">
                <p className="text-destructive">{error}</p>
                <Button variant="outline" onClick={() => setCheckoutAttempt((value) => value + 1)}>
                  Retry checkout
                </Button>
              </div>
            ) : !loadingOrganizations && !orgId ? (
              <div className="space-y-3 text-sm">
                <p>You need an organization owner or administrator role to start checkout.</p>
                <Button asChild variant="outline">
                  <Link to="/projects">Choose or create an organization</Link>
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Preparing your checkout…
              </p>
            )
          ) : !session.configured ? (
            <div className="py-2 text-sm">
              <p className="font-medium">Payments are not connected yet.</p>
              <p className="mt-2 text-xs text-muted-foreground">
                This checkout runs against your own open-source Hyperswitch instance. To go live,
                add these workspace secrets and this page works immediately:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>HYPERSWITCH_BASE_URL — your instance URL</li>
                <li>HYPERSWITCH_API_KEY — an API key from the Hyperswitch dashboard</li>
                <li>HYPERSWITCH_PUBLISHABLE_KEY — the matching publishable key</li>
                <li>HYPERSWITCH_WEBHOOK_SECRET — for confirming payments</li>
              </ul>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/billing">Back to billing</Link>
              </Button>
            </div>
          ) : (
            <div>
              <div id={mountId} className="min-h-40" />
              {error && (
                <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </p>
              )}
              <Button className="mt-4 w-full" onClick={() => void pay()} disabled={busy || !widgetReady}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    <CreditCard className="size-4" /> Pay ${(session.amount / 100).toFixed(0)}
                  </>
                )}
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
