import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Receives Hyperswitch payment events. Public route (external caller), so the
 * HMAC-SHA512 signature in x-webhook-signature-512 is verified against the
 * configured webhook secret before anything is read or written.
 */
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const paymentQuery = supabaseAdmin.from("payments").update({
          status,
          updated_at: new Date().toISOString(),
        });
        const { data: updated } = kidePaymentId
          ? await paymentQuery
              .eq("id", kidePaymentId)
              .select("id, organization_id, plan, created_by")
          : await paymentQuery
              .eq("processor_payment_id", processorPaymentId!)
              .select("id, organization_id, plan, created_by");

        const payment = updated?.[0];

        if (status === "succeeded" && (payment?.organization_id ?? organizationId)) {
          const orgId = payment?.organization_id ?? organizationId!;
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          await supabaseAdmin.from("subscriptions").upsert(
            {
              organization_id: orgId,
              plan: payment?.plan ?? plan ?? "professional",
              status: "active",
              current_period_end: periodEnd.toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "organization_id" },
          );

          const { data: admins } = await supabaseAdmin
            .from("organization_roles")
            .select("user_id")
            .eq("organization_id", orgId)
            .in("role", ["owner", "administrator"]);
          for (const admin of admins ?? []) {
            await supabaseAdmin.from("notifications").insert({
              user_id: admin.user_id,
              kind: "plan_upgraded",
              title: `Plan upgraded to ${payment?.plan ?? plan ?? "professional"}`,
              body: "The subscription is now active. Thank you for supporting KIDE.",
            });
          }

          if (payment?.created_by) {
            await supabaseAdmin.from("audit_events").insert({
              organization_id: orgId,
              actor_id: payment.created_by,
              action: "billing.plan_upgraded",
              target_type: "subscription",
              target_id: payment.id,
              change_summary: {
                plan: payment.plan ?? plan,
                processor: "hyperswitch",
                processor_payment_id: processorPaymentId,
              },
            });
          }
        }

        return new Response("ok");
      },
    },
  },
});
