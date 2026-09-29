export const UI_THEMES = ["dark", "light", "high-contrast"] as const;
export const UI_DENSITIES = ["compact", "comfortable"] as const;

export type UiTheme = (typeof UI_THEMES)[number];
export type UiDensity = (typeof UI_DENSITIES)[number];

export interface UiPreferences {
  theme: UiTheme;
  density: UiDensity;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "dark",
  density: "compact",
};

function includes<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function normalizeUiPreferences(value: {
  theme?: unknown;
  density?: unknown;
} | null | undefined): UiPreferences {
  return {
    theme: includes(UI_THEMES, value?.theme) ? value.theme : DEFAULT_UI_PREFERENCES.theme,
    density: includes(UI_DENSITIES, value?.density)
      ? value.density
      : DEFAULT_UI_PREFERENCES.density,
  };
}

export function applyUiPreferences(
  preferences: UiPreferences,
  root: Pick<HTMLElement, "dataset"> | null | undefined = typeof document !== "undefined"
    ? document.documentElement
    : null,
): void {
  if (!root) return;
  root.dataset.theme = preferences.theme;
  root.dataset.density = preferences.density;
}
