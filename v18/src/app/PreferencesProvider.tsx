import { createContext, type PropsWithChildren, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

const textSizeKey = "brinesearch.v18.textSize";
const motionKey = "brinesearch.v18.motion";
const contrastKey = "brinesearch.v18.contrast";

type PreferencesContextValue = {
  largeText: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  setLargeText: (value: boolean) => void;
  setReducedMotion: (value: boolean) => void;
  setHighContrast: (value: boolean) => void;
  resetPreferences: () => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function storedValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The active in-memory choice still applies in restricted browser contexts.
  }
}

function removeValue(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Restricted browser storage does not prevent the in-memory reset.
  }
}

function initialReducedMotion() {
  const stored = storedValue(motionKey);
  if (stored === "reduced") return true;
  if (stored === "full") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [largeText, setLargeTextState] = useState(() => storedValue(textSizeKey) === "large");
  const [reducedMotion, setReducedMotionState] = useState(initialReducedMotion);
  const [highContrast, setHighContrastState] = useState(() => storedValue(contrastKey) === "high");

  useLayoutEffect(() => {
    document.documentElement.dataset.textSize = largeText ? "large" : "standard";
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
    document.documentElement.dataset.contrast = highContrast ? "high" : "standard";
  }, [highContrast, largeText, reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const followDevice = () => {
      if (storedValue(motionKey) === null) setReducedMotionState(media.matches);
    };
    media.addEventListener?.("change", followDevice);
    return () => media.removeEventListener?.("change", followDevice);
  }, []);

  const value = useMemo<PreferencesContextValue>(() => ({
    largeText,
    reducedMotion,
    highContrast,
    setLargeText: (next) => {
      setLargeTextState(next);
      writeValue(textSizeKey, next ? "large" : "standard");
    },
    setReducedMotion: (next) => {
      setReducedMotionState(next);
      writeValue(motionKey, next ? "reduced" : "full");
    },
    setHighContrast: (next) => {
      setHighContrastState(next);
      writeValue(contrastKey, next ? "high" : "standard");
    },
    resetPreferences: () => {
      removeValue(textSizeKey);
      removeValue(motionKey);
      removeValue(contrastKey);
      setLargeTextState(false);
      setHighContrastState(false);
      setReducedMotionState(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false);
    },
  }), [highContrast, largeText, reducedMotion]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}
