-- BrineSearch V18 -- expose only the existing reviewed public directions
-- projection while structured route publication remains held.
--
-- This migration does not alter route authority, graph authority, Google
-- publication, route receipts, or directory snapshot data. It only repairs the
-- driver-status response so a held legacy route can display already-public,
-- reviewed directions instead of an empty card.

create or replace function public.brinesearch_v18_driver_pad_status(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='2500ms'
set lock_timeout='500ms'
as $$
declare
  v_pad record;
  v_route public.brinesearch_route_prep%rowtype;
  v_receipt private_verification.brinesearch_route_reconciliation_receipts_issue97%rowtype;
  v_route_count integer:=0;
  v_record_revision bigint;
  v_destination_available boolean:=false;
  v_has_legacy_sequence boolean:=false;
  v_public_written_directions text;
  v_public_directions_revision timestamptz;
  v_has_public_written_directions boolean:=false;
  v_has_legacy_directions boolean:=false;
  v_expected_transitions integer:=0;
  v_transition_count integer:=0;
  v_resolved_transition_count integer:=0;
  v_graph_build_count integer:=0;
  v_graph_active boolean:=false;
  v_graph_current boolean:=false;
  v_graph_counties text[]:='{}'::text[];
  v_graph_last_verified_at timestamptz;
  v_graph_state text:='unavailable';
  v_receipt_ready boolean:=false;
  v_route_exact boolean:=false;
  v_route_publishable boolean:=false;
  v_route_state text:='unavailable';
  v_route_source text:='none';
  v_public_google_exists boolean:=false;
  v_public_google_current boolean:=false;
  v_public_google_updated_at timestamptz;
  v_google_state text:='unavailable';
  v_google_reason text;
  v_public_google_status jsonb;
  v_public_projection jsonb;
  v_public_steps jsonb:='[]'::jsonb;
  v_public_geometry jsonb;
  v_status_revision text;
begin
  select
    detail.*,
    coalesce(verification.gps_verified,false) as gps_verified
  into v_pad
  from public.public_pad_detail detail
  left join public.pad_verification_status verification
    on verification.pad_id=detail.id
  where detail.id=p_pad_id;
  if not found then return null; end if;

  select row.record_revision into v_record_revision
  from public.brinesearch_directory_snapshot_rows_v18 row
  join public.brinesearch_directory_snapshots_v18 snapshot
    on snapshot.snapshot_id=row.snapshot_id and snapshot.publication_state='current'
  where row.pad_id=p_pad_id;
  v_record_revision:=coalesce(v_record_revision,greatest(
    1,pg_catalog.floor(extract(epoch from coalesce(
      v_pad.updated_at,v_pad.created_at,pg_catalog.to_timestamp(0)
    ))*1000000)::bigint
  ));

  select directions.directions_clear,directions.source_revision
  into v_public_written_directions,v_public_directions_revision
  from public.brinesearch_driver_directions_public directions
  where directions.pad_id=p_pad_id
  limit 1;
  v_public_written_directions:=nullif(
    pg_catalog.btrim(coalesce(v_public_written_directions,'')),'')
  ;
  v_has_public_written_directions:=v_public_written_directions is not null;

  v_destination_available:=v_pad.gps_verified
    and v_pad.latitude is not null and v_pad.longitude is not null
    and v_pad.latitude between 37 and 43
    and v_pad.longitude between -84 and -74
    and not (v_pad.latitude=0 and v_pad.longitude=0);
  v_has_legacy_sequence:=nullif(
    pg_catalog.btrim(coalesce(v_pad.structured_road_sequence,'')),'') is not null;
  v_has_legacy_directions:=
    v_has_legacy_sequence or v_has_public_written_directions;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep route
  where route.pad_id=p_pad_id and route.active and route.route_group='primary';
  if v_route_count=1 then
    select route.* into v_route
    from public.brinesearch_route_prep route
    where route.pad_id=p_pad_id and route.active and route.route_group='primary'
    limit 1;
    select receipt.* into v_receipt
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    where receipt.route_prep_id=v_route.id;
  end if;

  if v_receipt.route_prep_id is not null then
    v_expected_transitions:=greatest(v_receipt.road_occurrence_count-1,0);
    select
      count(*)::integer,
      count(*) filter(where transition.status='resolved')::integer
    into v_transition_count,v_resolved_transition_count
    from private_verification.brinesearch_route_transition_receipts_issue97 transition
    where transition.route_prep_id=v_route.id;

    select
      count(*)::integer,
      coalesce(pg_catalog.bool_and(build.status='active'),false),
      coalesce(pg_catalog.bool_and(
        case when build.status='active' then
          private_verification.brinesearch_issue97_graph_build_release_current(build.id)
        else false end
      ),false),
      coalesce(pg_catalog.array_agg(
        distinct build.county_name order by build.county_name
      ),
        '{}'::text[]),
      max(coalesce(build.activated_at,build.completed_at))
    into v_graph_build_count,v_graph_active,v_graph_current,
      v_graph_counties,v_graph_last_verified_at
    from (
      select distinct transition.graph_build_id
      from private_verification.brinesearch_route_transition_receipts_issue97 transition
      where transition.route_prep_id=v_route.id
        and transition.graph_build_id is not null
    ) graph_reference
    join public.brinesearch_road_graph_builds build
      on build.id=graph_reference.graph_build_id;

    if v_expected_transitions<1 then
      v_graph_state:='unavailable';
    elsif v_transition_count<>v_expected_transitions
       or v_resolved_transition_count<>v_expected_transitions
       or v_graph_build_count<1 then
      v_graph_state:='held';
    elsif not v_graph_active or not v_graph_current then
      v_graph_state:='stale';
    else
      v_graph_state:='active_current';
    end if;

    -- Counts alone never make a receipt current. The current active primary
    -- route and its receipt must still agree, and the receipt must explicitly
    -- be at the terminal route_ready/ready state with no exception reasons.
    v_receipt_ready:=v_receipt.route_status='route_ready'
      and v_receipt.stage='ready'
      and v_receipt.pad_id=p_pad_id
      and v_receipt.route_group='primary'
      and v_receipt.variant_index=1
      and v_receipt.source_sequence_hash=v_route.source_sequence_hash
      and v_route.readiness_status='ready_for_road_matching'
      and pg_catalog.cardinality(v_receipt.exception_reasons)=0;
    v_route_exact:=v_receipt_ready
      and v_receipt.road_occurrence_count between 2 and 256
      and v_receipt.resolved_occurrence_count=v_receipt.road_occurrence_count
      and v_receipt.held_occurrence_count=0
      and v_receipt.canonical_mapping_count=v_receipt.road_occurrence_count
      and v_receipt.exact_geometry_count=v_receipt.road_occurrence_count;
  end if;

  if v_route_exact and v_graph_state='active_current'
     and v_destination_available then
    v_public_projection:=
      private_verification.brinesearch_v18_exact_route_projection(
        v_route.id,v_receipt.road_occurrence_count
      );
    if v_public_projection is not null then
      v_route_publishable:=true;
      v_route_state:='ready';
      v_route_source:='exact_graph';
      v_public_steps:=v_public_projection->'steps';
      v_public_geometry:=v_public_projection->'geometry';
    else
      v_route_state:='held';
      v_route_source:=case when v_has_legacy_directions then 'legacy_written'
        when v_destination_available then 'destination_only' else 'none' end;
    end if;
  elsif v_receipt.route_prep_id is not null
     and (v_receipt.route_status='stale' or v_graph_state='stale') then
    v_route_state:='stale';
    v_route_source:=case when v_has_legacy_directions then 'legacy_written'
      when v_destination_available then 'destination_only' else 'none' end;
  elsif v_receipt.route_prep_id is not null or v_route_count>0 then
    v_route_state:='held';
    v_route_source:=case when v_has_legacy_directions then 'legacy_written'
      when v_destination_available then 'destination_only' else 'none' end;
  elsif v_has_legacy_directions then
    v_route_state:='written_only';
    v_route_source:='legacy_written';
  elsif v_destination_available then
    v_route_source:='destination_only';
  end if;

  select exists(
    select 1 from public.brinesearch_driver_google_routes_public route
    where route.pad_id=p_pad_id
  ),max(route.source_revision)
  into v_public_google_exists,v_public_google_updated_at
  from public.brinesearch_driver_google_routes_public route
  where route.pad_id=p_pad_id;
  v_public_google_current:=public.brinesearch_issue97_google_route_current(p_pad_id);

  v_public_google_status:=
    private_verification.brinesearch_v18_public_google_status(
      v_public_google_current,v_public_google_exists,
      v_route_state,v_graph_state
    );
  v_google_state:=v_public_google_status->>'publicState';
  v_google_reason:=v_public_google_status->>'safeReason';

  v_status_revision:=pg_catalog.md5(pg_catalog.concat_ws('|',
    p_pad_id::text,v_record_revision::text,v_route_state,v_route_source,
    v_graph_state,pg_catalog.array_to_string(v_graph_counties,','),
    coalesce(v_graph_last_verified_at::text,''),v_google_state,
    coalesce(v_public_google_updated_at::text,''),
    coalesce(case when v_route_source='legacy_written'
      then v_public_directions_revision::text else '' end,''),
    pg_catalog.md5(coalesce(case when v_route_source='legacy_written'
      then v_public_written_directions else '' end,'')),
    pg_catalog.md5(coalesce(v_public_projection::text,''))
  ));

  return pg_catalog.jsonb_build_object(
    'padId',p_pad_id,
    'recordRevision',v_record_revision::text,
    'statusRevision',v_status_revision,
    'route',pg_catalog.jsonb_build_object(
      'state',v_route_state,
      'source',v_route_source,
      'steps',case
        when v_route_publishable
          then v_public_steps
        else '[]'::jsonb
      end,
      'geometry',case
        when v_route_publishable
          then v_public_geometry
        else null
      end,
      -- Only the existing reviewed public projection is returned. Private or
      -- unreviewed direction fields remain outside the V18 driver contract.
      'writtenDirections',case
        when v_route_source='legacy_written'
          and v_route_state in ('written_only','held','stale')
        then v_public_written_directions
        else null
      end,
      'lastVerifiedAt',case
        when v_route_state='ready' then v_graph_last_verified_at
        else null
      end
    ),
    'graph',pg_catalog.jsonb_build_object(
      'state',v_graph_state,
      'county',case when pg_catalog.cardinality(v_graph_counties)=1
        then v_graph_counties[1] else null end,
      'counties',pg_catalog.to_jsonb(v_graph_counties),
      'graphCount',v_graph_build_count,
      'publicSource',case when v_graph_build_count>0
        then 'BrineSearch authoritative graph' else null end,
      'lastVerifiedAt',v_graph_last_verified_at
    ),
    'google',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'publicState',v_google_state,
      'safeReason',v_google_reason,
      'lastVerifiedAt',v_public_google_updated_at
    )),
    'destination',case when v_destination_available then
      pg_catalog.jsonb_build_object(
        'available',true,'role','driver_entrance',
        'latitude',v_pad.latitude,'longitude',v_pad.longitude
      ) else pg_catalog.jsonb_build_object('available',false) end
  );
