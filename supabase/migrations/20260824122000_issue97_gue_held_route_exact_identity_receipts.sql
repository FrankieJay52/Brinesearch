-- GitHub #97 -- Guernsey exact held-route identity receipts for Cooper/Lorraine.
--
-- This county-atomic migration installs only exact reviewed source identities,
-- rebuilds only the Guernsey graph, and reruns only Cooper/Lorraine. It does not
-- infer from names or proximity, promote raw crossings, create private access
-- geometry, publish Google output, or enable cutover.

set local statement_timeout = '15min';
set local lock_timeout = '5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:graph:OH:GUE')
);

do $issue97_gue_lock_source_generations$
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
$issue97_gue_lock_source_generations$;

create temporary table tmp_issue97_gue_graph_before on commit drop as
select b.state_code,b.county_code,b.id,b.status,b.source_revision_digest,
  b.graph_digest,b.point_junction_count,b.shared_segment_count,b.membership_count
from public.brinesearch_road_graph_builds b
where b.status='active';

-- Rebuilding the county refreshes every current GUE source identity. The
-- existing invalidation trigger therefore queues every published pad that
-- depends on one of those identities, even when its identity bytes did not
-- change. Pin that exact dependency set before any source/mapping mutation.
create temporary table tmp_issue97_gue_deferred_google_pads on commit drop as
select distinct pad.id as pad_id,pad.legacy_id
from public.brinesearch_authoritative_road_identities identity
join public.brinesearch_road_identity_mappings mapping
  on mapping.identity_id=identity.id and mapping.mapping_status='verified'
join public.brinesearch_pad_roads step on step.road_id=mapping.road_id
join public.pads pad on pad.id=step.pad_id
where identity.active and identity.state_code='OH' and identity.county_code='GUE';

create temporary table tmp_issue97_gue_non_target_google_before on commit drop as
select pg_catalog.md5(coalesce(pg_catalog.string_agg(
  p.id::text||':'||coalesce(p.brinesearch_google_route_status_issue97,'')||':'||
    coalesce(p.brinesearch_google_route_revision_issue97::text,''),
  ',' order by p.id
),'')) as digest
from public.pads p
where p.legacy_id not in ('ascent--cooper','ascent--lorraine');

create temporary table tmp_issue97_gue_pad_authority_before on commit drop as
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

create temporary table tmp_issue97_gue_public_directions_before on commit drop as
select pg_catalog.md5(coalesce(pg_catalog.string_agg(
  d.pad_id::text||':'||coalesce(d.legacy_id,'')||':'||
    coalesce(d.directions_clear,'')||':'||coalesce(d.source_revision::text,''),
  ',' order by d.pad_id
),'')) as digest
from public.brinesearch_driver_directions_public d;

create temporary table tmp_issue97_gue_expected_identities(
  source_identity_key text primary key,
  identity_id uuid not null,
  source_digest text not null,
  road_id uuid not null,
  mapping_method text not null,
  create_canonical_road boolean not null,
  canonical_name text,
  normalized_name text,
  road_type text,
  county_name text,
  township_name text,
  route_number text,
  aliases text[]
) on commit drop;

insert into tmp_issue97_gue_expected_identities values
  ('OH:ODOT:NLF:SGUESR00258**C','1d61e8f0-527b-582a-022a-673001d546df',
    '5e4256cde8457b9e765bffa7badc1ffd','f230224c-b99a-4652-b672-3b80667ba81e',
    'exact_source_record_id',false,null,null,null,null,null,null,null),
  ('OH:ODOT:NLF:CGUECR00781**C','b80b9fff-6d0e-b5b7-3b93-e8c28b476fca',
    '6887d047b2de52695494479ff27f1a10','bb31e5fa-7fbd-38bd-564a-65cd8005a8a0',
    'exact_source_record_id',true,'Martha Rd','martha-rd','county','Guernsey',null,'781',
    array['CR-781','Martha Rd']::text[]),
  ('OH:ODOT:NLF:TGUETR08730**C','2ef72301-66f2-e0d9-983b-9d289a306a1a',
    '97036842f9d379726dd260b052ad77bb','404a9e8d-b1f1-7539-39d0-47f0b3fb721d',
    'exact_source_record_id',true,'Tanglewood Ln','tanglewood-ln','township','Guernsey',
    'Washington','8730',array['Tanglewood Ln','Tanglwood Ln','TR-8730']::text[]);

