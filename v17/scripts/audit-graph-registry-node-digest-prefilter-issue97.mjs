import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260812045500_issue97_graph_registry_node_digest_prefilter.sql"),
  "utf8"
);

for (const token of [
  "OPERATOR(extensions.&&) extensions.st_expand(s.geom,0.00005)",
  "extensions.st_dwithin",
  "c.source_node_key||':'||c.source_digest",
  "select distinct n.source_node_key,n.source_digest",
  "semantics-neutral",
  "1-metre",
]) {
  assert.ok(migration.includes(token), `missing required token: ${token}`);
}

for (const forbidden of [
  "similarity(",
  "nearest_road",
  "name_only",
]) {
  assert.ok(!migration.includes(forbidden), `performance patch must not introduce: ${forbidden}`);
}

assert.ok(
  migration.includes("s.geom::extensions.geography,\n          1"),
  "exact 1-metre geography test must remain authoritative"
);

console.log("Issue #97 graph registry node-digest prefilter audit passed.");
