-- GitHub #97 — authoritative ODOT shared/concurrent pavement.
--
-- ODOT TIMS explicitly represents route concurrencies with secondary inventory
-- rows (OVERLAP_INDICATOR='S') linked to one primary physical-pavement row by
-- PRIMARY_OVERLAP_ID. Current production contains 2,924 such secondary rows
-- across all 19 Ohio counties. The prior graph builder detects shared sections
-- from positive-length geometric intersection, which can miss an official
-- concurrency when ODOT's secondary line is slightly offset from its primary.
--
-- This migration changes ONLY the builder's temporary topology linework. For an
-- exact current ODOT secondary-overlap record, the temporary segment uses the
-- linked primary record's geometry (reversed only when OVERLAP_INVERSE_IND='Y').
-- Persistent source/authoritative geometry remains unchanged. The release
-- generation registry is updated in the same migration to bind the new exact
-- builder definition before release-current stamping begins.

-- Lock every graph lane before replacing the global builder definition.
do $issue97_lock_graph_builder_lanes$
declare scope record;
begin
  for scope in
    select state_code,county_code
    from public.brinesearch_road_graph_counties
    where active
    order by state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:'||scope.state_code||':'||scope.county_code
    ));
  end loop;
end
$issue97_lock_graph_builder_lanes$;

create temporary table issue97_odot_overlap_before on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging') as staging_count,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships) as membership_count,
  (select builder_definition_md5
   from private_verification.brinesearch_issue97_graph_release_generations
   where active and generation_key='issue97-release-20260814-r1') as release_builder_md5,
  pg_catalog.pg_get_functiondef(proc.oid) as builder_definition,
  proc.proowner as builder_owner,
  proc.proacl as builder_acl,
  proc.prosecdef as builder_security_definer,
  proc.provolatile as builder_volatility,
  proc.proconfig as builder_config,
  proc.prolang as builder_language
from pg_catalog.pg_proc proc
where proc.oid='public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;

