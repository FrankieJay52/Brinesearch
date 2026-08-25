-- GitHub #97 -- Harrison exact source occurrences for Scout.
--
-- The saved route names one continuous US-250 occurrence across the Jefferson /
-- Harrison source boundary. This migration records both exact ODOT source
-- identities without adding a driver maneuver. It adopts the two exact Harrison
-- CR-36 identities and rebuilds Harrison plus the one exact dependent Belmont
-- graph that contains the verified CR-64 / CR-36 county-boundary continuation.
-- The explicit same-canonical-road source boundary remains held by the existing
-- transition contract. No route approval, Google publication, or cutover is
-- authorized.

-- The reviewed county graph builder is the same controlled release path that
-- uses a 90-minute statement budget elsewhere in the Issue #97 rollout. BEL's
-- point-corroboration stage exceeded the former 15-minute migration-local
-- budget during the rollback rehearsal; this changes only that local guard.
set local statement_timeout = '90min';
set local lock_timeout = '5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:graph:OH:BEL')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:graph:OH:HAS')
);

do $issue97_has_lock_source_generations$
declare v_scope record;
begin
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
  );
end
$issue97_has_lock_source_generations$;

create temporary table tmp_issue97_has_graph_before on commit drop as
select b.state_code,b.county_code,b.id,b.status,b.source_revision_digest,
  b.graph_digest,b.point_junction_count,b.shared_segment_count,b.membership_count
from public.brinesearch_road_graph_builds b
where b.status='active';

-- Pin the exact union of pads that the existing mapping and graph triggers can
-- invalidate while HAS and BEL are refreshed. This includes published road
-- dependencies, private receipt points that retain a target mapping, and
-- private/published graph references to either replaced active build.
create temporary table tmp_issue97_has_deferred_google_pads on commit drop as
with target_identities as materialized (
  select identity.id
  from public.brinesearch_authoritative_road_identities identity
  where identity.active and identity.state_code='OH'
    and identity.county_code in ('BEL','HAS')
), target_refresh_mappings as materialized (
  select mapping.identity_id,mapping.road_id
  from public.brinesearch_road_identity_mappings mapping
  join target_identities identity on identity.id=mapping.identity_id
  where mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
    and mapping.mapping_status in ('verified','candidate')
), dependency_sources as materialized (
  select pad.id as pad_id,pad.legacy_id,'published_road_identity'::text as source
  from target_identities identity
  join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id
  join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
  join public.pads pad on pad.id=step.pad_id

  union

  select receipt.pad_id,pad.legacy_id,'private_receipt_mapping'::text
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads pad on pad.id=receipt.pad_id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(receipt.manifest->'points','[]'::jsonb)
  ) point
  join target_refresh_mappings mapping
    on mapping.identity_id=nullif(point->>'identity_id','')::uuid
    or mapping.road_id=nullif(point->>'road_id','')::uuid

  union

  select receipt.pad_id,pad.legacy_id,'private_receipt_graph'::text
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads pad on pad.id=receipt.pad_id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(receipt.manifest->'points','[]'::jsonb)
  ) point
  join tmp_issue97_has_graph_before build
    on build.id=nullif(point->>'graph_build_id','')::uuid
   and build.state_code='OH' and build.county_code in ('BEL','HAS')

  union

  select step.pad_id,pad.legacy_id,'published_step_graph'::text
  from public.brinesearch_pad_roads step
  join public.pads pad on pad.id=step.pad_id
  join tmp_issue97_has_graph_before build
    on build.id=step.junction_build_id
   and build.state_code='OH' and build.county_code in ('BEL','HAS')
)
select dependency.pad_id,dependency.legacy_id,
  pg_catalog.array_agg(distinct dependency.source order by dependency.source)
    as dependency_sources
from dependency_sources dependency
group by dependency.pad_id,dependency.legacy_id;

create temporary table tmp_issue97_has_non_target_google_before on commit drop as
select pg_catalog.md5(coalesce(pg_catalog.string_agg(
  p.id::text||':'||coalesce(p.brinesearch_google_route_status_issue97,'')||':'||
    coalesce(p.brinesearch_google_route_revision_issue97::text,''),
  ',' order by p.id
),'')) as digest
from public.pads p
where not exists(
  select 1 from tmp_issue97_has_deferred_google_pads target where target.pad_id=p.id
);

create temporary table tmp_issue97_has_pad_authority_before on commit drop as
select pg_catalog.md5(coalesce(pg_catalog.string_agg(
  p.id::text||':'||coalesce(p.structured_road_sequence,'')||':'||
    coalesce(p.written_directions,'')||':'||coalesce(p.directions_clear,'')||':'||
    coalesce(p.structured_route_steps::text,'')||':'||
    coalesce(p.driver_safety_context::text,'')||':'||
    coalesce(pg_catalog.round(p.latitude::numeric,7)::text,'')||':'||
    coalesce(pg_catalog.round(p.longitude::numeric,7)::text,''),
  ',' order by p.id
),'')) as digest
from public.pads p;

create temporary table tmp_issue97_has_public_directions_before on commit drop as
select pg_catalog.md5(coalesce(pg_catalog.string_agg(
  d.pad_id::text||':'||coalesce(d.legacy_id,'')||':'||
    coalesce(d.directions_clear,'')||':'||coalesce(d.source_revision::text,''),
  ',' order by d.pad_id
),'')) as digest
from public.brinesearch_driver_directions_public d;

create temporary table tmp_issue97_has_expected_identities(
  source_identity_key text primary key,
  identity_id uuid not null,
  source_digest text not null,
  road_id uuid not null,
  canonical_name text not null,
  normalized_name text not null,
  route_number text not null,
  aliases text[] not null
) on commit drop;

insert into tmp_issue97_has_expected_identities values
  ('OH:ODOT:NLF:CHASCR00036A*C','5672af6b-03e5-cc37-95cf-216bb72afe86',
    'fd3386e78abbc9cd86c426c88e8e597e','e236e7bc-6313-39a4-f1d8-d1815ea44167',
    'Olive Branch Rd','olive-branch-rd','36A',array['CR-36A','Olive Branch Rd']::text[]),
  ('OH:ODOT:NLF:CHASCR00036**C','e69eb3cb-bbc7-9ea8-223c-7798d66d38c8',
    '61e2eb544dc103d58068f63ec19b2c78','219e5560-8875-4baf-1a24-b600c862ecfb',
    'High Street Rd','high-street-rd','36',array['CR-36','High Street Rd']::text[]);

