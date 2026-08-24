\set ON_ERROR_STOP on
\pset pager off
\timing on

begin;
set local statement_timeout='45min';
set local lock_timeout='2min';

create or replace function pg_temp.issue97_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then raise exception '%',p_message; end if;
end
$$;

-- Exact rollback-only DML sentries are cheaper and stronger than serializing
-- every authoritative geometry byte merely to prove the repair lane never
-- writes source or graph-child relations.
create or replace function pg_temp.issue97_forbid_protected_dml()
returns trigger language plpgsql as $$
begin
  raise exception 'Issue #97 Harrison rehearsal attempted protected % DML on %.%',
    tg_op,tg_table_schema,tg_table_name;
end
$$;
create trigger issue97_harrison_no_source_identity_dml before insert or update or delete
  on public.brinesearch_authoritative_road_identities for each statement
  execute function pg_temp.issue97_forbid_protected_dml();
create trigger issue97_harrison_no_source_segment_dml before insert or update or delete
  on public.brinesearch_authoritative_road_segments for each statement
  execute function pg_temp.issue97_forbid_protected_dml();
create trigger issue97_harrison_no_source_dataset_dml before insert or update or delete
  on public.brinesearch_road_source_datasets for each statement
  execute function pg_temp.issue97_forbid_protected_dml();
create trigger issue97_harrison_no_source_run_dml before insert or update or delete
  on public.brinesearch_road_source_ingest_runs for each statement
  execute function pg_temp.issue97_forbid_protected_dml();
create trigger issue97_harrison_no_junction_dml before insert or update or delete
  on public.brinesearch_road_junctions for each statement
  execute function pg_temp.issue97_forbid_protected_dml();
create trigger issue97_harrison_no_membership_dml before insert or update or delete
  on public.brinesearch_road_junction_memberships for each statement
  execute function pg_temp.issue97_forbid_protected_dml();
create trigger issue97_harrison_no_anchor_dml before insert or update or delete
  on public.brinesearch_road_junction_anchors for each statement
  execute function pg_temp.issue97_forbid_protected_dml();

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:ohio-state-release'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:mapping-refresh'));

create temporary table tmp_issue97_harrison_frozen_routes(
  route_prep_id uuid primary key
) on commit drop;

insert into tmp_issue97_harrison_frozen_routes values
('0014a79d-ab62-4230-b823-1070ccb1a3bf'),('0415cc7e-fcff-4768-a280-b55476b073d3'),
('128104ed-fec4-4b6b-bbd8-29088a8ed4ca'),('15c972c7-f26d-4ef3-a88c-e57592e25095'),
('172511c6-36e0-4194-9df1-935373698ecd'),('17461b0c-61f1-4960-93bf-2b73e1be336c'),
('21774591-ee25-49d8-90b4-afcf7762fbb8'),('21915b23-9b7c-458f-a007-a056386d6abc'),
('2208a5ae-ac48-41d1-9750-984d399027f7'),('25de4f3e-b16a-421b-be1c-4e1c2a0c7dc4'),
('3295ae72-6407-48de-b5a9-a854db39d7ef'),('34201b4a-f2f4-4986-bf58-21296efca4f0'),
('3f06a12e-e128-4fa9-982a-965c1a7204ca'),('46dea365-baa2-458c-a270-7d38ecf31572'),
('4937b84b-e166-41ca-b5ce-ff61a44e2dab'),('4a209eed-5f69-4cc7-b189-85196227c4fe'),
('4d4eb279-c380-466b-9264-779760cadfcf'),('53319091-7b94-43e2-af8b-1a544255c64a'),
('53b6c1c4-2fe1-4187-899c-41b92d9fdcd4'),('5a74a964-5f9e-44fe-bf93-0a16c98d16db'),
('5b06343e-b024-4416-8ada-5a155e8bd94d'),('5f416840-2528-4576-96a8-1e178c1b5435'),
('686e13b3-18c4-4761-ad14-949edb8b4279'),('742eda2f-7973-47c2-b867-03bdcb1b8f39'),
('7ca02e61-f2c1-4cb9-bb4b-0705208571a8'),('842730b8-3b5b-4652-a658-2b4504b2ed4e'),
('902194a0-4bbe-4fdf-8a81-86149f17f9a1'),('9ab46315-3844-4000-8e37-6124e7249f36'),
('9e6df2e9-245a-42d7-8b9c-b65648165fed'),('b41b4262-5d35-4588-8bff-4f06cbefc629'),
('b4c8e7e3-8e4a-4957-a7d0-641000c68c81'),('b68bb7ac-a4f2-43ac-90bc-7e485f9a958a'),
('b77e7138-c5ff-493f-9252-35574e1c3d75'),('b8c0ee16-e110-4840-860e-90e2d1a0767c'),
('b9d0ea76-ee87-4d19-8d23-1194de26ca78'),('bf23b963-5c1d-466a-b45b-1862b6ab811a'),
('c4129c8f-b03e-4072-a20c-3e45e1d5f321'),('c6a47755-c549-4af0-84db-91ebaaae20ae'),
('ce2b78ca-dd3f-404a-bf4e-2851a67080c1'),('cf4f1918-8438-4a6e-9531-c9c95149aab6'),
('d2e3ca20-429e-420d-87bd-9c4376fac3c7'),('d2eb92a0-33c7-4248-bc91-f9e24d2b35bb'),
('deee563d-9805-41be-84ab-0f16fd0c197b'),('e32eb4a8-1a7f-4818-9b4a-29eda21e2cf2'),
('e667a657-50ad-45e0-a2b0-5540d80fd61a'),('e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a'),
('eb5572ff-ecc0-498b-9a8f-dacaddc05fe3'),('f8dc7439-98de-48db-b5fe-352c21f491d0'),
('f98b96e1-c414-4ad5-a0cb-1c0834541352'),('ff6f7337-0ddf-41f9-8a51-ee531a793c1f');

