import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, "../..");
export const corridorSqlPath = path.join(
  repositoryRoot,
  "ops",
  "issue97-computer-rollout",
  "sql",
  "48-ascent-corridor-backtrace-export.sql",
);
export const expectedCorridorSqlSha256 = "5ef2d066e0ba4d0553c35b39ff221e5585f34c5d81bfb1af37abfe38ba09ae99";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function executableSql(sql) {
  return sql
    .replace(/^\s*\\[^\r\n]*/gmu, " ")
    .replace(/--[^\r\n]*/gu, " ")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/'(?:''|[^'])*'/gu, "''")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function sqlWithoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\r\n]*/gu, " ");
}

function psqlMetaCommands(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\r\n]*/gu, " ")
    .replace(/'(?:''|[^'])*'/gu, "''")
    .split(/\r?\n/gu)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.includes("\\"));
}

export function lintCorridorExportSql(sql) {
  assert(typeof sql === "string" && sql.length > 0, "Corridor SQL is missing");
  const code = executableSql(sql);
  const surface = sqlWithoutComments(sql).replace(/\s+/gu, "").toLowerCase();
  const readableCode = sqlWithoutComments(sql).replace(/\s+/gu, " ").trim().toLowerCase();

  const requiredMetaCommands = [
    "\\set on_error_stop on",
    "\\pset pager off",
    "\\timing on",
  ];
  const metaCommands = psqlMetaCommands(sql);
  assert(JSON.stringify(metaCommands) === JSON.stringify(requiredMetaCommands),
    "Corridor export must contain only the required psql safety commands");

  assert(
    /^begin transaction isolation level repeatable read read only;/u.test(code),
    "Corridor export must start a repeatable-read, read-only transaction",
  );
  assert(readableCode.includes("set local statement_timeout='60s';"),
    "Corridor export needs the bounded 60-second statement timeout");
  assert(readableCode.includes("set local lock_timeout='2s';"),
    "Corridor export needs the bounded 2-second lock timeout");
  assert(readableCode.includes("set local search_path='pg_catalog';"),
    "Corridor export must pin search_path to pg_catalog");
  assert(/rollback;\s*$/u.test(code), "Corridor export must end in rollback");
  assert((code.match(/(?:^|[^a-z_])begin(?:[^a-z_]|$)/gu) ?? []).length === 1,
    "Corridor export must contain exactly one transaction begin");
  assert((code.match(/(?:^|[^a-z_])rollback(?:[^a-z_]|$)/gu) ?? []).length === 1,
    "Corridor export must contain exactly one rollback");
  assert(!code.includes("read write") && !code.includes("set transaction"),
    "Corridor export must not weaken the read-only transaction");

  for (const forbidden of [
    "insert", "update", "delete", "merge", "truncate", "create", "alter",
    "drop", "grant", "revoke", "call", "do", "copy", "\\copy", "commit",
    "savepoint", "release", "prepare", "execute", "listen", "notify", "into",
    "pg_advisory_lock", "pg_advisory_xact_lock", "pg_try_advisory_lock",
    "pg_try_advisory_xact_lock",
  ]) {
    assert(
      !new RegExp(`(?:^|[^a-z_])${forbidden}(?:[^a-z_]|$)`, "u").test(code),
      `Corridor export contains forbidden ${forbidden}`,
    );
  }

  for (const guessedConnectivity of [
    "st_distance", "st_dwithin", "st_intersects", "st_touches",
    "st_closestpoint", "nearest_road", "closest_anchor", "fuzzy_name",
    "name_only", "route_number_only",
  ]) {
    assert(
      !code.includes(guessedConnectivity),
      `Corridor export contains guessed connectivity method ${guessedConnectivity}`,
    );
  }
  assert(!/\b(?:group\s+by|partition\s+by)\b/u.test(code),
    "Raw corridor evidence must not infer shared pavement from whole-road grouping");

  const allowedQualifiedFunctions = new Set([
    "pg_catalog.jsonb_agg",
    "pg_catalog.jsonb_build_array",
    "pg_catalog.jsonb_build_object",
    "pg_catalog.jsonb_strip_nulls",
    "pg_catalog.md5",
    "pg_catalog.to_jsonb",
    "private_verification.brinesearch_issue97_dataset_scope_current",
    "private_verification.brinesearch_issue97_graph_build_release_current",
  ]);
  for (const match of code.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(/gu)) {
    const functionName = `${match[1]}.${match[2]}`;
    assert(allowedQualifiedFunctions.has(functionName),
      `Corridor export calls non-allowlisted function ${functionName}`);
  }

  assert(code.includes("brinesearch_route_occurrence_receipts_issue97"),
    "Corridor export must include exact occurrence receipts");
  assert(code.includes("brinesearch_route_transition_receipts_issue97"),
    "Corridor export must include exact transition receipts");
  assert(code.includes("brinesearch_route_occurrence_geometry_receipts_issue97"),
    "Corridor export must include exact occurrence geometry receipts");
  assert(code.includes("brinesearch_road_junction_memberships"),
    "Corridor export must prove both exact junction memberships");
  assert(code.includes("brinesearch_issue97_graph_build_release_current"),
    "Corridor export must report release-current graph state");
  assert(code.includes("identity.route_system") && code.includes("identity.route_number"),
    "Corridor export must carry exact route system and number");
  assert(code.includes("left_exact_current_membership_count")
      && code.includes("right_exact_current_membership_count")
      && code.includes("member.junction_id=transition.junction_id")
      && code.includes("member.road_id=transition.left_road_id")
      && code.includes("member.road_id=transition.right_road_id")
      && code.includes("member_identity.active")
      && code.includes("brinesearch_issue97_dataset_scope_current"),
  "Corridor export must prove exact current identity and canonical-road memberships");
  assert(code.includes("true as raw_evidence_only")
      && surface.includes("'rawevidenceonly',transition.raw_evidence_only"),
  "Corridor export must label every transition as raw evidence only");
  assert(!code.includes("transition_graph_membership_gate_current")
      && !code.includes("candidate_eligible")
      && !code.includes("route_eligible"),
  "Corridor export must not derive route or candidate eligibility");
  assert(!code.includes("road_name_at_junction"),
    "Corridor export must not match route numbers through local junction names");
  assert(!code.includes("step_geometry") && !code.includes("junction.geom"),
    "Corridor export must not leak full geometry");
  assert(!code.includes("occurrence.evidence") && !code.includes("transition.evidence"),
    "Corridor export must not leak raw evidence payloads");

  const zeroAuthorityEffect = "'authorityeffect',pg_catalog.jsonb_build_object("
    + "'reviewedhandoffgranted',false,'graphrouteapproved',false,"
    + "'publicgooglepublicationchanged',false,'cutoverchanged',false,'productionwrites',0)";
  assert(surface.includes(zeroAuthorityEffect), "Missing exact zero-authority effect object");
  const exactLimitations = "'limitations',pg_catalog.jsonb_build_object("
    + "'rawevidenceonly',true,'candidateeligibilityderived',false,"
    + "'wholeroadidentityprovessharedsegment',false,'distanceprovesconnectivity',false,"
    + "'routeorderprovenbythisexport',false)";
  assert(surface.includes(exactLimitations), "Missing exact raw-evidence limitations object");

  return {
    sourceReadOnlyContract: true,
    occurrenceEvidenceReported: true,
    transitionEvidenceReported: true,
    exactCurrentMembershipEvidenceReported: true,
    releaseCurrentReported: true,
    guessedConnectivity: false,
    candidateEligibilityDerived: false,
    authorityGranted: false,
  };
}

export function corridorSqlSha256(sql) {
  return createHash("sha256").update(sql.replace(/\r\n?/gu, "\n"), "utf8").digest("hex");
}

export function auditCorridorExportSql(sql) {
  const actualDigest = corridorSqlSha256(sql);
  assert(actualDigest === expectedCorridorSqlSha256,
    `Corridor SQL differs from the reviewed canonical source (${actualDigest})`);
  return {
    canonicalReviewedSource: true,
    ...lintCorridorExportSql(sql),
  };
}

async function main() {
  const sql = await readFile(corridorSqlPath, "utf8");
  console.log(JSON.stringify(auditCorridorExportSql(sql), null, 2));
}

const invokedAsScript = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) await main();
