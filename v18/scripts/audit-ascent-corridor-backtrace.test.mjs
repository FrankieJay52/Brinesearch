import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  auditCorridorExportSql as auditCanonicalCorridorExportSql,
  lintCorridorExportSql as auditCorridorExportSql,
  corridorSqlSha256,
  corridorSqlPath,
  expectedCorridorSqlSha256,
} from "./audit-ascent-corridor-backtrace.mjs";

const source = (await readFile(corridorSqlPath, "utf8")).replace(/\r\n?/gu, "\n");

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

test("rejects removal of the resolved current transition gate", () => {
  assert.throws(
    () => auditCorridorExportSql(source.replace("transition.status='resolved'", "true")),
    /current graph-membership research gate/u,
  );
  assert.throws(
    () => auditCorridorExportSql(source.replace(
      "build.id=transition.graph_build_id",
      "build.id is not null",
    )),
    /current graph-membership research gate/u,
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
      "'transitionGraphMembershipGateCurrent',transition.transition_graph_membership_gate_current",
      "'transitionGraphMembershipGateCurrent',true",
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
