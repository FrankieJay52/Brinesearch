-- BrineSearch V18 -- keep reviewed saved directions alongside exact routes.
--
-- The route/graph/Google authority gates are intentionally unchanged.  This
-- migration only attaches the exact pad's already-public, sanitized direction
-- text to ready exact_graph and exact_graph_handoff status objects.  Four
-- current Ascent rows in the measured Ohio six-county scope have
-- written_directions but no directions_clear; only that fallback scope is
-- passed through the established Issue #81 public-direction sanitizer before
-- it enters this narrow contract.  No raw public.pads field is read here.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:v18:exact-route-saved-directions')
);

-- Preserve the two existing ready envelopes so the postflight can prove that
-- only the three saved-direction display fields changed. Status revisions stay
-- byte-stable because existing named-approach releases bind to those bytes.
create temporary table tmp_v18_exact_route_saved_directions_before
on commit drop
as
select
  public.brinesearch_v18_driver_pad_status(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  ) as exact_graph_status,
  public.brinesearch_v18_driver_core_destination_release(
    '518659d9-bca2-47b0-b294-3141ba679fc4'
  ) as exact_handoff_release,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
      pg_catalog.regprocedure
  )) as google_wrapper_digest,
  pg_catalog.md5(pg_catalog.pg_get_functiondef(
    'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'::
      pg_catalog.regprocedure
  )) as named_wrapper_digest;

-- One private, invoker-rights selector centralizes the exact pad binding.  It
-- prefers the narrow public directions view.  The written-only fallback is
-- limited to Ascent's measured Ohio six-county scope, reads the synchronized
-- public projection (never public.pads), and sanitizes it before returning.
-- The raw value is not part of the return shape.
create or replace function
  private_verification.brinesearch_v18_public_pad_directions(p_pad_id uuid)
returns table(
  directions_clear text,
  direction_source text,
  source_revision timestamptz
)
language sql
stable
strict
security invoker
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
  select
    coalesce(sanitized.clear_value,sanitized.written_value) as directions_clear,
    case
      when sanitized.clear_value is not null then 'directions_clear'
      when sanitized.written_value is not null then 'written_directions'
      else null
    end as direction_source,
    case
      when sanitized.clear_value is not null then directions.source_revision
      when sanitized.written_value is not null then
        coalesce(detail.updated_at,detail.created_at)
      else null
    end as source_revision
  from public.public_pad_detail detail
  left join public.brinesearch_driver_directions_public directions
    on directions.pad_id=detail.id
  cross join lateral (
    select
      nullif(pg_catalog.btrim(coalesce(directions.directions_clear,'')),'')
        as clear_value,
      case
        when pg_catalog.upper(pg_catalog.btrim(detail.company))='ASCENT'
         and pg_catalog.upper(pg_catalog.btrim(detail.state)) in ('OH','OHIO')
         and pg_catalog.upper(pg_catalog.btrim(detail.county)) in (
           'BELMONT','GUERNSEY','HARRISON','JEFFERSON','MONROE','NOBLE'
         ) then private_verification.brinesearch_driver_safe_clear_v17330(
           detail.written_directions
         )
        else null
      end as written_value
  ) sanitized
  where detail.id=p_pad_id
$function$;

