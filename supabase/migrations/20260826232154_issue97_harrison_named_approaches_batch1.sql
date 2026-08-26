-- Issue #97: immutable named Harrison approaches for six Ascent pads.
--
-- This is an additive, fix-forward release.  Each pad receives two explicit
-- driver choices.  Only the exact current-graph public-road core is approved;
-- the separate saved-pad GPS destination remains an unapproved final leg.
-- The route-prep rows and their receipt arrays are pinned only as immutable
-- source snapshots; this release does not claim those full source routes ready.
-- Douglas remains globally non-default.  Its reviewed segment is authorized
-- only inside these route-specific immutable named-core receipts.
-- Nothing here edits graph, route-prep, direction, pad, Google-publication, or
-- cutover authority.

set local statement_timeout='5min';
set local lock_timeout='5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:issue97:harrison-named-approaches-batch1',97
  )
);

-- Cover the two immutable receipt foreign keys before the first release rows.
create index brinesearch_v18_named_approach_route_prep_idx
on private_verification.brinesearch_v18_named_approach_releases(route_prep_id);

create index brinesearch_v18_named_approach_graph_build_idx
on private_verification.brinesearch_v18_named_approach_releases(graph_build_id);

create temporary table tmp_issue97_harrison_named_targets(
  release_id uuid primary key,
  pad_id uuid not null,
  pad_name text not null,
  destination_latitude double precision not null,
  destination_longitude double precision not null,
  approach_key text not null,
  approach_label text not null,
  release_route_group text not null,
  release_variant_index integer not null,
  route_prep_id uuid not null,
  source_sequence text not null,
  source_sequence_hash text not null,
  core_kind text not null,
  source_route_group text not null,
  source_variant_index integer not null,
  source_readiness_status text not null,
  source_step_count integer not null,
  source_step_digest text not null,
  source_occurrence_count integer not null,
  source_resolved_occurrence_count integer not null,
  source_occurrence_digest text not null,
  source_transition_count integer not null,
  source_resolved_transition_count integer not null,
  source_transition_digest text not null,
  source_geometry_count integer not null,
  source_resolved_geometry_count integer not null,
  source_geometry_digest text not null,
  expected_base_status_revision text not null,
  unique(pad_id,approach_key)
) on commit drop;

insert into tmp_issue97_harrison_named_targets values
  ('b75118bc-8fac-4477-8433-2203c2cbf107','185d9eb6-58af-4009-bf53-fdd23113a572','CARDINAL',40.215556,-81.135068,'via_freeport','Via Freeport','primary',1,'5a74a964-5f9e-44fe-bf93-0a16c98d16db','OH-800 → OH-799 → Kennedy Ridge Rd → Douglas Turn Rd','489243e141a68470ada1e7a796feb1f7','freeport_standard','primary',1,'needs_sequence_cleanup',4,'e27a38217458d0475136f69f81a57fe1',4,4,'e0aa0da40f342192f699f309bf5bb18b',3,3,'bfe2446e31d6162b019ec6c01b6ee33b',0,0,'d41d8cd98f00b204e9800998ecf8427e','ff640b9daf0f97f9cf11e7b6116c172e'),
  ('29dad7ae-b671-43c7-93f5-9970c066c149','185d9eb6-58af-4009-bf53-fdd23113a572','CARDINAL',40.215556,-81.135068,'via_cadiz','Via Cadiz','alternate',2,'78fae1c9-5f87-409f-ab49-1429b2558975','US-250 → US-22 → Douglas Turn Rd','3e597a1e92bab340740974c3785b567c','cadiz_cardinal_clip','alternate',2,'needs_sequence_cleanup',3,'eabf70c77705fccb4e42a73aab367320',3,3,'b53d68865e929f5b6345fa89c7c07745',2,2,'089c2a87f3ad85924e4e68be478f5e9b',0,0,'d41d8cd98f00b204e9800998ecf8427e','ff640b9daf0f97f9cf11e7b6116c172e'),
  ('7946c0bf-ff52-44a7-8499-aa3ac5c4c573','95dcbd15-afd0-4357-a521-e23bcd6b4118','CONOTTON',40.224259,-81.162714,'via_freeport','Via Freeport','primary',1,'53b6c1c4-2fe1-4187-899c-41b92d9fdcd4','OH-800 → OH-799 → Kennedy Ridge Rd','b67e577f9c1c5954f850e5322b571880','freeport_standard','primary',1,'ready_for_road_matching',3,'13b4f06bdd26fce72ffb1df2c7043bd7',3,3,'1cf4488554e9c3e5d1adb022043edf84',2,2,'d76a05e569f1bd22484e802cce030486',3,2,'4da63c428356aec171034b81e0464111','07260a1a0968247a7ddb7802da151807'),
  ('1b004b3d-1242-441f-ae35-0edec9dcfa84','95dcbd15-afd0-4357-a521-e23bcd6b4118','CONOTTON',40.224259,-81.162714,'via_cadiz','Via Cadiz','alternate',2,'b9d0ea76-ee87-4d19-8d23-1194de26ca78','US-250 → US-22 → Douglas Turn Rd → Kennedy Ridge Rd → Lease Road','510da8f1529d23bf7d3f67d109f74937','cadiz_douglas','alternate',2,'needs_sequence_cleanup',5,'0d02bc739c44844e336c7b08cf5b4811',5,0,'f131a42950e319ba31be0e34fc698788',0,0,'d41d8cd98f00b204e9800998ecf8427e',0,0,'d41d8cd98f00b204e9800998ecf8427e','07260a1a0968247a7ddb7802da151807'),
  ('22d86246-dd2c-44d2-b79a-91191178d724','61e21e3c-360b-40b0-8153-209b4fb3d5eb','ELLEN',40.227073,-81.148656,'via_freeport','Via Freeport','primary',1,'a35beac0-0900-40fd-b5f3-16cf7e615ff9','Route 22 → Route 799 → Kennedy Ridge → Pad','d85772ac965d7ac6d8ce52371715e4da','freeport_oh799_only','alternate',3,'needs_sequence_reorder',4,'a86b4dbf0fa720e7508d770e6729b33b',3,0,'d8f62e5a8b8396ae952a3cea1ad96fbd',0,0,'d41d8cd98f00b204e9800998ecf8427e',0,0,'d41d8cd98f00b204e9800998ecf8427e','b512ae5b094355b2e5992da2a26cf175'),
  ('189ec9cc-c1ee-473b-b5cc-011d51721096','61e21e3c-360b-40b0-8153-209b4fb3d5eb','ELLEN',40.227073,-81.148656,'via_cadiz','Via Cadiz','alternate',2,'c4129c8f-b03e-4072-a20c-3e45e1d5f321','Route 22 → Douglas Turn Rd → Kennedy Ridge Rd → Pad','e1752137f4ae2b51b03722c98af8be85','cadiz_douglas','alternate',2,'needs_sequence_cleanup',4,'39d7790edb020774bcb01b2e81c3ed41',3,0,'0f51641a7b4702639b60fcff83a9aeeb',0,0,'d41d8cd98f00b204e9800998ecf8427e',0,0,'d41d8cd98f00b204e9800998ecf8427e','b512ae5b094355b2e5992da2a26cf175'),
  ('bbb29efe-2c16-4bf5-9e0c-f7175be03dbd','b9a8e55c-3583-4019-85fc-54a03d420ace','HAMILTON',40.225052,-81.177456,'via_freeport','Via Freeport','primary',1,'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a','OH-800 → OH-799 → Kennedy Ridge Rd','b67e577f9c1c5954f850e5322b571880','freeport_standard','primary',1,'ready_for_road_matching',3,'1c2ca7583ea831a88592c8f9dba10aa3',3,3,'ee0a601fd1d0369d5b057d8a7d7a4931',2,2,'fa5b62e0de4748783731522e898969c5',3,2,'2c14bacb25696e64b438355f68b99818','be4669d3bd64562273bdce0438e4874b'),
  ('56b8360f-b35f-4a25-ab0b-a20f7bf298f0','b9a8e55c-3583-4019-85fc-54a03d420ace','HAMILTON',40.225052,-81.177456,'via_cadiz','Via Cadiz','alternate',2,'b41b4262-5d35-4588-8bff-4f06cbefc629','US-250 → US-22 → Douglas Turn Rd → Kennedy Ridge Rd','bdb06bf4293c8f04015eca1d3c1257bd','cadiz_douglas','alternate',2,'needs_sequence_cleanup',4,'eb299ce39306a0da053d1c905d745422',4,4,'6616b27bfbe368bab050b8380bce053a',3,3,'5d733b39289de65d74dc1f7ecdc7928f',0,0,'d41d8cd98f00b204e9800998ecf8427e','be4669d3bd64562273bdce0438e4874b'),
  ('ba46ee0f-6d1e-45ea-978d-3a8e5d66145f','655a97d5-ffdf-4b13-bf66-3d22022239b4','PETTAY',40.238511,-81.173547,'via_freeport','Via Freeport','primary',1,'34201b4a-f2f4-4986-bf58-21296efca4f0','OH-800 → OH-799 → Kennedy Ridge Rd → Blue Trail → Huff Run Rd','70f27aca233a84746438dcab73934740','freeport_standard','primary',1,'ready_for_road_matching',5,'36aad8f3eff7bed57a4ffc8f48e6996f',5,0,'728b7477a06e80b93676087a71cb589b',0,0,'d41d8cd98f00b204e9800998ecf8427e',0,0,'d41d8cd98f00b204e9800998ecf8427e','a9b8ea2cdafab39b7f9c884cc7b779f8'),
  ('2656656f-b697-4985-8a5d-82c7b07fc892','655a97d5-ffdf-4b13-bf66-3d22022239b4','PETTAY',40.238511,-81.173547,'via_cadiz','Via Cadiz','alternate',2,'2208a5ae-ac48-41d1-9750-984d399027f7','US-250 → US-22 → Douglas Turn Rd → Kennedy Ridge Rd → Blue Trail → Huff Run Rd','92aaafe54c4fc6b89602d0dc95656a21','cadiz_douglas','alternate',2,'needs_sequence_cleanup',6,'e5db72ccac33ac8149d5bdf8edcc6f67',6,0,'7330e637255c5edc915c8e9936361336',0,0,'d41d8cd98f00b204e9800998ecf8427e',0,0,'d41d8cd98f00b204e9800998ecf8427e','a9b8ea2cdafab39b7f9c884cc7b779f8'),
  ('a4679596-f0e7-4c8c-b097-fcdabd37e4e8','f5a82acf-d7c0-4ce3-ad4e-0de810551450','SPROULL',40.229140,-81.151012,'via_freeport','Via Freeport','primary',1,'4a209eed-5f69-4cc7-b189-85196227c4fe','OH-800 → OH-799 → Kennedy Ridge Rd','b67e577f9c1c5954f850e5322b571880','freeport_standard','primary',1,'ready_for_road_matching',3,'7a75525b7c3cb7a2b370d92ad3d27dea',3,3,'f0dca0034e9a0f37b25836572b377070',2,2,'89adeee568f87db0616cc03f56a5dd3a',3,2,'22c206b2aa1f526e40c635785fc2fc27','f7a4862d76dbc2c78c03e36c71ec0464'),
  ('e984cd85-c87d-4984-acd2-25dcc92aeae5','f5a82acf-d7c0-4ce3-ad4e-0de810551450','SPROULL',40.229140,-81.151012,'via_cadiz','Via Cadiz','alternate',2,'17461b0c-61f1-4960-93bf-2b73e1be336c','US-250 → US-22 → Douglas Turn Rd → Kennedy Ridge Rd','bdb06bf4293c8f04015eca1d3c1257bd','cadiz_douglas','alternate',3,'needs_sequence_cleanup',4,'459e1b07d17515289a626d66d8ba181d',4,4,'57c439beafec57b80353c80bd015d218',3,3,'4b965e3a098687d0738f6a77c418f51f',0,0,'d41d8cd98f00b204e9800998ecf8427e','f7a4862d76dbc2c78c03e36c71ec0464');

