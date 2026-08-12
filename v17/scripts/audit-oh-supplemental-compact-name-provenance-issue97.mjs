import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sql = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812033100_issue97_oh_supplemental_compact_name_provenance.sql"), "utf8");

for (const token of [
  "compact Ohio supplemental alias provenance",
  "null::jsonb as overlap_geojson",
  "'target_overlap_geometry_stored',false",
  "'target_overlap_fraction'",
  "exact source digest, ODOT segment key, CTL interval, and overlap fractions",
  "Name/nearest-road matching remains prohibited"
]) assert.ok(sql.includes(token), `Issue #97 compact Ohio alias provenance missing: ${token}`);

const newOverlapAt = sql.indexOf("v_new_overlap text:=");
const newProvAt = sql.indexOf("v_new_provenance text:=", newOverlapAt);
const countsAt = sql.indexOf("v_overlap_count integer;", newProvAt);
assert.ok(newOverlapAt >= 0 && newProvAt > newOverlapAt && countsAt > newProvAt,
  "Issue #97 compact name replacement blocks are missing");
const effective = sql.slice(newOverlapAt, countsAt);
assert.ok(!effective.includes("st_asgeojson"),
  "Effective Ohio alias name stage must not serialize duplicate overlap GeoJSON");
assert.ok(!effective.includes("'target_overlap',o.overlap_geojson"),
  "Effective Ohio alias provenance must not duplicate target overlap geometry");
assert.match(sql,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Compact alias-provenance helper must remain non-callable outside the trusted dispatcher");

console.log("Issue #97 compact Ohio OGRIP alias provenance regression passed.");
