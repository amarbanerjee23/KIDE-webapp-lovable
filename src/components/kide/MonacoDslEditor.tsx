import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { MonacoDslEditorProps } from "./MonacoDslEditorImpl";

const Impl = lazy(() => import("./MonacoDslEditorImpl"));

/**
 * Loads the code editor only in the browser — it is not server renderable.
 */
export function MonacoDslEditor(props: MonacoDslEditorProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready) return <EditorSkeleton />;
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Impl {...props} />
    </Suspense>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-[#0E1117] text-xs text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" />
      Preparing editor…
    </div>
  );
}
