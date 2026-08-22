-- GitHub #97 — Ohio OGRIP supplemental name-event performance hardening.
--
-- Carroll County production rollout proved the indexed OGRIP -> ODOT identity
-- equivalence pass, but timed out while recomputing the same ODOT/OGRIP geometry
-- intersection once for every name event. Precompute each verified centerline /
-- source-segment overlap exactly once, preserve the overlap fractions, then expand
-- source-backed names from that receipt. This also preserves the original
-- fractional ODOT LRS measure range instead of assigning a whole source segment.

create or replace function public.brinesearch_issue97_refresh_supplemental_aliases_oh(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_odot_dataset uuid:=private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory');
  v_source_county text;
  v_target_runs jsonb:='[]'::jsonb;
  v_mapping_count integer:=0;
  v_name_count integer:=0;
  v_disposition_count integer:=0;
  v_unmatched_count integer:=0;
  v_ambiguous_count integer:=0;
begin
  select r.*,d.source_key into v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
  where r.id=p_run_id and r.status='loading'
    and r.state_code='OH'
    and d.source_key='oh_ogrip_lbrs_centerlines'
    and d.topology_role='supplemental_aliases'
  for update of r;
  if not found then
    raise exception 'Loading Ohio OGRIP supplemental ingest run not found' using errcode='P0002';
  end if;

  select c.source_county_code into strict v_source_county
  from public.brinesearch_road_graph_counties c
  where c.state_code='OH' and c.county_code=v_run.county_code and c.active;

  with latest as (
    select r.id as run_id,r.details->>'page_set_digest' as page_set_digest,
      r.completed_at,r.source_row_count,r.ingested_row_count
    from public.brinesearch_road_source_ingest_runs r
    where r.dataset_id=v_odot_dataset and r.state_code='OH'
      and r.county_code=v_run.county_code
    order by r.started_at desc,r.id desc limit 1
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'dataset_id',v_odot_dataset,'source_key','oh_odot_tims_road_inventory',
    'state_code','OH','county_code',v_run.county_code,
    'run_id',run_id,'page_set_digest',page_set_digest,
    'completed_at',completed_at,'source_row_count',source_row_count,
    'ingested_row_count',ingested_row_count
  )),'[]'::jsonb)
  into v_target_runs
  from latest
  where private_verification.brinesearch_issue97_ingest_run_verified(run_id);
  if pg_catalog.jsonb_array_length(v_target_runs)<>1 then
    raise exception 'Complete current ODOT run is required before Ohio OGRIP materialization'
      using errcode='55000';
  end if;

  update public.brinesearch_authoritative_supplemental_centerlines
  set active=false
  where dataset_id=v_run.dataset_id and state_code='OH'
    and county_code=v_run.county_code and active
    and last_ingest_run_id is distinct from p_run_id;
  update public.brinesearch_supplemental_centerline_identity_mappings m
  set active=false,mapping_status='retired',updated_at=now()
  where m.active and exists(
    select 1 from public.brinesearch_authoritative_supplemental_centerlines c
    where c.id=m.centerline_id and c.dataset_id=v_run.dataset_id
      and c.state_code='OH' and c.county_code=v_run.county_code
  );
  update public.brinesearch_supplemental_centerline_dispositions d
  set active=false,updated_at=now()
  where d.dataset_id=v_run.dataset_id and d.state_code='OH'
    and d.county_code=v_run.county_code and d.active;
  update public.brinesearch_authoritative_road_names n
  set active=false,updated_at=now()
  where n.source_dataset_id=v_run.dataset_id and n.active
    and exists(select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=n.identity_id and i.state_code='OH' and i.county_code=v_run.county_code);

  insert into public.brinesearch_supplemental_centerline_identity_mappings(
    centerline_id,dataset_id,state_code,county_code,identity_id,
    mapping_status,mapping_method,source_segment_keys,evidence,ingest_run_id,active
  )
  with candidate_segments as (
    select c.id as centerline_id,a.identity_id,c.geom as source_geom,
      'OH:ODOT:SEGMENT:'||o.roadway_inventory_id as source_segment_key,
      o.geom as target_segment_geom
    from public.brinesearch_authoritative_supplemental_centerlines c
    join public.brinesearch_odot_road_catalog o
      on o.county_code=v_source_county and o.source_active and o.geom is not null
     and not extensions.st_isempty(o.geom) and extensions.st_isvalid(o.geom)
     and extensions.st_issimple(o.geom) and extensions.st_dimension(o.geom)=1
     and extensions.st_coveredby(o.geom,extensions.st_makeenvelope(-180,-90,180,90,4326))
     and o.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.00001)
     and extensions.st_dwithin(c.geom::extensions.geography,o.geom::extensions.geography,0.25)
    join public.brinesearch_authoritative_segment_identity_assignments a
      on a.dataset_id=v_odot_dataset
     and a.source_segment_key='OH:ODOT:SEGMENT:'||o.roadway_inventory_id
     and a.active
    where c.dataset_id=v_run.dataset_id and c.state_code='OH'
      and c.county_code=v_run.county_code and c.active and c.last_ingest_run_id=p_run_id
  ), candidate_geometry as (
    select centerline_id,identity_id,
      array_agg(distinct source_segment_key order by source_segment_key) as source_segment_keys,
      (array_agg(source_geom order by source_segment_key))[1] as source_geom,
      extensions.st_unaryunion(extensions.st_collect(extensions.st_transform(target_segment_geom,3857))) as target_geom
    from candidate_segments group by centerline_id,identity_id
  ), exact_matches as (
    select centerline_id,identity_id,source_segment_keys,
      greatest(
        extensions.st_distance(extensions.st_startpoint(extensions.st_linemerge(extensions.st_transform(source_geom,3857))),target_geom),
        extensions.st_distance(extensions.st_endpoint(extensions.st_linemerge(extensions.st_transform(source_geom,3857))),target_geom)
      ) as max_endpoint_distance_m,
      extensions.st_length(extensions.st_intersection(
        extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,0.25)
      ))/nullif(extensions.st_length(extensions.st_transform(source_geom,3857)),0) as source_coverage,
      extensions.st_length(extensions.st_intersection(
        extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,0.25)
      )) as overlap_length_m,
      extensions.st_coveredby(extensions.st_transform(source_geom,3857),extensions.st_buffer(target_geom,0.25)) as source_fully_covered,
      extensions.st_coveredby(target_geom,extensions.st_buffer(extensions.st_transform(source_geom,3857),0.25)) as target_fully_covered
    from candidate_geometry
    where extensions.geometrytype(extensions.st_linemerge(extensions.st_transform(source_geom,3857)))='LINESTRING'
  )
  select centerline_id,v_run.dataset_id,'OH',v_run.county_code,identity_id,
    'verified','exact_geometry_coverage',source_segment_keys,
    pg_catalog.jsonb_build_object(
      'max_endpoint_distance_m',max_endpoint_distance_m,'source_coverage',source_coverage,
      'overlap_length_m',overlap_length_m,'source_fully_covered',source_fully_covered,
      'target_fully_covered',target_fully_covered,'buffer_tolerance_m',0.25,
      'name_used_for_mapping',false,'nearest_road_used_for_mapping',false,
      'many_to_many_preserved',true,'containment_direction_preserved',true,
      'candidate_source','direct indexed ODOT catalog + exact segment assignment'
    ),p_run_id,true
  from exact_matches
  where overlap_length_m>=0.5 and (source_fully_covered or target_fully_covered)
  on conflict(centerline_id,identity_id) do update set
    mapping_status=excluded.mapping_status,mapping_method=excluded.mapping_method,
    source_segment_keys=excluded.source_segment_keys,evidence=excluded.evidence,
    ingest_run_id=excluded.ingest_run_id,active=true,updated_at=now();
  get diagnostics v_mapping_count=row_count;

  insert into public.brinesearch_supplemental_centerline_dispositions(
    centerline_id,dataset_id,state_code,county_code,ingest_run_id,disposition,
    candidate_count,verified_mapping_count,evidence,active,updated_at
  )
  select c.id,c.dataset_id,'OH',c.county_code,p_run_id,
    case when count(m.identity_id) filter(where m.mapping_status='verified')>0 then 'verified'
      when count(m.identity_id)>0 then 'ambiguous' else 'unmatched_held' end,
    count(m.identity_id)::integer,
    count(m.identity_id) filter(where m.mapping_status='verified')::integer,
    pg_catalog.jsonb_build_object(
      'source_feature_key',c.source_feature_key,'source_record_id',c.source_record_id,
      'source_digest',c.source_digest,'source_key',v_run.source_key,
      'mapping_contract','exact geometry coverage against ODOT source segments; road names excluded',
      'held_reason',case when count(m.identity_id)=0 then 'no exact authoritative identity equivalence'
        when count(m.identity_id)>1 and count(m.identity_id) filter(where m.mapping_status='verified')=0
          then 'multiple geometry-equivalent identity candidates' end
    ),true,now()
  from public.brinesearch_authoritative_supplemental_centerlines c
  left join public.brinesearch_supplemental_centerline_identity_mappings m
    on m.centerline_id=c.id and m.active and m.mapping_status in ('verified','ambiguous')
  where c.dataset_id=v_run.dataset_id and c.state_code='OH'
    and c.county_code=v_run.county_code and c.active and c.last_ingest_run_id=p_run_id
  group by c.id,c.dataset_id,c.county_code,c.source_feature_key,c.source_record_id,c.source_digest
  on conflict(centerline_id) do update set
    dataset_id=excluded.dataset_id,state_code=excluded.state_code,county_code=excluded.county_code,
    ingest_run_id=excluded.ingest_run_id,disposition=excluded.disposition,
    candidate_count=excluded.candidate_count,verified_mapping_count=excluded.verified_mapping_count,
    evidence=excluded.evidence,active=true,updated_at=now();
  get diagnostics v_disposition_count=row_count;

  select count(*) filter(where disposition='unmatched_held')::integer,
    count(*) filter(where disposition='ambiguous')::integer
  into v_unmatched_count,v_ambiguous_count
  from public.brinesearch_supplemental_centerline_dispositions
  where dataset_id=v_run.dataset_id and state_code='OH'
    and county_code=v_run.county_code and ingest_run_id=p_run_id and active;
  if v_disposition_count<>(select count(*)
    from public.brinesearch_authoritative_supplemental_centerlines c
    where c.dataset_id=v_run.dataset_id and c.state_code='OH'
      and c.county_code=v_run.county_code and c.active and c.last_ingest_run_id=p_run_id) then
    raise exception 'Every Ohio supplemental centerline must receive a mapped-or-held disposition';
  end if;

  drop table if exists pg_temp.tmp_issue97_oh_supp_overlap;
  create temporary table tmp_issue97_oh_supp_overlap on commit drop as
  select c.id as centerline_id,m.identity_id,segment_key,
    c.source_feature_key,c.source_record_id,c.source_digest,c.name_events,
    c.municipality_left,c.municipality_right,o.ctl_begin,o.ctl_end,
    extensions.st_asgeojson(extensions.st_transform(overlap.geom,4326),15)::jsonb as overlap_geojson,
    overlap.start_fraction,overlap.end_fraction
  from public.brinesearch_authoritative_supplemental_centerlines c
  join public.brinesearch_supplemental_centerline_identity_mappings m
    on m.centerline_id=c.id and m.active and m.mapping_status='verified'
  cross join lateral unnest(m.source_segment_keys) segment_key
  join public.brinesearch_odot_road_catalog o
    on segment_key='OH:ODOT:SEGMENT:'||o.roadway_inventory_id
   and o.county_code=v_source_county and o.source_active and o.geom is not null
   and not extensions.st_isempty(o.geom) and extensions.st_isvalid(o.geom)
   and extensions.st_issimple(o.geom) and extensions.st_dimension(o.geom)=1
  cross join lateral (
    select overlap_line.geom,
      extensions.st_linelocatepoint(
        extensions.st_linemerge(extensions.st_transform(o.geom,3857)),
        extensions.st_startpoint(overlap_line.geom)
      ) as start_fraction,
      extensions.st_linelocatepoint(
        extensions.st_linemerge(extensions.st_transform(o.geom,3857)),
        extensions.st_endpoint(overlap_line.geom)
      ) as end_fraction
    from (
      select (d).geom
      from extensions.st_dump(extensions.st_collectionextract(extensions.st_intersection(
        extensions.st_transform(o.geom,3857),
        extensions.st_buffer(extensions.st_transform(c.geom,3857),0.25)
      ),2)) d
      order by extensions.st_length((d).geom) desc limit 1
    ) overlap_line
    where extensions.geometrytype(extensions.st_linemerge(extensions.st_transform(o.geom,3857)))='LINESTRING'
  ) overlap
  where c.dataset_id=v_run.dataset_id and c.state_code='OH'
    and c.county_code=v_run.county_code and c.active;
  create index tmp_issue97_oh_supp_overlap_identity_idx
    on tmp_issue97_oh_supp_overlap(identity_id,segment_key);

  insert into public.brinesearch_authoritative_road_names(
    identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
    source_segment_key,from_measure,to_measure,provenance,active,last_seen_at
  )
  select o.identity_id,v_run.dataset_id,
    o.source_feature_key||':'||o.segment_key||':'||coalesce(event->>'type','local')||':'||pg_catalog.md5(event->>'name'),
    case event->>'type' when '911' then '911' when 'legacy' then 'legacy'
      when 'alternate' then 'alternate' else 'local' end,
    event->>'name',pg_catalog.regexp_replace(pg_catalog.lower(event->>'name'),'[^a-z0-9]+',' ','g'),
    o.segment_key,
    case when o.ctl_begin is not null and o.ctl_end is not null then
      o.ctl_begin+(o.ctl_end-o.ctl_begin)*least(o.start_fraction,o.end_fraction)
      else o.ctl_begin end,
    case when o.ctl_begin is not null and o.ctl_end is not null then
      o.ctl_begin+(o.ctl_end-o.ctl_begin)*greatest(o.start_fraction,o.end_fraction)
      else o.ctl_end end,
    pg_catalog.jsonb_build_object(
      'supplemental_source_feature_key',o.source_feature_key,
      'supplemental_source_record_id',o.source_record_id,
      'supplemental_source_digest',o.source_digest,
      'source_name_event',event,'target_overlap',o.overlap_geojson,
      'target_overlap_fraction',pg_catalog.jsonb_build_array(
        least(o.start_fraction,o.end_fraction),greatest(o.start_fraction,o.end_fraction)
      ),
      'municipality_left',o.municipality_left,'municipality_right',o.municipality_right,
      'topology_authority',false,'source_endpoint_snapping_forbidden',true,
      'overlap_precomputed_once_per_segment',true,'ingest_run_id',p_run_id
    ),true,now()
  from tmp_issue97_oh_supp_overlap o
  cross join lateral pg_catalog.jsonb_array_elements(o.name_events) event
  where nullif(pg_catalog.btrim(event->>'name'),'') is not null
  on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update set
    normalized_name=excluded.normalized_name,source_segment_key=excluded.source_segment_key,
    from_measure=excluded.from_measure,to_measure=excluded.to_measure,
    provenance=excluded.provenance,active=true,last_seen_at=now(),updated_at=now();
  get diagnostics v_name_count=row_count;

  return pg_catalog.jsonb_build_object(
    'run_id',p_run_id,'mappings',v_mapping_count,'name_events_materialized',v_name_count,
    'name_matching_used',false,'nearest_road_matching_used',false,
    'target_primary_runs',v_target_runs,'centerline_dispositions',v_disposition_count,
    'unmatched_held',v_unmatched_count,'ambiguous_held',v_ambiguous_count,
    'every_centerline_disposed',true,
    'oh_materializer','indexed_direct_odot_source_segments',
    'name_overlap_materializer','precomputed_once_per_verified_segment'
  );
end
$$;

revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid)
from public,anon,authenticated,service_role;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_oh(uuid) is
  'Issue #97 Ohio OGRIP materializer. Identity equivalence uses indexed exact ODOT geometry/assignments; verified overlap geometry is computed once per source segment before expanding source-backed name events, preserving fractional LRS measures.';