do $issue97_has_preconditions$
declare v_count integer; v_digest text; v_dependency_counties text[];
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'06705f5b35a6d37151bb2c0dc5ade9bd'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
     ))<>'73eb9adbfd16ea671873da7b4e495f73'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb)'::pg_catalog.regprocedure
     ))<>'4a0875ea950d93807180affc093a0448'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_state_candidate_manifest_current(uuid)'::pg_catalog.regprocedure
     ))<>'0720949a9b7a08e741a07979d0dd02be'
      or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)'::pg_catalog.regprocedure
      ))<>'f6763925461111b2069bde0f60007dd4'
      or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'::pg_catalog.regprocedure
      ))<>'a09e01457d5bf95108e2c9ef71656006'
      or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'::pg_catalog.regprocedure
      ))<>'80675198042cb9d4407dbe4fc8d9251f'
      or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_run_all_pad_routing_pipeline(uuid)'::pg_catalog.regprocedure
      ))<>'a4497e88b0bd914812eec0427e696653'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_refresh_directory_snapshot()'::pg_catalog.regprocedure
     ))<>'45cc48772d2d960514d69d5806296b97'
     or private_verification.brinesearch_issue97_active_graph_release_generation()
       <>'issue97-release-20260815-r2' then
    raise exception 'Issue #97 HAS reviewed function/generation checkpoint diverged';
  end if;

  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='OH' and status='active')<>19
     or (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and status='active')<>1
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 HAS active/staging graph checkpoint diverged';
  end if;

  if not exists(
    select 1 from public.brinesearch_road_graph_builds
    where id='0870470a-11f8-4f33-8af3-08d6849d5f34'
      and state_code='OH' and county_code='HAS' and status='active'
      and graph_digest='fc53a1492a3eecab78a524dbadcddfe8'
      and source_revision_digest='ece929162c9063ea35a6a276de59a940'
  ) or not private_verification.brinesearch_issue97_graph_build_release_current(
    '0870470a-11f8-4f33-8af3-08d6849d5f34'
  ) then
    raise exception 'Issue #97 HAS active graph checkpoint diverged';
  end if;

  if not exists(
    select 1 from public.brinesearch_road_graph_builds
    where id='1c1320b3-4257-4239-9c55-b18a801aa97e'
      and state_code='OH' and county_code='BEL' and status='active'
      and graph_digest='269e903e991f1790bf5d1428e4c2bb43'
      and source_revision_digest='b20843ddf3d2a648b8d53a0b3eb1a1c2'
  ) then
    raise exception 'Issue #97 HAS dependent BEL graph checkpoint diverged';
  end if;

  if (select count(*)
      from public.brinesearch_road_junctions junction
      join public.brinesearch_road_junction_memberships has_member
        on has_member.junction_id=junction.id
       and has_member.identity_id='e69eb3cb-bbc7-9ea8-223c-7798d66d38c8'
       and has_member.road_id is null
      join public.brinesearch_road_junction_memberships bel_member
        on bel_member.junction_id=junction.id
       and bel_member.identity_id='a1151dc7-6a4b-7d65-17e4-02ea0a1e1d1a'
       and bel_member.road_id='614c27a7-17a3-4828-b4eb-9c6837cc021b'
      where junction.build_id='1c1320b3-4257-4239-9c55-b18a801aa97e'
        and junction.stable_junction_key=
          'junction:point:OH:-80.9424736:40.1616560:identities:1fc24e4ea3bf40001d871678f87a6706'
        and junction.junction_type='continuation'
        and junction.verification_status='verified')<>1 then
    raise exception 'Issue #97 HAS dependent BEL CR-64 / CR-36 continuation diverged';
  end if;

  if (select pg_catalog.array_agg(legacy_id order by legacy_id)
      from tmp_issue97_has_deferred_google_pads) is distinct from array[
        'ascent--bakos','ascent--banjo','ascent--besece','ascent--blayney','ascent--cologie',
        'ascent--jennings','ascent--pickens','ascent--scout','ascent--shutway'
      ]::text[] then
    raise exception 'Issue #97 HAS/BEL deferred Google dependency set diverged';
  end if;

  if (select dependency_sources
      from tmp_issue97_has_deferred_google_pads
      where legacy_id='ascent--bakos') is distinct from
        array['private_receipt_mapping']::text[] then
    raise exception 'Issue #97 HAS/BEL Bakos dependency proof diverged';
  end if;

  if (select count(*)
      from public.brinesearch_road_identity_mappings mapping
      where mapping.identity_id in (
        '1d61e8f0-527b-582a-022a-673001d546df',
        'b80b9fff-6d0e-b5b7-3b93-e8c28b476fca',
        '2ef72301-66f2-e0d9-983b-9d289a306a1a'
      ) and mapping.mapping_status='verified')<>3
     or not exists(
       select 1
       from private_verification.brinesearch_issue97_state_candidate_manifests manifest
       join private_verification.brinesearch_issue97_state_candidate_manifest_members member
         on member.manifest_id=manifest.id and member.member_key='OH:GUE'
       join public.brinesearch_road_graph_builds build
         on build.id=(member.member_value->>'build_id')::uuid
        and build.status='active' and build.state_code='OH' and build.county_code='GUE'
       where manifest.manifest_key='issue97-ohio-r4-gue-exact-identity-candidate'
         and manifest.member_count=19
         and private_verification.brinesearch_issue97_state_candidate_manifest_current(
           manifest.id
         )
     ) then
    raise exception 'Issue #97 HAS requires the verified GUE predecessor checkpoint';
  end if;

  select count(*) into v_count
  from tmp_issue97_has_expected_identities expected
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=expected.identity_id
   and identity.source_identity_key=expected.source_identity_key
   and identity.source_digest=expected.source_digest
   and identity.state_code='OH' and identity.county_code='HAS' and identity.active
   and identity.public_access_status='public' and identity.drivable_status='drivable'
  where private_verification.brinesearch_issue97_dataset_scope_current(
    identity.dataset_id,identity.state_code,identity.county_code
  ) and private_verification.brinesearch_issue97_authoritative_identity_geometry(identity.id)
    is not null;
  if v_count<>2 then
    raise exception 'Issue #97 HAS expected two exact current CR-36 identities, found %',v_count;
  end if;

  select pg_catalog.array_agg(distinct build.county_code order by build.county_code)
  into v_dependency_counties
  from public.brinesearch_road_graph_builds build
  join public.brinesearch_road_junctions junction on junction.build_id=build.id
  join public.brinesearch_road_junction_memberships membership
    on membership.junction_id=junction.id
  join tmp_issue97_has_expected_identities expected
    on expected.identity_id=membership.identity_id
  where build.state_code='OH' and build.status='active';
  if v_dependency_counties is distinct from array['BEL','HAS']::text[] then
    raise exception 'Issue #97 HAS exact graph dependency scope diverged: %',
      v_dependency_counties;
  end if;

  if exists(
    select 1 from tmp_issue97_has_expected_identities expected
    join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=expected.identity_id and mapping.mapping_status='verified'
  ) or exists(
    select 1 from tmp_issue97_has_expected_identities expected
    join public.brinesearch_roads road on road.id=expected.road_id
  ) or exists(
    select 1 from public.brinesearch_route_prep_steps
    where id='377ce794-1ca4-1826-22d5-9f60e73787bc'
  ) or exists(
    select 1 from private_verification.brinesearch_issue97_state_candidate_manifests
    where manifest_key='issue97-ohio-r5-has-scout-exact-identity-candidate'
  ) then
    raise exception 'Issue #97 HAS target identity/road/step/manifest was installed by another writer';
  end if;

  select pg_catalog.md5(pg_catalog.string_agg(
    step.id::text||'|'||step.step_order||'|'||step.raw_text||'|'||step.normalized_text||'|'||
      step.step_kind||'|'||coalesce(step.road_id::text,'')||'|'||step.match_status||'|'||
      coalesce(step.match_method,'')||'|'||coalesce(step.source_details::text,'{}'),
    E'\n' order by step.step_order
  )) into v_digest
  from public.brinesearch_route_prep_steps step
  where step.route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and step.active;
  if v_digest<>'6b9bc9eab5d6865b9c4828dd0260f558'
     or (select count(*) from public.brinesearch_route_prep_steps
       where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and active)<>4
     or (select source_sequence_hash from public.brinesearch_route_prep
       where id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and active)
       is distinct from '0b2caedee1fe2eefa0cd26f53f3667b4'
     or (select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97
       where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68')<>4
     or exists(select 1 from private_verification.brinesearch_route_transition_receipts_issue97
       where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68')
     or exists(select 1 from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97
       where route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68') then
    raise exception 'Issue #97 HAS Scout route checkpoint diverged';
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton) is not null
     or (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)<>0
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_rows_v18)<>0 then
    raise exception 'Issue #97 HAS authority baseline diverged';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or not exists(
       select 1 from public.brinesearch_directory_snapshots_v18
       where publication_state='current' and source_revision=4
         and row_count=1214 and searchable_count=1214
     ) then
    raise exception 'Issue #97 HAS requires the current revision-4 V18 directory';
  end if;
end
$issue97_has_preconditions$;

insert into public.brinesearch_roads(
  id,canonical_name,normalized_name,road_type,state,county,township,aliases,
  route_number,verification_status,verified_at,source_agency,source_dataset,
  source_method,source_url,source_record_id,centerline_geojson,geometry_status,
  geometry_checked_at,approved_by_default,candidate_only,candidate_basis
)
select expected.road_id,expected.canonical_name,expected.normalized_name,
  'county','OH','Harrison','Short Creek',expected.aliases,
  expected.route_number,'verified',pg_catalog.clock_timestamp(),
  'Ohio Department of Transportation','Road Inventory',
  'issue97_oh_exact_source_identity',
  'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
  identity.attributes->>'nlf_id',
  extensions.st_asgeojson(
    private_verification.brinesearch_issue97_authoritative_identity_geometry(identity.id),7
  )::jsonb,
  'official_centerline_loaded',pg_catalog.clock_timestamp(),false,false,
  pg_catalog.jsonb_build_object(
    'issue',97,'scope','Scout exact identity repair',
    'adoption','exact_source_identity','source_identity_key',identity.source_identity_key,
    'source_digest',identity.source_digest,'name_matching_used',false,
    'fuzzy_matching_used',false,'nearest_road_used',false,'route_number_only_used',false
  )
from tmp_issue97_has_expected_identities expected
join public.brinesearch_authoritative_road_identities identity
  on identity.id=expected.identity_id;

insert into public.brinesearch_road_identity_mappings(
  id,identity_id,road_id,mapping_status,mapping_method,evidence,
  verified_at,created_at,updated_at
)
select private_verification.brinesearch_issue97_uuid(
    'identity-mapping:'||expected.identity_id::text||':'||expected.road_id::text
  ),expected.identity_id,expected.road_id,'verified','exact_source_record_id',
  pg_catalog.jsonb_build_object(
    'issue',97,'scope','Scout exact identity repair',
    'source_identity_key',expected.source_identity_key,'source_digest',expected.source_digest,
    'exact_source_record_id',true,'name_matching_used',false,
    'fuzzy_matching_used',false,'nearest_road_used',false,
    'route_number_only_used',false,
    'migration','issue97_has_scout_exact_identity_receipts'
  ),pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()
from tmp_issue97_has_expected_identities expected;

-- Move the two saved local-road occurrences without colliding with either the
-- step-order or receipt-order unique index. The new order 3 is an internal
-- source-boundary continuation of saved US-250, not a new driver maneuver.
update public.brinesearch_route_prep_steps
set step_order=step_order+100,updated_at=pg_catalog.clock_timestamp()
where id in (
  '6be86fba-e6e3-4907-b746-802bcf259a6d',
  '497fb504-34fa-4c6d-9e32-3a9360eb306d'
);

update private_verification.brinesearch_route_occurrence_receipts_issue97
set occurrence_index=occurrence_index+100,updated_at=pg_catalog.clock_timestamp()
where route_prep_step_id in (
  '6be86fba-e6e3-4907-b746-802bcf259a6d',
  '497fb504-34fa-4c6d-9e32-3a9360eb306d'
);

update public.brinesearch_route_prep_steps
set step_order=case id
    when '6be86fba-e6e3-4907-b746-802bcf259a6d' then 4
    when '497fb504-34fa-4c6d-9e32-3a9360eb306d' then 5
  end,
  updated_at=pg_catalog.clock_timestamp()
where id in (
  '6be86fba-e6e3-4907-b746-802bcf259a6d',
  '497fb504-34fa-4c6d-9e32-3a9360eb306d'
);

update private_verification.brinesearch_route_occurrence_receipts_issue97
set occurrence_index=case route_prep_step_id
    when '6be86fba-e6e3-4907-b746-802bcf259a6d' then 4
    when '497fb504-34fa-4c6d-9e32-3a9360eb306d' then 5
  end,
  updated_at=pg_catalog.clock_timestamp()
where route_prep_step_id in (
  '6be86fba-e6e3-4907-b746-802bcf259a6d',
  '497fb504-34fa-4c6d-9e32-3a9360eb306d'
);

insert into public.brinesearch_route_prep_steps(
  id,route_prep_id,step_order,raw_text,normalized_text,step_kind,road_id,
  match_status,match_method,match_confidence,source_details,owner_decision,
  geometry_status,active,created_at,updated_at
) values (
  '377ce794-1ca4-1826-22d5-9f60e73787bc',
  'ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68',3,
  'US-250','US-250','us_route','cdcfd114-42c5-4478-9251-eac57a70e528',
  'exact_master','issue97_exact_source_boundary_continuation',1,
  pg_catalog.jsonb_build_object(
    'issue',97,
    'source_identity_key','OH:ODOT:NLF:SHASUS00250**C',
    'authoritative_identity_key','OH:ODOT:NLF:SHASUS00250**C',
    'authoritative_identity_proof',true,
    'proof_scope','saved US-250 occurrence + exact Jefferson/Harrison ODOT source boundary',
    'internal_source_boundary_continuation',true,
    'display_as_new_maneuver',false,
    'route_authority_upgrade',false,
    'public_google_publication',false,
    'name_matching_used',false,'fuzzy_matching_used',false,
    'nearest_road_used',false,'route_number_only_used',false
  ),'pending','not_started',true,pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()
);

create temporary table tmp_issue97_has_step_receipts(
  step_id uuid primary key,
  source_identity_key text not null,
  road_id uuid not null,
  step_kind text not null,
  geometry_status text not null,
  internal_source_boundary_continuation boolean not null
) on commit drop;

insert into tmp_issue97_has_step_receipts values
  ('cee045b5-bb96-4c03-924f-3385ef367635','OH:ODOT:NLF:SJEFSR00150**C',
    '8d047662-daba-48ef-a95e-b28c30e3e564','state_route','not_started',false),
  ('27983cb8-56cb-4963-9e49-e5b57abff16c','OH:ODOT:NLF:SJEFUS00250**C',
    'cdcfd114-42c5-4478-9251-eac57a70e528','us_route','not_started',true),
  ('377ce794-1ca4-1826-22d5-9f60e73787bc','OH:ODOT:NLF:SHASUS00250**C',
    'cdcfd114-42c5-4478-9251-eac57a70e528','us_route','not_started',true),
  ('6be86fba-e6e3-4907-b746-802bcf259a6d','OH:ODOT:NLF:CHASCR00036A*C',
    'e236e7bc-6313-39a4-f1d8-d1815ea44167','county_road','ready',false),
  ('497fb504-34fa-4c6d-9e32-3a9360eb306d','OH:ODOT:NLF:CHASCR00036**C',
    '219e5560-8875-4baf-1a24-b600c862ecfb','county_road','ready',false);

update public.brinesearch_route_prep_steps step
set road_id=receipt.road_id,step_kind=receipt.step_kind,match_status='exact_master',
  match_method=case when receipt.internal_source_boundary_continuation
    then 'issue97_exact_source_boundary_continuation'
    else 'issue97_owner_reviewed_exact_source_identity' end,
  match_confidence=1,geometry_status=receipt.geometry_status,
  source_details=coalesce(step.source_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'issue',97,'source_identity_key',receipt.source_identity_key,
    'authoritative_identity_key',receipt.source_identity_key,
    'authoritative_identity_proof',true,
    'proof_scope','owner-reviewed saved-route occurrence + exact current ODOT source identity',
    'internal_source_boundary_continuation',receipt.internal_source_boundary_continuation,
    'display_as_new_maneuver',false,
    'route_authority_upgrade',false,'public_google_publication',false,
    'source_digest',identity.source_digest,'name_matching_used',false,
    'fuzzy_matching_used',false,'nearest_road_used',false,'route_number_only_used',false
  ),updated_at=pg_catalog.clock_timestamp()
from tmp_issue97_has_step_receipts receipt
join public.brinesearch_authoritative_road_identities identity
  on identity.source_identity_key=receipt.source_identity_key and identity.active
where step.id=receipt.step_id;

do $issue97_has_verify_step_receipts$
declare v_count integer;
begin
  select count(*) into v_count
  from tmp_issue97_has_step_receipts expected
  join public.brinesearch_route_prep_steps step on step.id=expected.step_id and step.active
  join public.brinesearch_authoritative_road_identities identity
    on identity.source_identity_key=expected.source_identity_key and identity.active
  join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id and mapping.road_id=expected.road_id
   and mapping.mapping_status='verified'
  where step.road_id=expected.road_id and step.step_kind=expected.step_kind
    and step.source_details->>'source_identity_key'=expected.source_identity_key
    and (step.source_details->>'authoritative_identity_proof')::boolean
    and (step.source_details->>'route_authority_upgrade')::boolean=false
    and (step.source_details->>'public_google_publication')::boolean=false;
  if v_count<>5 then
    raise exception 'Issue #97 HAS expected five exact Scout occurrences, found %',v_count;
  end if;
end
$issue97_has_verify_step_receipts$;

create temporary table tmp_issue97_has_new_graph(
  county_code text primary key check(county_code in ('BEL','HAS')),
  old_build_id uuid not null,
  new_build_id uuid not null unique,
  candidate_manifest_id uuid,
  candidate_manifest_digest text,
  candidate_manifest_generation text,
  rebuild_result jsonb not null,
  activation_result jsonb,
  cache_result jsonb
) on commit drop;

-- Rebuild the changed identity's owning county first. Its county-scoped exact
-- refresher normalizes the newly inserted machine mapping evidence. Every
-- cross-county graph that consumes that identity must capture the normalized
-- state afterward; the precondition above proves BEL is the only such graph.
do $issue97_has_rebuild_has$
declare
  v_old uuid;
  v_new uuid;
  v_rebuild jsonb;
begin
  select id into strict v_old from public.brinesearch_road_graph_builds
  where state_code='OH' and county_code='HAS' and status='active';
  v_rebuild:=public.brinesearch_issue97_rebuild_county_graph('OH','HAS');
  if v_rebuild->>'status'<>'validated' or (v_rebuild->>'active')::boolean
     or nullif(v_rebuild->>'build_id','') is null then
    raise exception 'Issue #97 HAS graph rebuild did not validate: %',v_rebuild;
  end if;
  v_new:=(v_rebuild->>'build_id')::uuid;
  insert into tmp_issue97_has_new_graph(
    county_code,old_build_id,new_build_id,rebuild_result
  ) values('HAS',v_old,v_new,v_rebuild);
end
$issue97_has_rebuild_has$;

-- The reviewed builder explicitly resets every one of its transaction-local
-- work tables except this OGRIP corroboration cache. A second county call in
-- the same atomic migration therefore needs this one exact lifecycle reset.
-- The cache is builder-internal and has no authority after the validated HAS
-- build has been persisted into the permanent graph tables above.
do $issue97_has_reset_builder_temp$
begin
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_point_corroboration') is null then
    raise exception 'Issue #97 HAS builder corroboration cache was not materialized';
  end if;
  execute 'drop table pg_temp.tmp_issue97_point_corroboration';
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_point_corroboration') is not null then
    raise exception 'Issue #97 HAS builder corroboration cache reset failed';
  end if;
end
$issue97_has_reset_builder_temp$;

do $issue97_has_rebuild_bel$
declare
  v_old uuid;
  v_new uuid;
  v_rebuild jsonb;
begin
  select id into strict v_old from public.brinesearch_road_graph_builds
  where state_code='OH' and county_code='BEL' and status='active';
  v_rebuild:=public.brinesearch_issue97_rebuild_county_graph('OH','BEL');
  if v_rebuild->>'status'<>'validated' or (v_rebuild->>'active')::boolean
     or nullif(v_rebuild->>'build_id','') is null then
    raise exception 'Issue #97 BEL dependent graph rebuild did not validate: %',v_rebuild;
  end if;
  v_new:=(v_rebuild->>'build_id')::uuid;
  insert into tmp_issue97_has_new_graph(
    county_code,old_build_id,new_build_id,rebuild_result
  ) values('BEL',v_old,v_new,v_rebuild);
end
$issue97_has_rebuild_bel$;

do $issue97_has_verify_dependency_order$
declare v_stale text[];
begin
  select pg_catalog.array_agg(target.county_code order by target.county_code)
  into v_stale
  from tmp_issue97_has_new_graph target
  where not private_verification.brinesearch_issue97_graph_build_sources_current(
    target.new_build_id
  );
  if v_stale is not null then
    raise exception 'Issue #97 HAS dependency-ordered builds are not source-current: %',v_stale;
  end if;
end
$issue97_has_verify_dependency_order$;

do $issue97_has_manifest$
declare
  v_manifest jsonb;
  v_manifest_id uuid;
  v_manifest_digest text;
  v_generation text;
begin
  if (select count(*) from tmp_issue97_has_new_graph)<>2 then
    raise exception 'Issue #97 HAS/BEL rebuild set is incomplete';
  end if;
  v_manifest:=private_verification.brinesearch_issue97_persist_state_candidate_manifest(
    'OH',
    'issue97-ohio-r5-has-scout-exact-identity-candidate',
    'b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48',
    pg_catalog.jsonb_build_object(
      'reviewed_by','PC under explicit Issue #97 exact-identity repair authorization',
      'reviewed_at',pg_catalog.clock_timestamp(),
      'evidence','Issue #97 Scout exact current ODOT source receipts; exact dependent HAS and BEL rebuilds; zero activation impact required',
      'scope','HAS Scout exact identity repair plus one proven BEL boundary dependency',
      'candidate_count',19,'activation_impact_count',0,
      'global_cutover_authorized',false,'public_google_authorized',false,
      'route_authority_upgrade',false,'source_boundary_is_driver_maneuver',false,
      'name_matching_used',false,'fuzzy_matching_used',false,'nearest_road_used',false
    )
  );
  v_manifest_id:=(v_manifest->>'manifest_id')::uuid;
  v_manifest_digest:=v_manifest->>'manifest_digest';
  select generation_key into strict v_generation
  from private_verification.brinesearch_issue97_state_candidate_manifests
  where id=v_manifest_id and manifest_digest=v_manifest_digest
    and manifest_key='issue97-ohio-r5-has-scout-exact-identity-candidate'
    and state_code='OH' and member_count=19
    and git_sha='b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48';
  if nullif(v_manifest_digest,'') is null
     or v_generation<>'issue97-release-20260815-r2'
     or not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(
       v_manifest_id
     )
     or exists(
       select 1 from tmp_issue97_has_new_graph target
       where not exists(
         select 1
         from private_verification.brinesearch_issue97_state_candidate_manifest_members member
         where member.manifest_id=v_manifest_id
           and member.member_key='OH:'||target.county_code
           and member.member_value->>'build_id'=target.new_build_id::text
       )
     ) then
    raise exception 'Issue #97 HAS candidate manifest did not bind both exact validated builds: %',
      v_manifest;
  end if;

  update tmp_issue97_has_new_graph set
    candidate_manifest_id=v_manifest_id,
    candidate_manifest_digest=v_manifest_digest,
    candidate_manifest_generation=v_generation;
end
$issue97_has_manifest$;

do $issue97_has_activate$
declare
  v_target tmp_issue97_has_new_graph%rowtype;
  v_activation jsonb;
begin
  for v_target in select * from tmp_issue97_has_new_graph order by county_code
  loop
    v_activation:=public.brinesearch_issue97_activate_graph_build(
      v_target.new_build_id,null,
      pg_catalog.jsonb_build_object(
        'candidate_manifest_digest',v_target.candidate_manifest_digest,
        'candidate_manifest_git_sha','b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48',
        'operator_git_sha','b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48',
        'reviewed_by','PC under explicit Issue #97 exact-identity repair authorization',
        'reviewed_at',pg_catalog.clock_timestamp(),
        'evidence','Immutable Ohio candidate manifest '||v_target.candidate_manifest_id::text||
          '; exact '||v_target.county_code||' dependency; activation impact count must remain zero',
        'global_cutover_authorized',false,'public_google_authorized',false
      )
    );
    if not coalesce((v_activation->>'activated')::boolean,false)
       or coalesce((v_activation->>'impact_count')::integer,-1)<>0 then
      raise exception 'Issue #97 % graph activation failed or requires review: %',
        v_target.county_code,v_activation;
    end if;
    update tmp_issue97_has_new_graph set activation_result=v_activation
    where county_code=v_target.county_code;
  end loop;
end
$issue97_has_activate$;

do $issue97_has_prepare_manifest_cache$
declare
  v_manifest_id uuid;
  v_manifest_digest text;
  v_generation text;
  v_cache jsonb;
begin
  if (select count(distinct candidate_manifest_id) from tmp_issue97_has_new_graph)<>1
     or (select count(distinct candidate_manifest_digest) from tmp_issue97_has_new_graph)<>1
     or (select count(distinct candidate_manifest_generation) from tmp_issue97_has_new_graph)<>1 then
    raise exception 'Issue #97 HAS/BEL candidate manifest binding diverged';
  end if;
  select candidate_manifest_id,candidate_manifest_digest,candidate_manifest_generation
  into strict v_manifest_id,v_manifest_digest,v_generation
  from tmp_issue97_has_new_graph order by county_code limit 1;
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_id',
    v_manifest_id::text,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_digest',
    v_manifest_digest,true
  );
  perform pg_catalog.set_config('brinesearch.issue97_expected_state_code','OH',true);
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_generation_key',
    v_generation,true
  );
  perform pg_catalog.set_config('brinesearch.issue97_expected_member_count','19',true);

  v_cache:=private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
    v_manifest_id,v_manifest_digest,'OH',v_generation,19
  );
  if v_cache->>'manifest_id'<>v_manifest_id::text
     or v_cache->>'manifest_digest'<>v_manifest_digest
     or v_cache->>'state_code'<>'OH'
     or v_cache->>'generation_key'<>'issue97-release-20260815-r2'
     or v_cache->>'member_count'<>'19'
     or v_cache->>'release_current_count'<>'19'
     or v_cache->>'cache_scope'<>'exact_state_manifest'
     or v_cache->>'cache_miss_policy'<>'fail_closed'
     or v_cache->>'global_cutover_authorized'<>'false'
     or v_cache->>'reused'<>'false'
     or v_cache->>'full_predicate_evaluation_count'<>'19'
     or (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache)<>19
     or exists(select 1 from pg_temp.tmp_issue97_graph_release_current_cache where not current) then
    raise exception 'Issue #97 HAS manifest-bound cache preparation failed: %',v_cache;
  end if;
  update tmp_issue97_has_new_graph set cache_result=v_cache;
