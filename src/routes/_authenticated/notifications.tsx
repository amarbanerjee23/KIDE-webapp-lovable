import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, CheckCheck } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { Button } from "@/components/ui/button";
import { listNotifications, markNotificationsRead } from "@/lib/teams.functions";

const title = "Notifications — KIDE";
const description =
  "Every review request, decision, comment and membership change that needs your attention, in one place.";

export const Route = createFileRoute("/_authenticated/notifications")({
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
  component: NotificationsPage,
});

type Notification = Awaited<ReturnType<typeof listNotifications>>[number];

function NotificationsPage() {
  const load = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const [items, setItems] = useState<Notification[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await load());
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load notifications.";
      setLoadError(message);
      throw error;
    }
  }, [load]);

  useEffect(() => {
    void refresh().catch((error) =>
      toast.error(error instanceof Error ? error.message : "Could not load notifications."),
    );
  }, [refresh]);

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Notifications" />
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <header className="flex items-center gap-3">
          <Bell className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Notifications</h1>
            <p className="text-xs text-muted-foreground">
              {unread === 0 ? "You are up to date." : `${unread} unread.`}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            disabled={busy || unread === 0}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  await markRead();
                  await refresh();
                  toast.success("All marked as read.");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not update notifications.");
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            <CheckCheck className="size-4" /> Mark all read
          </Button>
        </header>

        {loadError ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm font-medium">Could not load notifications</p>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() =>
                void refresh().catch((error) =>
                  toast.error(error instanceof Error ? error.message : "Could not load notifications."),
                )
              }
            >
              Retry
            </Button>
          </div>
        ) : null}

        {!loadError && items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            Nothing yet. Review requests, decisions and comments appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={`rounded-lg border p-3 ${
                  item.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>
                {item.body ? <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p> : null}
                {item.link === "/reviews" ? (
                  <Link to="/reviews" className="mt-1 inline-block text-xs text-primary underline">
                    Open reviews
                  </Link>
                ) : item.link === "/team" ? (
                  <Link to="/team" className="mt-1 inline-block text-xs text-primary underline">
                    Open team
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
