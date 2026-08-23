import { describe, expect, it } from "vitest";
import { parseOwnerProfile, parseStoredEditorSession, profileHasOwnerAccess } from "./ownerSession";

describe("V18 owner session bridge", () => {
  it("accepts the existing Road Manager session shape without exposing unrelated fields", () => {
    expect(parseStoredEditorSession({
      access_token: "header.payload.signature",
      refresh_token: "refresh-token",
      expires_at: 2_000_000_000,
      user: { id: "not-returned" },
    })).toEqual({ accessToken: "header.payload.signature", refreshToken: "refresh-token", expiresAt: 2_000_000_000 });
  });

  it("fails closed for malformed or missing access tokens", () => {
    expect(parseStoredEditorSession(null)).toBeNull();
    expect(parseStoredEditorSession({ refresh_token: "refresh-token" })).toBeNull();
    expect(parseStoredEditorSession({ access_token: "bad\ntoken" })).toBeNull();
  });

  it("shows owner navigation only from the authenticated server profile", () => {
    const owner = parseOwnerProfile([{ role: "member", permissions: ["editor", "OWNER"] }]);
    const editor = parseOwnerProfile({ role: "editor", permissions: ["editor"] });
    expect(profileHasOwnerAccess(owner)).toBe(true);
    expect(profileHasOwnerAccess(editor)).toBe(false);
    expect(profileHasOwnerAccess(null)).toBe(false);
  });
});
