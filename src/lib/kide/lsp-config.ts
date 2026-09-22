import type { DslKind } from "@/lib/dsl";

const LSP_PATH = "/lsp/kide";

const LSP_LANGUAGE_ID: Record<DslKind, string> = {
  dml: "dml",
  op: "operation",
  mncspec: "mcml",
  cap: "capability",
  activity: "activity",
};

export function lspLanguageId(kind: DslKind): string {
  return LSP_LANGUAGE_ID[kind];
}

export function resolveLspWebSocketUrl(): string | null {
  const configured = import.meta.env["VITE_KIDE_LSP_URL"]?.trim();
  if (configured) return configured;

  if (typeof window === "undefined") return null;
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") return null;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${LSP_PATH}`;
}
