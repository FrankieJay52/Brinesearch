-- GitHub #97 — runtime hardening for automatic route transition receipts.
--
-- The transition migration deliberately uses a flexible PL/pgSQL record for a
-- resolved graph-anchor candidate because the selected tuple spans anchors,
-- junctions and graph-build provenance. Assigning bare NULL to an untyped
-- record fails at runtime before the first candidate is selected. Replace that
-- reset with a typed all-null tuple so every loop starts empty without carrying
-- stale candidate fields forward.
--
-- This is a guarded forward migration: production has not received #97 yet,
-- but the guard also makes the failure explicit if the underlying function
-- changes before this migration is applied.

do $issue97_transition_runtime_hardening$
declare
  v_definition text;
  v_old text:=
    'v_candidate_count:=0;v_candidate:=null;v_hold:=null;v_evidence:=''{}''::jsonb;';
  v_new text:=
    'select null::uuid as anchor_id,null::text as anchor_role,null::text as anchor_digest,null::extensions.geometry as geom,null::uuid as junction_id,null::text as junction_type,null::text as stable_junction_key,null::text as source_method,null::jsonb as source_provenance,null::text as graph_digest,null::uuid as build_id,null::text as source_revision_digest into v_candidate; v_candidate_count:=0;v_hold:=null;v_evidence:=''{}''::jsonb;';
begin
  select pg_catalog.pg_get_functiondef(p.oid)
  into strict v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private_verification'
    and p.proname='brinesearch_issue97_refresh_transition_receipts'
    and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_route_prep_id uuid';

  if pg_catalog.strpos(v_definition,v_old)=0 then
    raise exception
      'Issue #97 transition runtime hardening target is missing; review the transition function before migrating';
  end if;

  execute pg_catalog.replace(v_definition,v_old,v_new);

  select pg_catalog.pg_get_functiondef(p.oid)
  into strict v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private_verification'
    and p.proname='brinesearch_issue97_refresh_transition_receipts'
    and pg_catalog.pg_get_function_identity_arguments(p.oid)='p_route_prep_id uuid';

  if pg_catalog.strpos(v_definition,'v_candidate:=null')<>0
     or pg_catalog.strpos(v_definition,'null::uuid as anchor_id')=0
     or pg_catalog.strpos(v_definition,'null::extensions.geometry as geom')=0 then
    raise exception 'Issue #97 typed transition candidate reset did not install cleanly';
  end if;
end
$issue97_transition_runtime_hardening$;
