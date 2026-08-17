-- GitHub #97 — split exact private/dark Google evidence from cutover-gated public projection.
-- Repository checkpoint only: installation is separately reviewed and authorized.
-- The complete currentness/no-guess contract is preserved; only publication coupling and
-- route-stage ordering are changed.

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

revoke all on function private_verification.brinesearch_issue97_current_verified_run_id(
  uuid,text,text
) from public,anon,authenticated,service_role;

comment on function private_verification.brinesearch_issue97_current_verified_run_id(
  uuid,text,text
) is
  'Issue #97 current source-generation selector: newest verified-complete run only when the exact dataset/state/county scope remains current. This follows dataset_scope_current and intentionally does not depend on an obsolete saved-run pointer schema contract.';

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
  select p.* into v_pad from public.pads p where p.id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return null; end if;
  if v_pad.latitude is null or v_pad.longitude is null
     or v_pad.latitude not between -90 and 90
     or v_pad.longitude not between -180 and 180 then return null; end if;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep r
  where r.pad_id=p_pad_id and r.active and r.route_group='primary';
  if v_route_count<>1 then return null; end if;
  select r.* into strict v_route
  from public.brinesearch_route_prep r
  where r.pad_id=p_pad_id and r.active and r.route_group='primary'
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
      on b.route_prep_id=a.route_prep_id and b.occurrence_index=a.occurrence_index+1
    where a.route_prep_id=v_route.id
      and not extensions.st_dwithin(
        a.end_coordinate::extensions.geography,
        b.start_coordinate::extensions.geography,1
      )
  ) then return null; end if;
  if not exists(
    select 1
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    where g.route_prep_id=v_route.id and g.occurrence_index=v_occ_count and g.status='resolved'
      and extensions.st_dwithin(
        g.end_coordinate::extensions.geography,
        extensions.st_setsrid(
          extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326
        )::extensions.geography,1
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
      t.status<>'resolved' or t.coordinate is null
      or t.junction_id is null or t.anchor_id is null or t.graph_build_id is null
      or t.anchor_digest is null or t.graph_digest is null or t.source_revision_digest is null
      or j.id is null or a.id is null or b.id is null
      or j.build_id is distinct from t.graph_build_id
      or a.junction_id is distinct from t.junction_id
      or t.graph_digest is distinct from j.graph_digest
      or t.anchor_digest is distinct from a.anchor_digest
      or t.source_revision_digest is distinct from b.source_revision_digest
      or b.status<>'active'
      or not private_verification.brinesearch_issue97_graph_build_release_current_contextual(t.graph_build_id)
    )
  ) then return null; end if;

  with current_sources as (
    select o.occurrence_index,i.id as identity_id,i.dataset_id,i.state_code,i.county_code,
      run.id as run_id,run.details->>'page_set_digest' as page_set_digest
    from private_verification.brinesearch_route_occurrence_receipts_issue97 o
    join public.brinesearch_authoritative_road_identities i on i.id=o.identity_id and i.active
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
    v_route.id::text,coalesce(v_route.source_sequence_hash,''),
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
    v_source_dependency,v_safety_digest
  ));
  return v_dependency;
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_dependency(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_hold_google_route_dark(
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
declare
  v_status text:=case when p_status='stale' then 'stale' else 'held' end;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );
  if not exists(select 1 from public.pads where id=p_pad_id) then
    raise exception 'Pad not found' using errcode='P0002';
  end if;
  insert into private_verification.brinesearch_google_route_receipts_issue97(
    pad_id,route_revision,status,hold_reason,manifest_version,manifest_digest,
    dependency_digest,manifest,evidence,generated_at,updated_at
  ) values(
    p_pad_id,greatest(coalesce(p_route_revision,0),0),v_status,
    nullif(pg_catalog.btrim(coalesce(p_reason,'')),''),'issue97-google-v1',null,null,
    pg_catalog.jsonb_build_object(
      'manifest_version','issue97-google-v1','manifest_mode','transition_geometry',
      'publication_mode','private_dark','public_projected',false,
      'route_ready',false,'status',v_status,'pad_id',p_pad_id,
      'route_revision',greatest(coalesce(p_route_revision,0),0)
    ),
    coalesce(p_evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'manifest_mode','transition_geometry','publication_mode','private_dark',
      'public_projected',false,'no_guess',true
    ),pg_catalog.now(),pg_catalog.now()
  )
  on conflict(pad_id) do update set
    route_revision=excluded.route_revision,status=excluded.status,
    hold_reason=excluded.hold_reason,manifest_version=excluded.manifest_version,
    manifest_digest=null,dependency_digest=null,manifest=excluded.manifest,
    evidence=excluded.evidence,generated_at=excluded.generated_at,
    updated_at=excluded.updated_at;
  return pg_catalog.jsonb_build_object(
    'pad_id',p_pad_id,'route_revision',greatest(coalesce(p_route_revision,0),0),
    'route_ready',false,'status',v_status,'hold_reason',p_reason,
    'manifest_mode','transition_geometry','publication_mode','private_dark',
    'public_projected',false,
    'evidence',coalesce(p_evidence,'{}'::jsonb)
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_hold_google_route_dark(
  uuid,bigint,text,jsonb,text
) from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_refresh_google_route_transition_dark(
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
  v_dependency text;
  v_old_revision bigint;
  v_old_dependency text;
  v_route_revision bigint;
  v_total_m numeric:=0;
  v_points jsonb:='[]'::jsonb;
  v_roads jsonb:='[]'::jsonb;
  v_base_manifest jsonb;
  v_manifest jsonb;
  v_manifest_digest text;
  v_source_dependency_digest text;
  v_graph_dependency_digest text;
  v_mapping_dependency_digest text;
  v_safety jsonb;
  v_safety_digest text;
  v_point_count integer:=0;
  v_now timestamptz:=pg_catalog.now();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );

  select p.* into v_pad from public.pads p where p.id=p_pad_id for update;
  if not found then raise exception 'Pad not found' using errcode='P0002'; end if;
  v_route_revision:=greatest(coalesce(v_pad.brinesearch_google_route_revision_issue97,0),1);

  if coalesce(v_pad.list_only,false) then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'pad_not_in_current_route_scope',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','no_guess',true)
    );
  end if;

  select count(*)::integer into v_route_count
  from public.brinesearch_route_prep r
  where r.pad_id=p_pad_id and r.active and r.route_group='primary';
  if v_route_count<>1 then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,
      case when v_route_count=0 then 'active_primary_route_prep_missing'
           else 'multiple_active_primary_route_preps' end,
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','active_primary_count',v_route_count,'no_guess',true
      )
    );
  end if;
  select r.* into strict v_route
  from public.brinesearch_route_prep r
  where r.pad_id=p_pad_id and r.active and r.route_group='primary'
  limit 1;

  v_dependency:=private_verification.brinesearch_issue97_transition_google_dependency(p_pad_id);
  if v_dependency is null then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'transition_route_dependencies_not_current_or_exact',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  select count(*)::integer into v_occ_count
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  where o.route_prep_id=v_route.id;
  if v_occ_count<2 then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'route_occurrence_chain_incomplete',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  drop table if exists pg_temp.tmp_issue97_transition_google_sources;
  create temp table tmp_issue97_transition_google_sources on commit drop as
  with source_candidates as (
    select
      g.occurrence_index,g.route_prep_step_id,o.identity_id,o.canonical_road_id,
      i.dataset_id,i.state_code,i.county_code,i.source_identity_key,d.source_key,
      run.id as source_run_id,run.details->>'page_set_digest' as source_page_set_digest,
      g.step_geometry,
      s.segment_id as segment_id,s.source_segment_key,s.source_record_id,s.source_digest,s.geom
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    join private_verification.brinesearch_route_occurrence_receipts_issue97 o
      on o.route_prep_id=g.route_prep_id and o.occurrence_index=g.occurrence_index
    join public.brinesearch_authoritative_road_identities i
      on i.id=o.identity_id and i.active
    join public.brinesearch_road_source_datasets d on d.id=i.dataset_id and d.active
    join lateral (
      select private_verification.brinesearch_issue97_current_verified_run_id(
        i.dataset_id,i.state_code,i.county_code
      ) as run_id
    ) current_run on current_run.run_id is not null
    join public.brinesearch_road_source_ingest_runs run
      on run.id=current_run.run_id
      and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
    join lateral (
      select q.segment_id,q.source_segment_key,q.source_record_id,q.source_digest,q.geom
      from (
        select
          private_verification.brinesearch_issue97_uuid(a.source_segment_key) as segment_id,
          a.source_segment_key,
          c.roadway_inventory_id as source_record_id,
          pg_catalog.md5(
            c.attributes::text||coalesce(extensions.st_asewkb(c.geom)::text,'')
          ) as source_digest,
          c.geom
        from public.brinesearch_authoritative_segment_identity_assignments a
        join public.brinesearch_odot_road_catalog c
          on a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
        where a.identity_id=i.id and a.dataset_id=i.dataset_id and a.active
          and c.source_active and c.geom is not null
          and not extensions.st_isempty(c.geom)
          and extensions.st_isvalid(c.geom)
          and extensions.st_issimple(c.geom)
          and extensions.st_dimension(c.geom)=1
          and extensions.st_coveredby(
            c.geom,extensions.st_makeenvelope(-180,-90,180,90,4326)
          )
        union all
        select
          s.id as segment_id,
          s.source_segment_key,
          s.source_record_id,
          s.source_digest,
          s.geom
        from public.brinesearch_authoritative_external_road_segments s
        where s.identity_id=i.id and s.dataset_id=i.dataset_id
          and s.active and s.geom is not null
      ) q
      offset 0
    ) s on extensions.st_dwithin(
      s.geom::extensions.geography,g.step_geometry::extensions.geography,1
    )
    where g.route_prep_id=v_route.id and g.occurrence_index>1 and g.status='resolved'
      and g.step_geometry is not null
      and private_verification.brinesearch_issue97_dataset_scope_current(
        i.dataset_id,i.state_code,i.county_code
      )
      and o.mapping_fingerprint=private_verification.brinesearch_issue97_mapping_fingerprint(o.identity_id)
      and o.source_digest=i.source_digest
      and g.identity_id=o.identity_id and g.road_id=o.canonical_road_id
  )
  select
    occurrence_index,route_prep_step_id,identity_id,canonical_road_id,
    dataset_id,state_code,county_code,source_identity_key,source_key,
    source_run_id,source_page_set_digest,step_geometry,
    pg_catalog.array_agg(distinct source_segment_key order by source_segment_key) as source_segment_keys,
    pg_catalog.md5(pg_catalog.string_agg(
      source_segment_key||':'||coalesce(source_digest,'')||':'||coalesce(source_record_id,''),
      '|' order by source_segment_key,segment_id
    )) as source_segment_digest,
    extensions.st_unaryunion(extensions.st_collect(geom)) as source_geom
  from source_candidates
  group by
    occurrence_index,route_prep_step_id,identity_id,canonical_road_id,
    dataset_id,state_code,county_code,source_identity_key,source_key,
    source_run_id,source_page_set_digest,step_geometry;

  if (select count(*) from tmp_issue97_transition_google_sources)<>v_occ_count-1 then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'current_authoritative_source_chain_missing_for_traveled_occurrence',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,
        'expected',v_occ_count-1,
        'observed',(select count(*) from tmp_issue97_transition_google_sources),
        'no_guess',true
      )
    );
  end if;

  if exists(
    select 1 from tmp_issue97_transition_google_sources src
    where not (
      extensions.st_dwithin(src.source_geom::extensions.geography,
        extensions.st_startpoint(src.step_geometry)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,
        extensions.st_lineinterpolatepoint(src.step_geometry,0.25)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,
        extensions.st_lineinterpolatepoint(src.step_geometry,0.50)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,
        extensions.st_lineinterpolatepoint(src.step_geometry,0.75)::extensions.geography,1)
      and extensions.st_dwithin(src.source_geom::extensions.geography,
        extensions.st_endpoint(src.step_geometry)::extensions.geography,1)
    )
  ) then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'canonical_occurrence_not_covered_by_current_authoritative_source',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  drop table if exists pg_temp.tmp_issue97_transition_google_path;
  create temp table tmp_issue97_transition_google_path on commit drop as
  with lengths as (
    select g.*,extensions.st_length(g.step_geometry::extensions.geography)::numeric as length_m
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    where g.route_prep_id=v_route.id and g.occurrence_index>1
      and g.status='resolved' and g.step_geometry is not null
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

  -- Exact route ingress is the first traveled occurrence start, source-snapped within 1 m.
  insert into tmp_issue97_transition_google_points(sort_m,tie_order,stable_key,point)
  select 0,10,'ingress:'||src.route_prep_step_id::text,
    pg_catalog.jsonb_build_object(
      'kind','shape','shape_role','route_ingress',
      'latitude',extensions.st_y(q.snapped)::numeric,
      'longitude',extensions.st_x(q.snapped)::numeric,
      'occurrence_id',src.route_prep_step_id,
      'identity_id',src.identity_id,
      'road_id',src.canonical_road_id,
      'source_kind','authoritative_clipped_geometry',
      'source_segment_keys',pg_catalog.to_jsonb(src.source_segment_keys),
      'source_digest',src.source_segment_digest,
      'source_run_id',src.source_run_id,
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
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'route_ingress_not_on_current_authoritative_source_chain',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

  -- Source-derived shaping points every 500 m on longer traveled occurrences.
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
      'source_run_id',c.source_run_id,
      'source_page_set_digest',c.source_page_set_digest
    )
  from (
    select p.route_prep_step_id,(p.start_m+gs.m)::numeric as route_position_m,
      src.source_segment_keys,src.source_segment_digest,
      src.source_run_id,src.source_page_set_digest,q.snapped,
      extensions.st_distance(q.snapped::extensions.geography,q.candidate::extensions.geography) as source_distance_m
    from tmp_issue97_transition_google_path p
    join tmp_issue97_transition_google_sources src using(occurrence_index)
    cross join lateral pg_catalog.generate_series(
      500::numeric,greatest(500::numeric,p.length_m-100),500::numeric
    ) gs(m)
    cross join lateral (
      select extensions.st_lineinterpolatepoint(
        p.step_geometry,gs.m/nullif(p.length_m,0)
      )::extensions.geometry(Point,4326) as candidate
    ) candidate_point
    cross join lateral (
      select candidate_point.candidate,
        extensions.st_closestpoint(src.source_geom,candidate_point.candidate)::extensions.geometry(Point,4326) as snapped
    ) q
    where p.length_m>700 and gs.m<p.length_m-100
  ) c
  where c.source_distance_m<=1;

  -- Every road-to-road transition after the ingress comes from the current active graph.
  -- Shared-section entry/exit is determined by route order, never by raw anchor role.
  insert into tmp_issue97_transition_google_points(sort_m,tie_order,stable_key,point)
  select p.end_m,30,'transition:'||t.boundary_index::text||':'||t.anchor_id::text,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',case
        when j.junction_type<>'shared_segment' then 'junction'
        when exists(
          select 1 from private_verification.brinesearch_route_transition_receipts_issue97 earlier
          where earlier.route_prep_id=t.route_prep_id
            and earlier.junction_id=t.junction_id
            and earlier.status='resolved'
            and earlier.boundary_index<t.boundary_index
        ) then 'shared_exit'
        else 'shared_entry'
      end,
      'latitude',extensions.st_y(t.coordinate)::numeric,
      'longitude',extensions.st_x(t.coordinate)::numeric,
      'source_kind','authoritative_junction_anchor',
      'anchor_id',t.anchor_id,'junction_id',t.junction_id,
      'graph_build_id',t.graph_build_id,'graph_digest',t.graph_digest,
      'anchor_digest',t.anchor_digest,'anchor_role',t.anchor_role,
      'junction_stable_key',j.stable_junction_key,'junction_type',j.junction_type,
      'shared_geometry_digest',case when j.junction_type='shared_segment'
        then pg_catalog.md5(extensions.st_asewkb(j.geom)) else null end
    ))
  from private_verification.brinesearch_route_transition_receipts_issue97 t
  join tmp_issue97_transition_google_path p on p.occurrence_index=t.boundary_index
  join public.brinesearch_road_junctions j on j.id=t.junction_id
  where t.route_prep_id=v_route.id and t.boundary_index>=2 and t.status='resolved';

  -- A shared junction must appear exactly twice in route order: entry then exit.
  if exists(
    select 1
    from private_verification.brinesearch_route_transition_receipts_issue97 t
    join public.brinesearch_road_junctions j on j.id=t.junction_id
    where t.route_prep_id=v_route.id and t.status='resolved' and j.junction_type='shared_segment'
    group by t.junction_id
    having count(*)<>2
  ) then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'shared_segment_transition_pair_not_unique',
      pg_catalog.jsonb_build_object('manifest_mode','transition_geometry','route_prep_id',v_route.id,'no_guess',true)
    );
  end if;

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
      pg_catalog.lag(
        pg_catalog.round((point->>'latitude')::numeric,7)::text||','||
        pg_catalog.round((point->>'longitude')::numeric,7)::text
      ) over(order by sort_m,tie_order,stable_key) as previous_key
    from tmp_issue97_transition_google_points
  ), filtered as (
    select * from ordered
    where previous_key is distinct from point_key
      or coalesce(point->>'shape_role','')='route_ingress'
      or coalesce(point->>'kind','')='pad_destination'
  ), numbered as (
    select point||pg_catalog.jsonb_build_object(
      'sequence',pg_catalog.row_number() over(order by sort_m,tie_order,stable_key)
    ) as point,
    pg_catalog.row_number() over(order by sort_m,tie_order,stable_key) as sequence
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
     )
     or exists(
       select 1 from pg_catalog.jsonb_array_elements(v_points) with ordinality p(point,ordinality)
       where p.point->>'kind'='shared_entry'
         and not exists(
           select 1 from pg_catalog.jsonb_array_elements(v_points) with ordinality x(point,ordinality)
           where x.ordinality>p.ordinality and x.point->>'kind'='shared_exit'
             and x.point->>'junction_id'=p.point->>'junction_id'
         )
     ) then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
      p_pad_id,v_route_revision,'transition_google_manifest_control_points_invalid',
      pg_catalog.jsonb_build_object(
        'manifest_mode','transition_geometry','route_prep_id',v_route.id,
        'point_count',v_point_count,'no_guess',true
      )
    );
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'occurrence_index',o.occurrence_index,'road_id',o.canonical_road_id,
      'identity_id',o.identity_id,'display_name',o.driver_road_name,'aliases',o.valid_aliases,
      'turn_direction',g.outbound_turn,
      'distance_miles',case when g.geometry_miles is not null
        then pg_catalog.round(g.geometry_miles::numeric,3) else null end
    )) order by o.occurrence_index
  ) into v_roads
  from private_verification.brinesearch_route_occurrence_receipts_issue97 o
  left join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    on g.route_prep_id=o.route_prep_id and g.occurrence_index=o.occurrence_index
  where o.route_prep_id=v_route.id;

  select pg_catalog.md5(pg_catalog.string_agg(
    src.occurrence_index::text||':'||src.source_segment_digest||':'||src.source_run_id::text||':'||
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

  select r.route_revision,r.dependency_digest into v_old_revision,v_old_dependency
  from private_verification.brinesearch_google_route_receipts_issue97 r
  where r.pad_id=p_pad_id;
  if v_old_revision is not null and v_old_revision>0 and v_old_dependency=v_dependency then
    v_route_revision:=v_old_revision;
  else
    v_route_revision:=greatest(
      coalesce(v_old_revision,0),coalesce(v_pad.brinesearch_google_route_revision_issue97,0),0
    )+1;
  end if;

  v_base_manifest:=pg_catalog.jsonb_build_object(
    'manifest_version','issue97-google-v1','manifest_mode','transition_geometry',
    'publication_mode','private_dark','public_projected',false,
    'route_ready',true,'status','ready','pad_id',p_pad_id,'route_revision',v_route_revision,
    'source_revision',v_route.updated_at,'route_prep_id',v_route.id,
    'origin_mode','current_location_until_route_ingress','occurrence_count',v_occ_count,
    'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
    'driver_road_sequence',coalesce(v_roads,'[]'::jsonb),'points',v_points,
    'dependency_digest',v_dependency,
    'source_dependency_digest',v_source_dependency_digest,
    'graph_dependency_digest',v_graph_dependency_digest,
    'mapping_dependency_digest',v_mapping_dependency_digest,
    'safety_digest',v_safety_digest,
    'provenance',pg_catalog.jsonb_build_object(
      'route_occurrences','exact authoritative identity receipts',
      'transitions','verified current #97 junction/anchor receipts',
      'geometry','authoritative identity component clipped between exact transition anchors',
      'shaping','same-identity current authoritative source segments within one meter',
      'destination','saved pad GPS on the resolved final authoritative road within one meter',
      'manual_map_editor','review_exception_qa_only',
      'name_only_resolution',false,'nearest_road_resolution',false,'fuzzy_resolution',false
    )
  );
  v_manifest_digest:=pg_catalog.md5(v_base_manifest::text);
  v_manifest:=v_base_manifest||pg_catalog.jsonb_build_object('manifest_digest',v_manifest_digest);

  if private_verification.brinesearch_issue97_transition_google_dependency(p_pad_id)
       is distinct from v_dependency then
    return private_verification.brinesearch_issue97_hold_google_route_dark(
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
      'manifest_mode','transition_geometry','publication_mode','private_dark',
      'public_projected',false,'route_prep_id',v_route.id,
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

  return pg_catalog.jsonb_build_object(
    'status','ready','manifest_mode','transition_geometry','publication_mode','private_dark',
    'public_projected',false,'pad_id',p_pad_id,
    'route_prep_id',v_route.id,'route_revision',v_route_revision,
    'occurrence_count',v_occ_count,'point_count',v_point_count,
    'known_route_miles',pg_catalog.round(v_total_m/1609.344,3),
    'manifest_digest',v_manifest_digest,'dependency_digest',v_dependency
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route_transition_dark(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_transition_google_dark_current(
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
  select * into v_pad from public.pads where id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return false; end if;

  select * into v_receipt
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  if not found or v_receipt.status<>'ready'
     or v_receipt.hold_reason is not null
     or v_receipt.manifest_version<>'issue97-google-v1'
     or coalesce(v_receipt.evidence->>'manifest_mode','')<>'transition_geometry'
     or coalesce(v_receipt.evidence->>'publication_mode','')<>'private_dark'
     or coalesce((v_receipt.evidence->>'public_projected')::boolean,true)
     or not coalesce((v_receipt.evidence->>'no_guess')::boolean,false)
     or coalesce(v_receipt.manifest->>'manifest_mode','')<>'transition_geometry'
     or coalesce(v_receipt.manifest->>'publication_mode','')<>'private_dark'
     or coalesce((v_receipt.manifest->>'public_projected')::boolean,true)
     or coalesce(v_receipt.manifest->>'status','')<>'ready'
     or not coalesce((v_receipt.manifest->>'route_ready')::boolean,false)
     or v_receipt.route_revision<1
     or coalesce(v_receipt.manifest->>'route_revision','')<>v_receipt.route_revision::text
     or coalesce(v_receipt.manifest->>'pad_id','')<>p_pad_id::text
     or coalesce(v_receipt.manifest->'provenance'->>'name_only_resolution','true')<>'false'
     or coalesce(v_receipt.manifest->'provenance'->>'nearest_road_resolution','true')<>'false'
     or coalesce(v_receipt.manifest->'provenance'->>'fuzzy_resolution','true')<>'false'
     or coalesce(v_receipt.evidence->>'source_dependency_digest','') !~ '^[0-9a-f]{32}$'
     or coalesce(v_receipt.evidence->>'graph_dependency_digest','') !~ '^[0-9a-f]{32}$'
     or coalesce(v_receipt.evidence->>'mapping_dependency_digest','') !~ '^[0-9a-f]{32}$'
     or coalesce(v_receipt.evidence->>'safety_digest','') !~ '^[0-9a-f]{32}$'
     or coalesce(v_receipt.manifest->>'source_dependency_digest','')<>
        coalesce(v_receipt.evidence->>'source_dependency_digest','')
     or coalesce(v_receipt.manifest->>'graph_dependency_digest','')<>
        coalesce(v_receipt.evidence->>'graph_dependency_digest','')
     or coalesce(v_receipt.manifest->>'mapping_dependency_digest','')<>
        coalesce(v_receipt.evidence->>'mapping_dependency_digest','')
     or coalesce(v_receipt.manifest->>'safety_digest','')<>
        coalesce(v_receipt.evidence->>'safety_digest','')
     or coalesce(v_receipt.manifest->>'dependency_digest','')<>
        coalesce(v_receipt.dependency_digest,'')
     or coalesce(v_receipt.manifest->>'manifest_digest','')<>
        coalesce(v_receipt.manifest_digest,'')
     or pg_catalog.md5((v_receipt.manifest-'manifest_digest')::text) is distinct from
        v_receipt.manifest_digest then
    return false;
  end if;

  v_dependency:=private_verification.brinesearch_issue97_transition_google_dependency(p_pad_id);
  return v_dependency is not null
    and v_receipt.dependency_digest=v_dependency;
exception when others then
  return false;
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_dark_current(uuid)
from public,anon,authenticated,service_role;

-- This is now projection only. It cannot construct a route from names, GPS, or
-- a weaker dependency set. Cutover must already be active and the exact private
-- manifest must independently be current before a public row is written.
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
  v_receipt record;
  v_route record;
  v_revision bigint:=0;
  v_reason text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );

  select * into v_pad from public.pads where id=p_pad_id for update;
  if not found then raise exception 'Pad not found' using errcode='P0002'; end if;
  select * into v_receipt
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  v_revision:=greatest(
    coalesce(v_receipt.route_revision,0),
    coalesce(v_pad.brinesearch_google_route_revision_issue97,0),0
  );

  if not public.brinesearch_issue97_cutover_active() then
    return pg_catalog.jsonb_build_object(
      'pad_id',p_pad_id,'route_revision',v_revision,'status','held',
      'hold_reason','issue97_cutover_not_active','public_projected',false,
      'private_manifest_status',coalesce(v_receipt.status,'missing')
    );
  end if;

  if coalesce(v_pad.list_only,false)
     or not private_verification.brinesearch_issue97_transition_google_dark_current(p_pad_id) then
    v_reason:=case
      when coalesce(v_pad.list_only,false) then 'pad_not_in_current_route_scope'
      when v_receipt.pad_id is null then 'private_dark_google_manifest_missing'
      when v_receipt.status<>'ready' then coalesce(v_receipt.hold_reason,'private_dark_google_manifest_held')
      else 'private_dark_google_manifest_not_current'
    end;
    delete from public.brinesearch_driver_google_routes_public where pad_id=p_pad_id;
    update public.pads set
      brinesearch_google_route_status_issue97='held',
      brinesearch_google_route_revision_issue97=v_revision
    where id=p_pad_id;
    return pg_catalog.jsonb_build_object(
      'pad_id',p_pad_id,'route_revision',v_revision,'status','held',
      'hold_reason',v_reason,'public_projected',false,
      'private_manifest_status',coalesce(v_receipt.status,'missing')
    );
  end if;

  -- A stale/tampered private receipt must hold this pad without aborting a
  -- multi-pad public projection. The exact route id is only a projection
  -- receipt lookup; it never becomes a fallback route-selection input.
  if coalesce(v_receipt.manifest->>'route_prep_id','') ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select r.* into v_route
    from public.brinesearch_route_prep r
    where r.id=(v_receipt.manifest->>'route_prep_id')::uuid
      and r.pad_id=p_pad_id and r.active and r.route_group='primary';
  end if;
  if not found or v_route.id is null then
    delete from public.brinesearch_driver_google_routes_public where pad_id=p_pad_id;
    update public.pads set
      brinesearch_google_route_status_issue97='held',
      brinesearch_google_route_revision_issue97=v_revision
    where id=p_pad_id;
    return pg_catalog.jsonb_build_object(
      'pad_id',p_pad_id,'route_revision',v_revision,'status','held',
      'hold_reason','private_dark_google_manifest_route_not_current',
      'public_projected',false,'private_manifest_status',v_receipt.status
    );
  end if;

  insert into public.brinesearch_driver_google_routes_public(
    pad_id,legacy_id,route_revision,source_revision,manifest
  ) values(
    p_pad_id,v_pad.legacy_id,v_receipt.route_revision,v_route.updated_at,v_receipt.manifest
  )
  on conflict(pad_id) do update set
    legacy_id=excluded.legacy_id,route_revision=excluded.route_revision,
    source_revision=excluded.source_revision,manifest=excluded.manifest;

  update public.pads set
    brinesearch_google_route_status_issue97='ready',
    brinesearch_google_route_revision_issue97=v_receipt.route_revision
  where id=p_pad_id;
  delete from private_verification.brinesearch_google_route_refresh_queue_issue97
  where pad_id=p_pad_id;

  return pg_catalog.jsonb_build_object(
    'pad_id',p_pad_id,'route_revision',v_receipt.route_revision,'status','ready',
    'manifest_mode','transition_geometry','public_projected',true,
    'manifest_digest',v_receipt.manifest_digest,
    'dependency_digest',v_receipt.dependency_digest
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)
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
begin
  if not public.brinesearch_issue97_cutover_active() then return false; end if;
  if not private_verification.brinesearch_issue97_transition_google_dark_current(p_pad_id) then
    return false;
  end if;
  select * into v_pad from public.pads where id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false)
     or v_pad.brinesearch_google_route_status_issue97<>'ready' then return false; end if;
  select * into strict v_receipt
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  if v_receipt.route_revision<>v_pad.brinesearch_google_route_revision_issue97 then
    return false;
  end if;
  return exists(
    select 1 from public.brinesearch_driver_google_routes_public pub
    where pub.pad_id=p_pad_id
      and pub.route_revision=v_receipt.route_revision
      and pub.manifest=v_receipt.manifest
      and coalesce(pub.manifest->>'manifest_digest','')=v_receipt.manifest_digest
      and pg_catalog.md5((pub.manifest-'manifest_digest')::text)=v_receipt.manifest_digest
      and coalesce(pub.manifest->>'manifest_mode','')='transition_geometry'
      and coalesce((pub.manifest->>'route_ready')::boolean,false)
      and coalesce(pub.manifest->>'dependency_digest','')=v_receipt.dependency_digest
  );
exception when others then
  return false;
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_current(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_refresh_google_routes_dark(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_result jsonb;
  v_processed integer:=0;
  v_ready integer:=0;
  v_held integer:=0;
begin
  for v_pad in
    select p.id from public.pads p
    where not coalesce(p.list_only,false)
      and (p_pad_id is null or p.id=p_pad_id)
    order by p.id
  loop
    v_result:=private_verification.brinesearch_issue97_refresh_google_route_transition_dark(v_pad.id);
    v_processed:=v_processed+1;
    if v_result->>'status'='ready' then v_ready:=v_ready+1; else v_held:=v_held+1; end if;
  end loop;
  return pg_catalog.jsonb_build_object(
    'scope_pad_id',p_pad_id,'processed',v_processed,'private_dark_ready',v_ready,
    'private_dark_held',v_held,'public_projected',false
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_routes_dark(uuid)
from public,anon,authenticated,service_role;

-- The Ohio lane calls this fixed core directly. Dark receipts are generated
-- after exact identity/transition/geometry work, then route-stage receipts are
-- refreshed once more so they observe the private manifest state.
create or replace function public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity jsonb;
  v_route record;
  v_dark jsonb;
  v_routes integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
  );
  v_identity:=public.brinesearch_issue97_reconcile_route_corpus(p_pad_id);
  for v_route in
    select id from public.brinesearch_route_prep
    where active and (p_pad_id is null or pad_id=p_pad_id)
    order by pad_id,route_group,variant_index,id
  loop
    perform private_verification.brinesearch_issue97_refresh_transition_receipts(v_route.id);
    perform private_verification.brinesearch_issue97_refresh_route_geometry(v_route.id);
    perform private_verification.brinesearch_issue97_refresh_route_receipt(v_route.id);
    v_routes:=v_routes+1;
  end loop;

  v_dark:=private_verification.brinesearch_issue97_refresh_google_routes_dark(p_pad_id);
  for v_route in
    select id from public.brinesearch_route_prep
    where active and (p_pad_id is null or pad_id=p_pad_id)
    order by pad_id,route_group,variant_index,id
  loop
    perform private_verification.brinesearch_issue97_refresh_route_receipt(v_route.id);
  end loop;

  return v_identity
    ||private_verification.brinesearch_issue97_transition_metrics_json()
    ||private_verification.brinesearch_issue97_geometry_metrics_json()
    ||pg_catalog.jsonb_build_object(
      'pipeline_routes_processed',v_routes,'private_dark_google',v_dark
    );
end
$$;

revoke all on function public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(uuid)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(uuid)
to service_role;


CREATE OR REPLACE FUNCTION private_verification.brinesearch_issue97_refresh_route_receipt(p_route_prep_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_route record;
  v_occurrences integer:=0;
  v_resolved integer:=0;
  v_held integer:=0;
  v_canonical integer:=0;
  v_geometry integer:=0;
  v_manifest text:=null;
  v_dark_current boolean:=false;
  v_reasons text[]:='{}'::text[];
  v_stage text:='identity_reconciliation';
  v_status text:='needs_review';
  v_dependency text;
  v_receipt text;
  v_evidence jsonb;
begin
  select p.*,pad.structured_route_revision,pad.road_sequence_status
  into strict v_route
  from public.brinesearch_route_prep p
  join public.pads pad on pad.id=p.pad_id
  where p.id=p_route_prep_id;

  select count(*),count(*) filter(where resolution_status='resolved'),
    count(*) filter(where resolution_status='held'),
    count(*) filter(where resolution_status='resolved' and canonical_road_id is not null)
  into v_occurrences,v_resolved,v_held,v_canonical
  from private_verification.brinesearch_route_occurrence_receipts_issue97
  where route_prep_id=p_route_prep_id;

  if v_route.route_group='primary' and v_route.variant_index=1 then
    select count(*) into v_geometry
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
    join private_verification.brinesearch_route_occurrence_receipts_issue97 rr
      on rr.route_prep_step_id=g.route_prep_step_id
      and rr.route_prep_id=g.route_prep_id
      and rr.occurrence_index=g.occurrence_index
    where g.route_prep_id=p_route_prep_id
      and g.status='resolved' and rr.resolution_status='resolved'
      and g.identity_id=rr.identity_id and g.road_id=rr.canonical_road_id
      and g.route_group=v_route.route_group and g.variant_index=v_route.variant_index
      and (
        (g.occurrence_index=1 and g.occurrence_role='origin_anchor'
          and g.step_geometry is null and g.geometry_miles=0
          and (v_occurrences=1 or exists(
            select 1 from private_verification.brinesearch_route_transition_receipts_issue97 t
            where t.route_prep_id=p_route_prep_id and t.boundary_index=1
              and t.status='resolved' and t.receipt_digest=g.end_transition_digest
          )))
        or
        (g.occurrence_index>1 and g.occurrence_role='traveled'
          and g.step_geometry is not null and g.geometry_miles>0
          and exists(
            select 1 from private_verification.brinesearch_route_transition_receipts_issue97 t
            where t.route_prep_id=p_route_prep_id
              and t.boundary_index=g.occurrence_index-1
              and t.status='resolved' and t.receipt_digest=g.start_transition_digest
          )
          and (g.occurrence_index=v_occurrences or exists(
            select 1 from private_verification.brinesearch_route_transition_receipts_issue97 t
            where t.route_prep_id=p_route_prep_id
              and t.boundary_index=g.occurrence_index
              and t.status='resolved' and t.receipt_digest=g.end_transition_digest
          )))
      );

    select g.status into v_manifest
    from private_verification.brinesearch_google_route_receipts_issue97 g
    where g.pad_id=v_route.pad_id;
    v_dark_current:=private_verification.brinesearch_issue97_transition_google_dark_current(
      v_route.pad_id
    );
  end if;

  if not v_route.active then
    v_status:='stale';
    v_stage:='identity_reconciliation';
    v_reasons:=array['route_prep_inactive'];
  else
    if v_route.readiness_status<>'ready_for_road_matching' then
      v_reasons:=array_append(
        v_reasons,'route_prep_'||coalesce(v_route.readiness_status,'unknown')
      );
    end if;
    if v_occurrences=0 then
      v_reasons:=array_append(v_reasons,'no_saved_road_occurrences');
    elsif v_held>0 or v_resolved<>v_occurrences then
      v_reasons:=array_append(v_reasons,'authoritative_occurrence_identity_incomplete');
    end if;

    if v_occurrences=0
       or v_route.readiness_status<>'ready_for_road_matching'
       or v_held>0
       or v_resolved<>v_occurrences then
      v_stage:='identity_reconciliation';
    elsif v_canonical<>v_occurrences then
      v_reasons:=array_append(
        v_reasons,'canonical_road_mapping_missing_for_resolved_identity'
      );
      v_stage:='canonical_mapping';
    elsif not (v_route.route_group='primary' and v_route.variant_index=1) then
      v_reasons:=array_append(
        v_reasons,'route_variant_structured_publication_not_generated'
      );
      v_stage:='exact_geometry';
    elsif v_geometry<>v_occurrences then
      v_reasons:=array_append(v_reasons,'exact_occurrence_geometry_incomplete');
      v_stage:='exact_geometry';
    elsif not v_dark_current then
      v_reasons:=array_append(v_reasons,'google_route_manifest_not_ready');
      v_stage:='google_manifest';
    else
      v_status:='route_ready';
      v_stage:='ready';
      v_reasons:='{}'::text[];
    end if;
  end if;

  v_dependency:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_route.id::text,v_route.pad_id::text,v_route.source_sequence_hash,
    v_route.route_group,v_route.variant_index::text,coalesce(v_route.readiness_status,''),
    coalesce(v_route.structured_route_revision::text,''),coalesce(v_route.road_sequence_status,''),
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by occurrence_index)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by boundary_index)
      from private_verification.brinesearch_route_transition_receipts_issue97
      where route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by occurrence_index)
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
      where route_prep_id=p_route_prep_id),''),
    coalesce((select pg_catalog.concat_ws(':',g.status,g.hold_reason,g.manifest_digest,
        g.dependency_digest,g.manifest::text,g.evidence::text)
      from private_verification.brinesearch_google_route_receipts_issue97 g
      where g.pad_id=v_route.pad_id),''),
    v_dark_current::text
  ));
  v_evidence:=pg_catalog.jsonb_build_object(
    'source_sequence',v_route.source_sequence,'readiness_status',v_route.readiness_status,
    'road_occurrences',v_occurrences,'resolved_occurrences',v_resolved,
    'held_occurrences',v_held,'canonical_mappings',v_canonical,
    'exact_geometry_occurrences',v_geometry,'google_manifest_status',v_manifest,
    'dark_google_manifest_current',v_dark_current,
    'public_google_projection_required_separately',true,
    'manual_map_editor_role','review_exception_qa_only'
  );
  v_receipt:=pg_catalog.md5(pg_catalog.concat_ws('|',v_dependency,v_status,v_stage,
    pg_catalog.array_to_string(v_reasons,','),v_evidence::text));

  insert into private_verification.brinesearch_route_reconciliation_receipts_issue97(
    route_prep_id,pad_id,route_group,variant_index,source_sequence_hash,route_status,stage,
    road_occurrence_count,resolved_occurrence_count,held_occurrence_count,
    canonical_mapping_count,exact_geometry_count,google_manifest_status,exception_reasons,
    dependency_digest,evidence,receipt_digest,updated_at
  ) values (
    v_route.id,v_route.pad_id,v_route.route_group,v_route.variant_index,v_route.source_sequence_hash,
    v_status,v_stage,v_occurrences,v_resolved,v_held,v_canonical,v_geometry,v_manifest,
    v_reasons,v_dependency,v_evidence,v_receipt,now()
  )
  on conflict(route_prep_id) do update set
    pad_id=excluded.pad_id,route_group=excluded.route_group,variant_index=excluded.variant_index,
    source_sequence_hash=excluded.source_sequence_hash,route_status=excluded.route_status,
    stage=excluded.stage,road_occurrence_count=excluded.road_occurrence_count,
    resolved_occurrence_count=excluded.resolved_occurrence_count,
    held_occurrence_count=excluded.held_occurrence_count,
    canonical_mapping_count=excluded.canonical_mapping_count,exact_geometry_count=excluded.exact_geometry_count,
    google_manifest_status=excluded.google_manifest_status,exception_reasons=excluded.exception_reasons,
    dependency_digest=excluded.dependency_digest,evidence=excluded.evidence,
    receipt_digest=excluded.receipt_digest,updated_at=now();

  insert into private_verification.brinesearch_route_reconciliation_history_issue97(
    route_prep_id,pad_id,route_group,variant_index,route_status,stage,
    road_occurrence_count,resolved_occurrence_count,held_occurrence_count,
    canonical_mapping_count,exact_geometry_count,google_manifest_status,exception_reasons,
    dependency_digest,evidence,receipt_digest
  ) values (
    v_route.id,v_route.pad_id,v_route.route_group,v_route.variant_index,v_status,v_stage,
    v_occurrences,v_resolved,v_held,v_canonical,v_geometry,v_manifest,v_reasons,
    v_dependency,v_evidence,v_receipt
  ) on conflict(route_prep_id,receipt_digest) do nothing;

  return pg_catalog.jsonb_build_object(
    'route_prep_id',p_route_prep_id,'route_status',v_status,'stage',v_stage,
    'road_occurrences',v_occurrences,'resolved',v_resolved,'held',v_held,
    'canonical_mappings',v_canonical,'exact_geometry',v_geometry,
    'google_manifest_status',v_manifest,'exception_reasons',to_jsonb(v_reasons)
  );