do $issue97_gue_preconditions$
declare v_count integer; v_digest text;
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
    raise exception 'Issue #97 GUE reviewed function/generation checkpoint diverged';
  end if;

  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='OH' and status='active')<>19
     or (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and status='active')<>1
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 GUE active/staging graph checkpoint diverged';
  end if;

  if not exists(
    select 1 from public.brinesearch_road_graph_builds
    where id='44245144-3e39-45fe-907b-95e2b01b9c32'
      and state_code='OH' and county_code='GUE' and status='active'
      and graph_digest='d7a43bacbf54794d4e92d9e8ceca2e28'
      and source_revision_digest='b0cc4e8e3aaa7121cc39cc7935189664'
  ) or not private_verification.brinesearch_issue97_graph_build_release_current(
    '44245144-3e39-45fe-907b-95e2b01b9c32'
  ) then
    raise exception 'Issue #97 GUE active graph checkpoint diverged';
  end if;

  if (select pg_catalog.array_agg(legacy_id order by legacy_id)
      from tmp_issue97_gue_deferred_google_pads) is distinct from array[
        'ascent--blayney','ascent--jennings','ascent--shutway'
      ]::text[] then
    raise exception 'Issue #97 GUE deferred Google dependency set diverged';
  end if;

  select count(*) into v_count
  from tmp_issue97_gue_expected_identities expected
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=expected.identity_id
   and identity.source_identity_key=expected.source_identity_key
   and identity.source_digest=expected.source_digest
   and identity.state_code='OH' and identity.active
   and identity.public_access_status='public' and identity.drivable_status='drivable'
  where private_verification.brinesearch_issue97_dataset_scope_current(
    identity.dataset_id,identity.state_code,identity.county_code
  ) and private_verification.brinesearch_issue97_authoritative_identity_geometry(identity.id)
    is not null;
  if v_count<>3 then
    raise exception 'Issue #97 GUE expected three exact current identities, found %',v_count;
  end if;

  if exists(
    select 1 from tmp_issue97_gue_expected_identities expected
    join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=expected.identity_id and mapping.mapping_status='verified'
  ) or exists(
    select 1 from tmp_issue97_gue_expected_identities expected
    join public.brinesearch_roads road on road.id=expected.road_id
    where expected.create_canonical_road
  ) then
    raise exception 'Issue #97 GUE target identity/road was installed by another writer';
  end if;

  if not exists(
    select 1 from public.brinesearch_roads road
    where road.id='f230224c-b99a-4652-b672-3b80667ba81e'
      and road.canonical_name='OH-258' and road.road_type='state_route'
      and road.state='OH' and road.route_number='258'
      and road.verification_status='needs_review'
      and road.geometry_status='not_loaded'
      and road.centerline_geojson is null
      and road.source_method='explicit_in_saved_directions'
      and road.source_record_id is null
      and road.approved_by_default and not road.candidate_only
  ) then
    raise exception 'Issue #97 GUE existing OH-258 family road diverged';
  end if;

  if exists(
    select 1 from public.brinesearch_pad_roads step
    where step.road_id='f230224c-b99a-4652-b672-3b80667ba81e'
  ) or exists(
    select 1
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    where exists(
      select 1
      from pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb)) point
      where point->>'road_id'='f230224c-b99a-4652-b672-3b80667ba81e'
         or point->>'identity_id'='1d61e8f0-527b-582a-022a-673001d546df'
    )
  ) then
    raise exception 'Issue #97 GUE OH-258 family has a published exact-route or private Google dependency';
  end if;

  select pg_catalog.md5(pg_catalog.string_agg(
    step.id::text||'|'||step.step_order||'|'||step.raw_text||'|'||step.normalized_text||'|'||
      step.step_kind||'|'||coalesce(step.road_id::text,'')||'|'||step.match_status||'|'||
      coalesce(step.match_method,'')||'|'||coalesce(step.source_details::text,'{}'),
    E'\n' order by step.step_order
  )) into v_digest
  from public.brinesearch_route_prep_steps step
  where step.route_prep_id='5f3dd419-e78c-4623-88a7-0937f62b9903' and step.active;
  if v_digest<>'7346ba3d2aa770b94e08578ef4774cc7'
     or (select source_sequence_hash from public.brinesearch_route_prep
       where id='5f3dd419-e78c-4623-88a7-0937f62b9903' and active)
       is distinct from '8ff21e977542bfc8097116a74e220317' then
    raise exception 'Issue #97 Cooper derived-route checkpoint diverged';
  end if;

  select pg_catalog.md5(pg_catalog.string_agg(
    step.id::text||'|'||step.step_order||'|'||step.raw_text||'|'||step.normalized_text||'|'||
      step.step_kind||'|'||coalesce(step.road_id::text,'')||'|'||step.match_status||'|'||
      coalesce(step.match_method,'')||'|'||coalesce(step.source_details::text,'{}'),
    E'\n' order by step.step_order
  )) into v_digest
  from public.brinesearch_route_prep_steps step
  where step.route_prep_id='158a7ea3-b6b3-4445-9ba8-58f9f095b97c' and step.active;
  if v_digest<>'22d359316b386e77795ac40870f795e3'
     or (select source_sequence_hash from public.brinesearch_route_prep
       where id='158a7ea3-b6b3-4445-9ba8-58f9f095b97c' and active)
       is distinct from '8384eb2b5beae9f8ac918a74f23f6ba7' then
    raise exception 'Issue #97 Lorraine derived-route checkpoint diverged';
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton) is not null
     or (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)<>0
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_rows_v18)<>0
     or exists(
       select 1
       from private_verification.brinesearch_issue97_state_candidate_manifests
       where manifest_key='issue97-ohio-r4-gue-exact-identity-candidate'
     ) then
    raise exception 'Issue #97 GUE authority baseline diverged';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or not exists(
       select 1 from public.brinesearch_directory_snapshots_v18
       where snapshot_id='1793f911-a0c2-4a8a-8a2f-195f2f375e09'
         and publication_state='current' and source_revision=3
         and row_count=1214 and searchable_count=1214
         and content_sha256='52e12db47007d7ce2cbae17519809f0081b7be8d575f880a1a583b93f9ac4447'
     ) then
    raise exception 'Issue #97 GUE V18 directory checkpoint diverged';
  end if;
end
$issue97_gue_preconditions$;

