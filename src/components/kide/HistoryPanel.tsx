import { History, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Checkpoint = {
  id: string;
  label: string;
  at: string;
  source: string;
  capabilities: number;
  activities: number;
  errors: number;
};

type Props = {
  checkpoints: Checkpoint[];
  activeSource: string;
  onSave: () => void;
  onRestore: (checkpoint: Checkpoint) => void;
};

export function HistoryPanel({ checkpoints, activeSource, onSave, onRestore }: Props) {
  return (
    <div className="mx-auto h-full max-w-3xl overflow-auto p-6">
      <div className="flex items-start gap-3">
        <div>
          <h2 className="text-lg font-semibold">Model history</h2>
          <p className="text-sm text-muted-foreground">
            Named checkpoints of this model. Restoring never discards work — the current draft is
            checkpointed first.
          </p>
        </div>
        <Button size="sm" className="ml-auto" onClick={onSave}>
          <Save />
          Save checkpoint
        </Button>
      </div>

      <ol className="mt-6 space-y-3">
        {checkpoints.length === 0 ? (
          <li className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No checkpoints yet. Save one before a risky change.
          </li>
        ) : (
          checkpoints.map((checkpoint) => {
            const current = checkpoint.source === activeSource;
            return (
              <li
                key={checkpoint.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary">
                  <History className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{checkpoint.label}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {checkpoint.at} · {checkpoint.capabilities} capabilities ·{" "}
                    {checkpoint.activities} activities ·{" "}
                    {checkpoint.errors === 0 ? "no errors" : `${checkpoint.errors} errors`}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {current && (
                    <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      CURRENT
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current}
                    onClick={() => onRestore(checkpoint)}
                  >
                    <RotateCcw />
                    Restore
                  </Button>
                </div>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
