import { createFileRoute } from "@tanstack/react-router";

const title = "KIDE — Knowledge-integrated systems engineering";
const description =
  "Securely enter the KIDE engineering workspace using the active browser session.";

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
  component: SessionEntry,
});

function SessionEntry() {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="text-center">
        <img src="/favicon.png" alt="" className="mx-auto size-10" />
        <p className="mt-4 text-sm font-medium">Initializing K-IDE Workspace…</p>
        <p className="mt-1 text-xs text-muted-foreground">Restoring your secure browser session</p>
      </div>
    </main>
  );
}
