import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const sqlPath = path.join(root, "ops", "issue97-computer-rollout", "sql",
  "44-rebuild-frozen-wave-exact-412-routes.sql");
const manifestPath = path.join(root, "ops", "issue97-computer-rollout", "sql",
  "34-frozen-exact-mapping-wave-route-manifest.sql");

const sql = fs.readFileSync(sqlPath, "utf8").replace(/\r\n/g, "\n");
const manifest = fs.readFileSync(manifestPath, "utf8").replace(/\r\n/g, "\n");
const ROUTE_BEGIN = "-- EXACT_FINAL_412_BEGIN";
const ROUTE_END = "-- EXACT_FINAL_412_END";
const UUID_RE =
  /'([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'::uuid/g;

function extractBlock(source, begin = ROUTE_BEGIN, end = ROUTE_END) {
  const start = source.indexOf(begin);
  const finish = source.indexOf(end, start);
  assert.notEqual(start, -1, "missing " + begin);
  assert.notEqual(finish, -1, "missing " + end);
  return source.slice(start, finish + end.length);
}
function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}
function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
function escapeRegExp(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

const expectedRouteBlock = extractBlock(manifest);
const expectedRouteIds = [...expectedRouteBlock.matchAll(UUID_RE)]
  .map((match) => match[1]);
assert.equal(expectedRouteIds.length, 412,
  "file 34 route authority must contain 412 UUIDs");
assert.equal(new Set(expectedRouteIds).size, 412,
  "file 34 route authority contains duplicates");
assert.equal(md5([...expectedRouteIds].sort().join("|")),
  "711b1ddd3ba6c47e7642fc700197432f",
  "file 34 route digest changed");

const mutablePrivateRelations = [
  "private_verification.brinesearch_route_occurrence_candidates_issue97",
  "private_verification.brinesearch_route_occurrence_receipts_issue97",
  "private_verification.brinesearch_route_occurrence_receipt_history_issue97",
  "private_verification.brinesearch_route_reconciliation_receipts_issue97",
  "private_verification.brinesearch_route_reconciliation_history_issue97",
  "private_verification.brinesearch_route_transition_receipts_issue97",
  "private_verification.brinesearch_route_transition_history_issue97",
  "private_verification.brinesearch_route_occurrence_geometry_receipts_issue97",
  "private_verification.brinesearch_route_occurrence_geometry_history_issue97",
];
const expectedFunctionHashes = new Map([
  ["private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)", "0f139df2a01f68722958ff10f1dd6f49"],
  ["private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)", "8ad311611cf361ca457e4084128b9cfb"],
  ["private_verification.brinesearch_issue97_refresh_route_receipt(uuid)", "8283a543bf42f939296d32e5e5a92b4f"],
  ["private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)", "5d6a002a25bd37011b574858b3870382"],
  ["private_verification.brinesearch_issue97_refresh_route_geometry(uuid)", "89ec2a0f5821d7b6a7d8e569aef8d5de"],
  ["private_verification.brinesearch_issue97_write_occurrence_history(uuid)", "2f0b95ff3a52f63e98a72f0e89a4d985"],
  ["private_verification.brinesearch_issue97_write_transition_history(uuid,integer)", "068d6a1a561e5f61c8178a77120775d6"],
  ["private_verification.brinesearch_issue97_write_geometry_history(uuid)", "6ab9ad6eb96980ef24cd896cfa7a360f"],
  ["private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)", "a09e01457d5bf95108e2c9ef71656006"],
  ["private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(uuid,text,text,text,integer)", "101d7b6c21b60aeb64886fa3b6ba9343"],
  ["private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)", "80675198042cb9d4407dbe4fc8d9251f"],
  ["private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)", "d29e371803a956cb94ed13e81e7c2317"],
]);
const requiredLocks = [
  "brinesearch:issue97:ohio-state-release",
  "brinesearch:issue97:all-pad-routing-pipeline",
  "brinesearch:issue97:route-corpus",
  "brinesearch:issue97:saved-road-reconciliation",
  "brinesearch:issue97:mapping-refresh",
];

function validate(source) {
  const errors = [];
  const fail = (condition, message) => {
    if (!condition) errors.push(message);
  };
  let routeBlock = "";
  try {
    routeBlock = extractBlock(source);
  } catch (error) {
    errors.push(error.message);
  }
  const routeIds = [...routeBlock.matchAll(UUID_RE)].map((match) => match[1]);
  fail(routeBlock === expectedRouteBlock,
    "route block is not byte-semantic equal to file 34");
  fail(routeIds.length === 412, "route list is not exactly 412");
  fail(new Set(routeIds).size === 412, "route list contains a duplicate");
  fail(md5([...routeIds].sort().join("|")) ===
    "711b1ddd3ba6c47e7642fc700197432f", "route digest is wrong");
  fail(/-- EXACT_FINAL_412_END\nissue97_frozen_route_authority\(route_prep_id\) as \(\n  select route_prep_id from frozen_routes\n\)\ninsert into pg_temp\.issue97_frozen_routes\(ordinal,route_prep_id\)\nselect pg_catalog\.row_number\(\) over\(order by route_prep_id\)::integer,route_prep_id\nfrom issue97_frozen_route_authority\norder by route_prep_id;/.test(source),
    "terminal frozen-route CTE/INSERT boundary is not parse-safe");

  fail(occurrences(source, /begin isolation level serializable;/gi) === 1,
    "transaction is not exactly one SERIALIZABLE transaction");
  fail(occurrences(source, /^\s*commit;\s*$/gim) === 1,
    "COMMIT count is not one");
  fail(occurrences(source, /^\s*rollback;\s*$/gim) === 1,
    "ROLLBACK count is not one");
  fail(source.includes("\\set issue97_route_apply 0") &&
    source.includes(":'issue97_route_apply' in ('0','1')") &&
    occurrences(source, /\\if :issue97_route_apply/g) === 1,
    "apply control is not exact/default-rollback");

  let lastLock = -1;
  for (const lock of requiredLocks) {
    const index = source.indexOf(lock);
    fail(index > lastLock, "lock missing or out of order: " + lock);
    lastLock = index;
  }
  fail(source.includes("'brinesearch:issue97:ingest:'") &&
    source.includes("'brinesearch:issue97:graph:OH:'"),
    "ingest/graph lock closure missing");

  fail(source.includes("'1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid") &&
    source.includes("'77cb00cf83ad8bab4a45c9b552626f76'") &&
    source.includes("'c3f925954d41cb6fbd5939eca5de3288'"),
    "successor manifest/candidate authority missing");
  fail(source.includes("'route_count',412") &&
    source.includes("'route_digest','711b1ddd3ba6c47e7642fc700197432f'") &&
    source.includes("'primary_routes',340") &&
    source.includes("'alternate_routes',72") &&
    source.includes("'non_target_route_count',394"),
    "route cardinality receipt missing");

  fail(source.includes("'ad0f05a78c5076a6d8c9d82a1cd21445'") &&
    source.includes("'2a918cb88cbbc9d120b4de29f326870a'") &&
    source.includes("'b7ecec9d58ae5a06765486cf62919958'") &&
    source.includes("'7776affed9bb9dd931aa86116e490a68'"),
    "protected public/non-Ohio baseline missing");

  fail(occurrences(source, /issue97_resolved_unmapped_before/g) >= 8 &&
    occurrences(source, /issue97_resolved_unmapped_after/g) >= 4 &&
    /count\(\*\) from pg_temp\.issue97_resolved_unmapped_before\)<>70/.test(source) &&
    /count\(distinct route_prep_id\)[\s\S]{0,80}issue97_resolved_unmapped_before\)<>47/.test(source) &&
    /count\(distinct identity_id\)[\s\S]{0,80}issue97_resolved_unmapped_before\)<>36/.test(source) &&
    occurrences(source, /4cb91c0970863c971465edd17fb84bfd/g) === 1,
  "resolved/unmapped before-set authority missing");
  fail(source.includes("blocker.resolution_method<>'route_graph_unique_identity_path'") &&
    source.includes("identity.source_identity_key is distinct from") &&
    source.includes("identity.source_digest is distinct from blocker.source_digest") &&
    source.includes("brinesearch_issue97_mapping_fingerprint(") &&
    /brinesearch_issue97_dataset_scope_current\([\s\S]{0,150}\) is distinct from true/.test(source),
  "resolved/unmapped semantic currentness proof missing");
  fail(/from pg_temp\.issue97_resolved_unmapped_after blocker_after\s+except[\s\S]{0,600}from pg_temp\.issue97_resolved_unmapped_before blocker_before/.test(source),
    "no-new-resolved/unmapped subset proof missing");
  fail(/receipt\.canonical_road_id is null and exists\([\s\S]{0,300}mapping\.identity_id=receipt\.identity_id[\s\S]{0,200}mapping\.mapping_status='verified'/.test(source) &&
    /receipt\.canonical_road_id is not null and not exists\([\s\S]{0,300}mapping\.identity_id=receipt\.identity_id[\s\S]{0,200}mapping\.road_id=receipt\.canonical_road_id[\s\S]{0,200}mapping\.mapping_status='verified'/.test(source) &&
    !source.includes("resolved target occurrence lacks verified mapping"),
  "resolved occurrence two-way mapping coherence proof missing");
  fail(source.includes("'resolved_unmapped_before',unmapped_before.receipt_count") &&
    source.includes("'resolved_unmapped_before_digest',unmapped_before.receipt_digest") &&
    source.includes("'resolved_unmapped_after',unmapped_after.receipt_count") &&
    source.includes("'resolved_unmapped_after_digest',unmapped_after.receipt_digest") &&
    source.includes("'new_resolved_unmapped_blockers',0"),
  "resolved/unmapped deterministic receipt missing");

  for (const relation of mutablePrivateRelations) {
    fail(occurrences(source, new RegExp(escapeRegExp(relation), "g")) >= 2,
      "non-target before/after guard missing for " + relation);
  }
  fail(/\(select \* from pg_temp\.issue97_non_target_before\s+except select \* from pg_temp\.issue97_non_target_after\)\s+union all\s+\(select \* from pg_temp\.issue97_non_target_after\s+except select \* from pg_temp\.issue97_non_target_before\)/.test(source),
    "byte-exact non-target EXCEPT guard missing");

  for (const [signature, hash] of expectedFunctionHashes) {
    fail(source.includes("'" + signature + "'") &&
      source.includes("'" + hash + "'"),
      "function authority missing: " + signature);
  }

  const applyStart = source.indexOf("do $issue97_route_rebuild_apply$");
  const applyEnd = source.indexOf("$issue97_route_rebuild_apply$;", applyStart);
  const applyBlock = applyStart >= 0 && applyEnd > applyStart
    ? source.slice(applyStart, applyEnd) : "";
  const requiredCalls = [
    "private_verification.brinesearch_issue97_refresh_occurrence_candidate(",
    "private_verification.brinesearch_issue97_resolve_route_identity_path(",
    "private_verification.brinesearch_issue97_refresh_transition_receipts(",
    "private_verification.brinesearch_issue97_refresh_route_geometry(",
    "private_verification.brinesearch_issue97_refresh_route_receipt(",
  ];
  for (const call of requiredCalls) {
    fail(occurrences(applyBlock,
      new RegExp(escapeRegExp(call), "g")) === 1,
      "apply loop call count wrong: " + call);
  }
  fail(source.indexOf("\\if :issue97_route_apply") < applyStart,
    "writer block is not apply-gated");

  const forbiddenCalls = [
    "brinesearch_issue97_run_all_pad_routing_pipeline",
    "brinesearch_issue97_reconcile_route_corpus(",
    "brinesearch_issue97_refresh_google_route(",
    "brinesearch_issue97_refresh_google_routes(",
    "brinesearch_issue97_refresh_google_route_transition_dark(",
    "brinesearch_issue97_activate_graph_build(",
    "brinesearch_issue97_activate_cutover(",
    "brinesearch_issue97_rebuild_county_graph(",
  ];
  for (const call of forbiddenCalls) {
    fail(!source.includes(call),
      "forbidden broad/writer call present: " + call);
  }

  fail(!/\b(?:insert\s+into|update|delete\s+from|merge\s+into)\s+public\./i
    .test(source), "direct public persistent DML is present");
  fail(!/\bdelete\s+from\s+private_verification\./i.test(source),
    "direct private DELETE is present");
  const privateUpdates = [
    ...source.matchAll(/\bupdate\s+(private_verification\.[a-z0-9_]+)/gi),
  ].map((match) => match[1].toLowerCase());
  fail(privateUpdates.length === 1 &&
    privateUpdates[0] ===
      "private_verification.brinesearch_route_occurrence_receipts_issue97",
    "private direct UPDATE scope is not exact");
  const ddlStatements = source.replace(/--.*$/gm, "")
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => /^(?:create|alter|drop)\s+/.test(line));
  fail(ddlStatements.every((line) =>
    /^create\s+(?:temporary|temp)\s+table\b/.test(line) ||
    /^alter\s+table\s+pg_temp\./.test(line)),
  "persistent DDL is present");

  fail(source.includes("'mutating_functions_invoked',false") &&
    source.includes("'sequence_advancement',false") &&
    source.includes("'rollback_rehearsal',true"),
    "non-mutating rollback rehearsal receipt missing");
  fail(source.includes("'private_google_refreshed',false") &&
    source.includes("'public_google_projected',false") &&
    occurrences(source, /public\.brinesearch_driver_google_routes_public/g) >= 4 &&
    occurrences(source, /brinesearch_google_route_refresh_queue_issue97/g) >= 4 &&
    occurrences(source, /brinesearch_issue97_cutover_active\(\)/g) >= 2,
    "Google/cutover isolation proof missing");
  fail(source.includes("receipt.updated_at=v_transaction_time") &&
    source.includes("candidate.updated_at<>v_transaction_time") &&
    source.includes("receipt.graph_build_id in (") &&
    source.includes("mapping.mapping_status='verified'"),
    "target currentness/mapping/old-graph postchecks missing");
  fail(source.includes("history_sequences") &&
    occurrences(source, /_history_issue97_id_seq/g) >= 12 &&
    !/\bsetval\s*\(/i.test(source),
    "history sequence receipt/control missing or unsafe");
  return errors;
}

const errors = validate(sql);
assert.deepEqual(errors, [],
  "file 44 audit failed:\n" + errors.join("\n"));

const mutations = [
  ["missing route", sql.replace(expectedRouteIds[0],
    "00000000-0000-4000-8000-000000000000")],
  ["duplicate route", sql.replace(expectedRouteIds[0], expectedRouteIds[1])],
  ["route digest", sql.replaceAll("711b1ddd3ba6c47e7642fc700197432f",
    "00000000000000000000000000000000")],
  ["broad corpus RPC", sql.replace(
    "perform private_verification.brinesearch_issue97_refresh_occurrence_candidate(",
    "perform public.brinesearch_issue97_reconcile_route_corpus(null);\n" +
      "      perform private_verification.brinesearch_issue97_refresh_occurrence_candidate(")],
  ["public writer", sql.replace("commit;",
    "update public.brinesearch_route_prep set active=active;\n  commit;")],
  ["missing primitive", sql.replace(
    "v_geometry:=\n        private_verification.brinesearch_issue97_refresh_route_geometry(",
    "v_geometry:=pg_catalog.jsonb_build_object(")],
  ["non-target guard", sql.replace(
    "select * from pg_temp.issue97_non_target_before",
    "select * from pg_temp.issue97_non_target_after")],
  ["baseline drift", sql.replaceAll("ad0f05a78c5076a6d8c9d82a1cd21445",
    "00000000000000000000000000000000")],
  ["commit removed", sql.replace(/^\s*commit;\s*$/m, "")],
  ["rollback removed", sql.replace(/^\s*rollback;\s*$/m, "")],
  ["Google writer", sql.replace("commit;",
    "perform private_verification.brinesearch_issue97_refresh_google_route_transition_dark(null);\n  commit;")],
  ["sequence reset", sql.replace("commit;",
    "select pg_catalog.setval(" +
      "'private_verification.brinesearch_route_reconciliation_history_issue97_id_seq',1);\n" +
      "  commit;")],
  ["blocker baseline digest", sql.replace(
    "4cb91c0970863c971465edd17fb84bfd",
    "00000000000000000000000000000000")],
  ["blocker baseline count", sql.replace(
    "from pg_temp.issue97_resolved_unmapped_before)<>70",
    "from pg_temp.issue97_resolved_unmapped_before)<>71")],
  ["blocker source currentness", sql.replace(
    "brinesearch_issue97_dataset_scope_current(",
    "brinesearch_issue97_dataset_scope_stale(")],
  ["blocker subset", sql.replace(
    "from pg_temp.issue97_resolved_unmapped_after blocker_after",
    "from pg_temp.issue97_resolved_unmapped_before blocker_after")],
  ["null canonical coherence", sql.replace(
    "or (receipt.canonical_road_id is null and exists(",
    "or (false and exists(")],
  ["blocker receipt", sql.replace(
    "'new_resolved_unmapped_blockers',0",
    "'new_resolved_unmapped_blockers',1")],
];
for (const [label, mutated] of mutations) {
  assert.ok(validate(mutated).length > 0,
    "mutation survived audit: " + label);
}

console.log(JSON.stringify({
  classification:
    "ISSUE97_FROZEN_WAVE_EXACT_412_ROUTE_REBUILD_STATIC_AUDIT_PASS",
  route_count: expectedRouteIds.length,
  route_digest: md5([...expectedRouteIds].sort().join("|")),
  mutable_private_relations: mutablePrivateRelations.length,
  pinned_function_hashes: expectedFunctionHashes.size,
  mutation_cases: mutations.length,
  preexisting_resolved_unmapped_receipts: 70,
  preexisting_resolved_unmapped_routes: 47,
  preexisting_resolved_unmapped_identities: 36,
  preexisting_resolved_unmapped_digest:
    "4cb91c0970863c971465edd17fb84bfd",
  production_access: false,
  repository_write: false,
}));
