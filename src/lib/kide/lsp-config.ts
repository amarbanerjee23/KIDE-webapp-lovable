import type { DslKind } from "@/lib/dsl";

const LSP_PATH = "/lsp/kide";

export function lspLanguageId(kind: DslKind): string {
  switch (kind) {
    case "mnc":
      return "mcml";
    case "capability":
      return "capability";
    case "activity":
      return "activity";
    case "krl":
      return "krl";
    default:
      return kind;
  }
}

export function resolveLspWebSocketUrl(): string | null {
  const configured = import.meta.env.VITE_KIDE_LSP_URL?.trim();
  if (configured) return configured;

  if (typeof window === "undefined") return null;
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") return null;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${LSP_PATH}`;
}