end
$issue97_has_prepare_manifest_cache$;

do $issue97_has_reconcile_targets$
declare v_pad record; v_result jsonb;
begin
  for v_pad in
    select pad.id,pad.legacy_id
    from public.pads pad
    join tmp_issue97_has_deferred_google_pads dependency on dependency.pad_id=pad.id
    order by pad.legacy_id
  loop
    v_result:=public.brinesearch_issue97_run_all_pad_routing_pipeline(v_pad.id);
    if not coalesce((v_result->>'pipeline_complete_through_google_manifest')::boolean,false) then
      raise exception 'Issue #97 HAS target pipeline failed for %: %',v_pad.legacy_id,v_result;
    end if;
  end loop;
end
$issue97_has_reconcile_targets$;

do $issue97_has_verify_deferred_google_queue$
declare v_queued text[];
begin
  select pg_catalog.array_agg(pad.legacy_id order by pad.legacy_id)
  into v_queued
  from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
  join public.pads pad on pad.id=queue.pad_id;
  if v_queued is distinct from array[
       'ascent--bakos','ascent--banjo','ascent--besece','ascent--blayney','ascent--cologie',
       'ascent--jennings','ascent--pickens','ascent--scout','ascent--shutway'
     ]::text[] then
    raise exception 'Issue #97 HAS/BEL deferred Google queue diverged before drain: %',v_queued;
  end if;