alter table tmp_issue97_harrison_named_targets
  add column source_route_row_digest text;
update tmp_issue97_harrison_named_targets target set source_route_row_digest=
  case target.route_prep_id
    when '17461b0c-61f1-4960-93bf-2b73e1be336c' then 'ba987651596af91de2bacb17a03111e3'
    when '2208a5ae-ac48-41d1-9750-984d399027f7' then 'bd26417f06f2318b2a7455cf7d6d0438'
    when '34201b4a-f2f4-4986-bf58-21296efca4f0' then 'a5fa94bb51e0658ce15d527a29aebbd7'
    when '4a209eed-5f69-4cc7-b189-85196227c4fe' then 'b0fbe418b3f6e863155dbdc1113f5cff'
    when '53b6c1c4-2fe1-4187-899c-41b92d9fdcd4' then 'a62faae2f5fa65e92271c50180293e5e'
    when '5a74a964-5f9e-44fe-bf93-0a16c98d16db' then 'fba53a49ec0c0b2b28dbe067c178e721'
    when '78fae1c9-5f87-409f-ab49-1429b2558975' then 'd4f0198318f4b734a1bdfc65155d2122'
    when 'a35beac0-0900-40fd-b5f3-16cf7e615ff9' then '9bc097183b1301176076a37bd7eefe56'
    when 'b41b4262-5d35-4588-8bff-4f06cbefc629' then 'caef747f2997550537052f2d9fa62ec6'
    when 'b9d0ea76-ee87-4d19-8d23-1194de26ca78' then 'f91759de54ba6ab842e2671dd7c0252c'
    when 'c4129c8f-b03e-4072-a20c-3e45e1d5f321' then '730f95f44034483896285e7b3292534f'
    when 'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a' then 'dfc2d7c815a4ef3dfc2f6cde2bacad91'
  end;
alter table tmp_issue97_harrison_named_targets
  alter column source_route_row_digest set not null;

create temporary table tmp_issue97_harrison_core_mappings(
  mapping_id uuid primary key,
  identity_id uuid not null unique,
  road_id uuid not null,
  mapping_method text not null,
  mapping_row_digest text not null,
  source_identity_key text not null,
  source_digest text not null,
  geometry_digest text not null,
  canonical_name text not null,
  approved_by_default boolean not null
) on commit drop;

insert into tmp_issue97_harrison_core_mappings values
  ('05e3c897-b0ca-7f9e-aa15-4ee59fd11214','c7856355-4ac4-70e0-6ecf-c19b5adb05fb','0a8a8721-4d20-41bf-8d95-ec069173e584','manual_reviewed_source_evidence','dfb9062f29ab670ad3d8120458263b29','OH:ODOT:NLF:SHASSR00800**C','42a4328a8509aadd129f2d59e2b64bbd','4cee534ea14b2111042a5432fc14f8e0','OH-800',true),
  ('b365b3cf-b8b3-60b1-95d4-be83dc749bea','bd4624be-178e-328d-9f9e-462d6066532e','d7a42c92-9a77-49e0-8792-cd634242272e','manual_reviewed_source_evidence','16cc55427e657485fd9ce3a3dccad974','OH:ODOT:NLF:SHASSR00799**C','3f0c74e3a3019f5ce019ab0720f6e8d6','2448e5ba3c6fff940b02d40121186cfa','OH-799',true),
  ('b1d43bd2-36fd-5092-b5f6-cce204a07364','fec65f26-a08f-dcd8-f9f0-62d873443889','2ec7ff2a-1599-4fc5-84ac-5dab12d853ad','exact_source_record_id','afc4907c4c1804115ac0cfc4d6203758','OH:ODOT:NLF:CHASCR00033**C','90b6e05ee56a5ecad1b882d46faf0886','5f5ba9e2ef79bfdc2e8f34397552478d','CR-33',false),
  ('a74a6be7-6db0-693b-2209-4a3dd8cbfe3a','108d9932-ec44-a267-a80d-f154dd73b114','fd43709b-2880-4b6c-934a-6f9addc6e5cb','exact_route_designation','091f3b4c49c4b871865d44a1f587a8f4','OH:ODOT:NLF:SHASUS00022**C','aaf5ffa8a0798065d5380cf2c49c4de0','b6030bbdd5fccd131415da02806e72dd','US-22',true);

create temporary table tmp_issue97_harrison_core_junctions(
  junction_id uuid primary key,
  latitude double precision not null,
  longitude double precision not null,
  left_identity_id uuid not null,
  left_road_id uuid not null,
  right_identity_id uuid not null,
  right_road_id uuid not null,
  junction_type text not null,
  geometry_type text not null,
  junction_graph_digest text not null
) on commit drop;

