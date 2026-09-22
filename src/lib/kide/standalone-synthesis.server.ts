import { linkWorkspace, type WorkspaceFile } from "@/lib/dsl";
import { synthesize, type SynthesisReport } from "@/lib/kide/synthesis";

export function verifyStandaloneSynthesis(files: WorkspaceFile[]): SynthesisReport {
  return synthesize(linkWorkspace(files));
}
