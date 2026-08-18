-- GitHub #97 -- frozen post-Harrison Ohio exact canonical mapping wave.
--
-- This migration adopts only the 46 reviewed identity -> 37 Road Manager family
-- pairs below. Twenty-eight mappings are exact highway designations. Eighteen
-- are split identity components with an exact base NLF and exact source-backed
-- street-core lineage. Nothing is discovered by a county-wide refresh, optional
-- "Rd" normalization, fuzzy/name-only matching, or geometric proximity.
--
-- The eight affected active graph snapshots are immutable. Because the new
-- mappings populate 1,565 previously-null membership road IDs, a receipt-only
-- restamp is forbidden: exact dark rebuilds are required and are exercised by
-- the rollback regression. Route refresh remains separate and is not performed.
-- The executable downstream closure is the exact 412-route dual-leg manifest:
-- 379 direct mapping dependencies plus 33 transition-only dependencies from
-- the eight replaced active graph builds. The historical 379 digest is never
-- accepted as the final reconciliation set.

create temporary table tmp_issue97_frozen_mapping_targets(
  identity_id uuid primary key,
  road_id uuid not null,
  evidence_basis text not null check(evidence_basis in (
    'exact_route_designation','exact_base_nlf_source_street_core'
  )),
  expected_source_digest text not null,
  expected_road_row_md5 text not null
) on commit drop;

