-- GitHub #97 — automatic, coordinate-only Google Maps routes.
--
-- A public route is a derived receipt, never an editor-authored URL. The exact
-- structured occurrences, current authoritative source identities, clipped
-- geometry, graph anchors and saved pad GPS must all agree. Any uncertainty is
-- held privately and removes the public route until the exception is reviewed.

alter table public.pads
  add column brinesearch_google_route_status_issue97 text not null default 'not_evaluated',
  add column brinesearch_google_route_revision_issue97 bigint;
alter table public.pads
  add constraint pads_google_route_status_issue97 check(
    brinesearch_google_route_status_issue97 in ('not_evaluated','ready','held','stale')
  );

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

alter table private_verification.brinesearch_google_route_receipts_issue97
  enable row level security;
alter table private_verification.brinesearch_google_route_receipts_issue97
  force row level security;

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
    and manifest->>'pad_id'=pad_id::text
    and coalesce(manifest->>'route_revision','')~'^[0-9]+$'
    and (manifest->>'route_revision')::bigint=route_revision
    and pg_catalog.jsonb_typeof(manifest->'points')='array'
    and pg_catalog.jsonb_array_length(manifest->'points')>1
    and (manifest->'points'->0)->>'kind'='shape'
    and (manifest->'points'->0)->>'shape_role'='route_ingress'
    and (manifest->'points'->0)->>'source_kind'='authoritative_clipped_geometry'
    and nullif((manifest->'points'->0)->>'identity_id','') is not null
    and (manifest->'points'->-1)->>'kind'='pad_destination'
    and (manifest->'points'->-1)->>'pad_id'=pad_id::text
  )
);

alter table public.brinesearch_driver_google_routes_public enable row level security;
alter table public.brinesearch_driver_google_routes_public force row level security;
revoke all on public.brinesearch_driver_google_routes_public from public,anon,authenticated,service_role;
grant select on public.brinesearch_driver_google_routes_public to anon,authenticated,service_role;
comment on table public.brinesearch_driver_google_routes_public is
  'Issue #97 exact allow-list: ready coordinate manifests only. No road names, notes, addresses, hold reasons or review evidence.';

create table private_verification.brinesearch_google_route_refresh_queue_issue97 (
  pad_id uuid primary key references public.pads(id) on delete cascade,
  reason text not null,
  queued_at timestamptz not null default pg_catalog.now()
);
alter table private_verification.brinesearch_google_route_refresh_queue_issue97
  enable row level security;
alter table private_verification.brinesearch_google_route_refresh_queue_issue97
  force row level security;