-- The GUE identity is exact and current, but its one existing OH-258 family
-- row is the legacy saved-directions placeholder (needs_review/not_loaded).
-- Adopt the complete five-identity Ohio family from current ODOT geometry so
-- the county-scoped exact mapping refresh can keep the GUE source receipt
-- verified. This does not create route authority or publish Google output.
do $issue97_gue_adopt_sr258_family$
declare
  v_identity_count integer;
  v_all_current boolean;
  v_all_public_drivable boolean;
  v_source_keys text[];
  v_source_digest text;
  v_source_record_id text;
  v_geom extensions.geometry;
  v_geom_digest text;
  v_rows integer;
begin
  select count(*)::integer,
    coalesce(pg_catalog.bool_and(
      private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code
      )
    ),false),
    coalesce(pg_catalog.bool_and(
      identity.public_access_status='public' and identity.drivable_status='drivable'
    ),false),
    pg_catalog.array_agg(
      identity.source_identity_key
      order by identity.county_code,identity.source_identity_key
    ),
    pg_catalog.md5(pg_catalog.string_agg(
      identity.id::text||':'||coalesce(identity.source_digest,''),
      '|' order by identity.county_code,identity.source_identity_key,identity.id
    )),
    min(nullif(identity.attributes->>'nlf_id','')),
    extensions.st_collectionextract(
      extensions.st_unaryunion(extensions.st_collect(
        private_verification.brinesearch_issue97_authoritative_identity_geometry(identity.id)
        order by identity.county_code,identity.source_identity_key,identity.id
      )),2
    )
  into v_identity_count,v_all_current,v_all_public_drivable,v_source_keys,
    v_source_digest,v_source_record_id,v_geom
  from public.brinesearch_authoritative_road_identities identity
  where identity.state_code='OH' and identity.active
    and identity.road_class='state_route' and identity.route_number='258'
    and identity.public_access_status='public' and identity.drivable_status='drivable';

  v_geom_digest:=pg_catalog.md5(extensions.st_asgeojson(v_geom,7));
  if v_identity_count<>5
     or not coalesce(v_all_current,false)
     or not coalesce(v_all_public_drivable,false)
     or v_source_keys<>array[
       'OH:ODOT:NLF:SGUESR00258**C',
       'OH:ODOT:NLF:SHASSR00258**C',
       'OH:ODOT:NLF:STUSSR00258**C:COMP:2025_000000000341846',
       'OH:ODOT:NLF:STUSSR00258**C:COMP:2025_000000000341862',
       'OH:ODOT:NLF:STUSSR00258**C:COMP:2025_000000000341868'
     ]::text[]
     or v_source_digest<>'c0753bbe079862bc07f66cf52f779ff6'
     or v_source_record_id<>'SGUESR00258**C'
     or v_geom is null or extensions.st_isempty(v_geom)
     or extensions.st_dimension(v_geom)<>1
     or v_geom_digest<>'dfac6e146b3bdde0cba48c3c0de85e3f'
     or exists(
       select 1
       from public.brinesearch_authoritative_road_identities identity
       join public.brinesearch_road_identity_mappings mapping
         on mapping.identity_id=identity.id and mapping.mapping_status='verified'
       where identity.state_code='OH' and identity.active
         and identity.road_class='state_route' and identity.route_number='258'
         and mapping.road_id<>'f230224c-b99a-4652-b672-3b80667ba81e'
     ) then
    raise exception 'Issue #97 GUE exact OH-258 family evidence diverged';
  end if;

  update public.brinesearch_roads road set
    canonical_name='OH-258',normalized_name='oh-258',road_type='state_route',
    state='OH',county=null,township=null,route_number='258',
    aliases=(select pg_catalog.array_agg(distinct alias_value order by alias_value)
      from unnest(coalesce(road.aliases,'{}'::text[])
        ||array['OH-258','SR-258','Route 258']::text[]) alias_value),
    verification_status='verified',verified_at=pg_catalog.clock_timestamp(),
    source_agency='Ohio Department of Transportation',source_dataset='Road Inventory',
    source_method='issue97_oh_exact_route_family',
    source_url='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
    source_record_id=v_source_record_id,
    centerline_geojson=extensions.st_asgeojson(v_geom,7)::jsonb,
    geometry_status='official_centerline_loaded',
    geometry_checked_at=pg_catalog.clock_timestamp(),
    approved_by_default=true,candidate_only=false,
    candidate_basis=coalesce(road.candidate_basis,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'issue',97,'scope','OH-only','adoption','exact_route_family',
      'route_family','OH-258','source_identity_count',v_identity_count,
      'source_identity_keys',pg_catalog.to_jsonb(v_source_keys),
      'source_digest',v_source_digest,'family_geometry_digest',v_geom_digest,
      'name_matching_used',false,'fuzzy_matching_used',false,
      'nearest_road_used',false,'route_authority_upgrade',false,
      'public_google_publication',false
    ),
    updated_at=pg_catalog.clock_timestamp()
  where road.id='f230224c-b99a-4652-b672-3b80667ba81e';
  get diagnostics v_rows=row_count;
  if v_rows<>1 then
    raise exception 'Issue #97 GUE OH-258 family adoption updated % rows',v_rows;
  end if;
end
$issue97_gue_adopt_sr258_family$;