insert into tmp_issue97_frozen_mapping_targets values
('053d2de3-574b-1ea7-7960-b631a45da010','f11d1a84-da80-4ff1-ac4a-a5e74e8a6a37','exact_base_nlf_source_street_core','d2d88cba96dc5af1c867d22548b3a5cd','9984fa02a5dacde3a5de062393cc754d'),
('0e8d7841-6cfa-085d-ab39-ddabbc0fbfcc','cf05fdb2-fcdf-4f63-bd6b-73a4d11e2eac','exact_route_designation','4aeb7ec0dd406869717aba6a37e1698e','8a971b8da9a164aec3119481e7988734'),
('0f0e881e-3280-9c5c-fa13-a8e019d238cf','e222f21a-a552-4f7b-a0a0-85ed7d847613','exact_base_nlf_source_street_core','8440a7bd9477fd9b569748a31d419f59','553a7cb9f32d73b121e1a6dacb70a60d'),
('137b9f2a-bf22-4ed5-465f-f56e078b5666','c19792f3-aeb4-423c-8c65-70f16266f9bd','exact_base_nlf_source_street_core','37248fcfe7dd1fd8758a380ffa374474','5d990b4cbeb081a7f241c9e99df0cfb2'),
('13fe0da8-ba4e-ba64-250b-98789544f9fd','3deab4c8-2a90-4579-bcb6-373cef11a0ce','exact_route_designation','b532fc3781fabb1f1b77f97788549867','eff1b0a667d2ada6a7d29e75016e4296'),
('2bf03464-eb0e-d84d-f559-1146612d3635','3582c931-137f-47b8-9ae9-334e88569676','exact_route_designation','e95ce226cbd25baa0cb2d4a79e0b5322','3fcbf9b71e32f94182582d98a4e3b5c9'),
('2ce6037e-df5c-8ec6-f6c4-971cdbaff958','762d7cae-f511-41f6-aa30-153b2292ad07','exact_route_designation','95ae0346f61382ba764bb95df6f52bbc','1544dfb57376ab523661c03dfa3a89e7'),
('2dab3b9a-45d9-0c43-9109-b49e46979287','e3002b89-2e29-4dd8-b9ec-20cfdf51ebe0','exact_base_nlf_source_street_core','eab5f8bfcea8ae017bf2e6ce9cd19c07','94e5c6757a7dd6b44c7b9777c1887b7c'),
('36386818-82ec-10ca-71e8-58e1727504c7','ee656517-2a97-4a7f-8277-6b18e36a416d','exact_route_designation','a945b1f491353a7729fa669bd53718b8','cf9092bb8a98ee94895ccdfa191e4e8d'),
('43c9d8dd-716f-a1ab-505c-11df9cd2d399','8d047662-daba-48ef-a95e-b28c30e3e564','exact_route_designation','7ec826c6c902f96312a222189ba75d4e','0eb19350dd4acf4b46e3d8aa4c05e4a2'),
('48b2a7b6-23d4-1e65-a201-e3d2672bf58e','77bf1737-51e7-46b6-887c-87305375a99d','exact_route_designation','5bf48929e2fc06e3adb5d24e631b47bb','6ae25199b67d156e59172ef4b47c4d0a'),
('4975721e-acd6-5bfb-0f5e-fa1643455bd3','9182abf5-4a8c-4532-b6d1-02b72b45a5dc','exact_base_nlf_source_street_core','7cf6dd741e61e9d4a83e7c1c87cd2bee','d93b57ba0626a635d4c7a57fb60a874d'),
('4da5dd58-d472-7f65-dc11-44a1bea94c23','f391149c-10c2-4c87-99e1-346ee425c1b5','exact_route_designation','e6c70dd538995dc13edda50e2b62333d','3a662c64ab2dd077e1899deb7515519f'),
('4fba3fe7-6679-9c39-996c-d0bd7ba8c7a1','7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c','exact_route_designation','68aa8bcd0e638c8580faf45fb958a334','b8815a7df5c96b16551da379402ce535'),
('56abd74c-6015-084b-6b07-b6b5f4cc4365','3c1f5a69-a15d-46ed-8c07-74b8d9285009','exact_base_nlf_source_street_core','fbb32808d5d3880cbd8e2a9c59c8004b','58a6307ecaa462054c259c899014a87d'),
('5aaf55fa-b1bd-ecd7-7ec3-c158fe8db7a9','7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c','exact_route_designation','45cd005e39cf7d5ecfc56ac19d9ca44e','b8815a7df5c96b16551da379402ce535'),
('5d76d39f-5d4f-967b-8652-295eefa2ac73','7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c','exact_route_designation','be3afb54f92100be38abf48be6a89960','b8815a7df5c96b16551da379402ce535'),
('5f0233b7-bb01-49bb-12d6-2ac2006191f2','0a96a8b7-e9f6-4607-8d09-20cd3793ff8d','exact_route_designation','c8fffe60b1251e25877ee378b80487b3','ef82906840f2fc27ed5978689c3b9977'),
('6a726504-2f18-7366-9c33-642676763dfe','5ae10d76-e896-40bb-aecf-8d23f512e195','exact_route_designation','f3e07036d63678f76dd762240d995e3b','3bcea4e21194a9831b5dc862480b8d87'),
('77db8dda-8652-2a79-e464-9412c2aa419a','28a61175-d4c0-42e5-9644-b1a85160b83d','exact_base_nlf_source_street_core','10d705274accb707b9023eef06ea3f60','b6c38ca8ea7c1fd9394d0b5e4d5a4869'),
('7bec2b36-7155-aaa2-6198-8dafe49bbc14','4c95c2cf-dc31-469e-b717-a0b03e8abc54','exact_route_designation','8c1657f6b2f8134cb2bf1c6e349721a8','a6fafc2994fc13b437c5f5d30eb0d96e'),
('87552b33-5cdb-feb2-a616-d12a6a04ec37','f73b1bc0-5aed-45c1-a88c-7c1f769f52b9','exact_base_nlf_source_street_core','6f1bd18cd5ab8af2988bbcf27ce72ff8','61d6696f9bbd7516965fd6ce0d4b0547'),
('88c8f26f-e848-7877-927e-d3af46068714','e3002b89-2e29-4dd8-b9ec-20cfdf51ebe0','exact_base_nlf_source_street_core','03258ae5ef8fd74c6829bc8c26728d08','94e5c6757a7dd6b44c7b9777c1887b7c'),
('897c8d12-af5b-14c0-22bd-355449abca24','40d2fcd0-8205-44dc-a4de-a650d46ad890','exact_route_designation','9d5ae15d45deff0e6b6cb61b9cc4d419','afeedb681a470f0d087b1622351a1e83'),
('8f990142-8e63-8168-f20a-13bb897c0f67','9182abf5-4a8c-4532-b6d1-02b72b45a5dc','exact_base_nlf_source_street_core','99c4713c4c99b0fafc58762411ed1d3c','d93b57ba0626a635d4c7a57fb60a874d'),
('911fa41e-30a2-35ae-da0d-6f22e7e1a0b3','5ae10d76-e896-40bb-aecf-8d23f512e195','exact_route_designation','f5a8478a5ddcfc66102e5beed7c91c41','3bcea4e21194a9831b5dc862480b8d87'),
('928b3dca-62a7-117c-da5c-04e0faf9a9c0','5e165578-f56a-45bc-b87a-bc781b2aa212','exact_base_nlf_source_street_core','f6271282137dc44e103f688037825f1c','3f40b83148813da7ecb76b7c47b63ebe'),
('9378b0d8-9365-2a37-160b-2a36b2bac3a1','102d9976-3801-42dc-a716-ee1540364f8f','exact_route_designation','8a2ac3cf41da23f8ea00a5e3adbdb133','8e40160c3b59a48ba42213002c0a637a'),
('93a43bd7-ea7a-92ea-af5e-4c5e7a7fb4ad','032e69fc-afdf-49ed-821a-f0921cefeef6','exact_route_designation','009e5fa78d9c56c7771771ff061e5942','0c5cd3274da1486fd5d58336134127fb'),
('990d4aa2-acc5-5e0d-b408-cb0341d7fd47','a6c093cf-cce2-445d-9abe-6bbe05e463ca','exact_route_designation','b2e05eab4d4ae9b3ef9fb3e73fb9e27b','38ca61deec59af554a9176ebc2d893ee'),
('99898ae8-b80a-06d3-71c3-7d3901867bcd','9b980c79-5542-4b60-a9f9-c4639ddc2cc2','exact_route_designation','d1c7fe6571d0a3e799c4b46355797d5f','7531a649f70d44afbb43682c30a51cbe'),
('ac603172-d737-97d2-b668-714c2e5c8471','6a19cd16-4aec-491e-aaa0-414da1c1fa93','exact_base_nlf_source_street_core','4c178393a3a5fbe1b52962fa231cdd99','8a339fdda75fc62a84ed40c9f3b2ddab'),
('b4305a0c-3efe-3a59-d6b1-34d6c71113ab','4da76655-fe6f-4c10-9f03-5510056a0580','exact_base_nlf_source_street_core','749e51406b929486902ec13f9ad5c7eb','b0c3ce9ef890c3099f9b9ad943770203'),
('bb4e819c-5055-eb5d-1cb0-4d2f1a1be32f','89023472-5bbd-4bf9-b9a4-27d09e7856c9','exact_route_designation','b9921b74fab8fb4dbec0e5f01a940d34','900d9280d1ce3d2eb7b14ad71e6be877'),
('bd4624be-178e-328d-9f9e-462d6066532e','d7a42c92-9a77-49e0-8792-cd634242272e','exact_route_designation','3f0c74e3a3019f5ce019ab0720f6e8d6','bee94671e732ec3b2e5297e8d3ae19a5'),
('c7856355-4ac4-70e0-6ecf-c19b5adb05fb','0a8a8721-4d20-41bf-8d95-ec069173e584','exact_route_designation','42a4328a8509aadd129f2d59e2b64bbd','d2fd15d36e0e9d9640cbeddd90c4b1ec'),
('daae38bd-8f05-53bd-4591-08d6b4d98cac','e222f21a-a552-4f7b-a0a0-85ed7d847613','exact_base_nlf_source_street_core','a517d62af4f22dbd2bf36e44014cf99c','553a7cb9f32d73b121e1a6dacb70a60d'),
('dcaded36-db29-a903-afbd-c2f7129482de','c2d244a5-db55-4d9b-8db7-aa28c226dec9','exact_route_designation','54e63c80553fde269fc80590692f39ff','8a119c91eb8f50a4c6f1742806282f57'),
('dee50426-696d-223b-3dc1-604900e34c2d','28a61175-d4c0-42e5-9644-b1a85160b83d','exact_base_nlf_source_street_core','97614aa3ca4a81d754f74e6a1a426927','b6c38ca8ea7c1fd9394d0b5e4d5a4869'),
('e10108e7-e960-ea53-0b9f-b2485d8089c3','3c1f5a69-a15d-46ed-8c07-74b8d9285009','exact_base_nlf_source_street_core','6a3251f8dae3629f90710750d2d25f6e','58a6307ecaa462054c259c899014a87d'),
('e7190d69-d5b9-acf1-ae2f-16edd31b051f','79d3dfe9-b6c5-4351-88fd-1a9ffd957137','exact_route_designation','dac31b053ea3c001f02d8b44b6fb33c8','c9e803530d71e199b3e75c600533bcc7'),
('ec6fa355-2b2d-8a16-6682-397e9df948a5','c2d244a5-db55-4d9b-8db7-aa28c226dec9','exact_route_designation','9113021f84dd70de5fbe5b0c08cf9371','8a119c91eb8f50a4c6f1742806282f57'),
('f3ff07ad-4156-3c02-3fcb-6b57617d1e44','154688cf-a3d1-4c2f-bf9c-65b15ab424a4','exact_route_designation','e6692209277953bba7b61cfc864af0ad','77f2ae79f9b07a306701e0ce9d3e47d3'),
('f7feb34a-eb0e-0073-3e56-ecd6141db2df','07751d4e-b2cc-4749-873e-cc3dcbdf921c','exact_base_nlf_source_street_core','1988de7c60eef5bf9f62d0e5b0c4b579','1684f09844c4f20e7ea8a9bcff752749'),
('f80b4b21-06b0-b774-1ab7-402acfe3c2b9','f4cc321a-7010-4f44-a469-c49ca9c32241','exact_route_designation','d44ab9257f670b09c0dd2d65a51f8a88','59a42d782dcf97fc154bdbf6b9f6b2c4'),
('fb216029-dd42-ec15-192f-9192823a0601','a80366a3-06e0-4a0a-970d-7df6c2b7a205','exact_base_nlf_source_street_core','a5eab1a32bba2caa2b0f0e0d6fcdbda3','a6931700b1640e47cb8868eebde3630a');

