import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { ensureApplicationSchema } from "@/lib/application-schema.server";
import { getDatabase } from "@/lib/database.server";

export const Route = createFileRoute("/api/public/hyperswitch-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["HYPERSWITCH_WEBHOOK_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });

        const body = await request.text();
        const signature = request.headers.get("x-webhook-signature-512") ?? "";

        const expected = createHmac("sha512", secret).update(body).digest("hex");
        const provided = signature.startsWith("v1,") ? signature.slice(3) : signature;
        const a = Buffer.from(provided, "utf8");
        const b = Buffer.from(expected, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: {
          event_type?: string;
          content?: { object?: Record<string, unknown> };
        };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const object = event.content?.object ?? {};
        const metadata = (object["metadata"] ?? {}) as Record<string, unknown>;
        const processorPaymentId = (object["payment_id"] as string | undefined) ?? null;
        const kidePaymentId = (metadata["kide_payment_id"] as string | undefined) ?? null;
        const organizationId = (metadata["organization_id"] as string | undefined) ?? null;
        const plan = (metadata["plan"] as string | undefined) ?? null;
        const rawStatus = (object["status"] as string | undefined) ?? "";

        if (!processorPaymentId && !kidePaymentId) return new Response("ignored");

        const status =
          rawStatus === "succeeded"
            ? "succeeded"
            : rawStatus === "failed" || rawStatus === "cancelled"
              ? "failed"
              : "processing";

        await ensureApplicationSchema();
        const db = getDatabase();

        const payments = kidePaymentId
          ? await db<
              {
                id: string;
                organization_id: string;
                plan: string;
                created_by: string | null;
              }[]
            >`
              UPDATE public.payments
              SET status = ${status}, updated_at = now()
              WHERE id = ${kidePaymentId}::uuid
              RETURNING id, organization_id, plan, created_by
            `
          : await db<
              {
                id: string;
                organization_id: string;
                plan: string;
                created_by: string | null;
              }[]
            >`
              UPDATE public.payments
              SET status = ${status}, updated_at = now()
              WHERE processor_payment_id = ${processorPaymentId}
              RETURNING id, organization_id, plan, created_by
            `;

        const payment = payments[0];

        if (status === "succeeded" && (payment?.organization_id ?? organizationId)) {
          const orgId = payment?.organization_id ?? organizationId!;
          const selectedPlan = payment?.plan ?? plan ?? "professional";
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          await db`
            INSERT INTO public.subscriptions (
              organization_id, plan, status, current_period_end, updated_at
            )
            VALUES (
              ${orgId}::uuid,
              ${selectedPlan},
              'active',
              ${periodEnd.toISOString()}::timestamptz,
              now()
            )
            ON CONFLICT (organization_id) DO UPDATE SET
              plan = EXCLUDED.plan,
              status = 'active',
              current_period_end = EXCLUDED.current_period_end,
              updated_at = now()
          `;

          const admins = await db<{ user_id: string }[]>`
            SELECT user_id
            FROM public.organization_roles
            WHERE organization_id = ${orgId}::uuid
              AND role IN ('owner', 'administrator')
          `;

          for (const admin of admins) {
            await db`
              INSERT INTO public.notifications (
                user_id, organization_id, kind, title, body
              )
              VALUES (
                ${admin.user_id}::uuid,
                ${orgId}::uuid,
                'plan_upgraded',
                ${`Plan upgraded to ${selectedPlan}`},
                'The subscription is now active. Thank you for supporting KIDE.'
              )
            `;
          }

          if (payment?.created_by) {
            await db`
              INSERT INTO public.audit_events (
                organization_id, actor_id, action, target_type, target_id, change_summary
              )
              VALUES (
                ${orgId}::uuid,
                ${payment.created_by}::uuid,
                'billing.plan_upgraded',
                'subscription',
                ${payment.id},
                ${db.json({
                  plan: selectedPlan,
                  processor: "hyperswitch",
                  processor_payment_id: processorPaymentId,
                })}
              )
            `;
          }
        }

        return new Response("ok");
      },
    },
  },
});
