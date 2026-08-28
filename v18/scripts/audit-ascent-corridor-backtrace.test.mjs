import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  auditCorridorExportSql as auditCanonicalCorridorExportSql,
  lintCorridorExportSql as auditCorridorExportSql,
  corridorSqlSha256,
  corridorSqlPath,
  expectedCorridorSqlSha256,
  repositoryRoot,
} from "./audit-ascent-corridor-backtrace.mjs";

const source = (await readFile(corridorSqlPath, "utf8")).replace(/\r\n?/gu, "\n");
const summary = JSON.parse(await readFile(path.join(
  repositoryRoot,
  "docs",
  "issue97-ascent-corridor-backtrace-summary-20260828.json",
), "utf8"));

test("corridor export is canonical reviewed raw evidence with zero authority effect", () => {
  assert.equal(corridorSqlSha256(source), expectedCorridorSqlSha256);
  assert.deepEqual(auditCanonicalCorridorExportSql(source), {
    canonicalReviewedSource: true,
    sourceReadOnlyContract: true,
    occurrenceEvidenceReported: true,
    transitionEvidenceReported: true,
    exactCurrentMembershipEvidenceReported: true,
    releaseCurrentReported: true,
    guessedConnectivity: false,
    candidateEligibilityDerived: false,
    authorityGranted: false,
  });
});

for (const mutation of [
  "insert into public.pads values ('x');",
  "update public.pads set pad_name='x';",
  "delete from public.pads;",
  "create table public.bad(id integer);",
  "call public.rebuild_everything();",
]) {
  test(`rejects write mutation: ${mutation.split(" ")[0]}`, () => {
    assert.throws(() => auditCorridorExportSql(source.replace("rollback;", `${mutation}\nrollback;`)), /forbidden/u);
  });
}

for (const mutation of [
  "select extensions.st_distance(a.geom,b.geom);",
  "select extensions.st_dwithin(a.geom,b.geom,1);",
  "select extensions.st_intersects(a.geom,b.geom);",
  "select 'nearest_road';",
]) {
  test(`rejects guessed connectivity: ${mutation}`, () => {
    const executableMutation = mutation.includes("nearest_road")
      ? "select nearest_road(a.geom);"
      : mutation;
    assert.throws(
      () => auditCorridorExportSql(source.replace("rollback;", `${executableMutation}\nrollback;`)),
      /guessed connectivity/u,
    );
  });
}

test("rejects the broken route-number-to-local-junction-name join", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "rollback;",
      "select road_name_at_junction from public.brinesearch_road_junction_memberships;\nrollback;",
    )),
    /local junction names/u,
  );
});

test("rejects missing read-only transaction and missing rollback", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace(" read only", "")),
    /read-only transaction/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(/rollback;\s*$/u, "")),
    /end in rollback/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "begin transaction isolation level repeatable read read only;",
      "select public.promote_corridor_authority();\nbegin transaction isolation level repeatable read read only;",
    )),
    /must start|non-allowlisted/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "rollback;",
      "rollback; select public.promote_corridor_authority(); rollback;",
    )),
    /exactly one rollback|non-allowlisted/u,
  );
});

test("rejects missing psql error-stop and weakened timeouts or search path", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace("\\set ON_ERROR_STOP on\n", "")),
    /required psql safety commands/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace("statement_timeout='60s'", "statement_timeout='60m'")),
    /60-second statement timeout/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace("lock_timeout='2s'", "lock_timeout='2m'")),
    /2-second lock timeout/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace("search_path='pg_catalog'", "search_path='public'")),
    /search_path/u,
  );
});

test("rejects whole-road grouping as proof of shared pavement", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "rollback;",
      "select identity_id,canonical_road_id,count(distinct pad_id) from private_verification.brinesearch_route_occurrence_receipts_issue97 group by identity_id,canonical_road_id;\nrollback;",
    )),
    /whole-road grouping/u,
  );
});

test("checked-in production summary is explicit, internally complete, and non-authoritative", () => {
  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.artifactKind, "ascent_corridor_backtrace_read_only_summary");
  assert.equal(summary.scope.snapshotId, "68f1d076-fe03-4519-a5cd-c68f8a28b06c");
  assert.equal(summary.scope.sourceRevision, 8);
  assert.match(summary.scope.directoryContentSha256, /^[0-9a-f]{64}$/u);
  assert.equal(summary.counts.pads, 247);
  assert.equal(
    summary.counts.padsWithActiveRoutePrep + summary.counts.padsWithoutActiveRoutePrep,
    summary.counts.pads,
  );
  assert.ok(summary.counts.heldOccurrenceReceipts > summary.counts.resolvedOccurrenceReceipts);
  assert.equal(summary.counts.publicGoogleRows, 1);
  assert.equal(summary.counts.cutoverActive, false);
  assert.deepEqual(summary.limitations, {
    rawEvidenceOnly: true,
    candidateEligibilityDerived: false,
    wholeRoadIdentityProvesSharedSegment: false,
    distanceProvesConnectivity: false,
    routeOrderProvenByThisSummary: false,
    databaseQueryExecutedInCi: false,
  });
  assert.deepEqual(summary.authorityEffect, {
    reviewedHandoffGranted: false,
    graphRouteApproved: false,
    publicGooglePublicationChanged: false,
    cutoverChanged: false,
    productionWrites: 0,
  });
});

