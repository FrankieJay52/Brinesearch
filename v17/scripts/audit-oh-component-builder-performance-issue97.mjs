import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260811253000_issue97_oh_component_builder_performance.sql"), "utf8");

for (const token of [
  "tmp_issue97_oh_valid_segments",
  "tmp_issue97_oh_endpoints",
  "tmp_issue97_oh_endpoint_edges",
  "tmp_issue97_oh_component_labels",
  "tmp_issue97_oh_component_segments",
  "tmp_issue97_oh_endpoints_measure_idx",
  "tmp_issue97_oh_endpoints_geog_idx",
  "b.source_measure between a.source_measure-0.001 and a.source_measure+0.001",
  "b.geom::extensions.geography,0.75",
  "(a.source_measure is null or b.source_measure is null)",
  "b.geom::extensions.geography,0.03",
  "a.z_level is null or b.z_level is null or a.z_level=b.z_level",
  "with recursive directed_edges",
  "component_walk(root_id,member_id)",
  "min(root_id) as component_seed",
  "component_identity_key",
  "private_verification.brinesearch_issue97_uuid(",
  "names remain excluded from identity construction"
]) assert.ok(migration.includes(token), `Issue #97 Ohio endpoint-component hardening missing: ${token}`);

assert.ok(!migration.includes("road_name similarity"),
  "Ohio component identity must never introduce road-name similarity");
assert.ok(!migration.includes("nearest_road"),
  "Ohio component identity must never introduce nearest-road construction");

const measuredAt = migration.indexOf("-- Both endpoint measures exist");
const unmeasuredAt = migration.indexOf("-- If either endpoint lacks CTL");
const walkAt = migration.indexOf("with recursive directed_edges");
assert.ok(measuredAt >= 0 && unmeasuredAt > measuredAt && walkAt > unmeasuredAt,
  "Ohio component builder must construct measured edges, then unmeasured exact edges, then transitive components");

assert.match(migration,
  /v_start:=pg_catalog\.strpos\(v_definition,[\s\S]*tmp_issue97_oh_component_segments[\s\S]*v_finish:=pg_catalog\.strpos\(v_definition,[\s\S]*tmp_issue97_oh_component_segments_identity_idx/,
  "The forward migration must replace only the original component-construction block and preserve the audited downstream identity/name/assignment pipeline");
assert.match(migration,
  /revoke all on function public\.brinesearch_issue97_refresh_oh_identities\(text\)[\s\S]*grant execute[\s\S]*to service_role;/,
  "The optimized Ohio identity refresh must remain service-only");

console.log("Issue #97 Ohio indexed endpoint-edge component regression passed.");
