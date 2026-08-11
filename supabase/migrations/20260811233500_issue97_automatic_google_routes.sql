-- GitHub #97 — automatic, coordinate-only Google Maps routes.
--
-- A public route is a derived receipt, never an editor-authored URL. The exact
-- structured occurrences, current authoritative source identities, clipped
-- geometry, graph anchors and saved pad GPS must all agree. Any uncertainty is
-- held privately and removes the public route until the exception is reviewed.

create table private_verification.brinesearch_google_route_receipts_issue97 (
  pad_id uuid primary key references public.pads(id) on delete cascade,
  route_revision bigint not null,
  status text not null,
  hold_reason text,
  manifest_version text not null default 'issue97-google-v1',
  manifest_digest text,
  dependency_digest text,
  manifest jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint brinesearch_google_route_receipt_status_issue97
    check(status in ('ready','held','stale')),
  constraint brinesearch_google_route_receipt_ready_issue97 check(
    status<>'ready' or (
      hold_reason is null
      and manifest_digest ~ '^[0-9a-f]{32}$'
      and dependency_digest ~ '^[0-9a-f]{32}$'
      and manifest->>'route_ready'='true'
      and manifest->>'status'='ready'
    )
  )
);

revoke all on private_verification.brinesearch_google_route_receipts_issue97
from public,anon,authenticated,service_role;
grant select on private_verification.brinesearch_google_route_receipts_issue97
to service_role;

-- This physical projection is deliberately narrow so security-invoker/RLS
-- semantics are retained without exposing private hold reasons or evidence.
create table public.brinesearch_driver_google_routes_public (
  pad_id uuid primary key references public.pads(id) on delete cascade,
  legacy_id text,
  route_revision bigint not null,
  source_revision timestamptz not null,
  manifest jsonb not null,
  constraint brinesearch_driver_google_route_manifest_issue97 check(
    manifest->>'manifest_version'='issue97-google-v1'
    and manifest->>'route_ready'='true'
    and manifest->>'status'='ready'
    and pg_catalog.jsonb_typeof(manifest->'points')='array'
    and pg_catalog.jsonb_array_length(manifest->'points')>0
  )
);

alter table public.brinesearch_driver_google_routes_public enable row level security;
alter table public.brinesearch_driver_google_routes_public force row level security;
revoke all on public.brinesearch_driver_google_routes_public from public,anon,authenticated,service_role;
grant select on public.brinesearch_driver_google_routes_public to anon,authenticated,service_role;
create policy brinesearch_driver_google_routes_public_read_issue97
on public.brinesearch_driver_google_routes_public
for select to anon,authenticated
using (true);

comment on table public.brinesearch_driver_google_routes_public is
  'Issue #97 exact allow-list: ready coordinate manifests only. No road names, notes, addresses, hold reasons or review evidence.';

