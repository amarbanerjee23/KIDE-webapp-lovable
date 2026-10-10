import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";

const title = "Checkout unavailable — KIDE";
const description = "Paid checkout is not available during the KIDE v1.0.0 free evaluation.";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({
    meta: [{ title }, { name: "description", content: description }],
  }),
  component: CheckoutUnavailablePage,
});

function CheckoutUnavailablePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader />
      <section className="mx-auto max-w-xl p-6">
        <CreditCard aria-hidden="true" className="size-8 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Paid checkout is unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          KIDE v1.0.0 is a free evaluation. Paid subscriptions, card collection and automatic plan
          upgrades are not offered in this release.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          You can continue creating projects, editing models and generating qualified engineering
          evidence without starting a payment.
        </p>
        <Button asChild className="mt-5">
          <Link to="/billing">Back to plan &amp; billing</Link>
        </Button>
      </section>
    </main>
  );
}
