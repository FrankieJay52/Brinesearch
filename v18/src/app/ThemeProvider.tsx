import { createContext, type PropsWithChildren, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

export type ThemePreference = "system" | "night" | "day";
type ResolvedTheme = Exclude<ThemePreference, "system">;
type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = "brinesearch.v18.theme";

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemePreference>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === "day" || stored === "night" || stored === "system" ? stored : "system";
    } catch {
      return "system";
    }
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia?.("(prefers-color-scheme: light)").matches ? "day" : "night",
  );

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;
    const updateSystemTheme = () => setSystemTheme(media.matches ? "day" : "night");
    updateSystemTheme();
    media.addEventListener?.("change", updateSystemTheme);
    return () => media.removeEventListener?.("change", updateSystemTheme);
  }, []);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
  }, [resolvedTheme, theme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme: setThemeState }), [resolvedTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
