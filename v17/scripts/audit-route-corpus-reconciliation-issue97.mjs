import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260811234500_issue97_route_corpus_reconciliation.sql"),
  "utf8"
);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const need = (token, message = token) => assert.ok(migration.includes(token), `Issue #97 batch pipeline missing ${message}`);
const forbid = (token, message = token) => assert.ok(!migration.includes(token), `Issue #97 batch pipeline forbids ${message}`);

for (const token of [
  "brinesearch_route_occurrence_candidates_issue97",
  "brinesearch_route_occurrence_receipts_issue97",
  "brinesearch_route_occurrence_receipt_history_issue97",
  "brinesearch_route_reconciliation_receipts_issue97",
  "brinesearch_route_reconciliation_history_issue97",
  "brinesearch_issue97_reconcile_route_corpus",
  "brinesearch_issue97_route_exception_queue",
  "brinesearch_issue97_route_corpus_metrics",
  "route_graph_unique_identity_path",
  "explicit_authoritative_source_receipt",
  "requires_unique_authoritative_route_graph_path",
  "saved_sequence_has_no_exact_authoritative_graph_path",
  "authoritative_route_identity_path_ambiguous",
  "candidate evidence only; not occurrence proof",
  "exact name equality is candidate evidence only",
  "route designation is candidate evidence only",
  "manual_map_editor_role",
  "review_exception_qa_only",
  "pg_advisory_xact_lock",
  "zero_forbidden_resolutions"
]) need(token);

need("coalesce(resolution_method,'') not in ('name_only','fuzzy_name','nearest_road','route_number_only')",
  "database no-guess receipt constraint");
need("p_left_identity=p_right_identity or exists(", "same-identity/repeated occurrence support");
need("brinesearch_road_junction_memberships", "physical junction path selection");
need("brinesearch_issue97_graph_build_sources_current", "current graph dependency gate");
need("private_verification.brinesearch_issue97_dataset_scope_current", "current source receipt gate");
need("Raw source identities are never bulk-promoted", "no raw-source bulk promotion contract");
forbid("insert into public.brinesearch_roads", "raw authoritative source promotion");
forbid("similarity(", "fuzzy similarity selection");
forbid("<->", "nearest-geometry selection");

assert.equal(pkg.scripts["verify:route-corpus-reconciliation"],
  "node v17/scripts/audit-route-corpus-reconciliation-issue97.mjs",
  "Issue #97 route corpus audit script is not wired");
assert.ok(pkg.scripts.build.includes("npm run verify:route-corpus-reconciliation"),
  "Issue #97 route corpus audit is not in the full production build");
need("route_variant_structured_publication_not_generated",
  "alternate route variants must be explicit exceptions until route-keyed publication is complete");
need("v_route.route_group='primary' and v_route.variant_index=1",
  "Route Prep primary variant must be identified explicitly");
need("pr.route_group='primary' and pr.route_variant_index=0",
  "published primary structured route must use the existing zero-based variant key");

console.log("Issue #97 automatic route-corpus reconciliation audit passed.");
