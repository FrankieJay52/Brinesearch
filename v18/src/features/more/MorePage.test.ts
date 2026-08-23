import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("V18-only More and owner routing", () => {
  const morePage = source("./MorePage.tsx");
  const fieldUpdatesPage = source("./FieldUpdatesPage.tsx");
  const controlCenterPage = source("../control-center/ControlCenterPage.tsx");
  const ownerRoadMapPage = source("../owner-roads/OwnerApprovedRoutesPage.tsx");
  const ownerSignInPage = source("../auth/OwnerSignInPage.tsx");
  const app = source("../../app/App.tsx");

  it("keeps every user-facing destination inside V18", () => {
    expect(morePage).toContain('to="/field-updates" icon="feed" title="Field Updates"');
    expect(morePage).toContain('to="/control-center" icon="control" title="Control Center"');
    expect(morePage).toContain('to="/" icon="map" title="Driver map"');
    for (const page of [morePage, fieldUpdatesPage, controlCenterPage, ownerRoadMapPage, ownerSignInPage]) {
      expect(page).not.toMatch(/legacyBrineSearchPaths|index\.html#|href=["']https?:/);
    }
  });

  it("loads Field Updates natively without an old-app launch", () => {
    expect(fieldUpdatesPage).toContain("loadFieldUpdates");
    expect(fieldUpdatesPage).toContain("Moderated public road and pad updates now load directly inside V18");
    expect(fieldUpdatesPage).not.toContain("<a ");
  });

  it("connects Control Center, sign-in, and road map through internal routes", () => {
    expect(controlCenterPage).toContain('<Link to="/settings/approved-routes" className="button-primary">');
    expect(controlCenterPage).toContain('to="/sign-in?next=/settings/approved-routes"');
    expect(ownerRoadMapPage).toContain('to="/sign-in?next=/settings/approved-routes"');
    expect(ownerSignInPage).toContain("signIn(email, password)");
  });

  it("registers all replacement routes in the V18 app", () => {
    expect(app).toContain('path="/field-updates" element={<FieldUpdatesPage/>}');
    expect(app).toContain('path="/control-center" element={<ControlCenterPage/>}');
    expect(app).toContain('path="/sign-in" element={<OwnerSignInPage/>}');
  });
});
