-- GitHub Issue #97 -- permanent frozen-mapping-wave production pins.
--
-- Fixed, observational authority for the post-install/pre-activation boundary.
-- The caller owns BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY and ROLLBACK.
-- This include has one SELECT, no caller input, no persistent DDL/DML, and no
-- builder, mapper, activation, reconciliation, Google-publication, or cutover
-- mutation. A false assertion raises a deterministic labeled cast error before
-- any receipt.

with
provenance as materialized (
  select
    'data/issue-97-authoritative-road-junction-graph'::text as branch,
    '8ee6c615d97f99df0ae850d05745b8750414c81c'::text as git_head,
    '8498e76645549fcfccfc735ef29357784020f594'::text as git_tree,
    'issue97-frozen-wave-permanent-install-20260822T005303499Z'::text
      as permanent_attempt_id,
    '2EF87642C61E858D0CB90E8E80807423EC7213F569F882EE0CE6ED1E6CEA0E70'::text
      as permanent_sql_sha256,
    '0108179B55595E189F0C466AB6F51353BD694EEA1B466C88221035C310C3E65F'::text
      as rehearsal_sha256,
    'f9737e813f18f2e9c6a35e2280dc1f1e93b823c9'::text as rehearsal_blob,
    '6DFBE9983E5F1BA840C32A5F06B2203EE46C9E3EEBC3D475BF9370341D806B7A'::text
      as migration_sha256,
    'eb8839fdc4eccd0c6ad2dceb2e680c60afab466b'::text as migration_blob,
    '317b2b649059f3f41bc510e3ac63a439'::text as migration_md5,
    '6FCEE70C9F8B8DAAFCEDAAEEB25239120B8A522653495AEBCDB08443201A65C9'::text
      as route_manifest_sha256,
    '298ea15bfd7f8d388f819db07841e2ba2d54c905'::text as route_manifest_blob,
    'C0FD1808A0A8AC54537668518DC580B7643A878FFAF0EB29CBB9E2E9EF42A6A1'::text
      as permanent_stdout_sha256,
    '1A006B2100AE2B89E420689B530D414047E3427B8CFEBEAAC9613DD0A1659DE8'::text
      as permanent_stderr_sha256,
    'C01B6B0181849ED4381DB411504D91A64AF5BCE57C26C46BBEA179F3815CD838'::text
      as frozen_route_block_sha256,
    'issue97-release-20260815-r2'::text as release_generation,
    'c3f925954d41cb6fbd5939eca5de3288'::text as candidate_set_digest,
    '043d969160dded7b9ff3526b6b09b752'::text as transition_identity_digest,
    'fd835556c06d4b067ca01ff8329a5d1c'::text as transition_road_digest,
    'cf20cef7b1f18ea57afbfee9a6f5202e'::text as transition_pair_digest,
    '0b89d8b7f7969a95b6d94f270cd81ccc'::text as typed_transition_digest,
    '711b1ddd3ba6c47e7642fc700197432f'::text as route_digest,
    '450948793c57a9a1535139fac4974792'::text as google_pad_digest,
    '5a75e5c4c34805b7dc2fdf8d0534a4f6'::text as google_tuple_digest
),
function_expected(label,signature,definition_md5) as (
  values
    ('builder','public.brinesearch_issue97_rebuild_county_graph(text,text)',
      '06705f5b35a6d37151bb2c0dc5ade9bd'),
    ('county_exact_mapper',
      'private_verification.brinesearch_issue97_refresh_exact_mappings_oh(text)',
      '3ee125bc5e6e3d65e7ea290ef1dc908e'),
    ('sources_current',
      'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)',
      '5653fb3e85b9a9962dbcc9f5af0329e7'),
    ('release_current',
      'private_verification.brinesearch_issue97_graph_build_release_current(uuid)',
      '6471a34ccf42d058b846776d23cb0216'),
    ('state_manifest_integrity',
      'private_verification.brinesearch_issue97_state_candidate_manifest_integrity(uuid)',
      '75d25d5298c59869b656bb9db3cc3fe2'),
    ('release_receipt_trigger',
      'private_verification.brinesearch_issue97_stamp_graph_release_receipt()',
      'e3c8fa406c6b4631b25e95a7ebb6d2d2'),
    ('mapping_evidence',
      'private_verification.brinesearch_issue97_graph_mapping_evidence(text,jsonb)',
      '4e2dd7caa6e3b654c96d50872ae4d1e8'),
    ('mapping_fingerprint_v2',
      'private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(uuid)',
      'e1b8a34d2cf86bac69877dea283b93aa'),
    ('activation',
      'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)',
      '73eb9adbfd16ea671873da7b4e495f73')
),
function_state as materialized (
  select count(*)::integer as expected_count,
    count(*) filter (
      where pg_catalog.to_regprocedure(signature) is not null
        and pg_catalog.md5(pg_catalog.pg_get_functiondef(
          pg_catalog.to_regprocedure(signature)
        ))=definition_md5
    )::integer as exact_count
  from function_expected
),
active_release_generation_state as materialized (
  select count(*) filter(where generation.active)::integer as active_rows,
    count(*) filter(where generation.active
      and generation.generation_key=provenance.release_generation)::integer
      as exact_rows
  from private_verification.brinesearch_issue97_graph_release_generations generation
  cross join provenance
),
target_source(
  identity_id,road_id,evidence_basis,expected_source_digest,expected_road_row_md5
) as (
  values
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
('fb216029-dd42-ec15-192f-9192823a0601','a80366a3-06e0-4a0a-970d-7df6c2b7a205','exact_base_nlf_source_street_core','a5eab1a32bba2caa2b0f0e0d6fcdbda3','a6931700b1640e47cb8868eebde3630a')
),
target_pairs as materialized (
  select identity_id::uuid as identity_id,road_id::uuid as road_id,
    evidence_basis,expected_source_digest,expected_road_row_md5
  from target_source
),
-- ISSUE97_MACHINE_TRANSITION_CONTRACT_BEGIN
machine_contract as materialized (
  select contract.*
  from pg_catalog.jsonb_to_recordset(
    $issue97_file37_machine_contract$
[
    {"county_code":"BEL","identity_id":"0ee37e9a-6dd3-a186-8d3c-fc7dae6bccf1","source_identity_key":"OH:ODOT:NLF:SBELSR00026**C","prior_road_id":null,"road_id":"0a96a8b7-e9f6-4607-8d09-20cd3793ff8d","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:BEL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":21,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"BEL","identity_id":"32151137-5710-e8d5-f106-83f5059b1d1d","source_identity_key":"OH:ODOT:NLF:SBELSR00007**N","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:BEL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":55,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"BEL","identity_id":"4164e40d-9d86-bb26-0950-e590bc53cb15","source_identity_key":"OH:ODOT:NLF:SBELSR00265**C","prior_road_id":null,"road_id":"154688cf-a3d1-4c2f-bf9c-65b15ab424a4","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:BEL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":3,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"BEL","identity_id":"54c74ce8-54b5-69c9-f8ef-2bc5a59e6a3e","source_identity_key":"OH:ODOT:NLF:SBELSR00007**C","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:BEL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":88,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"BEL","identity_id":"b56195f1-296a-834e-f5e8-2df1ae3f197e","source_identity_key":"OH:ODOT:NLF:SBELSR00800**C","prior_road_id":null,"road_id":"0a8a8721-4d20-41bf-8d95-ec069173e584","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:BEL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":96,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"CAR","identity_id":"3a93792d-6725-df4b-de04-5a4075602ffc","source_identity_key":"OH:ODOT:NLF:SCARSR00332**N","prior_road_id":null,"road_id":"5ae10d76-e896-40bb-aecf-8d23f512e195","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:CAR","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":2,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"CAR","identity_id":"43bbec47-3530-415d-dd5d-0fbb54371081","source_identity_key":"OH:ODOT:NLF:SCARSR00644**C","prior_road_id":null,"road_id":"102d9976-3801-42dc-a716-ee1540364f8f","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:CAR","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":2,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"2855fb26-753f-59b0-07c7-d4a2f6aba39f","source_identity_key":"OH:ODOT:NLF:SCOLSR00039**N:COMP:2025_000000000279471","prior_road_id":null,"road_id":"cf05fdb2-fcdf-4f63-bd6b-73a4d11e2eac","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":2,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"3fb3e3cb-c746-f0f0-a7ba-878ec19b0377","source_identity_key":"OH:ODOT:NLF:SCOLSR00039**N:COMP:2025_000000000279476","prior_road_id":null,"road_id":"cf05fdb2-fcdf-4f63-bd6b-73a4d11e2eac","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":3,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"461650e7-4b29-3cff-9b4b-c1b8a193b334","source_identity_key":"OH:ODOT:NLF:SCOLSR00039**N:COMP:2025_000000000279472","prior_road_id":null,"road_id":"cf05fdb2-fcdf-4f63-bd6b-73a4d11e2eac","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":6,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"6f59b210-36e1-44d7-df41-37f50f5c6eb8","source_identity_key":"OH:ODOT:NLF:SCOLSR00007**N:COMP:2025_000000000279243","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":4,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"7784a008-3f9e-371d-3a59-a1915b1bdd49","source_identity_key":"OH:ODOT:NLF:SCOLSR00644**C:COMP:2025_000000000279950","prior_road_id":null,"road_id":"102d9976-3801-42dc-a716-ee1540364f8f","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":8,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"7b5d1a0d-c06a-7b02-ccfd-3f6abb8a189d","source_identity_key":"OH:ODOT:NLF:SCOLUS00030**N","prior_road_id":null,"road_id":"77bf1737-51e7-46b6-887c-87305375a99d","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":31,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"90bdcebf-84fc-9640-0685-a227641106b1","source_identity_key":"OH:ODOT:NLF:SCOLSR00007**N:COMP:2025_000000000279246","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":2,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"ca52407a-1833-2053-8c74-53eceb0b7575","source_identity_key":"OH:ODOT:NLF:SCOLSR00007**N:COMP:2025_000000000279231","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":17,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"COL","identity_id":"e8e05a84-aa1e-2d4c-0cac-811603c9fdb5","source_identity_key":"OH:ODOT:NLF:SCOLSR00039**C","prior_road_id":null,"road_id":"cf05fdb2-fcdf-4f63-bd6b-73a4d11e2eac","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:COL","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":126,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"GUE","identity_id":"66f40934-5581-0323-e48b-146b45bc1ff9","source_identity_key":"OH:ODOT:NLF:SGUESR00265**C:COMP:2025_000000000296098","prior_road_id":null,"road_id":"154688cf-a3d1-4c2f-bf9c-65b15ab424a4","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:GUE","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":1,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"GUE","identity_id":"8adcad23-2788-1529-5c26-f33a4802c3e4","source_identity_key":"OH:ODOT:NLF:SGUESR00800**C","prior_road_id":null,"road_id":"0a8a8721-4d20-41bf-8d95-ec069173e584","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:GUE","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":10,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"GUE","identity_id":"d10313c3-7906-b64c-794b-390c8010beed","source_identity_key":"OH:ODOT:NLF:SGUESR00146**C","prior_road_id":null,"road_id":"89023472-5bbd-4bf9-b9a4-27d09e7856c9","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:GUE","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":35,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"GUE","identity_id":"e97fa7be-fa8e-95f4-daca-b50eba962456","source_identity_key":"OH:ODOT:NLF:SGUESR00313**C:COMP:2025_000000000296158","prior_road_id":null,"road_id":"40d2fcd0-8205-44dc-a4de-a650d46ad890","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:GUE","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":2,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"HAS","identity_id":"100e158e-9b85-f169-ae1e-cbb88b9f18fa","source_identity_key":"OH:ODOT:NLF:CHASCR00044**C","prior_road_id":"7fe5f642-bfdc-4d5f-9f54-85f9b15af741","road_id":"7fe5f642-bfdc-4d5f-9f54-85f9b15af741","prior_mapping_status":"verified","final_mapping_status":"verified","prior_mapping_method":"exact_route_designation","final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"CHASCR00044**C|route:CR:44"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":25,"raw_transition_class":"UNCHANGED_OR_INVALID"},
    {"county_code":"HAS","identity_id":"1a09df0d-e31b-52a9-1d1d-6434e02546f5","source_identity_key":"OH:ODOT:NLF:CHASCR00060**C","prior_road_id":"f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965","road_id":"f9ee9c0b-290f-4ffe-a62b-a4d9a4b52965","prior_mapping_status":"verified","final_mapping_status":"verified","prior_mapping_method":"exact_route_designation","final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"CHASCR00060**C|route:CR:60"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":5,"raw_transition_class":"UNCHANGED_OR_INVALID"},
    {"county_code":"HAS","identity_id":"82d4acf0-4592-3c60-732f-ef07cb42796a","source_identity_key":"OH:ODOT:NLF:CHASCR00014**C","prior_road_id":"f0db4fa8-3900-4350-a31e-3d61128006f8","road_id":"f0db4fa8-3900-4350-a31e-3d61128006f8","prior_mapping_status":"verified","final_mapping_status":"verified","prior_mapping_method":"exact_route_designation","final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"CHASCR00014**C|route:CR:14"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":6,"raw_transition_class":"UNCHANGED_OR_INVALID"},
    {"county_code":"HAS","identity_id":"83906bd8-9c10-e948-60e6-ed78a1ca34de","source_identity_key":"OH:ODOT:NLF:CHASCR00030**C","prior_road_id":"639b05f2-5dc6-4678-86bf-e7a0a775663b","road_id":"639b05f2-5dc6-4678-86bf-e7a0a775663b","prior_mapping_status":"verified","final_mapping_status":"verified","prior_mapping_method":"exact_route_designation","final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"CHASCR00030**C|route:CR:30"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":4,"raw_transition_class":"UNCHANGED_OR_INVALID"},
    {"county_code":"HAS","identity_id":"b0ec2efd-e511-2e2d-c481-eaf896757bbb","source_identity_key":"OH:ODOT:NLF:CHASCR00020**C","prior_road_id":"ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3","road_id":"ebb77f8d-ed1b-4612-ae33-a0c0e64c0ae3","prior_mapping_status":"verified","final_mapping_status":"verified","prior_mapping_method":"exact_route_designation","final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"CHASCR00020**C|route:CR:20"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":8,"raw_transition_class":"UNCHANGED_OR_INVALID"},
    {"county_code":"HAS","identity_id":"d2f9004d-3a70-a61c-30b1-6aca9b4b46d0","source_identity_key":"OH:ODOT:NLF:CHASCR00502**C","prior_road_id":"8382d2bf-d427-4a91-9afa-641885c71533","road_id":"8382d2bf-d427-4a91-9afa-641885c71533","prior_mapping_status":"verified","final_mapping_status":"verified","prior_mapping_method":"exact_route_designation","final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"CHASCR00502**C|route:CR:502"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":3,"raw_transition_class":"UNCHANGED_OR_INVALID"},
    {"county_code":"HAS","identity_id":"dbcc9da8-07cb-f054-68ca-debe2f8640fc","source_identity_key":"OH:ODOT:NLF:THASTR00225**C","prior_road_id":null,"road_id":"c1eefe49-fe29-44fa-84b7-2cfe29180761","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"THASTR00225**C|route:TR:225"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":3,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"HAS","identity_id":"dd89cc57-386f-5f4a-cd54-79c862bda433","source_identity_key":"OH:ODOT:NLF:CHASCR00045**C","prior_road_id":"8da26948-222c-46ef-ac79-9d07ccd08c31","road_id":"8da26948-222c-46ef-ac79-9d07ccd08c31","prior_mapping_status":"verified","final_mapping_status":"verified","prior_mapping_method":"exact_route_designation","final_mapping_method":"exact_source_record_id","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:HAS","evidence_source":{"road_source_record_id":"CHASCR00045**C|route:CR:45"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":false,"old_active_membership_occurrence_count":9,"raw_transition_class":"UNCHANGED_OR_INVALID"},
    {"county_code":"JEF","identity_id":"77ae2895-3173-a69b-e1bc-664c09bb8224","source_identity_key":"OH:ODOT:NLF:SJEFSR00646**C","prior_road_id":null,"road_id":"9b980c79-5542-4b60-a9f9-c4639ddc2cc2","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:JEF","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":22,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"JEF","identity_id":"84c67026-c59b-6363-447b-b593a61cccb4","source_identity_key":"OH:ODOT:NLF:SJEFSR00007**C","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:JEF","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":89,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"JEF","identity_id":"d92bba57-0328-9b22-e119-8c7d3ce199f5","source_identity_key":"OH:ODOT:NLF:SJEFSR00007**N:COMP:2025_000000000306675","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:JEF","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":31,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"JEF","identity_id":"db31c857-6ba0-1c15-07d8-ea9908bec929","source_identity_key":"OH:ODOT:NLF:SJEFSR00007**N:COMP:2025_000000000306617","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:JEF","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":65,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"JEF","identity_id":"e7e27927-4586-1ba7-7d4c-1e41476c9459","source_identity_key":"OH:ODOT:NLF:SJEFSR00152**C:COMP:2025_000000000306854","prior_road_id":null,"road_id":"032e69fc-afdf-49ed-821a-f0921cefeef6","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:JEF","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":33,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"MOE","identity_id":"02f7ec49-7105-9e11-0eac-ec74b286e707","source_identity_key":"OH:ODOT:NLF:SMOESR00800**C","prior_road_id":null,"road_id":"0a8a8721-4d20-41bf-8d95-ec069173e584","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:MOE","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":75,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"MOE","identity_id":"b6f043cf-074c-d8dc-ad70-9d94bfc6f1d0","source_identity_key":"OH:ODOT:NLF:SMOESR00026**N","prior_road_id":null,"road_id":"0a96a8b7-e9f6-4607-8d09-20cd3793ff8d","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:MOE","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":4,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"MOE","identity_id":"eac06c8b-0000-eb89-1b2e-538622b6ccd8","source_identity_key":"OH:ODOT:NLF:SMOESR00007**N","prior_road_id":null,"road_id":"7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:MOE","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":7,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"NOB","identity_id":"2094accc-7fb9-20f5-86d7-3af8fda2dcd5","source_identity_key":"OH:ODOT:NLF:SNOBSR00821**C","prior_road_id":null,"road_id":"f4cc321a-7010-4f44-a469-c49ca9c32241","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:NOB","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":108,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"NOB","identity_id":"23f99311-1e86-b929-f3e2-ce01afea233e","source_identity_key":"OH:ODOT:NLF:SNOBSR00285**C","prior_road_id":null,"road_id":"3deab4c8-2a90-4579-bcb6-373cef11a0ce","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:NOB","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":33,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"NOB","identity_id":"2eab7dfb-788a-1181-28e6-b643922b62be","source_identity_key":"OH:ODOT:NLF:SNOBSR00078**C","prior_road_id":null,"road_id":"a6c093cf-cce2-445d-9abe-6bbe05e463ca","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:NOB","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":65,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"NOB","identity_id":"459a1640-9852-f34a-f119-cf2b6c4b06e9","source_identity_key":"OH:ODOT:NLF:SNOBSR00265**C","prior_road_id":null,"road_id":"154688cf-a3d1-4c2f-bf9c-65b15ab424a4","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:NOB","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":0,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"NOB","identity_id":"abce444e-c709-b445-289e-c9eb76319c9e","source_identity_key":"OH:ODOT:NLF:SNOBSR00313**C:COMP:2025_000000000326394","prior_road_id":null,"road_id":"40d2fcd0-8205-44dc-a4de-a650d46ad890","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:NOB","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":4,"raw_transition_class":"NULL_TO_NONNULL"},
    {"county_code":"NOB","identity_id":"c8dab0ba-c322-c4a9-87a9-bacb525929cc","source_identity_key":"OH:ODOT:NLF:SNOBSR00313**C:COMP:2025_000000000326395","prior_road_id":null,"road_id":"40d2fcd0-8205-44dc-a4de-a650d46ad890","prior_mapping_status":null,"final_mapping_status":"verified","prior_mapping_method":null,"final_mapping_method":"exact_route_designation","exact_candidate_count":1,"ambiguity_flag":false,"refresh_scope":"OH:NOB","evidence_source":{"designation_source":"identity_exact_components"},"reviewed_identity_46":false,"prior_road_reviewed_37":false,"final_road_reviewed_37":true,"old_active_membership_occurrence_count":13,"raw_transition_class":"NULL_TO_NONNULL"}
  ]
    $issue97_file37_machine_contract$::jsonb
  ) as contract(
    county_code text,
    identity_id uuid,
    source_identity_key text,
    prior_road_id uuid,
    road_id uuid,
    prior_mapping_status text,
    final_mapping_status text,
    prior_mapping_method text,
    final_mapping_method text,
    exact_candidate_count integer,
    ambiguity_flag boolean,
    refresh_scope text,
    evidence_source jsonb,
    reviewed_identity_46 boolean,
    prior_road_reviewed_37 boolean,
    final_road_reviewed_37 boolean,
    old_active_membership_occurrence_count bigint,
    raw_transition_class text
  )
),
-- ISSUE97_MACHINE_TRANSITION_CONTRACT_END
-- ISSUE97_REPLACEMENT_CANDIDATES_BEGIN
candidate_expected(
  build_order,county_code,build_id,graph_digest,mapping_snapshot_digest,
  source_revision_digest,source_segment_count,identity_count,
  point_junction_count,shared_segment_count,membership_count
) as (
  values
    (1,'BEL','1c1320b3-4257-4239-9c55-b18a801aa97e'::uuid,
      '269e903e991f1790bf5d1428e4c2bb43','59e4d0079a9114a622ca6021d557cc07',
      'b20843ddf3d2a648b8d53a0b3eb1a1c2',5687,3001,4878,112,9912),
    (2,'CAR','8e565c14-33a4-4862-9bf8-be9b5557b293'::uuid,
      '2943504592861b83abce581f29a1cacb','07dd91d21b7e757d3bf5f20db54ea579',
      '8405344f91e795398ab261a51f2a03bf',2640,1553,2522,90,5251),
    (3,'COL','b86d14c7-5c8a-4cb9-8a3b-903965340678'::uuid,
      '6bd88992a7a63c9643d1a6f1535ca2af','89fbad6cfcc8e62c6e600a406f243d08',
      '44b4e720a523face3149d7dbdc8a298b',5754,3006,5091,126,10812),
    (4,'GUE','44245144-3e39-45fe-907b-95e2b01b9c32'::uuid,
      'd7a43bacbf54794d4e92d9e8ceca2e28','02cc95bbbacaaa969a8e8420ae4987e1',
      'b0cc4e8e3aaa7121cc39cc7935189664',3648,2079,2995,101,6433),
    (5,'HAS','0870470a-11f8-4f33-8af3-08d6849d5f34'::uuid,
      'fc53a1492a3eecab78a524dbadcddfe8','d814298cc86b83ea2cb5938dd8e978dd',
      'ece929162c9063ea35a6a276de59a940',2336,1013,1746,57,3550),
    (6,'JEF','c9bac3a2-82d4-4b76-813c-6a29c1bf062a'::uuid,
      'ce2de7721f56a145b21ddded270f07fd','6c95c0985714405f2af340e9d7c7c924',
      '0d40dc262b0097cf48783f7271531153',4135,2187,3498,69,7116),
    (7,'MOE','8493f66b-b3d2-4673-be8a-07b024b9723d'::uuid,
      'fafd62f37b76e57859164010d1be967b','2e2fc9e336115c9fd5fced5a69f5a9ad',
      '5a82a31c86fdd78804bf113f73e49694',2264,1250,1715,32,3504),
    (8,'NOB','200d56dc-5b13-4f84-82cb-946b8ebeada2'::uuid,
      '576c5e1b1012fcb8020fa637fb272082','821c52a3c9090067a8496847ee1b1172',
      '795f812c7a9042318196195cccccf3a4',1959,1030,1381,40,2841)
),
-- ISSUE97_REPLACEMENT_CANDIDATES_END
-- ISSUE97_REPLACED_ACTIVE_BUILDS_BEGIN
old_expected(
  county_code,build_id,graph_digest,mapping_snapshot_digest,
  source_revision_digest,source_segment_count,identity_count,
  point_junction_count,shared_segment_count,membership_count
) as (
  values
    ('BEL','24ffa531-0e69-4625-a137-da52020e6fd0'::uuid,
      'fc6dcbc8482b2e5c89f4069941c557de','d7565e078c0dda3d248555600522649b',
      '81355d7958b89ffccd08a5f521730f8e',5687,3001,4878,112,9912),
    ('CAR','5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,
      'e9f4ed56bb2b1308b8b9913a751c78f5','e50ef5799abf04d16c2ecb79d4db0651',
      '853c139290afee94e391fc0395d40fed',2640,1553,2522,90,5251),
    ('COL','c9f50b03-4328-4d8b-9995-4dc8bc85dd01'::uuid,
      'c13278c74933205f5c55cdf85f23f27e','2d0b4ff159b673d214e3661feecd9088',
      '7f54d4a6e143c4006cb90b4b4fa0b67e',5754,3006,5091,126,10812),
    ('GUE','84568854-3257-46b7-8581-374dc620ef16'::uuid,
      'b11b2f5ac3c1c5d492c2233494706f4c','30c17bd7c09c6093cfc3dc35a9adc5f8',
      'b2bee82327b4ce24833fee33c4873238',3648,2079,2995,101,6433),
    ('HAS','542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid,
      '1d8f6a52d2541e313932906f944b2f92','7d0561a0f32e7432880d4ad39e5e7109',
      '610d4d5fe3a19cd1d07e9fc3049b2785',2336,1013,1746,57,3550),
    ('JEF','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4'::uuid,
      '06e8bd25f7fb46fe750214dd77e2b67d','1b43430facf325e7ae1840f593f6e1ce',
      '03efea8f142bb29e5f27cb12bf84c49f',4135,2187,3498,69,7116),
    ('MOE','ab9f4083-d572-4d9d-8e0a-28ebb77517e7'::uuid,
      '69010044273a611876c3a8ace7c198a2','7d794bd9b703b10c9579f97a325bb23a',
      '0921c5ea8751f20f079ba1a776bc7c1e',2264,1250,1715,32,3504),
    ('NOB','70f30495-860a-4199-9360-8e880f3b515b'::uuid,
      'eefc679ed36e6aba3a590c7ba2c9e541','ee7692fde47360caa2203b3436ca099b',
      '89af7128d56bbc4ef3733436d0813823',1959,1030,1381,40,2841)
),
-- ISSUE97_REPLACED_ACTIVE_BUILDS_END
-- ISSUE97_UNAFFECTED_ACTIVE_BUILDS_BEGIN
unaffected_expected(county_code,build_id,graph_digest) as (
  values
    ('ATH','8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb'::uuid,'2080a5a06944f3d4842e31937748267f'),
    ('COS','7c979743-72e4-42a2-a6a9-006a369168c0'::uuid,'7791b63c7bcb5848200b5bc4cc970fb4'),
    ('MAH','360472bf-cb96-4ba7-b2fe-efa04e230f69'::uuid,'4a80abcc01932b7a169189ec5f706cc4'),
    ('MEG','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048'::uuid,'2fcf1a69c13907789a2f902574a35674'),
    ('MUS','98ae1835-1064-4c18-a8a7-9a9e570e212d'::uuid,'04a4c9d7a4274ac638cad78a406f76fa'),
    ('POR','c645a8bf-a920-432a-a341-a7b60d9cfd49'::uuid,'89513e609f359ad9064814ebbf074810'),
    ('STA','67541fad-5cf2-4483-b0f6-f4060197fda9'::uuid,'67be9ebece47e78c4c7ccf29ea92786e'),
    ('TRU','3c94b14c-9d9e-41ec-a897-b754dab6d8dd'::uuid,'2ff743a4c7f223a6821d3eaff7416d1d'),
    ('TUS','fd6fdfff-f23f-42cc-a633-64448bd9d044'::uuid,'b5d73c4e9a397596bbdc1dd0697a0b6d'),
    ('VIN','785f5277-369c-4ae3-ba80-31411745e46d'::uuid,'551be5443af26c64d5ed5e92a58ee71b'),
    ('WAS','90982f30-8a06-4a53-8b4b-9efd5d9042bf'::uuid,'6ccff50666a085a4387c20fb49f90a59')
),
-- ISSUE97_UNAFFECTED_ACTIVE_BUILDS_END
-- ISSUE97_GOOGLE_DEPENDENCY_TUPLES_BEGIN
google_expected(pad_id,identity_id,road_id,route_revision) as (
  values
    ('69c63442-de05-4d15-95da-07da587bc070'::uuid,'e78dcae3-372f-4cf6-9bdd-a3773b21a50e'::uuid,'01bad0cc-614e-42b7-9db9-22bf6410c849'::uuid,0::bigint),
    ('6ef0746f-341a-4d29-9399-a81cfbec11e8'::uuid,'ebbc1392-345c-882e-2708-6ecc27a76f3c'::uuid,'cdcfd114-42c5-4478-9251-eac57a70e528'::uuid,0::bigint),
    ('75600d0c-17b8-488b-96c9-4b7b8ffc8b1b'::uuid,'542490a4-ba6f-02af-0209-37ad6257a962'::uuid,'52b08bc7-9b54-4b8d-a833-f903fc298f7b'::uuid,0::bigint),
    ('b6dae008-74d4-4976-9c72-fba7ae349c50'::uuid,'ebbc1392-345c-882e-2708-6ecc27a76f3c'::uuid,'cdcfd114-42c5-4478-9251-eac57a70e528'::uuid,0::bigint),
    ('b7526e45-0b33-4988-ae1c-0a4140971f8e'::uuid,'542490a4-ba6f-02af-0209-37ad6257a962'::uuid,'52b08bc7-9b54-4b8d-a833-f903fc298f7b'::uuid,0::bigint),
    ('d7898e8c-1bb6-48f8-b5e0-87bc1898420e'::uuid,'9acadc48-c230-5e7b-6f2a-0a77f86f625c'::uuid,'bbfacbaf-86be-4818-8541-61a697c71199'::uuid,1::bigint),
    ('e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid,'ebbc1392-345c-882e-2708-6ecc27a76f3c'::uuid,'cdcfd114-42c5-4478-9251-eac57a70e528'::uuid,0::bigint),
    ('f896d00c-da26-41b6-bf5b-e9d91afbdbc6'::uuid,'e78dcae3-372f-4cf6-9bdd-a3773b21a50e'::uuid,'01bad0cc-614e-42b7-9db9-22bf6410c849'::uuid,0::bigint),
    ('fcbf5085-4ba2-496d-9c20-516e8b52f9bd'::uuid,'e78dcae3-372f-4cf6-9bdd-a3773b21a50e'::uuid,'01bad0cc-614e-42b7-9db9-22bf6410c849'::uuid,0::bigint)
),
-- ISSUE97_GOOGLE_DEPENDENCY_TUPLES_END
replaced_graphs(county_code,build_id,graph_digest) as (
  select county_code,build_id,graph_digest from old_expected
),
-- EXACT_FINAL_412_BEGIN
frozen_routes(route_prep_id) as (
  values
    ('003b60c9-7e08-41fb-93d4-cf01a2ea1d01'::uuid),
    ('01c097c4-7d0b-407e-b7c9-5179dd34cb64'::uuid),
    ('01caa318-9195-4de0-be57-4ebbb303d8f2'::uuid),
    ('0237aaa8-769f-42d0-bf76-660e45467ac4'::uuid),
    ('026427ae-e7d9-4f4d-8762-6227f0c6f54e'::uuid),
    ('031fe01a-ecd1-498b-b069-73ed4c5c5fbf'::uuid),
    ('0415cc7e-fcff-4768-a280-b55476b073d3'::uuid),
    ('04b11858-ca20-424a-a040-d5d6e68fc7b8'::uuid),
    ('052bf558-906f-4a96-b155-ea183900decb'::uuid),
    ('05d474c1-2872-4855-ae8f-9a79701dbdea'::uuid),
    ('064386be-a87d-419e-b26c-70c380b501ab'::uuid),
    ('065dbfed-cd22-4a73-99aa-8d457f24f739'::uuid),
    ('06cb027a-3040-47a9-8d61-23368f3c5d51'::uuid),
    ('07a3e37c-72e1-47b1-a5fe-347a17c7745e'::uuid),
    ('07ae01da-b773-4d9e-9ae9-d6dbe5a076c3'::uuid),
    ('07aeea44-d412-46ea-b798-1b9d2b0958d0'::uuid),
    ('07cb13d1-3335-458c-b379-e536a8c2138a'::uuid),
    ('0ac96388-ec4a-4aa0-8dd6-9759b471faa6'::uuid),
    ('0b46eba7-7771-4d51-8451-b99f69aef347'::uuid),
    ('0c086fa4-f181-4d2e-b7dc-168259952b37'::uuid),
    ('10158211-2ac8-48bf-8653-991d8327c19d'::uuid),
    ('10d7e686-06f2-4c53-ba7b-0d2e08333d94'::uuid),
    ('1122968e-c622-4db4-b473-aa2ef81c5a79'::uuid),
    ('11d80d07-0c0e-490f-9a16-96a0f91c8357'::uuid),
    ('1255a1d0-fff6-45bd-81cd-c8e854c9ec23'::uuid),
    ('128104ed-fec4-4b6b-bbd8-29088a8ed4ca'::uuid),
    ('1359d567-1a91-4cb8-84c5-70c1e8e3ff5f'::uuid),
    ('13685788-30a7-49c8-b2a6-c48b6213e65f'::uuid),
    ('13dfad94-79c4-45c1-97e6-b9ed82b7ff61'::uuid),
    ('140311ea-0d60-4e04-a026-0897352ec0a2'::uuid),
    ('1412fde7-f4b9-48e9-8e60-671479a6e4cb'::uuid),
    ('15ec70fe-f529-4df2-a3c2-10d7e8804f70'::uuid),
    ('16c62f0d-5580-4cdc-b1a2-85e2cdb3a937'::uuid),
    ('172511c6-36e0-4194-9df1-935373698ecd'::uuid),
    ('174590c4-6600-486d-b792-4d239dfd753a'::uuid),
    ('17461b0c-61f1-4960-93bf-2b73e1be336c'::uuid),
    ('178661a6-0f4f-46a1-bbe4-ead904438357'::uuid),
    ('17b43242-2da2-4d7e-982c-0051fc23bc3c'::uuid),
    ('17f7920d-ec75-4951-bb6f-c12c81e9652e'::uuid),
    ('193e06e5-a3c0-4886-a621-00272e9a8e11'::uuid),
    ('1972e541-019a-40c4-8b8a-a2aaffcf0005'::uuid),
    ('19c2177a-b625-4723-9a98-178be1da3353'::uuid),
    ('1ad58246-593f-46b3-93f4-17072a4fe7ba'::uuid),
    ('1b646c0e-c893-41bb-9b2a-f6be98695765'::uuid),
    ('1ba4cda3-1965-4fd3-8208-51d034b76c0e'::uuid),
    ('1bab5b68-b21b-43f0-b3df-499b7a046f8f'::uuid),
    ('1c729d51-e83d-4151-aab4-5a5e42b9d44e'::uuid),
    ('1caba3ca-563e-4a93-aac9-0b0a62062d72'::uuid),
    ('1cb064d8-305d-4426-8495-86fad19fef6f'::uuid),
    ('1d06fd18-6e53-43a5-9fce-46bb7f755d94'::uuid),
    ('1e353e67-1348-45ec-aa29-6d69419397c0'::uuid),
    ('1e3d3262-cba5-44cc-9693-ffc69ca0925e'::uuid),
    ('1f410075-fb69-4e48-a854-221a133380d0'::uuid),
    ('203d9826-02f4-4e86-a060-adaf00d8b6cf'::uuid),
    ('206c6fe4-4282-42de-89db-c35566cceaa2'::uuid),
    ('219aaf70-17cd-4450-8619-983ba17f001e'::uuid),
    ('21a3a28a-17b9-487f-b06b-7bda932a6ed9'::uuid),
    ('25c5bbef-679f-4564-8673-df2ce7437277'::uuid),
    ('26177c53-c694-4c25-a392-cae6a99ba7c9'::uuid),
    ('2657cb35-fa4d-4154-9e34-a3980ab33aa0'::uuid),
    ('2657fdcd-c273-40fe-9b58-14926eaaa014'::uuid),
    ('26a38d82-73d1-45df-a8c2-d8282bfb6e80'::uuid),
    ('26a5d053-711f-40cd-8e9c-cafe93327f7c'::uuid),
    ('27663c96-771f-4ab3-b57c-391cd0871359'::uuid),
    ('27bf66eb-dd66-4e31-b5bc-a0bd7660fda0'::uuid),
    ('2848d352-a946-44d1-8436-05945bae0baa'::uuid),
    ('28933f81-04e2-4eed-8da0-c7d276c6f0de'::uuid),
    ('2a3bacbd-c3e4-47a9-a605-e179ec5bd3a7'::uuid),
    ('2a9f93c6-3805-4630-a8da-b861383d7e5d'::uuid),
    ('2b4007d0-54f3-4d00-99b4-b153cafe21cf'::uuid),
    ('2d6d6c2a-48ce-432c-8a3f-76b10b985e27'::uuid),
    ('2db3dcfc-bcf9-481a-b57f-1e10f7166175'::uuid),
    ('2db5bd0c-bac6-4e20-91eb-a7574083dcc3'::uuid),
    ('2e191437-c76e-4ed4-b6b9-43dfab0e5c92'::uuid),
    ('2f6c6b3b-2d93-4937-abcb-4cf664f36ec9'::uuid),
    ('2f8405ae-80f0-460b-a2b9-fa9d49b3ebba'::uuid),
    ('2fef00f4-26c1-4caf-91f8-6e35763ab60e'::uuid),
    ('30e1f07b-ce73-4eaa-8f3c-726de769aab6'::uuid),
    ('31038778-e685-4e4e-9f9f-36fc06df716a'::uuid),
    ('31100c05-2f9a-4a47-9118-19127ce23638'::uuid),
    ('311454d9-3919-424e-a458-297670bef2ba'::uuid),
    ('31f8a4b9-96c7-4ee1-878c-de4a1f41d86d'::uuid),
    ('323f5e58-9f49-4df0-be08-a42ae584b8f7'::uuid),
    ('3264c21d-48f4-4a6c-99cc-9890a90d6993'::uuid),
    ('32e7339e-b8f0-4be5-8040-b9dc5eab5748'::uuid),
    ('3394dac9-c75c-4a03-b4c3-030f203861d4'::uuid),
    ('340d1ef0-1845-41a0-8c57-cfaae4f5a394'::uuid),
    ('34201b4a-f2f4-4986-bf58-21296efca4f0'::uuid),
    ('350f60e4-27a6-4674-99f8-3fb48273afc6'::uuid),
    ('35846477-de93-4077-a240-961b276b5cd8'::uuid),
    ('369a931f-e346-4e40-9b64-e664b2be31db'::uuid),
    ('36f3451f-5f21-4330-9d80-5d8a2949a322'::uuid),
    ('38a5202e-0ad9-4057-9e83-f3fb3a522f5b'::uuid),
    ('3908772a-f0f7-47ff-9a11-00379dac84cf'::uuid),
    ('3a06142d-8b2c-4de5-a392-89b79f9d906c'::uuid),
    ('3a48446f-f4d6-4574-9d62-c2a0643f9462'::uuid),
    ('3c056bc7-bd13-41ec-b0ed-d1aca959c677'::uuid),
    ('3ce1cf15-51d8-4633-bcc2-9de7162116a8'::uuid),
    ('3d43afe3-bbe5-4eab-b1db-45e18a2fb4ab'::uuid),
    ('3e581ae9-30ef-4d26-b2c1-030f64bdaace'::uuid),
    ('3e9d4178-38f8-4063-a23d-d42e9b701684'::uuid),
    ('3f06a12e-e128-4fa9-982a-965c1a7204ca'::uuid),
    ('3f122ea8-a3a9-41ed-90a0-e4b3f27bd103'::uuid),
    ('3f649d91-e420-4ddc-83dc-1af9dc2ab931'::uuid),
    ('3fb6484e-1cf9-4183-ae32-a5515a5f3b79'::uuid),
    ('3fdf9a9a-eb61-46ae-9eb3-1e40f3824da8'::uuid),
    ('4080f4c1-1ea0-4feb-9988-f2121dd6086e'::uuid),
    ('42125374-4fa3-4c4a-ac96-bc68709f7a93'::uuid),
    ('4216c0cb-b3cc-4179-896a-7ea3a2cce2fe'::uuid),
    ('4345a71c-53df-4874-9297-2189e936e3c4'::uuid),
    ('4362afa8-1b66-47d6-aaa2-c705e95a1cec'::uuid),
    ('449c3bfb-b688-4978-aae8-9e9636fb9552'::uuid),
    ('44d0f4b0-0a45-44ae-8e19-c9b6f54f30a7'::uuid),
    ('44d4dac1-d32a-4f9c-b8c7-9338ae643624'::uuid),
    ('47c271b3-9ef3-4f12-8d26-72c983b09e10'::uuid),
    ('486e11e7-28f2-4b02-a2fc-985c4152ff57'::uuid),
    ('489562db-9856-434b-b324-9ef1abefeb6e'::uuid),
    ('4937b84b-e166-41ca-b5ce-ff61a44e2dab'::uuid),
    ('49e40e39-456f-4bd3-89f3-d67577350ca4'::uuid),
    ('4a209eed-5f69-4cc7-b189-85196227c4fe'::uuid),
    ('4a4ea6d4-730b-4aef-ae19-27045d749f3c'::uuid),
    ('4acbeb6d-62ba-452a-a9bb-2d80ef825be8'::uuid),
    ('4b6160ce-c46e-4e7b-a146-d420c2a77cb6'::uuid),
    ('4d4eb279-c380-466b-9264-779760cadfcf'::uuid),
    ('4d6c860e-db8c-4b85-a918-071308ebe82f'::uuid),
    ('4de07d7f-47ae-4ad7-83ad-4d458432d873'::uuid),
    ('4de4c0d7-8af1-4ab4-8548-1cb3752b4f66'::uuid),
    ('4e50cfd0-f41f-4542-a9ba-aeb609e7167c'::uuid),
    ('4ea73dc7-3eda-4570-b6a7-ba0d24d831b9'::uuid),
    ('4ec2f649-e708-4a81-88e6-79602cda8457'::uuid),
    ('4f4dc7c9-ff71-4c92-980c-60008cb35ebd'::uuid),
    ('5039fa95-26b4-43e5-a961-82c1ca6da25a'::uuid),
    ('513d140a-5410-4a8a-a477-7256420ca273'::uuid),
    ('51c0b1e3-32cd-4186-8a95-7de6a059dba8'::uuid),
    ('51e2997e-4bef-41f7-b2a2-3feef1c8bd3d'::uuid),
    ('521820a6-ae1d-4709-873e-2ff1d7b6a643'::uuid),
    ('53319091-7b94-43e2-af8b-1a544255c64a'::uuid),
    ('53643b41-d535-4b07-abe8-4fe9d9e8c831'::uuid),
    ('53870b4a-dd4a-493a-839e-b8fbaf2a2563'::uuid),
    ('538caf35-f638-4097-b34d-afe6423b9cc6'::uuid),
    ('53943b29-edca-4495-88a7-64e2e0ee09a3'::uuid),
    ('53a10060-c961-4da6-afeb-7c4fee5b6710'::uuid),
    ('53b6c1c4-2fe1-4187-899c-41b92d9fdcd4'::uuid),
    ('54a8d210-6a56-4b0d-b14b-a9eb31151fdd'::uuid),
    ('54dfa78b-bb09-4636-8df1-2f299f004762'::uuid),
    ('5520446d-da2f-43ce-b29b-33a8658974a5'::uuid),
    ('55cbab82-09ce-4ba1-b2e2-dff554efa7d9'::uuid),
    ('55eb55d4-80b9-4d8a-a03a-ca7261cbc628'::uuid),
    ('567670c9-ed03-4e06-8e0e-4e3d047ef855'::uuid),
    ('5677a057-562a-44b6-8cd1-7a68c1eb339a'::uuid),
    ('56df47bd-4f4c-47c1-80d3-9ff39d0fec7f'::uuid),
    ('57d740f9-a387-49da-98f2-48b748024df1'::uuid),
    ('57f774fe-be08-4db2-986e-f3e2f22b4012'::uuid),
    ('58ede8ce-fafa-4412-ac76-b7a68895a255'::uuid),
    ('593c14c3-ed86-49d4-939d-47026e1b3a91'::uuid),
    ('59a1ee82-bfdc-42e4-91e2-66968a3ede96'::uuid),
    ('5a09a7d5-2541-4a82-bbd3-4fbb124f81ae'::uuid),
    ('5a74a964-5f9e-44fe-bf93-0a16c98d16db'::uuid),
    ('5b64d2f5-3df2-4b39-8868-7c383d9c0918'::uuid),
    ('5b9e88cd-a6f4-4e2d-a383-0fae430d0071'::uuid),
    ('5c8ea6b5-957b-4da0-a450-1a126f4f02e6'::uuid),
    ('5cc44fd5-7ef7-49fe-9f82-23e4667fc4e6'::uuid),
    ('5cd07214-4d94-4061-849b-2f228bfd8105'::uuid),
    ('5d0abd88-d675-457c-b74a-645b4edd384b'::uuid),
    ('5d60534e-ef7f-4f35-812b-e77a634c0d3d'::uuid),
    ('5d7f563e-09d1-45f0-92e8-f9048f91f5a9'::uuid),
    ('5e9bf337-a229-49a4-8acb-aab4e2417b5b'::uuid),
    ('5f3dd419-e78c-4623-88a7-0937f62b9903'::uuid),
    ('613a5a9a-8e00-4367-88ee-e1977ed45f09'::uuid),
    ('61cd1cd6-6c30-4e8f-8a10-1d47f9f5690d'::uuid),
    ('61e0f682-5faa-497f-8d44-a0dfd74be48d'::uuid),
    ('6236a0c5-f6a1-4a07-9376-2421afb03791'::uuid),
    ('6390e793-8e38-4db6-9847-cfe9cf2f2781'::uuid),
    ('63ccdda4-1278-4a47-b896-4cb92ba05603'::uuid),
    ('63f96a96-c353-432b-848d-7cc34a366596'::uuid),
    ('6400733c-7f2d-4b12-8b47-80a424c24ec8'::uuid),
    ('64761bec-151d-4e7f-9e2e-0492786b69ce'::uuid),
    ('66756cd5-4c0f-4034-884b-7d4e57bb4f04'::uuid),
    ('66a486ff-b1b3-4b7c-8051-38763038882f'::uuid),
    ('66db188e-be89-45ed-8b81-2b59b235bb01'::uuid),
    ('67ddaf5b-f34b-4bae-a4b6-aa774ce06d25'::uuid),
    ('69111be0-f709-4a2e-9579-39f39dbe0d87'::uuid),
    ('6a1ccc66-84d7-4327-8964-46c9f2317d70'::uuid),
    ('6a300d49-178f-4b55-bd29-c782d757d20d'::uuid),
    ('6aa0a0c5-0f82-4982-b3c1-524ae9f8ce1c'::uuid),
    ('6ae8ea8c-dcdd-4251-ac0a-ac946569973b'::uuid),
    ('6baf4227-b0b5-4d10-be9f-e1bee80a61b1'::uuid),
    ('6de190fd-bb1c-4009-a4bc-fe794060948f'::uuid),
    ('6e068042-970c-4802-8763-2f2b5322ac23'::uuid),
    ('6e21cc9f-a696-40c3-afbb-f85fe91606fa'::uuid),
    ('6eadc49f-d5ca-4203-9168-a0751a6681bb'::uuid),
    ('6f963593-757b-4336-a537-d39a40dff27e'::uuid),
    ('6ffa3a87-5884-4131-b7d2-b562f6caf89f'::uuid),
    ('70457061-dbc8-40ae-a379-c0d1bfddbb82'::uuid),
    ('70d4f287-b1d9-4667-a3d0-5d2e70bb964d'::uuid),
    ('71b21ce1-5959-421e-a37d-82daebfbc240'::uuid),
    ('71b67f1a-0ffd-4f38-a24a-2a0021181734'::uuid),
    ('720d4b60-18c9-40d3-a893-72954926c60b'::uuid),
    ('724c4479-3fa9-4b61-b970-4a2e39cc3887'::uuid),
    ('739ae5dd-2b9f-437e-9762-943e6f3976ef'::uuid),
    ('74fd49a5-2413-4a5d-bd6d-814e0a4d84af'::uuid),
    ('75de551f-b89d-4282-bed8-b478ce0a81d7'::uuid),
    ('766e26b9-6e39-4836-958b-1cc5cdcca8f9'::uuid),
    ('773c5a59-c048-42cf-b9e3-690e957076a9'::uuid),
    ('776f2f56-df5e-44eb-bfe9-29aec375c187'::uuid),
    ('77e9f659-e154-4293-8aa8-c2bbc7337143'::uuid),
    ('78fae1c9-5f87-409f-ab49-1429b2558975'::uuid),
    ('78ffec9a-43d5-4aa0-b095-f51550fd9355'::uuid),
    ('7a67fa4b-9874-49cb-97a7-861323a6c6b5'::uuid),
    ('7a74dfcc-c08f-4654-8788-5c3cb421db4d'::uuid),
    ('7b87dceb-73f5-42c4-a226-5375faf03019'::uuid),
    ('7bc00ae9-d123-4c93-a196-7be40be32ed8'::uuid),
    ('7ca02e61-f2c1-4cb9-bb4b-0705208571a8'::uuid),
    ('7cb4ed4c-aef5-44f6-a1fb-2a01bece4699'::uuid),
    ('7dadfc29-49c4-4770-8104-f881c7869746'::uuid),
    ('7e254d0b-a644-49cd-92b8-7337a233bb3d'::uuid),
    ('7e33b010-bdf7-4079-ac90-ead3b19f7989'::uuid),
    ('7e4bf07c-0cfd-4a00-a259-d14fd14d6789'::uuid),
    ('7e8ed6c3-6937-445a-8a3f-8a9d4d32f775'::uuid),
    ('7f85cc6b-a45a-414b-b21c-5e176265d621'::uuid),
    ('7ff7f6a1-c94b-4b43-b2f0-a0031416f885'::uuid),
    ('800e7559-ce4f-4272-8da2-671b783c725b'::uuid),
    ('80b27cd0-7f67-4d8c-95d5-d4d047669810'::uuid),
    ('83ce3843-ddce-4a7c-8c67-2ff5a6e2d277'::uuid),
    ('86a42f69-f6e8-42f4-9cae-1f5aa785c165'::uuid),
    ('86d86ac5-199c-4715-be36-785a13c1cf30'::uuid),
    ('86dfa624-bdab-4f10-905a-7bd947022f3c'::uuid),
    ('86f0286d-de00-48c1-89d4-8cb918a5e229'::uuid),
    ('87426d23-df12-4829-9c62-2f2d746aa189'::uuid),
    ('879a1d0e-cbfe-4267-911e-13d61f6b825c'::uuid),
    ('89a49415-2b39-46e3-9c3f-9512ccb3e799'::uuid),
    ('8a35496f-ebef-4a2c-83c3-4553b386bb8a'::uuid),
    ('8be76fc6-f48a-49d6-bdcf-0be718e2ad54'::uuid),
    ('8d8e5e10-12b5-4404-b709-3bd8bbff47b1'::uuid),
    ('8d9dc046-0cee-4241-bf93-5f7bed95e0b3'::uuid),
    ('8de9c66e-310a-4e6b-aa53-c16b6c7f8c81'::uuid),
    ('8e17acde-bfc5-4e3d-9494-c61c2a12235e'::uuid),
    ('8f0bad08-174e-451d-aebe-2049a0553908'::uuid),
    ('8fff4447-1f7a-4982-ae7e-fbfbf2abd8da'::uuid),
    ('902194a0-4bbe-4fdf-8a81-86149f17f9a1'::uuid),
    ('902b2065-0c60-443d-9652-43f0e1139c8d'::uuid),
    ('90d93e89-ac76-4632-bf94-0ebe9cd80e6c'::uuid),
    ('90e8f60c-3a10-41fd-a57c-11ba0e651133'::uuid),
    ('910d8fc5-211b-4da0-813c-1347f1058406'::uuid),
    ('915ca224-5532-4a39-ade9-a18b0a897967'::uuid),
    ('9165cb50-1864-406a-a459-8d0ac1fc49d8'::uuid),
    ('921f3b5c-9d5f-4939-8687-e7566ea96a2e'::uuid),
    ('930329a0-6c53-44f1-9587-2ffdcb07b2ea'::uuid),
    ('93991aa0-2988-4d0a-9519-4d498be1ea2a'::uuid),
    ('9487bb8e-cf34-4da0-bf9c-5a75bef4cdc9'::uuid),
    ('94c18657-38da-402e-b678-11520768ce96'::uuid),
    ('955e9aab-1127-4ee1-b006-b15fc2dcc04f'::uuid),
    ('96a68c4a-e905-4062-8518-460cdb272404'::uuid),
    ('971ed4b8-955d-459a-ab22-d0ab912ac864'::uuid),
    ('973c0c3a-8ffc-495d-b26f-15f97ce806d9'::uuid),
    ('9808629a-7e66-4575-91dd-fa6168545351'::uuid),
    ('98b5dc03-134e-4f64-ba35-60177b63ace2'::uuid),
    ('98c27a97-c25e-4f11-ad82-6bb069a231cd'::uuid),
    ('98f9ed4b-2486-4576-ba55-9b1b07c5d327'::uuid),
    ('996a9768-ea50-45ba-b523-f228ac697c82'::uuid),
    ('9a1c34b9-7110-4926-9d12-ea9de9359997'::uuid),
    ('9c11f0be-3d07-45fc-b037-bf71e54e9497'::uuid),
    ('9c3da66f-4a4f-48f3-a4fd-a70eef82d92c'::uuid),
    ('9c4190af-767c-401d-8372-3cf21220bea7'::uuid),
    ('9d275ac4-50a2-4fd0-a6eb-99c7c9056e57'::uuid),
    ('9d676009-5f3c-42d2-8b37-08b1b18b8f1a'::uuid),
    ('9e37c2ab-94b1-4f08-8802-17ab55bd7137'::uuid),
    ('9fd7323f-e431-4879-9853-a20b9ba39c7e'::uuid),
    ('a03e5fcc-474d-4715-b0bd-6edaa9b2aa6b'::uuid),
    ('a0691079-a6d7-41c8-82de-f55f767dc7c6'::uuid),
    ('a079e72b-b3f4-4786-9bdd-5fc6a32065ee'::uuid),
    ('a2570190-8441-45da-bd4c-10bfc8f5cf01'::uuid),
    ('a2b903b8-abda-45fa-ba05-df193355feca'::uuid),
    ('a35beac0-0900-40fd-b5f3-16cf7e615ff9'::uuid),
    ('a37de454-2406-4dc8-a884-0711370cf95d'::uuid),
    ('a3dc120d-b20c-4e32-81b1-ba6847605e4e'::uuid),
    ('a46380df-3619-458f-b2e1-2189a4f5b315'::uuid),
    ('a4bbfd86-3e58-4dcc-97ad-e1aefcb4612a'::uuid),
    ('a4e7646e-a28a-48f2-bca2-4a1d9f927e37'::uuid),
    ('a682fc37-5643-4b26-9934-b39c951c5021'::uuid),
    ('a778da6a-bf50-42ef-8591-231429cf0249'::uuid),
    ('a7845397-f854-4b8d-9d9d-9307aa4b6c9d'::uuid),
    ('a7de46f9-aef9-4eb1-a571-6f9bb6fd2b8c'::uuid),
    ('aa5b618c-6cf1-426a-8791-13b41637feac'::uuid),
    ('ac85ae65-adf6-402d-bcf7-763e13d15ac6'::uuid),
    ('ad7f138d-36f0-458a-aed8-9aefa1732394'::uuid),
    ('adfc33e5-ebff-41ab-9b1d-2c2c1f2a04fb'::uuid),
    ('ae33c530-12b6-40ca-bfab-654c1adb3899'::uuid),
    ('aef4ff29-6885-4853-92fe-0d913ff60a18'::uuid),
    ('b0224c6c-f068-40e2-a1b2-1936d03dcbcf'::uuid),
    ('b0f1ff16-f95a-43f6-9d74-3fa0fbe08b6d'::uuid),
    ('b29266ab-b865-4d38-8ddd-e4c0e56bea6a'::uuid),
    ('b308cb16-c074-41f7-8f8d-f4cf3c7ad032'::uuid),
    ('b30f6bb4-10c6-4a5d-8dff-73b382013b09'::uuid),
    ('b39d34e3-9117-44bf-b85e-e3059246113b'::uuid),
    ('b3dd5dee-5339-4628-9fff-da78488dd000'::uuid),
    ('b41b4262-5d35-4588-8bff-4f06cbefc629'::uuid),
    ('b4716618-3648-43f1-a76e-68940705d498'::uuid),
    ('b4d253e8-b78a-4cf3-b70d-ecb15971f997'::uuid),
    ('b54d8218-cfa5-4c6a-9f03-f6c86dc6a969'::uuid),
    ('b5ab1a3a-2d4b-4f3e-abaa-61533582a115'::uuid),
    ('b6cfdb88-f306-43df-b492-dd2e3e06748f'::uuid),
    ('b77e7138-c5ff-493f-9252-35574e1c3d75'::uuid),
    ('b7fedb52-d0ef-4c86-a5ff-6099016e42f5'::uuid),
    ('b8678a6c-606d-4d5b-ba1a-8a776827b734'::uuid),
    ('b8a41c2f-e1b7-4d41-8b81-c8c8997a9497'::uuid),
    ('b8c0ee16-e110-4840-860e-90e2d1a0767c'::uuid),
    ('b9503662-6f83-469d-bac8-2c51f2c80454'::uuid),
    ('badc632b-28c7-493a-8297-6a8e2223aa35'::uuid),
    ('bb4c9272-2792-4483-a7bc-aa5435def1ba'::uuid),
    ('bba6a4a9-cfd7-4d0d-bcda-ddada67cd654'::uuid),
    ('bc0b7604-2bf8-49b9-a3bf-d24a6ef3d11a'::uuid),
    ('bc59bb08-ada9-442a-8f5c-fb7678717b48'::uuid),
    ('bce6d6fd-38c1-4119-8c06-8c07a462a7e8'::uuid),
    ('bd73f48e-180d-4742-a618-358134d97aaa'::uuid),
    ('bd8ccd1b-bbd1-4b19-bde7-2fd545fdfc10'::uuid),
    ('bdf85ccd-e3e1-47b8-a38f-597e5bfdc2b9'::uuid),
    ('bf23b963-5c1d-466a-b45b-1862b6ab811a'::uuid),
    ('bf8d7d07-ccf9-40a4-8903-fa36cd7aa624'::uuid),
    ('c09e7842-f26d-4ff6-b96b-e71c16047634'::uuid),
    ('c4beb29b-ab80-471d-a845-f2997b1314a1'::uuid),
    ('c4d4c99b-41a7-4e02-9927-7398f2d3e155'::uuid),
    ('c6679f9f-142c-45df-9ce3-8bc6288e356e'::uuid),
    ('c671151e-7240-41e5-ac44-3320807bba9d'::uuid),
    ('c6a47755-c549-4af0-84db-91ebaaae20ae'::uuid),
    ('c72dd3f9-29ce-45a1-b597-557832415246'::uuid),
    ('c7527cfc-4a49-4a35-b513-5cf2a6b75552'::uuid),
    ('c7a8b9a9-766a-47fd-87b3-5b6f22fc1d50'::uuid),
    ('c8c3a09b-217e-487b-83ef-640ef6190c1d'::uuid),
    ('c94ac551-2b40-41c8-8c34-1e4257139e85'::uuid),
    ('c956fb89-26d4-4ad2-b803-f9e00eabe5e5'::uuid),
    ('cbe7c89b-d433-4ea8-9114-90dbf7397aca'::uuid),
    ('cc556b5d-141b-4ab1-846d-d7a928f6d74a'::uuid),
    ('cc7d028c-3b70-498c-8bdd-54b2310c0970'::uuid),
    ('ce2b78ca-dd3f-404a-bf4e-2851a67080c1'::uuid),
    ('ced0afcf-dbc6-4389-a005-4116a25859f3'::uuid),
    ('cf4f1918-8438-4a6e-9531-c9c95149aab6'::uuid),
    ('d0c2a8a8-ca1a-428b-8841-11a0e1e912ad'::uuid),
    ('d242b6c7-a9c2-4ba4-a019-eacdd154a163'::uuid),
    ('d2eb92a0-33c7-4248-bc91-f9e24d2b35bb'::uuid),
    ('d369a445-fa6a-4aca-866c-16036bd09648'::uuid),
    ('d4e3877d-f6ce-4d1c-ba96-17786f77e403'::uuid),
    ('d54225b3-5b23-4da7-b7ee-8fac6c62483d'::uuid),
    ('d5606137-c524-497e-af6c-7fc98c17977d'::uuid),
    ('d654d323-f5fb-4132-9c25-647b766d0151'::uuid),
    ('d66ff370-6d17-44e2-ac6f-5b9a50cdf93b'::uuid),
    ('d8069d22-af8b-48f0-8443-fe36102a4392'::uuid),
    ('d85223b3-bd9b-435a-bff7-ef829cae2e62'::uuid),
    ('d9a2cdd3-21ef-4659-8890-aab0adee306e'::uuid),
    ('da0fcfac-cb22-474f-bbe2-802084bd3069'::uuid),
    ('db1d0ac5-71dc-4562-8e70-25c836e02589'::uuid),
    ('db506f1c-a591-4fe6-8c27-fdd56f5b5bb1'::uuid),
    ('db66e96d-7de1-4da0-a695-972ea0eb10cf'::uuid),
    ('db77e2b3-0eda-43ba-a96e-eb3f3c5a33b5'::uuid),
    ('db8deec0-ca56-4f13-b269-3f9b507e82ef'::uuid),
    ('dbd274af-a812-4c08-9e33-b1e346331828'::uuid),
    ('dc008603-87a9-4ec5-af85-ee26e215ef19'::uuid),
    ('dc4034b8-abce-445e-80c3-ce6580183e71'::uuid),
    ('ddd39b7e-54ad-4c4e-86eb-7ee489ff5d8d'::uuid),
    ('de261975-7ffc-4512-811d-2d9915f54961'::uuid),
    ('de30b941-703d-4f30-b2c4-93b78de03344'::uuid),
    ('de776e15-2c15-497f-bc3d-526a5d10dd08'::uuid),
    ('dfb3f204-190c-4d65-85b3-16bcd1715825'::uuid),
    ('e1de75af-6813-4db1-bb01-3b58fde51811'::uuid),
    ('e221d3b2-880b-43b7-8233-05e0d703e907'::uuid),
    ('e32eb4a8-1a7f-4818-9b4a-29eda21e2cf2'::uuid),
    ('e4a11f89-7a50-4fbf-955e-be22350e623f'::uuid),
    ('e5049786-de6b-4236-a919-5d10ea0b8e0a'::uuid),
    ('e519dd8f-71c8-41ce-8294-691a18aeb88d'::uuid),
    ('e5565e6c-718f-47e9-a0e0-6e556280413f'::uuid),
    ('e56adb73-d3a1-413f-b283-a26fde61e257'::uuid),
    ('e5808459-ad54-4e21-9b1e-6b45c57a5f5d'::uuid),
    ('e595f700-55e3-47f0-bab2-8bb9c44e8912'::uuid),
    ('e5f97daf-929a-4642-bfdf-0010fc4b0d73'::uuid),
    ('e667a657-50ad-45e0-a2b0-5540d80fd61a'::uuid),
    ('e7fa68fd-42b6-47ac-a99b-fe7c9849a3d4'::uuid),
    ('e82b9222-3fbd-4edc-8984-017669195af9'::uuid),
    ('e846d286-d177-48c5-a52c-74356885289d'::uuid),
    ('e8c78e78-bcfb-4f6d-8859-bfd116250730'::uuid),
    ('e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a'::uuid),
    ('ea110d87-48b7-414c-933c-06967ddb01bb'::uuid),
    ('ea6fe298-8ae5-4754-baa5-48d549341c91'::uuid),
    ('ea70649b-d1c5-40d1-96ea-e4d640edf5a1'::uuid),
    ('eaff6de8-4a1c-4180-9bec-3194e8e8149b'::uuid),
    ('eb6d6810-1b1d-4d6b-9728-0818ed658405'::uuid),
    ('ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68'::uuid),
    ('eeb816fe-2bc9-4b87-b2e6-edc3df6ef83f'::uuid),
    ('f03e1196-9843-4a62-af08-b4c7eb681e38'::uuid),
    ('f074b0cc-1e6d-4664-84ae-531f384c33ac'::uuid),
    ('f0f93b45-8c75-419c-bcf3-73b7e32c06b2'::uuid),
    ('f122de85-c32a-4659-85b2-508a1cd0ca5a'::uuid),
    ('f2e990a6-3206-491e-8f11-b7050e5445de'::uuid),
    ('f33c2e21-6420-4ab1-8376-383c1a33dd2c'::uuid),
    ('f3d3566d-b532-48eb-bc9f-7587615e3bb4'::uuid),
    ('f406c775-1f6b-4bc7-8a11-44df27ff0b05'::uuid),
    ('f4fe1992-61a5-4f7e-a204-b974093de40f'::uuid),
    ('f545fdb5-9591-499a-964c-ded2b6c55f7a'::uuid),
    ('f5da331f-4507-4b76-8136-2500e1bac0f7'::uuid),
    ('f65ce272-1260-40ab-a047-1acc104c0e7e'::uuid),
    ('f8dc7439-98de-48db-b5fe-352c21f491d0'::uuid),
    ('f954151c-f0c9-48d6-a4ae-90bd6dd1ab8f'::uuid),
    ('f98b96e1-c414-4ad5-a0cb-1c0834541352'::uuid),
    ('f9b375c6-2673-4103-a09b-a309f4045622'::uuid),
    ('fa4ba6a6-c788-4a0c-814c-5c4910f6896f'::uuid),
    ('fae42f2c-07da-494e-830c-49d25d58a367'::uuid),
    ('fba7593e-d49e-4cdf-8898-d61edb7c7f15'::uuid),
    ('fc09bcfe-66f5-46aa-a502-ff5720488e95'::uuid),
    ('fc409554-3038-4b71-87a5-d07c0d7d89ad'::uuid),
    ('fd0b1343-e835-4d23-a1c5-ee08ebee01f6'::uuid),
    ('fe4c3fff-5339-4ab0-9fd0-462429a1cae9'::uuid),
    ('ff8938d8-1a92-438a-a76f-f5e639dc493d'::uuid),
    ('ffd98904-1e68-4208-959a-479db40a18c0'::uuid)
),
-- EXACT_FINAL_412_END
target_roads as materialized (
  select distinct road_id from target_pairs
),
leg_a_routes as materialized (
  select distinct route.id as route_prep_id
  from public.brinesearch_route_prep route
  where route.active and route.route_group in ('primary','alternate') and (
    exists(
      select 1 from public.brinesearch_route_prep_steps step
      join target_roads target on target.road_id=step.road_id
      where step.route_prep_id=route.id and step.active
    )
    or exists(
      select 1 from public.brinesearch_route_prep_steps step
      join private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
        on candidate.route_prep_step_id=step.id
      join target_pairs target on target.identity_id=candidate.identity_id
      where step.route_prep_id=route.id and step.active
    )
    or exists(
      select 1
      from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      join target_pairs target on target.identity_id=receipt.identity_id
      where receipt.route_prep_id=route.id
    )
  )
),
leg_b_routes as materialized (
  select distinct route.id as route_prep_id
  from public.brinesearch_route_prep route
  join private_verification.brinesearch_route_transition_receipts_issue97 transition
    on transition.route_prep_id=route.id
  join replaced_graphs affected on affected.build_id=transition.graph_build_id
  where route.active and route.route_group in ('primary','alternate')
),
transition_only_routes as materialized (
  select route_prep_id from leg_b_routes
  except
  select route_prep_id from leg_a_routes
),
derived_routes as materialized (
  select route_prep_id from leg_a_routes
  union
  select route_prep_id from leg_b_routes
),
existing_dependency_routes as materialized (
  select distinct route.id as route_prep_id
  from public.brinesearch_route_prep route
  where route.active and route.route_group in ('primary','alternate') and (
    exists(
      select 1
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      join target_pairs target
        on target.identity_id=geometry.identity_id or target.road_id=geometry.road_id
      where geometry.route_prep_id=route.id
    )
    or exists(
      select 1
      from private_verification.brinesearch_google_route_receipts_issue97 google
      where google.pad_id=route.pad_id
        and google.manifest->>'route_prep_id'=route.id::text
    )
    or exists(
      select 1 from public.brinesearch_route_prep_steps saved_occurrence
      join target_pairs target on target.road_id=saved_occurrence.road_id
      where saved_occurrence.route_prep_id=route.id and saved_occurrence.active
    )
  )
),
migration_state as materialized (
  select count(*)::integer as rows,
    count(*) filter (
      where name='issue97_frozen_exact_mapping_wave'
        and pg_catalog.cardinality(statements)=1
        and pg_catalog.md5(statements[1])='317b2b649059f3f41bc510e3ac63a439'
    )::integer as exact_rows
  from supabase_migrations.schema_migrations
  where version='20260817193212'
),
manual_mapping_rows as materialized (
  select target.*,mapping.id as mapping_id,mapping.road_id as actual_road_id,
    mapping.mapping_status,mapping.mapping_method,mapping.evidence,
    mapping.created_at,mapping.updated_at,mapping.verified_at,
    identity.source_digest as actual_source_digest
  from target_pairs target
  left join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=target.identity_id
  left join public.brinesearch_authoritative_road_identities identity
    on identity.id=target.identity_id
),
manual_mapping_state as materialized (
  select
    (select count(*) from target_pairs)::integer as expected_rows,
    (select count(distinct road_id) from target_pairs)::integer as expected_roads,
    (select count(*) from target_pairs
      where evidence_basis='exact_route_designation')::integer as highway_rows,
    (select count(*) from target_pairs
      where evidence_basis='exact_base_nlf_source_street_core')::integer
      as component_rows,
    (select pg_catalog.md5(pg_catalog.string_agg(
      identity_id::text,'|' order by identity_id)) from target_pairs)
      as identity_digest,
    (select pg_catalog.md5(pg_catalog.string_agg(
      road_id::text,'|' order by road_id))
      from (select distinct road_id from target_pairs) roads) as road_digest,
    (select pg_catalog.md5(pg_catalog.string_agg(
      identity_id::text||':'||road_id::text,'|' order by identity_id))
      from target_pairs) as pair_digest,
    count(*)::integer as observed_rows,
    count(distinct actual_road_id)::integer as observed_roads,
    count(distinct created_at)::integer as created_timestamps,
    min(created_at) as install_timestamp,
    coalesce(pg_catalog.bool_and(
      mapping_id is not null
      and actual_road_id=road_id
      and mapping_status='verified'
      and mapping_method='manual_reviewed_source_evidence'
      and actual_source_digest=expected_source_digest
      and evidence->>'issue'='97'
      and evidence->>'scope'='frozen-46'
      and evidence->>'state_code'='OH'
      and evidence->>'evidence_basis'=evidence_basis
      and evidence->>'identity_id'=identity_id::text
      and evidence->>'road_id'=road_id::text
      and evidence->>'source_digest'=expected_source_digest
      and evidence->>'source_current'='true'
      and evidence->>'migration'='issue97_frozen_exact_mapping_wave'
      and evidence->>'reviewed_by'='issue97_repository_frozen_wave'
      and evidence->>'reviewed_at'='2026-08-17T19:32:12Z'
      and evidence->>'repository_reviewed'='true'
      and evidence->>'machine_owned'='false'
      and evidence->>'name_matching_used'='false'
      and evidence->>'fuzzy_matching_used'='false'
      and evidence->>'nearest_road_used'='false'
      and evidence->>'exact_method'=case evidence_basis
        when 'exact_route_designation' then 'official_source_id'
        else 'manual_source_conflation' end
      and evidence->>'evidence_digest'=pg_catalog.md5(pg_catalog.concat_ws(
        '|',identity_id::text,road_id::text,evidence_basis,
        expected_source_digest,expected_road_row_md5
      ))
      and created_at=updated_at and created_at=verified_at
    ),false) as exact
  from manual_mapping_rows
),
machine_mapping_rows as materialized (
  select contract.*,identity.source_identity_key as actual_source_identity_key,
    mapping.id as mapping_id,mapping.road_id as actual_road_id,
    mapping.mapping_status as actual_mapping_status,
    mapping.mapping_method as actual_mapping_method,mapping.evidence
  from machine_contract contract
  left join public.brinesearch_authoritative_road_identities identity
    on identity.id=contract.identity_id
  left join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=contract.identity_id
   and mapping.mapping_status in ('verified','candidate')
   and mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
),
machine_mapping_state as materialized (
  select count(*)::integer as rows,
    count(distinct identity_id)::integer as identities,
    count(distinct road_id)::integer as roads,
    count(*) filter(where raw_transition_class='NULL_TO_NONNULL')::integer
      as null_to_nonnull,
    count(*) filter(where raw_transition_class='UNCHANGED_OR_INVALID')::integer
      as same_road_upgrades,
    count(*) filter(where final_mapping_method='exact_route_designation')::integer
      as designation_methods,
    count(*) filter(where final_mapping_method='exact_source_record_id')::integer
      as source_record_methods,
    sum(old_active_membership_occurrence_count)::bigint as occurrences,
    sum(old_active_membership_occurrence_count) filter(
      where raw_transition_class='NULL_TO_NONNULL')::bigint
      as resolution_occurrences,
    sum(old_active_membership_occurrence_count) filter(
      where raw_transition_class='UNCHANGED_OR_INVALID')::bigint
      as upgrade_occurrences,
    pg_catalog.md5(pg_catalog.string_agg(
      identity_id::text,',' order by identity_id)) as identity_digest,
    (select pg_catalog.md5(pg_catalog.string_agg(
      road_id::text,',' order by road_id))
      from (select distinct road_id from machine_contract) roads) as road_digest,
    pg_catalog.md5(pg_catalog.string_agg(
      identity_id::text||'|'||road_id::text,',' order by identity_id,road_id))
      as pair_digest,
    coalesce(pg_catalog.bool_and(
      mapping_id is not null
      and actual_source_identity_key=source_identity_key
      and actual_road_id=road_id
      and actual_mapping_status=final_mapping_status
      and actual_mapping_method=final_mapping_method
      and evidence->>'source_identity_key'=source_identity_key
      and evidence->>'exact_candidate_count'=exact_candidate_count::text
      and coalesce((evidence->>'ambiguity_held')::boolean,false)=ambiguity_flag
      and evidence->>'refresh_scope'=refresh_scope
      and pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'designation_source',evidence->>'designation_source',
        'road_source_record_id',evidence->>'road_source_record_id',
        'migration',evidence->>'migration',
        'evidence_basis',evidence->>'evidence_basis',
        'exact_method',evidence->>'exact_method'
      ))=evidence_source
    ),false) as exact
  from machine_mapping_rows
),
typed_transition_state as materialized (
  select pg_catalog.md5(pg_catalog.string_agg(
    raw.raw_inventory_row::text,'|' order by
      raw.county_code,raw.identity_id,
      raw.prior_road_id nulls first,raw.road_id nulls first
  )) as typed_digest
  from (
    select contract.county_code,contract.identity_id,contract.prior_road_id,
      contract.road_id,
      pg_catalog.jsonb_build_object(
        'road_class',identity.road_class,
        'county_code',contract.county_code,
        'identity_id',contract.identity_id,
        'new_road_id',contract.road_id,
        'route_number',identity.route_number,
        'route_suffix',identity.route_suffix,
        'route_system',identity.route_system,
        'prior_road_id',contract.prior_road_id,
        'refresh_scope',contract.refresh_scope,
        'ambiguity_flag',contract.ambiguity_flag,
        'route_fraction',identity.route_fraction,
        'route_extension',identity.route_extension,
        'transition_class',contract.raw_transition_class,
        'new_mapping_method',contract.final_mapping_method,
        'new_mapping_status',contract.final_mapping_status,
        'source_identity_key',contract.source_identity_key,
        'prior_mapping_method',contract.prior_mapping_method,
        'prior_mapping_status',contract.prior_mapping_status,
        'exact_candidate_count',contract.exact_candidate_count,
        'new_road_source_method',case
          when contract.final_road_reviewed_37
            then 'issue97_frozen_exact_mapping_wave'
          else 'issue97_harrison_exact_authoritative_identity_repair'
        end,
        'active_machine_mapping_rows',1,
        'designation_evidence_source',contract.evidence_source,
        'new_road_verification_status','verified',
        'post_machine_mapping_methods',
          array[contract.final_mapping_method]::text[],
        'frozen_target_evidence_family',case
          when contract.final_road_reviewed_37 then 'exact_route_designation'
          else 'not_in_frozen_37'
        end,
        'identity_is_among_reviewed_46',contract.reviewed_identity_46,
        'new_road_is_among_reviewed_37',contract.final_road_reviewed_37,
        'post_machine_mapping_statuses',
          array[contract.final_mapping_status]::text[],
        'prior_road_is_among_reviewed_37',contract.prior_road_reviewed_37,
        'verified_road_resolution_changed',
          contract.prior_road_id is distinct from contract.road_id,
        'old_active_graph_membership_occurrence_count',
          contract.old_active_membership_occurrence_count
      ) as raw_inventory_row
    from machine_contract contract
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=contract.identity_id
  ) raw
),
-- ISSUE97_CURRENTNESS_MATRIX_BEGIN
currentness_expected(
  kind,county_code,build_id,graph_digest,expected_status,expected_activated_at
) as (
  select 'candidate',county_code,build_id,graph_digest,'validated',null::timestamptz
  from candidate_expected
  union all
  select 'old_active',county_code,build_id,graph_digest,'active',
    '2026-08-16 11:08:18.355674+00'::timestamptz
  from old_expected
  union all
  select 'unaffected_active',county_code,build_id,graph_digest,'active',
    '2026-08-16 11:08:18.355674+00'::timestamptz
  from unaffected_expected
),
currentness_decision as materialized (
  select expected.*,
    case when expected.kind='old_active'
      then private_verification.brinesearch_issue97_graph_build_sources_current(
        expected.build_id
      )
      else private_verification.brinesearch_issue97_graph_build_release_current(
        expected.build_id
      )
    end as decisive_current
  from currentness_expected expected
),
build_currentness as materialized (
  select decision.kind,decision.county_code,decision.build_id,
    decision.graph_digest,decision.expected_status,decision.expected_activated_at,
    decision.decisive_current as sources_current,
    case when decision.kind='old_active' then false
      else decision.decisive_current end as release_current
  from currentness_decision decision
),
currentness_universe_actual as materialized (
  select build.county_code,build.id as build_id,build.graph_digest,
    build.status,build.activated_at
  from currentness_expected expected
  join public.brinesearch_road_graph_builds build on build.id=expected.build_id
  join public.brinesearch_road_graph_counties county
    on build.state_code=county.state_code and build.county_code=county.county_code
  where county.active and county.state_code='OH' and build.state_code='OH'
),
retained_ohio_builds as materialized (
  select build.county_code,build.id as build_id,build.graph_digest,
    build.status,build.activated_at
  from public.brinesearch_road_graph_counties county
  join public.brinesearch_road_graph_builds build
    on build.state_code=county.state_code and build.county_code=county.county_code
  where county.active and county.state_code='OH'
    and build.status in ('validated','active')
),
unexpected_validated_currentness as materialized (
  select retained.build_id,
    private_verification.brinesearch_issue97_graph_build_release_current(
      retained.build_id
    ) as release_current
  from retained_ohio_builds retained
  where retained.status='validated'
    and not exists(select 1 from currentness_expected expected
      where expected.build_id=retained.build_id)
),
currentness_counties_expected(county_code) as (
  select county_code from candidate_expected
  union
  select county_code from unaffected_expected
),
currentness_counties_actual as materialized (
  select county.county_code
  from public.brinesearch_road_graph_counties county
  where county.active and county.state_code='OH'
),
currentness_universe_state as materialized (
  select
    (select count(*) from currentness_expected)::integer as expected_rows,
    (select count(distinct build_id) from currentness_expected)::integer
      as expected_distinct_builds,
    (select count(*) from currentness_universe_actual)::integer as actual_rows,
    (select count(distinct build_id) from currentness_universe_actual)::integer
      as actual_distinct_builds,
    (select count(*) from currentness_counties_expected)::integer
      as expected_counties,
    (select count(*) from currentness_counties_actual)::integer as actual_counties,
    (select count(*) from retained_ohio_builds)::integer as retained_rows,
    (select count(*) from retained_ohio_builds where status='active')::integer
      as retained_active_rows,
    (select count(*) from retained_ohio_builds where status='validated')::integer
      as retained_validated_rows,
    (select count(*) from unexpected_validated_currentness)::integer
      as unexpected_validated_rows,
    (select count(*) from unexpected_validated_currentness where release_current)::integer
      as unexpected_release_current_rows,
    not exists(
      (select county_code,build_id,graph_digest,expected_status,expected_activated_at
       from currentness_expected
       except
       select county_code,build_id,graph_digest,status,activated_at
       from currentness_universe_actual)
      union all
      (select county_code,build_id,graph_digest,status,activated_at
       from currentness_universe_actual
       except
       select county_code,build_id,graph_digest,expected_status,expected_activated_at
       from currentness_expected)
    ) as exact,
    not exists(
      (select county_code from currentness_counties_expected
       except select county_code from currentness_counties_actual)
      union all
      (select county_code from currentness_counties_actual
       except select county_code from currentness_counties_expected)
    ) as counties_exact
),
-- ISSUE97_CURRENTNESS_MATRIX_END
pinned_topology_expected(kind,county_code,build_id,graph_digest,
  source_segment_count,identity_count,point_junction_count,
  shared_segment_count,membership_count) as (
  select 'candidate',county_code,build_id,graph_digest,source_segment_count,
    identity_count,point_junction_count,shared_segment_count,membership_count
  from candidate_expected
  union all
  select 'old_active',county_code,build_id,graph_digest,source_segment_count,
    identity_count,point_junction_count,shared_segment_count,membership_count
  from old_expected
),
pinned_topology_state as materialized (
  select expected.kind,expected.county_code,expected.build_id,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,','
      order by junction.stable_junction_key
    ),'')) as recomputed_graph_digest,
    count(junction.id) filter(where junction.junction_type<>'shared_segment')::integer
      as point_junction_count,
    count(junction.id) filter(where junction.junction_type='shared_segment')::integer
      as shared_segment_count,
    (select count(*)::integer
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions member_junction
        on member_junction.id=membership.junction_id
      where member_junction.build_id=expected.build_id) as membership_count
  from pinned_topology_expected expected
  left join public.brinesearch_road_junctions junction
    on junction.build_id=expected.build_id
  group by expected.kind,expected.county_code,expected.build_id
),
candidate_rows as materialized (
  select expected.*,build.id as actual_build_id,
    build.graph_digest as actual_graph_digest,
    build.source_revision_digest as actual_source_revision_digest,
    build.source_segment_count as actual_source_segments,
    build.identity_count as actual_identities,
    build.point_junction_count as stored_points,
    build.shared_segment_count as stored_shared,
    build.membership_count as stored_memberships,
    build.status,build.activated_at,build.started_at,
    build.details,build.algorithm_version,
    currentness.sources_current,currentness.release_current,
    topology.recomputed_graph_digest,topology.point_junction_count as actual_points,
    topology.shared_segment_count as actual_shared,
    topology.membership_count as actual_memberships
  from candidate_expected expected
  left join public.brinesearch_road_graph_builds build on build.id=expected.build_id
    and build.state_code='OH' and build.county_code=expected.county_code
  left join build_currentness currentness
    on currentness.kind='candidate' and currentness.build_id=expected.build_id
  left join pinned_topology_state topology
    on topology.kind='candidate' and topology.build_id=expected.build_id
),
candidate_state as materialized (
  select count(*)::integer as rows,count(distinct build_id)::integer as builds,
    count(distinct started_at)::integer as started_timestamps,
    min(started_at) as started_at,
    pg_catalog.md5(pg_catalog.string_agg(
      county_code||':'||build_id::text||':'||graph_digest||':'||
      mapping_snapshot_digest||':'||source_revision_digest,
      '|' order by county_code
    )) as candidate_set_digest,
    coalesce(pg_catalog.bool_and(coalesce(
      actual_build_id=build_id
      and actual_graph_digest=graph_digest
      and actual_source_revision_digest=source_revision_digest
      and actual_source_segments=source_segment_count
      and actual_identities=identity_count
      and stored_points=point_junction_count
      and stored_shared=shared_segment_count
      and stored_memberships=membership_count
      and status='validated' and activated_at is null
      and algorithm_version='issue97-authoritative-topology-v2'
      and sources_current and release_current
      and details->>'mapping_snapshot_digest'=mapping_snapshot_digest
      and details->>'mapping_snapshot_version'='issue97-graph-mapping-v2'
      and details->>'release_generation_key'='issue97-release-20260815-r2'
      and details->>'release_builder_md5'='06705f5b35a6d37151bb2c0dc5ade9bd'
      and details->>'release_supplemental_mapper_md5'=
        '4dd8a572b153d795163cf38a41ea9d1f'
      and recomputed_graph_digest=graph_digest
      and actual_points=point_junction_count
      and actual_shared=shared_segment_count
      and actual_memberships=membership_count,
      false
    )),false) as exact
  from candidate_rows
),
old_rows as materialized (
  select expected.*,build.id as actual_build_id,
    build.graph_digest as actual_graph_digest,
    build.source_revision_digest as actual_source_revision_digest,
    build.source_segment_count as actual_source_segments,
    build.identity_count as actual_identities,
    build.point_junction_count as stored_points,
    build.shared_segment_count as stored_shared,
    build.membership_count as stored_memberships,
    build.status,build.activated_at,build.details,
    currentness.sources_current,currentness.release_current,
    topology.recomputed_graph_digest,topology.point_junction_count as actual_points,
    topology.shared_segment_count as actual_shared,
    topology.membership_count as actual_memberships
  from old_expected expected
  left join public.brinesearch_road_graph_builds build on build.id=expected.build_id
    and build.state_code='OH' and build.county_code=expected.county_code
  left join build_currentness currentness
    on currentness.kind='old_active' and currentness.build_id=expected.build_id
  left join pinned_topology_state topology
    on topology.kind='old_active' and topology.build_id=expected.build_id
),
old_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where sources_current)::integer as sources_current,
    count(*) filter(where release_current)::integer as release_current,
    coalesce(pg_catalog.bool_and(coalesce(
      actual_build_id=build_id
      and actual_graph_digest=graph_digest
      and actual_source_revision_digest=source_revision_digest
      and actual_source_segments=source_segment_count
      and actual_identities=identity_count
      and stored_points=point_junction_count
      and stored_shared=shared_segment_count
      and stored_memberships=membership_count
      and status='active'
      and activated_at='2026-08-16 11:08:18.355674+00'::timestamptz
      and details->>'mapping_snapshot_digest'=mapping_snapshot_digest
      and recomputed_graph_digest=graph_digest
      and actual_points=point_junction_count
      and actual_shared=shared_segment_count
      and actual_memberships=membership_count
      and not sources_current and not release_current,
      false
    )),false) as exact
  from old_rows
),
historical_manifest as materialized (
  select manifest.*
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id='c41f5320-1273-470c-a316-28b42211d697'::uuid
    and manifest.manifest_key='issue97-ohio-r2-final-candidate'
),
historical_members as materialized (
  select member.*
  from private_verification.brinesearch_issue97_state_candidate_manifest_members member
  where member.manifest_id='c41f5320-1273-470c-a316-28b42211d697'::uuid
),
unaffected_rows as materialized (
  select expected.*,build.id as actual_build_id,
    build.graph_digest as actual_graph_digest,
    build.status,build.activated_at,build.source_revision_digest,
    build.source_segment_count,build.identity_count,build.point_junction_count,
    build.shared_segment_count,build.membership_count,build.details,
    currentness.sources_current,currentness.release_current,
    member.member_value
  from unaffected_expected expected
  left join public.brinesearch_road_graph_builds build on build.id=expected.build_id
    and build.state_code='OH' and build.county_code=expected.county_code
  left join build_currentness currentness
    on currentness.kind='unaffected_active' and currentness.build_id=expected.build_id
  left join historical_members member
    on member.member_key='OH:'||expected.county_code
),
unaffected_integrity as materialized (
  select expected.build_id,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,','
      order by junction.stable_junction_key
    ),'')) as recomputed_graph_digest,
    count(junction.id) filter(where junction.junction_type<>'shared_segment')::integer
      as point_junction_count,
    count(junction.id) filter(where junction.junction_type='shared_segment')::integer
      as shared_segment_count,
    (select count(*)::integer
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions member_junction
        on member_junction.id=membership.junction_id
      where member_junction.build_id=expected.build_id) as membership_count
  from unaffected_expected expected
  left join public.brinesearch_road_junctions junction
    on junction.build_id=expected.build_id
  group by expected.build_id
),
unaffected_state as materialized (
  select count(*)::integer as rows,
    coalesce(pg_catalog.bool_and(coalesce(
      actual.actual_build_id=actual.build_id
      and actual.actual_graph_digest=actual.graph_digest
      and actual.status='active'
      and actual.activated_at='2026-08-16 11:08:18.355674+00'::timestamptz
      and actual.sources_current and actual.release_current
      and actual.details->>'release_generation_key'='issue97-release-20260815-r2'
      and actual.details->>'release_builder_md5'='06705f5b35a6d37151bb2c0dc5ade9bd'
      and actual.member_value->>'build_id'=actual.build_id::text
      and actual.member_value->>'graph_digest'=actual.graph_digest
      and actual.member_value->>'source_revision_digest'=actual.source_revision_digest
      and actual.member_value->>'generation_key'='issue97-release-20260815-r2'
      and integrity.recomputed_graph_digest=actual.graph_digest
      and integrity.point_junction_count=actual.point_junction_count
      and integrity.shared_segment_count=actual.shared_segment_count
       and integrity.membership_count=actual.membership_count,
      false
    )),false) as exact
  from unaffected_rows actual
  left join unaffected_integrity integrity using(build_id)
),
active_expected(county_code,build_id,graph_digest) as (
  select county_code,build_id,graph_digest from old_expected
  union all
  select county_code,build_id,graph_digest from unaffected_expected
),
active_actual as materialized (
  select build.county_code,build.id as build_id,build.graph_digest,
    currentness.sources_current,currentness.release_current
  from public.brinesearch_road_graph_builds build
  left join build_currentness currentness on currentness.build_id=build.id
  where build.state_code='OH' and build.status='active'
),
active_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where sources_current)::integer as sources_current,
    count(*) filter(where release_current)::integer as release_current,
    not exists(
      (select county_code,build_id,graph_digest from active_expected
       except select county_code,build_id,graph_digest from active_actual)
      union all
      (select county_code,build_id,graph_digest from active_actual
       except select county_code,build_id,graph_digest from active_expected)
    ) as exact
  from active_actual
),
affected_eligible as materialized (
  select build.county_code,build.id as build_id,build.graph_digest
  from build_currentness currentness
  join public.brinesearch_road_graph_builds build on build.id=currentness.build_id
  join candidate_expected expected on expected.build_id=build.id
  where currentness.kind='candidate'
    and build.state_code='OH' and build.county_code=expected.county_code
    and build.status='validated' and build.activated_at is null
    and currentness.sources_current and currentness.release_current
),
eligible_members as materialized (
  select build.state_code||':'||build.county_code as member_key,
    pg_catalog.jsonb_build_object(
      'state_code',build.state_code,
      'county_code',build.county_code,
      'build_id',build.id,
      'graph_digest',build.graph_digest,
      'source_revision_digest',build.source_revision_digest,
      'generation_key',provenance.release_generation
    ) as member_value
  from build_currentness currentness
  join public.brinesearch_road_graph_builds build on build.id=currentness.build_id
  join public.brinesearch_road_graph_counties county
    on county.state_code=build.state_code and county.county_code=build.county_code
  cross join provenance
  where county.active and county.state_code='OH'
    and build.status in ('validated','active')
    and currentness.release_current
),
eligible_state as materialized (
  select
    (select count(*) from affected_eligible)::integer as affected_rows,
    (select count(*) from eligible_members)::integer as ohio_rows,
    not exists(
      (select county_code,build_id,graph_digest from candidate_expected
       except select county_code,build_id,graph_digest from affected_eligible)
      union all
      (select county_code,build_id,graph_digest from affected_eligible
       except select county_code,build_id,graph_digest from candidate_expected)
    ) as affected_exact,
    not exists(
      (select county_code,build_id,graph_digest from candidate_expected
       union all select county_code,build_id,graph_digest from unaffected_expected)
      except
      select member_value->>'county_code',(member_value->>'build_id')::uuid,
        member_value->>'graph_digest' from eligible_members
    ) and not exists(
      select member_value->>'county_code',(member_value->>'build_id')::uuid,
        member_value->>'graph_digest' from eligible_members
      except
      (select county_code,build_id,graph_digest from candidate_expected
       union all select county_code,build_id,graph_digest from unaffected_expected)
    ) as ohio_exact
),
manifest_membership_state as materialized (
  select not exists(
    (select member_key,member_value from historical_members
     except select member_key,member_value from eligible_members)
    union all
    (select member_key,member_value from eligible_members
     except select member_key,member_value from historical_members)
  ) as current
),
manifest_state as materialized (
  select
    (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)
      ::integer as total_manifests,
    (select count(*) from historical_manifest)::integer as historical_rows,
    (select count(*) from historical_members)::integer as member_rows,
    coalesce((select
      state_code='OH'
      and generation_key='issue97-release-20260815-r2'
      and git_sha='e59f8580787bfa05a9f5c05bd3584197ac84444d'
      and manifest_digest='9763dc5bb626da71881b7381ed28a436'
      and member_count=19
      and review_details->>'global_cutover_authorized'='false'
      and review_details->>'activation_impact_count'='0'
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(id)
      and not membership.current
      from historical_manifest cross join manifest_membership_state membership),false)
      as historical_exact,
    (select count(*) from historical_members member
      join candidate_expected candidate
        on member.member_value->>'build_id'=candidate.build_id::text)::integer
      as candidate_member_rows
),
dependency_layer_state as materialized (
  select pg_catalog.to_regclass(
    'private_verification.brinesearch_issue97_approved_haul_corridor_receipts'
  ) as corridor_table
),
source_scope_currentness as materialized (
  select scope.dataset_id,scope.state_code,scope.county_code,
    private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ) as current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code='OH'
),
source_scopes as materialized (
  select count(*)::integer as required,
    count(*) filter(where current)::integer as current
  from source_scope_currentness
),
active_ohio_routes as materialized (
  select route.id,route.route_group,route.pad_id
  from public.brinesearch_route_prep route
  join public.pads pad on pad.id=route.pad_id
  where route.active and route.route_group in ('primary','alternate')
    and pad.state='Ohio' and not coalesce(pad.list_only,false)
),
route_state as materialized (
  select
    (select count(*) from active_ohio_routes)::integer as active_rows,
    (select count(*) from active_ohio_routes where route_group='primary')::integer
      as primary_rows,
    (select count(*) from active_ohio_routes where route_group='alternate')::integer
      as alternate_rows,
    (select count(distinct pad_id) from active_ohio_routes)::integer as routed_pads,
    (select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      join active_ohio_routes route on route.id=receipt.route_prep_id)::integer
      as receipt_rows,
    (select count(*) from frozen_routes)::integer as frozen_rows,
    (select count(distinct route_prep_id) from frozen_routes)::integer
      as frozen_distinct_rows,
    (select count(*) from frozen_routes frozen
      join active_ohio_routes route on route.id=frozen.route_prep_id
      where route.route_group='primary')::integer as frozen_primary,
    (select count(*) from frozen_routes frozen
      join active_ohio_routes route on route.id=frozen.route_prep_id
      where route.route_group='alternate')::integer as frozen_alternate,
    (select pg_catalog.md5(pg_catalog.string_agg(
      route_prep_id::text,'|' order by route_prep_id)) from frozen_routes)
      as frozen_digest,
    (select count(*) from leg_a_routes)::integer as mapping_dependent,
    (select count(*) from transition_only_routes)::integer as transition_only,
    (select count(*) from active_ohio_routes route
      where not exists(select 1 from frozen_routes frozen
        where frozen.route_prep_id=route.id))::integer as untouched_rows,
    not exists(select route_prep_id from frozen_routes
      except select route_prep_id from derived_routes)
      and not exists(select route_prep_id from derived_routes
        except select route_prep_id from frozen_routes) as derived_exact,
    not exists(select route_prep_id from existing_dependency_routes
      except select route_prep_id from frozen_routes) as dependency_exact
),
google_rows as materialized (
  select expected.*,receipt.status,receipt.hold_reason,receipt.manifest_version,
    receipt.manifest_digest,receipt.dependency_digest,receipt.manifest,
    receipt.evidence,receipt.generated_at,receipt.updated_at,
    pad.brinesearch_google_route_status_issue97 as pad_status,
    pad.brinesearch_google_route_revision_issue97 as pad_revision,
    mapping.id as expected_mapping_id
  from google_expected expected
  left join private_verification.brinesearch_google_route_receipts_issue97 receipt
    on receipt.pad_id=expected.pad_id
  left join public.pads pad on pad.id=expected.pad_id
  left join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=expected.identity_id and mapping.road_id=expected.road_id
   and mapping.mapping_status='verified'
   and mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
),
google_state as materialized (
  select count(*)::integer as rows,
    pg_catalog.md5(pg_catalog.string_agg(
      pad_id::text,'|' order by pad_id)) as pad_digest,
    pg_catalog.md5(pg_catalog.string_agg(
      pad_id::text||':'||identity_id::text||':'||road_id::text||':'||
      route_revision::text,'|' order by pad_id)) as tuple_digest,
    coalesce(pg_catalog.bool_and(
      expected_mapping_id is not null
      and status='stale' and hold_reason='road_identity_mapping_changed'
      and manifest_version='issue97-google-v1'
      and manifest_digest is null and dependency_digest is null
      and manifest=pg_catalog.jsonb_build_object(
        'manifest_version','issue97-google-v1','route_ready',false,
        'status','stale','pad_id',pad_id,'route_revision',route_revision
      )
      and pad_status='stale' and pad_revision=route_revision
      and generated_at=(select install_timestamp from manual_mapping_state)
      and updated_at=(select install_timestamp from manual_mapping_state)
      and evidence is not null
      and (select count(*) from pg_catalog.jsonb_object_keys(evidence))=2
      and exists(
        select 1 from public.brinesearch_road_identity_mappings witness
        where witness.identity_id::text=google.evidence->>'identity_id'
          and witness.road_id::text=google.evidence->>'road_id'
          and witness.mapping_status='verified'
          and witness.mapping_method in ('exact_source_record_id','exact_route_designation')
      )
      -- issue97-google-evidence-witness-invariant: the deferred processor may
      -- record any one of several valid invalidating mappings. A live pad-road
      -- binding proves the variable witness; the frozen expected tuple proves
      -- the pre-receipt-manifest binding that is no longer present after the
      -- receipt is rewritten stale.
      and (
        (
          google.evidence->>'identity_id'=google.identity_id::text
          and google.evidence->>'road_id'=google.road_id::text
        )
        or exists(
          select 1 from public.brinesearch_pad_roads step
          where step.pad_id=google.pad_id
            and step.road_id::text=google.evidence->>'road_id'
        )
      )
    ),false) as exact
  from google_rows google
),
non_ohio_state as materialized (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
    coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||
    build.details::text,'|' order by build.id
  ),'')) as graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
      from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id
      where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.boundary_index),''))
      from private_verification.brinesearch_route_transition_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id
      where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id,receipt.occurrence_index),''))
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id
      where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id),''))
      from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
      join public.pads pad on pad.id=receipt.pad_id
      where pad.state in ('West Virginia','Pennsylvania'))
  ))) as route_digest
  from public.brinesearch_road_graph_builds build
  where build.state_code in ('WV','PA')
),
isolation_state as materialized (
  select
    (select count(*) from public.brinesearch_road_graph_builds
      where status='staging')::integer as staging,
    (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
      ::integer as reconciliation_runs,
    (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)
      ::integer as google_queue,
    (select count(*) from public.brinesearch_driver_google_routes_public)::integer
      as public_google,
    public.brinesearch_issue97_cutover_active() as cutover,
    (select count(*) from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and (
          coalesce(activity.application_name,'') ilike '%issue97%'
          or coalesce(activity.query,'') ilike '%issue97_frozen_exact_mapping_wave%'
          or coalesce(activity.query,'') ilike '%20260817193212%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_rebuild_county_graph%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_activate_graph_build%'
        ))::integer as competing_backends,
    (select count(*) from public.brinesearch_road_graph_builds
      where state_code in ('WV','PA')
        and details->>'release_generation_key'='issue97-release-20260815-r2')::integer
      as wvpa_r2_builds,
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
    ) as mapping_lock_available
),
boundary_expected as materialized (
  select
    'validated'::text as candidate_status,
    null::timestamptz as candidate_activated_at,
    true as candidate_sources_current,
    true as candidate_release_current,
    false as old_sources_current,
    false as old_release_current,
    true as unaffected_sources_current,
    true as unaffected_release_current,
    false as historical_manifest_current,
    false as route_ready,
    null::text as manifest_digest,
    null::text as dependency_digest,
    false as public_google,
    false as cutover
),
checks as materialized (
  select
    function_state.expected_count=9 and function_state.exact_count=9 as functions_ok,
    release_generation.active_rows=1 and release_generation.exact_rows=1
      as release_generation_ok,
    migration_state.rows=1 and migration_state.exact_rows=1 as migration_ok,
    manual.expected_rows=46 and manual.expected_roads=37
      and manual.highway_rows=28 and manual.component_rows=18
      and manual.identity_digest='492ff9967d8a822d10c8d5003cd018a6'
      and manual.road_digest='e512c45fa202ccf48df1ac272246ce94'
      and manual.pair_digest='0a0f29f2c40f1d1265b498f77ab56dd7'
      and manual.observed_rows=46 and manual.observed_roads=37
      and manual.created_timestamps=1 and manual.exact
      and (select count(*) from public.brinesearch_road_identity_mappings mapping
        where mapping.evidence->>'migration'='issue97_frozen_exact_mapping_wave')=46
      as manual_mappings_ok,
    machine.rows=42 and machine.identities=42 and machine.roads=23
      and machine.null_to_nonnull=35 and machine.same_road_upgrades=7
      and machine.designation_methods=34 and machine.source_record_methods=8
      and machine.occurrences=1126 and machine.resolution_occurrences=1066
      and machine.upgrade_occurrences=60
      and machine.identity_digest=provenance.transition_identity_digest
      and machine.road_digest=provenance.transition_road_digest
      and machine.pair_digest=provenance.transition_pair_digest
      and typed.typed_digest=provenance.typed_transition_digest
      and machine.exact as machine_mappings_ok,
    currentness.expected_rows=27 and currentness.expected_distinct_builds=27
      and currentness.actual_rows=27 and currentness.actual_distinct_builds=27
      and currentness.expected_counties=19 and currentness.actual_counties=19
      and currentness.retained_rows=35 and currentness.retained_active_rows=19
      and currentness.retained_validated_rows=16
      and currentness.unexpected_validated_rows=8
      and currentness.unexpected_release_current_rows=0
      and currentness.exact and currentness.counties_exact
      as currentness_universe_ok,
    candidate.rows=8 and candidate.builds=8 and candidate.started_timestamps=1
      and candidate.started_at=manual.install_timestamp
      and (select count(*) from public.brinesearch_road_graph_builds build
        where build.started_at=manual.install_timestamp)=8
      and candidate.candidate_set_digest=provenance.candidate_set_digest
      and candidate.exact as candidates_ok,
    old.rows=8 and old.sources_current=0 and old.release_current=0 and old.exact
      as old_builds_ok,
    unaffected.rows=11 and unaffected.exact as unaffected_ok,
    active.rows=19 and active.sources_current=11 and active.release_current=11
      and active.exact as active_boundary_ok,
    eligible.affected_rows=8 and eligible.ohio_rows=19
      and eligible.affected_exact and eligible.ohio_exact as eligibility_ok,
    manifest.total_manifests=1 and manifest.historical_rows=1
      and manifest.member_rows=19 and manifest.historical_exact
      and manifest.candidate_member_rows=0
      and dependency.corridor_table is null as manifest_boundary_ok,
    source.required=38 and source.current=38 as sources_ok,
    route.active_rows=806 and route.primary_rows=658 and route.alternate_rows=148
      and route.routed_pads=658 and route.receipt_rows=806
      and route.frozen_rows=412 and route.frozen_distinct_rows=412
      and route.frozen_primary=340 and route.frozen_alternate=72
      and route.frozen_digest=provenance.route_digest
      and route.mapping_dependent=379 and route.transition_only=33
      and route.untouched_rows=394 and route.derived_exact and route.dependency_exact
      as routes_ok,
    google.rows=9 and google.pad_digest=provenance.google_pad_digest
      and google.tuple_digest=provenance.google_tuple_digest and google.exact
      as google_ok,
    isolation.staging=0 and isolation.reconciliation_runs=0
      and isolation.google_queue=0 and isolation.public_google=0
      and not isolation.cutover and isolation.competing_backends=0
      and isolation.wvpa_r2_builds=0 and isolation.mapping_lock_available
      as isolation_ok,
    boundary.candidate_status='validated'
      and boundary.candidate_activated_at is null
      and boundary.candidate_sources_current=true
      and boundary.candidate_release_current=true
      and boundary.old_sources_current=false
      and boundary.old_release_current=false
      and boundary.unaffected_sources_current=true
      and boundary.unaffected_release_current=true
      and boundary.historical_manifest_current=false
      and boundary.route_ready=false
      and boundary.manifest_digest is null
      and boundary.dependency_digest is null
      and boundary.public_google=false
      and boundary.cutover=false as boundary_literals_ok,
    non_ohio.graph_digest=manifest_header.review_details->>'non_ohio_graph_digest'
      and non_ohio.route_digest=manifest_header.review_details->>'non_ohio_route_digest'
      as non_ohio_ok
  from provenance
  cross join function_state
  cross join active_release_generation_state release_generation
  cross join migration_state
  cross join manual_mapping_state manual
  cross join machine_mapping_state machine
  cross join typed_transition_state typed
  cross join currentness_universe_state currentness
  cross join candidate_state candidate
  cross join old_state old
  cross join unaffected_state unaffected
  cross join active_state active
  cross join eligible_state eligible
  cross join manifest_state manifest
  cross join dependency_layer_state dependency
  cross join source_scopes source
  cross join route_state route
  cross join google_state google
  cross join isolation_state isolation
  cross join boundary_expected boundary
  cross join non_ohio_state non_ohio
  left join historical_manifest manifest_header on true
),
check_failures as materialized (
  select pg_catalog.concat_ws(',',
    case when not coalesce(functions_ok,false) then 'functions_ok' end,
    case when not coalesce(release_generation_ok,false) then 'release_generation_ok' end,
    case when not coalesce(migration_ok,false) then 'migration_ok' end,
    case when not coalesce(manual_mappings_ok,false) then 'manual_mappings_ok' end,
    case when not coalesce(machine_mappings_ok,false) then 'machine_mappings_ok' end,
    case when not coalesce(currentness_universe_ok,false) then 'currentness_universe_ok' end,
    case when not coalesce(candidates_ok,false) then 'candidates_ok' end,
    case when not coalesce(old_builds_ok,false) then 'old_builds_ok' end,
    case when not coalesce(unaffected_ok,false) then 'unaffected_ok' end,
    case when not coalesce(active_boundary_ok,false) then 'active_boundary_ok' end,
    case when not coalesce(eligibility_ok,false) then 'eligibility_ok' end,
    case when not coalesce(manifest_boundary_ok,false) then 'manifest_boundary_ok' end,
    case when not coalesce(sources_ok,false) then 'sources_ok' end,
    case when not coalesce(routes_ok,false) then 'routes_ok' end,
    case when not coalesce(google_ok,false) then 'google_ok' end,
    case when not coalesce(isolation_ok,false) then 'isolation_ok' end,
    case when not coalesce(boundary_literals_ok,false) then 'boundary_literals_ok' end,
    case when not coalesce(non_ohio_ok,false) then 'non_ohio_ok' end
  ) as labels
  from checks
),
gate as materialized (
  select checks.*,
    case when failures.labels='' then 1
      else ('ISSUE97_PIN_FAILURE|'||failures.labels)::integer end as contract_pass
  from checks cross join check_failures failures
),
receipt as materialized (
  select pg_catalog.jsonb_build_object(
    'classification','PINNED_POSTINSTALL_PREACTIVATION',
    'contract_pass',gate.contract_pass,
    'authority',pg_catalog.jsonb_build_object(
      'branch',provenance.branch,'git_head',provenance.git_head,
      'git_tree',provenance.git_tree,'permanent_attempt_id',provenance.permanent_attempt_id,
      'permanent_sql_sha256',provenance.permanent_sql_sha256,
      'rehearsal_sha256',provenance.rehearsal_sha256,
      'rehearsal_blob',provenance.rehearsal_blob,
      'migration_sha256',provenance.migration_sha256,
      'migration_blob',provenance.migration_blob,
      'migration_md5',provenance.migration_md5,
      'route_manifest_sha256',provenance.route_manifest_sha256,
      'route_manifest_blob',provenance.route_manifest_blob,
      'permanent_stdout_sha256',provenance.permanent_stdout_sha256,
      'permanent_stderr_sha256',provenance.permanent_stderr_sha256,
      'frozen_route_block_sha256',provenance.frozen_route_block_sha256
    ),
    'mapping_contract',pg_catalog.jsonb_build_object(
      'manual_identities',46,'manual_roads',37,'machine_transitions',42,
      'machine_final_roads',23,'null_to_nonnull',35,'same_road_upgrades',7,
      'occurrences',1126,'resolution_occurrences',1066,'upgrade_occurrences',60,
      'identity_digest',provenance.transition_identity_digest,
      'road_digest',provenance.transition_road_digest,
      'pair_digest',provenance.transition_pair_digest,
      'typed_transition_digest',provenance.typed_transition_digest
    ),
    'candidate_set_digest',provenance.candidate_set_digest,
    'candidates',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'build_order',build_order,'county_code',county_code,'build_id',build_id,
      'graph_digest',graph_digest,'mapping_snapshot_digest',mapping_snapshot_digest,
      'source_revision_digest',source_revision_digest,
      'source_segment_count',source_segment_count,'identity_count',identity_count,
      'point_junction_count',point_junction_count,
      'shared_segment_count',shared_segment_count,'membership_count',membership_count,
      'status','validated','activated',false,'sources_current',true,
      'release_current',true
    ) order by build_order) from candidate_expected),
    'active_boundary',pg_catalog.jsonb_build_object(
      'active_ohio',19,'active_sources_current',11,'active_release_current',11,
      'replacement_candidates_eligible',8,'eligible_ohio_members',19,
      'historical_manifest_current',false,'currentness_builds_evaluated_once',27,
      'direct_sources_current_evaluations',8,
      'pinned_release_current_evaluations',19,
      'historical_release_current_evaluations',8,
      'total_release_current_evaluations',27,
      'retained_active_validated_builds',35,'retained_validated_builds',16,
      'retained_historical_validated_builds',8,
      'unexpected_release_current_validated_builds',0
    ),
    'routes',pg_catalog.jsonb_build_object(
      'active',806,'receipts',806,'affected',412,'mapping_dependent',379,
      'transition_only',33,'primary',340,'alternate',72,'untouched',394,
      'digest',provenance.route_digest
    ),
    'google',pg_catalog.jsonb_build_object(
      'dependency_pads',9,'pad_digest',provenance.google_pad_digest,
      'tuple_digest',provenance.google_tuple_digest,'queue',0,
      'public_routes',0,'cutover',false
    ),
    'protected_boundary',pg_catalog.jsonb_build_object(
      'staging',0,'reconciliation_runs',0,'competing_backends',0,
      'new_manifest',false,'activation',false,'public_google',false,
      'global_cutover',false,'wvpa_release',false,
      'mapping_lock_available',true
    )
  ) as body
  from gate cross join provenance
)
select 'ISSUE97_FROZEN_MAPPING_WAVE_PRODUCTION_PINS|'||body::text
from receipt;
