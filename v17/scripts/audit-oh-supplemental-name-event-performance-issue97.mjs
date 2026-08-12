import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811248000_issue97_oh_supplemental_name_event_performance.sql"), "utf8");

for (const token of [
  "drop table if exists pg_temp.tmp_issue97_oh_supp_overlap",
  "create temporary table tmp_issue97_oh_supp_overlap on commit drop as",
  "create index tmp_issue97_oh_supp_overlap_identity_idx",
  "extensions.st_intersection(",
  "extensions.st_linelocatepoint(",
  "cross join lateral pg_catalog.jsonb_array_elements(o.name_events) event",
  "o.ctl_begin+(o.ctl_end-o.ctl_begin)*least(o.start_fraction,o.end_fraction)",
  "o.ctl_begin+(o.ctl_end-o.ctl_begin)*greatest(o.start_fraction,o.end_fraction)",
  "'overlap_precomputed_once_per_segment',true",
  "'name_overlap_materializer','precomputed_once_per_verified_segment'",
  "'name_matching_used',false",
  "'nearest_road_matching_used',false"
]) assert.ok(migration.includes(token), `Issue #97 Ohio supplemental name-event hardening missing: ${token}`);

const tempBuildAt = migration.indexOf("create temporary table tmp_issue97_oh_supp_overlap on commit drop as");
const nameExpandAt = migration.indexOf("cross join lateral pg_catalog.jsonb_array_elements(o.name_events) event", tempBuildAt);
assert.ok(tempBuildAt >= 0 && nameExpandAt > tempBuildAt,
  "Verified segment overlap receipts must be built before source-backed name events are expanded");

const precomputeBlock = migration.slice(tempBuildAt, nameExpandAt);
assert.equal((precomputeBlock.match(/extensions\.st_intersection\(/g) || []).length, 1,
  "Ohio name-event materialization should compute each verified segment overlap once in the precompute stage");
assert.ok(!/jsonb_array_elements\([^)]*name_events/.test(precomputeBlock),
  "Name events must not multiply geometry intersection work before overlap precomputation");
assert.match(migration,
  /revoke all on function public\.brinesearch_issue97_refresh_supplemental_aliases_oh\(uuid\)[\s\S]*from public,anon,authenticated,service_role;/,
  "Ohio supplemental implementation helper must remain non-callable outside the trusted dispatcher");

console.log("Issue #97 Ohio OGRIP name-event precomputed-overlap + fractional-LRS regression passed.");