do $issue97_odot_overlap_patch$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
  v_rows integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'7abd11f432c3e7b475b10d0817f5e8fc' then
    raise exception 'Issue #97 ODOT overlap patch expected builder 7abd11f4; found %',
      pg_catalog.md5(v_definition);
  end if;
  if (select builder_definition_md5
      from private_verification.brinesearch_issue97_graph_release_generations
      where active and generation_key='issue97-release-20260814-r1')
      is distinct from '7abd11f432c3e7b475b10d0817f5e8fc' then
    raise exception 'Issue #97 ODOT overlap patch expected release generation builder 7abd11f4';
  end if;
  v_patched:=v_definition;

  v_old:=$old$  drop table if exists pg_temp.tmp_issue97_target_segments;
  drop table if exists pg_temp.tmp_issue97_segments;
  drop table if exists pg_temp.tmp_issue97_vertices;$old$;
  v_new:=$new$  drop table if exists pg_temp.tmp_issue97_target_segments;
  drop table if exists pg_temp.tmp_issue97_segments;
  drop table if exists pg_temp.tmp_issue97_odot_overlap_pairs;
  drop table if exists pg_temp.tmp_issue97_vertices;$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 ODOT overlap drop anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$  analyze tmp_issue97_segments;
  select count(*),count(distinct identity_id),$old$;
  v_new:=$new$  analyze tmp_issue97_segments;

  -- Exact ODOT source relationship; no geometry/name matching chooses the pair.
  create index tmp_issue97_segments_source_record_idx
    on tmp_issue97_segments(source_record_id);
  create temporary table tmp_issue97_odot_overlap_pairs on commit drop as
  select secondary.id as secondary_segment_id,
    secondary.identity_id as secondary_identity_id,
    secondary.source_segment_key as secondary_segment_key,
    secondary.source_record_id as secondary_source_record_id,
    primary_seg.id as primary_segment_id,
    primary_seg.identity_id as primary_identity_id,
    primary_seg.source_segment_key as primary_segment_key,
    primary_seg.source_record_id as primary_source_record_id,
    secondary.attributes->>'OVERLAP_INVERSE_IND' as overlap_inverse_ind,
    secondary.geom as source_secondary_geom,
    primary_seg.geom as source_primary_geom,
    case when secondary.attributes->>'OVERLAP_INVERSE_IND'='Y'
      then extensions.st_reverse(primary_seg.geom) else primary_seg.geom end as topology_geom
  from tmp_issue97_segments secondary
  join tmp_issue97_segments primary_seg
    on primary_seg.state_code='OH'
   and primary_seg.county_code=secondary.county_code
   and primary_seg.source_record_id=secondary.attributes->>'PRIMARY_OVERLAP_ID'
   and primary_seg.attributes->>'OVERLAP_INDICATOR'='P'
   and primary_seg.attributes->>'PRIMARY_IND'='Y'
  where v_state='OH'
    and secondary.state_code='OH' and secondary.county_code=v_county
    and secondary.attributes->>'OVERLAP_INDICATOR'='S'
    and secondary.attributes->>'PRIMARY_IND'='N'
    and secondary.attributes->>'OVERLAP_INVERSE_IND' in ('N','Y')
    and secondary.identity_id<>primary_seg.identity_id;
  create unique index tmp_issue97_odot_overlap_pairs_secondary_idx
    on tmp_issue97_odot_overlap_pairs(secondary_segment_id);

  -- Every secondary overlap admitted to this Ohio build must resolve to exactly
  -- one current primary pavement segment. The unique index above also fails
  -- closed if the source relationship becomes one-to-many unexpectedly.
  if v_state='OH' and exists(
    select 1 from tmp_issue97_segments secondary
    where secondary.state_code='OH' and secondary.county_code=v_county
      and secondary.attributes->>'OVERLAP_INDICATOR'='S'
      and not exists(select 1 from tmp_issue97_odot_overlap_pairs pair
        where pair.secondary_segment_id=secondary.id)
  ) then
    raise exception 'Issue #97 ODOT secondary overlap lacks one exact current primary-pavement segment'
      using errcode='55000';
  end if;
  if exists(select 1 from tmp_issue97_odot_overlap_pairs pair
      where pair.secondary_identity_id=pair.primary_identity_id
        or pair.overlap_inverse_ind not in ('N','Y')) then
    raise exception 'Issue #97 ODOT overlap provenance is internally inconsistent'
      using errcode='55000';
  end if;

  update tmp_issue97_segments secondary
  set geom=pair.topology_geom,
      attributes=coalesce(secondary.attributes,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'issue97_topology_geometry_source','odot_primary_overlap',
        'issue97_primary_overlap_source_record_id',pair.primary_source_record_id,
        'issue97_primary_overlap_source_segment_key',pair.primary_segment_key,
        'issue97_overlap_inverse_ind',pair.overlap_inverse_ind,
        'issue97_persistent_secondary_geometry_unchanged',true
      )
  from tmp_issue97_odot_overlap_pairs pair
  where secondary.id=pair.secondary_segment_id;
  analyze tmp_issue97_segments;

  select count(*),count(distinct identity_id),$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 ODOT overlap normalization anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  v_old:=$old$      'different_vertexization_supported',true,'point_collapse_forbidden',true,
      'endpoint_events',pg_catalog.jsonb_build_array('concurrency_begin','concurrency_end'),$old$;
  v_new:=$new$      'odot_authoritative_overlap_pairs',coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'secondary_identity_id',pair.secondary_identity_id,
          'secondary_source_segment_key',pair.secondary_segment_key,
          'secondary_source_record_id',pair.secondary_source_record_id,
          'primary_identity_id',pair.primary_identity_id,
          'primary_source_segment_key',pair.primary_segment_key,
          'primary_source_record_id',pair.primary_source_record_id,
          'overlap_inverse_ind',pair.overlap_inverse_ind,
          'topology_geometry_source','odot_primary_overlap',
          'persistent_secondary_geometry_unchanged',true
        ) order by pair.secondary_segment_key,pair.primary_segment_key)
        from tmp_issue97_odot_overlap_pairs pair
        where pair.secondary_identity_id=any(s.identity_ids)
          and pair.primary_identity_id=any(s.identity_ids)
          and extensions.st_intersects(pair.topology_geom,s.geom)
          and extensions.st_length(
            extensions.st_collectionextract(
              extensions.st_intersection(pair.topology_geom,s.geom),2
            )::extensions.geography
          )>0.02
      ),'[]'::jsonb),
      'different_vertexization_supported',true,'point_collapse_forbidden',true,
      'endpoint_events',pg_catalog.jsonb_build_array('concurrency_begin','concurrency_end'),$new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 ODOT overlap provenance anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  if v_patched not like '%issue97_topology_geometry_source%'
     or v_patched not like '%odot_authoritative_overlap_pairs%'
     or v_patched like '%similarity(%'
     or v_patched like '%<->%' then
    raise exception 'Issue #97 ODOT overlap patch did not preserve source-only no-guess semantics';
  end if;

  execute v_patched;

  update private_verification.brinesearch_issue97_graph_release_generations
  set builder_definition_md5='793ed8985252b00d52f46da497484029',
      review_details=review_details||pg_catalog.jsonb_build_object(
        'odot_overlap_contract','exact TIMS PRIMARY_OVERLAP_ID shared-pavement linkage; temporary topology geometry only',
        'odot_overlap_inverse_semantics','OVERLAP_INVERSE_IND reverses primary pavement geometry only for the secondary topology occurrence',
        'persistent_odot_geometry_rewritten',false,
        'name_or_nearest_matching_used',false
      )
  where active and generation_key='issue97-release-20260814-r1'
    and builder_definition_md5='7abd11f432c3e7b475b10d0817f5e8fc';
  get diagnostics v_rows=row_count;
  if v_rows<>1 then
    raise exception 'Issue #97 ODOT overlap release-generation update expected exactly one row; changed %',v_rows;
  end if;
