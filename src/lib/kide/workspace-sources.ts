import {
  dslKindForPath,
  DEFAULT_EXAMPLE_WORKSPACE_ID,
  getExampleWorkspace,
  linkWorkspace,
  SAMPLE_WORKSPACE,
  type Workspace,
  type WorkspaceFile,
} from "@/lib/dsl";

export type WorkspaceSources = Record<string, string>;

export function emptyWorkspaceSources(): WorkspaceSources {
  return {};
}

export function exampleWorkspaceSources(
  exampleId: string = DEFAULT_EXAMPLE_WORKSPACE_ID,
): WorkspaceSources {
  const files =
    exampleId === DEFAULT_EXAMPLE_WORKSPACE_ID ? SAMPLE_WORKSPACE : getExampleWorkspace(exampleId).files;
  return Object.fromEntries(files.map((file) => [file.path, file.source]));
}

export function workspaceFilesFromSources(current: WorkspaceSources): WorkspaceFile[] {
  return Object.entries(current)
    .map(([path, source]) => {
      const kind = dslKindForPath(path);
      return kind ? { path, kind, source } : null;
    })
    .filter((file): file is WorkspaceFile => file !== null)
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function linkSources(current: WorkspaceSources): Workspace {
  return linkWorkspace(workspaceFilesFromSources(current));
}