insert into tmp_issue97_harrison_core_junctions values
  ('178a32b5-c32b-9b6a-8d7c-7445a5a2475f',40.2273687,-81.2472549,'c7856355-4ac4-70e0-6ecf-c19b5adb05fb','0a8a8721-4d20-41bf-8d95-ec069173e584','bd4624be-178e-328d-9f9e-462d6066532e','d7a42c92-9a77-49e0-8792-cd634242272e','t_junction','POINT','5edeaba19c1a23b92fe65c15bccd7664'),
  ('7f55c4cf-3b80-8b4c-d514-e909c68afff8',40.2310665,-81.2016988,'bd4624be-178e-328d-9f9e-462d6066532e','d7a42c92-9a77-49e0-8792-cd634242272e','b0ec2efd-e511-2e2d-c481-eaf896757bbb','ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3','t_junction','POINT','e6e8e3bd426b494a5b9a2afa7e638d53'),
  ('4bfb8842-f123-db6c-54f3-5fb3cb177f2f',40.2779786,-81.0128649,'f61bbbe4-353e-4968-e1dd-986d8889c11c','cdcfd114-42c5-4478-9251-eac57a70e528','108d9932-ec44-a267-a80d-f154dd73b114','fd43709b-2880-4b6c-934a-6f9addc6e5cb','shared_segment','LINESTRING','6e5fa1bbb24dc878f79e4fe283bf4865'),
  ('5cd51768-047a-90c1-9fc4-7331b897e160',40.2111424,-81.1323685,'108d9932-ec44-a267-a80d-f154dd73b114','fd43709b-2880-4b6c-934a-6f9addc6e5cb','fec65f26-a08f-dcd8-f9f0-62d873443889','2ec7ff2a-1599-4fc5-84ac-5dab12d853ad','t_junction','POINT','6ac4dc02de7c629c07d641056319ef7d'),
  ('f72d9546-0e5a-3d54-8472-fce5d40569a0',40.2198834,-81.1374484,'fec65f26-a08f-dcd8-f9f0-62d873443889','2ec7ff2a-1599-4fc5-84ac-5dab12d853ad','b0ec2efd-e511-2e2d-c481-eaf896757bbb','ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3','t_junction','POINT','1f74f47436375a48b2d83ac078094d78');

create temporary table tmp_issue97_harrison_base_status on commit drop as
select target.pad_id,target.expected_base_status_revision,
       public.brinesearch_v18_driver_pad_status_with_google_handoff(
         target.pad_id
       ) as base_bundle
from (
  select distinct pad_id,expected_base_status_revision
  from tmp_issue97_harrison_named_targets
) target;

create temporary table tmp_issue97_harrison_named_before on commit drop as
select
  public.brinesearch_v18_driver_pad_status_with_named_approaches(
    '518659d9-bca2-47b0-b294-3141ba679fc4'
  ) as lasso_bundle,
  public.brinesearch_v18_driver_pad_status_with_named_approaches(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  ) as cologie_bundle,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from private_verification.brinesearch_v18_core_destination_releases row_value)
    as core_private_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from public.brinesearch_driver_core_destination_releases_public row_value)
    as core_public_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from public.brinesearch_driver_google_routes_public row_value)
    as google_route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from public.brinesearch_driver_google_handoffs_public row_value)
    as google_handoff_digest,
  (select pg_catalog.to_jsonb(row_value)
   from public.brinesearch_issue97_release_state row_value
   where row_value.singleton) as cutover_state,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_road_graph_builds row_value) as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_route_prep row_value) as route_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.brinesearch_route_prep_steps row_value) as route_step_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,row_value.occurrence_index
   ),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value)
    as occurrence_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,row_value.boundary_index
   ),'')) from private_verification.brinesearch_route_transition_receipts_issue97 row_value)
    as transition_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,row_value.occurrence_index
   ),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 row_value)
    as geometry_receipt_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
   ),'')) from public.pads row_value) as pad_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
   ),'')) from public.brinesearch_driver_directions_public row_value) as direction_digest;

do $preflight$
declare
  v_target record;
  v_graph public.brinesearch_road_graph_builds%rowtype;
