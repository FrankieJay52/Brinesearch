import assert from "node:assert/strict";
import test from "node:test";
import { findPrivateCredentialMarker } from "./private-publish-audit.mjs";

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signaturevalue`;
}

test("allows the Supabase browser SDK key-prefix checks and an anonymous JWT", () => {
  const sdkFragment = 'key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")';
  assert.equal(findPrivateCredentialMarker(sdkFragment, {}), null);
  assert.equal(findPrivateCredentialMarker(jwt({ role: "anon", ref: "public-project" }), {}), null);
});

test("rejects browser output that names or embeds private Supabase credentials", () => {
  assert.equal(
    findPrivateCredentialMarker("const key = process.env.SUPABASE_SERVICE_ROLE_KEY", {}),
    "SUPABASE_SERVICE_ROLE_KEY environment variable name",
  );
  assert.equal(
    findPrivateCredentialMarker("sb_secret_abcdefghijklmnopqrstuvwxyz012345", {}),
    "Supabase secret key",
  );
  assert.equal(findPrivateCredentialMarker(jwt({ role: "service_role" }), {}), "legacy service-role JWT");
  assert.equal(
    findPrivateCredentialMarker("postgresql://private:password@db.example.test/postgres", {}),
    "Postgres connection URL",
  );
});

test("rejects exact configured server credentials without exposing their values", () => {
  const environment = {
    SUPABASE_JWT_SECRET: "server-only-jwt-secret",
  };
  assert.equal(
    findPrivateCredentialMarker("prefix server-only-jwt-secret suffix", environment),
    "SUPABASE_JWT_SECRET value",
  );
});
