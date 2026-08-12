import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043200_issue97_pa_supplemental_spatial_prefilter.sql"), "utf8");

for (const token of [
  "Pennsylvania supplemental exact-mapping spatial prefilter",
  "s.geom && extensions.st_expand(c.geom,0.0002)",
  "extensions.st_dwithin(c.geom::extensions.geography,s.geom::extensions.geography,1)",
  "PA supplemental exact ST_DWithin patch expected 1 target",
  "PA supplemental bounding-box prefilter is too narrow for a 1 m exact candidate",
  "Issue #97 PA supplemental spatial prefilter contract did not install cleanly"
]) {
  assert.ok(migration.includes(token), `Issue #97 PA supplemental spatial prefilter missing: ${token}`);
}

assert.match(migration,
  /v_new:=E'and s\.geom && extensions\.st_expand\(c\.geom,0\.0002\)\\n       and extensions\.st_dwithin\(c\.geom::extensions\.geography,s\.geom::extensions\.geography,1\)'/,
  "The coarse GiST box must be immediately followed by the unchanged exact 1 m geography predicate");
assert.match(migration,
  /v_count<>1[\s\S]*pg_catalog\.replace\(v_definition,v_old,v_new\)/,
  "The forward patch must fail unless exactly one PA exact spatial predicate is updated");
assert.ok(!migration.includes("nearest" + "_road_used'',true"),
  "The PA performance prefilter must never authorize nearest-road matching");
assert.ok(!migration.includes("st_node("),
  "The PA performance prefilter must not node source geometry");
assert.ok(!migration.includes("st_makevalid("),
  "The PA performance prefilter must not rewrite source geometry");

console.log("Issue #97 PA supplemental conservative GiST prefilter + exact 1 m proof audit passed.");
