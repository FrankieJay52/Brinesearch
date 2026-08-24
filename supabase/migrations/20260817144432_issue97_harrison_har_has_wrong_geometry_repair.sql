-- GitHub #97 -- repair ten Harrison Road Manager rows whose source IDs and
-- centerlines came from Hardin (HAR), not Harrison (HAS).
--
-- Seven county-road mappings are already exact and are preserved byte-for-byte.
-- TR-225 receives exact Harrison provenance and geometry but deliberately stays
-- unmapped because the active graph captured it as unmapped. Jones Rd and CR-64
-- are quarantined: neither may expose the corrupt Hardin geometry to routing.
-- The only active-graph metadata mutation is a guarded mapping-fingerprint
-- restamp for the immutable CAR/HAS builds; graph children and activation do not
-- change.

create temporary table tmp_issue97_harrison_repair_targets(
  road_id uuid primary key,
  old_source_record_id text not null unique,
  identity_id uuid unique,
  target_source_record_id text unique,
  disposition text not null check(disposition in ('repair_mapped','repair_unmapped','quarantine'))
) on commit drop;

insert into tmp_issue97_harrison_repair_targets values
  ('f0db4fa8-3900-4350-a31e-3d61128006f8','CHARCR00014**C|route:CR:14','82d4acf0-4592-3c60-732f-ef07cb42796a','CHASCR00014**C|route:CR:14','repair_mapped'),
  ('ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3','CHARCR00020**C|route:CR:20','b0ec2efd-e511-2e2d-c481-eaf896757bbb','CHASCR00020**C|route:CR:20','repair_mapped'),
  ('639b05f2-5dc6-4678-86bf-e7a0a775663b','CHARCR00030**C|route:CR:30','83906bd8-9c10-e948-60e6-ed78a1ca34de','CHASCR00030**C|route:CR:30','repair_mapped'),
  ('7fe5f642-bfdc-4d5f-9f54-85f9b15af741','CHARCR00044**C|route:CR:44','100e158e-9b85-f169-ae1e-cbb88b9f18fa','CHASCR00044**C|route:CR:44','repair_mapped'),
  ('8da26948-222c-46ef-ac79-9d07ccd08c31','CHARCR00045**C|route:CR:45','dd89cc57-386f-5f4a-cd54-79c862bda433','CHASCR00045**C|route:CR:45','repair_mapped'),
  ('f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965','CHARCR00060**C|route:CR:60','1a09df0d-e31b-52a9-1d1d-6434e02546f5','CHASCR00060**C|route:CR:60','repair_mapped'),
  ('8382d2bf-d427-4a91-9afa-641885c71533','CHARCR00502**C|route:CR:502','d2f9004d-3a70-a61c-30b1-6aca9b4b46d0','CHASCR00502**C|route:CR:502','repair_mapped'),
  ('c1eefe49-fe29-44fa-84b7-2cfe29180761','THARTR00225**C|route:TR:225','dbcc9da8-07cb-f054-68ca-debe2f8640fc','THASTR00225**C|route:TR:225','repair_unmapped'),
  ('1a1988a9-b0d5-4414-8abf-ebeda1ac1f32','MHARMR00373**C|street:jones','40a0eda3-2dd3-6166-37cf-d4e1e1ac7040','THASTR00338**C|street:jones','quarantine'),
  ('ed00b321-3e61-4e84-bbcb-7497a1ae4b90','CHARCR00064**C|route:CR:64',null,null,'quarantine');

create temporary table tmp_issue97_harrison_graph_before on commit drop as
select build.id,build.state_code,build.county_code,build.status,
  build.source_revision_digest,build.graph_digest,build.source_segment_count,
  build.identity_count,build.point_junction_count,build.shared_segment_count,
  build.membership_count,build.activated_at,build.details->'source_run_vector' source_run_vector,
  build.details->>'mapping_snapshot_digest' mapping_snapshot_digest,
  pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(junction)::text,'|' order by junction.id)
    from public.brinesearch_road_junctions junction where junction.build_id=build.id),'')) junction_digest,
  pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(membership)::text,'|' order by membership.id)
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=build.id),'')) membership_digest,
  pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(anchor)::text,'|' order by anchor.id)
    from public.brinesearch_road_junction_anchors anchor
    join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
    where junction.build_id=build.id),'')) anchor_digest
