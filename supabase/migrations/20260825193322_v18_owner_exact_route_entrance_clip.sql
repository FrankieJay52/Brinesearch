-- V18 owner selected-pad route display: exact shared trunks and verified
-- entrance termination only. This migration changes display projection code;
-- it does not change pad, road, route, graph, restriction, Google, or cutover
-- authority data.

do $guard$
begin
  if pg_catalog.to_regprocedure(
    'private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)'
  ) is not null then
    raise exception 'V18 owner exact-route viewport base already exists';
  end if;
end
$guard$;

-- Preserve the reviewed Issue #108 endpoint-display merger as a private base.
-- The new public edge below is the only executable owner RPC.
alter function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) set schema private_verification;

alter function private_verification.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) rename to brinesearch_owner_map_viewport_endpoint_base_20260825;

revoke all on function private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) from public,anon,authenticated,service_role;

create function public.owner_approved_routes_map_viewport(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_zoom integer default 10,
  p_state text default null,
  p_county text default null,
  p_road_classes text[] default null,
  p_route_systems text[] default null,
  p_statuses text[] default null,
  p_search text default null,
  p_pad_id uuid default null,
  p_limit integer default 800
) returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_base jsonb;
  v_bbox extensions.geometry;
  v_limit integer:=greatest(25,least(coalesce(p_limit,800),800));
  v_zoom integer:=greatest(0,least(coalesce(p_zoom,10),19));
  v_tol double precision;
  v_county text:=nullif(pg_catalog.btrim(p_county),'');
  v_search text:=nullif(pg_catalog.btrim(p_search),'');
  v_route_prep_id uuid;
  v_expected_occurrences integer;
  v_pad_latitude double precision;
  v_pad_longitude double precision;
  v_projection jsonb;
  v_result jsonb;
