-- GitHub #97 — bind receipts to verified source runs and repair the transition-Google
-- path against the current production receipt schema.
--
-- A failed retry with the same immutable source snapshot is intentionally allowed to
-- leave the prior verified generation current. Graph/source receipts must therefore
-- bind the latest VERIFIED run, never the newest failed attempt. The transition-Google
-- functions also predated the current occurrence/geometry/transition receipt columns.
-- This migration fails closed and keeps all no-guess rules intact.

create or replace function private_verification.brinesearch_issue97_current_verified_run_id(
  p_dataset_id uuid,
  p_state_code text,
  p_county_code text
)
returns uuid
language sql
stable
security definer
set search_path=''
as $$
  select case
    when private_verification.brinesearch_issue97_dataset_scope_current(
      p_dataset_id,p_state_code,p_county_code
    ) then (
      select r.id
      from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=p_dataset_id
        and r.state_code=p_state_code
        and r.county_code=p_county_code
        and private_verification.brinesearch_issue97_ingest_run_verified(r.id)
      order by r.started_at desc,r.id desc
      limit 1
    )
    else null
  end
$$;

revoke all on function private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)
to service_role;

comment on function private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text) is
  'Issue #97 current source-generation selector. Returns the newest verified-complete run only when the dataset scope is current. A newer failed retry with the identical immutable snapshot may leave the older verified run current, but the failed run id is never returned as receipt provenance.';

-- Graph builds must freeze the verified generation, not a compatible failed retry.
do $issue97_patch_graph_verified_run_vector$
declare
  v_definition text;
  v_old text:=$old$
    join lateral (
      select r.* from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=required.dataset_id and r.state_code=required.state_code
        and r.county_code=required.county_code
      order by r.started_at desc,r.id desc limit 1
    ) run on true
$old$;
  v_new text:=$new$
    join lateral (
      select r.* from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=required.dataset_id and r.state_code=required.state_code
        and r.county_code=required.county_code
        and r.id=private_verification.brinesearch_issue97_current_verified_run_id(
          required.dataset_id,required.state_code,required.county_code
        )
        and private_verification.brinesearch_issue97_ingest_run_verified(r.id)
      order by r.started_at desc,r.id desc limit 1
    ) run on true
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 verified graph-run patch target changed unexpectedly: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_graph_verified_run_vector$;

-- An active build is current when each frozen entry is the current verified run.
do $issue97_patch_graph_current_verified_run$
declare
  v_definition text;
  v_old text:=$old$
          and r.id=(select latest.id
            from public.brinesearch_road_source_ingest_runs latest
            where latest.dataset_id=r.dataset_id and latest.state_code=r.state_code
              and latest.county_code=r.county_code
            order by latest.started_at desc,latest.id desc limit 1)
          and private_verification.brinesearch_issue97_dataset_scope_current(
            r.dataset_id,r.state_code,r.county_code
          )
$old$;
  v_new text:=$new$
          and private_verification.brinesearch_issue97_ingest_run_verified(r.id)
          and r.id=private_verification.brinesearch_issue97_current_verified_run_id(
            r.dataset_id,r.state_code,r.county_code
          )
          and private_verification.brinesearch_issue97_dataset_scope_current(
            r.dataset_id,r.state_code,r.county_code
          )
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 graph-current verified-run patch target changed unexpectedly: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_graph_current_verified_run$;

-- Activation compares the build vector with the current verified generation.
do $issue97_patch_graph_activation_verified_run$
declare
  v_definition text;
  v_old text:=$old$
    select r.id into v_latest_run
    from public.brinesearch_road_source_ingest_runs r
    where r.dataset_id=(v_source_entry->>'dataset_id')::uuid
      and r.state_code=v_source_entry->>'state_code'
      and r.county_code=v_source_entry->>'county_code'
    order by r.started_at desc,r.id desc limit 1;
