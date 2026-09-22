import { describe, expect, it } from "vitest";
import { lspLanguageId, resolveLspWebSocketUrl } from "./lsp-config";

describe("lsp configuration", () => {
  it("maps every currently supported KIDE DSL to a stable server language id", () => {
    expect(lspLanguageId("dml")).toBe("dml");
    expect(lspLanguageId("op")).toBe("operation");
    expect(lspLanguageId("mncspec")).toBe("mcml");
    expect(lspLanguageId("cap")).toBe("capability");
    expect(lspLanguageId("activity")).toBe("activity");
  });

  it("does not invent a browser websocket endpoint during SSR", () => {
    expect(resolveLspWebSocketUrl()).toBeNull();
  });
});