insert into public.brinesearch_roads(
  id,canonical_name,normalized_name,road_type,state,county,township,aliases,
  route_number,verification_status,verified_at,source_agency,source_dataset,
  source_method,source_url,source_record_id,centerline_geojson,geometry_status,
  geometry_checked_at,approved_by_default,candidate_only,candidate_basis
)
select expected.road_id,expected.canonical_name,expected.normalized_name,
  expected.road_type,'OH',expected.county_name,expected.township_name,expected.aliases,
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
    'issue',97,'scope','Cooper/Lorraine exact identity repair',
    'adoption','exact_source_identity','source_identity_key',identity.source_identity_key,
    'source_digest',identity.source_digest,'name_matching_used',false,
    'fuzzy_matching_used',false,'nearest_road_used',false,'route_number_only_used',false
  )
from tmp_issue97_gue_expected_identities expected
join public.brinesearch_authoritative_road_identities identity
  on identity.id=expected.identity_id
where expected.create_canonical_road;

insert into public.brinesearch_road_identity_mappings(
  id,identity_id,road_id,mapping_status,mapping_method,evidence,
  verified_at,created_at,updated_at
)
select private_verification.brinesearch_issue97_uuid(
    'identity-mapping:'||expected.identity_id::text||':'||expected.road_id::text
  ),expected.identity_id,expected.road_id,'verified',expected.mapping_method,
  pg_catalog.jsonb_build_object(
    'issue',97,'scope','Cooper/Lorraine exact identity repair',
    'source_identity_key',expected.source_identity_key,'source_digest',expected.source_digest,
    'exact_source_record_id',expected.mapping_method='exact_source_record_id',
    'exact_designation',expected.mapping_method='exact_route_designation',
    'name_matching_used',false,'fuzzy_matching_used',false,
    'nearest_road_used',false,'route_number_only_used',false,
    'migration','issue97_gue_held_route_exact_identity_receipts'
  ),pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp()
from tmp_issue97_gue_expected_identities expected;

do $issue97_gue_verify_canonical_install$
declare v_roads integer; v_mappings integer;
begin
  select count(*) into v_roads
  from public.brinesearch_roads road
  join tmp_issue97_gue_expected_identities expected on expected.road_id=road.id
  where road.verification_status='verified'
    and road.geometry_status='official_centerline_loaded'
    and (
      (expected.create_canonical_road
        and road.source_method='issue97_oh_exact_source_identity')
      or (not expected.create_canonical_road
        and road.source_method='issue97_oh_exact_route_family')
    );
  select count(*) into v_mappings
  from public.brinesearch_road_identity_mappings mapping
  join tmp_issue97_gue_expected_identities expected
    on expected.identity_id=mapping.identity_id and expected.road_id=mapping.road_id
  where mapping.mapping_status='verified'
    and mapping.mapping_method=expected.mapping_method;
  if v_roads<>3 or v_mappings<>3 then
    raise exception 'Issue #97 GUE canonical install failed: roads %, mappings %',
      v_roads,v_mappings;
  end if;
end
$issue97_gue_verify_canonical_install$;

create temporary table tmp_issue97_gue_step_receipts(
  step_id uuid primary key,
  source_identity_key text not null,
  road_id uuid not null,
  step_kind text not null,
  geometry_status text not null,
  travel_direction text
) on commit drop;

insert into tmp_issue97_gue_step_receipts values
  ('25c950be-7f58-47be-8cb1-5031847dc6cc','OH:ODOT:NLF:SGUESR00258**C',
    'f230224c-b99a-4652-b672-3b80667ba81e','state_route','not_started',null),
  ('0622f5f5-4309-4087-8d03-e50abd1a4649','OH:ODOT:NLF:CGUECR00781**C',
    'bb31e5fa-7fbd-38bd-564a-65cd8005a8a0','county_road','ready',null),
  ('7e305ea7-d6ac-4062-b779-359163e6a774','OH:ODOT:NLF:CGUECR00878**C:COMP:2025_000000000020744',
    '21c40fdf-2d5c-40d2-b96c-1900a7d5581c','county_road','ready',null),
  ('27e934c2-2eec-442b-babb-2ddaf8ffef2d','OH:ODOT:NLF:CGUECR00870**C',
    '68942fed-3a0a-419c-a5f0-af426909314b','county_road','ready',null),
  ('caed982b-2936-458a-b719-c143646a9f23','OH:ODOT:NLF:TGUETR00781**C:COMP:2025_000000000389349',
    'a80366a3-06e0-4a0a-970d-7df6c2b7a205','township_road','ready',null),
  ('45aab3bf-339e-453f-bdff-c256e000395e','OH:ODOT:NLF:TGUETR08730**C',
    '404a9e8d-b1f1-7539-39d0-47f0b3fb721d','township_road','ready',null),
  ('7f534786-a438-4f44-8c34-2e799a0ab4d5','OH:ODOT:NLF:SBELUS00250**C',
    'cdcfd114-42c5-4478-9251-eac57a70e528','us_route','ready','E'),
  ('50afc3a9-af51-4d0d-992b-0a0a4588c370','OH:ODOT:NLF:CBELCR00005**C',
    '5f9cf989-1d29-44cb-8424-3fe81e73f51b','county_road','ready',null),
  ('425fd8ec-3bc5-4d0d-a23b-57bd8ab244fc','OH:ODOT:NLF:CBELCR00010**C',
    '22274ee1-8377-44b7-b395-3c511f8e720e','county_road','ready',null),
  ('d7fd0b47-800d-469a-81a1-4f6909763550','OH:ODOT:NLF:CBELCR00010**C',
    '22274ee1-8377-44b7-b395-3c511f8e720e','county_road','ready',null);