test("rejects inline psql execution commands even when the payload is quoted", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "rollback;",
      "select 'rollback; update public.pads set pad_name=''bad'';' \\gexec\nrollback;",
    )),
    /required psql safety commands/u,
  );
});

test("rejects removal of either exact junction membership proof", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replaceAll(
      "left_exact_current_membership_count",
      "missing_left_exact_current_count",
    )),
    /exact current identity and canonical-road memberships/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replaceAll(
      "right_exact_current_membership_count",
      "missing_right_exact_current_count",
    )),
    /exact current identity and canonical-road memberships/u,
  );
});

test("rejects identity-only membership proof without exact canonical road IDs", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "and member.road_id=transition.left_road_id",
      "and member.road_id is not null",
    )),
    /exact current identity and canonical-road memberships/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "and member.road_id=transition.right_road_id",
      "and member.road_id is not null",
    )),
    /exact current identity and canonical-road memberships/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "where member.junction_id=transition.junction_id",
      "where member.junction_id is not null",
    )),
    /exact current identity and canonical-road memberships/u,
  );
});

test("rejects stale or inactive identity membership proof", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replaceAll("and member_identity.active", "and true")),
    /exact current identity and canonical-road memberships/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replaceAll(
      "private_verification.brinesearch_issue97_dataset_scope_current",
      "private_verification.untrusted_dataset_scope",
    )),
    /non-allowlisted function|exact current identity/u,
  );
});

test("rejects promotion of raw transition evidence into an eligibility gate", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "true as raw_evidence_only",
      "true as candidate_eligible",
    )),
    /raw evidence only|candidate eligibility/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "'candidateEligibilityDerived',false",
      "'candidateEligibilityDerived',true",
    )),
    /raw-evidence limitations/u,
  );
});

for (const mutation of [
  "commit; select public.brinesearch_v18_authorize_company_road_overlay_release();",
  "set transaction read write;",
  "select private_verification.brinesearch_issue97_prepare_graph_release_current_cache();",
  "select pg_advisory_lock(97);",
  "select pg_catalog.pg_advisory_lock(97);",
  "select extensions.dblink_exec('prod','update public.pads set pad_name=''bad''');",
]) {
  test(`rejects transaction escape or non-allowlisted function: ${mutation}`, () => {
    assert.throws(
      () => auditCorridorExportSql(source.replace("rollback;", `${mutation}\nrollback;`)),
      /forbidden|non-allowlisted|read-only transaction/u,
    );
  });
}

for (const command of [
  "\\o corridor-output.txt",
  "\\! echo side-effect",
  "\\ir external.sql",
  "\\gexec",
]) {
  test(`rejects unsafe psql command: ${command}`, () => {
    assert.throws(
      () => auditCorridorExportSql(source.replace("rollback;", `${command}\nrollback;`)),
      /required psql safety commands/u,
    );
  });
}

test("rejects authority promotion in the inventory export", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace("'graphRouteApproved',false", "'graphRouteApproved',true")),
    /zero-authority effect object/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "'graphRouteApproved',false",
      "'graphRouteApproved',true -- 'graphRouteApproved',false",
    )),
    /zero-authority effect object/u,
  );
});

test("canonical digest rejects semantic OR-true, literal-true, and executable-decoy bypasses", () => {
  const zeroAuthorityObject = "'authorityEffect',pg_catalog.jsonb_build_object("
    + "'reviewedHandoffGranted',false,'graphRouteApproved',false,"
    + "'publicGooglePublicationChanged',false,'cutoverChanged',false,'productionWrites',0),";
  const authorityWithExecutableDecoy = source
    .replace("'graphRouteApproved',false", "'graphRouteApproved',true")
    .replace("'authorityEffect',pg_catalog.jsonb_build_object(", zeroAuthorityObject
      + "'authorityEffect',pg_catalog.jsonb_build_object(");
  const mutations = [
    source.replace(
      "where member.junction_id=transition.junction_id",
      "where (member.junction_id=transition.junction_id or true)",
    ),
    source.replace(
      "and member.road_id=transition.left_road_id",
      "and (member.road_id=transition.left_road_id or true)",
    ),
    source.replace(
      "and member.road_id=transition.right_road_id",
      "and (member.road_id=transition.right_road_id or true)",
    ),
    source.replace(
      "'rawEvidenceOnly',transition.raw_evidence_only",
      "'rawEvidenceOnly',false",
    ),
    authorityWithExecutableDecoy,
  ];

  for (const mutation of mutations) {
    assert.throws(
      () => auditCanonicalCorridorExportSql(mutation),
      /differs from the reviewed canonical source/u,
    );
  }
});