create or replace function private_verification.brinesearch_issue97_hold_google_route(
  p_pad_id uuid,
  p_route_revision bigint,
  p_reason text,
  p_evidence jsonb default '{}'::jsonb,
  p_status text default 'held'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_status text:=case when p_status='stale' then 'stale' else 'held' end;
begin
  insert into private_verification.brinesearch_google_route_receipts_issue97(
    pad_id,route_revision,status,hold_reason,manifest,evidence,generated_at,updated_at
  ) values (
    p_pad_id,greatest(coalesce(p_route_revision,0),0),v_status,
    nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),
    pg_catalog.jsonb_build_object(
      'manifest_version','issue97-google-v1','route_ready',false,
      'status',v_status,'pad_id',p_pad_id,'route_revision',coalesce(p_route_revision,0)
    ),coalesce(p_evidence,'{}'::jsonb),pg_catalog.now(),pg_catalog.now()
  )
  on conflict(pad_id) do update set
    route_revision=excluded.route_revision,status=excluded.status,
    hold_reason=excluded.hold_reason,manifest_digest=null,dependency_digest=null,
    manifest=excluded.manifest,evidence=excluded.evidence,
    generated_at=excluded.generated_at,updated_at=pg_catalog.now();
  delete from public.brinesearch_driver_google_routes_public where pad_id=p_pad_id;
  return pg_catalog.jsonb_build_object(
    'pad_id',p_pad_id,'route_revision',coalesce(p_route_revision,0),
    'route_ready',false,'status',v_status,'hold_reason',p_reason,
    'evidence',coalesce(p_evidence,'{}'::jsonb)
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_hold_google_route(uuid,bigint,text,jsonb,text)
from public,anon,authenticated,service_role;

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
  v_step_count integer:=0;
  v_transition_count integer:=0;
  v_valid_transition_count integer:=0;
  v_shared_count integer:=0;
  v_valid_shared_count integer:=0;
  v_raw_shape_count integer:=0;
  v_resolved_shape_count integer:=0;
  v_total_length double precision:=0;
  v_points jsonb:='[]'::jsonb;
  v_base_manifest jsonb;
  v_manifest jsonb;
  v_manifest_digest text;
  v_dependency_digest text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );
  select p.* into v_pad from public.pads p where p.id=p_pad_id for update;
  if not found then raise exception 'Pad not found' using errcode='P0002'; end if;

  if v_pad.latitude is null or v_pad.longitude is null
     or v_pad.latitude not between -90 and 90 or v_pad.longitude not between -180 and 180 then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'saved_pad_gps_missing_or_invalid'
    );
  end if;
  if coalesce(v_pad.structured_route_revision,0)<1
     or coalesce(v_pad.road_sequence_status,'')<>'owner_verified' then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'exact_structured_route_not_published'
    );
  end if;
  if exists(
    select 1 from private_verification.brinesearch_driver_safety_facts_issue69 f
    where f.pad_id=p_pad_id and f.publication_status='private_hold'
      and (f.effective_from is null or f.effective_from<=current_date)
      and (f.effective_until is null or f.effective_until>=current_date)
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'private_driver_safety_hold'
    );
  end if;

  drop table if exists pg_temp.tmp_issue97_google_steps;
  drop table if exists pg_temp.tmp_issue97_google_identity_candidates;
  drop table if exists pg_temp.tmp_issue97_google_identities;
  drop table if exists pg_temp.tmp_issue97_google_points;
  drop table if exists pg_temp.tmp_issue97_google_shared;
  drop table if exists pg_temp.tmp_issue97_google_raw_shapes;
  drop table if exists pg_temp.tmp_issue97_google_shapes;

  create temporary table tmp_issue97_google_steps on commit drop as
  select pr.*,r.road_type,r.centerline_geojson,r.geometry_status as road_geometry_status,
    extensions.st_length(pr.step_geometry::extensions.geography) as length_m,
    coalesce(sum(extensions.st_length(pr.step_geometry::extensions.geography)) over(
      order by pr.step_order rows between unbounded preceding and 1 preceding
    ),0)::double precision as start_m,
    sum(extensions.st_length(pr.step_geometry::extensions.geography)) over(
      order by pr.step_order rows between unbounded preceding and current row
    )::double precision as end_m,
    pg_catalog.lag(pr.road_id) over(order by pr.step_order) as previous_road_id,
    pg_catalog.lag(pr.step_geometry) over(order by pr.step_order) as previous_geometry
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0
  order by pr.step_order;

  select count(*),coalesce(max(end_m),0) into v_step_count,v_total_length
  from tmp_issue97_google_steps;
  if v_step_count=0
     or exists(select 1 from tmp_issue97_google_steps where step_order<1)
     or (select min(step_order) from tmp_issue97_google_steps)<>1
     or (select max(step_order) from tmp_issue97_google_steps)<>v_step_count
     or (select count(distinct step_order) from tmp_issue97_google_steps)<>v_step_count
     or exists(select 1 from tmp_issue97_google_steps
       where route_revision<>v_pad.structured_route_revision
         or geometry_source<>'road_manager_clip_issue69'
         or geometry_status<>'snapped_intersections'
         or step_geometry is null or start_point is null or end_point is null
         or extensions.geometrytype(step_geometry)<>'LINESTRING'
         or extensions.st_isempty(step_geometry) or not extensions.st_isvalid(step_geometry)
         or not extensions.st_issimple(step_geometry) or extensions.st_npoints(step_geometry)<2
         or length_m<=0 or centerline_geojson is null
         or road_geometry_digest is distinct from pg_catalog.md5(centerline_geojson::text)
         or road_geometry_status not in (
           'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
         )
     )
     or exists(select 1 from tmp_issue97_google_steps
       where step_order>1 and not extensions.st_equals(
         extensions.st_endpoint(previous_geometry),extensions.st_startpoint(step_geometry)
       )) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'published_occurrence_geometry_not_exact_or_current'
    );
  end if;
  if not extensions.st_dwithin(
    (select end_point from tmp_issue97_google_steps order by step_order desc limit 1)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326)::extensions.geography,
    100
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'pad_gps_not_connected_to_published_route',
      pg_catalog.jsonb_build_object('maximum_gap_m',100)
    );
  end if;

  create temporary table tmp_issue97_google_identity_candidates on commit drop as
  with source_geometry as (
    select i.id as identity_id,i.dataset_id,i.state_code,i.county_code,
      pg_catalog.array_agg(distinct s.source_segment_key order by s.source_segment_key) as source_segment_keys,
      pg_catalog.md5(pg_catalog.string_agg(
        s.source_segment_key||':'||s.source_digest,',' order by s.source_segment_key
      )) as source_digest,
      extensions.st_unaryunion(extensions.st_collect(s.geom)) as geom
    from public.brinesearch_authoritative_road_identities i
    join public.brinesearch_road_source_datasets d on d.id=i.dataset_id
      and d.active and d.source_key in (
        'oh_odot_tims_road_inventory','wv_wvdot_publication_lrs',
        'pa_penndot_state_roads','pa_penndot_local_roads'
      )
    join public.brinesearch_road_source_dataset_counties scope
      on scope.dataset_id=i.dataset_id and scope.state_code=i.state_code
      and scope.county_code=i.county_code and scope.active
      and scope.ingest_enabled and scope.required_for_graph
    join public.brinesearch_authoritative_road_segments s
      on s.identity_id=i.id and s.active and s.geom is not null
    where i.active and private_verification.brinesearch_issue97_dataset_scope_current(
      i.dataset_id,i.state_code,i.county_code
    )
    group by i.id,i.dataset_id,i.state_code,i.county_code
  )
  select st.step_order,st.route_step_id,st.road_id,m.identity_id,
    sg.dataset_id,sg.state_code,sg.county_code,sg.source_segment_keys,sg.source_digest
  from tmp_issue97_google_steps st
  join public.brinesearch_road_identity_mappings m
    on m.road_id=st.road_id and m.mapping_status='verified'
  join public.brinesearch_authoritative_road_identities i
    on i.id=m.identity_id and i.active
    and private_verification.brinesearch_issue97_identity_route_usable(
      i.public_access_status,i.drivable_status,st.road_type
    )
  join source_geometry sg on sg.identity_id=i.id
  where extensions.st_coveredby(
    st.step_geometry,
    extensions.st_buffer(sg.geom::extensions.geography,1.0)::extensions.geometry
  );

  if exists(
    select 1 from tmp_issue97_google_steps st
    left join (
      select step_order,count(*) as candidate_count
      from tmp_issue97_google_identity_candidates group by step_order
    ) c using(step_order)
    where coalesce(c.candidate_count,0)<>1
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'authoritative_occurrence_identity_not_unique',
      (select pg_catalog.jsonb_object_agg(st.step_order::text,coalesce(c.candidate_count,0))
       from tmp_issue97_google_steps st
       left join (select step_order,count(*) as candidate_count
         from tmp_issue97_google_identity_candidates group by step_order) c using(step_order))
    );
  end if;
  create temporary table tmp_issue97_google_identities on commit drop as
  select * from tmp_issue97_google_identity_candidates;

  select count(*) into v_transition_count from tmp_issue97_google_steps
  where step_order>1 and previous_road_id<>road_id;
  select count(*) into v_valid_transition_count
  from tmp_issue97_google_steps st
  join public.brinesearch_road_junction_anchors a on a.id=st.entry_junction_anchor_id
  join public.brinesearch_road_junctions j
    on j.id=st.entry_junction_id and j.id=a.junction_id
    and j.build_id=st.junction_build_id and j.graph_digest=st.junction_digest
    and j.verification_status='verified'
  join public.brinesearch_road_graph_builds b
    on b.id=j.build_id and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  where st.step_order>1 and st.previous_road_id<>st.road_id;
  if v_transition_count<>v_valid_transition_count
     or exists(select 1 from tmp_issue97_google_steps
       where step_order>1 and previous_road_id=road_id
         and (entry_junction_id is not null or entry_junction_anchor_id is not null
           or junction_build_id is not null or junction_digest is not null)) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'route_transition_graph_receipt_not_current'
    );
  end if;

  create temporary table tmp_issue97_google_points(
    sort_m double precision not null,
    priority integer not null,
    stable_key text not null,
    point jsonb not null
  ) on commit drop;

  -- Ordinary road changes contribute the one exact graph anchor at the saved
  -- occurrence boundary. Shared sections are handled as two-anchor intervals.
  insert into tmp_issue97_google_points(sort_m,priority,stable_key,point)
  select st.start_m,20,'junction:'||a.id::text,
    pg_catalog.jsonb_build_object(
      'kind','junction','latitude',extensions.st_y(a.geom),
      'longitude',extensions.st_x(a.geom),'occurrence_id',st.route_step_id,
      'road_id',st.road_id,'source_kind','authoritative_junction_anchor',
      'anchor_id',a.id,'junction_id',j.id,'graph_build_id',b.id,
      'graph_digest',j.graph_digest,'anchor_digest',a.anchor_digest
    )
  from tmp_issue97_google_steps st
  join public.brinesearch_road_junction_anchors a on a.id=st.entry_junction_anchor_id
  join public.brinesearch_road_junctions j on j.id=a.junction_id and j.junction_type<>'shared_segment'
  join public.brinesearch_road_graph_builds b on b.id=j.build_id
  where st.step_order>1 and st.previous_road_id<>st.road_id;

  create temporary table tmp_issue97_google_shared on commit drop as
  select st.step_order,st.route_step_id,st.road_id,j.id as junction_id,
    st.start_m as boundary_m,
    selected.id as selected_anchor_id,selected.geom as selected_geom,
    selected.anchor_digest as selected_digest,
    other.id as other_anchor_id,other.geom as other_geom,other.anchor_digest as other_digest,
    j.graph_digest,b.id as graph_build_id,
    case
      when extensions.st_dwithin(other.geom::extensions.geography,
        st.previous_geometry::extensions.geography,1)
       and not extensions.st_dwithin(other.geom::extensions.geography,
        st.step_geometry::extensions.geography,1)
      then st.start_m-extensions.st_distance(
        selected.geom::extensions.geography,other.geom::extensions.geography)
      when extensions.st_dwithin(other.geom::extensions.geography,
        st.step_geometry::extensions.geography,1)
       and not extensions.st_dwithin(other.geom::extensions.geography,
        st.previous_geometry::extensions.geography,1)
      then st.start_m+extensions.st_distance(
        selected.geom::extensions.geography,other.geom::extensions.geography)
    end as other_m
  from tmp_issue97_google_steps st
  join public.brinesearch_road_junction_anchors selected
    on selected.id=st.entry_junction_anchor_id
  join public.brinesearch_road_junctions j
    on j.id=selected.junction_id and j.junction_type='shared_segment'
  join public.brinesearch_road_graph_builds b on b.id=j.build_id
  join public.brinesearch_road_junction_anchors other
    on other.junction_id=j.id and other.id<>selected.id
  where st.step_order>1 and st.previous_road_id<>st.road_id;

  select count(*) into v_shared_count
  from tmp_issue97_google_steps st
  join public.brinesearch_road_junctions j on j.id=st.entry_junction_id
  where j.junction_type='shared_segment';
  select count(*) into v_valid_shared_count from tmp_issue97_google_shared
  where other_m is not null and pg_catalog.abs(other_m-boundary_m)>0.01;
  if v_shared_count<>v_valid_shared_count then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'shared_segment_traversal_order_not_unique'
    );
  end if;

  insert into tmp_issue97_google_points(sort_m,priority,stable_key,point)
  select least(boundary_m,other_m),10,'shared-entry:'||junction_id::text,
    pg_catalog.jsonb_build_object(
      'kind','shared_entry','latitude',extensions.st_y(
        case when other_m<boundary_m then other_geom else selected_geom end),
      'longitude',extensions.st_x(
        case when other_m<boundary_m then other_geom else selected_geom end),
      'occurrence_id',route_step_id,'road_id',road_id,
      'source_kind','authoritative_junction_anchor',
      'anchor_id',case when other_m<boundary_m then other_anchor_id else selected_anchor_id end,
      'junction_id',junction_id,'graph_build_id',graph_build_id,
      'graph_digest',graph_digest,
      'anchor_digest',case when other_m<boundary_m then other_digest else selected_digest end
    )
  from tmp_issue97_google_shared
  union all
  select greatest(boundary_m,other_m),30,'shared-exit:'||junction_id::text,
    pg_catalog.jsonb_build_object(
      'kind','shared_exit','latitude',extensions.st_y(
        case when other_m>boundary_m then other_geom else selected_geom end),
      'longitude',extensions.st_x(
        case when other_m>boundary_m then other_geom else selected_geom end),
      'occurrence_id',route_step_id,'road_id',road_id,
      'source_kind','authoritative_junction_anchor',
      'anchor_id',case when other_m>boundary_m then other_anchor_id else selected_anchor_id end,
      'junction_id',junction_id,'graph_build_id',graph_build_id,
      'graph_digest',graph_digest,
      'anchor_digest',case when other_m>boundary_m then other_digest else selected_digest end
    )
  from tmp_issue97_google_shared;

  -- Deterministic shaping: exact route ingress, same-road occurrence splits,
  -- sampled interior points at <=~750 m, and the final published road endpoint.
  create temporary table tmp_issue97_google_raw_shapes on commit drop as
  with sample_counts as (
    select st.*,greatest(1,pg_catalog.ceil(st.length_m/750.0)::integer-1) as point_count
    from tmp_issue97_google_steps st
  ), samples as (
    select st.step_order,st.route_step_id,st.road_id,
      st.start_m+(st.length_m*(g.i::double precision/(st.point_count+1))) as sort_m,
      extensions.st_lineinterpolatepoint(
        st.step_geometry,g.i::double precision/(st.point_count+1)
      ) as geom,'sample'::text as shape_role
    from sample_counts st
    cross join lateral pg_catalog.generate_series(1,st.point_count) g(i)
  ), required_boundaries as (
    select st.step_order,st.route_step_id,st.road_id,st.start_m as sort_m,
      st.start_point as geom,
      case when st.step_order=1 then 'route_ingress' else 'same_road_split' end as shape_role
    from tmp_issue97_google_steps st
    where st.step_order=1 or (st.step_order>1 and st.previous_road_id=st.road_id)
  ), final_endpoint as (
    select st.step_order,st.route_step_id,st.road_id,st.end_m,st.end_point,'route_end'
    from tmp_issue97_google_steps st order by step_order desc limit 1
  )
  select * from samples
  union all select * from required_boundaries
  union all select * from final_endpoint;

  delete from tmp_issue97_google_raw_shapes raw
  where exists(select 1 from tmp_issue97_google_points p
    where pg_catalog.abs(p.sort_m-raw.sort_m)<=1.0)
     or exists(select 1 from tmp_issue97_google_shared shared
       where raw.sort_m>least(shared.boundary_m,shared.other_m)
         and raw.sort_m<greatest(shared.boundary_m,shared.other_m));

  create temporary table tmp_issue97_google_shapes on commit drop as
  select raw.*,identity.identity_id,segments.source_segment_key,segments.source_digest
  from tmp_issue97_google_raw_shapes raw
  join tmp_issue97_google_identities identity using(step_order,route_step_id,road_id)
  join lateral (
    select pg_catalog.string_agg(s.source_segment_key,'|' order by s.source_segment_key)
      as source_segment_key,
      pg_catalog.md5(pg_catalog.string_agg(
        s.source_segment_key||':'||s.source_digest,',' order by s.source_segment_key
      )) as source_digest
    from public.brinesearch_authoritative_road_segments s
    where s.identity_id=identity.identity_id and s.active
      and extensions.st_dwithin(s.geom::extensions.geography,raw.geom::extensions.geography,1)
  ) segments on nullif(segments.source_segment_key,'') is not null;

  select count(*) into v_raw_shape_count from tmp_issue97_google_raw_shapes;
  select count(*) into v_resolved_shape_count from tmp_issue97_google_shapes;
  if v_raw_shape_count=0 or v_raw_shape_count<>v_resolved_shape_count then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'shaping_point_source_receipt_not_exact'
    );
  end if;

  insert into tmp_issue97_google_points(sort_m,priority,stable_key,point)
  select shape.sort_m,40,
    'shape:'||shape.route_step_id::text||':'||shape.shape_role||':'||shape.sort_m::text,
    pg_catalog.jsonb_build_object(
      'kind','shape','latitude',extensions.st_y(shape.geom),
      'longitude',extensions.st_x(shape.geom),'occurrence_id',shape.route_step_id,
      'road_id',shape.road_id,'identity_id',shape.identity_id,
      'shape_role',shape.shape_role,'source_kind','authoritative_clipped_geometry',
      'source_segment_key',shape.source_segment_key,'source_digest',shape.source_digest
    )
  from tmp_issue97_google_shapes shape;

  insert into tmp_issue97_google_points(sort_m,priority,stable_key,point)
  values(
    v_total_length+1,100,'pad:'||p_pad_id::text,
    pg_catalog.jsonb_build_object(
      'kind','pad_destination','latitude',v_pad.latitude,'longitude',v_pad.longitude,
      'source_kind','saved_pad_gps','pad_id',p_pad_id
    )
  );

  with ordered as (
    select point,pg_catalog.row_number() over(
      order by sort_m,priority,stable_key
    )::integer as sequence
    from tmp_issue97_google_points
  )
  select pg_catalog.jsonb_agg(
    point||pg_catalog.jsonb_build_object('sequence',sequence) order by sequence
  ) into v_points from ordered;

  if v_points is null or pg_catalog.jsonb_array_length(v_points)<2
     or (v_points->-1)->>'kind'<>'pad_destination'
     or exists(
       select 1 from pg_catalog.jsonb_array_elements(v_points) with ordinality p(point,ordinality)
       where (p.point->>'sequence')::integer<>p.ordinality
     )
     or exists(
       select 1 from pg_catalog.jsonb_array_elements(v_points) with ordinality p(point,ordinality)
       where p.point->>'kind'='shared_entry'
         and coalesce((v_points->(p.ordinality::integer))->>'kind','')<>'shared_exit'
     ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'ordered_control_point_contract_failed'
    );
  end if;

  select pg_catalog.md5(
    p_pad_id::text||':'||v_pad.structured_route_revision::text||':'||
    v_pad.latitude::text||':'||v_pad.longitude::text||':'||
    pg_catalog.string_agg(
      st.route_step_id::text||':'||st.road_id::text||':'||identity.identity_id::text||':'||
      st.road_geometry_digest||':'||identity.source_digest||':'||
      coalesce(st.entry_junction_anchor_id::text,'')||':'||coalesce(st.junction_digest,''),
      ',' order by st.step_order
    )
  ) into v_dependency_digest
  from tmp_issue97_google_steps st
  join tmp_issue97_google_identities identity using(step_order,route_step_id,road_id);

  v_base_manifest:=pg_catalog.jsonb_build_object(
    'manifest_version','issue97-google-v1','status','ready','route_ready',true,
    'pad_id',p_pad_id,'route_revision',v_pad.structured_route_revision,
    'dependency_digest',v_dependency_digest,'occurrence_count',v_step_count,
    'generator',pg_catalog.jsonb_build_object(
      'coordinate_only',true,'travelmode','driving','dir_action','navigate',
      'maximum_mobile_waypoints',3,'maximum_url_length',2048,
      'chunk_continuity','previous_destination_equals_next_origin',
      'shape_spacing_m',750
    ),'points',v_points
  );
  v_manifest_digest:=pg_catalog.md5(v_base_manifest::text);
  v_manifest:=v_base_manifest||pg_catalog.jsonb_build_object('manifest_digest',v_manifest_digest);

  insert into private_verification.brinesearch_google_route_receipts_issue97(
    pad_id,route_revision,status,hold_reason,manifest_version,manifest_digest,
    dependency_digest,manifest,evidence,generated_at,updated_at
  ) values (
    p_pad_id,v_pad.structured_route_revision,'ready',null,'issue97-google-v1',
    v_manifest_digest,v_dependency_digest,v_manifest,
    pg_catalog.jsonb_build_object(
      'exact_occurrences',v_step_count,'control_points',pg_catalog.jsonb_array_length(v_points),
      'source_identity_contract','one current physical identity covering each clipped occurrence',
      'manual_map_editor_role','review_exception_qa_only'
    ),pg_catalog.now(),pg_catalog.now()
  )
  on conflict(pad_id) do update set
    route_revision=excluded.route_revision,status='ready',hold_reason=null,
    manifest_version=excluded.manifest_version,manifest_digest=excluded.manifest_digest,
    dependency_digest=excluded.dependency_digest,manifest=excluded.manifest,
    evidence=excluded.evidence,generated_at=excluded.generated_at,updated_at=pg_catalog.now();

  insert into public.brinesearch_driver_google_routes_public(
    pad_id,legacy_id,route_revision,source_revision,manifest
  ) values (
    p_pad_id,v_pad.legacy_id,v_pad.structured_route_revision,pg_catalog.now(),v_manifest
  )
  on conflict(pad_id) do update set
    legacy_id=excluded.legacy_id,route_revision=excluded.route_revision,
    source_revision=excluded.source_revision,manifest=excluded.manifest;

  return pg_catalog.jsonb_build_object(
    'pad_id',p_pad_id,'route_revision',v_pad.structured_route_revision,
    'route_ready',true,'status','ready','manifest_digest',v_manifest_digest,
    'control_point_count',pg_catalog.jsonb_array_length(v_points)
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route(uuid)
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_refresh_google_routes(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r record; v_result jsonb; v_ready integer:=0; v_held integer:=0;
begin
  for r in
    select p.id from public.pads p
    where (p_pad_id is null or p.id=p_pad_id)
      and (p_pad_id is not null or exists(
        select 1 from public.brinesearch_pad_roads pr
        where pr.pad_id=p.id and pr.route_group='primary' and pr.route_variant_index=0
      ))
    order by p.id
  loop
    v_result:=private_verification.brinesearch_issue97_refresh_google_route(r.id);
    if coalesce((v_result->>'route_ready')::boolean,false) then
      v_ready:=v_ready+1;
    else
      v_held:=v_held+1;
    end if;
  end loop;
  if p_pad_id is not null and v_ready+v_held=0 then
    raise exception 'Pad not found' using errcode='P0002';
  end if;
  return pg_catalog.jsonb_build_object(
    'scope_pad_id',p_pad_id,'ready',v_ready,'held',v_held,'processed',v_ready+v_held
  );
end
$$;

revoke all on function public.brinesearch_issue97_refresh_google_routes(uuid)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_refresh_google_routes(uuid)
to service_role;

-- Make URL/manifest generation automatic inside the canonical route publish
-- transaction. The prior route publisher remains the exact no-guess gate.
alter function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
  rename to brinesearch_publish_structured_route_issue97_without_google;
revoke all on function public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)
from public,anon,authenticated;

create or replace function public.brinesearch_publish_structured_route(
  p_pad_id uuid,
  p_review_id uuid,
  p_steps jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb; v_google jsonb;
begin
  v_result:=public.brinesearch_publish_structured_route_issue97_without_google(
    p_pad_id,p_review_id,p_steps,p_expected_revision
  );
  v_google:=private_verification.brinesearch_issue97_refresh_google_route(p_pad_id);
  return v_result||pg_catalog.jsonb_build_object('google_maps_route',v_google);
end
$$;

revoke all on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
from public,anon;
grant execute on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)
to authenticated;

comment on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint) is
  'Issue #97 exact route publisher plus automatic coordinate-manifest generation. Held dependencies never publish a Google route.';