update public.brinesearch_route_prep_steps step
set road_id=receipt.road_id,step_kind=receipt.step_kind,match_status='exact_master',
  match_method='issue97_owner_reviewed_exact_source_identity',match_confidence=1,
  geometry_status=receipt.geometry_status,
  travel_direction=coalesce(receipt.travel_direction,step.travel_direction),
  source_details=coalesce(step.source_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'issue',97,'source_identity_key',receipt.source_identity_key,
    'authoritative_identity_key',receipt.source_identity_key,
    'authoritative_identity_proof',true,
    'proof_scope','owner-reviewed saved-route occurrence + exact current ODOT source identity',
    'source_digest',identity.source_digest,'name_matching_used',false,
    'fuzzy_matching_used',false,'nearest_road_used',false,'route_number_only_used',false,
    'route_authority_upgrade',false,'public_google_publication',false
  ),updated_at=pg_catalog.clock_timestamp()
from tmp_issue97_gue_step_receipts receipt
join public.brinesearch_authoritative_road_identities identity
  on identity.source_identity_key=receipt.source_identity_key and identity.active
where step.id=receipt.step_id;

do $issue97_gue_verify_step_receipts$
declare v_count integer;
begin
  select count(*) into v_count
  from tmp_issue97_gue_step_receipts expected
  join public.brinesearch_route_prep_steps step on step.id=expected.step_id and step.active
  join public.brinesearch_authoritative_road_identities identity
    on identity.source_identity_key=expected.source_identity_key and identity.active
  join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=identity.id and mapping.road_id=expected.road_id
   and mapping.mapping_status='verified'
  where step.road_id=expected.road_id and step.step_kind=expected.step_kind
    and step.match_status='exact_master'
    and step.match_method='issue97_owner_reviewed_exact_source_identity'
    and step.source_details->>'source_identity_key'=expected.source_identity_key
    and (step.source_details->>'authoritative_identity_proof')::boolean;
  if v_count<>10 then
    raise exception 'Issue #97 GUE expected ten repaired route occurrences, found %',v_count;
  end if;
end
$issue97_gue_verify_step_receipts$;

create temporary table tmp_issue97_gue_new_graph(
  old_build_id uuid not null,
  new_build_id uuid not null,
  candidate_manifest_id uuid,
  candidate_manifest_digest text,
  candidate_manifest_generation text,
  rebuild_result jsonb not null,
  activation_result jsonb,
  cache_result jsonb
) on commit drop;

do $issue97_gue_rebuild$
declare
  v_old uuid;
  v_new uuid;
  v_rebuild jsonb;
begin
  select id into strict v_old from public.brinesearch_road_graph_builds
  where state_code='OH' and county_code='GUE' and status='active';
  v_rebuild:=public.brinesearch_issue97_rebuild_county_graph('OH','GUE');
  if v_rebuild->>'status'<>'validated' or (v_rebuild->>'active')::boolean
     or nullif(v_rebuild->>'build_id','') is null then
    raise exception 'Issue #97 GUE graph rebuild did not validate: %',v_rebuild;
  end if;
  v_new:=(v_rebuild->>'build_id')::uuid;

  insert into tmp_issue97_gue_new_graph(
    old_build_id,new_build_id,rebuild_result
  ) values(v_old,v_new,v_rebuild);
end
$issue97_gue_rebuild$;

-- Persist the exact whole-Ohio candidate as its own statement. The activation
-- function performs the one authoritative whole-state currentness check. Do
-- not repeat that expensive predicate before or after activation.
do $issue97_gue_manifest$
declare
  v_new uuid;
  v_manifest jsonb;
  v_manifest_id uuid;
  v_manifest_digest text;
  v_generation text;
begin
  select new_build_id into strict v_new from tmp_issue97_gue_new_graph;
  -- Graph activation is bound to a fresh immutable whole-Ohio candidate
  -- manifest. The manifest selects the release-current validated GUE build and
  -- the unchanged active build for each other registered Ohio county. It does
  -- not authorize global cutover, route authority, or Google publication.
  v_manifest:=private_verification.brinesearch_issue97_persist_state_candidate_manifest(
    'OH',
    'issue97-ohio-r4-gue-exact-identity-candidate',
    'b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48',
    pg_catalog.jsonb_build_object(
      'reviewed_by','PC under explicit Issue #97 exact-identity repair authorization',
      'reviewed_at',pg_catalog.clock_timestamp(),
      'evidence','Issue #97 Cooper/Lorraine exact current ODOT source receipts; one GUE rebuild; zero activation impact required',
      'scope','GUE exact identity repair only',
      'candidate_count',19,
      'activation_impact_count',0,
      'global_cutover_authorized',false,
      'public_google_authorized',false,
      'route_authority_upgrade',false,
      'name_matching_used',false,
      'fuzzy_matching_used',false,
      'nearest_road_used',false
    )
  );
  v_manifest_id:=(v_manifest->>'manifest_id')::uuid;
  v_manifest_digest:=v_manifest->>'manifest_digest';
  select generation_key into strict v_generation
  from private_verification.brinesearch_issue97_state_candidate_manifests
  where id=v_manifest_id and manifest_digest=v_manifest_digest
    and manifest_key='issue97-ohio-r4-gue-exact-identity-candidate'
    and state_code='OH' and member_count=19
    and git_sha='b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48';
  if nullif(v_manifest_digest,'') is null
     or v_generation<>'issue97-release-20260815-r2'
     or not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(
       v_manifest_id
     )
     or not exists(
       select 1
       from private_verification.brinesearch_issue97_state_candidate_manifest_members member
       where member.manifest_id=v_manifest_id and member.member_key='OH:GUE'
         and member.member_value->>'build_id'=v_new::text
     ) then
    raise exception 'Issue #97 GUE candidate manifest did not bind the exact validated build: %',
      v_manifest;
  end if;

  update tmp_issue97_gue_new_graph set
    candidate_manifest_id=v_manifest_id,
    candidate_manifest_digest=v_manifest_digest,
    candidate_manifest_generation=v_generation;