begin
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_named_approach_releases'
     ) is null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_named_approach_releases_public'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_named_approach_release_digest(private_verification.brinesearch_v18_named_approach_releases)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_named_approach_release_receipt_active(uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'
     ) is null then
    raise exception 'Named-approach infrastructure is not installed';
  end if;

  if (select count(*)
      from private_verification.brinesearch_v18_named_approach_releases)<>0
     or (select count(*)
         from public.brinesearch_driver_named_approach_releases_public)<>0 then
    raise exception 'Named-approach release state is no longer empty';
  end if;

  if (select count(*) from tmp_issue97_harrison_named_targets)<>12
     or (select count(distinct pad_id)
         from tmp_issue97_harrison_named_targets)<>6
     or exists(
       select 1 from tmp_issue97_harrison_named_targets
       group by pad_id
       having count(*)<>2
          or count(*) filter(where approach_key='via_freeport'
                                and approach_label='Via Freeport'
                                and release_route_group='primary'
                                and release_variant_index=1)<>1
          or count(*) filter(where approach_key='via_cadiz'
                                and approach_label='Via Cadiz'
                                and release_route_group='alternate'
                                and release_variant_index=2)<>1
     ) then
    raise exception 'Named approach target matrix is not exactly six by two';
  end if;

  select * into strict v_graph
  from public.brinesearch_road_graph_builds
  where id='f4e4d43f-e86c-499c-893f-73f2eef3dc29';
  if v_graph.status<>'active'
     or v_graph.state_code<>'OH'
     or v_graph.county_name<>'Harrison'
     or v_graph.graph_digest<>'71cb3479ac57b6f5dc26d0985a056d06'
     or v_graph.activated_at is distinct from
          '2026-08-24T23:53:01.785257Z'::timestamptz
     or private_verification.brinesearch_issue97_graph_build_release_current(
          v_graph.id
        ) is not true then
    raise exception 'Current Harrison graph checkpoint diverged';
  end if;

  if (select count(*) from tmp_issue97_harrison_base_status)<>6
     or exists(
       select 1 from tmp_issue97_harrison_base_status base
       where pg_catalog.lower(coalesce(
               base.base_bundle#>>'{status,statusRevision}',''
             ))<>base.expected_base_status_revision
          or base.base_bundle#>>'{status,route,source}'<>'legacy_written'
          or base.base_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
          or base.base_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb
     ) then
    raise exception 'Named target base status revision/authority drifted';
  end if;

  if (select count(*) from tmp_issue97_harrison_core_mappings)<>4
     or exists(
       select 1
       from tmp_issue97_harrison_core_mappings expected
       where not exists(
         select 1
         from public.brinesearch_road_identity_mappings mapping
         join public.brinesearch_authoritative_road_identities identity
           on identity.id=mapping.identity_id
         join public.brinesearch_roads road on road.id=mapping.road_id
         where mapping.id=expected.mapping_id
           and mapping.identity_id=expected.identity_id
           and mapping.road_id=expected.road_id
           and mapping.mapping_status='verified'
           and mapping.mapping_method=expected.mapping_method
           and pg_catalog.md5(pg_catalog.to_jsonb(mapping)::text)=
                 expected.mapping_row_digest
           and (select count(*)
                from public.brinesearch_road_identity_mappings only_mapping
                where only_mapping.identity_id=expected.identity_id
                  and only_mapping.mapping_status='verified')=1
           and identity.source_identity_key=expected.source_identity_key
           and identity.source_digest=expected.source_digest
           and identity.state_code='OH'
           and identity.county_code='HAS'
           and identity.county_name='Harrison'
           and identity.public_access_status='public'
           and identity.drivable_status='drivable'
           and identity.active
           and identity.last_seen_at is not distinct from v_graph.activated_at
           and private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
                 identity.id
               )=expected.geometry_digest
           and road.canonical_name=expected.canonical_name
           and road.verification_status='verified'
           and road.geometry_status='official_centerline_loaded'
           and road.candidate_only is false
           and road.approved_by_default is not distinct from
                 expected.approved_by_default
           and road.gate is false
       )
     ) then
    raise exception 'Exact reviewed core identity/mapping/road authority diverged';
  end if;

  if (select count(*) from tmp_issue97_harrison_core_junctions)<>5
     or exists(
       select 1
       from tmp_issue97_harrison_core_junctions expected
       where not exists(
         select 1
         from public.brinesearch_road_junctions junction
         where junction.id=expected.junction_id
           and junction.build_id=v_graph.id
           and junction.graph_digest=expected.junction_graph_digest
           and junction.state_code='OH'
           and junction.county_code='HAS'
           and junction.county_name='Harrison'
           and junction.junction_type=expected.junction_type
           and junction.verification_status='verified'
           and junction.confidence in ('authoritative','authoritative_at_grade')
           and extensions.geometrytype(junction.geom)=expected.geometry_type
           and extensions.st_distance(
                 junction.geom::extensions.geography,
                 extensions.st_setsrid(extensions.st_makepoint(
                   expected.longitude,expected.latitude
                 ),4326)::extensions.geography
               )<=0.05
       )
       or (select count(*)
           from public.brinesearch_road_junction_memberships membership
           where membership.junction_id=expected.junction_id)<>2
       or not exists(
         select 1
         from public.brinesearch_road_junction_memberships membership
         where membership.junction_id=expected.junction_id
           and membership.identity_id=expected.left_identity_id
           and membership.road_id=expected.left_road_id
       )
       or not exists(
         select 1
         from public.brinesearch_road_junction_memberships membership
         where membership.junction_id=expected.junction_id
           and membership.identity_id=expected.right_identity_id
           and membership.road_id=expected.right_road_id
       )
     ) then
    raise exception 'Exact reviewed core junction/membership authority diverged';
  end if;

  for v_target in select * from tmp_issue97_harrison_named_targets loop
    if not exists(
         select 1
         from public.pads pad
         where pad.id=v_target.pad_id
           and pad.pad_name=v_target.pad_name
           and pad.company='Ascent'
           and pad.county='Harrison'
           and pad.state='Ohio'
           and pad.latitude is not distinct from v_target.destination_latitude
           and pad.longitude is not distinct from v_target.destination_longitude
       ) then
      raise exception '% pad/GPS checkpoint diverged',v_target.pad_name;
    end if;
    if not exists(
         select 1
         from public.brinesearch_route_prep route
         where route.id=v_target.route_prep_id
           and route.pad_id=v_target.pad_id
           and route.active
           and route.route_group=v_target.source_route_group
           and route.variant_index=v_target.source_variant_index
           and route.readiness_status=v_target.source_readiness_status
           and route.source_sequence=v_target.source_sequence
           and route.source_sequence_hash=v_target.source_sequence_hash
           and route.source_sequence_hash=pg_catalog.md5(route.source_sequence)
           and pg_catalog.md5(pg_catalog.to_jsonb(route)::text)=
                 v_target.source_route_row_digest
        ) then
      raise exception '% % source route checkpoint diverged',
        v_target.pad_name,v_target.approach_label;
    end if;
    if (select count(*)
        from public.brinesearch_route_prep_steps step
        where step.route_prep_id=v_target.route_prep_id)<>
          v_target.source_step_count
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
             pg_catalog.to_jsonb(step)::text,'|' order by step.step_order
           ),''))
           from public.brinesearch_route_prep_steps step
           where step.route_prep_id=v_target.route_prep_id) is distinct from
             v_target.source_step_digest
       or (select count(*)
           from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
           where occurrence.route_prep_id=v_target.route_prep_id)<>
             v_target.source_occurrence_count
       or (select count(*) filter(where occurrence.resolution_status='resolved')
           from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
           where occurrence.route_prep_id=v_target.route_prep_id)<>
             v_target.source_resolved_occurrence_count
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
             pg_catalog.to_jsonb(occurrence)::text,'|' order by occurrence.occurrence_index
           ),''))
           from private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
           where occurrence.route_prep_id=v_target.route_prep_id) is distinct from
             v_target.source_occurrence_digest
       or (select count(*)
           from private_verification.brinesearch_route_transition_receipts_issue97 transition_receipt
           where transition_receipt.route_prep_id=v_target.route_prep_id)<>
             v_target.source_transition_count
       or (select count(*) filter(where transition_receipt.status='resolved')
           from private_verification.brinesearch_route_transition_receipts_issue97 transition_receipt
           where transition_receipt.route_prep_id=v_target.route_prep_id)<>
             v_target.source_resolved_transition_count
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
             pg_catalog.to_jsonb(transition_receipt)::text,'|' order by transition_receipt.boundary_index
           ),''))
           from private_verification.brinesearch_route_transition_receipts_issue97 transition_receipt
           where transition_receipt.route_prep_id=v_target.route_prep_id) is distinct from
             v_target.source_transition_digest
       or (select count(*)
           from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry_receipt
           where geometry_receipt.route_prep_id=v_target.route_prep_id)<>
             v_target.source_geometry_count
       or (select count(*) filter(where geometry_receipt.status='resolved')
           from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry_receipt
           where geometry_receipt.route_prep_id=v_target.route_prep_id)<>
             v_target.source_resolved_geometry_count
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
             pg_catalog.to_jsonb(geometry_receipt)::text,'|' order by geometry_receipt.occurrence_index
           ),''))
           from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry_receipt
           where geometry_receipt.route_prep_id=v_target.route_prep_id) is distinct from
             v_target.source_geometry_digest then
      raise exception '% % source receipt snapshot diverged',
        v_target.pad_name,v_target.approach_label;
    end if;
  end loop;
end
$preflight$;

do $release$
declare
  v_target record;
  v_graph public.brinesearch_road_graph_builds%rowtype;
  v_route public.brinesearch_route_prep%rowtype;
  v_release private_verification.brinesearch_v18_named_approach_releases%rowtype;
  v_oh800 extensions.geometry;
  v_oh799 extensions.geometry;
  v_douglas extensions.geometry;
  v_kennedy extensions.geometry;
  v_us22 extensions.geometry;
  v_us250 extensions.geometry;
  v_freeport_ingress extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.262609666,40.210926558),4326
  );
  v_oh800_oh799 extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.2472549,40.2273687),4326
  );
  v_oh799_kennedy extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.2016988,40.2310665),4326
  );
  v_us22_douglas extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.1323685,40.2111424),4326
  );
  v_us250_us22 extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.0128649,40.2779786),4326
  );
  v_douglas_kennedy extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.1374484,40.2198834),4326
  );
  v_oh800_clip extensions.geometry;
  v_oh799_clip extensions.geometry;
  v_us22_clip extensions.geometry;
  v_douglas_clip extensions.geometry;
  v_cardinal_clip extensions.geometry;
  v_fraction_start double precision;
  v_fraction_end double precision;
  v_low double precision:=0;
  v_high double precision:=1;
  v_middle double precision;
  v_target_metres constant double precision:=643.7376;
  v_steps jsonb;
  v_geometry jsonb;
  v_ingress jsonb;
  v_core_end jsonb;
  v_destination jsonb;
  v_handoff jsonb;
  v_evidence jsonb;
  v_route_receipt_digest text;
  v_status_revision text;
  v_base_bundle jsonb;
  v_line_digest text;
  v_published_at timestamptz:=pg_catalog.transaction_timestamp();