revoke all on private_verification.brinesearch_google_route_refresh_queue_issue97
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_queue_google_route_refresh(
  p_pad_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into private_verification.brinesearch_google_route_refresh_queue_issue97(
    pad_id,reason,queued_at
  ) values(p_pad_id,coalesce(nullif(pg_catalog.btrim(p_reason),''),'dependency_changed'),pg_catalog.now())
  on conflict(pad_id) do update set
    reason=excluded.reason,queued_at=excluded.queued_at;
end
$$;

revoke all on function private_verification.brinesearch_issue97_queue_google_route_refresh(uuid,text)
from public,anon,authenticated,service_role;

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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );
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
  update public.pads set
    brinesearch_google_route_status_issue97=v_status,
    brinesearch_google_route_revision_issue97=greatest(coalesce(p_route_revision,0),0)
  where id=p_pad_id;
  perform private_verification.brinesearch_issue97_queue_google_route_refresh(
    p_pad_id,coalesce(p_reason,v_status)
  );
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
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );
  select p.* into v_pad from public.pads p where p.id=p_pad_id for update;
  if not found then raise exception 'Pad not found' using errcode='P0002'; end if;

  if not exists(
    select 1 from public.brinesearch_issue97_release_state s
    where s.singleton and s.cutover_at is not null
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'issue97_cutover_not_active'
    );
  end if;

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
    pg_catalog.lag(pr.route_step_id) over(order by pr.step_order) as previous_route_step_id,
    pg_catalog.lag(pr.step_geometry) over(order by pr.step_order) as previous_geometry,
    pg_catalog.lag(extensions.st_length(pr.step_geometry::extensions.geography)) over(
      order by pr.step_order
    )::double precision as previous_length_m
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
  with eligible_identity as (
    select i.id as identity_id,i.dataset_id,i.state_code,i.county_code
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
    where i.active and private_verification.brinesearch_issue97_dataset_scope_current(
      i.dataset_id,i.state_code,i.county_code
    )
  )
  select st.step_order,st.route_step_id,st.road_id,m.identity_id,
    eligible.dataset_id,eligible.state_code,eligible.county_code,
    chain.source_segment_keys,chain.source_digest,chain.source_chain_geom,
    private_verification.brinesearch_issue97_mapping_fingerprint(m.identity_id) as mapping_fingerprint,
    latest_run.id as source_run_id,latest_run.details->>'page_set_digest' as source_page_set_digest
  from tmp_issue97_google_steps st
  join public.brinesearch_road_identity_mappings m
    on m.road_id=st.road_id and m.mapping_status='verified'
  join public.brinesearch_authoritative_road_identities i
    on i.id=m.identity_id and i.active
    and private_verification.brinesearch_issue97_identity_route_usable(
      i.public_access_status,i.drivable_status,st.road_type
    )
  join eligible_identity eligible on eligible.identity_id=i.id
  join lateral (
    select collected.source_segment_keys,collected.source_digest,
      extensions.st_linemerge(collected.source_union) as source_chain_geom
    from (
      select
        pg_catalog.array_agg(distinct segment.source_segment_key
          order by segment.source_segment_key) as source_segment_keys,
        pg_catalog.md5(pg_catalog.string_agg(
          distinct segment.source_segment_key||':'||segment.source_digest,','
          order by segment.source_segment_key||':'||segment.source_digest
        )) as source_digest,
        extensions.st_unaryunion(extensions.st_collect(segment.geom)) as source_union
      from public.brinesearch_authoritative_road_segments segment
      where segment.identity_id=i.id and segment.active and segment.geom is not null
        and extensions.st_dwithin(
          segment.geom::extensions.geography,st.step_geometry::extensions.geography,1.0
        )
    ) collected
  ) chain on pg_catalog.cardinality(chain.source_segment_keys)>0
    and extensions.geometrytype(chain.source_chain_geom)='LINESTRING'
    and extensions.st_coveredby(
      st.step_geometry,
      extensions.st_buffer(chain.source_chain_geom::extensions.geography,1.0)::extensions.geometry
    )
  join lateral (
    select run.id,run.details
    from public.brinesearch_road_source_ingest_runs run
    where run.dataset_id=eligible.dataset_id and run.state_code=eligible.state_code
      and run.county_code=eligible.county_code and run.status='complete'
    order by run.started_at desc,run.id desc limit 1
  ) latest_run on coalesce(latest_run.details->>'page_set_digest','')~'^[0-9a-f]{32}$'
  ;

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
  select st.step_order,st.route_step_id,st.road_id,st.previous_route_step_id,
    st.previous_road_id,j.id as junction_id,
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
      then st.start_m-st.previous_length_m+st.previous_length_m*
        extensions.st_linelocatepoint(
          st.previous_geometry,extensions.st_closestpoint(st.previous_geometry,other.geom)
        )
      when extensions.st_dwithin(other.geom::extensions.geography,
        st.step_geometry::extensions.geography,1)
       and not extensions.st_dwithin(other.geom::extensions.geography,
        st.previous_geometry::extensions.geography,1)
      then st.start_m+st.length_m*extensions.st_linelocatepoint(
        st.step_geometry,extensions.st_closestpoint(st.step_geometry,other.geom)
      )
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
      'occurrence_id',case when other_m<boundary_m then previous_route_step_id else route_step_id end,
      'road_id',case when other_m<boundary_m then previous_road_id else road_id end,
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
      'occurrence_id',case when other_m>boundary_m then route_step_id else previous_route_step_id end,
      'road_id',case when other_m>boundary_m then road_id else previous_road_id end,
      'source_kind','authoritative_junction_anchor',
      'anchor_id',case when other_m>boundary_m then other_anchor_id else selected_anchor_id end,
      'junction_id',junction_id,'graph_build_id',graph_build_id,
      'graph_digest',graph_digest,
      'anchor_digest',case when other_m>boundary_m then other_digest else selected_digest end
    )
  from tmp_issue97_google_shared;

  -- Deterministic shaping: exact route ingress, same-road occurrence splits,
  -- <=500 m samples, simplified curvature vertices, shared-section interiors,
  -- and the final published road endpoint. Every emitted coordinate is snapped
  -- back onto the current authoritative source geometry.
  create temporary table tmp_issue97_google_raw_shapes on commit drop as
  with sample_counts as (
    select st.*,greatest(1,pg_catalog.ceil(st.length_m/500.0)::integer-1) as point_count
    from tmp_issue97_google_steps st
  ), samples as (
    select st.step_order,st.route_step_id,st.road_id,
      st.start_m+(st.length_m*(g.i::double precision/(st.point_count+1))) as sort_m,
      extensions.st_lineinterpolatepoint(
        st.step_geometry,g.i::double precision/(st.point_count+1)
      ) as geom,'sample'::text as shape_role
    from sample_counts st
    cross join lateral pg_catalog.generate_series(1,st.point_count) g(i)
  ), curvature as (
    select expanded.step_order,expanded.route_step_id,expanded.road_id,
      expanded.start_m+expanded.length_m*expanded.fraction as sort_m,
      expanded.geom,'curvature'::text as shape_role
    from (
      select st.step_order,st.route_step_id,st.road_id,st.start_m,st.length_m,
        (dumped.point).geom as geom,
        extensions.st_linelocatepoint(st.step_geometry,(dumped.point).geom) as fraction
      from tmp_issue97_google_steps st
      cross join lateral (
        select extensions.st_dumppoints(
          extensions.st_transform(
            extensions.st_simplifypreservetopology(
              extensions.st_transform(st.step_geometry,3857),5
            ),4326
          )
        ) as point
      ) dumped
    ) expanded
    where expanded.fraction>0.001 and expanded.fraction<0.999
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
  union all select * from curvature
  union all select * from required_boundaries
  union all select * from final_endpoint;

  delete from tmp_issue97_google_raw_shapes raw
  where exists(select 1 from tmp_issue97_google_points p
    where pg_catalog.abs(p.sort_m-raw.sort_m)<=1.0);

  create temporary table tmp_issue97_google_shapes on commit drop as
  select raw.*,identity.identity_id,identity.source_segment_keys,
    identity.source_digest,
    extensions.st_lineinterpolatepoint(
      identity.source_chain_geom,
      extensions.st_linelocatepoint(identity.source_chain_geom,raw.geom)
    ) as source_geom
  from tmp_issue97_google_raw_shapes raw
  join tmp_issue97_google_identities identity using(step_order,route_step_id,road_id)
  where extensions.st_dwithin(
    identity.source_chain_geom::extensions.geography,raw.geom::extensions.geography,1.0
  );

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
      'kind','shape','latitude',extensions.st_y(shape.source_geom),
      'longitude',extensions.st_x(shape.source_geom),'occurrence_id',shape.route_step_id,
      'road_id',shape.road_id,'identity_id',shape.identity_id,
      'shape_role',shape.shape_role,'source_kind','authoritative_clipped_geometry',
      'source_segment_keys',pg_catalog.to_jsonb(shape.source_segment_keys),
      'source_digest',shape.source_digest,
      'identity_source_digest',identity.source_digest,
      'mapping_fingerprint',identity.mapping_fingerprint,
      'source_run_id',identity.source_run_id,
      'source_page_set_digest',identity.source_page_set_digest
    )
  from tmp_issue97_google_shapes shape
  join tmp_issue97_google_identities identity
    using(step_order,route_step_id,road_id,identity_id);

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
     or (v_points->0)->>'kind'<>'shape'
     or (v_points->0)->>'shape_role'<>'route_ingress'
     or (v_points->0)->>'source_kind'<>'authoritative_clipped_geometry'
     or nullif((v_points->0)->>'identity_id','') is null
     or (v_points->-1)->>'kind'<>'pad_destination'
     or exists(
       select 1 from pg_catalog.jsonb_array_elements(v_points) with ordinality p(point,ordinality)
       where (p.point->>'sequence')::integer<>p.ordinality
     )
     or exists(
       select 1 from pg_catalog.jsonb_array_elements(v_points) with ordinality p(point,ordinality)
       where p.point->>'kind'='shared_entry'
         and not exists(
           select 1
           from pg_catalog.jsonb_array_elements(v_points) with ordinality exit_point(point,ordinality)
           where exit_point.ordinality>p.ordinality
             and exit_point.point->>'kind'='shared_exit'
             and exit_point.point->>'junction_id'=p.point->>'junction_id'
         )
     )
     or exists(
       select 1 from tmp_issue97_google_steps step
       where not exists(
         select 1 from pg_catalog.jsonb_array_elements(v_points) p(point)
         where p.point->>'occurrence_id'=step.route_step_id::text
           and p.point->>'road_id'=step.road_id::text
           and nullif(p.point->>'identity_id','') is not null
           and nullif(p.point->>'identity_source_digest','') is not null
           and nullif(p.point->>'mapping_fingerprint','') is not null
           and nullif(p.point->>'source_run_id','') is not null
           and nullif(p.point->>'source_page_set_digest','') is not null
       )
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
      identity.mapping_fingerprint||':'||identity.source_run_id::text||':'||
      identity.source_page_set_digest||':'||
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
      'shape_spacing_m',500,'curvature_tolerance_m',5,
      'shared_section_interior_shapes',true
    ),'points',v_points
  );
  v_manifest_digest:=pg_catalog.md5(v_base_manifest::text);
  v_manifest:=v_base_manifest||pg_catalog.jsonb_build_object('manifest_digest',v_manifest_digest);

  -- Revalidate the exact dependency receipts immediately before publishing.
  -- The global mapping lock prevents a graph/mapping generation from passing
  -- between this check and the ready receipt write.
  if exists(
    select 1
    from tmp_issue97_google_identities identity
    where not private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code
      )
      or identity.mapping_fingerprint is distinct from
        private_verification.brinesearch_issue97_mapping_fingerprint(identity.identity_id)
      or identity.source_digest is distinct from (
        select pg_catalog.md5(pg_catalog.string_agg(
          segment.source_segment_key||':'||segment.source_digest,','
          order by segment.source_segment_key
        ))
        from public.brinesearch_authoritative_road_segments segment
        where segment.identity_id=identity.identity_id and segment.active
          and segment.geom is not null
          and segment.source_segment_key=any(identity.source_segment_keys)
      )
      or not exists(
        select 1 from (
          select run.id,run.details->>'page_set_digest' as page_set_digest
          from public.brinesearch_road_source_ingest_runs run
          where run.dataset_id=identity.dataset_id and run.state_code=identity.state_code
            and run.county_code=identity.county_code and run.status='complete'
          order by run.started_at desc,run.id desc limit 1
        ) latest
        where latest.id=identity.source_run_id
          and latest.page_set_digest=identity.source_page_set_digest
      )
  ) or exists(
    select 1 from tmp_issue97_google_steps step
    join public.brinesearch_roads road on road.id=step.road_id
    where step.road_geometry_digest is distinct from pg_catalog.md5(road.centerline_geojson::text)
       or (step.junction_build_id is not null and not
         private_verification.brinesearch_issue97_graph_build_sources_current(step.junction_build_id))
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_pad.structured_route_revision,'route_dependency_changed_during_generation'
    );
  end if;

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

  update public.pads set
    brinesearch_google_route_status_issue97='ready',
    brinesearch_google_route_revision_issue97=v_pad.structured_route_revision
  where id=p_pad_id;

  return pg_catalog.jsonb_build_object(
    'pad_id',p_pad_id,'route_revision',v_pad.structured_route_revision,
    'route_ready',true,'status','ready','manifest_digest',v_manifest_digest,
    'control_point_count',pg_catalog.jsonb_array_length(v_points)
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route(uuid)
from public,anon,authenticated,service_role;

-- RLS evaluates readiness against the live dependency graph, not merely the
-- last materialized row. This immediately hides a route when a source run,
-- mapping, graph, route status, safety hold, or geometry receipt is stale.
create or replace function public.brinesearch_issue97_google_route_current(p_pad_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_receipt record;
  v_pad record;
  v_step record;
  v_step_count integer;
  v_identity_count integer;
  v_destination jsonb;
begin
  select * into v_receipt
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  where receipt.pad_id=p_pad_id and receipt.status='ready';
  if not found then return false; end if;

  select * into v_pad from public.pads pad where pad.id=p_pad_id;
  if not found or coalesce(v_pad.road_sequence_status,'')<>'owner_verified'
     or v_pad.brinesearch_google_route_status_issue97<>'ready'
     or v_pad.brinesearch_google_route_revision_issue97 is distinct from v_receipt.route_revision
     or v_pad.structured_route_revision is distinct from v_receipt.route_revision
     or v_receipt.manifest->>'pad_id'<>p_pad_id::text
     or coalesce(v_receipt.manifest->>'route_revision','')!~'^[0-9]+$'
     or (v_receipt.manifest->>'route_revision')::bigint<>v_receipt.route_revision
     or v_receipt.manifest->>'dependency_digest'<>v_receipt.dependency_digest
     or v_receipt.manifest->>'manifest_digest'<>v_receipt.manifest_digest
     or pg_catalog.md5((v_receipt.manifest-'manifest_digest')::text)<>v_receipt.manifest_digest
     or pg_catalog.jsonb_typeof(v_receipt.manifest->'points')<>'array'
     or pg_catalog.jsonb_array_length(v_receipt.manifest->'points')<2 then
    return false;
  end if;
  if exists(
    select 1 from private_verification.brinesearch_driver_safety_facts_issue69 fact
    where fact.pad_id=p_pad_id and fact.publication_status='private_hold'
      and (fact.effective_from is null or fact.effective_from<=current_date)
      and (fact.effective_until is null or fact.effective_until>=current_date)
  ) then return false; end if;

  v_destination:=v_receipt.manifest->'points'->-1;
  if v_destination->>'kind'<>'pad_destination'
     or v_destination->>'pad_id'<>p_pad_id::text
     or coalesce(v_destination->>'latitude','')!~'^[-]?[0-9]+([.][0-9]+)?$'
     or coalesce(v_destination->>'longitude','')!~'^[-]?[0-9]+([.][0-9]+)?$'
     or (v_destination->>'latitude')::double precision is distinct from v_pad.latitude
     or (v_destination->>'longitude')::double precision is distinct from v_pad.longitude then
    return false;
  end if;

  select count(*)::integer into v_step_count
  from public.brinesearch_pad_roads step
  where step.pad_id=p_pad_id and step.route_group='primary' and step.route_variant_index=0;
  if v_step_count<1 or coalesce(v_receipt.manifest->>'occurrence_count','')!~'^[0-9]+$'
     or (v_receipt.manifest->>'occurrence_count')::integer<>v_step_count then
    return false;
  end if;
  if (select min(step.step_order) from public.brinesearch_pad_roads step
      where step.pad_id=p_pad_id and step.route_group='primary'
        and step.route_variant_index=0)<>1
     or (select max(step.step_order) from public.brinesearch_pad_roads step
      where step.pad_id=p_pad_id and step.route_group='primary'
        and step.route_variant_index=0)<>v_step_count
     or (select count(distinct step.step_order) from public.brinesearch_pad_roads step
      where step.pad_id=p_pad_id and step.route_group='primary'
        and step.route_variant_index=0)<>v_step_count
     or exists(
       select 1 from (
         select step.step_order,step.step_geometry,
           pg_catalog.lag(step.step_geometry) over(order by step.step_order) as prior_geometry
         from public.brinesearch_pad_roads step
         where step.pad_id=p_pad_id and step.route_group='primary'
           and step.route_variant_index=0
       ) ordered
       where ordered.step_order>1 and not extensions.st_equals(
         extensions.st_endpoint(ordered.prior_geometry),
         extensions.st_startpoint(ordered.step_geometry)
       )
     )
     or not exists(
       select 1 from public.brinesearch_pad_roads step
       where step.pad_id=p_pad_id and step.route_group='primary'
         and step.route_variant_index=0 and step.step_order=v_step_count
         and extensions.st_dwithin(
           step.end_point::extensions.geography,
           extensions.st_setsrid(
             extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326
           )::extensions.geography,100
         )
     ) then
    return false;
  end if;

  if (v_receipt.manifest->'points'->0)->>'kind'<>'shape'
     or (v_receipt.manifest->'points'->0)->>'shape_role'<>'route_ingress'
     or (v_receipt.manifest->'points'->0)->>'source_kind'<>'authoritative_clipped_geometry'
     or pg_catalog.jsonb_typeof(
       v_receipt.manifest->'points'->0->'source_segment_keys'
     ) is distinct from 'array'
     or exists(
       select 1
       from pg_catalog.jsonb_array_elements(v_receipt.manifest->'points')
         with ordinality manifest_point(point,ordinality)
       where coalesce(manifest_point.point->>'sequence','')!~'^[0-9]+$'
          or (manifest_point.point->>'sequence')::integer<>manifest_point.ordinality
          or manifest_point.point->>'kind' not in (
            'shape','junction','shared_entry','shared_exit','pad_destination'
          )
          or manifest_point.point ?| array[
            'name','road_name','roadName','address','instruction','instructions','label'
          ]
     )
     or exists(
       select 1
       from pg_catalog.jsonb_array_elements(v_receipt.manifest->'points')
         with ordinality entry_point(point,ordinality)
       where entry_point.point->>'kind'='shared_entry'
         and not exists(
           select 1
           from pg_catalog.jsonb_array_elements(v_receipt.manifest->'points')
             with ordinality exit_point(point,ordinality)
           where exit_point.ordinality>entry_point.ordinality
             and exit_point.point->>'kind'='shared_exit'
             and exit_point.point->>'junction_id'=entry_point.point->>'junction_id'
         )
     ) then
    return false;
  end if;

  if exists(
    select 1
    from pg_catalog.jsonb_array_elements(v_receipt.manifest->'points') p(point)
    left join public.brinesearch_road_junction_anchors anchor
      on anchor.id=(p.point->>'anchor_id')::uuid
    left join public.brinesearch_road_junctions junction
      on junction.id=anchor.junction_id and junction.id=(p.point->>'junction_id')::uuid
      and junction.build_id=(p.point->>'graph_build_id')::uuid
      and junction.graph_digest=p.point->>'graph_digest'
      and junction.verification_status='verified'
    left join public.brinesearch_road_graph_builds build
      on build.id=junction.build_id and build.status='active'
      and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
    where p.point->>'kind' in ('junction','shared_entry','shared_exit')
      and (
        anchor.id is null or junction.id is null or build.id is null
        or anchor.anchor_digest<>p.point->>'anchor_digest'
        or extensions.st_y(anchor.geom) is distinct from
          (p.point->>'latitude')::double precision
        or extensions.st_x(anchor.geom) is distinct from
          (p.point->>'longitude')::double precision
      )
  ) then
    return false;
  end if;

  for v_step in
    select step.*,road.road_type,road.centerline_geojson,
      road.geometry_status as current_road_geometry_status,
      pg_catalog.lag(step.road_id) over(order by step.step_order) as previous_road_id
    from public.brinesearch_pad_roads step
    join public.brinesearch_roads road on road.id=step.road_id
    where step.pad_id=p_pad_id and step.route_group='primary' and step.route_variant_index=0
    order by step.step_order
  loop
    if v_step.route_revision<>v_receipt.route_revision
       or v_step.step_geometry is null or v_step.start_point is null or v_step.end_point is null
       or v_step.road_geometry_digest is distinct from pg_catalog.md5(v_step.centerline_geojson::text)
       or v_step.current_road_geometry_status not in (
         'official_centerline_loaded','field_confirmed_centerline','owner_verified_complete'
       ) then return false; end if;

    select count(distinct identity.id)::integer into v_identity_count
    from (
      select distinct point->>'identity_id' as identity_id,
        point->>'identity_source_digest' as identity_source_digest,
        point->'source_segment_keys' as source_segment_keys,
        point->>'mapping_fingerprint' as mapping_fingerprint,
        point->>'source_run_id' as source_run_id,
        point->>'source_page_set_digest' as source_page_set_digest
      from pg_catalog.jsonb_array_elements(v_receipt.manifest->'points') p(point)
      where point->>'occurrence_id'=v_step.route_step_id::text
        and point->>'road_id'=v_step.road_id::text
        and coalesce(point->>'identity_id','')~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and coalesce(point->>'source_run_id','')~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and pg_catalog.jsonb_typeof(point->'source_segment_keys')='array'
        and pg_catalog.jsonb_array_length(point->'source_segment_keys')>0
    ) dependency
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=dependency.identity_id::uuid and identity.active
      and private_verification.brinesearch_issue97_identity_route_usable(
        identity.public_access_status,identity.drivable_status,v_step.road_type
      )
    join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=identity.id and mapping.road_id=v_step.road_id
      and mapping.mapping_status='verified'
    join lateral (
      select pg_catalog.md5(pg_catalog.string_agg(
        segment.source_segment_key||':'||segment.source_digest,','
        order by segment.source_segment_key
      )) as source_digest,
      count(distinct segment.source_segment_key)::integer as source_segment_count,
      extensions.st_linemerge(
        extensions.st_unaryunion(extensions.st_collect(segment.geom))
      ) as source_chain_geom
      from public.brinesearch_authoritative_road_segments segment
      where segment.identity_id=identity.id and segment.active and segment.geom is not null
        and segment.source_segment_key in (
          select pg_catalog.jsonb_array_elements_text(dependency.source_segment_keys)
        )
    ) source on source.source_digest=dependency.identity_source_digest
      and source.source_segment_count=
        pg_catalog.jsonb_array_length(dependency.source_segment_keys)
      and extensions.geometrytype(source.source_chain_geom)='LINESTRING'
      and extensions.st_coveredby(
        v_step.step_geometry,
        extensions.st_buffer(
          source.source_chain_geom::extensions.geography,1.0
        )::extensions.geometry
      )
    join lateral (
      select run.id,run.details->>'page_set_digest' as page_set_digest
      from public.brinesearch_road_source_ingest_runs run
      where run.dataset_id=identity.dataset_id and run.state_code=identity.state_code
        and run.county_code=identity.county_code and run.status='complete'
      order by run.started_at desc,run.id desc limit 1
    ) latest on latest.id=dependency.source_run_id::uuid
      and latest.page_set_digest=dependency.source_page_set_digest
    where private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code
      )
      and dependency.mapping_fingerprint=
        private_verification.brinesearch_issue97_mapping_fingerprint(identity.id);
    if v_identity_count<>1 then return false; end if;

    if v_step.step_order>1 and v_step.previous_road_id<>v_step.road_id then
      if not exists(
        select 1
        from public.brinesearch_road_junction_anchors anchor
        join public.brinesearch_road_junctions junction
          on junction.id=anchor.junction_id and junction.id=v_step.entry_junction_id
          and junction.build_id=v_step.junction_build_id
          and junction.graph_digest=v_step.junction_digest
          and junction.verification_status='verified'
        join public.brinesearch_road_graph_builds build
          on build.id=junction.build_id and build.status='active'
          and private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
        where anchor.id=v_step.entry_junction_anchor_id
      ) then return false; end if;
    elsif v_step.step_order>1 and (
      v_step.entry_junction_anchor_id is not null or v_step.entry_junction_id is not null
      or v_step.junction_build_id is not null or v_step.junction_digest is not null
    ) then return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end
$$;

revoke all on function public.brinesearch_issue97_google_route_current(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_issue97_google_route_current(uuid)
to anon,authenticated,service_role;

create policy brinesearch_driver_google_routes_public_read_issue97
on public.brinesearch_driver_google_routes_public
for select to anon,authenticated
using (public.brinesearch_issue97_google_route_current(pad_id));

create or replace function public.brinesearch_issue97_refresh_google_routes(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r record; v_result jsonb; v_ready integer:=0; v_held integer:=0;
  v_scope record;
begin
  -- Standalone/bulk refreshes take the same deterministic source-generation
  -- locks as graph publication before the global mapping lock. Route publish
  -- and cutover already hold these locks, so the calls are transaction-reentrant.
  for v_scope in
    select scope.dataset_id,scope.state_code,scope.county_code
    from public.brinesearch_road_source_dataset_counties scope
    where scope.active and scope.ingest_enabled
    order by scope.dataset_id,scope.state_code,scope.county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||v_scope.dataset_id::text||':'||v_scope.county_code
    ));
  end loop;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
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

create or replace function private_verification.brinesearch_issue97_process_google_route_refresh_queue()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_revision bigint;
begin
  if exists(select 1 from public.pads pad where pad.id=new.pad_id) then
    begin
      perform private_verification.brinesearch_issue97_refresh_google_route(new.pad_id);
    exception when others then
      select pad.structured_route_revision into v_revision
      from public.pads pad where pad.id=new.pad_id;
      perform private_verification.brinesearch_issue97_hold_google_route(
        new.pad_id,coalesce(v_revision,0),'automatic_route_refresh_failed',
        pg_catalog.jsonb_build_object('sqlstate',sqlstate,'message',sqlerrm),'held'
      );
    end;
  end if;
  delete from private_verification.brinesearch_google_route_refresh_queue_issue97
  where pad_id=new.pad_id;
  return new;
end
$$;

revoke all on function private_verification.brinesearch_issue97_process_google_route_refresh_queue()
from public,anon,authenticated,service_role;
create constraint trigger brinesearch_issue97_google_route_refresh_deferred
after insert on private_verification.brinesearch_google_route_refresh_queue_issue97
deferrable initially deferred
for each row execute function private_verification.brinesearch_issue97_process_google_route_refresh_queue();

-- Cutover is the durable backfill boundary: all existing published primary
-- routes receive exactly one ready-or-held receipt in the same transaction.
alter function public.brinesearch_issue97_activate_cutover(jsonb)
  rename to brinesearch_issue97_activate_cutover_without_google_routes;
revoke all on function public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)
from public,anon,authenticated;