select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:ohio-state-release'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation'));
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('brinesearch:issue97:mapping-refresh'));

do $issue97_frozen_mapping_locks$
declare v_scope record; v_count integer;
begin
  for v_scope in select dataset_id,state_code,county_code
    from public.brinesearch_road_source_dataset_counties
    where active and ingest_enabled
    order by dataset_id,state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||v_scope.dataset_id::text||':'||v_scope.county_code
    ));
  end loop;
  for v_scope in select unnest(array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']) county_code loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:OH:'||v_scope.county_code
    ));
  end loop;
  perform identity.id from public.brinesearch_authoritative_road_identities identity
    join tmp_issue97_frozen_mapping_targets target on target.identity_id=identity.id
    order by identity.id for update of identity;
  get diagnostics v_count=row_count;
  if v_count<>46 then raise exception 'Issue #97 frozen mapping identity lock count drifted: %',v_count; end if;
  perform road.id from public.brinesearch_roads road
    join (select distinct road_id from tmp_issue97_frozen_mapping_targets) target on target.road_id=road.id
    order by road.id for update of road;
  get diagnostics v_count=row_count;
  if v_count<>37 then raise exception 'Issue #97 frozen mapping road lock count drifted: %',v_count; end if;
end
$issue97_frozen_mapping_locks$;

create temporary table tmp_issue97_frozen_mapping_graph_before on commit drop as
select build.*,
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
where build.id=any(array[
  '24ffa531-0e69-4625-a137-da52020e6fd0','5ee5f97b-447f-41d3-946a-68a8b28d8367',
  'c9f50b03-4328-4d8b-9995-4dc8bc85dd01','84568854-3257-46b7-8581-374dc620ef16',
  '542c35d5-a9ba-4b43-8a64-63a66f6b29e2','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4',
  'ab9f4083-d572-4d9d-8e0a-28ebb77517e7','70f30495-860a-4199-9360-8e880f3b515b'
]::uuid[]);

-- Freeze the exact Google invalidation dependency set before either the
-- canonical-road updates or mapping inserts can replace a current manifest
-- with its fail-closed stale stub. These are the two paths used by the live
-- road/mapping invalidation trigger: saved pad-road dependencies and existing
-- private-manifest identity/road points.
create temporary table tmp_issue97_frozen_mapping_expected_google_pads on commit drop as
with path_a as (
  select distinct step.pad_id
  from public.brinesearch_pad_roads step
  join (select distinct road_id from tmp_issue97_frozen_mapping_targets) target
    on target.road_id=step.road_id
), path_b as (
  select distinct receipt.pad_id
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  where exists(
    select 1
    from pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb)) point
    join tmp_issue97_frozen_mapping_targets target
      on point->>'identity_id'=target.identity_id::text
      or point->>'road_id'=target.road_id::text
  )
), expected as (
  select pad_id from path_a
  union
  select pad_id from path_b
)
select expected.pad_id,
  exists(select 1 from path_a where path_a.pad_id=expected.pad_id) path_a_hit,
  exists(select 1 from path_b where path_b.pad_id=expected.pad_id) path_b_hit,
  pg_catalog.to_jsonb(receipt) pre_receipt_row,
  receipt.route_revision pre_receipt_route_revision,
  pad.brinesearch_google_route_status_issue97 pre_pad_google_status,
  pad.brinesearch_google_route_revision_issue97 pre_pad_google_revision,
  pad.structured_route_revision,
  pad.road_sequence_status,
  pg_catalog.to_jsonb(queue) pre_queue_row,
  exists(
    select 1 from public.brinesearch_pad_roads step
    join tmp_issue97_frozen_mapping_targets target on target.road_id=step.road_id
    where step.pad_id=expected.pad_id
      and target.evidence_basis='exact_route_designation'
  ) road_update_hit,
  case when exists(
      select 1 from public.brinesearch_pad_roads step
      join tmp_issue97_frozen_mapping_targets target on target.road_id=step.road_id
      where step.pad_id=expected.pad_id
        and target.evidence_basis='exact_route_designation'
    ) then greatest(coalesce(pad.structured_route_revision,0),0)
    else greatest(coalesce(receipt.route_revision,0),0)
  end expected_route_revision
from expected
join public.pads pad on pad.id=expected.pad_id
left join private_verification.brinesearch_google_route_receipts_issue97 receipt
  on receipt.pad_id=expected.pad_id
left join private_verification.brinesearch_google_route_refresh_queue_issue97 queue
  on queue.pad_id=expected.pad_id
order by expected.pad_id;

create temporary table tmp_issue97_frozen_mapping_protected_before on commit drop as
select
  (select count(*) from public.brinesearch_roads) road_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(road)::text,'|' order by road.id),''))
    from public.brinesearch_roads road where not exists(
      select 1 from tmp_issue97_frozen_mapping_targets target where target.road_id=road.id
    )) non_target_roads,
  (select count(*) from public.brinesearch_road_identity_mappings) mapping_count,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(mapping)::text,'|' order by mapping.id),''))
    from public.brinesearch_road_identity_mappings mapping) mappings,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),''))
    from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate) candidates,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt) occurrences,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),''))
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt) routes,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),''))
    from private_verification.brinesearch_route_transition_receipts_issue97 receipt) transitions,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),''))
    from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt) geometry,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
      where expected.pad_id=receipt.pad_id)) non_target_private_google,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
      'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
      'revision',pad.brinesearch_google_route_revision_issue97
    )::text,'|' order by pad.id),''))
    from public.pads pad
    where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
      where expected.pad_id=pad.id)) non_target_pad_google,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(queue)::text,'|' order by queue.pad_id),''))
    from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
    where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
      where expected.pad_id=queue.pad_id)) non_target_google_queue,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id),''))
    from public.brinesearch_driver_google_routes_public route) public_google,
  (select pg_catalog.md5(pg_catalog.to_jsonb(state)::text) from public.brinesearch_issue97_release_state state where singleton) release_state,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(scope)::text,'|' order by scope.dataset_id,scope.state_code,scope.county_code),''))
    from public.brinesearch_road_source_dataset_counties scope where state_code='OH') ohio_sources,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(build)::text,'|' order by build.id),''))
    from public.brinesearch_road_graph_builds build where not exists(
      select 1 from tmp_issue97_frozen_mapping_graph_before affected where affected.id=build.id
    )) non_target_builds,
  (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs) global_reconciliation;

