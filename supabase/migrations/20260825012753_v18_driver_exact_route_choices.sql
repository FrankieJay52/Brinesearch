-- V18 driver route choice contract.
--
-- A driver may choose among multiple routes only when every returned variant
-- independently passes the existing terminal route receipt, exact geometry,
-- active release-current graph, verified driver entrance, and public
-- projection gates. Held/candidate/stale variants are omitted. This function
-- does not approve a route, write route selection, generate Google output, or
-- expose private notes, receipts, IDs, or hold reasons.

create or replace function public.brinesearch_v18_driver_route_choices(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='4s'
set lock_timeout='500ms'
as $$
declare
  v_pad record;
  v_route public.brinesearch_route_prep%rowtype;
  v_receipt private_verification.brinesearch_route_reconciliation_receipts_issue97%rowtype;
  v_active_count integer:=0;
  v_expected_transitions integer:=0;
  v_transition_count integer:=0;
  v_resolved_transition_count integer:=0;
  v_graph_build_count integer:=0;
  v_graph_active boolean:=false;
  v_graph_current boolean:=false;
  v_graph_last_verified_at timestamptz;
  v_projection jsonb;
  v_choices jsonb:='[]'::jsonb;
begin
  select detail.id,detail.latitude,detail.longitude,
    coalesce(verification.gps_verified,false) gps_verified
  into v_pad
  from public.public_pad_detail detail
  left join public.pad_verification_status verification
    on verification.pad_id=detail.id
  where detail.id=p_pad_id;
  if not found then return null; end if;

  -- The selector is bounded. Ambiguous duplicate variant identities or an
  -- unexpectedly large route set make the complete response unavailable.
  select count(*)::integer into v_active_count
  from public.brinesearch_route_prep route
  where route.pad_id=p_pad_id and route.active
    and route.route_group in ('primary','alternate');
  if v_active_count>8 or exists(
    select 1
    from public.brinesearch_route_prep route
    where route.pad_id=p_pad_id and route.active
      and route.route_group in ('primary','alternate')
    group by route.route_group,route.variant_index
    having count(*)<>1
  ) then
    return pg_catalog.jsonb_build_object('padId',p_pad_id,'choices','[]'::jsonb);
  end if;

  -- A saved/reference point never becomes a driver destination through this
  -- endpoint. Every selectable route requires the existing verified entrance.
  if not v_pad.gps_verified
     or v_pad.latitude is null or v_pad.longitude is null
     or v_pad.latitude not between 37 and 43
     or v_pad.longitude not between -84 and -74
     or (v_pad.latitude=0 and v_pad.longitude=0) then
    return pg_catalog.jsonb_build_object('padId',p_pad_id,'choices','[]'::jsonb);
  end if;

  for v_route in
    select route.*
    from public.brinesearch_route_prep route
    where route.pad_id=p_pad_id and route.active
      and route.route_group in ('primary','alternate')
      and (
        (route.route_group='primary' and route.variant_index=1)
        or (route.route_group='alternate' and route.variant_index between 2 and 8)
      )
    order by route.variant_index,route.id
  loop
    v_receipt:=null;
    select receipt.* into v_receipt
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id=v_route.id;
    if v_receipt.route_prep_id is null
       or v_receipt.route_status<>'route_ready'
       or v_receipt.stage<>'ready'
       or v_receipt.pad_id<>p_pad_id
       or v_receipt.route_group<>v_route.route_group
       or v_receipt.variant_index<>v_route.variant_index
       or v_receipt.source_sequence_hash<>v_route.source_sequence_hash
       or v_route.readiness_status<>'ready_for_road_matching'
       or pg_catalog.cardinality(v_receipt.exception_reasons)<>0
       or v_receipt.road_occurrence_count not between 2 and 256
       or v_receipt.resolved_occurrence_count<>v_receipt.road_occurrence_count
       or v_receipt.held_occurrence_count<>0
       or v_receipt.canonical_mapping_count<>v_receipt.road_occurrence_count
       or v_receipt.exact_geometry_count<>v_receipt.road_occurrence_count then
      continue;
    end if;

    v_expected_transitions:=v_receipt.road_occurrence_count-1;
    select count(*)::integer,
      count(*) filter(where transition.status='resolved')::integer
    into v_transition_count,v_resolved_transition_count
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    where transition.route_prep_id=v_route.id;
    if v_transition_count<>v_expected_transitions
       or v_resolved_transition_count<>v_expected_transitions then
      continue;
    end if;

    select count(*)::integer,
      coalesce(pg_catalog.bool_and(build.status='active'),false),
      coalesce(pg_catalog.bool_and(
        case when build.status='active' then
          private_verification.brinesearch_issue97_graph_build_release_current(build.id)
        else false end
      ),false),
      max(coalesce(build.activated_at,build.completed_at))
    into v_graph_build_count,v_graph_active,v_graph_current,
      v_graph_last_verified_at
    from (
      select distinct transition.graph_build_id
      from private_verification.brinesearch_route_transition_receipts_issue97 transition
      where transition.route_prep_id=v_route.id
        and transition.status='resolved'
        and transition.graph_build_id is not null
    ) graph_reference
    join public.brinesearch_road_graph_builds build
      on build.id=graph_reference.graph_build_id;
    if v_graph_build_count<1 or not v_graph_active or not v_graph_current
       or v_graph_last_verified_at is null then
      continue;
    end if;

    v_projection:=private_verification.brinesearch_v18_exact_route_projection(
      v_route.id,v_receipt.road_occurrence_count
    );
    if v_projection is null
       or pg_catalog.jsonb_typeof(v_projection->'steps')<>'array'
       or pg_catalog.jsonb_typeof(v_projection->'geometry')<>'object'
       or v_projection->'geometry'->>'type'<>'FeatureCollection'
       or pg_catalog.jsonb_typeof(v_projection->'geometry'->'features')<>'array'
       or pg_catalog.jsonb_array_length(v_projection->'steps')<>v_expected_transitions
       or pg_catalog.jsonb_array_length(v_projection->'geometry'->'features')<>v_expected_transitions then
      continue;
    end if;

    v_choices:=v_choices||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'routeKey',v_route.route_group||':'||v_route.variant_index::text,
        'routeGroup',v_route.route_group,
        'variantIndex',v_route.variant_index,
        'steps',v_projection->'steps',
        'geometry',v_projection->'geometry',
        'lastVerifiedAt',v_graph_last_verified_at,
        'statusRevision',pg_catalog.md5(pg_catalog.concat_ws('|',
          p_pad_id::text,v_route.route_group,v_route.variant_index::text,
          v_route.source_sequence_hash,coalesce(v_receipt.receipt_digest,''),
          pg_catalog.md5(v_projection::text),v_graph_last_verified_at::text
        ))
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object('padId',p_pad_id,'choices',v_choices);
exception when others then
  return pg_catalog.jsonb_build_object('padId',p_pad_id,'choices','[]'::jsonb);
end;
$$;

revoke all on function public.brinesearch_v18_driver_route_choices(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_driver_route_choices(uuid)
to anon,authenticated,service_role;

comment on function public.brinesearch_v18_driver_route_choices(uuid) is
  'Fail-closed V18 driver route variants. Returns only independently route-ready exact projections on active release-current graphs with a verified driver entrance; selection changes display only.';

do $assert$
declare
  v_function pg_catalog.pg_proc%rowtype;
  v_definition text;
begin
  select proc.* into strict v_function
  from pg_catalog.pg_proc proc
  where proc.oid='public.brinesearch_v18_driver_route_choices(uuid)'::pg_catalog.regprocedure;
  v_definition:=pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.pg_get_functiondef(v_function.oid)),'\s+','','g'
  );

  if not v_function.prosecdef or v_function.provolatile<>'s'
     or not (v_function.proconfig @> array[
       'search_path=""','statement_timeout=4s','lock_timeout=500ms'
     ]) then
    raise exception 'V18 driver route choices execution hardening assertion failed';
  end if;
  if pg_catalog.strpos(v_definition,'route_status<>''route_ready''')=0
     or pg_catalog.strpos(v_definition,'stage<>''ready''')=0
     or pg_catalog.strpos(v_definition,'brinesearch_issue97_graph_build_release_current')=0
     or pg_catalog.strpos(v_definition,'brinesearch_v18_exact_route_projection')=0
     or pg_catalog.strpos(v_definition,'gps_verified')=0 then
    raise exception 'V18 driver route choices authority assertion failed';
  end if;
  if pg_catalog.strpos(v_definition,'written_directions')>0
     or pg_catalog.strpos(v_definition,'owner_notes')>0
     or pg_catalog.strpos(v_definition,'google_route')>0 then
    raise exception 'V18 driver route choices private/publication isolation assertion failed';
  end if;
  if pg_catalog.has_function_privilege(
       'public','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_v18_driver_route_choices(uuid)','execute'
     ) then
    raise exception 'V18 driver route choices execute grant assertion failed';
  end if;
end
$assert$;
