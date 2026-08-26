import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clearCompletedRouteSessionChecks, v18ServiceWorkerScope } from "./SettingsPage";

const settingsPage = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

describe("v18ServiceWorkerScope", () => {
  it("requires the exact V18 scope instead of accepting the V17 root worker", () => {
    expect(v18ServiceWorkerScope("https://preview.example", "/v18/")).toBe("https://preview.example/v18/");
    expect(v18ServiceWorkerScope("https://preview.example", "/v18/")).not.toBe("https://preview.example/");
  });
});

describe("route session checks", () => {
  it("provides one explicit Settings reset without changing saved directions or approval", () => {
    expect(() => clearCompletedRouteSessionChecks()).not.toThrow();
    expect(settingsPage).toContain("clearCompletedPadStatusCache();");
    expect(settingsPage).toContain("clearReleasedGoogleHandoffCache();");
    expect(settingsPage).toContain("clearDriverRouteChoiceCache();");
    expect(settingsPage).toContain("Ready exact routes are checked once per app session and reused only for the same pad revision. Held or incomplete routes are checked again.");
    expect(settingsPage).toContain("Rechecking clears only this session’s completed route checks. It does not delete saved directions, change approval, or alter the currently open pad.");
    expect(settingsPage).toContain("Route checks cleared. The next pad you open online will check again.");
    expect(settingsPage).toContain('type="button" className="settings-row-action settings-row-button" aria-describedby="route-check-description route-check-safety"');
    expect(settingsPage).toContain('role="status" aria-live="polite" aria-atomic="true"');
  });
});
