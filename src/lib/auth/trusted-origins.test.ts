import { describe, expect, it } from "vitest";
import { resolveTrustedAuthOrigins } from "@/lib/auth/trusted-origins";

describe("resolveTrustedAuthOrigins", () => {
  it("always trusts the configured Better Auth base origin", () => {
    expect(resolveTrustedAuthOrigins("https://kide.example.com/path", undefined, true)).toEqual([
      "https://kide.example.com",
    ]);
  });

  it("adds explicit Cloud Run aliases without duplicates", () => {
    expect(
      resolveTrustedAuthOrigins(
        "https://kide-webapp-hash-uc.a.run.app",
        "https://kide-webapp-636904772039.us-central1.run.app; https://kide-webapp-hash-uc.a.run.app",
        true,
      ),
    ).toEqual([
      "https://kide-webapp-hash-uc.a.run.app",
      "https://kide-webapp-636904772039.us-central1.run.app",
    ]);
  });

  it("supports comma, semicolon and newline separated operator origins", () => {
    expect(
      resolveTrustedAuthOrigins(
        "https://kide.example.com",
        "https://one.example.com,https://two.example.com;\nhttps://three.example.com",
        true,
      ),
    ).toEqual([
      "https://kide.example.com",
      "https://one.example.com",
      "https://two.example.com",
      "https://three.example.com",
    ]);
  });

  it("adds localhost only outside production", () => {
    expect(resolveTrustedAuthOrigins("http://127.0.0.1:3000", undefined, false)).toEqual([
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]);
  });

  it("rejects non-http trusted origins", () => {
    expect(() =>
      resolveTrustedAuthOrigins(
        "https://kide.example.com",
        "javascript:alert(1)",
        true,
      ),
    ).toThrow("Unsupported authentication origin protocol");
  });
});