create temporary table tmp_issue97_frozen_mapping_route_closure on commit drop as
with leg_a as (
  select distinct route.id route_prep_id
  from public.brinesearch_route_prep route
  where route.active and route.route_group in ('primary','alternate') and (
    exists(select 1 from public.brinesearch_route_prep_steps step
      join (select distinct road_id from tmp_issue97_frozen_mapping_targets) target
        on target.road_id=step.road_id
      where step.route_prep_id=route.id and step.active)
    or exists(select 1 from public.brinesearch_route_prep_steps step
      join private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
        on candidate.route_prep_step_id=step.id
      join tmp_issue97_frozen_mapping_targets target on target.identity_id=candidate.identity_id
      where step.route_prep_id=route.id and step.active)
    or exists(select 1
      from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      join tmp_issue97_frozen_mapping_targets target on target.identity_id=receipt.identity_id
      where receipt.route_prep_id=route.id)
  )
), leg_b as (
  select distinct route.id route_prep_id
  from public.brinesearch_route_prep route
  join private_verification.brinesearch_route_transition_receipts_issue97 transition
    on transition.route_prep_id=route.id
  where route.active and route.route_group in ('primary','alternate')
    and transition.graph_build_id=any(array[
      '24ffa531-0e69-4625-a137-da52020e6fd0','5ee5f97b-447f-41d3-946a-68a8b28d8367',
      'c9f50b03-4328-4d8b-9995-4dc8bc85dd01','84568854-3257-46b7-8581-374dc620ef16',
      '542c35d5-a9ba-4b43-8a64-63a66f6b29e2','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4',
      'ab9f4083-d572-4d9d-8e0a-28ebb77517e7','70f30495-860a-4199-9360-8e880f3b515b'
    ]::uuid[])
), unioned as (
  select route_prep_id from leg_a union select route_prep_id from leg_b
)
select route.id route_prep_id,route.route_group,
  exists(select 1 from leg_a where leg_a.route_prep_id=route.id) mapping_dependent,
  exists(select 1 from leg_b where leg_b.route_prep_id=route.id) transition_dependent
from public.brinesearch_route_prep route
join unioned on unioned.route_prep_id=route.id;

do $issue97_frozen_exact_mapping_wave$
declare
  v_road record;
  v_geom extensions.geometry;