begin
  select * into strict v_graph
  from public.brinesearch_road_graph_builds
  where id='f4e4d43f-e86c-499c-893f-73f2eef3dc29';

  v_oh800:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'c7856355-4ac4-70e0-6ecf-c19b5adb05fb'
  );
  v_oh799:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'bd4624be-178e-328d-9f9e-462d6066532e'
  );
  v_douglas:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'fec65f26-a08f-dcd8-f9f0-62d873443889'
  );
  v_kennedy:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'b0ec2efd-e511-2e2d-c481-eaf896757bbb'
  );
  v_us22:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    '108d9932-ec44-a267-a80d-f154dd73b114'
  );
  v_us250:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'f61bbbe4-353e-4968-e1dd-986d8889c11c'
  );

  if extensions.geometrytype(v_oh800)<>'LINESTRING'
     or extensions.geometrytype(v_oh799)<>'LINESTRING'
     or extensions.geometrytype(v_douglas)<>'LINESTRING'
     or extensions.geometrytype(v_us22)<>'LINESTRING'
     or private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          'c7856355-4ac4-70e0-6ecf-c19b5adb05fb'
        )<>'4cee534ea14b2111042a5432fc14f8e0'
     or private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          'bd4624be-178e-328d-9f9e-462d6066532e'
        )<>'2448e5ba3c6fff940b02d40121186cfa'
     or private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          'fec65f26-a08f-dcd8-f9f0-62d873443889'
        )<>'5f5ba9e2ef79bfdc2e8f34397552478d'
     or private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          'b0ec2efd-e511-2e2d-c481-eaf896757bbb'
        )<>'b10f375bbc7d5b66fcde99b25e0b1355'
     or private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          '108d9932-ec44-a267-a80d-f154dd73b114'
        )<>'b6030bbdd5fccd131415da02806e72dd'
     or private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          'f61bbbe4-353e-4968-e1dd-986d8889c11c'
        )<>'ae8d10e7ae3c41394a1dc2aaaf65fb00' then
    raise exception 'Authoritative Harrison identity geometry diverged';
  end if;

  if not exists(
       select 1 from public.brinesearch_roads road
       where road.id='0a8a8721-4d20-41bf-8d95-ec069173e584'
         and road.verification_status='verified'
         and road.geometry_status='official_centerline_loaded'
         and not coalesce(road.candidate_only,false)
     )
     or not exists(
       select 1 from public.brinesearch_roads road
       where road.id='d7a42c92-9a77-49e0-8792-cd634242272e'
         and road.verification_status='verified'
         and road.geometry_status='official_centerline_loaded'
         and not coalesce(road.candidate_only,false)
     )
     or not exists(
       select 1 from public.brinesearch_roads road
       where road.id='2ec7ff2a-1599-4fc5-84ac-5dab12d853ad'
         and road.verification_status='verified'
         and road.geometry_status='official_centerline_loaded'
         and not coalesce(road.candidate_only,false)
     )
     or not exists(
       select 1 from public.brinesearch_roads road
       where road.id='fd43709b-2880-4b6c-934a-6f9addc6e5cb'
         and road.verification_status='verified'
         and road.geometry_status='official_centerline_loaded'
         and not coalesce(road.candidate_only,false)
     ) then
    raise exception 'Pinned public-road authority row diverged';
  end if;

  if extensions.st_distance(v_oh800::extensions.geography,v_freeport_ingress::extensions.geography)>0.05
     or extensions.st_distance(v_oh800::extensions.geography,v_oh800_oh799::extensions.geography)>0.05
     or extensions.st_distance(v_oh799::extensions.geography,v_oh800_oh799::extensions.geography)>0.05
     or extensions.st_distance(v_oh799::extensions.geography,v_oh799_kennedy::extensions.geography)>0.05
     or extensions.st_distance(v_kennedy::extensions.geography,v_oh799_kennedy::extensions.geography)>0.05
     or extensions.st_distance(v_us250::extensions.geography,v_us250_us22::extensions.geography)>0.05
     or extensions.st_distance(v_us22::extensions.geography,v_us250_us22::extensions.geography)>0.05
     or extensions.st_distance(v_us22::extensions.geography,v_us22_douglas::extensions.geography)>0.05
     or extensions.st_distance(v_douglas::extensions.geography,v_us22_douglas::extensions.geography)>0.05
     or extensions.st_distance(v_douglas::extensions.geography,v_douglas_kennedy::extensions.geography)>0.05
     or extensions.st_distance(v_kennedy::extensions.geography,v_douglas_kennedy::extensions.geography)>0.05 then
    raise exception 'Exact reviewed ingress/transition coordinate left its identities';
  end if;

  v_fraction_start:=extensions.st_linelocatepoint(v_oh800,v_freeport_ingress);
  v_fraction_end:=extensions.st_linelocatepoint(v_oh800,v_oh800_oh799);
  if v_fraction_start<v_fraction_end then
    v_oh800_clip:=extensions.st_linesubstring(
      v_oh800,v_fraction_start,v_fraction_end
    );
  else
    v_oh800_clip:=extensions.st_reverse(extensions.st_linesubstring(
      v_oh800,v_fraction_end,v_fraction_start
    ));
  end if;
  v_oh800_clip:=extensions.st_setpoint(v_oh800_clip,0,v_freeport_ingress);
  v_oh800_clip:=extensions.st_setpoint(
    v_oh800_clip,extensions.st_npoints(v_oh800_clip)-1,v_oh800_oh799
  );
  v_oh800_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    extensions.st_asgeojson(v_oh800_clip,15)
  ),4326);

  v_fraction_start:=extensions.st_linelocatepoint(v_oh799,v_oh800_oh799);
  v_fraction_end:=extensions.st_linelocatepoint(v_oh799,v_oh799_kennedy);
  if v_fraction_start<v_fraction_end then
    v_oh799_clip:=extensions.st_linesubstring(
      v_oh799,v_fraction_start,v_fraction_end
    );
  else
    v_oh799_clip:=extensions.st_reverse(extensions.st_linesubstring(
      v_oh799,v_fraction_end,v_fraction_start
    ));
  end if;
  v_oh799_clip:=extensions.st_setpoint(v_oh799_clip,0,v_oh800_oh799);
  v_oh799_clip:=extensions.st_setpoint(
    v_oh799_clip,extensions.st_npoints(v_oh799_clip)-1,v_oh799_kennedy
  );
  v_oh799_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    extensions.st_asgeojson(v_oh799_clip,15)
  ),4326);

  v_fraction_start:=extensions.st_linelocatepoint(v_douglas,v_us22_douglas);
  v_fraction_end:=extensions.st_linelocatepoint(v_douglas,v_douglas_kennedy);
  if v_fraction_start<v_fraction_end then
    v_douglas_clip:=extensions.st_linesubstring(
      v_douglas,v_fraction_start,v_fraction_end
    );
  else
    v_douglas_clip:=extensions.st_reverse(extensions.st_linesubstring(
      v_douglas,v_fraction_end,v_fraction_start
    ));
  end if;
  v_douglas_clip:=extensions.st_setpoint(v_douglas_clip,0,v_us22_douglas);
  v_douglas_clip:=extensions.st_setpoint(
    v_douglas_clip,extensions.st_npoints(v_douglas_clip)-1,v_douglas_kennedy
  );
  v_douglas_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    extensions.st_asgeojson(v_douglas_clip,15)
  ),4326);

  v_fraction_start:=extensions.st_linelocatepoint(v_us22,v_us250_us22);
  v_fraction_end:=extensions.st_linelocatepoint(v_us22,v_us22_douglas);
  if v_fraction_start<v_fraction_end then
    v_us22_clip:=extensions.st_linesubstring(
      v_us22,v_fraction_start,v_fraction_end
    );
  else
    v_us22_clip:=extensions.st_reverse(extensions.st_linesubstring(
      v_us22,v_fraction_end,v_fraction_start
    ));
  end if;
  v_us22_clip:=extensions.st_setpoint(v_us22_clip,0,v_us250_us22);
  v_us22_clip:=extensions.st_setpoint(
    v_us22_clip,extensions.st_npoints(v_us22_clip)-1,v_us22_douglas
  );
  v_us22_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    extensions.st_asgeojson(v_us22_clip,15)
  ),4326);

  if pg_catalog.md5(extensions.st_asgeojson(v_oh800_clip,7))<>'86f39cd1256bcf12a1ca8bfa0803429c'
     or pg_catalog.round(
       (extensions.st_length(v_oh800_clip::extensions.geography)/1609.344)::numeric,6
     )<>1.399999::numeric
     or pg_catalog.md5(extensions.st_asgeojson(v_oh799_clip,7))<>'4e7b00d3a709f44268c28a66bb503550'
     or pg_catalog.round(
       (extensions.st_length(v_oh799_clip::extensions.geography)/1609.344)::numeric,6
     )<>2.755169::numeric
     or pg_catalog.md5(extensions.st_asgeojson(v_douglas_clip,7))<>'7568ab9fe3a8154c85f98c98c27beaca'
     or pg_catalog.round(
       (extensions.st_length(v_douglas_clip::extensions.geography)/1609.344)::numeric,6
     )<>0.752076::numeric
     or not extensions.st_issimple(v_us22_clip)
     or extensions.st_npoints(v_us22_clip)<>445
     or pg_catalog.md5(extensions.st_asgeojson(v_us22_clip,7))<>'9c2e718906e7e7583dd43881f7235525'
     or pg_catalog.round(
       (extensions.st_length(v_us22_clip::extensions.geography)/1609.344)::numeric,6
     )<>9.085465::numeric then
    raise exception 'Frozen named-approach public-road clip drifted';
  end if;

  for v_iteration in 1..80 loop
    v_middle:=(v_low+v_high)/2;
    if extensions.st_length(
         extensions.st_linesubstring(v_douglas_clip,0,v_middle)::extensions.geography
       )<v_target_metres then
      v_low:=v_middle;
    else
      v_high:=v_middle;
    end if;
  end loop;
  v_cardinal_clip:=extensions.st_linesubstring(
    v_douglas_clip,0,(v_low+v_high)/2
  );
  v_cardinal_clip:=extensions.st_setpoint(
    v_cardinal_clip,0,v_us22_douglas
  );
  v_cardinal_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    extensions.st_asgeojson(v_cardinal_clip,15)
  ),4326);
  if pg_catalog.abs(
       extensions.st_length(v_cardinal_clip::extensions.geography)-v_target_metres
     )>0.01
     or pg_catalog.round(
       (extensions.st_length(v_cardinal_clip::extensions.geography)/1609.344)::numeric,6
     )<>0.400000::numeric
     or not extensions.st_coveredby(
       v_cardinal_clip,
       extensions.st_buffer(v_douglas::extensions.geography,0.05)::extensions.geometry
     ) then
    raise exception 'CARDINAL reviewed 0.4-mile Douglas clip proof failed';
  end if;

  for v_target in
    select * from tmp_issue97_harrison_named_targets
    order by pad_id,release_variant_index
  loop
    select * into strict v_route
    from public.brinesearch_route_prep
    where id=v_target.route_prep_id;

    case v_target.core_kind
      when 'freeport_standard' then
        v_steps:=pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'order',1,'kind','continue','displayName','OH-800',
            'instruction','Head north on OH-800 for 1.4 miles',
            'distanceMiles',1.399999::numeric,
            'verifiedDesignations',pg_catalog.jsonb_build_array(
              'OH-800','Route 800','SR 800','SR-800','FREEPORT TIPPECANOE RD'
            )
          ),
          pg_catalog.jsonb_build_object(
            'order',2,'kind','turn','displayName','OH-799',
            'instruction','Take a slight right onto OH-799 east',
            'distanceMiles',2.755169::numeric,
            'verifiedDesignations',pg_catalog.jsonb_build_array(
              'OH-799','Route 799','SR 799','SR-799','CLENDENING LAKE RD'
            )
          )
        );
        v_geometry:=pg_catalog.jsonb_build_object(
          'type','FeatureCollection','features',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',1),
              'geometry',extensions.st_asgeojson(v_oh800_clip,7)::jsonb
            ),
            pg_catalog.jsonb_build_object(
              'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',2),
              'geometry',extensions.st_asgeojson(v_oh799_clip,7)::jsonb
            )
          )
        );
        v_ingress:=pg_catalog.jsonb_build_object(
          'role','exact_approved_ingress','label','OH-800 south of Freeport',
          'latitude',40.210926558::double precision,
          'longitude',-81.262609666::double precision
        );
        v_core_end:=pg_catalog.jsonb_build_object(
          'role','exact_approved_handoff','label','OH-799 at Kennedy Ridge Rd',
          'latitude',40.2310665::double precision,
          'longitude',-81.2016988::double precision
        );
        v_handoff:=pg_catalog.jsonb_build_object(
          'originMode','current_location_to_named_ingress',
          'handoffMode','verified_compact',
          'waypoints',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('latitude',40.210926558::double precision,'longitude',-81.262609666::double precision),
            pg_catalog.jsonb_build_object('latitude',40.2273687::double precision,'longitude',-81.2472549::double precision),
            pg_catalog.jsonb_build_object('latitude',40.2310665::double precision,'longitude',-81.2016988::double precision)
          )
        );
        v_line_digest:='86f39cd1256bcf12a1ca8bfa0803429c|4e7b00d3a709f44268c28a66bb503550';
      when 'freeport_oh799_only' then
        v_steps:=pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'order',1,'kind','continue','displayName','OH-799',
            'instruction','Continue east on OH-799 from the OH-800 junction',
            'distanceMiles',2.755169::numeric,
            'verifiedDesignations',pg_catalog.jsonb_build_array(
              'OH-799','Route 799','SR 799','SR-799','CLENDENING LAKE RD'
            )
          )
        );
        v_geometry:=pg_catalog.jsonb_build_object(
          'type','FeatureCollection','features',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',1),
              'geometry',extensions.st_asgeojson(v_oh799_clip,7)::jsonb
            )
          )
        );
        v_ingress:=pg_catalog.jsonb_build_object(
          'role','exact_approved_ingress','label','OH-800 at OH-799',
          'latitude',40.2273687::double precision,
          'longitude',-81.2472549::double precision
        );
        v_core_end:=pg_catalog.jsonb_build_object(
          'role','exact_approved_handoff','label','OH-799 at Kennedy Ridge Rd',
          'latitude',40.2310665::double precision,
          'longitude',-81.2016988::double precision
        );
        v_handoff:=pg_catalog.jsonb_build_object(
          'originMode','current_location_to_named_ingress',
          'handoffMode','verified_compact',
          'waypoints',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('latitude',40.2273687::double precision,'longitude',-81.2472549::double precision),
            pg_catalog.jsonb_build_object('latitude',40.2310665::double precision,'longitude',-81.2016988::double precision)
          )
        );
        v_line_digest:='4e7b00d3a709f44268c28a66bb503550';
      when 'cadiz_douglas' then
        v_steps:=pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'order',1,'kind','continue','displayName','US-22',
            'instruction','Continue west on US-22 toward Douglas Turn Rd',
            'distanceMiles',9.085465::numeric,
            'verifiedDesignations',pg_catalog.jsonb_build_array(
              'US-22','US Route 22','US 22'
            )
          ),
          pg_catalog.jsonb_build_object(
            'order',2,'kind','turn','displayName','Douglas Turn Rd',
            'instruction','Turn right onto Douglas Turn Rd',
            'distanceMiles',0.752076::numeric,
            'verifiedDesignations',pg_catalog.jsonb_build_array(
              'Douglas Turn Rd','CR-33','County Road 33'
            )
          )
        );
        v_geometry:=pg_catalog.jsonb_build_object(
          'type','FeatureCollection','features',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',1),
              'geometry',extensions.st_asgeojson(v_us22_clip,7)::jsonb
            ),
            pg_catalog.jsonb_build_object(
              'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',2),
              'geometry',extensions.st_asgeojson(v_douglas_clip,7)::jsonb
            )
          )
        );
        v_ingress:=pg_catalog.jsonb_build_object(
          'role','exact_approved_ingress','label','US-250 at US-22 near Cadiz',
          'latitude',40.2779786::double precision,
          'longitude',-81.0128649::double precision
        );
        v_core_end:=pg_catalog.jsonb_build_object(
          'role','exact_approved_handoff','label','Douglas Turn Rd at Kennedy Ridge Rd',
          'latitude',40.2198834::double precision,
          'longitude',-81.1374484::double precision
        );
        v_handoff:=pg_catalog.jsonb_build_object(
          'originMode','current_location_to_named_ingress',
          'handoffMode','verified_compact',
          'waypoints',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('latitude',40.2779786::double precision,'longitude',-81.0128649::double precision),
            pg_catalog.jsonb_build_object('latitude',40.2111424::double precision,'longitude',-81.1323685::double precision),
            pg_catalog.jsonb_build_object('latitude',40.2198834::double precision,'longitude',-81.1374484::double precision)
          )
        );
        v_line_digest:='9c2e718906e7e7583dd43881f7235525|7568ab9fe3a8154c85f98c98c27beaca';
      when 'cadiz_cardinal_clip' then
        v_steps:=pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'order',1,'kind','continue','displayName','US-22',
            'instruction','Continue west on US-22 toward Douglas Turn Rd',
            'distanceMiles',9.085465::numeric,
            'verifiedDesignations',pg_catalog.jsonb_build_array(
              'US-22','US Route 22','US 22'
            )
          ),
          pg_catalog.jsonb_build_object(
            'order',2,'kind','turn','displayName','Douglas Turn Rd',
            'instruction','Turn right onto Douglas Turn Rd and continue 0.4 mile',
            'distanceMiles',0.400000::numeric,
            'verifiedDesignations',pg_catalog.jsonb_build_array(
              'Douglas Turn Rd','CR-33','County Road 33'
            )
          )
        );
        v_geometry:=pg_catalog.jsonb_build_object(
          'type','FeatureCollection','features',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',1),
              'geometry',extensions.st_asgeojson(v_us22_clip,7)::jsonb
            ),
            pg_catalog.jsonb_build_object(
              'type','Feature','properties',pg_catalog.jsonb_build_object('stepOrder',2),
              'geometry',extensions.st_asgeojson(v_cardinal_clip,7)::jsonb
            )
          )
        );
        v_ingress:=pg_catalog.jsonb_build_object(
          'role','exact_approved_ingress','label','US-250 at US-22 near Cadiz',
          'latitude',40.2779786::double precision,
          'longitude',-81.0128649::double precision
        );
        v_core_end:=pg_catalog.jsonb_build_object(
          'role','exact_approved_handoff','label','CARDINAL reviewed Douglas Turn endpoint',
          'latitude',pg_catalog.round(extensions.st_y(extensions.st_endpoint(v_cardinal_clip))::numeric,7),
          'longitude',pg_catalog.round(extensions.st_x(extensions.st_endpoint(v_cardinal_clip))::numeric,7)
        );
        v_handoff:=pg_catalog.jsonb_build_object(
          'originMode','current_location_to_named_ingress',
          'handoffMode','verified_compact',
          'waypoints',pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('latitude',40.2779786::double precision,'longitude',-81.0128649::double precision),
            pg_catalog.jsonb_build_object('latitude',40.2111424::double precision,'longitude',-81.1323685::double precision),
            pg_catalog.jsonb_build_object(
              'latitude',pg_catalog.round(extensions.st_y(extensions.st_endpoint(v_cardinal_clip))::numeric,7),
              'longitude',pg_catalog.round(extensions.st_x(extensions.st_endpoint(v_cardinal_clip))::numeric,7)
            )
          )
        );
        v_line_digest:='9c2e718906e7e7583dd43881f7235525|'||
          pg_catalog.md5(extensions.st_asgeojson(v_cardinal_clip,7));
      else
        raise exception 'Unsupported named core kind %',v_target.core_kind;
    end case;

    v_destination:=pg_catalog.jsonb_build_object(
      'role','saved_pad_destination',
      'label',v_target.pad_name||' saved pad GPS',
      'latitude',v_target.destination_latitude,
      'longitude',v_target.destination_longitude
    );

    v_route_receipt_digest:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'route',pg_catalog.to_jsonb(v_route),
        'steps',(select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(row_value) order by row_value.step_order
        ),'[]'::jsonb) from public.brinesearch_route_prep_steps row_value
          where row_value.route_prep_id=v_target.route_prep_id),
        'occurrences',(select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(row_value) order by row_value.occurrence_index
        ),'[]'::jsonb) from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value
          where row_value.route_prep_id=v_target.route_prep_id),
        'transitions',(select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(row_value) order by row_value.boundary_index
        ),'[]'::jsonb) from private_verification.brinesearch_route_transition_receipts_issue97 row_value
          where row_value.route_prep_id=v_target.route_prep_id),
        'geometryReceipts',(select coalesce(pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(row_value) order by row_value.occurrence_index
        ),'[]'::jsonb) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 row_value
          where row_value.route_prep_id=v_target.route_prep_id)
      )::text,'UTF8'),'sha256'),'hex');

    select base.base_bundle into strict v_base_bundle
    from tmp_issue97_harrison_base_status base
    where base.pad_id=v_target.pad_id;
    v_status_revision:=pg_catalog.lower(
      coalesce(v_base_bundle#>>'{status,statusRevision}','')
    );
    if v_status_revision!~'^[0-9a-f]{32,64}$'
       or v_status_revision<>v_target.expected_base_status_revision
       or v_base_bundle#>>'{status,route,source}'<>'legacy_written'
       or v_base_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
       or v_base_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
      raise exception '% base driver revision/authority checkpoint diverged',
        v_target.pad_name;
    end if;

    v_evidence:=pg_catalog.jsonb_build_object(
      'issue',97,
      'contract','named_exact_public_road_core_plus_saved_gps_destination',
      'sourceRoutePrepId',v_target.route_prep_id,
      'sourceSequenceHash',v_target.source_sequence_hash,
      'sourceRouteSnapshot',pg_catalog.jsonb_build_object(
        'scope','frozen_source_snapshot_not_full_route_readiness',
        'routeGroup',v_target.source_route_group,
        'variantIndex',v_target.source_variant_index,
        'readinessStatus',v_target.source_readiness_status,
        'routeRowDigest',v_target.source_route_row_digest,
        'stepCount',v_target.source_step_count,
        'stepDigest',v_target.source_step_digest,
        'occurrenceCount',v_target.source_occurrence_count,
        'resolvedOccurrenceCount',v_target.source_resolved_occurrence_count,
        'occurrenceDigest',v_target.source_occurrence_digest,
        'transitionCount',v_target.source_transition_count,
        'resolvedTransitionCount',v_target.source_resolved_transition_count,
        'transitionDigest',v_target.source_transition_digest,
        'geometryReceiptCount',v_target.source_geometry_count,
        'resolvedGeometryReceiptCount',v_target.source_resolved_geometry_count,
        'geometryReceiptDigest',v_target.source_geometry_digest,
        'snapshotDigest',v_route_receipt_digest,
        'preflightPinned',true,
        'fullRouteReadinessClaimed',false
      ),
      'ownerAuthorization',pg_catalog.jsonb_build_object(
        'scope','six_harrison_pads_two_named_public_road_cores',
        'authority','route_specific_owner_reviewed_named_release',
        'globalRoadPolicyChanged',false,
        'douglasApprovedByDefault',false
      ),
      'exactCoreMappings',(select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'mappingId',mapping.mapping_id,
          'identityId',mapping.identity_id,
          'roadId',mapping.road_id,
          'mappingRowDigest',mapping.mapping_row_digest,
          'approvedByDefault',mapping.approved_by_default
        ) order by mapping.mapping_id
      ) from tmp_issue97_harrison_core_mappings mapping),
      'exactCoreJunctions',(select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'junctionId',junction.junction_id,
          'junctionGraphDigest',junction.junction_graph_digest,
          'leftIdentityId',junction.left_identity_id,
          'leftRoadId',junction.left_road_id,
          'rightIdentityId',junction.right_identity_id,
          'rightRoadId',junction.right_road_id
        ) order by junction.junction_id
      ) from tmp_issue97_harrison_core_junctions junction),
      'baseStatusRevision',v_status_revision,
      'currentGraphBuildId',v_graph.id,
      'currentGraphDigest',v_graph.graph_digest,
      'coreKind',v_target.core_kind,
      'coreLineDigest',v_line_digest,
      'destinationRole','saved_pad_destination',
      'gpsSelectedRoad',false,
      'nearestRoadMatching',false,
      'fuzzyMatching',false,
      'nameOnlyMatching',false,
      'privateAccessGeometryCreated',false,
      'approvedGeometryReachesDestination',false,
      'fullSourceRouteReadyClaimed',false,
      'globalRoadApprovalChanged',false,
      'publicGoogleRowsCreated',false,
      'cutoverChanged',false
    );

    v_release.release_id:=v_target.release_id;
    v_release.pad_id:=v_target.pad_id;
    v_release.approach_key:=v_target.approach_key;
    v_release.approach_label:=v_target.approach_label;
    v_release.route_group:=v_target.release_route_group;
    v_release.variant_index:=v_target.release_variant_index;
    v_release.release_version:='v18-named-approach-v1';
    v_release.route_prep_id:=v_target.route_prep_id;
    v_release.source_sequence:=v_target.source_sequence;
    v_release.source_sequence_hash:=v_target.source_sequence_hash;
    v_release.route_revision:=1;
    v_release.route_receipt_digest:=v_route_receipt_digest;
    v_release.graph_build_id:=v_graph.id;
    v_release.graph_digest:=v_graph.graph_digest;
    v_release.steps:=v_steps;
    v_release.geometry:=v_geometry;
    v_release.ingress:=v_ingress;
    v_release.core_end:=v_core_end;
    v_release.destination:=v_destination;
    v_release.final_leg_mode:='google_to_saved_gps_unapproved';
    v_release.handoff:=v_handoff;
    v_release.last_verified_at:=v_graph.activated_at;
    v_release.status_revision:=v_status_revision;
    v_release.evidence:=v_evidence;
    v_release.published_at:=v_published_at;
    v_release.revoked_at:=null;
    v_release.release_digest:=
      private_verification.brinesearch_v18_named_approach_release_digest(
        v_release
      );

    insert into private_verification.brinesearch_v18_named_approach_releases(
      release_id,pad_id,approach_key,approach_label,route_group,variant_index,
      release_version,route_prep_id,source_sequence,source_sequence_hash,
      route_revision,route_receipt_digest,graph_build_id,graph_digest,steps,
      geometry,ingress,core_end,destination,final_leg_mode,handoff,
      last_verified_at,status_revision,evidence,release_digest,published_at,
      revoked_at
    ) values(
      v_release.release_id,v_release.pad_id,v_release.approach_key,
      v_release.approach_label,v_release.route_group,v_release.variant_index,
      v_release.release_version,v_release.route_prep_id,
      v_release.source_sequence,v_release.source_sequence_hash,
      v_release.route_revision,v_release.route_receipt_digest,
      v_release.graph_build_id,v_release.graph_digest,v_release.steps,
      v_release.geometry,v_release.ingress,v_release.core_end,
      v_release.destination,v_release.final_leg_mode,v_release.handoff,
      v_release.last_verified_at,v_release.status_revision,v_release.evidence,
      v_release.release_digest,v_release.published_at,v_release.revoked_at
    );

    insert into public.brinesearch_driver_named_approach_releases_public(
      release_id,pad_id,approach_key,approach_label,route_group,variant_index,
      release_version,route_revision,steps,geometry,ingress,core_end,
      destination,final_leg_mode,handoff,last_verified_at,status_revision,
      release_digest,published_at
    ) values(
      v_release.release_id,v_release.pad_id,v_release.approach_key,
      v_release.approach_label,v_release.route_group,v_release.variant_index,
      v_release.release_version,v_release.route_revision,v_release.steps,
      v_release.geometry,v_release.ingress,v_release.core_end,
      v_release.destination,v_release.final_leg_mode,v_release.handoff,
      v_release.last_verified_at,v_release.status_revision,
      v_release.release_digest,v_release.published_at
    );
  end loop;
