import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20260829120000_v18_exact_route_saved_directions.sql",
  import.meta.url,
), "utf8").replaceAll("\r\n", "\n");

describe("V18 exact-route saved-direction migration", () => {
  it("uses one exact-pad public projection and limits the four written-only fallbacks to the measured Ascent scope", () => {
    expect(migration).toContain(
      "private_verification.brinesearch_v18_public_pad_directions(p_pad_id uuid)",
    );
    expect(migration).toContain("from public.public_pad_detail detail");
    expect(migration).toContain("left join public.brinesearch_driver_directions_public directions");
    expect(migration).toContain("on directions.pad_id=detail.id");
    expect(migration).toContain("where detail.id=p_pad_id");
    expect(migration).toContain(
      "then private_verification.brinesearch_driver_safe_clear_v17330(\n           detail.written_directions\n         )",
    );
    expect(migration).toContain(
      "pg_catalog.upper(pg_catalog.btrim(detail.company))='ASCENT'",
    );
    expect(migration).toContain(
      "pg_catalog.upper(pg_catalog.btrim(detail.state)) in ('OH','OHIO')",
    );
    expect(migration).toContain(
      "'BELMONT','GUERNSEY','HARRISON','JEFFERSON','MONROE','NOBLE'",
    );
    expect(migration).toContain(
      "'ABLE','EZEKIEL','LASSO','SHUGERT DADDY'",
    );
    expect(migration).toContain("'directions_clear'");
    expect(migration).toContain("'written_directions'");
    expect(migration).toContain("if v_fallback_count<>4 then");
    expect(migration).toContain(
      "Expected four Ascent six-county written-only direction rows",
    );
    expect(migration).not.toMatch(/(?:from|join)\s+public\.pads\b/i);
  });

  it("returns saved text beside both real ready-route sources without changing their geometry", () => {
    expect(migration).toContain("v_route_state='ready'");
    expect(migration).toContain(
      "v_route_source in ('exact_graph','exact_graph_handoff')",
    );
    expect(migration).toContain("'writtenDirections',case");
    expect(migration).toContain("when v_expose_public_written_directions");
    expect(migration).toContain("'writtenDirectionsSource',case");
    expect(migration).toContain("'writtenDirectionsSourceRevision',case");
    expect(migration).toContain("'state','ready','source','exact_graph_handoff'");
    expect(migration).toContain(
      "'writtenDirections',public_direction.directions_clear",
    );
    expect(migration).toContain("'steps',projection.route_steps");
    expect(migration).toContain("'geometry',projection.route_geometry");
    expect(migration).toContain(
      "private_verification.brinesearch_v18_exact_route_projection(\n        v_route.id,v_receipt.road_occurrence_count",
    );
  });

  it("keeps frozen status revisions byte-stable and versions display text separately", () => {
    expect(migration).toContain("when v_route_source='legacy_written'");
    expect(migration).toContain("then v_public_directions_revision::text else '' end");
    expect(migration).toContain("then v_public_written_directions else '' end");
    expect(migration).toContain("'statusRevision',projection.release_digest");
    expect(migration).toContain(
      "'writtenDirectionsSourceRevision',public_direction.source_revision",
    );
    expect(migration).toContain(
      "v_exact_status->>'statusRevision' is distinct from\n" +
      "          v_before.exact_graph_status->>'statusRevision'",
    );
    expect(migration).toContain(
      "v_handoff_release#>>'{status,statusRevision}' is distinct from\n" +
      "          v_before.exact_handoff_release#>>'{status,statusRevision}'",
    );
    expect(migration).toContain(
      "v_direction.direction_source is distinct from 'directions_clear'",
    );
    expect(migration).toContain(
      "v_direction.direction_source is distinct from 'written_directions'",
    );
  });

  it("preserves authority predicates, hardened metadata, and public grants", () => {
    expect(migration).toContain("v_receipt.route_status='route_ready'");
    expect(migration).toContain("v_receipt.stage='ready'");
    expect(migration).toContain("and receipt.revoked_at is null");
    expect(migration).toContain(
      "private_verification.brinesearch_v18_core_destination_release_receipt_active(\n          projection.pad_id",
    );
    expect(migration).toContain("set statement_timeout='12s'");
    expect(migration).toContain("set lock_timeout='500ms'");
    expect(migration).toContain(
      "grant execute on function public.brinesearch_v18_driver_pad_status(uuid)\n" +
      "to anon,authenticated,service_role;",
    );
    expect(migration).toContain(
      "grant execute on function\n" +
      "  public.brinesearch_v18_driver_core_destination_release(uuid)\n" +
      "to anon,authenticated,service_role;",
    );
    expect(migration).toContain(
      "revoke all on function\n" +
      "  private_verification.brinesearch_v18_public_pad_directions(uuid)\n" +
      "from public,anon,authenticated,service_role;",
    );
  });

  it("checks the same compact predicate bytes stored by the function bodies", () => {
    expect(migration).toContain(
      "pg_catalog.strpos(v_direction_definition,'directions.pad_id=detail.id')=0",
    );
    expect(migration).toContain(
      "pg_catalog.strpos(v_direction_definition,'detail.id=p_pad_id')=0",
    );
    expect(migration).toContain(
      "v_status_definition,'route_status=''route_ready'''",
    );
    expect(migration).toContain(
      "pg_catalog.strpos(v_status_definition,'stage=''ready''')=0",
    );
    expect(migration).not.toContain("directions.pad_id = detail.id");
    expect(migration).not.toContain("detail.id = p_pad_id");
    expect(migration).not.toContain("route_status = ''route_ready''");
    expect(migration).not.toContain("stage = ''ready''");
  });

  it("is schema-only and does not rewrite route, geometry, Google, cutover, or pad rows", () => {
    expect(migration).not.toMatch(/\binsert\s+into\b/i);
    expect(migration).not.toMatch(/\bupdate\s+(?:public|private_verification)\./i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+(?:public|private_verification)\./i);
    expect(migration).not.toMatch(/\btruncate\s+(?:table\s+)?(?:public|private_verification)\./i);
    expect(migration).not.toMatch(/\b(?:alter|drop)\s+table\b/i);
    expect(migration).not.toContain("brinesearch_issue97_activate");
    expect(migration).not.toContain("brinesearch_publish_google");
    expect(migration).not.toContain("set cutover_at");
    expect(migration).not.toContain(
      "create or replace function\n  public.brinesearch_v18_driver_pad_status_with_google_handoff",
    );
    expect(migration).not.toContain(
      "create or replace function\n  public.brinesearch_v18_driver_pad_status_with_named_approaches",
    );
  });
});