begin
  if (select count(*) from tmp_issue97_frozen_mapping_expected_google_pads)<>3
     or (select pg_catalog.md5(pg_catalog.string_agg(pad_id::text,'|' order by pad_id))
         from tmp_issue97_frozen_mapping_expected_google_pads)
       <>'5cd68da6e31fa7bf5b59bca9935f96f2'
  then
    raise exception 'Issue #97 frozen mapping wave Google invalidation pad set drifted';
  end if;

  if exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
       where expected.structured_route_revision<>0
         or expected.road_sequence_status is not distinct from 'owner_verified'
         or expected.pre_queue_row is not null)
     or exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
  then
    raise exception 'Issue #97 frozen mapping wave Google invalidation prestate drifted';
  end if;

  if (select count(*) from tmp_issue97_frozen_mapping_targets)<>46
     or (select count(distinct road_id) from tmp_issue97_frozen_mapping_targets)<>37
     or (select count(*) from tmp_issue97_frozen_mapping_targets where evidence_basis='exact_route_designation')<>28
     or (select count(*) from tmp_issue97_frozen_mapping_targets where evidence_basis='exact_base_nlf_source_street_core')<>18
     or (select pg_catalog.md5(pg_catalog.string_agg(identity_id::text,'|' order by identity_id)) from tmp_issue97_frozen_mapping_targets)<>'492ff9967d8a822d10c8d5003cd018a6'
     or (select pg_catalog.md5(pg_catalog.string_agg(road_id::text,'|' order by road_id)) from (select distinct road_id from tmp_issue97_frozen_mapping_targets) roads)<>'e512c45fa202ccf48df1ac272246ce94'
     or (select pg_catalog.md5(pg_catalog.string_agg(identity_id::text||':'||road_id::text,'|' order by identity_id)) from tmp_issue97_frozen_mapping_targets)<>'0a0f29f2c40f1d1265b498f77ab56dd7'
  then
    raise exception 'Issue #97 frozen 46-identity/37-road allowlist drifted';
  end if;

  if (select count(*) from tmp_issue97_frozen_mapping_graph_before)<>8
     or (select count(*) from (values
       ('24ffa531-0e69-4625-a137-da52020e6fd0'::uuid,'BEL','81355d7958b89ffccd08a5f521730f8e','fc6dcbc8482b2e5c89f4069941c557de','d7565e078c0dda3d248555600522649b',5687,3001,4878,112,9912),
       ('5ee5f97b-447f-41d3-946a-68a8b28d8367','CAR','853c139290afee94e391fc0395d40fed','e9f4ed56bb2b1308b8b9913a751c78f5','e50ef5799abf04d16c2ecb79d4db0651',2640,1553,2522,90,5251),
       ('c9f50b03-4328-4d8b-9995-4dc8bc85dd01','COL','7f54d4a6e143c4006cb90b4b4fa0b67e','c13278c74933205f5c55cdf85f23f27e','2d0b4ff159b673d214e3661feecd9088',5754,3006,5091,126,10812),
       ('84568854-3257-46b7-8581-374dc620ef16','GUE','b2bee82327b4ce24833fee33c4873238','b11b2f5ac3c1c5d492c2233494706f4c','30c17bd7c09c6093cfc3dc35a9adc5f8',3648,2079,2995,101,6433),
       ('542c35d5-a9ba-4b43-8a64-63a66f6b29e2','HAS','610d4d5fe3a19cd1d07e9fc3049b2785','1d8f6a52d2541e313932906f944b2f92','7d0561a0f32e7432880d4ad39e5e7109',2336,1013,1746,57,3550),
       ('cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4','JEF','03efea8f142bb29e5f27cb12bf84c49f','06e8bd25f7fb46fe750214dd77e2b67d','1b43430facf325e7ae1840f593f6e1ce',4135,2187,3498,69,7116),
       ('ab9f4083-d572-4d9d-8e0a-28ebb77517e7','MOE','0921c5ea8751f20f079ba1a776bc7c1e','69010044273a611876c3a8ace7c198a2','7d794bd9b703b10c9579f97a325bb23a',2264,1250,1715,32,3504),
       ('70f30495-860a-4199-9360-8e880f3b515b','NOB','89af7128d56bbc4ef3733436d0813823','eefc679ed36e6aba3a590c7ba2c9e541','ee7692fde47360caa2203b3436ca099b',1959,1030,1381,40,2841)
     ) expected(id,county_code,source_revision_digest,graph_digest,mapping_digest,source_count,identity_count,point_count,shared_count,membership_count)
     join tmp_issue97_frozen_mapping_graph_before build on build.id=expected.id
       and build.state_code='OH' and build.county_code=expected.county_code and build.status='active'
       and build.source_revision_digest=expected.source_revision_digest and build.graph_digest=expected.graph_digest
       and build.details->>'mapping_snapshot_digest'=expected.mapping_digest
       and build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2'
       and build.source_segment_count=expected.source_count and build.identity_count=expected.identity_count
       and build.point_junction_count=expected.point_count and build.shared_segment_count=expected.shared_count
       and build.membership_count=expected.membership_count
       and build.activated_at='2026-08-16 11:08:18.355674+00'::timestamptz)<>8
  then
    raise exception 'Issue #97 frozen eight-build prestate pins drifted';
  end if;

  if (select count(*) from public.brinesearch_authoritative_road_identities identity
      join tmp_issue97_frozen_mapping_targets target on target.identity_id=identity.id
      join public.brinesearch_roads road on road.id=target.road_id
      where identity.active and identity.state_code='OH'
        and identity.public_access_status='public' and identity.drivable_status='drivable'
        and identity.source_digest=target.expected_source_digest
        and pg_catalog.md5(pg_catalog.to_jsonb(road)::text)=target.expected_road_row_md5
        and private_verification.brinesearch_issue97_dataset_scope_current(
          identity.dataset_id,identity.state_code,identity.county_code
        ))<>46
     or exists(select 1 from public.brinesearch_road_identity_mappings mapping
       join tmp_issue97_frozen_mapping_targets target on target.identity_id=mapping.identity_id)
     or exists(select 1 from public.brinesearch_road_identity_mappings mapping
       join (select distinct road_id from tmp_issue97_frozen_mapping_targets) target
         on target.road_id=mapping.road_id)
     or exists(select 1 from public.brinesearch_road_identity_mappings mapping
       join tmp_issue97_frozen_mapping_targets target
         on mapping.id=private_verification.brinesearch_issue97_uuid(
           'identity-mapping:'||target.identity_id::text||':'||target.road_id::text
         ))
  then
    raise exception 'Issue #97 frozen identity/source/road prestate or empty mapping contract drifted';
  end if;

  if exists(
    select 1 from tmp_issue97_frozen_mapping_targets target
    join public.brinesearch_authoritative_road_identities identity on identity.id=target.identity_id
    join public.brinesearch_roads road on road.id=target.road_id
    where target.evidence_basis='exact_route_designation' and (
      identity.road_class not in ('state_route','us_route')
      or road.road_type<>identity.road_class or road.route_number<>identity.route_number
      or (identity.road_class='state_route' and road.state<>'OH')
      or (identity.road_class='us_route' and road.state is not null)
      or road.verification_status<>'needs_review' or road.candidate_only
      or road.geometry_status<>'not_loaded' or road.source_record_id is not null
    )
  ) then
    raise exception 'Issue #97 exact highway designation evidence changed';
  end if;

  if exists(
    select 1 from tmp_issue97_frozen_mapping_targets target
    join public.brinesearch_authoritative_road_identities identity on identity.id=target.identity_id
    join public.brinesearch_roads road on road.id=target.road_id
    join public.brinesearch_road_graph_counties county on county.state_code='OH'
      and county.county_code=identity.county_code and county.active
    where target.evidence_basis='exact_base_nlf_source_street_core' and (
      road.verification_status<>'verified' or road.candidate_only
      or road.geometry_status<>'official_centerline_loaded'
      or road.state<>'OH' or road.county<>county.county_name
      or road.road_type<>identity.road_class or road.route_number is distinct from identity.route_number
      or pg_catalog.split_part(road.source_record_id,'|',1)<>identity.attributes->>'nlf_id'
      or pg_catalog.strpos(road.source_record_id,'|street:')=0
      or identity.source_identity_key not like 'OH:ODOT:NLF:'||(identity.attributes->>'nlf_id')||':COMP:%'
      or not exists(select 1 from public.brinesearch_odot_road_catalog source
        where source.nlf_id=identity.attributes->>'nlf_id'
          and source.street_match_key=pg_catalog.split_part(road.source_record_id,'|street:',2))
    )
  ) then
    raise exception 'Issue #97 exact base-NLF/source-backed street-core evidence changed';
  end if;

  if (select pg_catalog.array_agg(distinct build.county_code order by build.county_code)
      from public.brinesearch_road_junction_memberships membership
      join tmp_issue97_frozen_mapping_targets target on target.identity_id=membership.identity_id
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
      join public.brinesearch_road_graph_builds build on build.id=junction.build_id
      where build.state_code='OH' and build.status='active') is distinct from
       array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]
  then
    raise exception 'Issue #97 exact target active graph footprint drifted';
  end if;

  if (select count(*) from tmp_issue97_frozen_mapping_route_closure where mapping_dependent)<>379
     or (select count(*) from tmp_issue97_frozen_mapping_route_closure
          where transition_dependent and not mapping_dependent)<>33
     or (select count(*) from tmp_issue97_frozen_mapping_route_closure)<>412
     or (select count(*) from tmp_issue97_frozen_mapping_route_closure
          where route_group='primary')<>340
     or (select count(*) from tmp_issue97_frozen_mapping_route_closure
          where route_group='alternate')<>72
     or (select pg_catalog.md5(pg_catalog.string_agg(route_prep_id::text,'|' order by route_prep_id))
          from tmp_issue97_frozen_mapping_route_closure where mapping_dependent)
        <>'836c1f57210e4d18c0f60d4c1ea77d7d'
     or (select pg_catalog.md5(pg_catalog.string_agg(route_prep_id::text,'|' order by route_prep_id))
          from tmp_issue97_frozen_mapping_route_closure)
        <>'711b1ddd3ba6c47e7642fc700197432f'
     or not exists(select 1 from tmp_issue97_frozen_mapping_route_closure
          where route_prep_id='86d86ac5-199c-4715-be36-785a13c1cf30')
     or not exists(select 1 from tmp_issue97_frozen_mapping_route_closure
          where route_prep_id='dfb3f204-190c-4d65-85b3-16bcd1715825')
     or not exists(select 1 from tmp_issue97_frozen_mapping_route_closure
          where route_prep_id='f03e1196-9843-4a62-af08-b4c7eb681e38')
  then
    raise exception 'Issue #97 exact 412-route dual-leg closure drifted';
  end if;

  -- Adopt only the 24 exact highway family rows represented by the allowlist.
  for v_road in
    select target.road_id,min(target.expected_road_row_md5) expected_road_row_md5
    from tmp_issue97_frozen_mapping_targets target
    where target.evidence_basis='exact_route_designation'
    group by target.road_id order by target.road_id
  loop
    select extensions.st_collectionextract(extensions.st_unaryunion(extensions.st_collect(
      private_verification.brinesearch_issue97_authoritative_identity_geometry(target.identity_id)
    )),2) into v_geom
    from tmp_issue97_frozen_mapping_targets target where target.road_id=v_road.road_id;
    if v_geom is null or extensions.st_isempty(v_geom) or extensions.st_dimension(v_geom)<>1
       or not extensions.st_isvalid(v_geom) then
      raise exception 'Issue #97 exact frozen highway geometry invalid for road %',v_road.road_id;
    end if;
    update public.brinesearch_roads road set
      verification_status='verified',verified_at=now(),
      source_agency='Ohio Department of Transportation',source_dataset='Road Inventory',
      source_method='issue97_frozen_exact_mapping_wave',
      source_url='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
      centerline_geojson=extensions.st_asgeojson(v_geom,7)::jsonb,
      geometry_status='official_centerline_loaded',geometry_checked_at=now(),
      approved_by_default=true,candidate_only=false,
      candidate_basis=coalesce(road.candidate_basis,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'issue',97,'adoption','frozen_exact_mapping_wave',
        'identity_ids',(select pg_catalog.jsonb_agg(target.identity_id order by target.identity_id)
          from tmp_issue97_frozen_mapping_targets target where target.road_id=v_road.road_id),
        'identity_set_digest',(select pg_catalog.md5(pg_catalog.string_agg(target.identity_id::text,'|' order by target.identity_id))
          from tmp_issue97_frozen_mapping_targets target where target.road_id=v_road.road_id),
        'name_matching_used',false,'fuzzy_matching_used',false,'nearest_road_used',false
      ),updated_at=now()
    where road.id=v_road.road_id
      and pg_catalog.md5(pg_catalog.to_jsonb(road)::text)=v_road.expected_road_row_md5;
    if not found then raise exception 'Issue #97 frozen highway road prestate changed: %',v_road.road_id; end if;
  end loop;

  insert into public.brinesearch_road_identity_mappings(
    id,identity_id,road_id,mapping_status,mapping_method,evidence,verified_at,created_at,updated_at
  )
  select private_verification.brinesearch_issue97_uuid(
      'identity-mapping:'||target.identity_id::text||':'||target.road_id::text
    ),target.identity_id,target.road_id,'verified',
    case target.evidence_basis when 'exact_route_designation' then 'exact_route_designation'
      else 'exact_source_record_id' end,
    pg_catalog.jsonb_build_object(
      'issue',97,'scope','frozen-46','state_code','OH',
      'evidence_basis',target.evidence_basis,'identity_id',target.identity_id,
      'road_id',target.road_id,'source_identity_key',identity.source_identity_key,
      'source_digest',identity.source_digest,'source_current',true,
      'exact_designation',target.evidence_basis='exact_route_designation',
      'exact_base_nlf_source_street_core',target.evidence_basis='exact_base_nlf_source_street_core',
      'name_matching_used',false,'fuzzy_matching_used',false,'nearest_road_used',false,
      'migration','issue97_frozen_exact_mapping_wave'
    ),now(),now(),now()
  from tmp_issue97_frozen_mapping_targets target
  join public.brinesearch_authoritative_road_identities identity on identity.id=target.identity_id;

  if (select count(*) from public.brinesearch_road_identity_mappings mapping
      join tmp_issue97_frozen_mapping_targets target on target.identity_id=mapping.identity_id
        and target.road_id=mapping.road_id
      where mapping.mapping_status='verified'
        and mapping.mapping_method=case target.evidence_basis when 'exact_route_designation'
          then 'exact_route_designation' else 'exact_source_record_id' end
        and mapping.evidence->>'migration'='issue97_frozen_exact_mapping_wave')<>46
  then
    raise exception 'Issue #97 exact frozen 46 mapping insert failed';
  end if;

  -- These are newly verified mappings. The active snapshots captured all 1,565
  -- affected memberships as unmapped (road_id NULL). A metadata restamp would
  -- hide a real graph-child semantic delta, so the migration must leave every
  -- active graph byte-for-byte unchanged and require a reviewed eight-county
  -- rebuild lane.
  if (select count(*) from public.brinesearch_road_junction_memberships membership
      join tmp_issue97_frozen_mapping_targets target on target.identity_id=membership.identity_id
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
      join tmp_issue97_frozen_mapping_graph_before build on build.id=junction.build_id)<>1565
     or exists(select 1 from public.brinesearch_road_junction_memberships membership
       join tmp_issue97_frozen_mapping_targets target on target.identity_id=membership.identity_id
       join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
       join tmp_issue97_frozen_mapping_graph_before build on build.id=junction.build_id
       where membership.road_id is not null)
  then
    raise exception 'Issue #97 frozen mappings no longer require the exact reviewed graph-child rebuild';
  end if;

  if exists(select 1 from tmp_issue97_frozen_mapping_graph_before before
    join public.brinesearch_road_graph_builds build on build.id=before.id
    where pg_catalog.to_jsonb(build) is distinct from
      pg_catalog.to_jsonb(before)-'junction_digest'-'membership_digest'-'anchor_digest'
      or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(junction)::text,'|' order by junction.id),''))
          from public.brinesearch_road_junctions junction where junction.build_id=build.id)<>before.junction_digest
      or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(membership)::text,'|' order by membership.id),''))
          from public.brinesearch_road_junction_memberships membership
          join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
          where junction.build_id=build.id)<>before.membership_digest
      or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(anchor)::text,'|' order by anchor.id),''))
          from public.brinesearch_road_junction_anchors anchor
          join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id
          where junction.build_id=build.id)<>before.anchor_digest)
  then
    raise exception 'Issue #97 mapping migration changed an active graph/build child';
  end if;

  -- The old eight builds may remain status=active only as quarantined physical
  -- snapshots. Mapping semantics changed, so none may be treated release-current
  -- until a real replacement build is produced and separately pinned by exact
  -- new build ID + graph digest. Receipt-only restamping is forbidden.
  if exists(select 1 from tmp_issue97_frozen_mapping_graph_before old_build
    where private_verification.brinesearch_issue97_graph_build_release_current(old_build.id))
  then
    raise exception 'Issue #97 old affected graph escaped the mapping-currentness quarantine';
  end if;

  if (select count(*) from public.brinesearch_roads)<>
       (select road_count from tmp_issue97_frozen_mapping_protected_before)
     or (select count(*) from public.brinesearch_road_identity_mappings)<>
       (select mapping_count+46 from tmp_issue97_frozen_mapping_protected_before)
     or exists(select 1 from tmp_issue97_frozen_mapping_targets target
       join public.brinesearch_roads road on road.id=target.road_id
       where target.evidence_basis='exact_base_nlf_source_street_core'
         and pg_catalog.md5(pg_catalog.to_jsonb(road)::text)<>target.expected_road_row_md5)
     or (select count(distinct target.road_id) from tmp_issue97_frozen_mapping_targets target
       join public.brinesearch_roads road on road.id=target.road_id
       where target.evidence_basis='exact_route_designation'
         and road.verification_status='verified' and not road.candidate_only
         and road.geometry_status='official_centerline_loaded'
         and road.source_method='issue97_frozen_exact_mapping_wave'
         and road.centerline_geojson=extensions.st_asgeojson((
           select extensions.st_collectionextract(extensions.st_unaryunion(extensions.st_collect(
             private_verification.brinesearch_issue97_authoritative_identity_geometry(source.identity_id)
           )),2) from tmp_issue97_frozen_mapping_targets source where source.road_id=target.road_id
         ),7)::jsonb)<>24
  then
    raise exception 'Issue #97 frozen mapping wave broke target road/mapping contract';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(road)::text,'|' order by road.id),''))
       from public.brinesearch_roads road where not exists(
         select 1 from tmp_issue97_frozen_mapping_targets target where target.road_id=road.id
       ))<>(select non_target_roads from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(mapping)::text,'|' order by mapping.id),''))
       from public.brinesearch_road_identity_mappings mapping where not exists(
         select 1 from tmp_issue97_frozen_mapping_targets target where target.identity_id=mapping.identity_id
       ))<>(select mappings from tmp_issue97_frozen_mapping_protected_before)
  then
    raise exception 'Issue #97 frozen mapping wave changed non-target roads or mappings';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),'')) from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate)<>(select candidates from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt)<>(select occurrences from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt)<>(select routes from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt)<>(select transitions from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt)<>(select geometry from tmp_issue97_frozen_mapping_protected_before)
  then
    raise exception 'Issue #97 frozen mapping wave changed route occurrence or reconciliation receipts';
  end if;

  if (select count(*) from tmp_issue97_frozen_mapping_expected_google_pads)<>3
     or (select pg_catalog.md5(pg_catalog.string_agg(pad_id::text,'|' order by pad_id))
         from tmp_issue97_frozen_mapping_expected_google_pads)
       <>'5cd68da6e31fa7bf5b59bca9935f96f2'
  then
    raise exception 'Issue #97 frozen mapping wave Google invalidation pad set drifted';
  end if;

  if (select count(*) from private_verification.brinesearch_google_route_receipts_issue97 receipt
      join tmp_issue97_frozen_mapping_expected_google_pads expected on expected.pad_id=receipt.pad_id)<>3
     or exists(
       select 1
       from tmp_issue97_frozen_mapping_expected_google_pads expected
       join private_verification.brinesearch_google_route_receipts_issue97 receipt
         on receipt.pad_id=expected.pad_id
       where receipt.status is distinct from 'stale'
          or receipt.hold_reason is distinct from 'road_identity_mapping_changed'
          or receipt.manifest_version is distinct from 'issue97-google-v1'
          or receipt.manifest->>'manifest_version' is distinct from 'issue97-google-v1'
          or receipt.manifest->>'route_ready' is distinct from 'false'
          or receipt.manifest->>'status' is distinct from 'stale'
          or receipt.manifest->>'pad_id' is distinct from expected.pad_id::text
          or receipt.manifest->>'route_revision' is distinct from receipt.route_revision::text
          or receipt.route_revision is distinct from expected.expected_route_revision
          or receipt.manifest_digest is not null
          or receipt.dependency_digest is not null
          or not exists(
            select 1 from tmp_issue97_frozen_mapping_targets target
            where target.identity_id::text=receipt.evidence->>'identity_id'
              and target.road_id::text=receipt.evidence->>'road_id'
          )
          or not (
            exists(select 1 from public.brinesearch_pad_roads step
              where step.pad_id=expected.pad_id
                and step.road_id::text=receipt.evidence->>'road_id')
            or exists(
              select 1 from pg_catalog.jsonb_array_elements(
                coalesce(expected.pre_receipt_row->'manifest'->'points','[]'::jsonb)
              ) point
              where point->>'identity_id'=receipt.evidence->>'identity_id'
                 or point->>'road_id'=receipt.evidence->>'road_id'
            )
          )
     )
  then
    raise exception 'Issue #97 frozen mapping wave target immediate Google hold is invalid';
  end if;

  if exists(
    select 1
    from tmp_issue97_frozen_mapping_expected_google_pads expected
    join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=expected.pad_id
    join public.pads pad on pad.id=expected.pad_id
    where pad.brinesearch_google_route_status_issue97 is distinct from 'stale'
       or pad.brinesearch_google_route_revision_issue97 is distinct from receipt.route_revision
       or pad.structured_route_revision is distinct from expected.structured_route_revision
       or pad.road_sequence_status is distinct from expected.road_sequence_status
  )
  then
    raise exception 'Issue #97 frozen mapping wave target pad Google state is invalid';
  end if;

  if (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)<>3
     or (select pg_catalog.md5(pg_catalog.string_agg(queue.pad_id::text,'|' order by queue.pad_id))
         from private_verification.brinesearch_google_route_refresh_queue_issue97 queue)
       <>'5cd68da6e31fa7bf5b59bca9935f96f2'
     or exists(
       select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
       left join tmp_issue97_frozen_mapping_expected_google_pads expected on expected.pad_id=queue.pad_id
       where expected.pad_id is null or queue.reason<>'road_identity_mapping_changed'
     )
  then
    raise exception 'Issue #97 frozen mapping wave immediate Google refresh queue is invalid';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
       from private_verification.brinesearch_google_route_receipts_issue97 receipt
       where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
         where expected.pad_id=receipt.pad_id))<>
       (select non_target_private_google from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
         'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
         'revision',pad.brinesearch_google_route_revision_issue97
       )::text,'|' order by pad.id),''))
       from public.pads pad
       where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
         where expected.pad_id=pad.id))<>
       (select non_target_pad_google from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(queue)::text,'|' order by queue.pad_id),''))
       from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
       where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
         where expected.pad_id=queue.pad_id))<>
       (select non_target_google_queue from tmp_issue97_frozen_mapping_protected_before)
  then
    raise exception 'Issue #97 frozen mapping wave changed non-target Google state';
  end if;

  if (select pg_catalog.md5(pg_catalog.to_jsonb(state)::text) from public.brinesearch_issue97_release_state state where singleton)<>(select release_state from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(scope)::text,'|' order by scope.dataset_id,scope.state_code,scope.county_code),'')) from public.brinesearch_road_source_dataset_counties scope where state_code='OH')<>(select ohio_sources from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(build)::text,'|' order by build.id),'')) from public.brinesearch_road_graph_builds build where not exists(select 1 from tmp_issue97_frozen_mapping_graph_before affected where affected.id=build.id))<>(select non_target_builds from tmp_issue97_frozen_mapping_protected_before)
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>(select global_reconciliation from tmp_issue97_frozen_mapping_protected_before)
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or exists(select 1 from public.brinesearch_road_graph_builds where state_code in ('WV','PA') and details->>'release_generation_key'='issue97-release-20260815-r2')
     or public.brinesearch_issue97_cutover_active()
  then
    raise exception 'Issue #97 frozen mapping wave changed release source graph or reconciliation protected state';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(route)::text,'|' order by route.pad_id),'')) from public.brinesearch_driver_google_routes_public route)<>(select public_google from tmp_issue97_frozen_mapping_protected_before)
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
  then
    raise exception 'Issue #97 frozen mapping wave public Google routes are not zero';
  end if;
