-- GitHub #97 — Phase 1 release gate and explicit draft-geometry guards.
--
-- This migration does not activate cutover. It makes three contracts explicit:
--   1. published-route Google generation must reject draft/version-0 step geometry;
--   2. a held/unresolved route may never remain publicly route-ready; and
--   3. a single executable database gate can prove the active occurrence corpus is
--      exact-or-held and that authoritative route readiness is not being satisfied
--      by legacy or draft geometry.

create or replace function private_verification.brinesearch_issue97_refresh_google_route(
  p_pad_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_bad_published_geometry integer:=0;
begin
  select * into v_pad from public.pads where id=p_pad_id;
  if not found then raise exception 'Pad not found' using errcode='P0002'; end if;

  if coalesce(v_pad.structured_route_revision,0)>=1
     and v_pad.road_sequence_status='owner_verified'
     and exists(
       select 1
       from public.brinesearch_pad_roads pr
       where pr.pad_id=p_pad_id
         and pr.route_group='primary'
         and pr.route_variant_index=0
     ) then
    select count(*)::integer into v_bad_published_geometry
    from public.brinesearch_pad_roads pr
    where pr.pad_id=p_pad_id
      and pr.route_group='primary'
      and pr.route_variant_index=0
      and (
        pr.route_revision is distinct from v_pad.structured_route_revision
        or coalesce(pr.geometry_version,0)<1
        or pr.step_geometry is null
        or pr.geometry_source is distinct from 'road_manager_clip_issue69'
        or pr.geometry_status is distinct from 'snapped_intersections'
        or nullif(pr.road_geometry_digest,'') is null
      );

    if v_bad_published_geometry>0 then
      return private_verification.brinesearch_issue97_hold_google_route(
        p_pad_id,
        v_pad.structured_route_revision,
        'published_route_contains_draft_or_stale_geometry',
        pg_catalog.jsonb_build_object(
          'manifest_mode','published_route',
          'bad_step_count',v_bad_published_geometry,
          'requires_geometry_version_at_least',1,
          'no_guess',true
        )
      );
    end if;

    return private_verification.brinesearch_issue97_refresh_google_route_published_core(p_pad_id);
  end if;

  return private_verification.brinesearch_issue97_refresh_google_route_transition(p_pad_id);
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route(uuid)
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_google_route_current(
  p_pad_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_mode text;
  v_pad record;
begin
  if not public.brinesearch_issue97_cutover_active() then return false; end if;

  select * into v_pad from public.pads where id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return false; end if;

  select coalesce(r.evidence->>'manifest_mode','published_route')
  into v_mode
  from private_verification.brinesearch_google_route_receipts_issue97 r
  where r.pad_id=p_pad_id;

  if v_mode='transition_geometry' then
    return private_verification.brinesearch_issue97_transition_google_current(p_pad_id);
  end if;

  if v_mode is null or v_mode<>'published_route' then return false; end if;

  if not exists(
    select 1
    from public.brinesearch_pad_roads pr
    where pr.pad_id=p_pad_id
      and pr.route_group='primary'
      and pr.route_variant_index=0
      and pr.route_revision=v_pad.structured_route_revision
  ) then return false; end if;

  if exists(
    select 1
    from public.brinesearch_pad_roads pr
    where pr.pad_id=p_pad_id
      and pr.route_group='primary'
      and pr.route_variant_index=0
      and (
        pr.route_revision is distinct from v_pad.structured_route_revision
        or coalesce(pr.geometry_version,0)<1
        or pr.step_geometry is null
        or pr.geometry_source is distinct from 'road_manager_clip_issue69'
        or pr.geometry_status is distinct from 'snapped_intersections'
        or nullif(pr.road_geometry_digest,'') is null
      )
  ) then return false; end if;

  return public.brinesearch_issue97_google_route_current_published_core(p_pad_id);
end
$$;

revoke all on function public.brinesearch_issue97_google_route_current(uuid)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_google_route_current(uuid)
to service_role;

create or replace function private_verification.brinesearch_issue97_phase1_release_gate()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_active_steps integer:=0;
  v_missing_occurrence_receipts integer:=0;
  v_invalid_occurrence_disposition integer:=0;
  v_bad_resolved_identity integer:=0;
  v_route_ready_geometry_mismatch integer:=0;
  v_legacy_geometry_count_leak integer:=0;
  v_draft_route_ready integer:=0;
  v_held_public_rows integer:=0;
  v_public_rows_not_current integer:=0;
  v_pass boolean:=false;
begin
  with active_steps as (
    select s.id
    from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep p on p.id=s.route_prep_id
    where p.active
  )
  select
    count(*)::integer,
    count(*) filter(where r.route_prep_step_id is null)::integer,
    count(*) filter(where r.route_prep_step_id is not null
      and r.resolution_status not in ('resolved','held'))::integer
  into v_active_steps,v_missing_occurrence_receipts,v_invalid_occurrence_disposition
  from active_steps s
  left join private_verification.brinesearch_route_occurrence_receipts_issue97 r
    on r.route_prep_step_id=s.id;

  select count(*)::integer into v_bad_resolved_identity
  from private_verification.brinesearch_route_occurrence_receipts_issue97 r
  left join public.brinesearch_authoritative_road_identities i
    on i.id=r.identity_id and i.active
  left join public.brinesearch_road_identity_mappings m
    on m.identity_id=r.identity_id
    and m.road_id=r.canonical_road_id
    and m.mapping_status='verified'
  where r.resolution_status='resolved'
    and (
      r.identity_id is null
      or r.canonical_road_id is null
      or i.id is null
      or m.id is null
      or r.source_digest is distinct from i.source_digest
      or r.mapping_fingerprint is distinct from private_verification.brinesearch_issue97_mapping_fingerprint(r.identity_id)
      or not private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
    );

  select count(*)::integer into v_route_ready_geometry_mismatch
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
  where rr.route_status='route_ready'
    and rr.exact_geometry_count<>rr.road_occurrence_count;

  select count(*)::integer into v_legacy_geometry_count_leak
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
  where rr.exact_geometry_count<>
    (
      select count(*)
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
      join private_verification.brinesearch_route_occurrence_receipts_issue97 o
        on o.route_prep_step_id=g.route_prep_step_id
        and o.route_prep_id=g.route_prep_id
        and o.occurrence_index=g.occurrence_index
      where g.route_prep_id=rr.route_prep_id
        and g.status='resolved'
        and o.resolution_status='resolved'
        and g.identity_id=o.identity_id
        and g.road_id=o.canonical_road_id
    );

  select count(distinct p.id)::integer into v_draft_route_ready
  from public.pads p
  join public.brinesearch_pad_roads pr on pr.pad_id=p.id
  left join private_verification.brinesearch_google_route_receipts_issue97 gr on gr.pad_id=p.id
  where (
      p.brinesearch_google_route_status_issue97='ready'
      or gr.status='ready'
    )
    and pr.route_group='primary'
    and pr.route_variant_index=0
    and (
      pr.route_revision is distinct from p.structured_route_revision
      or coalesce(pr.geometry_version,0)<1
      or pr.step_geometry is null
      or pr.geometry_source is distinct from 'road_manager_clip_issue69'
      or pr.geometry_status is distinct from 'snapped_intersections'
      or nullif(pr.road_geometry_digest,'') is null
    );

  select count(*)::integer into v_held_public_rows
  from private_verification.brinesearch_google_route_receipts_issue97 gr
  join public.brinesearch_driver_google_routes_public pub on pub.pad_id=gr.pad_id
  where gr.status in ('held','stale');

  select count(*)::integer into v_public_rows_not_current
  from public.brinesearch_driver_google_routes_public pub
  where public.brinesearch_issue97_cutover_active()
    and not public.brinesearch_issue97_google_route_current(pub.pad_id);

  v_pass:=
    v_missing_occurrence_receipts=0
    and v_invalid_occurrence_disposition=0
    and v_bad_resolved_identity=0
    and v_route_ready_geometry_mismatch=0
    and v_legacy_geometry_count_leak=0
    and v_draft_route_ready=0
    and v_held_public_rows=0
    and v_public_rows_not_current=0;

  return pg_catalog.jsonb_build_object(
    'pass',v_pass,
    'cutover_active',public.brinesearch_issue97_cutover_active(),
    'active_route_occurrences',v_active_steps,
    'missing_occurrence_receipts',v_missing_occurrence_receipts,
    'invalid_occurrence_disposition',v_invalid_occurrence_disposition,
    'bad_resolved_identity',v_bad_resolved_identity,
    'route_ready_geometry_mismatch',v_route_ready_geometry_mismatch,
    'legacy_geometry_count_leak',v_legacy_geometry_count_leak,
    'draft_geometry_route_ready',v_draft_route_ready,
    'held_or_stale_public_rows',v_held_public_rows,
    'public_rows_not_current',v_public_rows_not_current
  );
end
$$;

create or replace function private_verification.brinesearch_issue97_assert_phase1_release_gate()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  v_result:=private_verification.brinesearch_issue97_phase1_release_gate();
  if coalesce((v_result->>'pass')::boolean,false) is not true then
    raise exception 'Issue #97 Phase 1 release gate failed: %',v_result;
  end if;
  return v_result;
end
$$;

revoke all on function private_verification.brinesearch_issue97_phase1_release_gate()
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_assert_phase1_release_gate()
from public,anon,authenticated,service_role;

-- Migration-time invariants. These prove the guard functions installed exactly
-- where the runtime dispatcher/currentness decision occurs without enabling cutover.
do $issue97_phase1_install_assertions$
declare
  v_refresh text;
  v_current text;
  v_gate text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route(uuid)'::pg_catalog.regprocedure
  ) into v_refresh;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_google_route_current(uuid)'::pg_catalog.regprocedure
  ) into v_current;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_phase1_release_gate()'::pg_catalog.regprocedure
  ) into v_gate;

  if v_refresh not like '%coalesce(pr.geometry_version,0)<1%'
     or v_refresh not like '%published_route_contains_draft_or_stale_geometry%'
     or v_current not like '%coalesce(pr.geometry_version,0)<1%'
     or v_gate not like '%missing_occurrence_receipts%'
     or v_gate not like '%legacy_geometry_count_leak%'
  then
    raise exception 'Issue #97 Phase 1 release contracts did not install cleanly';
  end if;
end
$issue97_phase1_install_assertions$;