end
$release$;

do $postflight$
declare
  v_before tmp_issue97_harrison_named_before%rowtype;
  v_target record;
  v_bundle jsonb;
begin
  select * into strict v_before from tmp_issue97_harrison_named_before;

  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_named_approach_route_prep_idx'
     ) is null
     or pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_named_approach_graph_build_idx'
     ) is null
     or not exists(
       select 1 from pg_catalog.pg_index index_row
       where index_row.indexrelid=
         'private_verification.brinesearch_v18_named_approach_route_prep_idx'::pg_catalog.regclass
         and index_row.indisvalid and index_row.indisready
     )
     or not exists(
       select 1 from pg_catalog.pg_index index_row
       where index_row.indexrelid=
         'private_verification.brinesearch_v18_named_approach_graph_build_idx'::pg_catalog.regclass
         and index_row.indisvalid and index_row.indisready
     ) then
    raise exception 'Named-approach foreign-key indexes are not ready';
  end if;

  if (select count(*)
      from private_verification.brinesearch_v18_named_approach_releases)<>12
     or (select count(*)
         from public.brinesearch_driver_named_approach_releases_public)<>12
     or (select count(distinct pad_id)
         from private_verification.brinesearch_v18_named_approach_releases)<>6
     or exists(
       select 1
       from private_verification.brinesearch_v18_named_approach_releases
       group by pad_id
       having count(*)<>2
          or count(*) filter(where approach_key='via_freeport'
                                and approach_label='Via Freeport'
                                and route_group='primary'
                                and variant_index=1)<>1
          or count(*) filter(where approach_key='via_cadiz'
                                and approach_label='Via Cadiz'
                                and route_group='alternate'
                                and variant_index=2)<>1
     ) then
    raise exception 'Named approach release counts/labels diverged';
  end if;

  for v_target in select * from tmp_issue97_harrison_named_targets loop
    if private_verification.brinesearch_v18_named_approach_release_receipt_active(
         v_target.release_id
       ) is not true then
      raise exception '% % immutable receipt is not active',
        v_target.pad_name,v_target.approach_label;
    end if;
  end loop;

  for v_target in
    select distinct pad_id,pad_name
    from tmp_issue97_harrison_named_targets
  loop
    v_bundle:=public.brinesearch_v18_driver_pad_status_with_named_approaches(
      v_target.pad_id
    );
    if pg_catalog.jsonb_array_length(v_bundle->'namedApproaches')<>2
       or not exists(
         select 1 from pg_catalog.jsonb_array_elements(
           v_bundle->'namedApproaches'
         ) approach
         where approach->>'approachKey'='via_freeport'
           and approach->>'approachLabel'='Via Freeport'
           and approach->>'routeGroup'='primary'
           and approach->>'variantIndex'='1'
           and approach->>'finalLegMode'='google_to_saved_gps_unapproved'
           and approach#>>'{destination,role}'='saved_pad_destination'
           and pg_catalog.jsonb_array_length(approach->'steps')>0
           and pg_catalog.jsonb_array_length(
             approach#>'{geometry,features}'
           )>0
       )
       or not exists(
         select 1 from pg_catalog.jsonb_array_elements(
           v_bundle->'namedApproaches'
         ) approach
         where approach->>'approachKey'='via_cadiz'
           and approach->>'approachLabel'='Via Cadiz'
           and approach->>'routeGroup'='alternate'
           and approach->>'variantIndex'='2'
           and approach->>'finalLegMode'='google_to_saved_gps_unapproved'
           and approach#>>'{destination,role}'='saved_pad_destination'
           and pg_catalog.jsonb_array_length(approach->'steps')>0
           and pg_catalog.jsonb_array_length(
             approach#>'{geometry,features}'
           )>0
       )
       or v_bundle#>>'{status,route,source}'<>'legacy_written'
       or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
       or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
      raise exception '% atomic driver named-approach contract failed',
        v_target.pad_name;
    end if;
  end loop;

  if public.brinesearch_v18_driver_pad_status_with_named_approaches(
       '518659d9-bca2-47b0-b294-3141ba679fc4'
     ) is distinct from v_before.lasso_bundle
     or public.brinesearch_v18_driver_pad_status_with_named_approaches(
       'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
     ) is distinct from v_before.cologie_bundle then
    raise exception 'LASSO or Cologie regression failed';
  end if;

  if (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from private_verification.brinesearch_v18_core_destination_releases row_value)
       is distinct from v_before.core_private_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_core_destination_releases_public row_value)
       is distinct from v_before.core_public_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_google_routes_public row_value)
       is distinct from v_before.google_route_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_google_handoffs_public row_value)
       is distinct from v_before.google_handoff_digest
     or (select pg_catalog.to_jsonb(row_value)
         from public.brinesearch_issue97_release_state row_value
         where row_value.singleton) is distinct from v_before.cutover_state
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_road_graph_builds row_value)
       is distinct from v_before.graph_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_route_prep row_value)
       is distinct from v_before.route_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.brinesearch_route_prep_steps row_value)
       is distinct from v_before.route_step_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,row_value.occurrence_index
     ),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 row_value)
       is distinct from v_before.occurrence_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,row_value.boundary_index
     ),'')) from private_verification.brinesearch_route_transition_receipts_issue97 row_value)
       is distinct from v_before.transition_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.route_prep_id::text,row_value.occurrence_index
     ),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 row_value)
       is distinct from v_before.geometry_receipt_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.id::text
     ),'')) from public.pads row_value) is distinct from v_before.pad_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pg_catalog.to_jsonb(row_value)::text,'|' order by row_value.pad_id::text
     ),'')) from public.brinesearch_driver_directions_public row_value)
       is distinct from v_before.direction_digest then
    raise exception 'Protected graph/route/Google/pad/direction authority changed';
  end if;
end
$postflight$;