begin
  if not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'owner access required' using errcode='42501';
  end if;

  if p_west is null or p_south is null or p_east is null or p_north is null
     or p_west < -180 or p_east > 180
     or p_south < -85.05112878 or p_north > 85.05112878
     or p_west >= p_east or p_south >= p_north then
    raise exception 'invalid map bounds' using errcode='22023';
  end if;
  if p_state is not null
     and pg_catalog.upper(pg_catalog.btrim(p_state)) not in ('OH','WV','PA') then
    raise exception 'invalid state filter' using errcode='22023';
  end if;
  if pg_catalog.length(coalesce(v_search,'')) > 120
     or pg_catalog.length(coalesce(v_county,'')) > 100
     or coalesce(pg_catalog.array_length(p_road_classes,1),0) > 16
     or coalesce(pg_catalog.array_length(p_route_systems,1),0) > 12
     or coalesce(pg_catalog.array_length(p_statuses,1),0) > 8 then
    raise exception 'map filter is too large' using errcode='22023';
  end if;

  -- An unselected map remains the reviewed all-roads viewport. No road is
  -- route-focused merely because it is visible.
  if p_pad_id is null then
    v_base:=private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(
      p_west,p_south,p_east,p_north,p_zoom,p_state,p_county,p_road_classes,
      p_route_systems,p_statuses,p_search,p_pad_id,p_limit
    );
    return v_base||pg_catalog.jsonb_build_object(
      'focus_mode','all_roads',
      'focus_pad_id',null,
      'focus_terminates_at_pad',false
    );
  end if;

  -- A selected-pad response starts as a bounded marker-only envelope. This
  -- avoids running the broad identity viewport and the complete exact-route
  -- proof back-to-back. The old endpoint base is invoked later only when a
  -- held pad actually has a reviewed display-only endpoint receipt.
  select pg_catalog.jsonb_build_object(
    'type','FeatureCollection',
    'features','[]'::jsonb,
    'pads',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'pad_id',pad.id,'pad_name',pad.pad_name,'company',pad.company,
      'lat',pad.latitude,'lng',pad.longitude
    )) filter(where pad.id is not null),'[]'::jsonb),
    'truncated',false,
    'limit',v_limit,
    'zoom',v_zoom,
    'zoom_required',case when v_zoom<8 then 8 else null end
  ) into v_base
  from public.pads pad
  where pad.id=p_pad_id;

  if v_zoom<8 then
    return v_base||pg_catalog.jsonb_build_object(
      'focus_mode','held',
      'focus_pad_id',p_pad_id,
      'focus_terminates_at_pad',false
    );
  end if;

  if (p_east-p_west) > (case when v_zoom>=12 then 1.2 else 3.5 end)
     or (p_north-p_south) > (case when v_zoom>=12 then .9 else 2.5 end) then
    raise exception 'map bounds too large for zoom level' using errcode='22023';
  end if;

  v_bbox:=extensions.st_makeenvelope(p_west,p_south,p_east,p_north,4326);
  v_tol:=case
    when v_zoom>=16 then 0
    when v_zoom>=14 then .00001
    when v_zoom>=12 then .00004
    when v_zoom>=10 then .00012
    else .0003
  end;

  select route.id,receipt.road_occurrence_count,pad.latitude,pad.longitude
  into v_route_prep_id,v_expected_occurrences,v_pad_latitude,v_pad_longitude
  from public.brinesearch_route_prep route
  join public.pads pad on pad.id=route.pad_id
  join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    on receipt.route_prep_id=route.id and receipt.pad_id=route.pad_id
  where route.pad_id=p_pad_id and route.active
    and route.route_group='primary' and route.variant_index=1;

  -- This existing projection is the complete fail-closed route gate. It
  -- independently proves current exact occurrences, mappings, transitions,
  -- graph builds, receipt dependencies, contiguous geometry, verified GPS,
  -- and a terminal point within one meter of this pad entrance. A held route
  -- yields NULL and can never receive the teal route-focus property below.
  if found and v_expected_occurrences between 2 and 256 then
    v_projection:=private_verification.brinesearch_v18_exact_route_projection(
      v_route_prep_id,v_expected_occurrences
    );
  end if;

  -- A current restriction or held road-safety classification is a display
  -- revocation boundary even if an older exact-route receipt still satisfies
  -- its own dependency set. Never paint that occurrence teal. Candidate local
  -- roads may remain part of a separately proven exact route; restricted and
  -- held roads fail the entire selected-pad focus closed.
  if v_projection is not null and exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      on geometry.route_prep_id=occurrence.route_prep_id
      and geometry.route_prep_step_id=occurrence.route_prep_step_id
      and geometry.occurrence_index=occurrence.occurrence_index
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=occurrence.identity_id and identity.active
    join public.brinesearch_roads road
      on road.id=occurrence.canonical_road_id
    cross join lateral (
      select pg_catalog.count(distinct mapping.road_id)::integer verified_road_count
      from public.brinesearch_road_identity_mappings mapping
      where mapping.identity_id=occurrence.identity_id
        and mapping.mapping_status='verified'
    ) mapping_count
    where occurrence.route_prep_id=v_route_prep_id
      and occurrence.pad_id=p_pad_id
      and occurrence.route_group='primary' and occurrence.variant_index=1
      and occurrence.occurrence_index between 2 and v_expected_occurrences
      and occurrence.resolution_status='resolved'
      and occurrence.hold_reason is null
      and geometry.status='resolved' and geometry.hold_reason is null
      and geometry.occurrence_role='traveled'
      and geometry.identity_id=occurrence.identity_id
      and geometry.road_id=occurrence.canonical_road_id
      and (
        pg_catalog.lower(coalesce(identity.public_access_status,'held'))
          in ('private','nonpublic','non_public','blocked','restricted','prohibited')
        or pg_catalog.lower(coalesce(identity.drivable_status,'held'))
          in ('non_drivable','nondrivable','blocked','restricted','prohibited')
        or coalesce(road.low_bridge,false)
        or coalesce(road.weight_limit,false)
        or coalesce(road.construction,false)
        or coalesce(road.gate,false)
        or mapping_count.verified_road_count>1
        or pg_catalog.lower(coalesce(identity.public_access_status,'held'))<>'public'
        or pg_catalog.lower(coalesce(identity.drivable_status,'held'))<>'drivable'
        or coalesce(road.narrow,false)
        or coalesce(road.steep_grade,false)
        or coalesce(road.one_lane,false)
        or coalesce(road.seasonal,false)
        or (
          identity.road_class in ('interstate','us_route','state_route')
          and not (
            nullif(pg_catalog.btrim(identity.route_number),'') is not null
            and (
              (identity.road_class='interstate' and identity.route_system in ('1','IR'))
              or (identity.road_class='us_route' and identity.route_system in ('2','US'))
              or (identity.road_class='state_route' and identity.route_system in ('3','SR','PennDOT NLF'))
            )
          )
        )
      )
  ) then
    v_projection:=null;
  end if;

  if v_projection is null and exists(
    select 1
    from private_verification.brinesearch_owner_pad_road_display_receipts_issue108 receipt
    where receipt.pad_id=p_pad_id and receipt.active
  ) then
    v_base:=private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(
      p_west,p_south,p_east,p_north,p_zoom,p_state,p_county,p_road_classes,
      p_route_systems,p_statuses,p_search,p_pad_id,p_limit
    );
  end if;

  with endpoint_features as materialized (
    select item.feature||pg_catalog.jsonb_build_object(
      'properties',(item.feature->'properties')||pg_catalog.jsonb_build_object(
        'route_focus',false,
        'terminates_at_pad',true
      )
    ) feature
    from pg_catalog.jsonb_array_elements(coalesce(v_base->'features','[]'::jsonb)) item(feature)
    where item.feature#>>'{properties,display_boundary}'='pad_endpoint_projection'
  ), projected_occurrences as materialized (
    select occurrence.identity_id,occurrence.canonical_road_id,
      occurrence.occurrence_index,occurrence.driver_road_name,
      identity.display_name,identity.road_class,identity.route_system,
      identity.route_number,identity.state_code,identity.county_code,
      identity.county_name,identity.township,identity.municipality,
      identity.public_access_status,identity.drivable_status,
      identity.truck_status,identity.source_identity_key,
      dataset.source_agency,dataset.source_dataset,dataset.source_version,
      road.canonical_name,road.low_bridge,road.weight_limit,
      road.construction,road.gate,road.narrow,road.steep_grade,
      road.one_lane,road.seasonal,
      mapping_count.verified_road_count,
      geometry.step_geometry,
      occurrence.occurrence_index=v_expected_occurrences as terminal_occurrence,
      case when occurrence.occurrence_index=v_expected_occurrences then
        extensions.st_distance(
          extensions.st_endpoint(geometry.step_geometry)::extensions.geography,
          extensions.st_setsrid(extensions.st_makepoint(
            v_pad_longitude,v_pad_latitude
          ),4326)::extensions.geography
        )
      end endpoint_offset_m
    from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      on geometry.route_prep_id=occurrence.route_prep_id
      and geometry.route_prep_step_id=occurrence.route_prep_step_id
      and geometry.occurrence_index=occurrence.occurrence_index
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=occurrence.identity_id and identity.active
    join public.brinesearch_road_source_datasets dataset
      on dataset.id=identity.dataset_id and dataset.active
    join public.brinesearch_roads road
      on road.id=occurrence.canonical_road_id
    cross join lateral (
      select pg_catalog.count(distinct verified.road_id)::integer verified_road_count
      from public.brinesearch_road_identity_mappings verified
      where verified.identity_id=occurrence.identity_id
        and verified.mapping_status='verified'
    ) mapping_count
    cross join lateral (
      select v_projection#>'{geometry,features}'->(
        occurrence.occurrence_index-2
      ) projected_feature
    ) projected
    where v_projection is not null
      and occurrence.route_prep_id=v_route_prep_id
      and occurrence.pad_id=p_pad_id
      and occurrence.route_group='primary' and occurrence.variant_index=1
      and occurrence.occurrence_index between 2 and v_expected_occurrences
      and occurrence.resolution_status='resolved'
      and occurrence.hold_reason is null
      and geometry.status='resolved' and geometry.hold_reason is null
      and geometry.occurrence_role='traveled'
      and geometry.identity_id=occurrence.identity_id
      and geometry.road_id=occurrence.canonical_road_id
      and geometry.step_geometry is not null
      and exists(
        select 1 from public.brinesearch_road_identity_mappings mapping
        where mapping.identity_id=occurrence.identity_id
          and mapping.road_id=occurrence.canonical_road_id
          and mapping.mapping_status='verified'
      )
      and projected.projected_feature#>>'{properties,stepOrder}'=
        (occurrence.occurrence_index-1)::text
      and projected.projected_feature->'geometry'=
        extensions.st_asgeojson(geometry.step_geometry,9,0)::jsonb
      and geometry.step_geometry operator(extensions.&&) v_bbox
      and extensions.st_intersects(geometry.step_geometry,v_bbox)
      and (p_state is null or identity.state_code=pg_catalog.upper(pg_catalog.btrim(p_state)))
      and (v_county is null or identity.county_code=pg_catalog.upper(v_county)
        or identity.county_name ilike '%'||v_county||'%')
      and (coalesce(pg_catalog.array_length(p_road_classes,1),0)=0
        or identity.road_class=any(p_road_classes))
      and (coalesce(pg_catalog.array_length(p_route_systems,1),0)=0
        or identity.route_system=any(p_route_systems))
      and (
        v_search is null
        or identity.display_name ilike '%'||v_search||'%'
        or occurrence.driver_road_name ilike '%'||v_search||'%'
        or identity.source_identity_key ilike '%'||v_search||'%'
        or pg_catalog.concat_ws(' ',identity.route_system,identity.route_number)
          ilike '%'||v_search||'%'
        or identity.county_name ilike '%'||v_search||'%'
        or identity.township ilike '%'||v_search||'%'
        or identity.municipality ilike '%'||v_search||'%'
      )
  ), classified as materialized (
    select occurrence.*,
      case
        when pg_catalog.lower(coalesce(occurrence.public_access_status,'held'))
          in ('private','nonpublic','non_public','blocked','restricted','prohibited')
          then 'restricted'
        when pg_catalog.lower(coalesce(occurrence.drivable_status,'held'))
          in ('non_drivable','nondrivable','blocked','restricted','prohibited')
          then 'restricted'
        when coalesce(occurrence.low_bridge,false)
          or coalesce(occurrence.weight_limit,false)
          or coalesce(occurrence.construction,false)
          or coalesce(occurrence.gate,false) then 'restricted'
        when occurrence.verified_road_count>1 then 'held'
        when pg_catalog.lower(coalesce(occurrence.public_access_status,'held'))<>'public'
          or pg_catalog.lower(coalesce(occurrence.drivable_status,'held'))<>'drivable'
          then 'held'
        when coalesce(occurrence.narrow,false)
          or coalesce(occurrence.steep_grade,false)
          or coalesce(occurrence.one_lane,false)
          or coalesce(occurrence.seasonal,false) then 'held'
        when occurrence.road_class in ('interstate','us_route','state_route')
          and not (
            nullif(pg_catalog.btrim(occurrence.route_number),'') is not null
            and (
              (occurrence.road_class='interstate' and occurrence.route_system in ('1','IR'))
              or (occurrence.road_class='us_route' and occurrence.route_system in ('2','US'))
              or (occurrence.road_class='state_route' and occurrence.route_system in ('3','SR','PennDOT NLF'))
            )
          ) then 'held'
        when nullif(pg_catalog.btrim(occurrence.route_number),'') is not null
          and (
            (occurrence.road_class='interstate' and occurrence.route_system in ('1','IR'))
            or (occurrence.road_class='us_route' and occurrence.route_system in ('2','US'))
            or (occurrence.road_class='state_route' and occurrence.route_system in ('3','SR','PennDOT NLF'))
          ) then 'approved_by_policy'
        when occurrence.road_class in ('county','township','municipal','local')
          and occurrence.truck_status='official_truck_route'
          then 'explicitly_approved'
        else 'candidate'
      end approval_status
    from projected_occurrences occurrence
  ), filtered as materialized (
    select * from classified occurrence
    where coalesce(pg_catalog.array_length(p_statuses,1),0)=0
      or occurrence.approval_status=any(p_statuses)
  ), shapes as materialized (
    select occurrence.identity_id,
      extensions.st_collectionextract(
        extensions.st_collect(
          extensions.st_intersection(occurrence.step_geometry,v_bbox)
        ),2
      ) clipped_geometry,
      pg_catalog.count(*)::integer occurrence_count,
      pg_catalog.bool_or(occurrence.terminal_occurrence) terminates_at_pad,
      pg_catalog.max(occurrence.endpoint_offset_m) endpoint_offset_m
    from filtered occurrence
    group by occurrence.identity_id
  ), route_features as materialized (
    select metadata.identity_id,
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'geometry',extensions.st_asgeojson(
          case when v_tol=0 then shape.clipped_geometry
            else extensions.st_simplifypreservetopology(
              shape.clipped_geometry,v_tol
            )
          end,6
        )::jsonb,
        'properties',pg_catalog.jsonb_build_object(
          'identity_id',metadata.identity_id,
          'canonical_road_id',metadata.canonical_road_id,
          'display_name',metadata.driver_road_name,
          'canonical_name',metadata.canonical_name,
          'route_system',metadata.route_system,
          'route_number',metadata.route_number,
          'route_designation',nullif(pg_catalog.concat_ws(
            ' ',metadata.route_system,metadata.route_number
          ),''),
          'road_class',metadata.road_class,
          'state_code',metadata.state_code,
          'county_code',metadata.county_code,
          'county_name',metadata.county_name,
          'township',metadata.township,
          'municipality',metadata.municipality,
          'approval_status',metadata.approval_status,
          'source_current',true,
          'mapping_conflict',metadata.verified_road_count>1,
          'occurrence_count',shape.occurrence_count,
          'pad_count',1,
          'source_identity_key',metadata.source_identity_key,
          'source_agency',metadata.source_agency,
          'source_dataset',metadata.source_dataset,
          'source_version',metadata.source_version,
          'display_boundary','exact_route_occurrence',
          'endpoint_offset_m',case when shape.terminates_at_pad then
            pg_catalog.round(shape.endpoint_offset_m::numeric,3)
            else null end,
          'route_focus',true,
          'terminates_at_pad',shape.terminates_at_pad
        )
      ) feature
    from shapes shape
    join lateral (
      select occurrence.*
      from filtered occurrence
      where occurrence.identity_id=shape.identity_id
      order by occurrence.occurrence_index
      limit 1
    ) metadata on true
    where not extensions.st_isempty(shape.clipped_geometry)
      and extensions.st_dimension(shape.clipped_geometry)=1
  ), combined as materialized (
    select route.feature,0 sort_group,
      route.feature->'properties'->>'display_name' sort_name,
      route.identity_id::text sort_id
    from route_features route
    union all
    select endpoint.feature,1,
      endpoint.feature->'properties'->>'display_name',
      endpoint.feature->'properties'->>'identity_id'
    from endpoint_features endpoint
    where not exists(
      select 1 from route_features route
      where route.identity_id::text=
        endpoint.feature->'properties'->>'identity_id'
    )
  ), ranked as materialized (
    select combined.*,
      pg_catalog.row_number() over(
        order by combined.sort_group,combined.sort_name,combined.sort_id
      )::integer row_number,
      pg_catalog.count(*) over()::integer total_count
    from combined
  )
  select v_base||pg_catalog.jsonb_build_object(
    'features',coalesce(
      pg_catalog.jsonb_agg(ranked.feature order by ranked.row_number)
        filter(where ranked.row_number<=v_limit),
      '[]'::jsonb
    ),
    'truncated',coalesce(pg_catalog.max(ranked.total_count),0)>v_limit,
    'focus_mode',case
      when v_projection is not null then 'exact_route_ready'
      when pg_catalog.count(*) filter(
        where ranked.feature#>>'{properties,display_boundary}'=
          'pad_endpoint_projection'
      )>0 then 'display_evidence_only'
      else 'held'
    end,
    'focus_pad_id',p_pad_id,
    -- The exact projection proves the whole selected route terminates within
    -- one metre of this pad even when the current map window or filters do not
    -- include the terminal feature.
    'focus_terminates_at_pad',v_projection is not null
  ) into v_result
  from ranked;

  return coalesce(v_result,v_base||pg_catalog.jsonb_build_object(
    'features','[]'::jsonb,
    'truncated',false,
    'focus_mode',case
      when v_projection is not null then 'exact_route_ready'
      else 'held'
    end,
    'focus_pad_id',p_pad_id,
    'focus_terminates_at_pad',v_projection is not null
  ));