end
$issue97_gue_manifest$;

do $issue97_gue_activate$
declare
  v_target tmp_issue97_gue_new_graph%rowtype;
  v_activation jsonb;
begin
  select * into strict v_target from tmp_issue97_gue_new_graph;
  v_activation:=public.brinesearch_issue97_activate_graph_build(
    v_target.new_build_id,null,
    pg_catalog.jsonb_build_object(
      'candidate_manifest_digest',v_target.candidate_manifest_digest,
      'candidate_manifest_git_sha','b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48',
      'operator_git_sha','b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48',
      'reviewed_by','PC under explicit Issue #97 exact-identity repair authorization',
      'reviewed_at',pg_catalog.clock_timestamp(),
      'evidence','Immutable Ohio candidate manifest '||v_target.candidate_manifest_id::text||
        '; exact GUE source receipts; activation impact count must remain zero',
      'global_cutover_authorized',false,
      'public_google_authorized',false
    )
  );
  if not coalesce((v_activation->>'activated')::boolean,false)
     or coalesce((v_activation->>'impact_count')::integer,-1)<>0 then
    raise exception 'Issue #97 GUE graph activation failed or requires review: %',v_activation;
  end if;
  update tmp_issue97_gue_new_graph set activation_result=v_activation;
end
$issue97_gue_activate$;

-- Once the exact manifest set is active, bind the existing strict transaction
-- cache. It evaluates each of the 19 members once and all routing consumers
-- fail closed on a cache miss.
do $issue97_gue_prepare_manifest_cache$
declare
  v_target tmp_issue97_gue_new_graph%rowtype;
  v_cache jsonb;
begin
  select * into strict v_target from tmp_issue97_gue_new_graph;
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_id',
    v_target.candidate_manifest_id::text,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_digest',
    v_target.candidate_manifest_digest,true
  );
  perform pg_catalog.set_config('brinesearch.issue97_expected_state_code','OH',true);
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_generation_key',
    v_target.candidate_manifest_generation,true
  );
  perform pg_catalog.set_config('brinesearch.issue97_expected_member_count','19',true);

  v_cache:=private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
    v_target.candidate_manifest_id,v_target.candidate_manifest_digest,'OH',
    v_target.candidate_manifest_generation,19
  );
  if v_cache->>'manifest_id'<>v_target.candidate_manifest_id::text
     or v_cache->>'manifest_digest'<>v_target.candidate_manifest_digest
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
    raise exception 'Issue #97 GUE manifest-bound cache preparation failed: %',v_cache;
  end if;
  update tmp_issue97_gue_new_graph set cache_result=v_cache;
end
$issue97_gue_prepare_manifest_cache$;

do $issue97_gue_reconcile_targets$
declare v_pad record; v_result jsonb;
begin
  for v_pad in
    select p.id,p.legacy_id from public.pads p
    where p.legacy_id in ('ascent--cooper','ascent--lorraine')
       or exists(select 1 from tmp_issue97_gue_deferred_google_pads dependency
         where dependency.pad_id=p.id)
    order by p.legacy_id
  loop
    v_result:=public.brinesearch_issue97_run_all_pad_routing_pipeline(v_pad.id);
    if not coalesce((v_result->>'pipeline_complete_through_google_manifest')::boolean,false) then
      raise exception 'Issue #97 GUE target pipeline failed for %: %',v_pad.legacy_id,v_result;
    end if;
  end loop;
end
$issue97_gue_reconcile_targets$;

do $issue97_gue_verify_deferred_google_queue$
declare v_queued text[];
begin
  select pg_catalog.array_agg(pad.legacy_id order by pad.legacy_id)
  into v_queued
  from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
  join public.pads pad on pad.id=queue.pad_id;
  if v_queued is distinct from array[
       'ascent--blayney','ascent--jennings','ascent--shutway'
     ]::text[] then
    raise exception 'Issue #97 GUE deferred Google queue diverged before drain: %',v_queued;
  end if;
end
$issue97_gue_verify_deferred_google_queue$;

-- A rollback rehearsal never reaches COMMIT, so explicitly execute the same
-- existing constraint trigger that a permanent commit must execute. It only
-- refreshes/holds the exact queued private manifests and deletes their queue
-- rows; cutover remains off and public projection remains impossible.
set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;

