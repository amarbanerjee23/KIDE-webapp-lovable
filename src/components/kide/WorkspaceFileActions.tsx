import { useEffect, useState } from "react";
import { FilePlus2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DSL_LANGUAGES, type DslKind } from "@/lib/dsl";
import {
  createWorkspaceFile,
  deleteWorkspaceFile,
  renameWorkspaceFile,
} from "@/lib/kide/workspace-store";

interface ActiveModelFile {
  path: string;
  kind: DslKind;
}

export function WorkspaceFileActions({
  enabled,
  activeFile,
  onActivePath,
}: {
  enabled: boolean;
  activeFile: ActiveModelFile | null;
  onActivePath: (path: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newKind, setNewKind] = useState<DslKind>("dml");
  const [newPath, setNewPath] = useState("");
  const [renamePath, setRenamePath] = useState("");

  useEffect(() => {
    setRenamePath(activeFile?.path ?? "");
  }, [activeFile?.path]);

  const createModel = () => {
    try {
      const path = createWorkspaceFile(newPath, newKind);
      setCreateOpen(false);
      setNewPath("");
      onActivePath(path);
      toast.success(`Created ${path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create model file.");
    }
  };

  const renameModel = () => {
    if (!activeFile) return;

    try {
      const path = renameWorkspaceFile(activeFile.path, renamePath, activeFile.kind);
      setRenameOpen(false);
      onActivePath(path);
      toast.success(`Renamed to ${path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename model file.");
    }
  };

  const deleteModel = () => {
    if (!activeFile) return;

    const path = activeFile.path;
    deleteWorkspaceFile(path);
    setDeleteOpen(false);
    onActivePath("");
    toast.success(`Deleted ${path}`);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={!enabled} onClick={() => setCreateOpen(true)}>
          <FilePlus2 />
          New model
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!enabled || !activeFile}
          onClick={() => setRenameOpen(true)}
          aria-label="Rename active model"
          title="Rename active model"
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!enabled || !activeFile}
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete active model"
          title="Delete active model"
        >
          <Trash2 />
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create model file</DialogTitle>
            <DialogDescription>
              Create a project-local KIDE model. The correct file extension is added automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Language</Label>
              <Select value={newKind} onValueChange={(value) => setNewKind(value as DslKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DSL_LANGUAGES.map((language) => (
                    <SelectItem key={language.kind} value={language.kind}>
                      {language.label} ({language.extension})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-model-path">File path</Label>
              <Input
                id="new-model-path"
                autoFocus
                value={newPath}
                onChange={(event) => setNewPath(event.target.value)}
                placeholder="models/plant"
                onKeyDown={(event) => {
                  if (event.key === "Enter") createModel();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createModel}>Create model</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename model file</DialogTitle>
            <DialogDescription>
              Rename the active file. Its DSL extension must continue to match the model language.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rename-model-path">File path</Label>
            <Input
              id="rename-model-path"
              autoFocus
              value={renamePath}
              onChange={(event) => setRenamePath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") renameModel();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={renameModel}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete model file?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeFile
                ? `Delete '${activeFile.path}' from this project's working copy? This change will autosave.`
                : "Delete the active model file?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteModel}
            >
              Delete model
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