end
$$;

revoke all on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) from public,anon;
grant execute on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) to authenticated;

comment on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) is 'V18 owner-only bounded road viewport. Selected-pad teal focus is emitted only from a current exact route projection and exact occurrence geometry terminating at verified pad GPS. Held pads retain only real non-approved display evidence; viewing never changes authority.';

do $assert$
declare
  v_definition text;
  v_security_definer boolean;
  v_config text[];
begin
  select pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.pg_get_functiondef(proc.oid)),'\s+','','g'
    ),proc.prosecdef,proc.proconfig
  into v_definition,v_security_definer,v_config
  from pg_catalog.pg_proc proc
  where proc.oid='public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)'::pg_catalog.regprocedure;

  if not v_security_definer
     or not ('search_path=""'=any(v_config))
     or not ('statement_timeout=8s'=any(v_config))
     or pg_catalog.strpos(v_definition,'brinesearch_v18_exact_route_projection')=0
     or pg_catalog.strpos(v_definition,'''route_focus'',true')=0
     or pg_catalog.strpos(v_definition,'''display_boundary'',''exact_route_occurrence''')=0
     or pg_catalog.strpos(v_definition,'''focus_mode'',''all_roads''')=0
     or pg_catalog.strpos(v_definition,'geometry.step_geometry')=0
     or pg_catalog.strpos(v_definition,'occurrence.identity_id')=0
     or pg_catalog.strpos(v_definition,'ifv_projectionisnotnullandexists(')=0
     or pg_catalog.strpos(v_definition,'v_projection:=null')=0 then
    raise exception 'V18 owner exact-route viewport definition assertion failed';
  end if;

  if pg_catalog.to_regprocedure(
    'private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)'
  ) is null then
    raise exception 'V18 owner exact-route viewport private base is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'private_verification.brinesearch_owner_map_viewport_endpoint_base_20260825(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) then
    raise exception 'V18 owner exact-route viewport private base is executable';
  end if;

  if exists(
    select 1 from information_schema.routine_privileges privilege
    where privilege.routine_schema='public'
      and privilege.routine_name='owner_approved_routes_map_viewport'
      and privilege.grantee='PUBLIC'
      and privilege.privilege_type='EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) then
    raise exception 'V18 owner exact-route viewport execute grant assertion failed';
  end if;

  -- The real verification schema exposes gps_verified plus verified_at/by.
  -- This migration intentionally never references the nonexistent
  -- gps_verified_at column that broke the earlier evidence probe.
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='pad_verification_status'
      and column_name='gps_verified'
  ) or not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='pad_verification_status'
      and column_name='verified_at'
  ) then
    raise exception 'V18 pad verification schema assertion failed';
  end if;
end
$assert$;