end
$function$;

revoke all on function private_verification.brinesearch_issue97_refresh_route_receipt(uuid)
from public,anon,authenticated,service_role;

do $issue97_verify_dark_google_split$
declare
  v_dependency text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure
  );
  v_dark text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition_dark(uuid)'::pg_catalog.regprocedure
  );
  v_dark_current text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dark_current(uuid)'::pg_catalog.regprocedure
  );
  v_projection text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  );
  v_route_receipt text:=pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)'::pg_catalog.regprocedure
  );
  v_pipeline text:=pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(uuid)'::pg_catalog.regprocedure
  );
begin
  if v_dependency not ilike '%brinesearch_issue97_graph_build_release_current_contextual%'
     or v_dependency not ilike '%brinesearch_issue97_current_verified_run_id%'
     or v_dependency not ilike '%brinesearch_issue97_authoritative_identity_geometry_digest%'
     or v_dependency ilike '%graph_build_sources_current(%'
     or v_dependency ilike '%geometry_kind%'
     or v_dependency ilike '%g.miles%'
  then
    raise exception 'Issue #97 private Google dependency is not exact/current-schema/release-current';
  end if;

  if v_dark ilike '%brinesearch_issue97_cutover_active%'
     or v_dark ilike '%brinesearch_driver_google_routes_public%'
     or v_dark ilike '%update public.pads%'
     or v_dark ilike '%brinesearch_issue97_hold_google_route(%'
     or v_dark ilike '%join public.brinesearch_authoritative_road_segments s%'
     or v_dark not ilike '%brinesearch_authoritative_segment_identity_assignments%'
     or v_dark not ilike '%brinesearch_authoritative_external_road_segments%'
     or v_dark not ilike '%source_dependency_digest%'
     or v_dark not ilike '%graph_dependency_digest%'
     or v_dark not ilike '%mapping_dependency_digest%'
     or v_dark not ilike '%safety_digest%'
     or v_dark not ilike '%''name_only_resolution'',false%'
     or v_dark not ilike '%''nearest_road_resolution'',false%'
     or v_dark not ilike '%''fuzzy_resolution'',false%'
  then
    raise exception 'Issue #97 private dark Google builder can publish or weakened provenance';
  end if;

  if v_dark_current not ilike '%transition_google_dependency(p_pad_id)%'
     or v_dark_current not ilike '%manifest_digest%'
     or v_dark_current not ilike '%publication_mode%private_dark%'
     or v_dark_current not ilike '%public_projected%'
     or v_dark_current ilike '%brinesearch_driver_google_routes_public%'
     or v_dark_current ilike '%brinesearch_issue97_cutover_active%'
  then
    raise exception 'Issue #97 private dark currentness is not publication-independent and exact';
  end if;

  if v_projection not ilike '%brinesearch_issue97_cutover_active%'
     or v_projection not ilike '%transition_google_dark_current(p_pad_id)%'
     or v_projection not ilike '%v_receipt.manifest%'
     or v_projection ilike '%tmp_issue97_transition_google_%'
     or v_projection ilike '%st_closestpoint%'
     or v_projection ilike '%brinesearch_authoritative_road_identities%'
  then
    raise exception 'Issue #97 public transition projection can bypass the private manifest';
  end if;

  if pg_catalog.regexp_replace(v_route_receipt,'\s','','g') not ilike '%ifv_occurrences=0%'
     or pg_catalog.regexp_replace(v_route_receipt,'\s','','g') not ilike
        '%v_route.readiness_status<>''ready_for_road_matching''%'
     or v_route_receipt not ilike '%transition_google_dark_current%'
     or pg_catalog.regexp_replace(v_route_receipt,'\s','','g') not ilike
        '%elsifnotv_dark_current%'
     or pg_catalog.regexp_replace(v_route_receipt,'\s','','g') not ilike
        '%v_stage:=''identity_reconciliation''%'
  then
    raise exception 'Issue #97 route stage ordering did not install cleanly';
  end if;

  if v_pipeline not ilike '%brinesearch_issue97_refresh_google_routes_dark%'
     or v_pipeline not ilike '%brinesearch_issue97_refresh_route_receipt%'
     or v_pipeline ilike '%brinesearch_issue97_refresh_google_routes(%'
  then
    raise exception 'Issue #97 Ohio dark pipeline is not isolated from public projection';
  end if;
end
$issue97_verify_dark_google_split$;

comment on function private_verification.brinesearch_issue97_refresh_google_route_transition_dark(uuid) is
  'Issue #97 exact private/dark transition manifest builder. Complete currentness, exact geometry, source, graph, mapping, safety and no-guess requirements apply. It never writes public routes or public pad readiness.';
comment on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid) is
  'Issue #97 transition public projection only. Requires cutover plus a current exact private/dark manifest and cannot construct a route from weaker evidence.';
comment on function private_verification.brinesearch_issue97_transition_google_dark_current(uuid) is
  'Issue #97 complete private/dark transition manifest currentness predicate, independent of cutover and public projection.';
comment on function private_verification.brinesearch_issue97_refresh_route_receipt(uuid) is
  'Issue #97 fail-closed route-stage receipt: route-prep and zero-occurrence blockers precede mapping/geometry/dark-Google readiness.';
comment on function public.brinesearch_issue97_run_all_pad_routing_pipeline_geometry_core(uuid) is
  'Issue #97 exact route pipeline through private/dark Google manifest readiness. Public projection remains a separate cutover-gated operation.';
