import { DSL_LANGUAGES, type DslKind } from "@/lib/dsl";
import type { WorkspaceSources } from "@/lib/kide/workspace-sources";

const MAX_PATH_LENGTH = 512;

const EXTENSION_BY_KIND = Object.fromEntries(
  DSL_LANGUAGES.map((language) => [language.kind, language.extension]),
) as Record<DslKind, string>;

function titleFromPath(path: string): string {
  const filename = path.split("/").pop() ?? "Model";
  const stem = filename.replace(/\.[^.]+$/, "");
  const parts = stem.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const combined = parts.map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
  return combined || "Model";
}

export function normalizeWorkspaceFilePath(input: string, kind: DslKind): string {
  let path = input.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");

  if (!path) throw new Error("Enter a model file name.");
  if (path.length > MAX_PATH_LENGTH) throw new Error("Model path is too long.");

  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Model path contains an invalid segment.");
  }

  if (segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new Error("Use letters, numbers, '.', '_', '-' and '/' in model paths.");
  }

  const expectedExtension = EXTENSION_BY_KIND[kind];
  const knownExtension = DSL_LANGUAGES.find((language) =>
    path.toLowerCase().endsWith(language.extension),
  );

  if (knownExtension && knownExtension.kind !== kind) {
    throw new Error(
      `File extension ${knownExtension.extension} does not match the selected ${kind} language.`,
    );
  }

  if (!path.toLowerCase().endsWith(expectedExtension)) {
    path += expectedExtension;
  }

  return path;
}

export function assertWorkspacePathAvailable(
  sources: WorkspaceSources,
  path: string,
  ignorePath?: string,
): void {
  const normalized = path.toLowerCase();
  const conflict = Object.keys(sources).find(
    (candidate) =>
      candidate !== ignorePath && candidate.toLowerCase() === normalized,
  );

  if (conflict) {
    throw new Error(`A model file named '${conflict}' already exists.`);
  }
}

export function starterSourceForKind(kind: DslKind, path: string): string {
  const name = titleFromPath(path);

  switch (kind) {
    case "dml":
      return `DataModel ${name} {\n}\n`;
    case "op":
      return `Operation ${name}() {\n}\n`;
    case "mncspec":
      return `Model ${name}\n\nInterfaceDescription Device {\n}\n`;
    case "cap":
      return `Capability ${name} compatible component interface Device {\n}\n`;
    case "activity":
      return `ActivityDiagram ${name}\nhas activities {\n}\n`;
  }
}
