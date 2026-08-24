-- GitHub #97 — align the Phase 1 gate with the route-corpus road occurrence scope.
-- Full reconciliation processed 4,106 road occurrences, while the gate counted
-- 4,534 active prep steps. The extra 428 are non-road instruction/destination
-- steps and do not receive road-identity receipts. Use the exact same explicit
-- step-kind allowlist as brinesearch_issue97_reconcile_route_corpus().

do $issue97_patch_phase1_road_occurrence_scope$
declare
  v_definition text;
  v_old text:=E'    where p.active\n  )\n  select\n';
  v_new text:=E'    where p.active and s.active\n      and s.step_kind in (''interstate'',''us_route'',''state_route'',''county_road'',''township_road'',''local_road'',''private_segment'')\n  )\n  select\n';
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_phase1_release_gate()'::pg_catalog.regprocedure
  ) into v_definition;
  if pg_catalog.strpos(v_definition,v_new)>0 then return; end if;
  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception 'Issue #97 Phase 1 gate road-scope patch target not found';
  end if;
  if pg_catalog.strpos(pg_catalog.substr(v_definition,pg_catalog.strpos(v_definition,v_old)+1),v_old)>0 then
    raise exception 'Issue #97 Phase 1 gate road-scope patch target is not unique';
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_phase1_road_occurrence_scope$;

do $issue97_verify_phase1_road_occurrence_scope$
declare v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_phase1_release_gate()'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not like '%where p.active and s.active%s.step_kind in (%interstate%private_segment%' then
    raise exception 'Issue #97 Phase 1 gate road-occurrence scope did not install cleanly';
  end if;
end
$issue97_verify_phase1_road_occurrence_scope$;
