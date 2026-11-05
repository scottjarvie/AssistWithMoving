export const DISPLAY_PREFERENCES_KEY = "assistwithmoving.display.v1";
export type Appearance = "system" | "light" | "dark";
export type NavigationPlacement = "side" | "top";
export type DisplayPreferences = { appearance: Appearance; navigation: NavigationPlacement };
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = { appearance: "system", navigation: "side" };

export function parseDisplayPreferences(value: string | null): DisplayPreferences {
  try {
    const candidate: unknown = JSON.parse(value ?? "null");
    if (!candidate || typeof candidate !== "object") return DEFAULT_DISPLAY_PREFERENCES;
    const prefs = candidate as Record<string, unknown>;
    return {
      appearance: prefs.appearance === "light" || prefs.appearance === "dark" ? prefs.appearance : "system",
      navigation: prefs.navigation === "top" ? "top" : "side",
    };
  } catch { return DEFAULT_DISPLAY_PREFERENCES; }
}

// Runs before content paints; React owns the controls, not these root attributes.
// It contains only fixed project-local UI preferences, never account data.
export const displayPreferencesBootstrap = `(function(){try{var p=JSON.parse(localStorage.getItem('${DISPLAY_PREFERENCES_KEY}')||'null')||{};var a=p.appearance;var dark=a==='dark'||(a!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.navigation=p.navigation==='top'?'top':'side';}catch(e){document.documentElement.classList.toggle('dark',window.matchMedia('(prefers-color-scheme: dark)').matches);}})();`;