create or replace function public.brinesearch_issue97_activate_cutover(p_review_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_result jsonb; v_google jsonb;
begin
  v_result:=public.brinesearch_issue97_activate_cutover_without_google_routes(p_review_details);
  if coalesce((v_result->>'activated')::boolean,false) then
    v_google:=public.brinesearch_issue97_refresh_google_routes(null);
    return v_result||pg_catalog.jsonb_build_object('google_route_backfill',v_google);
  end if;
  return v_result;
end
$$;

revoke all on function public.brinesearch_issue97_activate_cutover(jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_activate_cutover(jsonb)
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
declare
  v_pad_id uuid;
  v_build_id uuid;
  v_identity_id uuid;
  v_road_id uuid;
  v_dataset_id uuid;
  v_state_code text;
  v_county_code text;
  v_source_segment_key text;
begin
  if tg_table_name='pads' then
    v_pad_id:=new.id;
    if new.latitude is not distinct from old.latitude
       and new.longitude is not distinct from old.longitude
       and new.structured_route_revision is not distinct from old.structured_route_revision
       and new.road_sequence_status is not distinct from old.road_sequence_status then
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
      select affected.pad_id from (
        select receipt.pad_id
        from private_verification.brinesearch_google_route_receipts_issue97 receipt
        where exists(
          select 1 from pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb)) p
          where p->>'graph_build_id'=v_build_id::text
        )
        union
        select step.pad_id from public.brinesearch_pad_roads step
        where step.junction_build_id=v_build_id
      ) affected order by affected.pad_id
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
      select affected.pad_id from (
        select receipt.pad_id
        from private_verification.brinesearch_google_route_receipts_issue97 receipt
        where exists(
          select 1 from pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb)) p
          where p->>'identity_id'=v_identity_id::text or p->>'road_id'=v_road_id::text
        )
        union
        select step.pad_id from public.brinesearch_pad_roads step where step.road_id=v_road_id
      ) affected order by affected.pad_id
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
    for v_pad_id in
      select distinct step.pad_id from public.brinesearch_pad_roads step
      where step.road_id=v_road_id order by step.pad_id
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select structured_route_revision from public.pads where id=v_pad_id),
        'canonical_road_geometry_changed',pg_catalog.jsonb_build_object('road_id',v_road_id),'stale'
      );
    end loop;
  elsif tg_table_name='brinesearch_driver_safety_facts_issue69' then
    v_pad_id:=coalesce(new.pad_id,old.pad_id);
    perform private_verification.brinesearch_issue97_hold_google_route(
      v_pad_id,(select structured_route_revision from public.pads where id=v_pad_id),
      'driver_safety_dependency_changed','{}'::jsonb,'stale'
    );
  elsif tg_table_name='brinesearch_authoritative_road_identities' then
    v_identity_id:=coalesce(new.id,old.id);
    for v_pad_id in
      select distinct step.pad_id
      from public.brinesearch_pad_roads step
      join public.brinesearch_road_identity_mappings mapping on mapping.road_id=step.road_id
      where mapping.identity_id=v_identity_id order by step.pad_id
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select structured_route_revision from public.pads where id=v_pad_id),
        'authoritative_identity_changed',pg_catalog.jsonb_build_object(
          'identity_id',v_identity_id
        ),'stale'
      );
    end loop;
  elsif tg_table_name in (
    'brinesearch_authoritative_external_road_segments',
    'brinesearch_authoritative_segment_identity_assignments'
  ) then
    v_identity_id:=coalesce(new.identity_id,old.identity_id);
    for v_pad_id in
      select distinct step.pad_id
      from public.brinesearch_pad_roads step
      join public.brinesearch_road_identity_mappings mapping on mapping.road_id=step.road_id
      where mapping.identity_id=v_identity_id order by step.pad_id
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select structured_route_revision from public.pads where id=v_pad_id),
        'authoritative_segment_changed',pg_catalog.jsonb_build_object(
          'identity_id',v_identity_id
        ),'stale'
      );
    end loop;
  elsif tg_table_name='brinesearch_odot_road_catalog' then
    v_source_segment_key:='OH:ODOT:SEGMENT:'||
      coalesce(new.roadway_inventory_id,old.roadway_inventory_id);
    for v_pad_id in
      select distinct step.pad_id
      from public.brinesearch_authoritative_segment_identity_assignments assignment
      join public.brinesearch_road_identity_mappings mapping
        on mapping.identity_id=assignment.identity_id
      join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
      where assignment.source_segment_key=v_source_segment_key
      order by step.pad_id
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select structured_route_revision from public.pads where id=v_pad_id),
        'authoritative_odot_segment_changed',pg_catalog.jsonb_build_object(
          'source_segment_key',v_source_segment_key
        ),'stale'
      );
    end loop;
  elsif tg_table_name in (
    'brinesearch_road_source_ingest_runs','brinesearch_road_source_dataset_counties'
  ) then
    v_dataset_id:=coalesce(new.dataset_id,old.dataset_id);
    v_state_code:=coalesce(new.state_code,old.state_code);
    v_county_code:=coalesce(new.county_code,old.county_code);
    for v_pad_id in
      select distinct step.pad_id
      from public.brinesearch_pad_roads step
      join public.brinesearch_road_identity_mappings mapping on mapping.road_id=step.road_id
      join public.brinesearch_authoritative_road_identities identity
        on identity.id=mapping.identity_id
      where identity.dataset_id=v_dataset_id and identity.state_code=v_state_code
        and identity.county_code=v_county_code
      order by step.pad_id
    loop
      perform private_verification.brinesearch_issue97_hold_google_route(
        v_pad_id,(select structured_route_revision from public.pads where id=v_pad_id),
        'authoritative_source_scope_changed',pg_catalog.jsonb_build_object(
          'dataset_id',v_dataset_id,'state_code',v_state_code,'county_code',v_county_code
        ),'stale'
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
after update of latitude,longitude,structured_route_revision,road_sequence_status on public.pads
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
create trigger brinesearch_issue97_google_route_safety_stale
after insert or update or delete on private_verification.brinesearch_driver_safety_facts_issue69
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_identity_stale
after insert or update or delete on public.brinesearch_authoritative_road_identities
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_external_segment_stale
after insert or update or delete on public.brinesearch_authoritative_external_road_segments
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_assignment_stale
after insert or update or delete on public.brinesearch_authoritative_segment_identity_assignments
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_odot_segment_stale
after insert or update or delete on public.brinesearch_odot_road_catalog
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_ingest_stale
after insert or update or delete on public.brinesearch_road_source_ingest_runs
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
create trigger brinesearch_issue97_google_route_scope_stale
after insert or update or delete on public.brinesearch_road_source_dataset_counties
for each row execute function private_verification.brinesearch_issue97_invalidate_google_route_trigger();
