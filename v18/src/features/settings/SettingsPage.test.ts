import { describe, expect, it } from "vitest";
import { v18ServiceWorkerScope } from "./SettingsPage";

describe("v18ServiceWorkerScope", () => {
  it("requires the exact V18 scope instead of accepting the V17 root worker", () => {
    expect(v18ServiceWorkerScope("https://preview.example", "/v18/")).toBe("https://preview.example/v18/");
    expect(v18ServiceWorkerScope("https://preview.example", "/v18/")).not.toBe("https://preview.example/");
  });
});