end
$issue97_has_verify_deferred_google_queue$;

-- A rollback rehearsal never reaches COMMIT, so explicitly execute the same
-- existing constraint trigger that a permanent commit must execute. It only
-- refreshes/holds the exact queued private manifests and deletes their queue
-- rows; cutover remains off and public projection remains impossible.
set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;

do $issue97_has_verify_deferred_google_drain$
declare v_queue text[]; v_ready text[]; v_public_count integer;
begin
  select pg_catalog.array_agg(pad.legacy_id order by pad.legacy_id)
  into v_queue
  from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
  join public.pads pad on pad.id=queue.pad_id;
  if v_queue is not null then
    raise exception 'Issue #97 HAS deferred Google queue did not drain: %',v_queue;
  end if;

  select pg_catalog.array_agg(pad.legacy_id order by pad.legacy_id)
  into v_ready
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads pad on pad.id=receipt.pad_id
  join tmp_issue97_has_deferred_google_pads dependency on dependency.pad_id=pad.id
  where receipt.status='ready';
  if v_ready is distinct from array['ascent--bakos','ascent--cologie']::text[] then
    raise exception 'Issue #97 HAS exact private-ready dependency set diverged: %',v_ready;
  end if;

  if exists(
    select 1
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    join public.pads pad on pad.id=receipt.pad_id
    where pad.legacy_id in ('ascent--bakos','ascent--cologie')
      and not private_verification.brinesearch_issue97_transition_google_dark_current(
        pad.id
      )
  ) then
    raise exception 'Issue #97 HAS Bakos/Cologie private-ready evidence is not current';
  end if;

  select count(*) into v_public_count
  from public.brinesearch_driver_google_routes_public;
  if v_public_count<>0 then
    raise exception 'Issue #97 HAS public Google projection changed: %',v_public_count;
  end if;
