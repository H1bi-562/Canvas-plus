// src/lib/themes.ts
// UC22 – the colour themes a student can pick in Customize. The colours live in
// src/styles/themes.css; ids must match THEMES in services/dashboardLayout.js.

export type ThemeId = "light-modern" | "dark-modern" | "monokai" | "solarized-light" | "dracula";

export interface Theme {
  id: ThemeId;
  label: string;
  /** Picks the light or dark branch of the components' classes. */
  mode: "light" | "dark";
}

export const THEMES: Theme[] = [
  {
    id: "light-modern",
    label: "Light Modern",
    mode: "light"
  },
  {
    id: "dark-modern",
    label: "Dark Modern",
    mode: "dark"
  },
  {
    id: "monokai",
    label: "Monokai",
    mode: "dark"
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    mode: "light"
  },
  {
    id: "dracula",
    label: "Dracula",
    mode: "dark"
  }
];

export const DEFAULT_THEME: ThemeId = "light-modern";

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}