exception when others then
  return null;
end;
$$;

revoke all on function public.brinesearch_v18_driver_pad_status(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_driver_pad_status(uuid)
to anon,authenticated,service_role;

-- Compile-time and privilege assertions only. Production content is not
-- modified and no route, graph, or Google publication operation is invoked.
do $assert$
declare
  v_function pg_catalog.pg_proc%rowtype;
  v_probe_pad uuid;
  v_projection_text text;
  v_status jsonb;
begin
  select proc.* into strict v_function
  from pg_catalog.pg_proc proc
  where proc.oid='public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure;

  if not v_function.prosecdef
     or not (v_function.proconfig @> array[
       'search_path=',
       'statement_timeout=2500ms',
       'lock_timeout=500ms'
     ]) then
    raise exception 'V18 driver status function security/config contract changed';
  end if;

  if pg_catalog.has_function_privilege(
       'public','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_v18_driver_pad_status(uuid)','execute'
     ) then
    raise exception 'V18 driver status function grants changed';
  end if;

  select directions.pad_id,directions.directions_clear
  into v_probe_pad,v_projection_text
  from public.brinesearch_driver_directions_public directions
  where nullif(pg_catalog.btrim(coalesce(directions.directions_clear,'')),'')
    is not null
  order by directions.pad_id
  limit 1;

  if v_probe_pad is not null then
    v_status:=public.brinesearch_v18_driver_pad_status(v_probe_pad);
    if v_status is null then
      raise exception 'V18 driver status probe returned null';
    end if;
    if v_status#>>'{route,source}'='legacy_written'
       and v_status#>>'{route,state}' in ('written_only','held','stale')
       and v_status#>>'{route,writtenDirections}' is distinct from
         pg_catalog.btrim(v_projection_text) then
      raise exception 'V18 reviewed public directions were not returned';
    end if;
    if v_status#>>'{google,publicState}'='ready'
       and v_status#>>'{route,state}'<>'ready' then
      raise exception 'V18 Google gate opened without a ready route';
    end if;
  end if;
end;
$assert$;