end
$issue97_has_verify_deferred_google_drain$;

-- Restore the transaction-local default so any later unexpected queue event
-- remains visible to the final zero-queue postcondition instead of self-draining.
set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;

create temporary table tmp_issue97_has_directory_result on commit drop as
select private_verification.brinesearch_v18_refresh_directory_snapshot() as result;

do $issue97_has_postconditions$
declare v_count integer; v_digest text;
begin
  if (select count(*) from public.brinesearch_roads road
      join tmp_issue97_has_expected_identities expected on expected.road_id=road.id
      where road.verification_status='verified'
        and road.geometry_status='official_centerline_loaded'
        and road.source_method='issue97_oh_exact_source_identity')<>2
     or (select count(*) from public.brinesearch_road_identity_mappings mapping
      join tmp_issue97_has_expected_identities expected
        on expected.identity_id=mapping.identity_id and expected.road_id=mapping.road_id
      where mapping.mapping_status='verified'
        and mapping.mapping_method='exact_source_record_id')<>2 then
    raise exception 'Issue #97 HAS canonical/mapping postcondition failed';
  end if;

  select count(*) into v_count
  from public.brinesearch_route_prep_steps step
  join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    on receipt.route_prep_step_id=step.id
  where step.route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68' and step.active
    and receipt.resolution_status='resolved'
    and receipt.resolution_method='explicit_authoritative_source_receipt'
    and receipt.source_identity_key=step.source_details->>'source_identity_key'
    and receipt.canonical_road_id=step.road_id;
  if v_count<>5 then
    raise exception 'Issue #97 HAS expected five exact resolved Scout occurrences, found %',v_count;
  end if;

  if not exists(
    select 1 from private_verification.brinesearch_route_transition_receipts_issue97 transition
    where transition.route_prep_id='ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68'
      and transition.boundary_index=2
      and transition.left_route_prep_step_id='27983cb8-56cb-4963-9e49-e5b57abff16c'
      and transition.right_route_prep_step_id='377ce794-1ca4-1826-22d5-9f60e73787bc'
      and transition.left_road_id='cdcfd114-42c5-4478-9251-eac57a70e528'
      and transition.right_road_id='cdcfd114-42c5-4478-9251-eac57a70e528'
      and transition.status='held'
      and transition.hold_reason='adjacent_same_road_split_requires_explicit_source_boundary'
      and transition.junction_id is null and transition.anchor_id is null
  ) then
    raise exception 'Issue #97 HAS same-US-250 source boundary did not remain fail-closed';
  end if;

  if exists(select 1 from public.pads
    where legacy_id='ascent--scout' and brinesearch_google_route_status_issue97='ready')
     or exists(select 1 from private_verification.brinesearch_google_route_receipts_issue97
       where pad_id='6ef0746f-341a-4d29-9399-a81cfbec11e8' and status='ready') then
    raise exception 'Issue #97 HAS identity repair unexpectedly made Scout Google-ready';
  end if;

  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='OH' and status='active')<>19
     or (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and status='active')<>1
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from tmp_issue97_has_new_graph)<>2 then
    raise exception 'Issue #97 HAS/BEL graph activation count failed';
  end if;

  if exists(
    select 1 from tmp_issue97_has_new_graph target
    join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
    join public.brinesearch_road_graph_builds old_build on old_build.id=target.old_build_id
    where old_build.status<>'retired'
      or build.status<>'active'
      or nullif(build.source_revision_digest,'') is null
      or build.source_revision_digest=(select before.source_revision_digest
        from tmp_issue97_has_graph_before before where before.id=target.old_build_id)
      or not coalesce((select cache.current
        from pg_temp.tmp_issue97_graph_release_current_cache cache
        where cache.build_id=build.id),false)
  ) then
    raise exception 'Issue #97 HAS/BEL graph currentness/source generation failed: %',(
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'county_code',target.county_code,
        'old_build_id',target.old_build_id,
        'old_build_status',old_build.status,
        'new_build_id',target.new_build_id,
        'build_status',build.status,
        'old_source_revision_digest',(select before.source_revision_digest
          from tmp_issue97_has_graph_before before where before.id=target.old_build_id),
        'new_source_revision_digest',build.source_revision_digest,
        'source_revision_changed',build.source_revision_digest is distinct from
          (select before.source_revision_digest from tmp_issue97_has_graph_before before
           where before.id=target.old_build_id),
        'cache_current',coalesce((select cache.current
          from pg_temp.tmp_issue97_graph_release_current_cache cache
          where cache.build_id=build.id),false)
      ) order by target.county_code)
      from tmp_issue97_has_new_graph target
      join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
      join public.brinesearch_road_graph_builds old_build on old_build.id=target.old_build_id
    );
  end if;

  if (select count(*)
      from tmp_issue97_has_new_graph target
      join public.brinesearch_road_junctions junction
        on junction.build_id=target.new_build_id
      join public.brinesearch_road_junction_memberships has_member
        on has_member.junction_id=junction.id
       and has_member.identity_id='e69eb3cb-bbc7-9ea8-223c-7798d66d38c8'
       and has_member.road_id='219e5560-8875-4baf-1a24-b600c862ecfb'
      join public.brinesearch_road_junction_memberships bel_member
        on bel_member.junction_id=junction.id
       and bel_member.identity_id='a1151dc7-6a4b-7d65-17e4-02ea0a1e1d1a'
       and bel_member.road_id='614c27a7-17a3-4828-b4eb-9c6837cc021b'
      where target.county_code='BEL'
        and junction.stable_junction_key=
          'junction:point:OH:-80.9424736:40.1616560:identities:1fc24e4ea3bf40001d871678f87a6706'
        and junction.junction_type='continuation'
        and junction.verification_status='verified')<>1 then
    raise exception 'Issue #97 HAS/BEL exact CR-64 / CR-36 continuation was not retained';
  end if;

  if (select count(*) from (
      select target.county_code
      from tmp_issue97_has_new_graph target
      join private_verification.brinesearch_issue97_state_candidate_manifests manifest
        on manifest.id=target.candidate_manifest_id
       and manifest.manifest_digest=target.candidate_manifest_digest
      join private_verification.brinesearch_issue97_state_candidate_manifest_members member
        on member.manifest_id=manifest.id and member.member_key='OH:'||target.county_code
       and member.member_value->>'build_id'=target.new_build_id::text
      join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
      where manifest.manifest_key='issue97-ohio-r5-has-scout-exact-identity-candidate'
        and manifest.state_code='OH' and manifest.member_count=19
        and manifest.generation_key=target.candidate_manifest_generation
        and manifest.git_sha='b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48'
        and manifest.review_details->>'global_cutover_authorized'='false'
        and manifest.review_details->>'public_google_authorized'='false'
        and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(manifest.id)
        and target.activation_result->>'activated'='true'
        and target.activation_result->>'impact_count'='0'
        and target.cache_result->>'manifest_id'=manifest.id::text
        and target.cache_result->>'manifest_digest'=manifest.manifest_digest
        and target.cache_result->>'release_current_count'='19'
        and member.member_value->>'source_revision_digest'=build.source_revision_digest
        and member.member_value->>'graph_digest'=build.graph_digest
        and exists(select 1 from pg_temp.tmp_issue97_graph_release_current_cache cache
          where cache.build_id=target.new_build_id and cache.current)
    ) exact_members)<>2 then
    raise exception 'Issue #97 HAS/BEL immutable candidate manifest/cache is absent or invalid after activation';
  end if;

  if exists(
    select 1 from tmp_issue97_has_graph_before before
    join public.brinesearch_road_graph_builds current
      on current.state_code=before.state_code and current.county_code=before.county_code
     and current.status='active'
    where not (before.state_code='OH' and before.county_code in ('BEL','HAS'))
      and (current.id<>before.id or current.graph_digest<>before.graph_digest)
  ) or (select count(*) from tmp_issue97_has_graph_before
        where not (state_code='OH' and county_code in ('BEL','HAS')))<>
       (select count(*) from public.brinesearch_road_graph_builds
        where status='active' and not (state_code='OH' and county_code in ('BEL','HAS'))) then
    raise exception 'Issue #97 HAS/BEL migration changed an unrelated active graph';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    p.id::text||':'||coalesce(p.brinesearch_google_route_status_issue97,'')||':'||
      coalesce(p.brinesearch_google_route_revision_issue97::text,''),
    ',' order by p.id
  ),'')) into v_digest
  from public.pads p
  where not exists(
    select 1 from tmp_issue97_has_deferred_google_pads target where target.pad_id=p.id
  );
  if v_digest is distinct from (select digest from tmp_issue97_has_non_target_google_before) then
    raise exception 'Issue #97 HAS migration changed non-target private Google state';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    p.id::text||':'||coalesce(p.structured_road_sequence,'')||':'||
      coalesce(p.written_directions,'')||':'||coalesce(p.directions_clear,'')||':'||
      coalesce(p.structured_route_steps::text,'')||':'||
      coalesce(p.driver_safety_context::text,'')||':'||
      coalesce(pg_catalog.round(p.latitude::numeric,7)::text,'')||':'||
      coalesce(pg_catalog.round(p.longitude::numeric,7)::text,''),
    ',' order by p.id
  ),'')) into v_digest from public.pads p;
  if v_digest is distinct from (select digest from tmp_issue97_has_pad_authority_before) then
    raise exception 'Issue #97 HAS migration changed pad authority or destination coordinates';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    d.pad_id::text||':'||coalesce(d.legacy_id,'')||':'||
      coalesce(d.directions_clear,'')||':'||coalesce(d.source_revision::text,''),
    ',' order by d.pad_id
  ),'')) into v_digest from public.brinesearch_driver_directions_public d;
  if v_digest is distinct from (select digest from tmp_issue97_has_public_directions_before) then
    raise exception 'Issue #97 HAS migration changed reviewed public directions';
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton) is not null
     or (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)<>0
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_rows_v18)<>0 then
    raise exception 'Issue #97 HAS public Google/cutover/global authority changed';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or not exists(
       select 1 from public.brinesearch_directory_snapshots_v18
       where publication_state='current' and source_revision=5
         and row_count=1214 and searchable_count=1214
     )
     or (select result->>'publicationState' from tmp_issue97_has_directory_result)<>'current'
     or (select (result->>'rowCount')::integer from tmp_issue97_has_directory_result)<>1214 then
    raise exception 'Issue #97 HAS V18 directory was not republished current';
  end if;
