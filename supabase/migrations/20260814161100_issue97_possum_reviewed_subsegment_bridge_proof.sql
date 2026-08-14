-- GitHub #97 — continuation of reviewed PA/WAS supplemental subsegment bridge rollout.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create or replace function private_verification.brinesearch_issue97_reviewed_subsegment_bridge_proof(
  p_run_id uuid
)
returns table(
  centerline_id uuid,
  identity_id uuid,
  source_segment_key text,
  evidence jsonb
)
language sql
stable
security definer
set search_path=''
as $$
  with run as (
    select r.id,r.dataset_id,r.state_code,r.county_code
    from public.brinesearch_road_source_ingest_runs r
    join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
    where r.id=p_run_id and d.source_key='pa_washington_ng911_centerlines'
      and r.state_code='PA' and r.county_code='WAS'
      and r.status in ('loading','complete')
  ), base as (
    select bridge.*,c.id as centerline_id,c.geom as source_geom,
      c.municipality_left,c.municipality_right,c.source_digest as source_feature_digest,
      neighbor.id as neighbor_centerline_id,neighbor.geom as neighbor_source_geom,
      neighbor.municipality_left as neighbor_municipality_left,
      neighbor.municipality_right as neighbor_municipality_right,
      i.id as identity_id,i.municipality as target_municipality,
      s.geom as target_geom,s.source_digest as target_segment_digest,
      ni.id as neighbor_identity_id,ni.municipality as neighbor_target_municipality,
      ns.geom as neighbor_target_geom,ns.source_digest as neighbor_target_segment_digest,
      extensions.st_linemerge(extensions.st_transform(c.geom,3857)) as source_line,
      extensions.st_linemerge(extensions.st_transform(s.geom,3857)) as target_line
    from run
    join private_verification.brinesearch_issue97_reviewed_supplemental_subsegment_bridges bridge
      on bridge.dataset_id=run.dataset_id and bridge.state_code=run.state_code
      and bridge.county_code=run.county_code and bridge.active
    join public.brinesearch_authoritative_supplemental_centerlines c
      on c.dataset_id=run.dataset_id and c.state_code=run.state_code
      and c.county_code=run.county_code and c.source_feature_key=bridge.source_feature_key
      and c.active and c.last_ingest_run_id=run.id
    join public.brinesearch_authoritative_supplemental_centerlines neighbor
      on neighbor.dataset_id=run.dataset_id and neighbor.state_code=run.state_code
      and neighbor.county_code=run.county_code
      and neighbor.source_feature_key=bridge.neighbor_source_feature_key
      and neighbor.active and neighbor.last_ingest_run_id=run.id
    join public.brinesearch_authoritative_road_identities i
      on i.source_identity_key=bridge.target_identity_key and i.active
      and i.state_code=run.state_code and i.county_code=run.county_code
    join private_verification.brinesearch_issue97_authoritative_road_segments_internal s
      on s.identity_id=i.id and s.source_segment_key=bridge.target_source_segment_key and s.active
    join public.brinesearch_authoritative_road_identities ni
      on ni.source_identity_key=bridge.neighbor_target_identity_key and ni.active
      and ni.state_code=run.state_code and ni.county_code=run.county_code
    join private_verification.brinesearch_issue97_authoritative_road_segments_internal ns
      on ns.identity_id=ni.id and ns.source_segment_key=bridge.neighbor_target_source_segment_key and ns.active
    where extensions.geometrytype(extensions.st_linemerge(c.geom))='LINESTRING'
      and extensions.geometrytype(extensions.st_linemerge(s.geom))='LINESTRING'
  ), located as (
    select b.*,
      extensions.st_linelocatepoint(target_line,
        extensions.st_closestpoint(target_line,extensions.st_startpoint(source_line))) as start_fraction,
      extensions.st_linelocatepoint(target_line,
        extensions.st_closestpoint(target_line,extensions.st_endpoint(source_line))) as end_fraction,
      extensions.st_distance(extensions.st_startpoint(source_line),target_line) as start_distance_m,
      extensions.st_distance(extensions.st_endpoint(source_line),target_line) as end_distance_m
    from base b
  ), clipped as (
    select l.*,extensions.st_linesubstring(target_line,
      least(start_fraction,end_fraction),greatest(start_fraction,end_fraction)) as target_clip
    from located l
  ), metrics as (
    select c.*,
      extensions.st_hausdorffdistance(source_line,target_clip) as clip_hausdorff_m,
      extensions.st_length(extensions.st_intersection(
        source_line,extensions.st_buffer(target_clip,5)
      ))/nullif(extensions.st_length(source_line),0) as source_coverage_5m,
      extensions.st_length(extensions.st_intersection(
        target_clip,extensions.st_buffer(source_line,5)
      ))/nullif(extensions.st_length(target_clip),0) as clip_coverage_5m,
      extensions.st_length(source_line)/nullif(extensions.st_length(target_clip),0) as length_ratio
    from clipped c
  ), boundary as (
    select m.*,source_pair.source_endpoint_role,source_pair.source_boundary_geom,
      source_pair.source_neighbor_endpoint_role,
      target_pair.target_endpoint_role,target_pair.target_boundary_geom,
      target_pair.target_neighbor_endpoint_role,
      source_pair.source_boundary_distance_m,target_pair.target_boundary_distance_m,
      extensions.st_distance(
        source_pair.source_boundary_geom::extensions.geography,
        target_pair.target_boundary_geom::extensions.geography
      ) as cross_source_boundary_distance_m
    from metrics m
    cross join lateral (
      select a.role as source_endpoint_role,a.geom as source_boundary_geom,
        b.role as source_neighbor_endpoint_role,
        extensions.st_distance(a.geom::extensions.geography,b.geom::extensions.geography)
          as source_boundary_distance_m
      from (values
        ('start'::text,extensions.st_startpoint(extensions.st_linemerge(m.source_geom))),
        ('end'::text,extensions.st_endpoint(extensions.st_linemerge(m.source_geom)))
      ) a(role,geom)
      cross join (values
        ('start'::text,extensions.st_startpoint(extensions.st_linemerge(m.neighbor_source_geom))),
        ('end'::text,extensions.st_endpoint(extensions.st_linemerge(m.neighbor_source_geom)))
      ) b(role,geom)
      order by source_boundary_distance_m,a.role,b.role
      limit 1
    ) source_pair
    cross join lateral (
      select a.role as target_endpoint_role,a.geom as target_boundary_geom,
        b.role as target_neighbor_endpoint_role,
        extensions.st_distance(a.geom::extensions.geography,b.geom::extensions.geography)
          as target_boundary_distance_m
      from (values
        ('start'::text,extensions.st_startpoint(extensions.st_linemerge(m.target_geom))),
        ('end'::text,extensions.st_endpoint(extensions.st_linemerge(m.target_geom)))
      ) a(role,geom)
      cross join (values
        ('start'::text,extensions.st_startpoint(extensions.st_linemerge(m.neighbor_target_geom))),
        ('end'::text,extensions.st_endpoint(extensions.st_linemerge(m.neighbor_target_geom)))
      ) b(role,geom)
      order by target_boundary_distance_m,a.role,b.role
      limit 1
    ) target_pair
  )
  select centerline_id,identity_id,target_source_segment_key,
    pg_catalog.jsonb_build_object(
      'mapping_method','exact_source_subsegment_boundary_pair',
      'reviewed_bridge',true,
      'source_feature_key',source_feature_key,
      'source_feature_digest',source_feature_digest,
      'target_identity_key',target_identity_key,
      'target_source_segment_key',target_source_segment_key,
      'target_segment_digest',target_segment_digest,
      'neighbor_source_feature_key',neighbor_source_feature_key,
      'neighbor_target_identity_key',neighbor_target_identity_key,
      'neighbor_target_source_segment_key',neighbor_target_source_segment_key,
      'neighbor_target_segment_digest',neighbor_target_segment_digest,
      'source_endpoint_role',source_endpoint_role,
      'source_neighbor_endpoint_role',source_neighbor_endpoint_role,
      'target_endpoint_role',target_endpoint_role,
      'target_neighbor_endpoint_role',target_neighbor_endpoint_role,
      'source_boundary_distance_m',source_boundary_distance_m,
      'target_boundary_distance_m',target_boundary_distance_m,
      'cross_source_boundary_distance_m',cross_source_boundary_distance_m,
      'max_endpoint_distance_m',greatest(start_distance_m,end_distance_m),
      'clip_hausdorff_m',clip_hausdorff_m,
      'source_coverage_5m',source_coverage_5m,
      'clip_coverage_5m',clip_coverage_5m,
      'source_clip_length_ratio',length_ratio,
      'source_boundary_coordinate',extensions.st_asgeojson(source_boundary_geom,15)::jsonb,
      'target_boundary_coordinate',extensions.st_asgeojson(target_boundary_geom,15)::jsonb,
      'name_used_for_mapping',false,'fuzzy_matching_used',false,
      'route_number_only_used',false,'nearest_road_used_for_mapping',false,
      'source_endpoint_snapping_forbidden',true,
      'review_details',review_details
    )
  from boundary
  where private_verification.brinesearch_issue97_municipality_key(target_municipality)
      =expected_source_municipality_key
    and expected_source_municipality_key in (
      private_verification.brinesearch_issue97_municipality_key(municipality_left),
      private_verification.brinesearch_issue97_municipality_key(municipality_right)
    )
    and private_verification.brinesearch_issue97_municipality_key(neighbor_target_municipality)
      =expected_neighbor_municipality_key
    and expected_neighbor_municipality_key in (
      private_verification.brinesearch_issue97_municipality_key(neighbor_municipality_left),
      private_verification.brinesearch_issue97_municipality_key(neighbor_municipality_right)
    )
    and greatest(start_distance_m,end_distance_m)<=max_endpoint_distance_m
    and clip_hausdorff_m<=max_clip_hausdorff_m
    and source_coverage_5m>=min_source_coverage_5m
    and clip_coverage_5m>=min_clip_coverage_5m
    and length_ratio between min_length_ratio and max_length_ratio
    and source_boundary_distance_m<=0.03
    and target_boundary_distance_m<=0.03
    and cross_source_boundary_distance_m<=max_cross_source_boundary_distance_m
    and not exists(
      select 1
      from public.brinesearch_supplemental_centerline_identity_mappings existing
      where existing.centerline_id=boundary.centerline_id and existing.active
        and existing.ingest_run_id=p_run_id and existing.mapping_status='verified'
        and existing.identity_id<>boundary.identity_id
    )
$$;

revoke all on function private_verification.brinesearch_issue97_reviewed_subsegment_bridge_proof(uuid)
from public,anon,authenticated,service_role;