revoke all on function
  private_verification.brinesearch_v18_public_pad_directions(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_public_pad_directions(uuid) is
'Private exact-pad selector for already-public clear directions plus an Issue #81-sanitized public-projection written fallback limited to the measured Ascent Ohio six-county scope. It never reads public.pads or returns raw source text.';

create or replace function public.brinesearch_v18_driver_pad_status(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='12s'
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
  v_public_written_source text;
  v_public_directions_revision timestamptz;
  v_has_public_written_directions boolean:=false;
  v_expose_public_written_directions boolean:=false;
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

  select directions.directions_clear,directions.direction_source,
    directions.source_revision
  into v_public_written_directions,v_public_written_source,
    v_public_directions_revision
  from private_verification.brinesearch_v18_public_pad_directions(p_pad_id)
    directions;
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

  -- Direction text is display-only. Exact-route readiness remains governed by
  -- the unchanged route/receipt/graph/destination gates above.
  v_expose_public_written_directions:=v_has_public_written_directions and (
    (
      v_route_source='legacy_written'
      and v_route_state in ('written_only','held','stale')
    ) or (
      v_route_state='ready'
      and v_route_source in ('exact_graph','exact_graph_handoff')
    )
  );

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
    -- Preserve the established revision bytes. Named-approach releases bind to
    -- this value, so exact-ready display text is versioned separately below.
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
      'writtenDirections',case
        when v_expose_public_written_directions
          then v_public_written_directions
        else null
      end,
      'writtenDirectionsSource',case
        when v_expose_public_written_directions
          then v_public_written_source
        else null
      end,
      'writtenDirectionsSourceRevision',case
        when v_expose_public_written_directions
          then v_public_directions_revision
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

comment on function public.brinesearch_v18_driver_pad_status(uuid) is
'V18 anonymous-safe driver status. Exact route/graph/Google authority remains fail-closed; exact-pad Issue #81-sanitized saved directions may accompany legacy or ready exact routes as display text only. Twelve-second bounded execution budget covers cold exact graph-currentness checks.';

-- Immutable core-destination releases bypass the base status function. Keep
-- every receipt, geometry, and revocation predicate byte-for-byte equivalent,
-- and attach only the same exact-pad public direction projection.
create or replace function public.brinesearch_v18_driver_core_destination_release(
  p_pad_id uuid
)
returns jsonb
language sql
stable
strict
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
  select pg_catalog.jsonb_build_object(
    'padId',projection.pad_id,
    'recordRevision',projection.record_revision,
    'routeRevision',projection.route_revision,
    'releaseVersion',projection.release_version,
    'routeSteps',projection.route_steps,
    'routeGeometry',projection.route_geometry,
    'graphCounty',projection.graph_county,
    'graphLastVerifiedAt',projection.graph_last_verified_at,
    'destination',pg_catalog.jsonb_build_object(
      'available',true,'role','saved_pad_destination',
      'latitude',projection.destination_latitude,
      'longitude',projection.destination_longitude
    ),
    'handoff',projection.handoff,
    'dependencyDigest',projection.dependency_digest,
    'releaseDigest',projection.release_digest,
    'publishedAt',projection.published_at,
    'status',pg_catalog.jsonb_build_object(
      'padId',projection.pad_id,
      'recordRevision',projection.record_revision,
      -- Frozen named-approach rows bind to this exact release digest.
      'statusRevision',projection.release_digest,
      'route',pg_catalog.jsonb_build_object(
        'state','ready','source','exact_graph_handoff',
        'steps',projection.route_steps,
        'geometry',projection.route_geometry,
        'safeReason','Approved public-road core ends at the exact handoff; Google handles the separate saved-GPS destination leg, which is not an approved road.',
        'lastVerifiedAt',projection.published_at,
        'writtenDirections',public_direction.directions_clear,
        'writtenDirectionsSource',public_direction.direction_source,
        'writtenDirectionsSourceRevision',public_direction.source_revision
      ),
      'graph',pg_catalog.jsonb_build_object(
        'state','verified_release','county',projection.graph_county,
        'counties',pg_catalog.jsonb_build_array(projection.graph_county),
        'graphCount',1,'publicSource','BrineSearch immutable approved release',
        'lastVerifiedAt',projection.graph_last_verified_at
      ),
      'google',pg_catalog.jsonb_build_object(
        'publicState','ready',
        'safeReason','One reviewed handoff follows the exact approved road core, then uses the saved GPS as a destination only.'
      ),
      'destination',pg_catalog.jsonb_build_object(
        'available',true,'role','saved_pad_destination',
        'latitude',projection.destination_latitude,
        'longitude',projection.destination_longitude
      )
    )
  )
  from public.brinesearch_driver_core_destination_releases_public projection
  join private_verification.brinesearch_v18_core_destination_releases receipt
    on receipt.pad_id=projection.pad_id
   and receipt.record_revision=projection.record_revision
   and receipt.route_revision=projection.route_revision
   and receipt.release_version=projection.release_version
   and receipt.route_steps=projection.route_steps
   and receipt.route_geometry=projection.route_geometry
   and receipt.graph_county=projection.graph_county
   and receipt.graph_last_verified_at=projection.graph_last_verified_at
   and receipt.destination_latitude=projection.destination_latitude
   and receipt.destination_longitude=projection.destination_longitude
   and receipt.handoff=projection.handoff
   and receipt.dependency_digest=projection.dependency_digest
   and receipt.release_digest=projection.release_digest
   and receipt.verified_at=projection.published_at
   and receipt.revoked_at is null
  left join lateral
    private_verification.brinesearch_v18_public_pad_directions(projection.pad_id)
      public_direction on true
  where projection.pad_id=p_pad_id
    and private_verification.brinesearch_v18_core_destination_release_receipt_active(
          projection.pad_id
        )
$function$;

revoke all on function
  public.brinesearch_v18_driver_core_destination_release(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_driver_core_destination_release(uuid)
to anon,authenticated,service_role;

comment on function
  public.brinesearch_v18_driver_core_destination_release(uuid) is
'Returns one byte-identical reviewed exact-road-core plus saved-GPS destination release. Approved geometry ends at the on-road handoff; exact-pad sanitized saved directions are display text only and do not authorize the destination gap.';

do $assert$
declare
  v_before tmp_v18_exact_route_saved_directions_before%rowtype;
  v_status_proc pg_catalog.pg_proc%rowtype;
  v_core_proc pg_catalog.pg_proc%rowtype;
  v_direction_proc pg_catalog.pg_proc%rowtype;
  v_status_definition text;
  v_core_definition text;
  v_direction_definition text;
  v_exact_status jsonb;
  v_handoff_release jsonb;
  v_direction record;
  v_fallback record;
  v_fallback_count integer:=0;
begin
  select * into strict v_before
  from tmp_v18_exact_route_saved_directions_before;
  select * into strict v_status_proc from pg_catalog.pg_proc
  where oid='public.brinesearch_v18_driver_pad_status(uuid)'::
    pg_catalog.regprocedure;
  select * into strict v_core_proc from pg_catalog.pg_proc
  where oid='public.brinesearch_v18_driver_core_destination_release(uuid)'::
    pg_catalog.regprocedure;
  select * into strict v_direction_proc from pg_catalog.pg_proc
  where oid=
    'private_verification.brinesearch_v18_public_pad_directions(uuid)'::
      pg_catalog.regprocedure;

  v_status_definition:=pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_status_proc.oid)
  );
  v_core_definition:=pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_core_proc.oid)
  );
  v_direction_definition:=pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_direction_proc.oid)
  );

  if not v_status_proc.prosecdef or v_status_proc.provolatile<>'s'
     or v_status_proc.proisstrict
     or not (v_status_proc.proconfig @> array[
       'search_path=""','statement_timeout=12s','lock_timeout=500ms'
     ]::text[])
     or not v_core_proc.prosecdef or v_core_proc.provolatile<>'s'
     or not v_core_proc.proisstrict
     or not (v_core_proc.proconfig @> array[
       'search_path=""','statement_timeout=2s','lock_timeout=500ms'
     ]::text[])
     or v_direction_proc.prosecdef or v_direction_proc.provolatile<>'s'
     or not v_direction_proc.proisstrict
     or not (v_direction_proc.proconfig @> array[
       'search_path=""','statement_timeout=1s','lock_timeout=500ms'
     ]::text[]) then
    raise exception 'Exact-route saved-direction function metadata drifted';
  end if;

  if pg_catalog.has_function_privilege('public',v_status_proc.oid,'execute')
     or not pg_catalog.has_function_privilege('anon',v_status_proc.oid,'execute')
     or not pg_catalog.has_function_privilege(
          'authenticated',v_status_proc.oid,'execute'
        )
     or not pg_catalog.has_function_privilege(
          'service_role',v_status_proc.oid,'execute'
        )
     or pg_catalog.has_function_privilege('public',v_core_proc.oid,'execute')
     or not pg_catalog.has_function_privilege('anon',v_core_proc.oid,'execute')
     or not pg_catalog.has_function_privilege(
          'authenticated',v_core_proc.oid,'execute'
        )
     or not pg_catalog.has_function_privilege(
          'service_role',v_core_proc.oid,'execute'
        )
     or pg_catalog.has_function_privilege('public',v_direction_proc.oid,'execute')
     or pg_catalog.has_function_privilege('anon',v_direction_proc.oid,'execute')
     or pg_catalog.has_function_privilege(
          'authenticated',v_direction_proc.oid,'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',v_direction_proc.oid,'execute'
        ) then
    raise exception 'Exact-route saved-direction grants drifted';
  end if;

  if pg_catalog.strpos(v_direction_definition,'public.pads')<>0
     or pg_catalog.strpos(
          v_direction_definition,
          'public.brinesearch_driver_directions_public'
        )=0
     or pg_catalog.strpos(
          v_direction_definition,
          'private_verification.brinesearch_driver_safe_clear_v17330'
        )=0
     or pg_catalog.strpos(v_direction_definition,'directions.pad_id = detail.id')=0
     or pg_catalog.strpos(v_direction_definition,'detail.id = p_pad_id')=0
     or pg_catalog.strpos(
          v_status_definition,'route_status = ''route_ready'''
        )=0
     or pg_catalog.strpos(v_status_definition,'stage = ''ready''')=0
     or pg_catalog.strpos(
          v_status_definition,
          'private_verification.brinesearch_v18_exact_route_projection'
        )=0
     or pg_catalog.strpos(
          v_core_definition,
          'private_verification.brinesearch_v18_core_destination_release_receipt_active'
        )=0
     or pg_catalog.strpos(v_core_definition,'receipt.revoked_at is null')=0 then
    raise exception 'Exact-route saved-direction authority or sanitizer drifted';
  end if;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
         pg_catalog.regprocedure
     )) is distinct from v_before.google_wrapper_digest
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'::
         pg_catalog.regprocedure
     )) is distinct from v_before.named_wrapper_digest then
    raise exception 'Atomic driver wrappers changed';
  end if;

  v_exact_status:=public.brinesearch_v18_driver_pad_status(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  );
  select * into strict v_direction
  from private_verification.brinesearch_v18_public_pad_directions(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  );
  if v_direction.directions_clear is null
     or v_direction.direction_source is distinct from 'directions_clear'
     or v_direction.source_revision is null
     or v_exact_status#>>'{route,state}' is distinct from 'ready'
     or v_exact_status#>>'{route,source}' is distinct from 'exact_graph'
     or v_exact_status#>>'{route,writtenDirections}' is distinct from
          v_direction.directions_clear
     or v_exact_status#>>'{route,writtenDirectionsSource}' is distinct from
          v_direction.direction_source
     or (v_exact_status#>>'{route,writtenDirectionsSourceRevision}')::
          timestamptz is distinct from v_direction.source_revision
     or v_exact_status->>'statusRevision' is distinct from
          v_before.exact_graph_status->>'statusRevision'
     or (((v_exact_status-'statusRevision')#-
            '{route,writtenDirections}')#-
            '{route,writtenDirectionsSource}')#-
            '{route,writtenDirectionsSourceRevision}' is distinct from
        (((v_before.exact_graph_status-'statusRevision')#-
            '{route,writtenDirections}')#-
            '{route,writtenDirectionsSource}')#-
            '{route,writtenDirectionsSourceRevision}' then
    raise exception 'Exact graph saved directions changed route authority';
  end if;

  v_handoff_release:=public.brinesearch_v18_driver_core_destination_release(
    '518659d9-bca2-47b0-b294-3141ba679fc4'
  );
  select * into strict v_direction
  from private_verification.brinesearch_v18_public_pad_directions(
    '518659d9-bca2-47b0-b294-3141ba679fc4'
  );
  if v_direction.directions_clear is null
     or v_direction.direction_source is distinct from 'written_directions'
     or v_direction.source_revision is null
     or v_handoff_release#>>'{status,route,state}' is distinct from 'ready'
     or v_handoff_release#>>'{status,route,source}' is distinct from
          'exact_graph_handoff'
     or v_handoff_release#>>'{status,route,writtenDirections}' is distinct from
          v_direction.directions_clear
     or v_handoff_release#>>'{status,route,writtenDirectionsSource}' is distinct
          from v_direction.direction_source
     or (v_handoff_release#>>
          '{status,route,writtenDirectionsSourceRevision}')::timestamptz
          is distinct from v_direction.source_revision
     or v_handoff_release#>>'{status,statusRevision}' is distinct from
          v_handoff_release->>'releaseDigest'
     or v_handoff_release#>>'{status,statusRevision}' is distinct from
          v_before.exact_handoff_release#>>'{status,statusRevision}'
     or (((v_handoff_release#-'{status,statusRevision}')#-
            '{status,route,writtenDirections}')#-
            '{status,route,writtenDirectionsSource}')#-
            '{status,route,writtenDirectionsSourceRevision}' is distinct from
        (((v_before.exact_handoff_release#-'{status,statusRevision}')#-
            '{status,route,writtenDirections}')#-
            '{status,route,writtenDirectionsSource}')#-
            '{status,route,writtenDirectionsSourceRevision}' then
    raise exception 'Exact handoff saved directions changed release authority';
  end if;

  -- Prove all four measured Ascent six-county written-only rows use the
  -- sanitizer, remain bound to their own pad, and receive the fallback marker.
  for v_fallback in
    select
      detail.id,
      private_verification.brinesearch_driver_safe_clear_v17330(
        detail.written_directions
      ) as expected_clear,
      coalesce(detail.updated_at,detail.created_at) as expected_revision
    from public.public_pad_detail detail
    left join public.brinesearch_driver_directions_public directions
      on directions.pad_id=detail.id
    where nullif(
            pg_catalog.btrim(coalesce(directions.directions_clear,'')),''
          ) is null
      and pg_catalog.upper(pg_catalog.btrim(detail.company))='ASCENT'
      and pg_catalog.upper(pg_catalog.btrim(detail.state)) in ('OH','OHIO')
      and pg_catalog.upper(pg_catalog.btrim(detail.county)) in (
        'BELMONT','GUERNSEY','HARRISON','JEFFERSON','MONROE','NOBLE'
      )
      and pg_catalog.upper(pg_catalog.btrim(detail.pad_name)) in (
        'ABLE','EZEKIEL','LASSO','SHUGERT DADDY'
      )
      and private_verification.brinesearch_driver_safe_clear_v17330(
            detail.written_directions
          ) is not null
  loop
    v_fallback_count:=v_fallback_count+1;
    select * into strict v_direction
    from private_verification.brinesearch_v18_public_pad_directions(
      v_fallback.id
    );
    if v_direction.directions_clear is distinct from v_fallback.expected_clear
       or v_direction.direction_source is distinct from
            'written_directions'
       or v_direction.source_revision is distinct from
            v_fallback.expected_revision then
      raise exception 'Written-only direction fallback diverged for %',
        v_fallback.id;
    end if;
  end loop;
  if v_fallback_count<>4 then
    raise exception
      'Expected four Ascent six-county written-only direction rows, found %',
      v_fallback_count;
  end if;
end
$assert$;