do $issue97_gue_verify_deferred_google_drain$
begin
  if exists(select 1
      from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or exists(
       select 1
       from private_verification.brinesearch_google_route_receipts_issue97 receipt
       join public.pads pad on pad.id=receipt.pad_id
       where pad.legacy_id in ('ascent--blayney','ascent--jennings','ascent--shutway')
         and receipt.status='ready'
     )
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Issue #97 GUE deferred Google drain failed closed';
  end if;
end
$issue97_gue_verify_deferred_google_drain$;

-- Restore the transaction-local default so any later unexpected queue event
-- remains visible to the final zero-queue postcondition instead of self-draining.
set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;

create temporary table tmp_issue97_gue_directory_result on commit drop as
select private_verification.brinesearch_v18_refresh_directory_snapshot() as result;

do $issue97_gue_postconditions$
declare v_count integer; v_digest text;
begin
  if (select count(*) from public.brinesearch_roads road
      join tmp_issue97_gue_expected_identities expected on expected.road_id=road.id
      where expected.create_canonical_road and road.verification_status='verified'
        and road.geometry_status='official_centerline_loaded'
        and road.source_method='issue97_oh_exact_source_identity')<>2
     or not exists(
       select 1 from public.brinesearch_roads road
       where road.id='f230224c-b99a-4652-b672-3b80667ba81e'
         and road.canonical_name='OH-258' and road.road_type='state_route'
         and road.state='OH' and road.route_number='258'
         and road.verification_status='verified'
         and road.geometry_status='official_centerline_loaded'
         and road.source_method='issue97_oh_exact_route_family'
         and road.source_record_id='SGUESR00258**C'
         and pg_catalog.md5(road.centerline_geojson::text)=
           '51e2d9edc4aa6ba818642ea82272ce4c'
         and road.candidate_basis->>'source_digest'='c0753bbe079862bc07f66cf52f779ff6'
         and road.candidate_basis->>'family_geometry_digest'=
           'dfac6e146b3bdde0cba48c3c0de85e3f'
         and not coalesce((road.candidate_basis->>'name_matching_used')::boolean,true)
         and not coalesce((road.candidate_basis->>'fuzzy_matching_used')::boolean,true)
         and not coalesce((road.candidate_basis->>'nearest_road_used')::boolean,true)
     )
     or (select count(*) from public.brinesearch_road_identity_mappings mapping
      join tmp_issue97_gue_expected_identities expected
        on expected.identity_id=mapping.identity_id and expected.road_id=mapping.road_id
      where mapping.mapping_status='verified'
        and mapping.mapping_method=expected.mapping_method)<>3 then
    raise exception 'Issue #97 GUE canonical/mapping postcondition failed';
  end if;

  select count(*) into v_count
  from public.brinesearch_route_prep_steps step
  join public.brinesearch_route_prep route on route.id=step.route_prep_id and route.active
  join public.pads pad on pad.id=route.pad_id
  join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    on receipt.route_prep_step_id=step.id
  where step.active and pad.legacy_id in ('ascent--cooper','ascent--lorraine')
    and step.step_kind<>'private_segment'
    and receipt.resolution_status='resolved'
    and receipt.resolution_method='explicit_authoritative_source_receipt'
    and receipt.source_identity_key=step.source_details->>'source_identity_key'
    and receipt.canonical_road_id=step.road_id;
  if v_count<>10 then
    raise exception 'Issue #97 GUE expected ten exact resolved public occurrences, found %',v_count;
  end if;

  if not exists(
    select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    where receipt.route_prep_step_id='ccf07501-e55f-476a-b440-741bd750ae5b'
      and receipt.resolution_status='held' and receipt.identity_id is null
      and receipt.canonical_road_id is null
      and receipt.hold_reason in (
        'terminal_private_access_destination_requires_authoritative_geometry',
        'no_authoritative_private_or_access_identity_candidate'
      )
  ) then
    raise exception 'Issue #97 Cooper private lease road did not remain fail-closed';
  end if;

  if exists(select 1 from public.pads
    where legacy_id in ('ascent--cooper','ascent--lorraine')
      and brinesearch_google_route_status_issue97='ready') then
    raise exception 'Issue #97 GUE identity repair unexpectedly made private Google ready';
  end if;

  if not exists(
    select 1 from public.brinesearch_road_junctions junction
    join tmp_issue97_gue_new_graph target on target.new_build_id=junction.build_id
    where junction.stable_junction_key=
      'junction:point:OH:-81.3646751:40.1897245:identities:6fa16f4f61269512cf02a1e1d5d0a04e'
      and junction.verification_status='held' and junction.confidence='held'
      and junction.source_method='exact_authoritative_source_vertex'
      and coalesce((junction.source_provenance->>'topology_supported')::boolean,false)=false
  ) then
    raise exception 'Issue #97 Cooper Titus/Sligo raw crossing was incorrectly promoted';
  end if;

  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='OH' and status='active')<>19
     or (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and status='active')<>1
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from tmp_issue97_gue_new_graph)<>1 then
    raise exception 'Issue #97 GUE graph activation count failed';
  end if;

  if exists(
    select 1 from tmp_issue97_gue_new_graph target
    join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
    where build.status<>'active'
      or nullif(build.source_revision_digest,'') is null
      or build.source_revision_digest=(select before.source_revision_digest
        from tmp_issue97_gue_graph_before before where before.id=target.old_build_id)
      or not coalesce((select cache.current
        from pg_temp.tmp_issue97_graph_release_current_cache cache
        where cache.build_id=build.id),false)
  ) then
    raise exception 'Issue #97 GUE graph currentness/source generation failed: %',(
      select pg_catalog.jsonb_build_object(
        'old_build_id',target.old_build_id,
        'new_build_id',target.new_build_id,
        'build_status',build.status,
        'old_source_revision_digest',(select before.source_revision_digest
          from tmp_issue97_gue_graph_before before where before.id=target.old_build_id),
        'new_source_revision_digest',build.source_revision_digest,
        'source_revision_changed',build.source_revision_digest is distinct from
          (select before.source_revision_digest from tmp_issue97_gue_graph_before before
           where before.id=target.old_build_id),
        'cache_current',coalesce((select cache.current
          from pg_temp.tmp_issue97_graph_release_current_cache cache
          where cache.build_id=build.id),false)
      )
      from tmp_issue97_gue_new_graph target
      join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
    );
  end if;

  if not exists(
    select 1
    from tmp_issue97_gue_new_graph target
    join private_verification.brinesearch_issue97_state_candidate_manifests manifest
      on manifest.id=target.candidate_manifest_id
     and manifest.manifest_digest=target.candidate_manifest_digest
    join private_verification.brinesearch_issue97_state_candidate_manifest_members member
      on member.manifest_id=manifest.id
     and member.member_key='OH:GUE'
     and member.member_value->>'build_id'=target.new_build_id::text
    join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
    where manifest.manifest_key='issue97-ohio-r4-gue-exact-identity-candidate'
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
  ) then
    raise exception 'Issue #97 GUE immutable candidate manifest/cache is absent or invalid after activation';
  end if;

  if exists(
    select 1 from tmp_issue97_gue_graph_before before
    join public.brinesearch_road_graph_builds current
      on current.state_code=before.state_code and current.county_code=before.county_code
     and current.status='active'
    where not (before.state_code='OH' and before.county_code='GUE')
      and (current.id<>before.id or current.graph_digest<>before.graph_digest)
  ) or (select count(*) from tmp_issue97_gue_graph_before
        where not (state_code='OH' and county_code='GUE'))<>
       (select count(*) from public.brinesearch_road_graph_builds
        where status='active' and not (state_code='OH' and county_code='GUE')) then
    raise exception 'Issue #97 GUE migration changed an unrelated active graph';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    p.id::text||':'||coalesce(p.brinesearch_google_route_status_issue97,'')||':'||
      coalesce(p.brinesearch_google_route_revision_issue97::text,''),
    ',' order by p.id
  ),'')) into v_digest
  from public.pads p where p.legacy_id not in ('ascent--cooper','ascent--lorraine');
  if v_digest is distinct from (select digest from tmp_issue97_gue_non_target_google_before) then
    raise exception 'Issue #97 GUE migration changed non-target private Google state';
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
  if v_digest is distinct from (select digest from tmp_issue97_gue_pad_authority_before) then
    raise exception 'Issue #97 GUE migration changed pad authority or destination coordinates';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    d.pad_id::text||':'||coalesce(d.legacy_id,'')||':'||
      coalesce(d.directions_clear,'')||':'||coalesce(d.source_revision::text,''),
    ',' order by d.pad_id
  ),'')) into v_digest from public.brinesearch_driver_directions_public d;
  if v_digest is distinct from (select digest from tmp_issue97_gue_public_directions_before) then
    raise exception 'Issue #97 GUE migration changed reviewed public directions';
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton) is not null
     or (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)<>0
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_snapshots_v18)<>0
     or (select count(*) from public.brinesearch_company_road_overlay_rows_v18)<>0 then
    raise exception 'Issue #97 GUE public Google/cutover/global authority changed';
  end if;

  if (select count(*) from public.brinesearch_directory_snapshots_v18
      where publication_state='current')<>1
     or not exists(
       select 1 from public.brinesearch_directory_snapshots_v18
       where publication_state='current' and source_revision=4
         and row_count=1214 and searchable_count=1214
     )
     or (select result->>'publicationState' from tmp_issue97_gue_directory_result)<>'current'
     or (select (result->>'rowCount')::integer from tmp_issue97_gue_directory_result)<>1214 then
    raise exception 'Issue #97 GUE V18 directory was not republished current';
  end if;
