import { describe, expect, it } from "vitest";
import {
  applyUiPreferences,
  DEFAULT_UI_PREFERENCES,
  normalizeUiPreferences,
} from "@/lib/ui-preferences";

describe("UI preferences", () => {
  it("normalizes supported theme and density values", () => {
    expect(normalizeUiPreferences({ theme: "light", density: "comfortable" })).toEqual({
      theme: "light",
      density: "comfortable",
    });
  });

  it("falls back instead of applying arbitrary values", () => {
    expect(normalizeUiPreferences({ theme: "neon", density: "microscopic" })).toEqual(
      DEFAULT_UI_PREFERENCES,
    );
  });

  it("applies preferences to the document root contract", () => {
    const root = { dataset: {} as DOMStringMap };
    applyUiPreferences({ theme: "high-contrast", density: "compact" }, root as HTMLElement);
    expect(root.dataset["theme"]).toBe("high-contrast");
    expect(root.dataset["density"]).toBe("compact");
  });
});
