-- GitHub #97 — generate coordinate-only Google navigation manifests from the
-- exact route-corpus / transition / occurrence-geometry receipts when a route
-- has not yet been fully published through #69.
--
-- This does NOT weaken or replace the #69 structured-route publisher. #69
-- remains the only path that publishes complete traveled step geometry from an
-- explicit route entry boundary through the final route boundary. This layer
-- supports the proven mobile navigation product target: current location ->
-- first exact route transition -> every exact authoritative transition/shaping
-- anchor -> saved pad GPS. Any unresolved identity, ambiguous transition,
-- discontinuous geometry, stale source/graph receipt, or final pad endpoint not
-- on the ALREADY RESOLVED final canonical road holds the route. No road is ever
-- chosen by name similarity or nearest-road proximity.

-- Preserve the stricter fully-published implementation as callable cores.
alter function private_verification.brinesearch_issue97_refresh_google_route(uuid)
  rename to brinesearch_issue97_refresh_google_route_published_core;
alter function public.brinesearch_issue97_google_route_current(uuid)
  rename to brinesearch_issue97_google_route_current_published_core;
alter function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
  rename to brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core;

-- One dependency function is shared by the builder and the public-current
-- checker so the two cannot silently drift. NULL means the transition route is
-- not currently authoritative enough to publish/use.
create or replace function private_verification.brinesearch_issue97_transition_google_dependency(
  p_pad_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_route record;
  v_route_count integer;
  v_occ_count integer;
  v_geom_count integer;
  v_transition_count integer;
  v_safety jsonb;
  v_safety_digest text;
  v_source_dependency text;
  v_dependency text;
begin
  select * into v_pad from public.pads where id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return null; end if;
  if v_pad.latitude is null or v_pad.longitude is null
     or v_pad.latitude not between -90 and 90
     or v_pad.longitude not between -180 and 180 then return null; end if;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep
  where pad_id=p_pad_id and active and route_group='primary';
  if v_route_count<>1 then return null; end if;
  select * into v_route
  from public.brinesearch_route_prep
  where pad_id=p_pad_id and active and route_group='primary'
  limit 1;
  if v_route.readiness_status<>'ready_for_road_matching' then return null; end if;

  select count(*)::integer into v_occ_count
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  where o.route_prep_id=v_route.id;
  if v_occ_count<2 then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_receipts_issue97 o
    left join public.brinesearch_authoritative_road_identities i
      on i.id=o.identity_id and i.active
    left join public.brinesearch_road_identity_mappings m
      on m.identity_id=o.identity_id and m.road_id=o.canonical_road_id
      and m.mapping_status='verified'
    where o.route_prep_id=v_route.id and (
      o.resolution_status<>'resolved'
      or o.identity_id is null or o.canonical_road_id is null
      or i.id is null or m.id is null
      or o.mapping_fingerprint is distinct from public.brinesearch_issue97_road_mapping_fingerprint(o.canonical_road_id)
      or o.source_digest is distinct from i.source_digest
      or not public.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
    )
  ) then return null; end if;

  select count(*)::integer into v_geom_count
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
  where g.route_prep_id=v_route.id;
  if v_geom_count<>v_occ_count then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    join public.brinesearch_roads r on r.id=g.canonical_road_id
    where g.route_prep_id=v_route.id and (
      g.status<>'resolved'
      or g.road_geometry_digest is distinct from private_verification.brinesearch_issue97_road_geometry_digest(r.id)
      or (g.occurrence_index=1 and (
        g.geometry_kind<>'origin_anchor' or g.end_coordinate is null
      ))
      or (g.occurrence_index>1 and (
        g.geometry_kind<>'traveled' or g.step_geometry is null
        or g.start_coordinate is null or g.end_coordinate is null
        or not extensions.st_isvalid(g.step_geometry)
        or not extensions.st_issimple(g.step_geometry)
      ))
    )
  ) then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 a
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 b
      on b.route_prep_id=a.route_prep_id
      and b.occurrence_index=a.occurrence_index+1
    where a.route_prep_id=v_route.id
      and not extensions.st_dwithin(
        a.end_coordinate::extensions.geography,
        b.start_coordinate::extensions.geography,
        1
      )
  ) then return null; end if;
  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    where g.route_prep_id=v_route.id
      and g.occurrence_index=v_occ_count
      and g.status='resolved'
      and extensions.st_dwithin(
        g.end_coordinate::extensions.geography,
        extensions.st_setsrid(
          extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326
        )::extensions.geography,
        1
      )
  ) then return null; end if;

  select count(*)::integer into v_transition_count
  from private_verification.brinesearch_route_transition_receipts_issue97 t
  where t.route_prep_id=v_route.id;
  if v_transition_count<>v_occ_count-1 then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_transition_receipts_issue97 t
    where t.route_prep_id=v_route.id and (
      t.status<>'resolved'
      or t.coordinate is null or t.junction_id is null or t.anchor_id is null
      or t.graph_build_id is null or t.anchor_digest is null
      or t.graph_build_digest is null or t.source_revision_digest is null
      or not public.brinesearch_issue97_graph_build_sources_current(t.graph_build_id)
    )
  ) then return null; end if;

  -- Every traveled occurrence must still have the same current authoritative
  -- source generation as the exact identity receipt. This digest changes when a
  -- source scope advances even if the route text did not.
  select pg_catalog.string_agg(
    o.occurrence_index::text||':'||i.id::text||':'||coalesce(i.source_digest,'')||':'||
    scope.last_success_run_id::text||':'||coalesce(run.page_set_digest,''),
    '|' order by o.occurrence_index
  ) into v_source_dependency
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  join public.brinesearch_authoritative_road_identities i
    on i.id=o.identity_id and i.active
  join public.brinesearch_road_source_dataset_counties scope
    on scope.dataset_id=i.dataset_id
    and scope.state_code=i.state_code
    and scope.county_code=i.county_code
    and scope.active and scope.ingest_enabled
    and scope.last_success_run_id is not null
  join public.brinesearch_road_source_ingest_runs run
    on run.id=scope.last_success_run_id
    and run.status='succeeded' and run.coverage_complete
  where o.route_prep_id=v_route.id and o.occurrence_index>1
    and public.brinesearch_issue97_dataset_scope_current(
      i.dataset_id,i.state_code,i.county_code
    );
  if v_source_dependency is null then return null; end if;
  if (select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97 o
      where o.route_prep_id=v_route.id and o.occurrence_index>1)
     <>(select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97 o
        join public.brinesearch_authoritative_road_identities i on i.id=o.identity_id and i.active
        join public.brinesearch_road_source_dataset_counties scope
          on scope.dataset_id=i.dataset_id and scope.state_code=i.state_code and scope.county_code=i.county_code
          and scope.active and scope.ingest_enabled and scope.last_success_run_id is not null
        join public.brinesearch_road_source_ingest_runs run
          on run.id=scope.last_success_run_id and run.status='succeeded' and run.coverage_complete
        where o.route_prep_id=v_route.id and o.occurrence_index>1
          and public.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code))
  then return null; end if;

  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(p_pad_id);
  v_safety_digest:=pg_catalog.md5(coalesce(v_safety,'{}'::jsonb)::text);
  if coalesce((v_safety->>'has_hold')::boolean,false) then return null; end if;
  if private_verification.brinesearch_issue97_route_data_blocked(p_pad_id) then return null; end if;

  select pg_catalog.md5(pg_catalog.concat_ws('|',
    v_route.id::text,
    coalesce(v_route.source_sequence_hash,''),
    coalesce(v_route.source_revision::text,''),
    pg_catalog.round(v_pad.latitude::numeric,7)::text,
    pg_catalog.round(v_pad.longitude::numeric,7)::text,
    coalesce((select pg_catalog.string_agg(o.receipt_digest,'|' order by o.occurrence_index)
      from private_verification.brinesearch_route_occurrence_receipts_issue97 o
      where o.route_prep_id=v_route.id),''),
    coalesce((select pg_catalog.string_agg(g.receipt_digest,'|' order by g.occurrence_index)
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
      where g.route_prep_id=v_route.id),''),
    coalesce((select pg_catalog.string_agg(t.receipt_digest,'|' order by t.boundary_index)
      from private_verification.brinesearch_route_transition_receipts_issue97 t
      where t.route_prep_id=v_route.id),''),
    v_source_dependency,
    v_safety_digest
  )) into v_dependency;
  return v_dependency;
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_dependency(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_transition_google_current(
  p_pad_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_receipt record;
  v_dependency text;
begin
  if not public.brinesearch_issue97_cutover_active() then return false; end if;
  select * into v_pad from public.pads where id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return false; end if;
  if v_pad.brinesearch_google_route_status_issue97<>'ready' then return false; end if;

  select * into v_receipt
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  if not found or v_receipt.status<>'ready'
     or coalesce(v_receipt.evidence->>'manifest_mode','')<>'transition_geometry'
     or v_receipt.route_revision<1
     or v_receipt.route_revision<>v_pad.brinesearch_google_route_revision_issue97 then
    return false;
  end if;

  v_dependency:=private_verification.brinesearch_issue97_transition_google_dependency(p_pad_id);
  if v_dependency is null or v_receipt.dependency_digest is distinct from v_dependency then
    return false;
  end if;

  return v_receipt.manifest_digest is not null and exists(
    select 1
    from public.brinesearch_driver_google_routes_public pub
    where pub.pad_id=p_pad_id
      and pub.route_revision=v_receipt.route_revision
      and pg_catalog.md5(pub.manifest::text)=v_receipt.manifest_digest
      and coalesce(pub.manifest->>'manifest_mode','')='transition_geometry'
      and coalesce((pub.manifest->>'route_ready')::boolean,false)
      and coalesce(pub.manifest->>'dependency_digest','')=v_dependency
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_current(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_refresh_google_route_transition(
  p_pad_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_route record;
  v_route_count integer;
  v_occ_count integer;
  v_total_m numeric:=0;
  v_manifest jsonb;
  v_points jsonb;
  v_roads jsonb;
  v_dependency text;
  v_manifest_digest text;
  v_route_revision bigint;
  v_old_revision bigint;
  v_old_dependency text;
  v_safety jsonb;
  v_safety_digest text;
  v_now timestamptz:=pg_catalog.now();
  v_final_point extensions.geometry(Point,4326);
  v_point_count integer;
  v_source_digest text;
  v_graph_digest text;
  v_mapping_digest text;
begin
  select * into v_pad from public.pads where id=p_pad_id;
  if not found then raise exception 'Pad not found' using errcode='P0002'; end if;

  v_route_revision:=greatest(coalesce(v_pad.brinesearch_google_route_revision_issue97,0),1);
  if not public.brinesearch_issue97_cutover_active() then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'issue97_cutover_not_active',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','no_guess',true)
    );
  end if;
  if coalesce(v_pad.list_only,false) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'pad_not_in_current_route_scope',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','no_guess',true)
    );
  end if;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep
  where pad_id=p_pad_id and active and route_group='primary';
  if v_route_count<>1 then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,
      case when v_route_count=0 then 'active_primary_route_prep_missing'
           else 'multiple_active_primary_route_preps' end,
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','active_primary_count',v_route_count,'no_guess',true
      )
    );
  end if;
  select * into v_route
  from public.brinesearch_route_prep
  where pad_id=p_pad_id and active and route_group='primary'
  limit 1;

  v_dependency:=private_verification.brinesearch_issue97_transition_google_dependency(p_pad_id);
  if v_dependency is null then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'transition_route_dependencies_not_current_or_exact',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true
      )
    );
  end if;

  select count(*)::integer into v_occ_count
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  where o.route_prep_id=v_route.id;
  v_final_point:=extensions.st_setsrid(
    extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326
  );

  -- For each traveled occurrence, retain the current authoritative source
  -- generation and the exact source segments that come within one metre of the
  -- already-resolved exact occurrence geometry. These rows are provenance only;
  -- they never decide which road the occurrence represents.
  drop table if exists pg_temp.tmp_issue97_transition_google_sources;
  create temp table tmp_issue97_transition_google_sources on commit drop as
  select
    g.occurrence_index,g.route_prep_step_id,o.identity_id,o.canonical_road_id,
    i.dataset_id,i.state_code,i.county_code,i.source_identity_key,
    d.source_key,scope.last_success_run_id,
    run.page_set_digest as source_page_set_digest,
    g.step_geometry,
    pg_catalog.array_agg(distinct s.source_segment_key order by s.source_segment_key) as source_segment_keys,
    pg_catalog.md5(pg_catalog.string_agg(
      s.source_segment_key||':'||coalesce(s.source_digest,'')||':'||coalesce(s.source_record_id,''),
      '|' order by s.source_segment_key,s.id
    )) as source_segment_digest,
    extensions.st_unaryunion(extensions.st_collect(s.geom)) as source_geom
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
  join private_verification.brinesearch_route_occurrence_receipts_issue97 o
    on o.route_prep_id=g.route_prep_id and o.occurrence_index=g.occurrence_index
  join public.brinesearch_authoritative_road_identities i
    on i.id=o.identity_id and i.active
  join public.brinesearch_road_source_datasets d
    on d.id=i.dataset_id and d.active and d.topology_role in ('primary_network','supplemental_aliases')
  join public.brinesearch_road_source_dataset_counties scope
    on scope.dataset_id=i.dataset_id
    and scope.state_code=i.state_code and scope.county_code=i.county_code
    and scope.active and scope.ingest_enabled and scope.last_success_run_id is not null
  join public.brinesearch_road_source_ingest_runs run
    on run.id=scope.last_success_run_id and run.status='succeeded' and run.coverage_complete
  join public.brinesearch_authoritative_road_segments s
    on s.identity_id=i.id and s.dataset_id=i.dataset_id and s.active
    and extensions.st_dwithin(
      s.geom::extensions.geography,g.step_geometry::extensions.geography,1
    )
  where g.route_prep_id=v_route.id and g.occurrence_index>1 and g.status='resolved'
    and public.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
    and o.mapping_fingerprint=public.brinesearch_issue97_road_mapping_fingerprint(o.canonical_road_id)
    and o.source_digest=i.source_digest
  group by
    g.occurrence_index,g.route_prep_step_id,o.identity_id,o.canonical_road_id,
    i.dataset_id,i.state_code,i.county_code,i.source_identity_key,d.source_key,
    scope.last_success_run_id,run.page_set_digest,g.step_geometry;

  if (select count(*) from tmp_issue97_transition_google_sources)<>v_occ_count-1 then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'current_authoritative_source_chain_missing_for_traveled_occurrence',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,
        'expected',v_occ_count-1,
        'observed',(select count(*) from tmp_issue97_transition_google_sources),
        'no_guess',true
      )
    );
  end if;

  -- Require multiple checkpoints across every traveled occurrence to remain
  -- within one metre of the current source geometry. This detects a canonical
  -- line drifting to another parallel/nearby representation without ever using
  -- that proximity to choose a different road.
  if exists(
    select 1
    from tmp_issue97_transition_google_sources src
    where not (
      extensions.st_dwithin(
        src.source_geom::extensions.geography,
        extensions.st_startpoint(src.step_geometry)::extensions.geography,1
      )
      and extensions.st_dwithin(
        src.source_geom::extensions.geography,
        extensions.st_lineinterpolatepoint(src.step_geometry,0.25)::extensions.geography,1
      )
      and extensions.st_dwithin(
        src.source_geom::extensions.geography,
        extensions.st_lineinterpolatepoint(src.step_geometry,0.50)::extensions.geography,1
      )
      and extensions.st_dwithin(
        src.source_geom::extensions.geography,
        extensions.st_lineinterpolatepoint(src.step_geometry,0.75)::extensions.geography,1
      )
      and extensions.st_dwithin(
        src.source_geom::extensions.geography,
        extensions.st_endpoint(src.step_geometry)::extensions.geography,1
      )
    )
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'canonical_occurrence_not_covered_by_current_authoritative_source',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true
      )
    );
  end if;

  drop table if exists pg_temp.tmp_issue97_transition_google_path;
  create temp table tmp_issue97_transition_google_path on commit drop as
  with lengths as (
    select
      g.*,
      extensions.st_length(g.step_geometry::extensions.geography)::numeric as length_m
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    where g.route_prep_id=v_route.id and g.occurrence_index>1 and g.status='resolved'
  )
  select
    l.*,
    (sum(length_m) over(
      order by occurrence_index rows between unbounded preceding and current row
    )-length_m)::numeric as start_m,
    sum(length_m) over(
      order by occurrence_index rows between unbounded preceding and current row
    )::numeric as end_m
  from lengths l;
  select coalesce(max(end_m),0) into v_total_m
  from tmp_issue97_transition_google_path;

  drop table if exists pg_temp.tmp_issue97_transition_google_points;
  create temp table tmp_issue97_transition_google_points(
    sort_m numeric not null,
    tie_order integer not null,
    point jsonb not null
  ) on commit drop;

  -- The first control point is the first exact transition. Google may use the
  -- device location as the origin, but must enter the verified route here.
  insert into tmp_issue97_transition_google_points(sort_m,tie_order,point)
  select
    0,10,
    pg_catalog.jsonb_build_object(
      'kind','shape','shape_role','route_ingress',
      'latitude',extensions.st_y(q.snapped)::numeric,
      'longitude',extensions.st_x(q.snapped)::numeric,
      'occurrence_id',src.route_prep_step_id,
      'source_kind','authoritative_clipped_geometry',
      'source_segment_keys',pg_catalog.to_jsonb(src.source_segment_keys),
      'source_digest',src.source_segment_digest,
      'source_run_id',src.last_success_run_id,
      'source_page_set_digest',src.source_page_set_digest,
      'route_position_m',0,
      'distance_to_source_m',extensions.st_distance(
        q.snapped::extensions.geography,p.start_coordinate::extensions.geography
      )
    )
  from tmp_issue97_transition_google_path p
  join tmp_issue97_transition_google_sources src using(occurrence_index)
  cross join lateral (
    select extensions.st_closestpoint(
      src.source_geom,p.start_coordinate
    )::extensions.geometry(Point,4326) as snapped
  ) q
  where p.occurrence_index=2
    and extensions.st_dwithin(
      q.snapped::extensions.geography,p.start_coordinate::extensions.geography,1
    );

  if not exists(
    select 1 from tmp_issue97_transition_google_points
    where sort_m=0 and tie_order=10
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'route_ingress_not_on_current_authoritative_source_chain',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true
      )
    );
  end if;

  -- Add regular shaping points every 500 metres on longer traveled occurrences.
  -- Each point is snapped back to the SAME already-resolved authoritative source
  -- identity and discarded if the source is farther than one metre away.
  insert into tmp_issue97_transition_google_points(sort_m,tie_order,point)
  select
    c.route_position_m,20,
    pg_catalog.jsonb_build_object(
      'kind','shape','shape_role','intermediate',
      'latitude',extensions.st_y(c.snapped)::numeric,
      'longitude',extensions.st_x(c.snapped)::numeric,
      'occurrence_id',c.route_prep_step_id,
      'source_kind','authoritative_clipped_geometry',
      'source_segment_keys',pg_catalog.to_jsonb(c.source_segment_keys),
      'source_digest',c.source_segment_digest,
      'source_run_id',c.last_success_run_id,
      'source_page_set_digest',c.source_page_set_digest,
      'route_position_m',c.route_position_m,
      'distance_to_source_m',c.source_distance_m
    )
  from (
    select
      p.occurrence_index,p.route_prep_step_id,
      (p.start_m+gs.m)::numeric as route_position_m,
      src.source_segment_keys,src.source_segment_digest,
      src.last_success_run_id,src.source_page_set_digest,
      q.snapped,
      extensions.st_distance(
        q.snapped::extensions.geography,q.candidate::extensions.geography
      ) as source_distance_m
    from tmp_issue97_transition_google_path p
    join tmp_issue97_transition_google_sources src using(occurrence_index)
    cross join lateral generate_series(
      500::numeric,
      greatest(500::numeric,p.length_m-100),
      500::numeric
    ) gs(m)
    cross join lateral (
      select
        extensions.st_lineinterpolatepoint(
          p.step_geometry,gs.m/nullif(p.length_m,0)
        )::extensions.geometry(Point,4326) as candidate
    ) candidate_point
    cross join lateral (
      select
        candidate_point.candidate,
        extensions.st_closestpoint(
          src.source_geom,candidate_point.candidate
        )::extensions.geometry(Point,4326) as snapped
    ) q
    where p.length_m>700 and gs.m<p.length_m-100
  ) c
  where c.source_distance_m<=1;

  -- Exact transitions after the ingress. Shared segments preserve entry/exit
  -- roles and shared geometry evidence; they are never collapsed into a generic
  -- name-based point intersection.
  insert into tmp_issue97_transition_google_points(sort_m,tie_order,point)
  select
    p.end_m,30,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',case t.anchor_role
        when 'shared_start' then 'shared_entry'
        when 'shared_end' then 'shared_exit'
        else 'junction'
      end,
      'latitude',extensions.st_y(t.coordinate)::numeric,
      'longitude',extensions.st_x(t.coordinate)::numeric,
      'source_kind','authoritative_junction_anchor',
      'junction_id',t.junction_id,
      'anchor_id',t.anchor_id,
      'anchor_role',t.anchor_role,
      'graph_build_id',t.graph_build_id,
      'graph_build_digest',t.graph_build_digest,
      'anchor_digest',t.anchor_digest,
      'junction_stable_key',j.junction_key,
      'junction_type',j.junction_type,
      'shared_geometry_digest',case when j.shared_geometry is not null
        then pg_catalog.md5(extensions.st_asewkb(j.shared_geometry)) else null end,
      'shared_span_start',case when j.shared_geometry is not null
        then pg_catalog.jsonb_build_array(
          extensions.st_x(extensions.st_startpoint(j.shared_geometry)),
          extensions.st_y(extensions.st_startpoint(j.shared_geometry))
        ) else null end,
      'shared_span_end',case when j.shared_geometry is not null
        then pg_catalog.jsonb_build_array(
          extensions.st_x(extensions.st_endpoint(j.shared_geometry)),
          extensions.st_y(extensions.st_endpoint(j.shared_geometry))
        ) else null end,
      'route_position_m',p.end_m
    ))
  from private_verification.brinesearch_route_transition_receipts_issue97 t
  join tmp_issue97_transition_google_path p
    on p.occurrence_index=t.boundary_index
  join public.brinesearch_road_junctions j on j.id=t.junction_id
  where t.route_prep_id=v_route.id
    and t.boundary_index>=2
    and t.status='resolved';

  insert into tmp_issue97_transition_google_points(sort_m,tie_order,point)
  values(
    v_total_m+1,100,
    pg_catalog.jsonb_build_object(
      'kind','pad_destination',
      'latitude',v_pad.latitude,'longitude',v_pad.longitude,
      'pad_id',p_pad_id,'source_kind','saved_pad_gps',
      'route_position_m',v_total_m
    )
  );

  -- Drop rounded consecutive duplicates while always retaining the ingress and
  -- final pad destination.
  with ordered as (
    select
      sort_m,tie_order,point,
      pg_catalog.round((point->>'latitude')::numeric,7)::text||','||
      pg_catalog.round((point->>'longitude')::numeric,7)::text as point_key,
      lag(
        pg_catalog.round((point->>'latitude')::numeric,7)::text||','||
        pg_catalog.round((point->>'longitude')::numeric,7)::text
      ) over(order by sort_m,tie_order) as previous_key
    from tmp_issue97_transition_google_points
  )
  select
    pg_catalog.jsonb_agg(point order by sort_m,tie_order),
    count(*)::integer
  into v_points,v_point_count
  from ordered
  where previous_key is distinct from point_key
     or coalesce(point->>'shape_role','')='route_ingress'
     or coalesce(point->>'kind','')='pad_destination';

  if v_point_count<2
     or coalesce(v_points->0->>'kind','')<>'shape'
     or coalesce(v_points->0->>'shape_role','')<>'route_ingress'
     or coalesce(v_points->(v_point_count-1)->>'kind','')<>'pad_destination' then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'transition_google_manifest_control_points_invalid',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,
        'point_count',v_point_count,'no_guess',true
      )
    );
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'occurrence_index',o.occurrence_index,
      'road_id',o.canonical_road_id,
      'identity_id',o.identity_id,
      'display_name',o.driver_road_name,
      'aliases',o.valid_aliases,
      'turn_direction',s.turn_direction,
      'distance_miles',case when g.miles is not null
        then pg_catalog.round(g.miles::numeric,3) else null end
    )) order by o.occurrence_index
  ) into v_roads
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  left join public.brinesearch_route_prep_steps s on s.id=o.route_prep_step_id
  left join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    on g.route_prep_id=o.route_prep_id and g.occurrence_index=o.occurrence_index
  where o.route_prep_id=v_route.id;

  select pg_catalog.md5(pg_catalog.string_agg(
    src.occurrence_index::text||':'||src.source_segment_digest||':'||
    src.last_success_run_id::text||':'||coalesce(src.source_page_set_digest,''),
    '|' order by src.occurrence_index
  )) into v_source_digest
  from tmp_issue97_transition_google_sources src;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    t.graph_build_digest||':'||t.anchor_digest,
    '|' order by t.boundary_index
  ),'')) into v_graph_digest
  from private_verification.brinesearch_route_transition_receipts_issue97 t
  where t.route_prep_id=v_route.id;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    o.mapping_fingerprint,
    '|' order by o.occurrence_index
  ),'')) into v_mapping_digest
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  where o.route_prep_id=v_route.id;
  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(p_pad_id);
  v_safety_digest:=pg_catalog.md5(coalesce(v_safety,'{}'::jsonb)::text);

  select route_revision,dependency_digest
  into v_old_revision,v_old_dependency
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  if v_old_revision is not null and v_old_revision>0
     and v_old_dependency=v_dependency then
    v_route_revision:=v_old_revision;
  else
    v_route_revision:=greatest(
      coalesce(v_old_revision,0),
      coalesce(v_pad.brinesearch_google_route_revision_issue97,0),
      0
    )+1;
  end if;

  v_manifest:=pg_catalog.jsonb_build_object(
    'manifest_version','issue97-google-v1',
    'manifest_mode','transition_geometry',
    'route_ready',true,'status','ready',
    'pad_id',p_pad_id,
    'route_revision',v_route_revision,
    'source_revision',coalesce(v_route.source_revision,0),
    'route_prep_id',v_route.id,
    'origin_mode','current_location_until_route_ingress',
    'occurrence_count',v_occ_count,
    'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
    'driver_road_sequence',coalesce(v_roads,'[]'::jsonb),
    'points',v_points,
    'dependency_digest',v_dependency,
    'safety_digest',v_safety_digest,
    'provenance',pg_catalog.jsonb_build_object(
      'route_occurrences','exact authoritative identity receipts',
      'transitions','verified current #97 junction/anchor receipts',
      'geometry','canonical Road Manager occurrence geometry clipped between exact transition anchors',
      'shaping','same-identity current authoritative source segments within one meter',
      'destination','saved pad GPS on the already-resolved final canonical road within one meter',
      'manual_map_editor','review_exception_qa_only',
      'name_only_resolution',false,
      'nearest_road_resolution',false,
      'fuzzy_resolution',false
    )
  );
  v_manifest_digest:=pg_catalog.md5(v_manifest::text);

  insert into private_verification.brinesearch_google_route_receipts_issue97(
    pad_id,route_revision,status,hold_reason,manifest_digest,dependency_digest,
    source_revision_digest,graph_dependency_digest,mapping_dependency_digest,
    safety_digest,evidence,verified_at,updated_at
  ) values(
    p_pad_id,v_route_revision,'ready',null,v_manifest_digest,v_dependency,
    v_source_digest,v_graph_digest,v_mapping_digest,v_safety_digest,
    pg_catalog.jsonb_build_object(
      'manifest_mode','transition_geometry','route_prep_id',v_route.id,
      'point_count',v_point_count,'occurrence_count',v_occ_count,
      'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
      'no_guess',true,'full_issue69_publication',false
    ),
    v_now,v_now
  )
  on conflict(pad_id) do update set
    route_revision=excluded.route_revision,
    status='ready',hold_reason=null,
    manifest_digest=excluded.manifest_digest,
    dependency_digest=excluded.dependency_digest,
    source_revision_digest=excluded.source_revision_digest,
    graph_dependency_digest=excluded.graph_dependency_digest,
    mapping_dependency_digest=excluded.mapping_dependency_digest,
    safety_digest=excluded.safety_digest,
    evidence=excluded.evidence,
    verified_at=excluded.verified_at,
    updated_at=excluded.updated_at;

  insert into public.brinesearch_driver_google_routes_public(
    pad_id,legacy_id,route_revision,source_revision,manifest,verified_at,updated_at
  ) values(
    p_pad_id,v_pad.legacy_id,v_route_revision,coalesce(v_route.source_revision,0),
    v_manifest,v_now,v_now
  )
  on conflict(pad_id) do update set
    legacy_id=excluded.legacy_id,
    route_revision=excluded.route_revision,
    source_revision=excluded.source_revision,
    manifest=excluded.manifest,
    verified_at=excluded.verified_at,
    updated_at=excluded.updated_at;

  update public.pads set
    brinesearch_google_route_status_issue97='ready',
    brinesearch_google_route_revision_issue97=v_route_revision,
    brinesearch_google_route_hold_reason_issue97=null,
    brinesearch_google_route_dependency_digest_issue97=v_dependency,
    brinesearch_google_route_updated_at_issue97=v_now
  where id=p_pad_id;
  delete from private_verification.brinesearch_google_route_refresh_queue_issue97
  where pad_id=p_pad_id;

  return pg_catalog.jsonb_build_object(
    'status','ready','manifest_mode','transition_geometry',
    'pad_id',p_pad_id,'route_prep_id',v_route.id,
    'route_revision',v_route_revision,
    'occurrence_count',v_occ_count,'point_count',v_point_count,
    'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
    'manifest_digest',v_manifest_digest,'dependency_digest',v_dependency
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)
from public,anon,authenticated,service_role;