end
$issue97_odot_overlap_patch$;

do $issue97_odot_overlap_verify$
declare
  v_before issue97_odot_overlap_before%rowtype;
  v_proc record;
  v_definition text;
  v_generation record;
begin
  select * into strict v_before from issue97_odot_overlap_before;
  select pg_catalog.pg_get_functiondef(proc.oid) as definition,
    proc.proowner,proc.proacl,proc.prosecdef,proc.provolatile,proc.proconfig,proc.prolang
  into strict v_proc
  from pg_catalog.pg_proc proc
  where proc.oid='public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure;
  v_definition:=v_proc.definition;

  select * into strict v_generation
  from private_verification.brinesearch_issue97_graph_release_generations
  where active and generation_key='issue97-release-20260814-r1';

  if pg_catalog.md5(v_definition)<>'793ed8985252b00d52f46da497484029'
     or v_generation.builder_definition_md5<>'793ed8985252b00d52f46da497484029'
     or v_generation.review_details->>'persistent_odot_geometry_rewritten'<>'false'
     or v_generation.review_details->>'name_or_nearest_matching_used'<>'false'
     or v_definition not like '%issue97_topology_geometry_source%'
     or v_definition not like '%odot_authoritative_overlap_pairs%'
     or v_definition not like '%PRIMARY_OVERLAP_ID%'
     or v_definition not like '%OVERLAP_INVERSE_IND%'
     or v_definition like '%similarity(%'
     or v_definition like '%<->%' then
    raise exception 'Issue #97 authoritative ODOT overlap builder/generation did not install exactly';
  end if;

  if v_proc.proowner is distinct from v_before.builder_owner
     or v_proc.proacl is distinct from v_before.builder_acl
     or v_proc.prosecdef is distinct from v_before.builder_security_definer
     or v_proc.provolatile is distinct from v_before.builder_volatility
     or v_proc.proconfig is distinct from v_before.builder_config
     or v_proc.prolang is distinct from v_before.builder_language then
    raise exception 'Issue #97 ODOT overlap migration changed builder metadata or ACL';
  end if;

  if public.brinesearch_issue97_cutover_active() is distinct from v_before.cutover_active
     or (select count(*) from public.brinesearch_road_graph_builds) is distinct from v_before.build_count
     or (select count(*) from public.brinesearch_road_graph_builds where status='staging') is distinct from v_before.staging_count
     or (select count(*) from public.brinesearch_road_junctions) is distinct from v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors) is distinct from v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships) is distinct from v_before.membership_count then
    raise exception 'Issue #97 ODOT overlap migration changed graph or cutover state';
  end if;
end
$issue97_odot_overlap_verify$;

comment on function public.brinesearch_issue97_rebuild_county_graph(text,text) is
  'Issue #97 authoritative county graph builder. Ohio shared/concurrent pavement honors exact ODOT PRIMARY_OVERLAP_ID relationships in temporary topology linework; persistent source geometry is unchanged. Generic topology remains no-guess. SECURITY DEFINER with fixed empty search_path; service_role only.';