create temporary table tmp_issue97_harrison_bad_roads(road_id uuid primary key) on commit drop;
insert into tmp_issue97_harrison_bad_roads values
('639b05f2-5dc6-4678-86bf-e7a0a775663b'),('8da26948-222c-46ef-ac79-9d07ccd08c31'),
('8382d2bf-d427-4a91-9afa-641885c71533'),('f0db4fa8-3900-4350-a31e-3d61128006f8'),
('ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3'),('7fe5f642-bfdc-4d5f-9f54-85f9b15af741'),
('f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965'),('ed00b321-3e61-4e84-bbcb-7497a1ae4b90'),
('1a1988a9-b0d5-4414-8abf-ebeda1ac1f32'),('c1eefe49-fe29-44fa-84b7-2cfe29180761');

create temporary table tmp_issue97_harrison_target_identities(identity_id uuid primary key) on commit drop;
insert into tmp_issue97_harrison_target_identities values
('82d4acf0-4592-3c60-732f-ef07cb42796a'),('b0ec2efd-e511-2e2d-c481-eaf896757bbb'),
('83906bd8-9c10-e948-60e6-ed78a1ca34de'),('100e158e-9b85-f169-ae1e-cbb88b9f18fa'),
('dd89cc57-386f-5f4a-cd54-79c862bda433'),('1a09df0d-e31b-52a9-1d1d-6434e02546f5'),
('d2f9004d-3a70-a61c-30b1-6aca9b4b46d0'),('dbcc9da8-07cb-f054-68ca-debe2f8640fc'),
('40a0eda3-2dd3-6166-37cf-d4e1e1ac7040');

create temporary table tmp_issue97_harrison_derived_closure on commit drop as
select distinct route_prep_id from (
  select route.id route_prep_id
  from public.brinesearch_route_prep route
  join public.brinesearch_route_prep_steps step on step.route_prep_id=route.id and step.active
  join tmp_issue97_harrison_bad_roads target on target.road_id=step.road_id
  where route.active
  union
  select route.id
  from public.brinesearch_route_prep route
  join public.brinesearch_route_prep_steps step on step.route_prep_id=route.id and step.active
  join private_verification.brinesearch_route_occurrence_candidates_issue97 candidate on candidate.route_prep_step_id=step.id
  join tmp_issue97_harrison_target_identities target on target.identity_id=candidate.identity_id
  where route.active
  union
  select route.id
  from public.brinesearch_route_prep route
  join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt on receipt.route_prep_id=route.id
  join tmp_issue97_harrison_target_identities target on target.identity_id=receipt.identity_id
  where route.active
) closure;