-- Fully #69-published routes keep their stricter existing builder. Only routes
-- without a complete published exact route may use the transition-geometry
-- navigation path above.
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
begin
  select coalesce(r.evidence->>'manifest_mode','published_route')
  into v_mode
  from private_verification.brinesearch_google_route_receipts_issue97 r
  where r.pad_id=p_pad_id;
  if v_mode='transition_geometry' then
    return private_verification.brinesearch_issue97_transition_google_current(p_pad_id);
  end if;
  return public.brinesearch_issue97_google_route_current_published_core(p_pad_id);
end
$$;

revoke all on function public.brinesearch_issue97_google_route_current(uuid) from public;
grant execute on function public.brinesearch_issue97_google_route_current(uuid)
to anon,authenticated,service_role;

-- Finish the one-command batch pipeline: identity -> exact transitions -> exact
-- occurrence geometry -> route receipt -> Google ready/held accounting.
create or replace function public.brinesearch_issue97_run_all_pad_routing_pipeline(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_core jsonb;
  v_google jsonb;
begin
  v_core:=public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(p_pad_id);
  v_google:=public.brinesearch_issue97_refresh_google_routes(p_pad_id);
  return coalesce(v_core,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'google_routes',v_google,
    'pipeline_complete_through_google_manifest',true,
    'manual_map_editor','review_exception_qa_only'
  );
end
$$;

revoke all on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)
to service_role;

comment on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid) is
  'Issue #97 exact-transition navigation manifest builder. Uses current authoritative identity/source/graph receipts and exact occurrence geometry; never name/fuzzy/nearest-road selection. Full #69 publication remains separate.';
comment on function public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid) is
  'Issue #97 complete service pipeline: route corpus reconciliation -> transition anchors -> occurrence geometry -> route receipts -> ready/held Google navigation manifests.';