$old$;
  v_new text:=$new$
    v_latest_run:=private_verification.brinesearch_issue97_current_verified_run_id(
      (v_source_entry->>'dataset_id')::uuid,
      v_source_entry->>'state_code',
      v_source_entry->>'county_code'
    );
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 graph-activation verified-run patch target changed unexpectedly: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  v_definition:=pg_catalog.replace(v_definition,"'latest_run_id',v_latest_run","'current_verified_run_id',v_latest_run");
  execute v_definition;
end
$issue97_patch_graph_activation_verified_run$;

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
  v_route_count integer:=0;
  v_occ_count integer:=0;
  v_geom_count integer:=0;
  v_transition_count integer:=0;
  v_source_count integer:=0;
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
  select * into strict v_route
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
      or o.mapping_fingerprint is distinct from
        private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)
      or o.source_digest is distinct from i.source_digest
      or not private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      )
    )
  ) then return null; end if;

  select count(*)::integer into v_geom_count
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
  where g.route_prep_id=v_route.id;
  if v_geom_count<>v_occ_count then return null; end if;
  if exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    join private_verification.brinesearch_route_occurrence_receipts_issue97 o
      on o.route_prep_id=g.route_prep_id and o.occurrence_index=g.occurrence_index
    where g.route_prep_id=v_route.id and (
      g.status<>'resolved'
      or g.identity_id is distinct from o.identity_id
      or g.road_id is distinct from o.canonical_road_id
      or g.road_geometry_digest is distinct from
        private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(g.identity_id)
      or (g.occurrence_index=1 and (
        g.occurrence_role<>'origin_anchor' or g.end_coordinate is null
      ))
      or (g.occurrence_index>1 and (
        g.occurrence_role<>'traveled' or g.step_geometry is null
        or g.start_coordinate is null or g.end_coordinate is null
        or extensions.geometrytype(g.step_geometry)<>'LINESTRING'
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
    left join public.brinesearch_road_junctions j on j.id=t.junction_id
    left join public.brinesearch_road_junction_anchors a on a.id=t.anchor_id
    left join public.brinesearch_road_graph_builds b on b.id=t.graph_build_id
    where t.route_prep_id=v_route.id and (
      t.status<>'resolved'
      or t.coordinate is null or t.junction_id is null or t.anchor_id is null
      or t.graph_build_id is null or t.anchor_digest is null
      or t.graph_digest is null or t.source_revision_digest is null
      or j.id is null or a.id is null or b.id is null
      or j.build_id is distinct from t.graph_build_id
      or a.junction_id is distinct from t.junction_id
      or t.graph_digest is distinct from j.graph_digest
      or t.anchor_digest is distinct from a.anchor_digest
      or t.source_revision_digest is distinct from b.source_revision_digest
      or b.status<>'active'
      or not private_verification.brinesearch_issue97_graph_build_sources_current(t.graph_build_id)
    )
  ) then return null; end if;

  with current_sources as (
    select o.occurrence_index,i.id as identity_id,i.dataset_id,i.state_code,i.county_code,
      run.id as run_id,run.details->>'page_set_digest' as page_set_digest
    from private_verification.brinesearch_route_occurrence_receipts_issue97 o
    join public.brinesearch_authoritative_road_identities i
      on i.id=o.identity_id and i.active
    join lateral (
      select private_verification.brinesearch_issue97_current_verified_run_id(
        i.dataset_id,i.state_code,i.county_code
      ) as run_id
    ) current_run on current_run.run_id is not null
    join public.brinesearch_road_source_ingest_runs run
      on run.id=current_run.run_id
      and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
    where o.route_prep_id=v_route.id and o.occurrence_index>1
      and private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      )
  )
  select count(*)::integer,
    pg_catalog.string_agg(
      occurrence_index::text||':'||identity_id::text||':'||run_id::text||':'||
        coalesce(page_set_digest,''),
      '|' order by occurrence_index
    )
  into v_source_count,v_source_dependency
  from current_sources;
  if v_source_count<>v_occ_count-1 or v_source_dependency is null then return null; end if;

  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(p_pad_id);
  v_safety_digest:=pg_catalog.md5(coalesce(v_safety,'{}'::jsonb)::text);
  if coalesce((v_safety->>'has_hold')::boolean,false) then return null; end if;
  if private_verification.brinesearch_issue97_route_data_blocked(p_pad_id) then return null; end if;

  v_dependency:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_route.id::text,
    coalesce(v_route.source_sequence_hash,''),
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
  ));
  return v_dependency;
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_dependency(uuid)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_transition_google_dependency(uuid)
to service_role;

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
  v_route_count integer:=0;
  v_occ_count integer:=0;
  v_total_m numeric:=0;
  v_manifest jsonb;
  v_base_manifest jsonb;
  v_points jsonb;
  v_roads jsonb;
  v_dependency text;
  v_manifest_digest text;
  v_route_revision bigint;
  v_old_revision bigint;
  v_old_dependency text;
  v_safety jsonb;
  v_safety_digest text;
  v_source_dependency_digest text;
  v_graph_dependency_digest text;
  v_mapping_dependency_digest text;
  v_point_count integer:=0;
  v_now timestamptz:=pg_catalog.now();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );

  select * into v_pad from public.pads where id=p_pad_id for update;
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
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','active_primary_count',v_route_count,'no_guess',true)
    );
  end if;
  select * into strict v_route
  from public.brinesearch_route_prep
  where pad_id=p_pad_id and active and route_group='primary'
  limit 1;

  v_dependency:=private_verification.brinesearch_issue97_transition_google_dependency(p_pad_id);
  if v_dependency is null then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'transition_route_dependencies_not_current_or_exact',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  select count(*)::integer into v_occ_count
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  where o.route_prep_id=v_route.id;

  drop table if exists pg_temp.tmp_issue97_transition_google_sources;
  create temp table tmp_issue97_transition_google_sources on commit drop as
  select
    g.occurrence_index,g.route_prep_step_id,o.identity_id,o.canonical_road_id,
    i.dataset_id,i.state_code,i.county_code,i.source_identity_key,d.source_key,
    current_run.run_id,
    run.details->>'page_set_digest' as source_page_set_digest,
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
    on d.id=i.dataset_id and d.active
  join lateral (
    select private_verification.brinesearch_issue97_current_verified_run_id(
      i.dataset_id,i.state_code,i.county_code
    ) as run_id
  ) current_run on current_run.run_id is not null
  join public.brinesearch_road_source_ingest_runs run
    on run.id=current_run.run_id
    and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
  join public.brinesearch_authoritative_road_segments s
    on s.identity_id=i.id and s.dataset_id=i.dataset_id and s.active
    and extensions.st_dwithin(
      s.geom::extensions.geography,g.step_geometry::extensions.geography,1
    )
  where g.route_prep_id=v_route.id and g.occurrence_index>1 and g.status='resolved'
    and private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
    and o.mapping_fingerprint=private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)
    and o.source_digest=i.source_digest
    and g.identity_id=o.identity_id and g.road_id=o.canonical_road_id
  group by
    g.occurrence_index,g.route_prep_step_id,o.identity_id,o.canonical_road_id,
    i.dataset_id,i.state_code,i.county_code,i.source_identity_key,d.source_key,
    current_run.run_id,run.details,g.step_geometry;

  if (select count(*) from tmp_issue97_transition_google_sources)<>v_occ_count-1 then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'current_authoritative_source_chain_missing_for_traveled_occurrence',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,
        'expected',v_occ_count-1,'observed',(select count(*) from tmp_issue97_transition_google_sources),'no_guess',true
      )
    );
  end if;

  if exists(
    select 1 from tmp_issue97_transition_google_sources src
    where not (
      extensions.st_dwithin(src.source_geom::extensions.geography,extensions.st_startpoint(src.step_geometry)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,extensions.st_lineinterpolatepoint(src.step_geometry,0.25)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,extensions.st_lineinterpolatepoint(src.step_geometry,0.50)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,extensions.st_lineinterpolatepoint(src.step_geometry,0.75)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,extensions.st_endpoint(src.step_geometry)::extensions.geography,1)
    )
  ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'canonical_occurrence_not_covered_by_current_authoritative_source',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  drop table if exists pg_temp.tmp_issue97_transition_google_path;
  create temp table tmp_issue97_transition_google_path on commit drop as
  with lengths as (
    select g.*,
      extensions.st_length(g.step_geometry::extensions.geography)::numeric as length_m
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    where g.route_prep_id=v_route.id and g.occurrence_index>1 and g.status='resolved'
  )
  select l.*,
    (sum(length_m) over(order by occurrence_index rows between unbounded preceding and current row)-length_m)::numeric as start_m,
    sum(length_m) over(order by occurrence_index rows between unbounded preceding and current row)::numeric as end_m
  from lengths l;
  select coalesce(max(end_m),0) into v_total_m from tmp_issue97_transition_google_path;

  drop table if exists pg_temp.tmp_issue97_transition_google_points;
  create temp table tmp_issue97_transition_google_points(
    sort_m numeric not null,
    tie_order integer not null,
    stable_key text not null,
    point jsonb not null
  ) on commit drop;

  insert into tmp_issue97_transition_google_points(sort_m,tie_order,stable_key,point)
  select 0,10,'ingress:'||src.route_prep_step_id::text,
    pg_catalog.jsonb_build_object(
      'kind','shape','shape_role','route_ingress',
      'latitude',extensions.st_y(q.snapped)::numeric,
      'longitude',extensions.st_x(q.snapped)::numeric,
      'occurrence_id',src.route_prep_step_id,
      'source_kind','authoritative_clipped_geometry',
      'source_segment_keys',pg_catalog.to_jsonb(src.source_segment_keys),
      'source_digest',src.source_segment_digest,
      'source_run_id',src.run_id,
      'source_page_set_digest',src.source_page_set_digest
    )
  from tmp_issue97_transition_google_path p
  join tmp_issue97_transition_google_sources src using(occurrence_index)
  cross join lateral (
    select extensions.st_closestpoint(src.source_geom,p.start_coordinate)::extensions.geometry(Point,4326) as snapped
  ) q
  where p.occurrence_index=2
    and extensions.st_dwithin(q.snapped::extensions.geography,p.start_coordinate::extensions.geography,1);

  if not exists(select 1 from tmp_issue97_transition_google_points where sort_m=0 and tie_order=10) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'route_ingress_not_on_current_authoritative_source_chain',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  insert into tmp_issue97_transition_google_points(sort_m,tie_order,stable_key,point)
  select c.route_position_m,20,
    'shape:'||c.route_prep_step_id::text||':'||c.route_position_m::text,
    pg_catalog.jsonb_build_object(
      'kind','shape','shape_role','intermediate',
      'latitude',extensions.st_y(c.snapped)::numeric,
      'longitude',extensions.st_x(c.snapped)::numeric,
      'occurrence_id',c.route_prep_step_id,
      'source_kind','authoritative_clipped_geometry',
      'source_segment_keys',pg_catalog.to_jsonb(c.source_segment_keys),
      'source_digest',c.source_segment_digest,
      'source_run_id',c.run_id,
      'source_page_set_digest',c.source_page_set_digest
    )
  from (
    select p.route_prep_step_id,(p.start_m+gs.m)::numeric as route_position_m,
      src.source_segment_keys,src.source_segment_digest,src.run_id,src.source_page_set_digest,
      q.snapped,
      extensions.st_distance(q.snapped::extensions.geography,q.candidate::extensions.geography) as source_distance_m
    from tmp_issue97_transition_google_path p
    join tmp_issue97_transition_google_sources src using(occurrence_index)
    cross join lateral generate_series(500::numeric,greatest(500::numeric,p.length_m-100),500::numeric) gs(m)
    cross join lateral (
      select extensions.st_lineinterpolatepoint(p.step_geometry,gs.m/nullif(p.length_m,0))::extensions.geometry(Point,4326) as candidate
    ) candidate_point
    cross join lateral (
      select candidate_point.candidate,
        extensions.st_closestpoint(src.source_geom,candidate_point.candidate)::extensions.geometry(Point,4326) as snapped
    ) q
    where p.length_m>700 and gs.m<p.length_m-100
  ) c
  where c.source_distance_m<=1;

  insert into tmp_issue97_transition_google_points(sort_m,tie_order,stable_key,point)
  select p.end_m,30,'transition:'||t.boundary_index::text||':'||t.anchor_id::text,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',case t.anchor_role when 'shared_start' then 'shared_entry' when 'shared_end' then 'shared_exit' else 'junction' end,
      'latitude',extensions.st_y(t.coordinate)::numeric,
      'longitude',extensions.st_x(t.coordinate)::numeric,
      'source_kind','authoritative_junction_anchor',
      'junction_id',t.junction_id,'anchor_id',t.anchor_id,'anchor_role',t.anchor_role,
      'graph_build_id',t.graph_build_id,'graph_digest',t.graph_digest,'anchor_digest',t.anchor_digest,
      'junction_stable_key',j.stable_junction_key,'junction_type',j.junction_type,
      'shared_geometry_digest',case when j.junction_type='shared_segment' then pg_catalog.md5(extensions.st_asewkb(j.geom)) else null end,
      'shared_span_start',case when j.junction_type='shared_segment' then pg_catalog.jsonb_build_array(
        extensions.st_x(extensions.st_startpoint(j.geom)),extensions.st_y(extensions.st_startpoint(j.geom))) else null end,
      'shared_span_end',case when j.junction_type='shared_segment' then pg_catalog.jsonb_build_array(
        extensions.st_x(extensions.st_endpoint(j.geom)),extensions.st_y(extensions.st_endpoint(j.geom))) else null end
    ))
  from private_verification.brinesearch_route_transition_receipts_issue97 t
  join tmp_issue97_transition_google_path p on p.occurrence_index=t.boundary_index
  join public.brinesearch_road_junctions j on j.id=t.junction_id
  where t.route_prep_id=v_route.id and t.boundary_index>=2 and t.status='resolved';

  insert into tmp_issue97_transition_google_points(sort_m,tie_order,stable_key,point)
  values(
    v_total_m+1,100,'pad:'||p_pad_id::text,
    pg_catalog.jsonb_build_object(
      'kind','pad_destination','latitude',v_pad.latitude,'longitude',v_pad.longitude,
      'pad_id',p_pad_id,'source_kind','saved_pad_gps'
    )
  );

  with ordered as (
    select sort_m,tie_order,stable_key,point,
      pg_catalog.round((point->>'latitude')::numeric,7)::text||','||
        pg_catalog.round((point->>'longitude')::numeric,7)::text as point_key,
      lag(pg_catalog.round((point->>'latitude')::numeric,7)::text||','||
        pg_catalog.round((point->>'longitude')::numeric,7)::text)
        over(order by sort_m,tie_order,stable_key) as previous_key
    from tmp_issue97_transition_google_points
  ), filtered as (
    select * from ordered
    where previous_key is distinct from point_key
      or coalesce(point->>'shape_role','')='route_ingress'
      or coalesce(point->>'kind','')='pad_destination'
  ), numbered as (
    select point||pg_catalog.jsonb_build_object(
      'sequence',row_number() over(order by sort_m,tie_order,stable_key)
    ) as point,
    row_number() over(order by sort_m,tie_order,stable_key) as sequence
    from filtered
  )
  select pg_catalog.jsonb_agg(point order by sequence),count(*)::integer
  into v_points,v_point_count
  from numbered;

  if v_point_count<2
     or coalesce(v_points->0->>'kind','')<>'shape'
     or coalesce(v_points->0->>'shape_role','')<>'route_ingress'
     or coalesce(v_points->(v_point_count-1)->>'kind','')<>'pad_destination'
     or exists(
       select 1 from pg_catalog.jsonb_array_elements(v_points) with ordinality p(point,ordinality)
       where (p.point->>'sequence')::integer<>p.ordinality
     ) then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'transition_google_manifest_control_points_invalid',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'point_count',v_point_count,'no_guess',true)
    );
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'occurrence_index',o.occurrence_index,'road_id',o.canonical_road_id,
      'identity_id',o.identity_id,'display_name',o.driver_road_name,'aliases',o.valid_aliases,
      'turn_direction',g.outbound_turn,
      'distance_miles',case when g.geometry_miles is not null then pg_catalog.round(g.geometry_miles::numeric,3) else null end
    )) order by o.occurrence_index
  ) into v_roads
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  left join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    on g.route_prep_id=o.route_prep_id and g.occurrence_index=o.occurrence_index
  where o.route_prep_id=v_route.id;

  select pg_catalog.md5(pg_catalog.string_agg(
    src.occurrence_index::text||':'||src.source_segment_digest||':'||src.run_id::text||':'||
      coalesce(src.source_page_set_digest,''),'|' order by src.occurrence_index
  )) into v_source_dependency_digest
  from tmp_issue97_transition_google_sources src;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    t.graph_digest||':'||t.anchor_digest,'|' order by t.boundary_index
  ),'')) into v_graph_dependency_digest
  from private_verification.brinesearch_route_transition_receipts_issue97 t
  where t.route_prep_id=v_route.id;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    o.mapping_fingerprint,'|' order by o.occurrence_index
  ),'')) into v_mapping_dependency_digest
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  where o.route_prep_id=v_route.id;
  v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(p_pad_id);
  v_safety_digest:=pg_catalog.md5(coalesce(v_safety,'{}'::jsonb)::text);

  select route_revision,dependency_digest into v_old_revision,v_old_dependency
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  if v_old_revision is not null and v_old_revision>0 and v_old_dependency=v_dependency then
    v_route_revision:=v_old_revision;
  else
    v_route_revision:=greatest(coalesce(v_old_revision,0),coalesce(v_pad.brinesearch_google_route_revision_issue97,0),0)+1;
  end if;

  v_base_manifest:=pg_catalog.jsonb_build_object(
    'manifest_version','issue97-google-v1','manifest_mode','transition_geometry',
    'route_ready',true,'status','ready','pad_id',p_pad_id,'route_revision',v_route_revision,
    'source_revision',v_route.updated_at,'route_prep_id',v_route.id,
    'origin_mode','current_location_until_route_ingress','occurrence_count',v_occ_count,
    'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
    'driver_road_sequence',coalesce(v_roads,'[]'::jsonb),'points',v_points,
    'dependency_digest',v_dependency,'safety_digest',v_safety_digest,
    'provenance',pg_catalog.jsonb_build_object(
      'route_occurrences','exact authoritative identity receipts',
      'transitions','verified current #97 junction/anchor receipts',
      'geometry','authoritative identity component clipped between exact transition anchors',
      'shaping','same-identity current authoritative source segments within one meter',
      'destination','saved pad GPS on the resolved final authoritative road within one meter',
      'manual_map_editor','review_exception_qa_only','name_only_resolution',false,
      'nearest_road_resolution',false,'fuzzy_resolution',false
    )
  );
  v_manifest_digest:=pg_catalog.md5(v_base_manifest::text);
  v_manifest:=v_base_manifest||pg_catalog.jsonb_build_object('manifest_digest',v_manifest_digest);

  -- Recompute the dependency after all source/graph work while locks are held.
  if private_verification.brinesearch_issue97_transition_google_dependency(p_pad_id)
       is distinct from v_dependency then
    return private_verification.brinesearch_issue97_hold_google_route(
      p_pad_id,v_route_revision,'route_dependency_changed_during_generation',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  insert into private_verification.brinesearch_google_route_receipts_issue97(
    pad_id,route_revision,status,hold_reason,manifest_version,manifest_digest,
    dependency_digest,manifest,evidence,generated_at,updated_at
  ) values(
    p_pad_id,v_route_revision,'ready',null,'issue97-google-v1',v_manifest_digest,
    v_dependency,v_manifest,
    pg_catalog.jsonb_build_object(
      'manifest_mode','transition_geometry','route_prep_id',v_route.id,
      'point_count',v_point_count,'occurrence_count',v_occ_count,
      'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
      'source_dependency_digest',v_source_dependency_digest,
      'graph_dependency_digest',v_graph_dependency_digest,
      'mapping_dependency_digest',v_mapping_dependency_digest,
      'safety_digest',v_safety_digest,'no_guess',true
    ),v_now,v_now
  )
  on conflict(pad_id) do update set
    route_revision=excluded.route_revision,status='ready',hold_reason=null,
    manifest_version=excluded.manifest_version,manifest_digest=excluded.manifest_digest,
    dependency_digest=excluded.dependency_digest,manifest=excluded.manifest,
    evidence=excluded.evidence,generated_at=excluded.generated_at,updated_at=excluded.updated_at;

  insert into public.brinesearch_driver_google_routes_public(
    pad_id,legacy_id,route_revision,source_revision,manifest
  ) values(
    p_pad_id,v_pad.legacy_id,v_route_revision,v_route.updated_at,v_manifest
  )
  on conflict(pad_id) do update set
    legacy_id=excluded.legacy_id,route_revision=excluded.route_revision,
    source_revision=excluded.source_revision,manifest=excluded.manifest;

  update public.pads set
    brinesearch_google_route_status_issue97='ready',
    brinesearch_google_route_revision_issue97=v_route_revision
  where id=p_pad_id;
  delete from private_verification.brinesearch_google_route_refresh_queue_issue97
  where pad_id=p_pad_id;

  return pg_catalog.jsonb_build_object(
    'status','ready','manifest_mode','transition_geometry','pad_id',p_pad_id,
    'route_prep_id',v_route.id,'route_revision',v_route_revision,
    'occurrence_count',v_occ_count,'point_count',v_point_count,
    'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
    'manifest_digest',v_manifest_digest,'dependency_digest',v_dependency
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)
to service_role;

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
  if v_dependency is null or v_receipt.dependency_digest is distinct from v_dependency then return false; end if;

  return v_receipt.manifest_digest is not null and exists(
    select 1 from public.brinesearch_driver_google_routes_public pub
    where pub.pad_id=p_pad_id
      and pub.route_revision=v_receipt.route_revision
      and coalesce(pub.manifest->>'manifest_digest','')=v_receipt.manifest_digest
      and pg_catalog.md5((pub.manifest-'manifest_digest')::text)=v_receipt.manifest_digest
      and coalesce(pub.manifest->>'manifest_mode','')='transition_geometry'
      and coalesce((pub.manifest->>'route_ready')::boolean,false)
      and coalesce(pub.manifest->>'dependency_digest','')=v_dependency
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_current(uuid)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_transition_google_current(uuid)
to service_role;

-- Guard the repaired transition functions against the obsolete schema names that
-- caused the production runtime failure.
do $issue97_assert_transition_google_current_schema$
declare
  v_dep text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure
  );
  v_refresh text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  );
begin
  if v_dep ilike '%last_success_run_id%'
     or v_dep ilike '%brinesearch_issue97_road_mapping_fingerprint%'
     or v_dep ilike '%graph_build_digest%'
     or v_dep ilike '%geometry_kind%'
     or v_refresh ilike '%last_success_run_id%'
     or v_refresh ilike '%brinesearch_issue97_road_mapping_fingerprint%'
     or v_refresh ilike '%graph_build_digest%'
     or v_refresh ilike '%junction_key%'
     or v_refresh ilike '%shared_geometry%'
     or v_refresh ilike '%g.miles%'
     or v_refresh ilike '%source_revision_digest,graph_dependency_digest%'
  then
    raise exception 'Issue #97 transition Google current-schema hardening did not install cleanly';
  end if;
end
$issue97_assert_transition_google_current_schema$;