select pg_temp.issue97_assert(
  (select count(*) from tmp_issue97_harrison_frozen_routes)=50
  and (select pg_catalog.md5(pg_catalog.string_agg(route_prep_id::text,',' order by route_prep_id))
       from tmp_issue97_harrison_frozen_routes)='c59df56888cb97022dea67b7f0460d3c'
  and not exists(select route_prep_id from tmp_issue97_harrison_frozen_routes except select route_prep_id from tmp_issue97_harrison_derived_closure)
  and not exists(select route_prep_id from tmp_issue97_harrison_derived_closure except select route_prep_id from tmp_issue97_harrison_frozen_routes)
  and (select count(distinct route.pad_id) from public.brinesearch_route_prep route join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=route.id where route.active)=33
  and (select count(*) from public.brinesearch_route_prep route join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=route.id where route.active and route.route_group='primary')=33
  and (select count(*) from public.brinesearch_route_prep route join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=route.id where route.active and route.route_group='alternate')=17
  and not exists(select 1 from public.brinesearch_route_prep route join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=route.id join public.pads pad on pad.id=route.pad_id where pad.legacy_id in ('ascent--cologie','ascent--bakos')),
  'Issue #97 frozen Harrison 50-route/33-pad/33-primary/17-alternate closure drifted'
);

create temporary table tmp_issue97_harrison_baseline on commit drop as
select
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(road)::text,'|' order by road.id),''))
   from public.brinesearch_roads road where not exists(select 1 from tmp_issue97_harrison_bad_roads target where target.road_id=road.id)) non_target_roads,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(mapping)::text,'|' order by mapping.id),''))
   from public.brinesearch_road_identity_mappings mapping) mappings,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),''))
   from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
   join public.brinesearch_route_prep_steps step on step.id=candidate.route_prep_step_id
   where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=step.route_prep_id)) non_target_candidates,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
   where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id)) non_target_occurrences,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),''))
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
   where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id)) non_target_routes,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),''))
   from private_verification.brinesearch_route_transition_receipts_issue97 receipt
   where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id)) non_target_transitions,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
   where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id)) non_target_geometry,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
   from private_verification.brinesearch_google_route_receipts_issue97 receipt
   where not exists(select 1 from public.brinesearch_route_prep route join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=route.id where route.pad_id=receipt.pad_id)) non_target_private_google,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
   from public.brinesearch_road_graph_builds build where build.id not in ('5ee5f97b-447f-41d3-946a-68a8b28d8367','542c35d5-a9ba-4b43-8a64-63a66f6b29e2')) non_target_graphs,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),''))
   from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.legacy_id in ('ascent--cologie','ascent--bakos')) pilots,
  (select count(*) from public.brinesearch_driver_google_routes_public) public_google,
  public.brinesearch_issue97_cutover_active() cutover,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs) global_reconciliation;

\ir ../migrations/20260817144432_issue97_harrison_har_has_wrong_geometry_repair.sql

select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_id','c41f5320-1273-470c-a316-28b42211d697',true);
select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_digest','9763dc5bb626da71881b7381ed28a436',true);
select pg_catalog.set_config('brinesearch.issue97_expected_state_code','OH',true);
select pg_catalog.set_config('brinesearch.issue97_expected_generation_key','issue97-release-20260815-r2',true);
select pg_catalog.set_config('brinesearch.issue97_expected_member_count','19',true);
create temporary table tmp_issue97_harrison_cache_receipt on commit drop as
select private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
  'c41f5320-1273-470c-a316-28b42211d697','9763dc5bb626da71881b7381ed28a436','OH','issue97-release-20260815-r2',19
) receipt;
select pg_temp.issue97_assert((select receipt->>'release_current_count'='19' and receipt->>'source_scope_count'='38' from tmp_issue97_harrison_cache_receipt),
  'Issue #97 Harrison post-repair exact Ohio graph cache failed');

select private_verification.brinesearch_issue97_refresh_occurrence_candidate(step.id)
from public.brinesearch_route_prep_steps step
join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=step.route_prep_id
where step.active order by step.id;
select private_verification.brinesearch_issue97_resolve_route_identity_path(route_prep_id)
from tmp_issue97_harrison_frozen_routes order by route_prep_id;
select private_verification.brinesearch_issue97_refresh_transition_receipts(route_prep_id)
from tmp_issue97_harrison_frozen_routes order by route_prep_id;
select private_verification.brinesearch_issue97_refresh_route_geometry(route_prep_id)
from tmp_issue97_harrison_frozen_routes order by route_prep_id;
select private_verification.brinesearch_issue97_refresh_route_receipt(route_prep_id)
from tmp_issue97_harrison_frozen_routes order by route_prep_id;
select private_verification.brinesearch_issue97_refresh_google_route_transition_dark(route.pad_id)
from public.brinesearch_route_prep route
join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=route.id
join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt on receipt.route_prep_id=route.id
where route.active and route.route_group='primary' and receipt.stage='google_manifest'
order by route.pad_id;
select private_verification.brinesearch_issue97_refresh_route_receipt(route_prep_id)
from tmp_issue97_harrison_frozen_routes order by route_prep_id;

