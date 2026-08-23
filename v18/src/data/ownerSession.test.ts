import { describe, expect, it } from "vitest";
import { parseOwnerProfile, profileHasOwnerAccess } from "./ownerSession";
import { v18AuthStorageKey } from "./supabaseClient";

describe("V18 owner session", () => {
  it("uses a V18-only browser session namespace", () => {
    expect(v18AuthStorageKey).toBe("brinesearch.v18AuthSession.v1");
    expect(v18AuthStorageKey).not.toContain("editorSession");
  });

  it("returns only the server role and permission contract", () => {
    expect(parseOwnerProfile({
      role: "owner",
      permissions: ["editor", "OWNER"],
      user_id: "not-returned",
      private_notes: "not-returned",
    })).toEqual({ role: "owner", permissions: ["editor", "owner"] });
  });

  it("shows owner navigation only from the authenticated server profile", () => {
    const owner = parseOwnerProfile([{ role: "member", permissions: ["editor", "OWNER"] }]);
    const editor = parseOwnerProfile({ role: "editor", permissions: ["editor"] });
    expect(profileHasOwnerAccess(owner)).toBe(true);
    expect(profileHasOwnerAccess(editor)).toBe(false);
    expect(profileHasOwnerAccess(null)).toBe(false);
  });
});