end
$issue97_gue_postconditions$;

select pg_catalog.jsonb_build_object(
  'issue',97,'scope','Cooper/Lorraine exact identity repair',
  'canonicalRoadsCreated',2,'canonicalRoadFamiliesAdopted',1,
  'adoptedRoadFamily','OH-258','adoptedRoadFamilyIdentityCount',5,
  'identityMappingsCreated',3,
  'resolvedPublicOccurrences',10,
  'dependentPrivateGoogleReceiptsRefreshed',3,
  'affectedGraph',(
    select pg_catalog.jsonb_build_object(
      'countyCode','GUE','oldBuildId',target.old_build_id,
      'newBuildId',target.new_build_id,'graphDigest',build.graph_digest,
      'candidateManifestId',target.candidate_manifest_id,
      'candidateManifestDigest',target.candidate_manifest_digest,
      'releaseCurrent',coalesce((select cache.current
        from pg_temp.tmp_issue97_graph_release_current_cache cache
        where cache.build_id=build.id),false)
    ) from tmp_issue97_gue_new_graph target
    join public.brinesearch_road_graph_builds build on build.id=target.new_build_id
  ),
  'targetPrivateGoogle',(
    select pg_catalog.jsonb_object_agg(p.legacy_id,p.brinesearch_google_route_status_issue97
      order by p.legacy_id)
    from public.pads p where p.legacy_id in ('ascent--cooper','ascent--lorraine')
  ),
  'publicGoogleRows',(select count(*) from public.brinesearch_driver_google_routes_public),
  'cutoverAt',(select cutover_at from public.brinesearch_issue97_release_state where singleton),
  'directory',(select result from tmp_issue97_gue_directory_result),
  'cooperPrivateAccess','held','cooperTitusSligoGraphCrossing','held',
  'nameMatchingUsed',false,'nearestRoadUsed',false
) as issue97_gue_result;