select pg_temp.issue97_assert(
  (select count(*) from public.brinesearch_roads road join tmp_issue97_harrison_bad_roads bad on bad.road_id=road.id where road.source_record_id like '%HAR%')=0
  and (select count(*) from public.brinesearch_road_identity_mappings mapping join tmp_issue97_harrison_target_identities target on target.identity_id=mapping.identity_id where mapping.mapping_status='verified')=7
  and not exists(select 1 from public.brinesearch_road_identity_mappings mapping where mapping.mapping_status='verified' and mapping.identity_id in ('dbcc9da8-07cb-f054-68ca-debe2f8640fc','40a0eda3-2dd3-6166-37cf-d4e1e1ac7040'))
  and exists(select 1 from public.brinesearch_roads where id='ed00b321-3e61-4e84-bbcb-7497a1ae4b90' and verification_status='needs_review' and candidate_only and centerline_geojson is null)
  and exists(select 1 from public.brinesearch_roads where id='1a1988a9-b0d5-4414-8abf-ebeda1ac1f32' and verification_status='needs_review' and candidate_only and centerline_geojson is null)
  and exists(select 1 from public.brinesearch_roads where id='c1eefe49-fe29-44fa-84b7-2cfe29180761' and source_record_id='THASTR00225**C|route:TR:225' and centerline_geojson=extensions.st_asgeojson(private_verification.brinesearch_issue97_authoritative_identity_geometry('dbcc9da8-07cb-f054-68ca-debe2f8640fc'),7)::jsonb),
  'Issue #97 Harrison road/mapping/quarantine postconditions failed'
);

select pg_temp.issue97_assert(
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(road)::text,'|' order by road.id),'')) from public.brinesearch_roads road where not exists(select 1 from tmp_issue97_harrison_bad_roads target where target.road_id=road.id))=(select non_target_roads from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(mapping)::text,'|' order by mapping.id),'')) from public.brinesearch_road_identity_mappings mapping)=(select mappings from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),'')) from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate join public.brinesearch_route_prep_steps step on step.id=candidate.route_prep_step_id where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=step.route_prep_id))=(select non_target_candidates from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id))=(select non_target_occurrences from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id))=(select non_target_routes from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id))=(select non_target_transitions from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt where not exists(select 1 from tmp_issue97_harrison_frozen_routes target where target.route_prep_id=receipt.route_prep_id))=(select non_target_geometry from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt where not exists(select 1 from public.brinesearch_route_prep route join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=route.id where route.pad_id=receipt.pad_id))=(select non_target_private_google from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(build)::text,'|' order by build.id),'')) from public.brinesearch_road_graph_builds build where build.id not in ('5ee5f97b-447f-41d3-946a-68a8b28d8367','542c35d5-a9ba-4b43-8a64-63a66f6b29e2'))=(select non_target_graphs from tmp_issue97_harrison_baseline)
  and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.legacy_id in ('ascent--cologie','ascent--bakos'))=(select pilots from tmp_issue97_harrison_baseline)
  and (select count(*) from public.brinesearch_driver_google_routes_public)=(select public_google from tmp_issue97_harrison_baseline)
  and public.brinesearch_issue97_cutover_active()=(select cutover from tmp_issue97_harrison_baseline)
  and (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)=(select global_reconciliation from tmp_issue97_harrison_baseline)
  and not exists(select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state='Ohio' and receipt.resolution_method in ('name_only','fuzzy_name','nearest_road','route_number_only')),
  'Issue #97 Harrison target lane changed non-target/protected state or introduced guessing'
);

select receipt.route_status,receipt.stage,receipt.exception_reasons,count(*) routes
from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
join tmp_issue97_harrison_frozen_routes target on target.route_prep_id=receipt.route_prep_id
group by 1,2,3 order by 1,2,3;

select id,county_code,details->>'mapping_snapshot_digest' mapping_snapshot_digest,
  private_verification.brinesearch_issue97_graph_build_release_current(id) release_current
from public.brinesearch_road_graph_builds
where id in ('5ee5f97b-447f-41d3-946a-68a8b28d8367','542c35d5-a9ba-4b43-8a64-63a66f6b29e2')
order by county_code;

rollback;
