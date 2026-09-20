import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CircleCheck, CircleDot, MessageSquare, RotateCcw } from "lucide-react";
import { WorkspaceHeader } from "@/components/kide/WorkspaceHeader";
import { useProjectSelection } from "@/components/kide/useProjectSelection";
import { Button } from "@/components/ui/button";
import { addReviewComment, decideReview, listReviews, requestReview } from "@/lib/projects.functions";
import { linkFrom, useWorkspaceSources } from "@/lib/kide/workspace-store";
import { synthesize } from "@/lib/kide/synthesis";
import { buildAssurance } from "@/lib/kide/assurance";
import { useApprovalState } from "@/lib/kide/approval-store";

const title = "Reviews — KIDE";
const description =
  "Request a review of the current design, discuss it in context, and record the reviewer's decision with the reason it was made.";

export const Route = createFileRoute("/_authenticated/reviews")({
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
  component: ReviewsPage,
});

type Review = Awaited<ReturnType<typeof listReviews>>[number];

function statusLabel(status: string) {
  if (status === "approved") return "Approved";
  if (status === "changes_requested") return "Changes requested";
  return "Open";
}

function ReviewsPage() {
  const sources = useWorkspaceSources();
  const selection = useProjectSelection();
  const { selectedId } = useApprovalState();
  const load = useServerFn(listReviews);
  const request = useServerFn(requestReview);
  const comment = useServerFn(addReviewComment);
  const decide = useServerFn(decideReview);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewTitle, setReviewTitle] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const design = useMemo(() => {
    const workspace = linkFrom(sources);
    const report = synthesize(workspace);
    const assurance = buildAssurance(workspace, report, selectedId);
    return {
      name: assurance.candidate?.name ?? null,
      fingerprint: assurance.candidate?.generatedMnc ?? "",
      blockers: assurance.blockers,
      releasable: assurance.releasable,
    };
  }, [sources, selectedId]);

  const refresh = useCallback(
    async (projectId: string) => setReviews(await load({ data: { projectId } })),
    [load],
  );

  useEffect(() => {
    if (selection.projectId) void refresh(selection.projectId);
    else setReviews([]);
  }, [selection.projectId, refresh]);

  const run = async (message: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      if (selection.projectId) await refresh(selection.projectId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const canDecide = ["owner", "administrator", "reviewer"].includes(selection.myRole);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WorkspaceHeader current="Reviews" />
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header>
          <h1 className="text-lg font-semibold">Reviews</h1>
          <p className="text-xs text-muted-foreground">
            {design.name
              ? `Current design: ${design.name} · ${design.blockers} blocking findings`
              : "No design has been produced from the current models yet."}
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
              value={selection.orgId ?? ""}
              onChange={(event) => selection.setOrgId(event.target.value)}
            >
              {selection.orgs.length === 0 ? <option value="">No organizations</option> : null}
              {selection.orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 min-w-48 rounded-md border border-border bg-background px-2 text-xs"
              value={selection.projectId ?? ""}
              onChange={(event) => selection.setProjectId(event.target.value)}
            >
              {selection.projects.length === 0 ? <option value="">No projects yet</option> : null}
              {selection.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <input
              className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              placeholder="What should be reviewed?"
              value={reviewTitle}
              onChange={(event) => setReviewTitle(event.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !selection.projectId || !reviewTitle.trim()}
              onClick={() =>
                void run("Review requested — reviewers have been notified.", async () => {
                  await request({
                    data: {
                      projectId: selection.projectId!,
                      title: reviewTitle,
                      summary: design.name
                        ? `Design ${design.name}. ${design.blockers} blocking findings. ${
                            design.releasable ? "All release gates pass." : "Release gates are not all green."
                          }`
                        : "No design produced yet.",
                      designFingerprint: design.fingerprint,
                    },
                  });
                  setReviewTitle("");
                })
              }
            >
              Request review
            </Button>
          </div>
        </section>

        {reviews.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            No reviews for this project yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {review.status === "approved" ? (
                    <CircleCheck className="size-4 text-emerald-400" />
                  ) : review.status === "changes_requested" ? (
                    <RotateCcw className="size-4 text-amber-400" />
                  ) : (
                    <CircleDot className="size-4 text-primary" />
                  )}
                  <h2 className="text-sm font-medium">{review.title}</h2>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {statusLabel(review.status)}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(review.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{review.summary}</p>
                {review.decision_note ? (
                  <p className="mt-2 rounded border border-border bg-background p-2 text-xs">
                    Decision note: {review.decision_note}
                  </p>
                ) : null}

                <ul className="mt-3 space-y-2">
                  {review.comments.map((entry: { id: string; body: string; created_at: string }) => (
                    <li key={entry.id} className="rounded border border-border bg-background p-2 text-xs">
                      <p>{entry.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                    placeholder="Add a comment"
                    value={drafts[review.id] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [review.id]: event.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !(drafts[review.id] ?? "").trim()}
                    onClick={() =>
                      void run("Comment added.", async () => {
                        await comment({
                          data: {
                            projectId: selection.projectId!,
                            reviewId: review.id,
                            body: drafts[review.id] ?? "",
                          },
                        });
                        setDrafts((current) => ({ ...current, [review.id]: "" }));
                      })
                    }
                  >
                    <MessageSquare className="size-4" /> Comment
                  </Button>
                </div>

                {canDecide && review.status === "open" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="h-9 min-w-64 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                      placeholder="Reason for the decision"
                      value={notes[review.id] ?? ""}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [review.id]: event.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run("Review approved.", () =>
                          decide({
                            data: {
                              projectId: selection.projectId!,
                              reviewId: review.id,
                              decision: "approved",
                              note: notes[review.id] ?? "",
                            },
                          }),
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run("Sent back with your reason.", () =>
                          decide({
                            data: {
                              projectId: selection.projectId!,
                              reviewId: review.id,
                              decision: "changes_requested",
                              note: notes[review.id] ?? "",
                            },
                          }),
                        )
                      }
                    >
                      Request changes
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
