import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "owner" | "administrator" | "engineer" | "reviewer" | "viewer";
const ADMIN_ROLES: Role[] = ["owner", "administrator"];

/**
 * Paid plans purchasable through the open-source Hyperswitch checkout.
 * Amounts are minor units (cents) — keep in sync with src/routes/_authenticated/billing.tsx.
 */
export const PLAN_CATALOG = {
  professional: {
    id: "professional",
    name: "Professional",
    amount: 4900,
    currency: "usd",
    cadence: "per user / month",
  },
} as const;

export type PlanId = keyof typeof PLAN_CATALOG;

/** Subscription + payment history for every organization the user belongs to. */
export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: roles } = await supabase
      .from("organization_roles")
      .select("organization_id, role")
      .eq("user_id", userId);
    const orgIds = (roles ?? []).map((r) => r.organization_id);

    const { data: organizations } = orgIds.length
      ? await supabase.from("organizations").select("id, name, slug").in("id", orgIds)
      : { data: [] as Array<{ id: string; name: string; slug: string }> };

    const { data: subscriptions } = orgIds.length
      ? await supabase.from("subscriptions").select("*").in("organization_id", orgIds)
      : { data: [] as never[] };

    const { data: payments } = orgIds.length
      ? await supabase
          .from("payments")
          .select("*")
          .in("organization_id", orgIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: [] as never[] };

    return {
      organizations: (organizations ?? []).map((org) => ({
        ...org,
        role: (roles ?? []).find((r) => r.organization_id === org.id)?.role as Role,
        subscription: (subscriptions ?? []).find((s) => s.organization_id === org.id) ?? null,
        payments: (payments ?? []).filter((p) => p.organization_id === org.id),
      })),
    };
  });

export type CreateCheckoutResult =
  | { configured: false }
  | {
      configured: true;
      clientSecret: string;
      paymentId: string;
      publishableKey: string;
      baseUrl: string;
      amount: number;
      currency: string;
      planName: string;
    };

/**
 * Starts a Hyperswitch payment for a plan upgrade. Only organization
 * owners/administrators may check out. Returns configured:false when the
 * Hyperswitch instance is not wired up yet, so the UI can explain the setup.
 */
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId: string; plan: PlanId }) => {
    if (!input || typeof input.organizationId !== "string") {
      throw new Error("Missing organization.");
    }
    if (!(input.plan in PLAN_CATALOG)) throw new Error("Unknown plan.");
    return input;
  })
  .handler(async ({ data, context }): Promise<CreateCheckoutResult> => {
    const { supabase, userId, claims } = context;

    const { data: membership } = await supabase
      .from("organization_roles")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || !ADMIN_ROLES.includes(membership.role as Role)) {
      throw new Error("Only organization owners and administrators can change the plan.");
    }

    const baseUrl = process.env["HYPERSWITCH_BASE_URL"]?.replace(/\/+$/, "");
    const apiKey = process.env["HYPERSWITCH_API_KEY"];
    const publishableKey = process.env["HYPERSWITCH_PUBLISHABLE_KEY"];
    if (!baseUrl || !apiKey || !publishableKey) {
      return { configured: false };
    }

    const plan = PLAN_CATALOG[data.plan];

    const { data: row, error: insertError } = await supabase
      .from("payments")
      .insert({
        organization_id: data.organizationId,
        plan: plan.id,
        amount: plan.amount,
        currency: plan.currency,
        status: "pending",
        processor: "hyperswitch",
        created_by: userId,
      })
      .select("id")
      .single();
    if (insertError || !row) throw new Error(insertError?.message ?? "Could not start checkout.");

    const response = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        amount: plan.amount,
        currency: plan.currency.toUpperCase(),
        confirm: false,
        capture_method: "automatic",
        authentication_type: "no_three_ds",
        description: `KIDE ${plan.name} plan — monthly`,
        email: (claims as { email?: string } | null)?.email,
        metadata: {
          kide_payment_id: row.id,
          organization_id: data.organizationId,
          plan: plan.id,
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      payment_id?: string;
      client_secret?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.client_secret || !payload.payment_id) {
      await supabase.from("payments").update({ status: "failed" }).eq("id", row.id);
      throw new Error(
        payload.error?.message ?? "The payment service could not start the checkout.",
      );
    }

    await supabase
      .from("payments")
      .update({ processor_payment_id: payload.payment_id })
      .eq("id", row.id);

    return {
      configured: true,
      clientSecret: payload.client_secret,
      paymentId: payload.payment_id,
      publishableKey,
      baseUrl,
      amount: plan.amount,
      currency: plan.currency,
      planName: plan.name,
    };
  });
