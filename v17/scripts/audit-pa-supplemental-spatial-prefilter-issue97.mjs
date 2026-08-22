import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043200_issue97_pa_supplemental_spatial_prefilter.sql"), "utf8");
const qualifiedOperator = fs.readFileSync(path.join(root,
  "supabase/migrations/20260812043300_issue97_pa_supplemental_qualified_bbox_operator.sql"), "utf8");

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

for (const token of [
  "qualify the PostGIS bbox operator",
  "OPERATOR(extensions.&&)",
  "v_old:='and s.geom && extensions.st_expand(c.geom,0.0002)'",
  "v_new:='and s.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.0002)'",
  "PA bbox operator patch expected 1 target",
  "Issue #97 PA qualified bbox operator contract did not install cleanly"
]) {
  assert.ok(qualifiedOperator.includes(token),
    `Issue #97 PA qualified bbox operator missing: ${token}`);
}
assert.match(qualifiedOperator,
  /v_definition not like '%s\.geom OPERATOR\(extensions\.&&\) extensions\.st_expand\(c\.geom,0\.0002\)%'[\s\S]*v_definition not like '%extensions\.st_dwithin\(c\.geom::extensions\.geography,s\.geom::extensions\.geography,1\)%'/,
  "The qualified bbox operator must preserve the unchanged exact 1 m geography predicate");
assert.match(qualifiedOperator,
  /v_definition like '%and s\.geom && extensions\.st_expand\(c\.geom,0\.0002\)%'/,
  "The follow-up migration must prove the unresolved bare bbox operator is gone");

for (const text of [migration, qualifiedOperator]) {
  assert.ok(!text.includes("nearest" + "_road_used'',true"),
    "The PA performance prefilter must never authorize nearest-road matching");
  assert.ok(!text.includes("st_node("),
    "The PA performance prefilter must not node source geometry");
  assert.ok(!text.includes("st_makevalid("),
    "The PA performance prefilter must not rewrite source geometry");
}

console.log("Issue #97 PA supplemental conservative GiST prefilter + qualified operator + exact 1 m proof audit passed.");