create or replace function private_verification.brinesearch_issue97_invalidate_google_route_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_pad_id uuid; v_build_id uuid; v_identity_id uuid; v_road_id uuid;
begin
  if tg_table_name='pads' then
    v_pad_id:=new.id;
    if new.latitude is not distinct from old.latitude
       and new.longitude is not distinct from old.longitude
       and new.structured_route_revision is not distinct from old.structured_route_revision then
      return new;
    end if;
    perform private_verification.brinesearch_issue97_hold_google_route(
      v_pad_id,new.structured_route_revision,'pad_gps_or_route_revision_changed','{}'::jsonb,'stale'
    );
  elsif tg_table_name='brinesearch_pad_roads' then
    v_pad_id:=coalesce(new.pad_id,old.pad_id);
    perform private_verification.brinesearch_issue97_hold_google_route(
      v_pad_id,coalesce(new.route_revision,old.route_revision,0),
      'published_route_occurrence_changed','{}'::jsonb,'stale'
    );
  elsif tg_table_name='brinesearch_road_graph_builds' then
    v_build_id:=coalesce(new.id,old.id);
    for v_pad_id in
      select receipt.pad_id
      from private_verification.brinesearch_google_route_receipts_issue97 receipt
      where exists(
        select 1 from pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb)) p
        where p->>'graph_build_id'=v_build_id::text
      )
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select route_revision from private_verification.brinesearch_google_route_receipts_issue97 where pad_id=v_pad_id),
        'graph_generation_changed',pg_catalog.jsonb_build_object('graph_build_id',v_build_id),'stale'
      );
    end loop;
  elsif tg_table_name='brinesearch_road_identity_mappings' then
    v_identity_id:=coalesce(new.identity_id,old.identity_id);
    v_road_id:=coalesce(new.road_id,old.road_id);
    for v_pad_id in
      select receipt.pad_id
      from private_verification.brinesearch_google_route_receipts_issue97 receipt
      where exists(
        select 1 from pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb)) p
        where p->>'identity_id'=v_identity_id::text or p->>'road_id'=v_road_id::text
      )
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select route_revision from private_verification.brinesearch_google_route_receipts_issue97 where pad_id=v_pad_id),
        'road_identity_mapping_changed',pg_catalog.jsonb_build_object(
          'identity_id',v_identity_id,'road_id',v_road_id
        ),'stale'
      );
    end loop;
  elsif tg_table_name='brinesearch_roads' then
    v_road_id:=coalesce(new.id,old.id);
    for v_pad_id in select distinct pr.pad_id from public.brinesearch_pad_roads pr where pr.road_id=v_road_id
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select structured_route_revision from public.pads where id=v_pad_id),
        'canonical_road_geometry_changed',pg_catalog.jsonb_build_object('road_id',v_road_id),'stale'
      );
    end loop;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;

revoke all on function private_verification.brinesearch_issue97_invalidate_google_route_trigger()
from public,anon,authenticated,service_role;

create trigger brinesearch_issue97_google_route_pad_stale
after update of latitude,longitude,structured_route_revision on public.pads
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_steps_stale
after insert or update or delete on public.brinesearch_pad_roads
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_graph_stale
after update of status,graph_digest,source_revision_digest on public.brinesearch_road_graph_builds
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_mapping_stale
after insert or update or delete on public.brinesearch_road_identity_mappings
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_road_stale
after update of centerline_geojson,geometry_status,source_record_id on public.brinesearch_roads
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
