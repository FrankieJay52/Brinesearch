-- GitHub #97 — guard frozen Noble against the future Washington county
-- refresh_scope bookkeeping change.
--
-- The active Noble graph is a legacy mapping snapshot. It contains three exact
-- Washington boundary mappings. Migration 20260813101140 makes their future
-- county refresh preserve exact adoption evidence and add only refresh_scope,
-- which graph semantic v2 deliberately ignores. Upgrade only this independently
-- verified frozen Noble generation, after reconstructing its legacy mapping and
-- topology digests exactly. No graph child, mapping, source, activation or
-- cutover row is changed.

do $issue97_upgrade_noble_graph_mapping_snapshot$
declare
  v_build public.brinesearch_road_graph_builds%rowtype;
  v_scope record;
  v_legacy_digest text;
  v_semantic_digest text;
  v_recomputed_graph_digest text;
  v_recomputed_point_count integer;
  v_recomputed_shared_count integer;
  v_recomputed_membership_count integer;
  v_membership_mapping_mismatches integer;
  v_bad_anchor_count integer;
  v_was_boundary_identity_count integer;
  v_was_machine_mapping_count integer;
  v_was_machine_missing_refresh_scope integer;
  v_was_exact_rows jsonb;
  v_was_candidate_rows jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:graph:OH:NOB')
  );
  for v_scope in
    select scope.dataset_id,scope.county_code
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

  select build.* into v_build
  from public.brinesearch_road_graph_builds build
  where build.state_code='OH' and build.county_code='NOB' and build.status='active'
  for update;
  if not found then
    if not exists(
      select 1 from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.county_code='NOB'
    ) then return; end if;
    raise exception 'Issue #97 Noble guarded semantic upgrade requires the frozen active graph';
  end if;

  if v_build.source_revision_digest is distinct from '89af7128d56bbc4ef3733436d0813823'
     or v_build.graph_digest is distinct from '83e3e777c8ec9732f43e513832560ad8'
     or v_build.source_segment_count is distinct from 1959
     or v_build.identity_count is distinct from 1030
     or v_build.point_junction_count is distinct from 1381
     or v_build.shared_segment_count is distinct from 40
     or v_build.membership_count is distinct from 2841
     or not private_verification.brinesearch_issue97_graph_build_sources_current(v_build.id)
  then
    raise exception 'Issue #97 Noble guarded semantic upgrade does not match the frozen current graph';
  end if;

  if v_build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2' then
    if v_build.details->>'mapping_snapshot_legacy_digest' is distinct from
         '2308bdcba13fea269b578acb152dd240'
       or v_build.details->>'mapping_snapshot_digest' is distinct from
         'ee7692fde47360caa2203b3436ca099b'
       or v_build.details->>'mapping_snapshot_upgrade_reason' is distinct from
         'pre_washington_refresh_scope_guard'
       or v_build.details->'mapping_snapshot_upgrade_proof'->>
         'washington_boundary_identity_count' is distinct from '32'
       or v_build.details->'mapping_snapshot_upgrade_proof'->>
         'washington_machine_mapping_count' is distinct from '3'
       or v_build.details->'mapping_snapshot_upgrade_proof'->>
         'washington_machine_mapping_without_refresh_scope_count' is distinct from '3'
       or v_build.details->'mapping_snapshot_upgrade_proof'->>
         'topology_changed' is distinct from 'false'
    then
      raise exception 'Issue #97 Noble v2 replay lacks the exact guarded upgrade proof';
    end if;
  elsif nullif(v_build.details->>'mapping_snapshot_version','') is not null then
    raise exception 'Issue #97 Noble has an unknown mapping snapshot version';
  elsif v_build.details->>'mapping_snapshot_digest' is distinct from
      '2308bdcba13fea269b578acb152dd240'
  then
    raise exception 'Issue #97 Noble legacy mapping snapshot changed before semantic upgrade';
  end if;

  with captured as (
    select distinct membership.identity_id,membership.road_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=v_build.id
  ), compared as (
    select captured.identity_id,captured.road_id as captured_road_id,
      mapping.road_id as current_road_id
    from captured
    left join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=captured.identity_id and mapping.mapping_status='verified'
  )
  select count(*)::integer into v_membership_mapping_mismatches
  from compared
  where captured_road_id is distinct from current_road_id;
  if v_membership_mapping_mismatches<>0 then
    raise exception 'Issue #97 Noble membership/current mapping proof failed: % mismatches',
      v_membership_mapping_mismatches;
  end if;

  with identity_set as (
    select distinct membership.identity_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=v_build.id
  )
  select
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      identity_set.identity_id::text||':'||
        private_verification.brinesearch_issue97_mapping_fingerprint(identity_set.identity_id),
      ',' order by identity_set.identity_id
    ),'')),
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      identity_set.identity_id::text||':'||
        private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(
          identity_set.identity_id
        ),
      ',' order by identity_set.identity_id
    ),''))
  into v_legacy_digest,v_semantic_digest
  from identity_set;
  if v_semantic_digest is distinct from 'ee7692fde47360caa2203b3436ca099b'
     or (
       nullif(v_build.details->>'mapping_snapshot_version','') is null
       and v_legacy_digest is distinct from '2308bdcba13fea269b578acb152dd240'
     )
  then
    raise exception 'Issue #97 Noble mapping digest proof changed: legacy %, v2 %',
      v_legacy_digest,v_semantic_digest;
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,
      ',' order by junction.stable_junction_key
    ),'')),
    count(*) filter(where junction.junction_type<>'shared_segment')::integer,
    count(*) filter(where junction.junction_type='shared_segment')::integer
  into v_recomputed_graph_digest,v_recomputed_point_count,v_recomputed_shared_count
  from public.brinesearch_road_junctions junction
  where junction.build_id=v_build.id;
  select count(*)::integer into v_recomputed_membership_count
  from public.brinesearch_road_junction_memberships membership
  join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
  where junction.build_id=v_build.id;
  if v_recomputed_graph_digest is distinct from v_build.graph_digest
     or v_recomputed_point_count is distinct from v_build.point_junction_count
     or v_recomputed_shared_count is distinct from v_build.shared_segment_count
     or v_recomputed_membership_count is distinct from v_build.membership_count
  then
    raise exception 'Issue #97 Noble graph contents changed before semantic upgrade';
  end if;

  select count(*)::integer into v_bad_anchor_count
  from (
    select junction.id
    from public.brinesearch_road_junctions junction
    left join public.brinesearch_road_junction_anchors anchor
      on anchor.junction_id=junction.id
    where junction.build_id=v_build.id
    group by junction.id,junction.junction_type
    having count(anchor.id)<>case when junction.junction_type='shared_segment' then 2 else 1 end
      or pg_catalog.bool_or(
        anchor.anchor_digest<>pg_catalog.md5(extensions.st_asgeojson(anchor.geom,15))
      )
  ) invalid_anchor;
  if v_bad_anchor_count<>0 then
    raise exception 'Issue #97 Noble anchor proof failed before semantic upgrade';
  end if;

  with identity_set as (
    select distinct membership.identity_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=v_build.id
  )
  select
    count(*) filter(where identity.state_code='OH' and identity.county_code='WAS')::integer,
    count(*) filter(where identity.state_code='OH' and identity.county_code='WAS'
      and mapping.mapping_method in ('exact_source_record_id','exact_route_designation'))::integer,
    count(*) filter(where identity.state_code='OH' and identity.county_code='WAS'
      and mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
      and not (mapping.evidence ? 'refresh_scope'))::integer
  into v_was_boundary_identity_count,v_was_machine_mapping_count,
    v_was_machine_missing_refresh_scope
  from identity_set
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=identity_set.identity_id
  left join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity_set.identity_id and mapping.mapping_status='verified';
  if v_was_boundary_identity_count<>32
     or v_was_machine_mapping_count<>3
     or (
       nullif(v_build.details->>'mapping_snapshot_version','') is null
       and v_was_machine_missing_refresh_scope<>3
     )
     or (
       v_build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2'
       and v_was_machine_missing_refresh_scope not in (0,3)
     )
     or exists(
       select 1
       from public.brinesearch_authoritative_road_identities identity
       join public.brinesearch_road_identity_mappings mapping
         on mapping.identity_id=identity.id and mapping.mapping_status='verified'
       where identity.source_identity_key in (
         'OH:ODOT:NLF:SWASIR00077**C',
         'OH:ODOT:NLF:SWASIR00077**N',
         'OH:ODOT:NLF:SWASSR00145**C'
       )
         and mapping.evidence ? 'refresh_scope'
         and mapping.evidence->>'refresh_scope'<>'OH:WAS'
     )
  then
    raise exception 'Issue #97 Noble/Washington boundary proof changed: identities %, mappings %, unscoped %',
      v_was_boundary_identity_count,v_was_machine_mapping_count,
      v_was_machine_missing_refresh_scope;
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'source_identity_key',identity.source_identity_key,
      'road_family',road.road_type||':'||coalesce(road.state,'')||':'||road.route_number,
      'mapping_method',mapping.mapping_method
    ) order by identity.source_identity_key)
  into v_was_exact_rows
  from public.brinesearch_authoritative_road_identities identity
  join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id and mapping.mapping_status='verified'
  join public.brinesearch_roads road on road.id=mapping.road_id
  where identity.source_identity_key in (
    'OH:ODOT:NLF:SWASIR00077**C',
    'OH:ODOT:NLF:SWASIR00077**N',
    'OH:ODOT:NLF:SWASSR00145**C'
  );
  if v_was_exact_rows is distinct from pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'source_identity_key','OH:ODOT:NLF:SWASIR00077**C',
      'road_family','interstate::77',
      'mapping_method','exact_route_designation'
    ),
    pg_catalog.jsonb_build_object(
      'source_identity_key','OH:ODOT:NLF:SWASIR00077**N',
      'road_family','interstate::77',
      'mapping_method','exact_route_designation'
    ),
    pg_catalog.jsonb_build_object(
      'source_identity_key','OH:ODOT:NLF:SWASSR00145**C',
      'road_family','state_route:OH:145',
      'mapping_method','exact_route_designation'
    )
  ) then
    raise exception 'Issue #97 Noble/Washington exact boundary mappings changed: %',
      v_was_exact_rows;
  end if;

  if not exists(
    select 1
    from public.brinesearch_authoritative_road_identities identity
    join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=identity.id and mapping.mapping_status='verified'
    join public.brinesearch_roads road on road.id=mapping.road_id
    where identity.source_identity_key='OH:ODOT:NLF:SWASSR00145**C'
      and identity.active and identity.state_code='OH' and identity.county_code='WAS'
      and identity.public_access_status='public' and identity.drivable_status='drivable'
      and identity.road_class='state_route' and identity.route_number='145'
      and mapping.mapping_method='exact_route_designation'
      and mapping.evidence->>'migration'='issue97_oh_route_used_canonical_adoption'
      and mapping.evidence->>'source_identity_key'=identity.source_identity_key
      and mapping.evidence->>'source_digest'=identity.source_digest
      and mapping.evidence->>'source_current'='true'
      and mapping.evidence->>'exact_designation'='true'
      and mapping.evidence->>'name_matching_used'='false'
      and mapping.evidence->>'fuzzy_matching_used'='false'
      and mapping.evidence->>'nearest_road_used'='false'
      and road.verification_status='verified' and not road.candidate_only
      and road.state='OH' and road.road_type='state_route' and road.route_number='145'
      and road.geometry_status='official_centerline_loaded'
      and road.source_method='issue97_oh_exact_route_family'
      and road.source_agency='Ohio Department of Transportation'
      and road.source_dataset='Road Inventory'
      and road.candidate_basis @> pg_catalog.jsonb_build_object(
        'issue',97,'scope','OH-only','adoption','exact_route_family'
      )
      and private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code
      )
  ) then
    raise exception 'Issue #97 Noble/Washington SR-145 adoption proof is no longer current';
  end if;

  with target as (
    select identity.*,
      pg_catalog.split_part(pg_catalog.replace(
        identity.source_identity_key,'OH:ODOT:NLF:',''),':',1) as nlf_base
    from public.brinesearch_authoritative_road_identities identity
    where identity.active and identity.state_code='OH' and identity.county_code='WAS'
      and identity.source_identity_key in (
        'OH:ODOT:NLF:SWASIR00077**C',
        'OH:ODOT:NLF:SWASIR00077**N',
        'OH:ODOT:NLF:SWASSR00145**C'
      )
  ), nlf_counts as (
    select pg_catalog.split_part(pg_catalog.replace(
        identity.source_identity_key,'OH:ODOT:NLF:',''),':',1) as nlf_base,
      count(*)::integer as identity_count
    from public.brinesearch_authoritative_road_identities identity
    where identity.active and identity.state_code='OH'
    group by 1
  ), candidates as (
    select target.source_identity_key,road.id as road_id,
      road.road_type||':'||coalesce(road.state,'')||':'||road.route_number as road_family
    from target
    left join nlf_counts on nlf_counts.nlf_base=target.nlf_base
    join public.brinesearch_roads road on (
      road.source_record_id=target.source_identity_key
      or (
        pg_catalog.split_part(coalesce(road.source_record_id,''),'|',1)=target.nlf_base
        and nlf_counts.identity_count=1
      )
    )
    where road.verification_status='verified'
      and (road.state='OH' or (road.state is null and road.road_type in ('interstate','us_route')))
      and (road.road_type in ('interstate','us_route','state_route')
        or pg_catalog.lower(coalesce(road.county,''))=pg_catalog.lower(target.county_name))
    union
    select target.source_identity_key,road.id,
      road.road_type||':'||coalesce(road.state,'')||':'||road.route_number
    from target
    join public.brinesearch_roads road on road.road_type=target.road_class
      and pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
        coalesce(road.route_number,''),'[^0-9A-Z]','','g')),'^0+','')=
        pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
          coalesce(target.route_number,'')||coalesce(target.route_suffix,'')||
          coalesce(target.route_fraction,'')||coalesce(target.route_extension,''),
          '[^0-9A-Z]','','g')),'^0+','')
      and (target.road_class in ('interstate','us_route')
        or (road.state='OH' and target.road_class='state_route'))
    where road.verification_status='verified'
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'source_identity_key',source_identity_key,
      'candidate_count',candidate_count,
      'road_family',road_family
    ) order by source_identity_key)
  into v_was_candidate_rows
  from (
    select source_identity_key,count(*)::integer as candidate_count,
      (pg_catalog.array_agg(road_family order by road_family))[1] as road_family
    from candidates group by source_identity_key
  ) grouped;
  if v_was_candidate_rows is distinct from pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'source_identity_key','OH:ODOT:NLF:SWASIR00077**C','candidate_count',1,
      'road_family','interstate::77'
    ),
    pg_catalog.jsonb_build_object(
      'source_identity_key','OH:ODOT:NLF:SWASIR00077**N','candidate_count',1,
      'road_family','interstate::77'
    ),
    pg_catalog.jsonb_build_object(
      'source_identity_key','OH:ODOT:NLF:SWASSR00145**C','candidate_count',1,
      'road_family','state_route:OH:145'
    )
  ) then
    raise exception 'Issue #97 Noble/Washington future candidate proof changed: %',
      v_was_candidate_rows;
  end if;

  if pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_exact_mappings_oh(text)'::
         pg_catalog.regprocedure
     ),'[[:space:]]+','','g')) not like '%retained_adoption_candidates%'
     or pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_exact_mappings_oh(text)'::
         pg_catalog.regprocedure
     ),'[[:space:]]+','','g')) not like
       '%casewhene.priority=-1ande.candidate_count=1thene.evidence%'
  then
    raise exception 'Issue #97 adoption-stable Ohio refresher is not installed';
  end if;

  if v_build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2' then
    return;
  end if;

  update public.brinesearch_road_graph_builds set
    details=details||pg_catalog.jsonb_build_object(
      'mapping_snapshot_legacy_digest',v_legacy_digest,
      'mapping_snapshot_digest',v_semantic_digest,
      'mapping_snapshot_version','issue97-graph-mapping-v2',
      'mapping_snapshot_upgrade_reason','pre_washington_refresh_scope_guard',
      'mapping_snapshot_upgrade_proof',pg_catalog.jsonb_build_object(
        'legacy_digest_reconstructed_exactly',true,
        'membership_current_mapping_mismatch_count',v_membership_mapping_mismatches,
        'recomputed_graph_digest',v_recomputed_graph_digest,
        'recomputed_point_junction_count',v_recomputed_point_count,
        'recomputed_shared_segment_count',v_recomputed_shared_count,
        'recomputed_membership_count',v_recomputed_membership_count,
        'bad_anchor_count',v_bad_anchor_count,
        'washington_boundary_identity_count',v_was_boundary_identity_count,
        'washington_machine_mapping_count',v_was_machine_mapping_count,
        'washington_machine_mapping_without_refresh_scope_count',
          v_was_machine_missing_refresh_scope,
        'topology_changed',false
      )
    )
  where id=v_build.id;

  if not private_verification.brinesearch_issue97_graph_build_sources_current(v_build.id) then
    raise exception 'Issue #97 Noble became stale after semantic-v2 metadata upgrade';
  end if;
end
$issue97_upgrade_noble_graph_mapping_snapshot$;
