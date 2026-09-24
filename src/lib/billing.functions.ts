import { createServerFn } from "@tanstack/react-start";
import { requireKideAuth } from "@/lib/auth-middleware";
import { ADMIN_ROLES, requireOrganizationAccess, type Role } from "@/lib/data-access.server";

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

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan: string;
  status: string;
  current_period_end: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type PaymentRow = {
  id: string;
  organization_id: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  processor: string;
  processor_payment_id: string | null;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireKideAuth])
  .handler(async ({ context }) => {
    const organizations = await context.db<
      { id: string; name: string; slug: string; role: Role }[]
    >`
      SELECT o.id, o.name, o.slug, r.role
      FROM public.organizations o
      JOIN public.organization_roles r ON r.organization_id = o.id
      WHERE r.user_id = ${context.userId}::uuid
      ORDER BY o.name
    `;

    const subscriptions = await context.db<SubscriptionRow[]>`
      SELECT s.*
      FROM public.subscriptions s
      JOIN public.organization_roles r ON r.organization_id = s.organization_id
      WHERE r.user_id = ${context.userId}::uuid
    `;

    const payments = await context.db<PaymentRow[]>`
      SELECT p.*
      FROM public.payments p
      JOIN public.organization_roles r ON r.organization_id = p.organization_id
      WHERE r.user_id = ${context.userId}::uuid
      ORDER BY p.created_at DESC
      LIMIT 50
    `;

    return {
      organizations: organizations.map((organization) => ({
        ...organization,
        subscription:
          subscriptions.find((subscription) => subscription.organization_id === organization.id) ??
          null,
        payments: payments
          .filter((payment) => payment.organization_id === organization.id)
          .map((payment) => ({
            ...payment,
            created_at:
              payment.created_at instanceof Date
                ? payment.created_at.toISOString()
                : String(payment.created_at),
            updated_at:
              payment.updated_at instanceof Date
                ? payment.updated_at.toISOString()
                : String(payment.updated_at),
          })),
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

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireKideAuth])
  .inputValidator((input: { organizationId: string; plan: PlanId }) => {
    if (!input || typeof input.organizationId !== "string") {
      throw new Error("Missing organization.");
    }
    if (!(input.plan in PLAN_CATALOG)) throw new Error("Unknown plan.");
    return input;
  })
  .handler(async ({ data, context }): Promise<CreateCheckoutResult> => {
    await requireOrganizationAccess(context.db, context.userId, data.organizationId, ADMIN_ROLES);

    const baseUrl = process.env["HYPERSWITCH_BASE_URL"]?.replace(/\/+$/, "");
    const apiKey = process.env["HYPERSWITCH_API_KEY"];
    const publishableKey = process.env["HYPERSWITCH_PUBLISHABLE_KEY"];
    if (!baseUrl || !apiKey || !publishableKey) {
      return { configured: false };
    }

    const plan = PLAN_CATALOG[data.plan];
    const rows = await context.db<{ id: string }[]>`
      INSERT INTO public.payments (
        organization_id, plan, amount, currency, status, processor, created_by
      )
      VALUES (
        ${data.organizationId}::uuid,
        ${plan.id},
        ${plan.amount},
        ${plan.currency},
        'pending',
        'hyperswitch',
        ${context.userId}::uuid
      )
      RETURNING id
    `;
    const row = rows[0];
    if (!row) throw new Error("Could not start checkout.");

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
        email: context.user.email,
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
      await context.db`
        UPDATE public.payments
        SET status = 'failed', updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      throw new Error(
        payload.error?.message ?? "The payment service could not start the checkout.",
      );
    }

    await context.db`
      UPDATE public.payments
      SET processor_payment_id = ${payload.payment_id}, updated_at = now()
      WHERE id = ${row.id}::uuid
    `;

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