end
$issue97_frozen_exact_mapping_wave$;

create temporary table tmp_issue97_frozen_mapping_google_immediate on commit drop as
select expected.pad_id,pg_catalog.to_jsonb(receipt) receipt_row,
  pad.brinesearch_google_route_status_issue97 pad_google_status,
  pad.brinesearch_google_route_revision_issue97 pad_google_revision
from tmp_issue97_frozen_mapping_expected_google_pads expected
join private_verification.brinesearch_google_route_receipts_issue97 receipt
  on receipt.pad_id=expected.pad_id
join public.pads pad on pad.id=expected.pad_id
order by expected.pad_id;

-- Exercise the real already-pending constraint-trigger events only after the
-- immediate stale receipts and exact queue membership have passed review.
set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;

do $issue97_frozen_mapping_deferred_google_assertions$
begin
  if (select count(*) from tmp_issue97_frozen_mapping_google_immediate)<>3
     or exists(
       select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
       left join private_verification.brinesearch_google_route_receipts_issue97 receipt
         on receipt.pad_id=expected.pad_id
       left join public.pads pad on pad.id=expected.pad_id
       where receipt.status is distinct from 'held'
          or receipt.hold_reason is distinct from 'issue97_cutover_not_active'
          or receipt.manifest_version is distinct from 'issue97-google-v1'
          or receipt.manifest->>'manifest_version' is distinct from 'issue97-google-v1'
          or receipt.manifest->>'route_ready' is distinct from 'false'
          or receipt.manifest->>'status' is distinct from 'held'
          or receipt.manifest->>'pad_id' is distinct from expected.pad_id::text
          or receipt.manifest->>'route_revision' is distinct from
             greatest(coalesce(expected.structured_route_revision,0),0)::text
          or receipt.route_revision is distinct from
             greatest(coalesce(expected.structured_route_revision,0),0)
          or receipt.manifest_digest is not null
          or receipt.dependency_digest is not null
          or receipt.evidence is distinct from '{}'::jsonb
          or pad.brinesearch_google_route_status_issue97 is distinct from 'held'
          or pad.brinesearch_google_route_revision_issue97 is distinct from receipt.route_revision
          or pad.structured_route_revision is distinct from expected.structured_route_revision
          or pad.road_sequence_status is distinct from expected.road_sequence_status
      )
     or exists(select 1 from private_verification.brinesearch_google_route_refresh_queue_issue97)
     or public.brinesearch_issue97_cutover_active()
  then
    raise exception 'Issue #97 frozen mapping wave deferred Google processor produced unsafe state';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.pad_id),''))
       from private_verification.brinesearch_google_route_receipts_issue97 receipt
       where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
         where expected.pad_id=receipt.pad_id))<>
       (select non_target_private_google from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.jsonb_build_object(
         'pad_id',pad.id,'status',pad.brinesearch_google_route_status_issue97,
         'revision',pad.brinesearch_google_route_revision_issue97
       )::text,'|' order by pad.id),''))
       from public.pads pad
       where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
         where expected.pad_id=pad.id))<>
       (select non_target_pad_google from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(queue)::text,'|' order by queue.pad_id),''))
       from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
       where not exists(select 1 from tmp_issue97_frozen_mapping_expected_google_pads expected
         where expected.pad_id=queue.pad_id))<>
       (select non_target_google_queue from tmp_issue97_frozen_mapping_protected_before)
  then
    raise exception 'Issue #97 frozen mapping wave changed non-target Google state';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(candidate)::text,'|' order by candidate.route_prep_step_id,candidate.identity_id,candidate.candidate_basis),'')) from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate)<>(select candidates from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt)<>(select occurrences from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt)<>(select routes from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt)<>(select transitions from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(receipt)::text,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt)<>(select geometry from tmp_issue97_frozen_mapping_protected_before)
  then
    raise exception 'Issue #97 frozen mapping wave changed route occurrence or reconciliation receipts';
  end if;

  if (select pg_catalog.md5(pg_catalog.to_jsonb(state)::text) from public.brinesearch_issue97_release_state state where singleton)<>(select release_state from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(scope)::text,'|' order by scope.dataset_id,scope.state_code,scope.county_code),'')) from public.brinesearch_road_source_dataset_counties scope where state_code='OH')<>(select ohio_sources from tmp_issue97_frozen_mapping_protected_before)
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(build)::text,'|' order by build.id),'')) from public.brinesearch_road_graph_builds build where not exists(select 1 from tmp_issue97_frozen_mapping_graph_before affected where affected.id=build.id))<>(select non_target_builds from tmp_issue97_frozen_mapping_protected_before)
     or (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>(select global_reconciliation from tmp_issue97_frozen_mapping_protected_before)
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or exists(select 1 from public.brinesearch_road_graph_builds where state_code in ('WV','PA') and details->>'release_generation_key'='issue97-release-20260815-r2')
  then
    raise exception 'Issue #97 frozen mapping wave changed release source graph or reconciliation protected state';
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>0
  then
    raise exception 'Issue #97 frozen mapping wave public Google routes are not zero';
  end if;
end
$issue97_frozen_mapping_deferred_google_assertions$;

-- Freeze the exact cutover-OFF processor result so the later dark-build
-- rehearsal can prove that no candidate build changes target Google state.
create temporary table tmp_issue97_frozen_mapping_google_postprocessor on commit drop as
select expected.pad_id,pg_catalog.to_jsonb(receipt) receipt_row,
  pad.brinesearch_google_route_status_issue97 pad_google_status,
  pad.brinesearch_google_route_revision_issue97 pad_google_revision
from tmp_issue97_frozen_mapping_expected_google_pads expected
join private_verification.brinesearch_google_route_receipts_issue97 receipt
  on receipt.pad_id=expected.pad_id
join public.pads pad on pad.id=expected.pad_id
order by expected.pad_id;

set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;

do $issue97_frozen_mapping_deferred_trigger_assertion$
begin
  if (select count(*)
      from pg_catalog.pg_trigger trigger
      join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      where namespace.nspname='private_verification'
        and relation.relname='brinesearch_google_route_refresh_queue_issue97'
        and trigger.tgname='brinesearch_issue97_google_route_refresh_deferred'
        and not trigger.tgisinternal)<>1
     or exists(
       select 1
       from pg_catalog.pg_trigger trigger
       join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
       join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
       where namespace.nspname='private_verification'
         and relation.relname='brinesearch_google_route_refresh_queue_issue97'
         and trigger.tgname='brinesearch_issue97_google_route_refresh_deferred'
         and (trigger.tgenabled<>'O' or not trigger.tgdeferrable or not trigger.tginitdeferred)
     )
  then
    raise exception 'Issue #97 frozen mapping wave deferred Google processor produced unsafe state';
  end if;
end
$issue97_frozen_mapping_deferred_trigger_assertion$;

select pg_catalog.jsonb_build_object(
  'identity_count',46,'road_count',37,'highway_identity_count',28,
  'split_component_identity_count',18,'affected_membership_count',1565,
  'graph_action','rebuild_required','affected_counties',
    pg_catalog.to_jsonb(array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']),
  'mapping_dependent_routes',379,'transition_only_routes',33,
  'final_route_count',412,'final_primary_count',340,'final_alternate_count',72,
  'final_route_set_digest','711b1ddd3ba6c47e7642fc700197432f',
  'old_379_digest_historical_only','836c1f57210e4d18c0f60d4c1ea77d7d',
  'old_active_graphs_release_current',false,
  'replacement_build_ids_must_be_repository_pinned',true,
  'route_refresh_performed',false
) issue97_frozen_mapping_wave_result;