end
$issue97_has_postconditions$;

select pg_catalog.jsonb_build_object(
  'issue',97,'scope','Scout exact source occurrence repair',
  'canonicalRoadsCreated',2,'identityMappingsCreated',2,
  'resolvedPublicOccurrences',5,
  'dependentPrivateGoogleReceiptsRefreshed',9,
  'affectedGraphs',(
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'countyCode',target.county_code,'oldBuildId',target.old_build_id,
      'newBuildId',target.new_build_id,'graphDigest',build.graph_digest,
      'candidateManifestId',target.candidate_manifest_id,
      'candidateManifestDigest',target.candidate_manifest_digest,
      'releaseCurrent',coalesce((select cache.current
        from pg_temp.tmp_issue97_graph_release_current_cache cache
        where cache.build_id=build.id),false)
    ) order by target.county_code) from tmp_issue97_has_new_graph target
    join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
  ),
  'scoutGoogleStatus',(
    select brinesearch_google_route_status_issue97 from public.pads
    where legacy_id='ascent--scout'
  ),
  'scoutUs250SourceBoundary','held_explicit_boundary_required',
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'directory',(select result from tmp_issue97_has_directory_result),
  'newDriverManeuverCreated',false,'routeAuthorityUpgraded',false,
  'nameMatchingUsed',false,'nearestRoadUsed',false
) as issue97_has_result;
