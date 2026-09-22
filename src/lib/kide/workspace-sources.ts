import { linkWorkspace, SAMPLE_WORKSPACE, type Workspace, type WorkspaceFile } from "@/lib/dsl";

export type WorkspaceSources = Record<string, string>;

export function initialWorkspaceSources(): WorkspaceSources {
  return Object.fromEntries(SAMPLE_WORKSPACE.map((file) => [file.path, file.source]));
}

export function workspaceFilesFromSources(current: WorkspaceSources): WorkspaceFile[] {
  return SAMPLE_WORKSPACE.map((file) => ({
    path: file.path,
    kind: file.kind,
    source: current[file.path] ?? "",
  }));
}

export function linkSources(current: WorkspaceSources): Workspace {
  return linkWorkspace(workspaceFilesFromSources(current));
}