from public.brinesearch_road_graph_builds build
where false and build.id in (
  '5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,
  '542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid
);

do $issue97_harrison_repair$
declare
  v_target record;
  v_build record;
  v_identity public.brinesearch_authoritative_road_identities%rowtype;
  v_dataset public.brinesearch_road_source_datasets%rowtype;
  v_old_geom extensions.geometry;
  v_new_geom extensions.geometry;
  v_distance_m double precision;
  v_mapping_digest text;
  v_graph_digest text;
  v_point_count integer;
  v_shared_count integer;
  v_membership_count integer;
  v_bad_anchor_count integer;
  v_mapping_mismatch_count integer;
  v_changed_build_ids uuid[];
  v_scope record;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:ohio-state-release'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:mapping-refresh'));
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:graph:OH:CAR'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:graph:OH:HAS'));

  perform road.id from public.brinesearch_roads road
  join tmp_issue97_harrison_repair_targets target on target.road_id=road.id
  order by road.id for update of road;
  perform build.id from public.brinesearch_road_graph_builds build
  where build.id in (
    '5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,
    '542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid
  ) order by build.id for update;

  insert into tmp_issue97_harrison_graph_before
  select build.id,build.state_code,build.county_code,build.status,
    build.source_revision_digest,build.graph_digest,build.source_segment_count,
    build.identity_count,build.point_junction_count,build.shared_segment_count,
    build.membership_count,build.activated_at,build.details->'source_run_vector',
    build.details->>'mapping_snapshot_digest',
    pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(junction)::text,'|' order by junction.id)
      from public.brinesearch_road_junctions junction where junction.build_id=build.id),'')),
    pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(membership)::text,'|' order by membership.id)
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
      where junction.build_id=build.id),'')),
    pg_catalog.md5(coalesce((select pg_catalog.string_agg(pg_catalog.to_jsonb(anchor)::text,'|' order by anchor.id)
      from public.brinesearch_road_junction_anchors anchor
      join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
      where junction.build_id=build.id),''))
  from public.brinesearch_road_graph_builds build
  where build.id in (
    '5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,
    '542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid
  );

  if (select count(*) from tmp_issue97_harrison_repair_targets)<>10
     or (select count(*) from public.brinesearch_roads road join tmp_issue97_harrison_repair_targets target on target.road_id=road.id
         where road.state='OH' and road.county='Harrison' and road.verification_status='verified'
           and not road.candidate_only and road.centerline_geojson is not null
           and road.source_record_id=target.old_source_record_id)<>10
  then
    raise exception 'Issue #97 Harrison frozen ten-road HAR corruption set drifted';
  end if;

  if (select count(*) from tmp_issue97_harrison_graph_before)<>2
     or not exists(select 1 from tmp_issue97_harrison_graph_before where id='5ee5f97b-447f-41d3-946a-68a8b28d8367' and county_code='CAR'
       and status='active' and source_revision_digest='853c139290afee94e391fc0395d40fed' and graph_digest='e9f4ed56bb2b1308b8b9913a751c78f5'
       and mapping_snapshot_digest='a2a49ac4f11baa703f05a493cf331c35' and source_segment_count=2640 and identity_count=1553
       and point_junction_count=2522 and shared_segment_count=90 and membership_count=5251
       and activated_at='2026-08-16T11:08:18.355674+00:00'::timestamptz)
     or not exists(select 1 from tmp_issue97_harrison_graph_before where id='542c35d5-a9ba-4b43-8a64-63a66f6b29e2' and county_code='HAS'
       and status='active' and source_revision_digest='610d4d5fe3a19cd1d07e9fc3049b2785' and graph_digest='1d8f6a52d2541e313932906f944b2f92'
       and mapping_snapshot_digest='211361b9586652be5188687de7ee9af9' and source_segment_count=2336 and identity_count=1013
       and point_junction_count=1746 and shared_segment_count=57 and membership_count=3550
       and activated_at='2026-08-16T11:08:18.355674+00:00'::timestamptz)
     or exists(select 1 from tmp_issue97_harrison_graph_before before
       where not private_verification.brinesearch_issue97_graph_build_release_current(before.id))
  then
    raise exception 'Issue #97 Harrison CAR/HAS active graph pins or release currentness drifted';
  end if;

  if not exists(
    select 1 from private_verification.brinesearch_issue97_state_candidate_manifests manifest
    where manifest.id='c41f5320-1273-470c-a316-28b42211d697'::uuid
      and manifest.manifest_key='issue97-ohio-r2-final-candidate'
      and manifest.manifest_digest='9763dc5bb626da71881b7381ed28a436'
      and manifest.generation_key='issue97-release-20260815-r2'
      and manifest.state_code='OH' and manifest.member_count=19
      and (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifest_members member
           where member.manifest_id=manifest.id)=19
  ) then
    raise exception 'Issue #97 exact Ohio state manifest drifted';
  end if;

  if exists(
    select 1 from tmp_issue97_harrison_repair_targets target
    where target.target_source_record_id is not null and (
      exists(select 1 from public.brinesearch_roads road
        where road.id<>target.road_id and (road.source_record_id=target.target_source_record_id
          or road.road_identity_key='official|'||target.target_source_record_id))
    )
  ) then
    raise exception 'Issue #97 Harrison target source-record or generated identity-key collision';
  end if;

  if exists(
    select 1 from tmp_issue97_harrison_repair_targets target
    join public.brinesearch_authoritative_road_identities identity on identity.id=target.identity_id
    where target.identity_id is not null and (
      not identity.active or identity.state_code<>'OH' or identity.county_code<>'HAS'
      or not private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code)
      or private_verification.brinesearch_issue97_authoritative_identity_geometry(identity.id) is null
      or identity.source_identity_key is distinct from 'OH:ODOT:NLF:'||pg_catalog.split_part(target.target_source_record_id,'|',1)
    )
  ) or (select count(*) from tmp_issue97_harrison_repair_targets target
        join public.brinesearch_authoritative_road_identities identity on identity.id=target.identity_id)<>9
  then
    raise exception 'Issue #97 pinned Harrison authoritative identity/source/geometry proof drifted';
  end if;

  if exists(
    select 1 from public.brinesearch_authoritative_road_identities identity
    where identity.active and identity.state_code='OH' and identity.county_code='HAS'
      and identity.road_class='county' and nullif(pg_catalog.ltrim(identity.route_number,'0'),'')='64'
      and private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code)
  ) then
    raise exception 'Issue #97 CR-64 quarantine no longer valid: a current exact HAS identity exists';
  end if;

  if (select count(*) from public.brinesearch_road_identity_mappings mapping
      join tmp_issue97_harrison_repair_targets target on target.identity_id=mapping.identity_id and target.road_id=mapping.road_id
      where target.disposition='repair_mapped' and mapping.mapping_status='verified'
        and mapping.mapping_method='exact_route_designation')<>7
     or exists(select 1 from public.brinesearch_road_identity_mappings mapping
       join tmp_issue97_harrison_repair_targets target on target.identity_id=mapping.identity_id
       where target.disposition<>'repair_mapped' and mapping.mapping_status='verified')
  then
    raise exception 'Issue #97 Harrison seven preserved mappings or unmapped quarantine/TR-225 proof drifted';
  end if;

  for v_target in select * from tmp_issue97_harrison_repair_targets order by road_id loop
    select extensions.st_geomfromgeojson(road.centerline_geojson::text)
      into strict v_old_geom from public.brinesearch_roads road where road.id=v_target.road_id for update;

    if v_target.identity_id is not null then
      select * into strict v_identity from public.brinesearch_authoritative_road_identities where id=v_target.identity_id;
      select * into strict v_dataset from public.brinesearch_road_source_datasets where id=v_identity.dataset_id;
      v_new_geom:=private_verification.brinesearch_issue97_authoritative_identity_geometry(v_identity.id);
      v_distance_m:=extensions.st_distance(v_old_geom::extensions.geography,v_new_geom::extensions.geography);
      -- ST_Distance over the complete linework is the true minimum-separation
      -- measure (rather than the larger centroid-to-line figure recorded during
      -- discovery). Every pinned HAR/HAS pair remains over 200 km apart.
      if v_distance_m<190000 or v_distance_m>350000 then
        raise exception 'Issue #97 road % no longer proves separated Hardin/Harrison geometry: % m',v_target.road_id,v_distance_m;
      end if;
    else
      v_new_geom:=null; v_distance_m:=null;
    end if;

    if v_target.disposition in ('repair_mapped','repair_unmapped') then
      update public.brinesearch_roads road set
        source_agency=v_dataset.source_agency,
        source_dataset=v_dataset.source_dataset,
        source_method='issue97_harrison_exact_authoritative_identity_repair',
        source_url=v_dataset.source_url,
        source_record_id=v_target.target_source_record_id,
        centerline_geojson=extensions.st_asgeojson(v_new_geom,7)::jsonb,
        geometry_status='official_centerline_loaded',
        geometry_checked_at=pg_catalog.clock_timestamp(),
        verification_status='verified',candidate_only=false,
        candidate_basis=coalesce(road.candidate_basis,'{}'::jsonb)||pg_catalog.jsonb_build_object(
          'issue',97,'repair','harrison_har_to_has','old_source_record_id',v_target.old_source_record_id,
          'authoritative_identity_id',v_identity.id,'source_identity_key',v_identity.source_identity_key,
          'source_digest',v_identity.source_digest,'source_current',true,
          'old_to_new_distance_m',pg_catalog.round(v_distance_m::numeric,3),
          'geometry_source','pinned_authoritative_identity_segments','name_matching_used',false,
          'fuzzy_matching_used',false,'nearest_road_used',false,'nearest_geometry_used',false,
          'mapping_disposition',case when v_target.disposition='repair_mapped' then 'preserved_exact_mapping' else 'held_unmapped_graph_membership_guard' end
        ),
        updated_at=pg_catalog.clock_timestamp()
      where road.id=v_target.road_id;
    else
      update public.brinesearch_roads road set
        source_agency=null,source_dataset=null,
        source_method='issue97_harrison_hardin_contamination_quarantine',source_url=null,
        source_record_id=null,centerline_geojson=null,geometry_status='not_loaded',
        geometry_checked_at=pg_catalog.clock_timestamp(),verification_status='needs_review',
        verified_at=null,candidate_only=true,
        candidate_basis=coalesce(road.candidate_basis,'{}'::jsonb)||pg_catalog.jsonb_build_object(
          'issue',97,'repair','harrison_har_to_has','disposition','quarantined',
          'old_source_record_id',v_target.old_source_record_id,
          'reason',case when v_target.identity_id is null then 'no_exact_current_harrison_identity' else 'semantic_class_change_requires_separate_review' end,
          'candidate_authoritative_identity_id',v_target.identity_id,
          'old_to_candidate_distance_m',case when v_distance_m is null then null else pg_catalog.round(v_distance_m::numeric,3) end,
          'hardin_geometry_removed',true,'name_matching_used',false,'fuzzy_matching_used',false,
          'nearest_road_used',false,'nearest_geometry_used',false
        ),
        notes=pg_catalog.concat_ws(E'\n',nullif(road.notes,''),
          'Issue #97 quarantine: Harrison row carried Hardin source provenance and geometry; routing use is held.'),
        updated_at=pg_catalog.clock_timestamp()
      where road.id=v_target.road_id;
    end if;
  end loop;

  if exists(select 1 from public.brinesearch_roads road join tmp_issue97_harrison_repair_targets target on target.road_id=road.id
      where road.source_record_id like '%HAR%' or road.road_identity_key like 'official|%HAR%')
     or (select count(*) from public.brinesearch_roads road join tmp_issue97_harrison_repair_targets target on target.road_id=road.id
         where target.disposition in ('repair_mapped','repair_unmapped')
           and road.source_record_id=target.target_source_record_id
           and road.road_identity_key='official|'||target.target_source_record_id
           and road.centerline_geojson=extensions.st_asgeojson(
             private_verification.brinesearch_issue97_authoritative_identity_geometry(target.identity_id),7)::jsonb
           and road.verification_status='verified' and not road.candidate_only
           and road.geometry_status='official_centerline_loaded')<>8
     or (select count(*) from public.brinesearch_roads road join tmp_issue97_harrison_repair_targets target on target.road_id=road.id
         where target.disposition='quarantine' and road.source_record_id is null and road.centerline_geojson is null
           and road.verification_status='needs_review' and road.candidate_only and road.geometry_status='not_loaded')<>2
  then
    raise exception 'Issue #97 Harrison repaired/quarantined Road Manager postcondition failed';
  end if;

  for v_build in select * from tmp_issue97_harrison_graph_before order by county_code loop
    with identity_set as (
      select distinct membership.identity_id
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
      where junction.build_id=v_build.id
    )
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(identity_set.identity_id::text||':'||
      private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(identity_set.identity_id),',' order by identity_set.identity_id),''))
    into v_mapping_digest from identity_set;

    select pg_catalog.md5(coalesce(pg_catalog.string_agg(junction.stable_junction_key||':'||junction.graph_digest,',' order by junction.stable_junction_key),'')),
      count(*) filter(where junction.junction_type<>'shared_segment')::integer,
      count(*) filter(where junction.junction_type='shared_segment')::integer
    into v_graph_digest,v_point_count,v_shared_count from public.brinesearch_road_junctions junction where junction.build_id=v_build.id;
    select count(*)::integer into v_membership_count from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id where junction.build_id=v_build.id;
    select count(*)::integer into v_bad_anchor_count from (
      select junction.id from public.brinesearch_road_junctions junction
      left join public.brinesearch_road_junction_anchors anchor on anchor.junction_id=junction.id
      where junction.build_id=v_build.id group by junction.id,junction.junction_type
      having count(anchor.id)<>case when junction.junction_type='shared_segment' then 2 else 1 end
        or pg_catalog.bool_or(anchor.anchor_digest<>pg_catalog.md5(extensions.st_asgeojson(anchor.geom,15)))
    ) bad;
    with captured as (
      select distinct membership.identity_id,membership.road_id from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id where junction.build_id=v_build.id
    ) select count(*)::integer into v_mapping_mismatch_count from captured
      left join public.brinesearch_road_identity_mappings mapping on mapping.identity_id=captured.identity_id and mapping.mapping_status='verified'
      where captured.road_id is distinct from mapping.road_id;

    if v_mapping_digest is distinct from (case v_build.county_code
         when 'CAR' then 'e50ef5799abf04d16c2ecb79d4db0651'
         when 'HAS' then '7d0561a0f32e7432880d4ad39e5e7109'
       end)
       or v_graph_digest is distinct from v_build.graph_digest or v_point_count<>v_build.point_junction_count
       or v_shared_count<>v_build.shared_segment_count or v_membership_count<>v_build.membership_count
       or v_bad_anchor_count<>0 or v_mapping_mismatch_count<>0
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(junction)::text,'|' order by junction.id),'') )
           from public.brinesearch_road_junctions junction where junction.build_id=v_build.id)<>v_build.junction_digest
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(membership)::text,'|' order by membership.id),'') )
           from public.brinesearch_road_junction_memberships membership join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
           where junction.build_id=v_build.id)<>v_build.membership_digest
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(anchor)::text,'|' order by anchor.id),'') )
           from public.brinesearch_road_junction_anchors anchor join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
           where junction.build_id=v_build.id)<>v_build.anchor_digest
    then
      raise exception 'Issue #97 Harrison % graph topology/membership guard failed',v_build.county_code;
    end if;

    update public.brinesearch_road_graph_builds build set details=build.details||pg_catalog.jsonb_build_object(
      'mapping_snapshot_digest',v_mapping_digest,
      'mapping_snapshot_upgrade_reason','harrison_har_to_has_wrong_geometry_repair',
      'mapping_snapshot_upgrade_proof',pg_catalog.jsonb_build_object(
        'prior_mapping_snapshot_digest',v_build.mapping_snapshot_digest,
        'new_mapping_snapshot_digest',v_mapping_digest,'topology_changed',false,
        'source_run_vector_unchanged',true,'graph_digest_recomputed',v_graph_digest,
        'point_junction_count',v_point_count,'shared_segment_count',v_shared_count,
        'membership_count',v_membership_count,'bad_anchor_count',v_bad_anchor_count,
        'membership_current_mapping_mismatch_count',v_mapping_mismatch_count,
        'repair_scope','ten frozen Harrison HAR-contaminated Road Manager rows'
      )
    ) where build.id=v_build.id;
  end loop;

  select pg_catalog.array_agg(build.id order by build.id) into v_changed_build_ids
  from public.brinesearch_road_graph_builds build join tmp_issue97_harrison_graph_before before on before.id=build.id
  where build.details->>'mapping_snapshot_digest' is distinct from before.mapping_snapshot_digest;
  if v_changed_build_ids is distinct from array[
       '542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid,
       '5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid
     ]
     or exists(select 1 from tmp_issue97_harrison_graph_before before join public.brinesearch_road_graph_builds build on build.id=before.id
       where build.source_revision_digest is distinct from before.source_revision_digest
         or build.graph_digest is distinct from before.graph_digest or build.source_segment_count<>before.source_segment_count
         or build.identity_count<>before.identity_count or build.point_junction_count<>before.point_junction_count
         or build.shared_segment_count<>before.shared_segment_count or build.membership_count<>before.membership_count
         or build.activated_at is distinct from before.activated_at or build.details->'source_run_vector' is distinct from before.source_run_vector
         or not private_verification.brinesearch_issue97_graph_build_release_current(build.id))
  then
    raise exception 'Issue #97 Harrison guarded CAR/HAS mapping restamp failed';
  end if;

  if (select count(*) from public.brinesearch_road_identity_mappings mapping
      join tmp_issue97_harrison_repair_targets target on target.identity_id=mapping.identity_id and target.road_id=mapping.road_id
      where target.disposition='repair_mapped' and mapping.mapping_status='verified')<>7
     or exists(select 1 from public.brinesearch_road_identity_mappings mapping
       join tmp_issue97_harrison_repair_targets target on target.identity_id=mapping.identity_id
       where target.disposition<>'repair_mapped' and mapping.mapping_status='verified')
  then
    raise exception 'Issue #97 Harrison mapping postcondition changed';
  end if;

  if (select count(*)
      from private_verification.brinesearch_issue97_state_candidate_manifest_members member
      where member.manifest_id='c41f5320-1273-470c-a316-28b42211d697'::uuid
        and private_verification.brinesearch_issue97_graph_build_release_current(
          (member.member_value->>'build_id')::uuid
        ))<>19
  then
    raise exception 'Issue #97 Ohio 19-member manifest is not fully release-current after Harrison repair';
  end if;
end
$issue97_harrison_repair$;
