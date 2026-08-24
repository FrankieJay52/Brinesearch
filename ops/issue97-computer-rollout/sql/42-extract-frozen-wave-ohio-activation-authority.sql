\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned
\timing on

-- GitHub Issue #97 -- fixed read-only extraction of the exact authority needed
-- to design the frozen-wave Ohio activation. This file performs no persistent
-- or temporary DDL/DML, no activation, no reconciliation, no Google mutation,
-- no publication and no cutover. Every advisory lock is transaction-scoped and
-- is released by the final ROLLBACK.
--
-- The literal route block is mechanically identical to file 34's
-- EXACT_FINAL_412 block. The literal candidate/old/retained and Google sets are
-- repository authority from files 37, 38 and 41. No caller input is accepted.

-- READ COMMITTED is deliberate: every advisory lock is acquired before the
-- one final authority statement takes its statement snapshot. Under
-- REPEATABLE READ the first blocking lock SELECT would establish a snapshot
-- before the lock was obtained, allowing a writer that commits while this
-- session waits to leave a stale-but-locked extraction snapshot.
begin isolation level read committed read only;
set local statement_timeout='15min';
set local lock_timeout='2min';
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local extra_float_digits=3;
set local standard_conforming_strings=on;

-- Freeze the same resources, in the installed writer order, while the authority
-- receipt is extracted. These locks change no database row and release on
-- ROLLBACK.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
);

-- Match the complete activation/reconciliation lock hierarchy before any
-- graph-specific lock is taken. These two corpus locks prevent a concurrent
-- route batch from changing which pads/routes the graph triggers can reach.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97)
);

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

do $issue97_activation_authority_ingest_locks$
declare lock_row record;
begin
  for lock_row in
    select distinct source_entry.value->>'dataset_id' as dataset_id,
      source_entry.value->>'state_code' as state_code,
      source_entry.value->>'county_code' as county_code
    from public.brinesearch_road_graph_builds build
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(build.details->'source_run_vector','[]'::jsonb)
    ) source_entry(value)
    where build.id in (
      '8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb'::uuid,
      '1c1320b3-4257-4239-9c55-b18a801aa97e'::uuid,
      '8e565c14-33a4-4862-9bf8-be9b5557b293'::uuid,
      'b86d14c7-5c8a-4cb9-8a3b-903965340678'::uuid,
      '7c979743-72e4-42a2-a6a9-006a369168c0'::uuid,
      '44245144-3e39-45fe-907b-95e2b01b9c32'::uuid,
      '0870470a-11f8-4f33-8af3-08d6849d5f34'::uuid,
      'c9bac3a2-82d4-4b76-813c-6a29c1bf062a'::uuid,
      '360472bf-cb96-4ba7-b2fe-efa04e230f69'::uuid,
      'e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048'::uuid,
      '8493f66b-b3d2-4673-be8a-07b024b9723d'::uuid,
      '98ae1835-1064-4c18-a8a7-9a9e570e212d'::uuid,
      '200d56dc-5b13-4f84-82cb-946b8ebeada2'::uuid,
      'c645a8bf-a920-432a-a341-a7b60d9cfd49'::uuid,
      '67541fad-5cf2-4483-b0f6-f4060197fda9'::uuid,
      '3c94b14c-9d9e-41ec-a897-b754dab6d8dd'::uuid,
      'fd6fdfff-f23f-42cc-a633-64448bd9d044'::uuid,
      '785f5277-369c-4ae3-ba80-31411745e46d'::uuid,
      '90982f30-8a06-4a53-8b4b-9efd5d9042bf'::uuid
    )
    order by dataset_id,state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||lock_row.dataset_id||':'||
        lock_row.county_code
    ));
  end loop;
end
$issue97_activation_authority_ingest_locks$;

do $issue97_activation_authority_graph_locks$
declare lock_row record;
begin
  for lock_row in
    select * from (values
      (1,'ATH'),(2,'BEL'),(3,'CAR'),(4,'COL'),(5,'COS'),(6,'GUE'),
      (7,'HAS'),(8,'JEF'),(9,'MAH'),(10,'MEG'),(11,'MOE'),(12,'MUS'),
      (13,'NOB'),(14,'POR'),(15,'STA'),(16,'TRU'),(17,'TUS'),
      (18,'VIN'),(19,'WAS')
    ) literal(ordinal,county_code)
    order by ordinal
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:OH:'||lock_row.county_code
    ));
  end loop;
end
$issue97_activation_authority_graph_locks$;

do $issue97_activation_authority_google_locks$
declare lock_row record;
begin
  for lock_row in
    select pad_id from (values
      ('69c63442-de05-4d15-95da-07da587bc070'::uuid),
      ('6ef0746f-341a-4d29-9399-a81cfbec11e8'::uuid),
      ('75600d0c-17b8-488b-96c9-4b7b8ffc8b1b'::uuid),
      ('b6dae008-74d4-4976-9c72-fba7ae349c50'::uuid),
      ('b7526e45-0b33-4988-ae1c-0a4140971f8e'::uuid),
      ('d7898e8c-1bb6-48f8-b5e0-87bc1898420e'::uuid),
      ('e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid),
      ('f896d00c-da26-41b6-bf5b-e9d91afbdbc6'::uuid),
      ('fcbf5085-4ba2-496d-9c20-516e8b52f9bd'::uuid)
    ) literal(pad_id)
    order by pad_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:google-route:'||lock_row.pad_id::text
    ));
  end loop;
end
$issue97_activation_authority_google_locks$;

with
candidate_expected(
  build_order,county_code,build_id,graph_digest,mapping_snapshot_digest,
  source_revision_digest,source_segment_count,identity_count,
  point_junction_count,shared_segment_count,membership_count
) as (
  -- ISSUE97_ACTIVATION_CANDIDATES_BEGIN
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
  -- ISSUE97_ACTIVATION_CANDIDATES_END
),
old_expected(
  county_code,build_id,graph_digest,mapping_snapshot_digest,
  source_revision_digest,source_segment_count,identity_count,
  point_junction_count,shared_segment_count,membership_count
) as (
  -- ISSUE97_ACTIVATION_OLD_BUILDS_BEGIN
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
  -- ISSUE97_ACTIVATION_OLD_BUILDS_END
),
retained_expected(
  ordinal,county_code,build_id,graph_digest,source_revision_digest,member_digest
) as (
  -- ISSUE97_ACTIVATION_RETAINED_ELEVEN_BEGIN
  values
    (1,'ATH','8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb'::uuid,'2080a5a06944f3d4842e31937748267f','4e955e0c8736f17dbd6ff79aa1c17e9d','9b7f9a9c682b51da132b927fba446429'),
    (5,'COS','7c979743-72e4-42a2-a6a9-006a369168c0'::uuid,'7791b63c7bcb5848200b5bc4cc970fb4','b9da0eb95ae5b4e03a0143484372b658','b4186d15df742d0fc8293dc806970350'),
    (9,'MAH','360472bf-cb96-4ba7-b2fe-efa04e230f69'::uuid,'4a80abcc01932b7a169189ec5f706cc4','79d1cd99ffcad7a04a06bd5ad7138417','b8f88d2df1a54a23bad6d77d68fdb5aa'),
    (10,'MEG','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048'::uuid,'2fcf1a69c13907789a2f902574a35674','e90b8b30a449199a490fe85688670dfb','75886082576aece46f6da8bfe3512d78'),
    (12,'MUS','98ae1835-1064-4c18-a8a7-9a9e570e212d'::uuid,'04a4c9d7a4274ac638cad78a406f76fa','0761cc66281b70da78dd0375ecb7cb86','d0a61a9e48eecf2bdd181af144c12278'),
    (14,'POR','c645a8bf-a920-432a-a341-a7b60d9cfd49'::uuid,'89513e609f359ad9064814ebbf074810','a86ed19837abdfa55047ddabbc60ffcc','f82c1db46f4f405610f4a7be525fd851'),
    (15,'STA','67541fad-5cf2-4483-b0f6-f4060197fda9'::uuid,'67be9ebece47e78c4c7ccf29ea92786e','adaeac05c1e99de304b1c9a10ac83443','d0826c5f57a593105b3aa43215e33873'),
    (16,'TRU','3c94b14c-9d9e-41ec-a897-b754dab6d8dd'::uuid,'2ff743a4c7f223a6821d3eaff7416d1d','60f07d2d3e4328c1f448c07aca49f4c8','c655a2dc29c81177694565dbc069f1a8'),
    (17,'TUS','fd6fdfff-f23f-42cc-a633-64448bd9d044'::uuid,'b5d73c4e9a397596bbdc1dd0697a0b6d','810a6b9c9f96448c52c722fbba8c3996','8232b7174a6e40b383f08173a3a2e81e'),
    (18,'VIN','785f5277-369c-4ae3-ba80-31411745e46d'::uuid,'551be5443af26c64d5ed5e92a58ee71b','c8962e1b5eec1d974533a973ca1f9362','7ae096daf0adf869efe405a5b5ae8530'),
    (19,'WAS','90982f30-8a06-4a53-8b4b-9efd5d9042bf'::uuid,'6ccff50666a085a4387c20fb49f90a59','d372a68557e29d1ae871025c372eb785','d6de47b387317ed968b15c1f74d7429c')
  -- ISSUE97_ACTIVATION_RETAINED_ELEVEN_END
),
replacement_member_digest(county_code,member_digest) as (
  values
    ('BEL','d2897b014f14e74eda72c11d1cac5f21'),
    ('CAR','5cfeca8cfde72a71c70db7e0acaccf17'),
    ('COL','85b6c4c11c8e8bff38624a1af957346f'),
    ('GUE','d6b0bd997ae6b615ac3062adb91d0e31'),
    ('HAS','38e64b032a5b6dda397adff52c2b0e84'),
    ('JEF','fed45e0eb7e217338b2b0a8d0e9d09da'),
    ('MOE','287992b389092b7611328b7cceb3d66b'),
    ('NOB','33dc4563999762e315d87ebf29581c70')
),
expected_members as materialized (
  select retained.ordinal,'retained'::text as member_kind,
    retained.county_code,retained.build_id,retained.graph_digest,
    retained.source_revision_digest,retained.member_digest
  from retained_expected retained
  union all
  select case candidate.county_code
      when 'BEL' then 2 when 'CAR' then 3 when 'COL' then 4 when 'GUE' then 6
      when 'HAS' then 7 when 'JEF' then 8 when 'MOE' then 11 when 'NOB' then 13
    end,
    'replacement',candidate.county_code,candidate.build_id,
    candidate.graph_digest,candidate.source_revision_digest,digest.member_digest
  from candidate_expected candidate
  join replacement_member_digest digest using(county_code)
),
google_expected(pad_id,identity_id,road_id,route_revision) as (
  -- ISSUE97_ACTIVATION_GOOGLE_PADS_BEGIN
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
  -- ISSUE97_ACTIVATION_GOOGLE_PADS_END
),
target_pairs(identity_id,road_id) as (
  values
    ('053d2de3-574b-1ea7-7960-b631a45da010'::uuid,'f11d1a84-da80-4ff1-ac4a-a5e74e8a6a37'::uuid),
    ('0e8d7841-6cfa-085d-ab39-ddabbc0fbfcc'::uuid,'cf05fdb2-fcdf-4f63-bd6b-73a4d11e2eac'::uuid),
    ('0f0e881e-3280-9c5c-fa13-a8e019d238cf'::uuid,'e222f21a-a552-4f7b-a0a0-85ed7d847613'::uuid),
    ('137b9f2a-bf22-4ed5-465f-f56e078b5666'::uuid,'c19792f3-aeb4-423c-8c65-70f16266f9bd'::uuid),
    ('13fe0da8-ba4e-ba64-250b-98789544f9fd'::uuid,'3deab4c8-2a90-4579-bcb6-373cef11a0ce'::uuid),
    ('2bf03464-eb0e-d84d-f559-1146612d3635'::uuid,'3582c931-137f-47b8-9ae9-334e88569676'::uuid),
    ('2ce6037e-df5c-8ec6-f6c4-971cdbaff958'::uuid,'762d7cae-f511-41f6-aa30-153b2292ad07'::uuid),
    ('2dab3b9a-45d9-0c43-9109-b49e46979287'::uuid,'e3002b89-2e29-4dd8-b9ec-20cfdf51ebe0'::uuid),
    ('36386818-82ec-10ca-71e8-58e1727504c7'::uuid,'ee656517-2a97-4a7f-8277-6b18e36a416d'::uuid),
    ('43c9d8dd-716f-a1ab-505c-11df9cd2d399'::uuid,'8d047662-daba-48ef-a95e-b28c30e3e564'::uuid),
    ('48b2a7b6-23d4-1e65-a201-e3d2672bf58e'::uuid,'77bf1737-51e7-46b6-887c-87305375a99d'::uuid),
    ('4975721e-acd6-5bfb-0f5e-fa1643455bd3'::uuid,'9182abf5-4a8c-4532-b6d1-02b72b45a5dc'::uuid),
    ('4da5dd58-d472-7f65-dc11-44a1bea94c23'::uuid,'f391149c-10c2-4c87-99e1-346ee425c1b5'::uuid),
    ('4fba3fe7-6679-9c39-996c-d0bd7ba8c7a1'::uuid,'7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'::uuid),
    ('56abd74c-6015-084b-6b07-b6b5f4cc4365'::uuid,'3c1f5a69-a15d-46ed-8c07-74b8d9285009'::uuid),
    ('5aaf55fa-b1bd-ecd7-7ec3-c158fe8db7a9'::uuid,'7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'::uuid),
    ('5d76d39f-5d4f-967b-8652-295eefa2ac73'::uuid,'7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c'::uuid),
    ('5f0233b7-bb01-49bb-12d6-2ac2006191f2'::uuid,'0a96a8b7-e9f6-4607-8d09-20cd3793ff8d'::uuid),
    ('6a726504-2f18-7366-9c33-642676763dfe'::uuid,'5ae10d76-e896-40bb-aecf-8d23f512e195'::uuid),
    ('77db8dda-8652-2a79-e464-9412c2aa419a'::uuid,'28a61175-d4c0-42e5-9644-b1a85160b83d'::uuid),
    ('7bec2b36-7155-aaa2-6198-8dafe49bbc14'::uuid,'4c95c2cf-dc31-469e-b717-a0b03e8abc54'::uuid),
    ('87552b33-5cdb-feb2-a616-d12a6a04ec37'::uuid,'f73b1bc0-5aed-45c1-a88c-7c1f769f52b9'::uuid),
    ('88c8f26f-e848-7877-927e-d3af46068714'::uuid,'e3002b89-2e29-4dd8-b9ec-20cfdf51ebe0'::uuid),
    ('897c8d12-af5b-14c0-22bd-355449abca24'::uuid,'40d2fcd0-8205-44dc-a4de-a650d46ad890'::uuid),
    ('8f990142-8e63-8168-f20a-13bb897c0f67'::uuid,'9182abf5-4a8c-4532-b6d1-02b72b45a5dc'::uuid),
    ('911fa41e-30a2-35ae-da0d-6f22e7e1a0b3'::uuid,'5ae10d76-e896-40bb-aecf-8d23f512e195'::uuid),
    ('928b3dca-62a7-117c-da5c-04e0faf9a9c0'::uuid,'5e165578-f56a-45bc-b87a-bc781b2aa212'::uuid),
    ('9378b0d8-9365-2a37-160b-2a36b2bac3a1'::uuid,'102d9976-3801-42dc-a716-ee1540364f8f'::uuid),
    ('93a43bd7-ea7a-92ea-af5e-4c5e7a7fb4ad'::uuid,'032e69fc-afdf-49ed-821a-f0921cefeef6'::uuid),
    ('990d4aa2-acc5-5e0d-b408-cb0341d7fd47'::uuid,'a6c093cf-cce2-445d-9abe-6bbe05e463ca'::uuid),
    ('99898ae8-b80a-06d3-71c3-7d3901867bcd'::uuid,'9b980c79-5542-4b60-a9f9-c4639ddc2cc2'::uuid),
    ('ac603172-d737-97d2-b668-714c2e5c8471'::uuid,'6a19cd16-4aec-491e-aaa0-414da1c1fa93'::uuid),
    ('b4305a0c-3efe-3a59-d6b1-34d6c71113ab'::uuid,'4da76655-fe6f-4c10-9f03-5510056a0580'::uuid),
    ('bb4e819c-5055-eb5d-1cb0-4d2f1a1be32f'::uuid,'89023472-5bbd-4bf9-b9a4-27d09e7856c9'::uuid),
    ('bd4624be-178e-328d-9f9e-462d6066532e'::uuid,'d7a42c92-9a77-49e0-8792-cd634242272e'::uuid),
    ('c7856355-4ac4-70e0-6ecf-c19b5adb05fb'::uuid,'0a8a8721-4d20-41bf-8d95-ec069173e584'::uuid),
    ('daae38bd-8f05-53bd-4591-08d6b4d98cac'::uuid,'e222f21a-a552-4f7b-a0a0-85ed7d847613'::uuid),
    ('dcaded36-db29-a903-afbd-c2f7129482de'::uuid,'c2d244a5-db55-4d9b-8db7-aa28c226dec9'::uuid),
    ('dee50426-696d-223b-3dc1-604900e34c2d'::uuid,'28a61175-d4c0-42e5-9644-b1a85160b83d'::uuid),
    ('e10108e7-e960-ea53-0b9f-b2485d8089c3'::uuid,'3c1f5a69-a15d-46ed-8c07-74b8d9285009'::uuid),
    ('e7190d69-d5b9-acf1-ae2f-16edd31b051f'::uuid,'79d3dfe9-b6c5-4351-88fd-1a9ffd957137'::uuid),
    ('ec6fa355-2b2d-8a16-6682-397e9df948a5'::uuid,'c2d244a5-db55-4d9b-8db7-aa28c226dec9'::uuid),
    ('f3ff07ad-4156-3c02-3fcb-6b57617d1e44'::uuid,'154688cf-a3d1-4c2f-bf9c-65b15ab424a4'::uuid),
    ('f7feb34a-eb0e-0073-3e56-ecd6141db2df'::uuid,'07751d4e-b2cc-4749-873e-cc3dcbdf921c'::uuid),
    ('f80b4b21-06b0-b774-1ab7-402acfe3c2b9'::uuid,'f4cc321a-7010-4f44-a469-c49ca9c32241'::uuid),
    ('fb216029-dd42-ec15-192f-9192823a0601'::uuid,'a80366a3-06e0-4a0a-970d-7df6c2b7a205'::uuid)
),
permanent_install_state as materialized (
  -- The nine canonical stale receipts were written by the one permanent
  -- mapping installation. Recover its exact timestamp from all 46 frozen
  -- reviewed mappings instead of guessing a timestamp literal.
  select count(*)::integer as mapping_rows,
    count(distinct mapping.created_at)::integer as created_timestamps,
    min(mapping.created_at) as install_timestamp,
    coalesce(pg_catalog.bool_and(
      mapping.id is not null and mapping.road_id=target.road_id
      and mapping.mapping_status='verified'
      and mapping.mapping_method='manual_reviewed_source_evidence'
      and mapping.created_at=mapping.updated_at
      and mapping.created_at=mapping.verified_at
      and mapping.evidence->>'migration'='issue97_frozen_exact_mapping_wave'
      and mapping.evidence->>'scope'='frozen-46'
    ),false) as exact
  from target_pairs target
  left join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=target.identity_id
),
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
  join replaced_graphs replaced on replaced.build_id=transition.graph_build_id
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
active_ohio_routes as materialized (
  select route.id as route_prep_id,route.pad_id,route.route_group,
    route.variant_index
  from public.brinesearch_route_prep route
  join public.pads pad on pad.id=route.pad_id
  where route.active and route.route_group in ('primary','alternate')
    and pad.state='Ohio' and not coalesce(pad.list_only,false)
),
untouched_routes as materialized (
  select route.* from active_ohio_routes route
  where not exists(
    select 1 from frozen_routes frozen
    where frozen.route_prep_id=route.route_prep_id
  )
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
route_metrics as materialized (
  select
    (select count(*) from frozen_routes)::integer as frozen_rows,
    (select count(distinct route_prep_id) from frozen_routes)::integer
      as frozen_distinct_rows,
    (select pg_catalog.md5(pg_catalog.string_agg(
      route_prep_id::text,'|' order by route_prep_id
    )) from frozen_routes) as frozen_digest,
    (select count(*) from frozen_routes frozen
      join public.brinesearch_route_prep route on route.id=frozen.route_prep_id
      where route.active and route.route_group='primary')::integer as primary_rows,
    (select count(*) from frozen_routes frozen
      join public.brinesearch_route_prep route on route.id=frozen.route_prep_id
      where route.active and route.route_group='alternate')::integer as alternate_rows,
    (select count(*) from leg_a_routes)::integer as mapping_rows,
    (select count(*) from transition_only_routes)::integer as transition_rows,
    (select count(*) from active_ohio_routes)::integer as active_ohio_rows,
    (select count(*) from untouched_routes)::integer as untouched_route_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      route_prep_id::text||':'||pad_id::text||':'||route_group||':'||
        variant_index::text,'|' order by route_prep_id
    ),'')) from untouched_routes) as untouched_route_digest,
    not exists(
      (select route_prep_id from frozen_routes
       except select route_prep_id from derived_routes)
      union all
      (select route_prep_id from derived_routes
       except select route_prep_id from frozen_routes)
    ) as derived_exact,
    not exists(
      select route_prep_id from existing_dependency_routes
      except select route_prep_id from frozen_routes
    ) as dependency_exact
),
active_county_expected(county_code) as (
  select county_code from expected_members
),
active_county_actual as materialized (
  select county.county_code
  from public.brinesearch_road_graph_counties county
  where county.state_code='OH' and county.active
),
county_registry_state as materialized (
  -- release_generation exact authority: issue97-release-20260815-r2
  select
    (select count(*) from active_county_actual)::integer as active_county_rows,
    not exists(
      (select county_code from active_county_expected
       except select county_code from active_county_actual)
      union all
      (select county_code from active_county_actual
       except select county_code from active_county_expected)
    ) as active_counties_exact,
    (select count(*) from private_verification.brinesearch_issue97_graph_release_generations
      where active)::integer as active_release_generation_rows,
    (select count(*) from private_verification.brinesearch_issue97_graph_release_generations
      where active and generation_key='issue97-release-20260815-r2')::integer
      as exact_release_generation_rows
),
protected_manifest_state as materialized (
  select
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      build.id::text||':'||pg_catalog.to_jsonb(build)::text,
      '|' order by build.id
    ),'')) from public.brinesearch_road_graph_builds build)
      as graph_registry_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      mapping.id::text||':'||pg_catalog.to_jsonb(mapping)::text,
      '|' order by mapping.id
    ),'')) from public.brinesearch_road_identity_mappings mapping)
      as mapping_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      route.id::text||':'||pg_catalog.to_jsonb(route)::text,
      '|' order by route.id
    ),'')) from public.brinesearch_route_prep route) as route_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.pad_id::text||':'||pg_catalog.to_jsonb(receipt)::text,
      '|' order by receipt.pad_id
    ),''))
     from private_verification.brinesearch_google_route_receipts_issue97 receipt)
      as google_receipt_digest
),
non_ohio_state as materialized (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||
      build.status||':'||coalesce(build.activated_at::text,'')||':'||
      coalesce(build.graph_digest,'')||':'||build.details::text,
    '|' order by build.id
  ),'')) as graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||
        receipt.receipt_digest,'|' order by receipt.route_prep_id,
        receipt.occurrence_index
    ),''))
     from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
     join public.pads pad on pad.id=receipt.pad_id
     where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||
        receipt.receipt_digest,'|' order by receipt.route_prep_id,
        receipt.boundary_index
    ),''))
     from private_verification.brinesearch_route_transition_receipts_issue97 receipt
     join public.pads pad on pad.id=receipt.pad_id
     where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||
        receipt.receipt_digest,'|' order by receipt.route_prep_id,
        receipt.occurrence_index
    ),''))
     from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
     join public.pads pad on pad.id=receipt.pad_id
     where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.receipt_digest,
      '|' order by receipt.route_prep_id
    ),''))
     from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
     join public.pads pad on pad.id=receipt.pad_id
     where pad.state in ('West Virginia','Pennsylvania'))
  ))) as route_digest
  from public.brinesearch_road_graph_builds build
  where build.state_code in ('WV','PA')
),
manifest_header as materialized (
  select manifest.*
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id='1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid
),
manifest_members as materialized (
  select member.*
  from manifest_header header
  join private_verification.brinesearch_issue97_state_candidate_manifest_members member
    on member.manifest_id=header.id
),
expected_manifest_members as materialized (
  select 'OH:'||expected.county_code as member_key,
    pg_catalog.jsonb_build_object(
      'state_code','OH','county_code',expected.county_code,
      'build_id',expected.build_id,'graph_digest',expected.graph_digest,
      'source_revision_digest',expected.source_revision_digest,
      'generation_key','issue97-release-20260815-r2'
    ) as member_value,
    expected.member_digest
  from expected_members expected
),
manifest_state as materialized (
  select
    (select count(*) from manifest_header)::integer as header_rows,
    (select count(*) from manifest_members)::integer as member_rows,
    (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests
      where manifest_key='issue97-ohio-r3-frozen-wave-candidate')::integer
      as key_rows,
    coalesce((select
      state_code='OH'
      and manifest_key='issue97-ohio-r3-frozen-wave-candidate'
      and generation_key='issue97-release-20260815-r2'
      and git_sha='1f49bcb8edfdc386105fe84727fd53448c277d37'
      and member_count=19
      and manifest_digest='77cb00cf83ad8bab4a45c9b552626f76'
      and (select count(*) from pg_catalog.jsonb_object_keys(review_details))=31
      and review_details->>'repository_pin_checkpoint_id'='5378340646'
      and review_details->>'reviewed_by'=
        'Codex sole writer under repository-owner production-manifest authorization'
      and nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null
      and review_details->>'evidence'=
        'Issue #97 repository-pin checkpoint 5378340646 at 1f49bcb8edfdc386105fe84727fd53448c277d37'
      and review_details->>'repository_pin_git_sha'=
        '1f49bcb8edfdc386105fe84727fd53448c277d37'
      and review_details->>'repository_pin_tree'=
        '3014f559859d4980493fac5fca5c09eb458309c4'
      and review_details->>'whole_state_gate'=
        '37-frozen-mapping-wave-production-pins.sql'
      and review_details->>'candidate_set_digest'=
        'c3f925954d41cb6fbd5939eca5de3288'
      and review_details->>'manifest_digest'=
        '77cb00cf83ad8bab4a45c9b552626f76'
      and review_details->>'candidate_count'='8'
      and review_details->>'retained_count'='11'
      and review_details->>'member_count'='19'
      and review_details->>'route_count'='412'
      and review_details->>'route_set_digest'='711b1ddd3ba6c47e7642fc700197432f'
      and review_details->>'google_pad_count'='9'
      and review_details->>'google_pad_digest'='450948793c57a9a1535139fac4974792'
      and review_details->>'google_tuple_digest'='5a75e5c4c34805b7dc2fdf8d0534a4f6'
      and review_details->>'historical_manifest_id'=
        'c41f5320-1273-470c-a316-28b42211d697'
      and review_details->>'historical_manifest_digest'=
        '9763dc5bb626da71881b7381ed28a436'
      and review_details->>'activation_authorized'='false'
      and review_details->>'activation_impact_reviewed'='false'
      and review_details->>'route_reconciliation_authorized'='false'
      and review_details->>'private_google_refresh_authorized'='false'
      and review_details->>'public_google_authorized'='false'
      and review_details->>'global_cutover_authorized'='false'
      and review_details->>'graph_registry_digest'=
        (select graph_registry_digest from protected_manifest_state)
      and review_details->>'mapping_digest'=
        (select mapping_digest from protected_manifest_state)
      and review_details->>'route_state_digest'=
        (select route_digest from protected_manifest_state)
      and review_details->>'google_receipt_digest'=
        (select google_receipt_digest from protected_manifest_state)
      and review_details->>'non_ohio_graph_digest'=
        (select graph_digest from non_ohio_state)
      and review_details->>'non_ohio_route_digest'=
        (select route_digest from non_ohio_state)
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(id)
      from manifest_header),false) as header_exact,
    not exists(
      (select member_key,member_value,member_digest from expected_manifest_members
       except
       select member_key,member_value,member_digest from manifest_members)
      union all
      (select member_key,member_value,member_digest from manifest_members
       except
       select member_key,member_value,member_digest from expected_manifest_members)
    ) as members_exact
),
manifest_baseline_state as materialized (
  select
    (select pg_catalog.md5(pg_catalog.to_jsonb(header)::text)
      from manifest_header header) as header_full_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      member.member_key||':'||pg_catalog.to_jsonb(member)::text,
      '|' order by member.member_key
    ),'')) from manifest_members member) as members_full_digest
),
candidate_actual as materialized (
  select expected.*,build.id as actual_id,build.status,build.activated_at,
    build.started_at,build.graph_digest as actual_graph_digest,
    build.source_revision_digest as actual_source_revision_digest,
    build.source_segment_count as actual_source_segments,
    build.identity_count as actual_identities,
    build.point_junction_count as actual_points,
    build.shared_segment_count as actual_shared,
    build.membership_count as actual_memberships,
    build.details->>'mapping_snapshot_digest' as actual_mapping_snapshot_digest,
    private_verification.brinesearch_issue97_graph_build_release_current(
      expected.build_id
    ) as release_current
  from candidate_expected expected
  left join public.brinesearch_road_graph_builds build
    on build.id=expected.build_id and build.state_code='OH'
      and build.county_code=expected.county_code
),
old_actual as materialized (
  select expected.*,build.id as actual_id,build.status,build.activated_at,
    build.graph_digest as actual_graph_digest,
    build.source_revision_digest as actual_source_revision_digest,
    build.source_segment_count as actual_source_segments,
    build.identity_count as actual_identities,
    build.point_junction_count as actual_points,
    build.shared_segment_count as actual_shared,
    build.membership_count as actual_memberships,
    build.details->>'mapping_snapshot_digest' as actual_mapping_snapshot_digest,
    private_verification.brinesearch_issue97_graph_build_sources_current(
      expected.build_id
    ) as sources_current
  from old_expected expected
  left join public.brinesearch_road_graph_builds build
    on build.id=expected.build_id and build.state_code='OH'
      and build.county_code=expected.county_code
),
retained_actual as materialized (
  select expected.*,build.id as actual_id,build.status,build.activated_at,
    build.graph_digest as actual_graph_digest,
    build.source_revision_digest as actual_source_revision_digest,
    build.source_segment_count as actual_source_segments,
    build.identity_count as actual_identities,
    build.point_junction_count as actual_points,
    build.shared_segment_count as actual_shared,
    build.membership_count as actual_memberships,
    build.details->>'mapping_snapshot_digest' as actual_mapping_snapshot_digest,
    topology.recomputed_graph_digest,topology.recomputed_points,
    topology.recomputed_shared,memberships.recomputed_memberships,
    private_verification.brinesearch_issue97_graph_build_release_current(
      expected.build_id
    ) as release_current
  from retained_expected expected
  left join public.brinesearch_road_graph_builds build
    on build.id=expected.build_id and build.state_code='OH'
      and build.county_code=expected.county_code
  left join lateral (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,
      ',' order by junction.stable_junction_key
    ),'')) as recomputed_graph_digest,
      count(*) filter(where junction.junction_type<>'shared_segment')::integer
        as recomputed_points,
      count(*) filter(where junction.junction_type='shared_segment')::integer
        as recomputed_shared
    from public.brinesearch_road_junctions junction
    where junction.build_id=expected.build_id
  ) topology on true
  left join lateral (
    select count(*)::integer as recomputed_memberships
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction
      on junction.id=membership.junction_id
    where junction.build_id=expected.build_id
  ) memberships on true
),
other_validated as materialized (
  select build.id,
    private_verification.brinesearch_issue97_graph_build_release_current(build.id)
      as release_current
  from public.brinesearch_road_graph_counties county
  join public.brinesearch_road_graph_builds build
    on build.state_code=county.state_code and build.county_code=county.county_code
  where county.active and county.state_code='OH' and build.status='validated'
    and not exists(
      select 1 from candidate_expected expected where expected.build_id=build.id
    )
),
active_build_expected as materialized (
  select county_code,build_id from old_expected
  union all
  select county_code,build_id from retained_expected
),
active_build_actual as materialized (
  select county_code,id as build_id
  from public.brinesearch_road_graph_builds
  where state_code='OH' and status='active'
),
build_state as materialized (
  select
    (select count(*) from candidate_actual)::integer as candidate_rows,
    coalesce((select pg_catalog.bool_and(
      actual_id=build_id and actual_graph_digest=graph_digest
      and actual_mapping_snapshot_digest=mapping_snapshot_digest
      and actual_source_revision_digest=source_revision_digest
      and actual_source_segments=source_segment_count
      and actual_identities=identity_count and actual_points=point_junction_count
      and actual_shared=shared_segment_count
      and actual_memberships=membership_count
      and status='validated' and activated_at is null
      and release_current is true
    ) from candidate_actual),false) as candidates_exact,
    (select pg_catalog.md5(pg_catalog.string_agg(
      county_code||':'||build_id::text||':'||graph_digest||':'||
        mapping_snapshot_digest||':'||source_revision_digest,
      '|' order by county_code
    )) from candidate_actual) as candidate_set_digest,
    (select count(*) from old_actual)::integer as old_rows,
    coalesce((select pg_catalog.bool_and(
      actual_id=build_id and actual_graph_digest=graph_digest
      and actual_mapping_snapshot_digest=mapping_snapshot_digest
      and actual_source_revision_digest=source_revision_digest
      and actual_source_segments=source_segment_count
      and actual_identities=identity_count and actual_points=point_junction_count
      and actual_shared=shared_segment_count
      and actual_memberships=membership_count
      and status='active'
      and activated_at='2026-08-16 11:08:18.355674+00'::timestamptz
      and sources_current is false
    ) from old_actual),false) as old_exact,
    (select count(*) from retained_actual)::integer as retained_rows,
    coalesce((select pg_catalog.bool_and(
      actual_id=build_id and actual_graph_digest=graph_digest
      and actual_source_revision_digest=source_revision_digest
      and status='active'
      and activated_at='2026-08-16 11:08:18.355674+00'::timestamptz
      and actual_mapping_snapshot_digest~'^[0-9a-f]{32}$'
      and actual_source_segments>=0 and actual_identities>=0
      and actual_graph_digest=recomputed_graph_digest
      and actual_points=recomputed_points
      and actual_shared=recomputed_shared
      and actual_memberships=recomputed_memberships
      and release_current is true
    ) from retained_actual),false) as retained_exact,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      county_code||':'||build_id::text||':'||actual_graph_digest||':'||
        actual_mapping_snapshot_digest||':'||actual_source_revision_digest||':'||
        actual_source_segments::text||':'||actual_identities::text||':'||
        actual_points::text||':'||actual_shared::text||':'||
        actual_memberships::text,
      '|' order by ordinal
    ),'')) from retained_actual) as retained_detail_digest,
    (select count(*) from other_validated)::integer as other_validated_rows,
    (select count(*) from other_validated where release_current is not false)::integer
      as other_validated_not_false,
    (select count(*) from public.brinesearch_road_graph_builds
      where state_code='OH' and status='active')::integer as active_ohio_rows,
    not exists(
      (select county_code,build_id from active_build_expected
       except select county_code,build_id from active_build_actual)
      union all
      (select county_code,build_id from active_build_actual
       except select county_code,build_id from active_build_expected)
    ) as active_exact
),
ingest_lock_scope_source as materialized (
  select distinct (source.value->>'dataset_id')::uuid as dataset_id,
    source.value->>'state_code' as state_code,
    source.value->>'county_code' as county_code
  from expected_members member
  join public.brinesearch_road_graph_builds build on build.id=member.build_id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(build.details->'source_run_vector','[]'::jsonb)
  ) source(value)
),
ingest_lock_authority as materialized (
  select row_number() over(order by dataset_id,state_code,county_code)::integer
      as ordinal,
    dataset_id,state_code,county_code,
    'brinesearch:issue97:ingest:'||dataset_id::text||':'||county_code as lock_key
  from ingest_lock_scope_source
),
ingest_lock_state as materialized (
  select count(*)::integer as rows,count(distinct lock_key)::integer
      as distinct_lock_rows,
    count(*) filter(where dataset_id is not null and state_code is not null
      and county_code is not null and lock_key is not null)::integer
      as complete_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      ordinal::text||':'||dataset_id::text||':'||state_code||':'||county_code||':'||
        lock_key,'|' order by ordinal
    ),'')) as authority_digest
  from ingest_lock_authority
),
activation_references as materialized (
  select distinct candidate.county_code,candidate.build_id as new_build_id,
    pad_road.entry_junction_anchor_id as old_anchor_id,
    'published_route'::text as reference_kind,pad_road.pad_id::text as reference_id
  from candidate_expected candidate
  join public.brinesearch_pad_roads pad_road
    on pad_road.junction_build_id in (
      select build.id from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.county_code=candidate.county_code
    )
  where pad_road.entry_junction_anchor_id is not null
  union
  select distinct candidate.county_code,candidate.build_id,
    review_segment.entry_junction_anchor_id,'route_review',
    review_segment.review_id::text
  from candidate_expected candidate
  join public.brinesearch_route_review_segments review_segment
    on review_segment.junction_build_id in (
      select build.id from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.county_code=candidate.county_code
    )
  where review_segment.entry_junction_anchor_id is not null
),
activation_compared as materialized (
  select reference.county_code,reference.new_build_id,
    reference.reference_kind,reference.reference_id,
    old_anchor.id as old_anchor_id,old_junction.stable_junction_key,
    old_anchor.anchor_role,old_anchor.anchor_digest as old_anchor_digest,
    old_junction.graph_digest as old_junction_digest,
    new_anchor.id as new_anchor_id,new_anchor.anchor_digest as new_anchor_digest,
    new_junction.graph_digest as new_junction_digest,
    case when new_junction.id is null then 'junction_missing'
      when new_anchor.id is null then 'anchor_missing'
      when new_anchor.anchor_digest<>old_anchor.anchor_digest then 'anchor_changed'
      when new_junction.graph_digest<>old_junction.graph_digest
        then 'junction_digest_changed'
      else null end as impact_reason
  from activation_references reference
  join public.brinesearch_road_junction_anchors old_anchor
    on old_anchor.id=reference.old_anchor_id
  join public.brinesearch_road_junctions old_junction
    on old_junction.id=old_anchor.junction_id
  left join public.brinesearch_road_junctions new_junction
    on new_junction.build_id=reference.new_build_id
      and new_junction.stable_junction_key=old_junction.stable_junction_key
  left join public.brinesearch_road_junction_anchors new_anchor
    on new_anchor.junction_id=new_junction.id
      and new_anchor.anchor_role=old_anchor.anchor_role
),
activation_impacts as materialized (
  select * from activation_compared where impact_reason is not null
),
activation_impact_receipts as materialized (
  select candidate.build_order,candidate.county_code,candidate.build_id,
    impact.impact_count,impact.impacts,pg_catalog.md5(impact.impacts::text)
      as impact_digest
  from candidate_expected candidate
  cross join lateral (
    select count(*)::integer as impact_count,
      coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference_kind',compared.reference_kind,
        'reference_id',compared.reference_id,
        'old_anchor_id',compared.old_anchor_id,
        'new_anchor_id',compared.new_anchor_id,
        'stable_junction_key',compared.stable_junction_key,
        'anchor_role',compared.anchor_role,
        'reason',compared.impact_reason,
        'old_anchor_digest',compared.old_anchor_digest,
        'new_anchor_digest',compared.new_anchor_digest,
        'old_junction_digest',compared.old_junction_digest,
        'new_junction_digest',compared.new_junction_digest
      ) order by compared.reference_kind,compared.reference_id,
        compared.stable_junction_key,compared.anchor_role),'[]'::jsonb) as impacts
    from activation_impacts compared
    where compared.new_build_id=candidate.build_id
  ) impact
),
impact_routes as materialized (
  select distinct impact.new_build_id,impact.county_code,impact.reference_kind,
    impact.reference_id,route.id as route_prep_id,route.pad_id,
    route.route_group,route.variant_index
  from activation_impacts impact
  join public.brinesearch_route_prep route
    on route.pad_id=impact.reference_id::uuid
      and impact.reference_kind='published_route'
      and route.active and route.route_group in ('primary','alternate')
  union
  select distinct impact.new_build_id,impact.county_code,impact.reference_kind,
    impact.reference_id,route.id,route.pad_id,route.route_group,route.variant_index
  from activation_impacts impact
  join public.brinesearch_route_reviews review
    on review.id=impact.reference_id::uuid
      and impact.reference_kind='route_review'
  join public.brinesearch_route_prep route
    on route.pad_id=review.pad_id
      and route.active and route.route_group in ('primary','alternate')
),
conservative_impact_pads as materialized (
  select distinct impact.new_build_id,impact.county_code,
    impact.reference_kind,impact.reference_id,
    case when impact.reference_kind='published_route'
      then impact.reference_id::uuid else review.pad_id end as pad_id
  from activation_impacts impact
  left join public.brinesearch_route_reviews review
    on impact.reference_kind='route_review'
      and review.id=impact.reference_id::uuid
),
conservative_impact_pad_routes as materialized (
  select distinct pad.new_build_id,pad.county_code,pad.reference_kind,
    pad.reference_id,route.id as route_prep_id,route.pad_id,
    route.route_group,route.variant_index
  from conservative_impact_pads pad
  join public.brinesearch_route_prep route on route.pad_id=pad.pad_id
    and route.active and route.route_group in ('primary','alternate')
),
ambiguous_impact_order_key as materialized (
  select new_build_id,reference_kind,reference_id,stable_junction_key,
    anchor_role,count(*)::integer as duplicate_rows
  from activation_impacts
  group by new_build_id,reference_kind,reference_id,stable_junction_key,
    anchor_role
  having count(*)<>1
),
impact_state as materialized (
  select
    (select count(*) from activation_impacts)::integer as impact_rows,
    (select count(*) from impact_routes)::integer as route_rows,
    (select count(*) from ambiguous_impact_order_key)::integer
      as ambiguous_impact_order_keys,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.county_code||':'||receipt.impact_count::text||':'||
        receipt.impact_digest,'|' order by receipt.build_order
    ),'')) from activation_impact_receipts receipt)
      as county_impact_set_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      route.new_build_id::text||':'||route.reference_kind||':'||
        route.reference_id||':'||route.route_prep_id::text||':'||
        route.pad_id::text||':'||route.route_group||':'||route.variant_index::text,
      '|' order by route.new_build_id,route.reference_kind,route.reference_id,
        route.route_prep_id
    ),'')) from impact_routes route) as impact_route_digest,
    (select count(*) from conservative_impact_pad_routes)::integer
      as conservative_pad_route_rows,
    not exists(
      (select new_build_id,reference_kind,reference_id,route_prep_id
       from impact_routes
       except
       select new_build_id,reference_kind,reference_id,route_prep_id
       from conservative_impact_pad_routes)
      union all
      (select new_build_id,reference_kind,reference_id,route_prep_id
       from conservative_impact_pad_routes
       except
       select new_build_id,reference_kind,reference_id,route_prep_id
       from impact_routes)
    ) as conservative_pad_route_subset_exact,
    (select count(*) from activation_impacts impact
      where not exists(
        select 1 from impact_routes route
        where route.new_build_id=impact.new_build_id
          and route.reference_kind=impact.reference_kind
          and route.reference_id=impact.reference_id
      ))::integer as unmapped_impacts,
    (select count(*) from impact_routes route
      where not exists(
        select 1 from frozen_routes frozen
        where frozen.route_prep_id=route.route_prep_id
      ))::integer as routes_outside_frozen
),
activation_changed_builds as materialized (
  select candidate.build_order*2-1 as event_order,
    'prior_active'::text as build_role,candidate.county_code,old.build_id
  from candidate_expected candidate join old_expected old using(county_code)
  union all
  select candidate.build_order*2,'replacement',candidate.county_code,
    candidate.build_id from candidate_expected candidate
),
activation_build_prestate as materialized (
  select changed.event_order,changed.build_role,changed.county_code,
    changed.build_id,pg_catalog.to_jsonb(build) as row_value
  from activation_changed_builds changed
  join public.brinesearch_road_graph_builds build on build.id=changed.build_id
),
activation_build_protection_state as materialized (
  select
    (select count(*) from activation_build_prestate)::integer as target_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      build_id::text||':'||row_value::text,'|' order by event_order
    ),'')) from activation_build_prestate) as target_digest,
    (select count(*)::integer from public.brinesearch_road_graph_builds build
      where not exists(
        select 1 from activation_changed_builds changed
        where changed.build_id=build.id
      )) as non_target_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      build.id::text||':'||pg_catalog.to_jsonb(build)::text,
      '|' order by build.id
    ),'')) from public.brinesearch_road_graph_builds build
      where not exists(
        select 1 from activation_changed_builds changed
        where changed.build_id=build.id
      )) as non_target_digest
),
google_projection_sources as materialized (
  select changed.event_order,changed.build_role,changed.county_code,changed.build_id,
    receipt.pad_id,'receipt_manifest_point'::text as projection_source
  from activation_changed_builds changed
  join private_verification.brinesearch_google_route_receipts_issue97 receipt
    on exists(
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(receipt.manifest->'points','[]'::jsonb)
      ) point(value)
      where point.value->>'graph_build_id'=changed.build_id::text
    )
  union
  select changed.event_order,changed.build_role,changed.county_code,changed.build_id,
    pad_road.pad_id,'published_pad_road'
  from activation_changed_builds changed
  join public.brinesearch_pad_roads pad_road
    on pad_road.junction_build_id=changed.build_id
),
google_projection_detail as materialized (
  select source.event_order,source.build_role,source.county_code,source.build_id,
    source.pad_id,
    pg_catalog.array_agg(distinct source.projection_source
      order by source.projection_source) as projection_sources
  from google_projection_sources source
  group by source.event_order,source.build_role,source.county_code,
    source.build_id,source.pad_id
),
google_projected_pads as materialized (
  select distinct pad_id from google_projection_detail
),
activation_pad_prestate as materialized (
  select pad.id as pad_id,pg_catalog.to_jsonb(pad) as row_value
  from public.pads pad
  join google_expected expected on expected.pad_id=pad.id
),
activation_pad_protection_state as materialized (
  select
    (select count(*) from activation_pad_prestate)::integer as target_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad_id::text||':'||row_value::text,'|' order by pad_id
    ),'')) from activation_pad_prestate) as target_digest,
    (select count(*)::integer from public.pads pad
      where not exists(
        select 1 from google_expected expected
        where expected.pad_id=pad.id
      )) as non_target_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad.id::text||':'||pg_catalog.to_jsonb(pad)::text,
      '|' order by pad.id
    ),'')) from public.pads pad
      where not exists(
        select 1 from google_expected expected
        where expected.pad_id=pad.id
      )) as non_target_digest,
    (select count(*)::integer
      from private_verification.brinesearch_google_route_receipts_issue97 receipt
      where not exists(
        select 1 from google_expected expected
        where expected.pad_id=receipt.pad_id
      )) as non_target_google_receipt_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.pad_id::text||':'||pg_catalog.to_jsonb(receipt)::text,
      '|' order by receipt.pad_id
    ),''))
     from private_verification.brinesearch_google_route_receipts_issue97 receipt
      where not exists(
       select 1 from google_expected expected
       where expected.pad_id=receipt.pad_id
     )) as non_target_google_receipt_digest
),
google_latest_event as materialized (
  select distinct on (detail.pad_id) detail.*
  from google_projection_detail detail
  order by detail.pad_id,detail.event_order desc
),
google_trigger_routes as materialized (
  select route.id as route_prep_id,route.pad_id,route.route_group,
    route.variant_index
  from google_projected_pads projected
  join public.brinesearch_route_prep route on route.pad_id=projected.pad_id
  where route.active and route.route_group in ('primary','alternate')
),
google_trigger_state as materialized (
  select
    (select count(*) from google_projection_detail)::integer as event_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      event_order::text||':'||build_role||':'||county_code||':'||
        build_id::text||':'||pad_id::text||':'||
        pg_catalog.array_to_string(projection_sources,','),
      '|' order by event_order,pad_id
    ),'')) from google_projection_detail) as trigger_event_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad_id::text,'|' order by pad_id
    ),'')) from google_projected_pads) as trigger_pad_digest,
    (select count(*) from google_trigger_routes)::integer as trigger_route_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      route_prep_id::text||':'||pad_id::text||':'||route_group||':'||
        variant_index::text,'|' order by route_prep_id
    ),'')) from google_trigger_routes) as trigger_route_digest,
    (select count(*) from google_trigger_routes route
      where not exists(
        select 1 from frozen_routes frozen
        where frozen.route_prep_id=route.route_prep_id
      ))::integer as trigger_routes_outside_frozen
),
google_current as materialized (
  select expected.*,receipt.route_revision as receipt_route_revision,
    receipt.status,receipt.hold_reason,receipt.manifest_version,
    receipt.manifest_digest,receipt.dependency_digest,receipt.manifest,
    receipt.evidence,receipt.generated_at,receipt.updated_at,
    pad.legacy_id,pad.pad_name,pad.company,
    pad.structured_route_revision,pad.road_sequence_status,
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
      and mapping.mapping_method in (
        'exact_source_record_id','exact_route_designation'
      )
),
google_immediate_expected as materialized (
  select current.*,event.event_order,event.build_role as final_event_build_role,
    event.county_code as final_event_county_code,
    event.build_id as final_event_build_id,event.projection_sources,
    greatest(coalesce(current.receipt_route_revision,0),0)::bigint
      as final_receipt_and_pad_revision,
    coalesce(current.receipt_route_revision,0)::bigint
      as final_manifest_revision,
    'issue97-google-v1'::text as final_manifest_version,
    'stale'::text as final_status,
    'graph_generation_changed'::text as final_hold_and_queue_reason,
    pg_catalog.jsonb_build_object('graph_build_id',event.build_id)
      as final_evidence,
    pg_catalog.jsonb_build_object(
      'manifest_version','issue97-google-v1','route_ready',false,
      'status','stale','pad_id',current.pad_id,
      'route_revision',coalesce(current.receipt_route_revision,0)
    ) as final_manifest,
    false as immediate_public_exists,true as immediate_queue_exists,
    (select count(*)::integer from google_projection_detail detail
      where detail.pad_id=current.pad_id) as immediate_pad_update_count
  from google_current current
  join google_latest_event event on event.pad_id=current.pad_id
),
google_dispatch_branch as materialized (
  select immediate.*,
    (coalesce(immediate.structured_route_revision,0)>=1
      and immediate.road_sequence_status='owner_verified'
      and exists(
        select 1 from public.brinesearch_pad_roads pad_road
        where pad_road.pad_id=immediate.pad_id
          and pad_road.route_group='primary'
          and pad_road.route_variant_index=0
      )) as published_selected,
    (select count(*)::integer
     from public.brinesearch_pad_roads pad_road
     where pad_road.pad_id=immediate.pad_id
       and pad_road.route_group='primary'
       and pad_road.route_variant_index=0
       and (
         pad_road.route_revision is distinct from immediate.structured_route_revision
         or coalesce(pad_road.geometry_version,0)<1
         or pad_road.step_geometry is null
         or pad_road.geometry_source is distinct from 'road_manager_clip_issue69'
         or pad_road.geometry_status is distinct from 'snapped_intersections'
         or nullif(pad_road.road_geometry_digest,'') is null
       )) as bad_published_geometry
  from google_immediate_expected immediate
),
google_expected_post_deferred as materialized (
  select branch.*,
    case when published_selected then 'held' else final_status end
      as expected_post_deferred_status,
    case
      when published_selected and bad_published_geometry>0
        then 'published_route_contains_draft_or_stale_geometry'
      when published_selected then 'issue97_cutover_not_active'
      else final_hold_and_queue_reason
    end as expected_post_deferred_hold_reason,
    case when published_selected
      then greatest(coalesce(structured_route_revision,0),0)::bigint
      else final_receipt_and_pad_revision
    end as expected_post_deferred_receipt_and_pad_revision,
    case when published_selected
      then coalesce(structured_route_revision,0)::bigint
      else final_manifest_revision
    end as expected_post_deferred_manifest_revision,
    case
      when published_selected and bad_published_geometry>0 then
        pg_catalog.jsonb_build_object(
          'manifest_mode','published_route',
          'bad_step_count',bad_published_geometry,
          'requires_geometry_version_at_least',1,'no_guess',true
        )
      when published_selected then '{}'::jsonb
      else final_evidence
    end as expected_post_deferred_evidence,
    case when published_selected then pg_catalog.jsonb_build_object(
      'manifest_version','issue97-google-v1','route_ready',false,
      'status','held','pad_id',pad_id,
      'route_revision',coalesce(structured_route_revision,0)
    ) else final_manifest end as expected_post_deferred_manifest,
    case
      when not published_selected
        then 'transition_projection_cutover_off_preserves_graph_hold'
      when bad_published_geometry>0
        then 'published_geometry_guard_overwrites_graph_hold'
      else 'published_core_cutover_guard_overwrites_graph_hold'
    end as expected_post_deferred_branch,
    false as expected_post_deferred_public_exists,
    false as expected_post_deferred_queue_exists,
    immediate_pad_update_count+(published_selected::integer)
      as expected_total_pad_update_count
  from google_dispatch_branch branch
),
public_detail_current as materialized (
  select detail.id,pg_catalog.to_jsonb(detail) as row_value
  from public.public_pad_detail detail
  join google_projected_pads projected on projected.pad_id=detail.id
),
public_detail_projected as materialized (
  select detail.id,pg_catalog.to_jsonb(detail) as row_value
  from private_verification.public_pad_projection_source detail
  join google_projected_pads projected on projected.pad_id=detail.id
),
public_detail_state as materialized (
  select
    (select count(*) from public_detail_current)::integer as current_rows,
    (select count(*) from public_detail_projected)::integer as projected_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      row_value::text,'|' order by id
    ),'')) from public_detail_current) as current_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      row_value::text,'|' order by id
    ),'')) from public_detail_projected) as projected_digest,
    not exists(
      (select id,row_value from public_detail_current
       except select id,row_value from public_detail_projected)
      union all
      (select id,row_value from public_detail_projected
       except select id,row_value from public_detail_current)
    ) as projected_byte_semantic_noop,
    (select count(*)::integer from public.public_pad_detail detail
      where not exists(
        select 1 from google_projected_pads projected
        where projected.pad_id=detail.id
      )) as unaffected_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      detail.id::text||':'||pg_catalog.to_jsonb(detail)::text,
      '|' order by detail.id
    ),'')) from public.public_pad_detail detail
      where not exists(
        select 1 from google_projected_pads projected
        where projected.pad_id=detail.id
      )) as unaffected_digest
),
projection_view_authority as materialized (
  select relation.oid,relation.relkind,relation.reloptions,relation.relacl,
    pg_catalog.pg_get_viewdef(relation.oid,true) as view_definition,
    pg_catalog.md5(pg_catalog.pg_get_viewdef(relation.oid,true))
      as view_definition_md5,
    coalesce((select pg_catalog.bool_or(acl.grantee=0
      and acl.privilege_type='SELECT')
      from pg_catalog.aclexplode(coalesce(
        relation.relacl,pg_catalog.acldefault('r',relation.relowner)
      )) acl),false) as public_select,
    pg_catalog.has_table_privilege('anon',relation.oid,'SELECT') as anon_select,
    pg_catalog.has_table_privilege('authenticated',relation.oid,'SELECT')
      as authenticated_select,
    pg_catalog.has_table_privilege('service_role',relation.oid,'SELECT')
      as service_select,
    not exists(
      select 1
      from pg_catalog.pg_rewrite rewrite
      join pg_catalog.pg_depend dependency
        on dependency.classid='pg_catalog.pg_rewrite'::pg_catalog.regclass
          and dependency.objid=rewrite.oid
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid=dependency.refobjid
          and attribute.attnum=dependency.refobjsubid
      where rewrite.ev_class=relation.oid
        and dependency.refobjid='public.pads'::pg_catalog.regclass
        and attribute.attname in (
          'brinesearch_google_route_status_issue97',
          'brinesearch_google_route_revision_issue97'
        )
    ) as google_columns_independent
  from pg_catalog.pg_namespace namespace
  join pg_catalog.pg_class relation on relation.relnamespace=namespace.oid
  where namespace.nspname='private_verification'
    and relation.relname='public_pad_projection_source'
),
projection_view_state as materialized (
  select count(*)::integer as rows,
    coalesce(pg_catalog.bool_and(
      relkind='v'::"char"
      and pg_catalog.cardinality(reloptions)=2
      and reloptions @> array[
        'security_invoker=true','security_barrier=true'
      ]::text[]
      and view_definition_md5~'^[0-9a-f]{32}$'
      and view_definition not ilike '%brinesearch_google_route_status_issue97%'
      and view_definition not ilike '%brinesearch_google_route_revision_issue97%'
      and google_columns_independent
      and not public_select and not anon_select and not authenticated_select
      and service_select
    ),false) as exact,
    min(view_definition_md5) as view_definition_md5
  from projection_view_authority
),
verification_current as materialized (
  select verification.pad_id,pg_catalog.to_jsonb(verification) as row_value,
    pg_catalog.to_jsonb(verification)-'updated_at' as semantic_row_value
  from public.pad_verification_status verification
  join google_projected_pads projected on projected.pad_id=verification.pad_id
),
verification_state as materialized (
  select
    (select count(*) from verification_current)::integer as current_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad_id::text,'|' order by pad_id
    ),'')) from verification_current) as id_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      row_value::text,'|' order by pad_id
    ),'')) from verification_current) as full_before_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      semantic_row_value::text,'|' order by pad_id
    ),'')) from verification_current) as semantic_digest,
    (select count(*)::integer from public.pad_verification_status verification
      where not exists(
        select 1 from google_projected_pads projected
        where projected.pad_id=verification.pad_id
      )) as unaffected_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      verification.pad_id::text||':'||pg_catalog.to_jsonb(verification)::text,
      '|' order by verification.pad_id
    ),'')) from public.pad_verification_status verification
      where not exists(
        select 1 from google_projected_pads projected
        where projected.pad_id=verification.pad_id
      )) as unaffected_digest
),
route_relation_protected_state as materialized (
  select
    (select count(*)::bigint from public.brinesearch_route_prep)
      as route_prep_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      route.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(route)::text),
      '|' order by route.id
    ),'')) from public.brinesearch_route_prep route) as route_prep_digest,
    (select count(*)::bigint from public.brinesearch_route_prep_steps)
      as route_prep_steps_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      step.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(step)::text),
      '|' order by step.id
    ),'')) from public.brinesearch_route_prep_steps step)
      as route_prep_steps_digest,
    (select count(*)::bigint from public.brinesearch_pad_roads)
      as pad_roads_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad_road.route_step_id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(pad_road)::text),
      '|' order by pad_road.route_step_id
    ),'')) from public.brinesearch_pad_roads pad_road) as pad_roads_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_occurrence_candidates_issue97)
      as occurrence_candidates_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      candidate.route_prep_step_id::text||':'||candidate.identity_id::text||':'||
        candidate.candidate_basis||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(candidate)::text),
      '|' order by candidate.route_prep_step_id,candidate.identity_id,
        candidate.candidate_basis
    ),''))
     from private_verification.brinesearch_route_occurrence_candidates_issue97
       candidate) as occurrence_candidates_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_occurrence_receipts_issue97)
      as occurrence_receipts_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_step_id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_step_id
    ),''))
     from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt)
      as occurrence_receipts_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_occurrence_receipt_history_issue97)
      as occurrence_history_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
     from private_verification.brinesearch_route_occurrence_receipt_history_issue97
       history) as occurrence_history_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_reconciliation_receipts_issue97)
      as reconciliation_receipts_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_id
    ),''))
     from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt)
      as reconciliation_receipts_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_reconciliation_history_issue97)
      as reconciliation_history_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
     from private_verification.brinesearch_route_reconciliation_history_issue97
       history) as reconciliation_history_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_transition_receipts_issue97)
      as transition_receipts_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_id,receipt.boundary_index
    ),''))
     from private_verification.brinesearch_route_transition_receipts_issue97 receipt)
      as transition_receipts_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_transition_history_issue97)
      as transition_history_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
     from private_verification.brinesearch_route_transition_history_issue97 history)
      as transition_history_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97)
      as geometry_receipts_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_step_id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_step_id
    ),''))
     from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt)
      as geometry_receipts_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_route_occurrence_geometry_history_issue97)
      as geometry_history_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
     from private_verification.brinesearch_route_occurrence_geometry_history_issue97
       history) as geometry_history_digest
),
route_relation_protected_rows(ordinal,relation_name,row_count,row_digest) as (
  select 1,'public.brinesearch_route_prep',route_prep_rows,route_prep_digest
    from route_relation_protected_state
  union all select 2,'public.brinesearch_route_prep_steps',
    route_prep_steps_rows,route_prep_steps_digest
    from route_relation_protected_state
  union all select 3,'public.brinesearch_pad_roads',pad_roads_rows,
    pad_roads_digest from route_relation_protected_state
  union all select 4,
    'private_verification.brinesearch_route_occurrence_candidates_issue97',
    occurrence_candidates_rows,occurrence_candidates_digest
    from route_relation_protected_state
  union all select 5,
    'private_verification.brinesearch_route_occurrence_receipts_issue97',
    occurrence_receipts_rows,occurrence_receipts_digest
    from route_relation_protected_state
  union all select 6,
    'private_verification.brinesearch_route_occurrence_receipt_history_issue97',
    occurrence_history_rows,occurrence_history_digest
    from route_relation_protected_state
  union all select 7,
    'private_verification.brinesearch_route_reconciliation_receipts_issue97',
    reconciliation_receipts_rows,reconciliation_receipts_digest
    from route_relation_protected_state
  union all select 8,
    'private_verification.brinesearch_route_reconciliation_history_issue97',
    reconciliation_history_rows,reconciliation_history_digest
    from route_relation_protected_state
  union all select 9,
    'private_verification.brinesearch_route_transition_receipts_issue97',
    transition_receipts_rows,transition_receipts_digest
    from route_relation_protected_state
  union all select 10,
    'private_verification.brinesearch_route_transition_history_issue97',
    transition_history_rows,transition_history_digest
    from route_relation_protected_state
  union all select 11,
    'private_verification.brinesearch_route_occurrence_geometry_receipts_issue97',
    geometry_receipts_rows,geometry_receipts_digest
    from route_relation_protected_state
  union all select 12,
    'private_verification.brinesearch_route_occurrence_geometry_history_issue97',
    geometry_history_rows,geometry_history_digest
    from route_relation_protected_state
),
route_relation_protected_digest as materialized (
  select count(*)::integer as relation_rows,
    count(distinct relation_name)::integer as distinct_relation_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      ordinal::text||':'||relation_name||':'||row_count::text||':'||row_digest,
      '|' order by ordinal
    ),'')) as combined_digest,
    pg_catalog.jsonb_object_agg(relation_name,pg_catalog.jsonb_build_object(
      'ordinal',ordinal,'row_count',row_count,'row_digest',row_digest
    ) order by ordinal) as components
  from route_relation_protected_rows
),
route_history_sequence_authority(
  ordinal,table_name,expected_sequence_name,sequence_name,sequence_oid,
  last_value,is_called
) as materialized (
  select 1,
    'private_verification.brinesearch_route_occurrence_receipt_history_issue97',
    'private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq',
    pg_catalog.pg_get_serial_sequence(
      'private_verification.brinesearch_route_occurrence_receipt_history_issue97','id'),
    'private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq'::regclass::oid,
    sequence.last_value,sequence.is_called
  from private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq
    sequence
  union all
  select 2,
    'private_verification.brinesearch_route_reconciliation_history_issue97',
    'private_verification.brinesearch_route_reconciliation_history_issue97_id_seq',
    pg_catalog.pg_get_serial_sequence(
      'private_verification.brinesearch_route_reconciliation_history_issue97','id'),
    'private_verification.brinesearch_route_reconciliation_history_issue97_id_seq'::regclass::oid,
    sequence.last_value,sequence.is_called
  from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq
    sequence
  union all
  select 3,
    'private_verification.brinesearch_route_transition_history_issue97',
    'private_verification.brinesearch_route_transition_history_issue97_id_seq',
    pg_catalog.pg_get_serial_sequence(
      'private_verification.brinesearch_route_transition_history_issue97','id'),
    'private_verification.brinesearch_route_transition_history_issue97_id_seq'::regclass::oid,
    sequence.last_value,sequence.is_called
  from private_verification.brinesearch_route_transition_history_issue97_id_seq
    sequence
  union all
  select 4,
    'private_verification.brinesearch_route_occurrence_geometry_history_issue97',
    'private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq',
    pg_catalog.pg_get_serial_sequence(
      'private_verification.brinesearch_route_occurrence_geometry_history_issue97','id'),
    'private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq'::regclass::oid,
    sequence.last_value,sequence.is_called
  from private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq
    sequence
),
route_history_sequence_state as materialized (
  select count(*)::integer as rows,count(distinct sequence_oid)::integer
      as distinct_sequence_rows,
    count(*) filter(where sequence_name=expected_sequence_name)::integer
      as exact_name_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      ordinal::text||':'||table_name||':'||sequence_name||':'||
        last_value::text||':'||is_called::text,
      '|' order by ordinal
    ),'')) as sequence_state_digest
  from route_history_sequence_authority
),
pad_edit_history_protected_state as materialized (
  select
    (select count(*)::bigint from public.pad_edit_history) as history_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),'')) from public.pad_edit_history history) as history_digest,
    pg_catalog.pg_get_serial_sequence('public.pad_edit_history','id')
      as sequence_name,
    'public.pad_edit_history_id_seq'::regclass::oid as sequence_oid,
    sequence.last_value,sequence.is_called
  from public.pad_edit_history_id_seq sequence
),
saved_road_protected_state as materialized (
  select
    (select count(*)::integer
     from private_verification.brinesearch_issue97_saved_road_release_baseline)
      as baseline_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      baseline.singleton::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(baseline)::text),
      '|' order by baseline.singleton
    ),''))
     from private_verification.brinesearch_issue97_saved_road_release_baseline
       baseline) as baseline_digest,
    (select count(*)::integer
     from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
      as run_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      run.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(run)::text),
      '|' order by run.id
    ),''))
     from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
       run) as run_digest,
    (select count(*)::bigint
     from private_verification.brinesearch_issue97_saved_road_reconciliation)
      as reconciliation_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      reconciliation.run_id::text||':'||reconciliation.source_kind||':'||
        reconciliation.occurrence_key||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(reconciliation)::text),
      '|' order by reconciliation.run_id,reconciliation.source_kind,
        reconciliation.occurrence_key
    ),''))
     from private_verification.brinesearch_issue97_saved_road_reconciliation
       reconciliation) as reconciliation_digest
),
topology_protected_state as materialized (
  select
    (select count(*)::bigint from public.brinesearch_road_junctions)
      as junction_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(junction)::text),
      '|' order by junction.id
    ),'')) from public.brinesearch_road_junctions junction) as junction_digest,
    (select count(*)::bigint from public.brinesearch_road_junction_anchors)
      as anchor_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      anchor.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(anchor)::text),
      '|' order by anchor.id
    ),'')) from public.brinesearch_road_junction_anchors anchor) as anchor_digest,
    (select count(*)::bigint from public.brinesearch_road_junction_memberships)
      as membership_rows,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      membership.id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(membership)::text),
      '|' order by membership.id
    ),'')) from public.brinesearch_road_junction_memberships membership)
      as membership_digest
),
topology_protected_digest as materialized (
  select topology.*,
    pg_catalog.md5(pg_catalog.concat_ws('|',
      'junctions',junction_rows::text,junction_digest,
      'anchors',anchor_rows::text,anchor_digest,
      'memberships',membership_rows::text,membership_digest
    )) as combined_digest
  from topology_protected_state topology
),
google_state as materialized (
  select
    (select count(*) from google_current)::integer as canonical_rows,
    (select pg_catalog.md5(pg_catalog.string_agg(
      pad_id::text,'|' order by pad_id
    )) from google_current) as pad_digest,
    (select pg_catalog.md5(pg_catalog.string_agg(
      pad_id::text||':'||identity_id::text||':'||road_id::text||':'||
        route_revision::text,'|' order by pad_id
    )) from google_current) as tuple_digest,
    coalesce((select pg_catalog.bool_and(
      expected_mapping_id is not null
      and receipt_route_revision=route_revision and status='stale'
      and hold_reason='road_identity_mapping_changed'
      and manifest_version='issue97-google-v1'
      and manifest_digest is null and dependency_digest is null
      and manifest=pg_catalog.jsonb_build_object(
        'manifest_version','issue97-google-v1','route_ready',false,
        'status','stale','pad_id',pad_id,'route_revision',route_revision
      )
      and pad_status='stale' and pad_revision=route_revision
      and generated_at=(select install_timestamp from permanent_install_state)
      and updated_at=(select install_timestamp from permanent_install_state)
      and google_current.evidence is not null
      and (select count(*) from pg_catalog.jsonb_object_keys(
        google_current.evidence
      ))=2
      and exists(
        select 1 from public.brinesearch_road_identity_mappings witness
        where witness.identity_id::text=google_current.evidence->>'identity_id'
          and witness.road_id::text=google_current.evidence->>'road_id'
          and witness.mapping_status='verified'
          and witness.mapping_method in (
            'exact_source_record_id','exact_route_designation'
          )
      )
      and (
        (
          google_current.evidence->>'identity_id'=identity_id::text
          and google_current.evidence->>'road_id'=road_id::text
        )
        or exists(
          select 1 from public.brinesearch_pad_roads pad_road
          where pad_road.pad_id=google_current.pad_id
            and pad_road.road_id::text=google_current.evidence->>'road_id'
        )
      )
    ) from google_current),false) as canonical_exact,
    (select count(*) from google_projected_pads)::integer as projected_rows,
    not exists(select 1 from google_projected_pads) as projection_exact,
    (select count(*) from google_expected_post_deferred)::integer
      as expected_post_deferred_rows,
    coalesce((select pg_catalog.bool_and(
      expected_post_deferred_status in ('held','stale')
      and expected_post_deferred_hold_reason in (
        'graph_generation_changed',
        'published_route_contains_draft_or_stale_geometry',
        'issue97_cutover_not_active'
      )
      and expected_post_deferred_manifest->>'route_ready'='false'
      and not expected_post_deferred_public_exists
      and not expected_post_deferred_queue_exists
    ) from google_expected_post_deferred),true) as expected_post_deferred_exact,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad_id::text||':'||expected_post_deferred_branch||':'||
        expected_post_deferred_status||':'||
        expected_post_deferred_hold_reason||':'||
        expected_post_deferred_receipt_and_pad_revision::text||':'||
        expected_post_deferred_manifest::text||':'||
        expected_post_deferred_evidence::text,
      '|' order by pad_id
    ),'')) from google_expected_post_deferred) as expected_post_deferred_digest
),
function_expected(
  label,signature,expected_md5,expected_volatility,search_path_contract,
  acl_contract
) as (
  values
    ('activation','public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)',
      '73eb9adbfd16ea671873da7b4e495f73','v','empty','service_only'),
    ('candidate_authorizer',
      'private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)',
      'f6763925461111b2069bde0f60007dd4','s','empty','owner_only'),
    ('state_manifest_authorizer',
      'private_verification.brinesearch_issue97_state_candidate_manifest_authorizes_build(text,uuid)',
      null,'s','empty','owner_only'),
    ('manifest_current',
      'private_verification.brinesearch_issue97_state_candidate_manifest_current(uuid)',
      '0720949a9b7a08e741a07979d0dd02be','s','empty','owner_only'),
    ('manifest_integrity',
      'private_verification.brinesearch_issue97_state_candidate_manifest_integrity(uuid)',
      '75d25d5298c59869b656bb9db3cc3fe2','s','empty','owner_only'),
    ('sources_current',
      'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)',
      '5653fb3e85b9a9962dbcc9f5af0329e7','s','empty','owner_only'),
    ('release_current',
      'private_verification.brinesearch_issue97_graph_build_release_current(uuid)',
      '6471a34ccf42d058b846776d23cb0216','s','empty','owner_only'),
    ('current_verified_run',
      'private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)',
      null,'s','empty','owner_only'),
    ('dataset_scope_current',
      'private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)',
      null,'s','empty','owner_only'),
    ('ingest_run_verified',
      'private_verification.brinesearch_issue97_ingest_run_verified(uuid)',
      null,'s','empty','owner_only'),
    ('graph_source_content_digest',
      'private_verification.brinesearch_issue97_graph_source_content_digest(uuid)',
      null,'s','empty','owner_only'),
    ('release_stamp',
      'private_verification.brinesearch_issue97_stamp_graph_release_receipt()',
      'e3c8fa406c6b4631b25e95a7ebb6d2d2','v','empty','owner_only'),
    ('google_invalidator',
      'private_verification.brinesearch_issue97_invalidate_google_route_trigger()',
      'a56b23a241c21b43ef36fd4632bd5f2e','v','empty','owner_only'),
    ('route_step_identity_clear',
      'private_verification.brinesearch_clear_stale_route_step_identity_issue70()',
      null,'v','route_step_path','service_only'),
    ('google_hold',
      'private_verification.brinesearch_issue97_hold_google_route(uuid,bigint,text,jsonb,text)',
      '089cba27c751073b3e60ad121858da7d','v','empty','owner_only'),
    ('google_queue',
      'private_verification.brinesearch_issue97_queue_google_route_refresh(uuid,text)',
      '5b39997be817fab73cd5115962aefbac','v','empty','owner_only'),
    ('google_queue_processor',
      'private_verification.brinesearch_issue97_process_google_route_refresh_queue()',
      'd2f4d2626ac47d24dde54f95e150083a','v','empty','owner_only'),
    ('google_dispatcher',
      'private_verification.brinesearch_issue97_refresh_google_route(uuid)',
      'aae84883b33341c9a25064204d5de2c5','v','empty','owner_only'),
    ('google_transition_projection',
      'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)',
      '9dc259b9e3637c36a1123166aabecb04','v','empty','owner_only'),
    ('google_published_core',
      'private_verification.brinesearch_issue97_refresh_google_route_published_core(uuid)',
      'da9cbb83b45bcbdcc830511050a17b49','v','empty','owner_only'),
    ('cutover_active','public.brinesearch_issue97_cutover_active()',
      '086ffbcbf7b3bbca9a5cc8d41a4f2412','s','empty','owner_only'),
    ('public_detail_sync','public.sync_public_pad_detail_projection()',
      '0825fbdd1e0dc28bb46412a0a22222ae','v','projection_path','service_only'),
    ('verification_invalidator','public.pad_verification_invalidate_on_pad_change()',
      '99fdfd970215224bf717f108b523ceb1','v','public_path','public_default'),
    ('public_detail_sanitizer',
      'private_verification.brinesearch_sanitize_public_pad_detail_issue73()',
      'ba0cf59e2259fecd7e6bbae0db5aeae6','v','empty','owner_only'),
    ('route_no_guess_guard','public.enforce_brinesearch_route_prep_no_guess()',
      '60e8630ec37e5dc4a6532de5a9fbbc03','v','public_only','service_only'),
    ('candidate_publication_guard','public.prevent_candidate_road_publication()',
      '5958bb9154013143d064a686c128b525','v','public_only','service_only'),
    ('pad_audit_update','public.audit_pad_update()',
      'b7068f4de6236d83c400caf5312a4336','v','public_only','service_only'),
    ('pad_mark_editor','public.mark_pad_editor()',
      '7481a42d010c9717e895fb8a2c4362c7','v','public_only','service_only'),
    ('pad_set_updated_at','public.set_updated_at()',
      '082058a59b50aae6fbde4d4adba90749','v','public_only','service_only')
),
function_catalog as materialized (
  select expected.*,
    procedure.oid,procedure.prosecdef,procedure.provolatile,procedure.prokind,
    procedure.proconfig,procedure.proacl,procedure.proowner,
    owner_role.rolname as owner_name,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)) as actual_md5,
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    pg_catalog.md5(pg_catalog.concat_ws('|',
      procedure.oid::text,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
      procedure.proowner::text,owner_role.rolname,
      procedure.prosecdef::text,procedure.provolatile::text,
      procedure.prokind::text,coalesce(procedure.proconfig::text,''),
      coalesce(procedure.proacl::text,'')
    )) as catalog_md5
  from function_expected expected
  left join pg_catalog.pg_proc procedure
    on procedure.oid=pg_catalog.to_regprocedure(expected.signature)
  left join pg_catalog.pg_roles owner_role on owner_role.oid=procedure.proowner
),
function_acl as materialized (
  select function.label,acl.grantor,acl.grantee,acl.privilege_type,
    acl.is_grantable
  from function_catalog function
  cross join lateral pg_catalog.aclexplode(coalesce(
    function.proacl,pg_catalog.acldefault('f',function.proowner)
  )) acl
),
function_inventory as materialized (
  select function.*,
    coalesce((select pg_catalog.bool_or(acl.grantee=0
      and acl.privilege_type='EXECUTE')
      from function_acl acl where acl.label=function.label),false)
      as public_execute,
    pg_catalog.has_function_privilege(
      'anon',function.oid,'EXECUTE'
    ) as anon_execute,
    pg_catalog.has_function_privilege(
      'authenticated',function.oid,'EXECUTE'
    ) as authenticated_execute,
    pg_catalog.has_function_privilege(
      'service_role',function.oid,'EXECUTE'
    ) as service_execute,
    case function.search_path_contract
      when 'empty' then function.proconfig is not distinct from
        array['search_path=""']::text[]
      when 'projection_path' then function.proconfig is not distinct from
        array['search_path=pg_catalog, public, private_verification']::text[]
      when 'public_path' then function.proconfig is not distinct from
        array['search_path=pg_catalog, public']::text[]
      when 'public_only' then function.proconfig is not distinct from
        array['search_path=public']::text[]
      when 'route_step_path' then function.proconfig is not distinct from
        array['search_path=public, private_verification, pg_temp']::text[]
      else false
    end as search_path_exact
  from function_catalog function
),
function_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where oid is not null)::integer as present_rows,
    count(*) filter(where expected_md5 is null
      or actual_md5=expected_md5)::integer as hash_exact_rows,
    count(*) filter(where
      (label in ('sources_current','dataset_scope_current','ingest_run_verified',
        'route_step_identity_clear','route_no_guess_guard',
        'candidate_publication_guard','pad_mark_editor','pad_set_updated_at')
        and not coalesce(prosecdef,false))
      or (label not in (
        'sources_current','dataset_scope_current','ingest_run_verified',
        'route_step_identity_clear','route_no_guess_guard',
        'candidate_publication_guard','pad_mark_editor','pad_set_updated_at'
      ) and coalesce(prosecdef,false))
    )=29 as security_definer_exact,
    count(*) filter(where actual_md5~'^[0-9a-f]{32}$')::integer
      as captured_hash_rows,
    count(*) filter(where catalog_md5~'^[0-9a-f]{32}$'
      and proowner is not null and owner_name is not null)::integer
      as captured_catalog_rows,
    count(*) filter(where provolatile=expected_volatility::"char")::integer
      as volatility_exact_rows,
    count(*) filter(where search_path_exact)::integer as search_path_exact_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      label||':'||coalesce(actual_md5,''),'|' order by label
    ),'')) as authority_digest,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      label||':'||coalesce(catalog_md5,''),'|' order by label
    ),'')) as catalog_authority_digest,
    count(*) filter(where
      case acl_contract
        when 'owner_only' then not public_execute and not anon_execute
          and not authenticated_execute and not service_execute
        when 'service_only' then not public_execute and not anon_execute
          and not authenticated_execute and service_execute
        when 'public_default' then public_execute and anon_execute
          and authenticated_execute and service_execute
        else false
      end
    )::integer as acl_exact_rows,
    coalesce((select
      definition ilike '%tg_table_name=''brinesearch_road_graph_builds''%'
      and definition ilike '%receipt.manifest->''points''%'
      and definition ilike '%step.junction_build_id=v_build_id%'
      and definition ilike '%graph_generation_changed%'
      from function_inventory where label='google_invalidator'),false)
      as invalidator_shape_exact,
    coalesce((select
      definition ilike '%brinesearch_issue97_refresh_google_route(new.pad_id)%'
      and definition ilike '%brinesearch_google_route_refresh_queue_issue97%'
      from function_inventory where label='google_queue_processor'),false)
      as queue_processor_shape_exact,
    coalesce((select
      definition ilike '%if not public.brinesearch_issue97_cutover_active()%'
      and definition ilike '%issue97_cutover_not_active%'
      and definition ilike '%public_projected%false%'
      from function_inventory where label='google_transition_projection'),false)
      as transition_projection_shape_exact,
    coalesce((select
      definition ilike '%published_route_contains_draft_or_stale_geometry%'
      and definition ilike '%brinesearch_issue97_refresh_google_route_published_core%'
      and definition ilike '%brinesearch_issue97_refresh_google_route_transition%'
      from function_inventory where label='google_dispatcher'),false)
      as dispatcher_shape_exact,
    coalesce((select
      definition ilike '%old.owner_decision=''pending''%'
      and definition ilike '%new.raw_text is distinct from old.raw_text%'
      and definition ilike '%unmatched_saved_road_name%'
      and definition ilike '%explicit_in_saved_directions%'
      and definition ilike '%state_context_candidate_only%'
      and definition ilike '%new.road_id:=null%'
      and definition ilike '%new.distance_miles:=null%'
      and definition ilike '%new.geometry_status:=''not_started''%'
      from function_inventory where label='route_step_identity_clear'),false)
      as route_step_identity_clear_shape_exact
  from function_inventory
),
public_route_mutation_matcher(pattern) as (
  values (E'\\m(?:insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(?:public\\.)?brinesearch_(?:route_prep|route_prep_steps|pad_roads)\\M')
),
route_function_expected(ordinal,signature,expected_md5,forbidden_md5) as (
  -- Selected exact-route primitives requested for later 412-route authority.
  -- This list is not labeled a complete transitive closure; direct dependencies
  -- not already covered by function_inventory are captured separately below.
  values
    (1,'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)',
      '0f139df2a01f68722958ff10f1dd6f49','72c16f75'),
    (2,'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)',
      '8ad311611cf361ca457e4084128b9cfb','98f1421b'),
    (3,'private_verification.brinesearch_issue97_refresh_route_receipt(uuid)',null,null),
    (4,'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)',null,null),
    (5,'private_verification.brinesearch_issue97_refresh_route_geometry(uuid)',null,null),
    (6,'private_verification.brinesearch_issue97_prepare_scope_current_cache(text)',null,null),
    (7,'private_verification.brinesearch_issue97_dataset_scope_current_cached(uuid,text,text)',null,null),
    (8,'private_verification.brinesearch_issue97_prepare_designation_cache(text)',null,null),
    (9,'private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)',null,null),
    (10,'private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',null,null),
    (11,'private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)',null,null),
    (12,'private_verification.brinesearch_issue97_graph_build_release_current_cached(uuid)',null,null),
    (13,'private_verification.brinesearch_issue97_identities_connected(uuid,uuid)',null,null),
    (14,'private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)',
      '34bdc93597f6da3cad68376ca01906c1',null),
    (15,'private_verification.brinesearch_issue97_mapping_fingerprint(uuid)',null,null),
    (16,'private_verification.brinesearch_issue97_route_state_code(text)',null,null),
    (17,'private_verification.brinesearch_issue97_normalize_route_token(text)',null,null),
    (18,'private_verification.brinesearch_issue97_explicit_occurrence_source_key(text,text,jsonb)',null,null),
    (19,'private_verification.brinesearch_issue97_identity_driver_name(uuid)',null,null),
    (20,'private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)',null,null),
    (21,'private_verification.brinesearch_issue97_authoritative_identity_geometry(uuid)',null,null),
    (22,'private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(uuid)',null,null),
    (23,'private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(uuid,uuid,extensions.geometry,extensions.geometry)',null,null),
    (24,'private_verification.brinesearch_issue97_normalize_saved_turn(text)',null,null),
    (25,'private_verification.brinesearch_issue97_geometry_turn(extensions.geometry,extensions.geometry)',null,null),
    (26,'private_verification.brinesearch_issue97_reverse_turn(text)',null,null),
    (27,'private_verification.brinesearch_issue97_transition_google_dependency(uuid)',null,null),
    (28,'private_verification.brinesearch_issue97_transition_google_dark_current(uuid)',null,null),
    (29,'private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)',null,null),
    (30,'private_verification.brinesearch_issue97_write_occurrence_history(uuid)',null,null),
    (31,'private_verification.brinesearch_issue97_write_transition_history(uuid,integer)',null,null),
    (32,'private_verification.brinesearch_issue97_write_geometry_history(uuid)',null,null),
    (33,'private_verification.brinesearch_issue97_refresh_google_route_transition_dark(uuid)',null,null)
),
route_function_authority as materialized (
  select expected.ordinal,procedure.proname as function_name,
    expected.signature,procedure.oid,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)) as definition_md5,
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    language.oid as language_oid,language.lanname as language,
    procedure.prokind,procedure.provolatile as volatility,
    procedure.prosecdef as security_definer,procedure.proconfig,
    procedure.proowner as owner_oid,owner.rolname as owner,procedure.proacl,
    pg_catalog.md5(pg_catalog.concat_ws('|',
      procedure.oid::text,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
      procedure.proowner::text,owner.rolname,
      language.oid::text,language.lanname,procedure.prokind::text,
      procedure.prosecdef::text,procedure.provolatile::text,
      coalesce(procedure.proconfig::text,''),coalesce(procedure.proacl::text,'')
    )) as catalog_md5,
    coalesce((select pg_catalog.bool_or(acl.grantee=0
      and acl.privilege_type='EXECUTE')
      from pg_catalog.aclexplode(coalesce(
        procedure.proacl,pg_catalog.acldefault('f',procedure.proowner)
      )) acl),false) as public_execute,
    pg_catalog.has_function_privilege('anon',procedure.oid,'EXECUTE')
      as anon_execute,
    pg_catalog.has_function_privilege('authenticated',procedure.oid,'EXECUTE')
      as authenticated_execute,
    pg_catalog.has_function_privilege('service_role',procedure.oid,'EXECUTE')
      as service_role_execute,
    expected.expected_md5,expected.forbidden_md5
  from route_function_expected expected
  left join pg_catalog.pg_proc procedure
    on procedure.oid=pg_catalog.to_regprocedure(expected.signature)
  left join pg_catalog.pg_language language on language.oid=procedure.prolang
  left join pg_catalog.pg_roles owner on owner.oid=procedure.proowner
),
route_function_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where oid is not null)::integer as present_rows,
    count(distinct oid)::integer as distinct_oid_rows,
    count(*) filter(where definition_md5~'^[0-9a-f]{32}$')::integer
      as captured_hash_rows,
    count(*) filter(where definition is not null
      and pg_catalog.length(definition)>0)::integer as captured_definition_rows,
    count(*) filter(where catalog_md5~'^[0-9a-f]{32}$'
      and owner_oid is not null and owner is not null
      and language_oid is not null and language is not null)::integer
      as captured_catalog_rows,
    count(*) filter(where expected_md5 is null
      or definition_md5=expected_md5)::integer as expected_hash_rows,
    count(*) filter(where forbidden_md5 is not null
      and definition_md5 like forbidden_md5||'%')::integer as stale_hash_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      signature||':'||coalesce(definition_md5,''),'|' order by ordinal
    ),'')) as selected_authority_digest,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      signature||':'||coalesce(catalog_md5,''),'|' order by ordinal
    ),'')) as selected_catalog_authority_digest,
    count(*) filter(where definition~*matcher.pattern)::integer
      as direct_public_route_mutator_rows
  from route_function_authority
  cross join public_route_mutation_matcher matcher
),
route_dependency_function_expected(ordinal,signature) as (
  -- Functions called transitively by the selected route-cache and private-dark
  -- lanes that are not already present in function_inventory or the selected
  -- 33-row primitive list. Values are discovered live and emitted for the
  -- later write contract; no definition hash is guessed here.
  values
    (1,'private_verification.brinesearch_issue97_prepare_graph_release_current_cache()'),
    (2,'private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(uuid,text,text,text,integer)'),
    (3,'private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'),
    (4,'private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'),
    (5,'private_verification.brinesearch_issue97_active_graph_release_generation()'),
    (6,'private_verification.brinesearch_issue97_identity_route_usable(text,text,text)'),
    (7,'private_verification.brinesearch_issue97_geometry_point_json(extensions.geometry)'),
    (8,'private_verification.brinesearch_issue97_pad_safety_facts(uuid)'),
    (9,'private_verification.brinesearch_issue97_route_data_blocked(uuid)'),
    (10,'private_verification.brinesearch_issue97_hold_google_route_dark(uuid,bigint,text,jsonb,text)'),
    (11,'private_verification.brinesearch_issue97_uuid(text)')
),
route_dependency_function_authority as materialized (
  select expected.ordinal,procedure.proname as function_name,
    expected.signature,procedure.oid,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid))
      as definition_md5,
    pg_catalog.pg_get_functiondef(procedure.oid) as definition,
    language.oid as language_oid,language.lanname as language,
    procedure.prokind,procedure.provolatile as volatility,
    procedure.prosecdef as security_definer,procedure.proconfig,
    procedure.proowner as owner_oid,owner.rolname as owner,procedure.proacl,
    pg_catalog.md5(pg_catalog.concat_ws('|',
      procedure.oid::text,
      pg_catalog.md5(pg_catalog.pg_get_functiondef(procedure.oid)),
      procedure.proowner::text,owner.rolname,
      language.oid::text,language.lanname,procedure.prokind::text,
      procedure.prosecdef::text,procedure.provolatile::text,
      coalesce(procedure.proconfig::text,''),coalesce(procedure.proacl::text,'')
    )) as catalog_md5,
    coalesce((select pg_catalog.bool_or(acl.grantee=0
      and acl.privilege_type='EXECUTE')
      from pg_catalog.aclexplode(coalesce(
        procedure.proacl,pg_catalog.acldefault('f',procedure.proowner)
      )) acl),false) as public_execute,
    pg_catalog.has_function_privilege('anon',procedure.oid,'EXECUTE')
      as anon_execute,
    pg_catalog.has_function_privilege('authenticated',procedure.oid,'EXECUTE')
      as authenticated_execute,
    pg_catalog.has_function_privilege('service_role',procedure.oid,'EXECUTE')
      as service_role_execute
  from route_dependency_function_expected expected
  left join pg_catalog.pg_proc procedure
    on procedure.oid=pg_catalog.to_regprocedure(expected.signature)
  left join pg_catalog.pg_language language on language.oid=procedure.prolang
  left join pg_catalog.pg_roles owner on owner.oid=procedure.proowner
),
route_dependency_function_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where oid is not null)::integer as present_rows,
    count(distinct oid)::integer as distinct_oid_rows,
    count(*) filter(where definition_md5~'^[0-9a-f]{32}$')::integer
      as captured_hash_rows,
    count(*) filter(where definition is not null
      and pg_catalog.length(definition)>0)::integer as captured_definition_rows,
    count(*) filter(where catalog_md5~'^[0-9a-f]{32}$'
      and owner_oid is not null and owner is not null
      and language_oid is not null and language is not null)::integer
      as captured_catalog_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      signature||':'||coalesce(definition_md5,''),'|' order by ordinal
    ),'')) as authority_digest,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      signature||':'||coalesce(catalog_md5,''),'|' order by ordinal
    ),'')) as catalog_authority_digest,
    count(*) filter(where definition~*matcher.pattern)::integer
      as direct_public_route_mutator_rows
  from route_dependency_function_authority
  cross join public_route_mutation_matcher matcher
),
public_route_mutation_matcher_state as materialized (
  select pattern,
    'UPDATE public.brinesearch_pad_roads SET road_id=road_id'~*pattern
      as positive_matches,
    'insert into private_verification.brinesearch_route_transition_history_issue97 default values'~*pattern
      as negative_matches
  from public_route_mutation_matcher
),
trigger_expected(
  trigger_name,table_schema,table_name,function_signature,expected_enabled,
  expected_tgtype,expected_tgattr,expected_constraint,expected_deferrable,
  expected_initdeferred
) as (
  values
    ('brinesearch_issue97_google_route_graph_stale','public',
      'brinesearch_road_graph_builds',
      'private_verification.brinesearch_issue97_invalidate_google_route_trigger()',
      'O'::"char",17::smallint,
      array['status','graph_digest','source_revision_digest'],false,false,false),
    ('brinesearch_issue97_stamp_graph_release_receipt','public',
      'brinesearch_road_graph_builds',
      'private_verification.brinesearch_issue97_stamp_graph_release_receipt()',
      'O'::"char",19::smallint,array['status','details'],false,false,false),
    ('brinesearch_issue97_google_route_refresh_deferred','private_verification',
      'brinesearch_google_route_refresh_queue_issue97',
      'private_verification.brinesearch_issue97_process_google_route_refresh_queue()',
      'O'::"char",5::smallint,array[]::text[],true,true,true),
    ('brinesearch_issue97_google_route_pad_stale','public','pads',
      'private_verification.brinesearch_issue97_invalidate_google_route_trigger()',
      'O'::"char",17::smallint,
      array['latitude','longitude','structured_route_revision','road_sequence_status'],
      false,false,false),
    ('brinesearch_clear_stale_route_step_identity_issue70','public',
      'brinesearch_route_prep_steps',
      'private_verification.brinesearch_clear_stale_route_step_identity_issue70()',
      'O'::"char",19::smallint,array['raw_text','match_method'],false,false,false),
    ('trg_enforce_brinesearch_route_prep_no_guess','public',
      'brinesearch_route_prep_steps',
      'public.enforce_brinesearch_route_prep_no_guess()',
      'O'::"char",23::smallint,array[]::text[],false,false,false),
    ('brinesearch_issue97_google_route_steps_stale','public',
      'brinesearch_pad_roads',
      'private_verification.brinesearch_issue97_invalidate_google_route_trigger()',
      'O'::"char",29::smallint,array[]::text[],false,false,false),
    ('trg_prevent_candidate_road_publication','public','brinesearch_pad_roads',
      'public.prevent_candidate_road_publication()',
      'O'::"char",23::smallint,array['road_id'],false,false,false),
    ('pads_audit_update','public','pads','public.audit_pad_update()',
      'O'::"char",17::smallint,array[]::text[],false,false,false),
    ('pads_mark_editor','public','pads','public.mark_pad_editor()',
      'O'::"char",19::smallint,array[]::text[],false,false,false),
    ('pads_set_updated_at','public','pads','public.set_updated_at()',
      'O'::"char",19::smallint,array[]::text[],false,false,false),
    ('pads_sync_public_pad_detail_projection','public','pads',
      'public.sync_public_pad_detail_projection()',
      'O'::"char",29::smallint,array[]::text[],false,false,false),
    ('trg_pad_verification_invalidate','public','pads',
      'public.pad_verification_invalidate_on_pad_change()',
      'O'::"char",17::smallint,array[]::text[],false,false,false),
    ('public_pad_detail_sanitize_route_notes_issue73','public','public_pad_detail',
      'private_verification.brinesearch_sanitize_public_pad_detail_issue73()',
      'O'::"char",23::smallint,
      array['extra_data','structured_route_steps','driver_safety_context','directions_clear'],
      false,false,false),
    ('brinesearch_issue97_state_candidate_manifest_immutable','private_verification',
      'brinesearch_issue97_state_candidate_manifests',
      'private_verification.brinesearch_issue97_reject_release_receipt_mutation()',
      'O'::"char",27::smallint,array[]::text[],false,false,false),
    ('brinesearch_issue97_state_candidate_manifest_member_immutable',
      'private_verification','brinesearch_issue97_state_candidate_manifest_members',
      'private_verification.brinesearch_issue97_reject_release_receipt_mutation()',
      'O'::"char",27::smallint,array[]::text[],false,false,false)
),
trigger_inventory as materialized (
  select expected.*,trigger.oid,trigger.tgenabled,trigger.tgtype,
    trigger.tgfoid,trigger.tgconstraint,
    trigger.tgdeferrable,trigger.tginitdeferred,trigger.tgisinternal,
    trigger.tgattr,trigger.tgqual,trigger.tgnargs,trigger.tgargs,
    coalesce((select pg_catalog.array_agg(attribute.attname::text order by key.ordinality)
      from pg_catalog.unnest(trigger.tgattr::smallint[])
        with ordinality key(attnum,ordinality)
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid=relation.oid and attribute.attnum=key.attnum
    ),array[]::text[]) as actual_tgattr,
    pg_catalog.md5(pg_catalog.pg_get_triggerdef(trigger.oid)) as trigger_md5,
    pg_catalog.pg_get_triggerdef(trigger.oid) as trigger_definition,
    procedure.oid as expected_function_oid
  from trigger_expected expected
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname=expected.table_schema
  left join pg_catalog.pg_class relation
    on relation.relnamespace=namespace.oid
      and relation.relname=expected.table_name
  left join pg_catalog.pg_trigger trigger
    on trigger.tgrelid=relation.oid and trigger.tgname=expected.trigger_name
      and not trigger.tgisinternal
  left join pg_catalog.pg_proc procedure
    on procedure.oid=pg_catalog.to_regprocedure(expected.function_signature)
),
relevant_relation(table_schema,table_name) as (
  values
    ('public','brinesearch_road_graph_builds'),
    ('public','pads'),
    ('public','brinesearch_route_prep'),
    ('public','brinesearch_route_prep_steps'),
    ('public','brinesearch_pad_roads'),
    ('private_verification','brinesearch_google_route_receipts_issue97'),
    ('private_verification','brinesearch_google_route_refresh_queue_issue97'),
    ('public','brinesearch_driver_google_routes_public'),
    ('public','public_pad_detail'),
    ('public','pad_verification_status')
),
relevant_trigger_catalog as materialized (
  select relevant.table_schema,relevant.table_name,trigger.tgname,
    trigger.tgenabled,trigger.tgtype,trigger.tgfoid,trigger.tgconstraint,
    trigger.tgdeferrable,trigger.tginitdeferred,trigger.tgisinternal,
    trigger.tgattr,trigger.tgqual,trigger.tgnargs,trigger.tgargs,
    coalesce((select pg_catalog.array_agg(attribute.attname::text order by key.ordinality)
      from pg_catalog.unnest(trigger.tgattr::smallint[])
        with ordinality key(attnum,ordinality)
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid=relation.oid and attribute.attnum=key.attnum
    ),array[]::text[]) as actual_tgattr,
    namespace_proc.nspname||'.'||procedure.proname||'('||
      pg_catalog.pg_get_function_identity_arguments(procedure.oid)||')'
      as function_signature,
    pg_catalog.md5(pg_catalog.pg_get_triggerdef(trigger.oid)) as trigger_md5,
    pg_catalog.pg_get_triggerdef(trigger.oid) as trigger_definition
  from relevant_relation relevant
  join pg_catalog.pg_namespace namespace
    on namespace.nspname=relevant.table_schema
  join pg_catalog.pg_class relation on relation.relnamespace=namespace.oid
    and relation.relname=relevant.table_name
  join pg_catalog.pg_trigger trigger on trigger.tgrelid=relation.oid
    and not trigger.tgisinternal
  join pg_catalog.pg_proc procedure on procedure.oid=trigger.tgfoid
  join pg_catalog.pg_namespace namespace_proc
    on namespace_proc.oid=procedure.pronamespace
),
public_route_relation_expected(
  ordinal,table_schema,table_name,expected_trigger_count
) as (
  values
    (1,'public','brinesearch_route_prep',0),
    (2,'public','brinesearch_route_prep_steps',2),
    (3,'public','brinesearch_pad_roads',2)
),
public_route_relation_trigger_authority as materialized (
  select expected.*,relation.oid as relation_oid,
    count(trigger.oid)::integer as trigger_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      trigger.tgname||':'||trigger.tgenabled::text||':'||trigger.tgtype::text||':'||
        trigger.tgfoid::text||':'||pg_catalog.pg_get_triggerdef(trigger.oid),
      '|' order by trigger.tgname
    ),'')) as trigger_digest,
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'trigger_name',trigger.tgname,'function_oid',trigger.tgfoid,
      'enabled',trigger.tgenabled,'tgtype',trigger.tgtype,
      'definition',pg_catalog.pg_get_triggerdef(trigger.oid)
    ) order by trigger.tgname) filter(where trigger.oid is not null),'[]'::jsonb)
      as triggers
  from public_route_relation_expected expected
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname=expected.table_schema
  left join pg_catalog.pg_class relation
    on relation.relnamespace=namespace.oid
      and relation.relname=expected.table_name
  left join pg_catalog.pg_trigger trigger
    on trigger.tgrelid=relation.oid and not trigger.tgisinternal
  group by expected.ordinal,expected.table_schema,expected.table_name,
    expected.expected_trigger_count,relation.oid
),
public_route_relation_trigger_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where relation_oid is not null)::integer as present_rows,
    sum(trigger_count)::integer as trigger_rows,
    count(*) filter(where trigger_count=expected_trigger_count)::integer
      as exact_count_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      table_schema||'.'||table_name||':'||trigger_count::text||':'||trigger_digest,
      '|' order by ordinal
    ),'')) as authority_digest
  from public_route_relation_trigger_authority
),
route_relation_expected(ordinal,table_schema,table_name) as (
  values
    (1,'private_verification','brinesearch_route_occurrence_candidates_issue97'),
    (2,'private_verification','brinesearch_route_occurrence_receipts_issue97'),
    (3,'private_verification','brinesearch_route_occurrence_receipt_history_issue97'),
    (4,'private_verification','brinesearch_route_reconciliation_receipts_issue97'),
    (5,'private_verification','brinesearch_route_reconciliation_history_issue97'),
    (6,'private_verification','brinesearch_route_transition_receipts_issue97'),
    (7,'private_verification','brinesearch_route_transition_history_issue97'),
    (8,'private_verification','brinesearch_route_occurrence_geometry_receipts_issue97'),
    (9,'private_verification','brinesearch_route_occurrence_geometry_history_issue97')
),
route_relation_trigger_authority as materialized (
  select expected.*,relation.oid as relation_oid,
    count(trigger.oid)::integer as trigger_count,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      trigger.tgname||':'||trigger.tgfoid::text||':'||
        pg_catalog.pg_get_triggerdef(trigger.oid),
      '|' order by trigger.tgname
    ),'')) as trigger_digest,
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'trigger_name',trigger.tgname,'function_oid',trigger.tgfoid,
      'enabled',trigger.tgenabled,'tgtype',trigger.tgtype,
      'definition',pg_catalog.pg_get_triggerdef(trigger.oid)
    ) order by trigger.tgname) filter(where trigger.oid is not null),'[]'::jsonb)
      as triggers
  from route_relation_expected expected
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname=expected.table_schema
  left join pg_catalog.pg_class relation
    on relation.relnamespace=namespace.oid
      and relation.relname=expected.table_name
  left join pg_catalog.pg_trigger trigger
    on trigger.tgrelid=relation.oid and not trigger.tgisinternal
  group by expected.ordinal,expected.table_schema,expected.table_name,relation.oid
),
route_relation_trigger_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where relation_oid is not null)::integer as present_rows,
    sum(trigger_count)::integer as trigger_rows,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      table_schema||'.'||table_name||':'||trigger_count::text||':'||trigger_digest,
      '|' order by ordinal
    ),'')) as authority_digest
  from route_relation_trigger_authority
),
pad_google_update_eligible_triggers as materialized (
  select catalog.*
  from relevant_trigger_catalog catalog
  where catalog.table_schema='public' and catalog.table_name='pads'
    and (catalog.tgtype::integer & 16)=16
    and (
      pg_catalog.cardinality(catalog.actual_tgattr)=0
      or catalog.actual_tgattr && array[
        'brinesearch_google_route_status_issue97',
        'brinesearch_google_route_revision_issue97'
      ]::text[]
    )
),
trigger_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where oid is not null)::integer as present_rows,
    count(*) filter(where tgenabled=expected_enabled
      and tgtype=expected_tgtype and tgfoid=expected_function_oid
      and actual_tgattr=expected_tgattr
      and (tgconstraint<>0)=expected_constraint
      and tgdeferrable=expected_deferrable
      and tginitdeferred=expected_initdeferred
      and tgqual is null and tgnargs=0
      and pg_catalog.octet_length(tgargs)=0
      and not tgisinternal)::integer as exact_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='public'
        and table_name='brinesearch_road_graph_builds')::integer
      as graph_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='private_verification'
        and table_name='brinesearch_google_route_refresh_queue_issue97')::integer
      as queue_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='private_verification'
        and table_name='brinesearch_google_route_receipts_issue97')::integer
      as receipt_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='public'
        and table_name='brinesearch_driver_google_routes_public')::integer
      as public_google_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='public' and table_name='public_pad_detail')::integer
      as public_detail_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='public' and table_name='pad_verification_status')::integer
      as verification_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='public' and table_name='brinesearch_route_prep')::integer
      as route_prep_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='public'
        and table_name='brinesearch_route_prep_steps')::integer
      as route_prep_steps_catalog_rows,
    (select count(*) from relevant_trigger_catalog
      where table_schema='public' and table_name='brinesearch_pad_roads')::integer
      as pad_roads_catalog_rows,
    (select count(*) from pad_google_update_eligible_triggers)::integer
      as pad_google_update_eligible_rows,
    not exists(
      (select tgname from pad_google_update_eligible_triggers
       except values
         ('pads_audit_update'),
         ('pads_mark_editor'),
         ('pads_set_updated_at'),
         ('pads_sync_public_pad_detail_projection'),
         ('trg_pad_verification_invalidate'))
       union all
       (select * from (values
         ('pads_audit_update'),
         ('pads_mark_editor'),
         ('pads_set_updated_at'),
         ('pads_sync_public_pad_detail_projection'),
         ('trg_pad_verification_invalidate')) expected(tgname)
       except select tgname from pad_google_update_eligible_triggers)
    ) as pad_google_update_eligible_exact
  from trigger_inventory
),
table_security_expected(table_schema,table_name,expected_rls,expected_force) as (
  values
    ('private_verification','brinesearch_issue97_state_candidate_manifests',true,true),
    ('private_verification','brinesearch_issue97_state_candidate_manifest_members',true,true),
    ('private_verification','brinesearch_google_route_receipts_issue97',true,true),
    ('private_verification','brinesearch_google_route_refresh_queue_issue97',true,true),
    ('public','brinesearch_driver_google_routes_public',true,true),
    ('public','public_pad_detail',true,false),
    ('public','pads',null::boolean,null::boolean),
    ('public','pad_verification_status',null::boolean,null::boolean),
    ('public','pad_edit_history',true,false),
    ('public','brinesearch_road_graph_builds',null::boolean,null::boolean)
),
table_security_inventory as materialized (
  select expected.*,relation.oid,relation.relrowsecurity,relation.relforcerowsecurity,
    pg_catalog.has_table_privilege('anon',relation.oid,'SELECT') as anon_select,
    pg_catalog.has_table_privilege('anon',relation.oid,'INSERT') as anon_insert,
    pg_catalog.has_table_privilege('anon',relation.oid,'UPDATE') as anon_update,
    pg_catalog.has_table_privilege('anon',relation.oid,'DELETE') as anon_delete,
    pg_catalog.has_table_privilege('authenticated',relation.oid,'SELECT')
      as authenticated_select,
    pg_catalog.has_table_privilege('authenticated',relation.oid,'INSERT')
      as authenticated_insert,
    pg_catalog.has_table_privilege('authenticated',relation.oid,'UPDATE')
      as authenticated_update,
    pg_catalog.has_table_privilege('authenticated',relation.oid,'DELETE')
      as authenticated_delete,
    pg_catalog.has_table_privilege('service_role',relation.oid,'SELECT')
      as service_select
  from table_security_expected expected
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname=expected.table_schema
  left join pg_catalog.pg_class relation on relation.relnamespace=namespace.oid
    and relation.relname=expected.table_name
),
table_security_state as materialized (
  select count(*)::integer as rows,
    count(*) filter(where oid is not null)::integer as present_rows,
    count(*) filter(where
      (expected_rls is null or relrowsecurity=expected_rls)
      and (expected_force is null or relforcerowsecurity=expected_force)
    )::integer as rls_exact_rows,
    coalesce((select pg_catalog.bool_and(
      not anon_insert and not anon_update and not anon_delete
      and not authenticated_insert and not authenticated_update
      and not authenticated_delete
    ) from table_security_inventory
      where table_name in (
        'brinesearch_google_route_receipts_issue97',
        'brinesearch_google_route_refresh_queue_issue97',
        'brinesearch_driver_google_routes_public','public_pad_detail',
        'pad_edit_history'
      )),false) as browser_write_denied
  from table_security_inventory
),
isolation_state as materialized (
  select
    (select count(*) from private_verification.brinesearch_google_route_refresh_queue_issue97)
      ::integer as google_queue,
    (select count(*) from public.brinesearch_driver_google_routes_public)::integer
      as public_google,
    public.brinesearch_issue97_cutover_active() as cutover,
    (select count(*) from public.brinesearch_road_graph_builds
      where status='staging')::integer as staging,
    (select count(*) from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in (
          'active','idle in transaction','idle in transaction (aborted)'
        )
        and (
          coalesce(activity.application_name,'') ilike '%issue97%'
          or coalesce(activity.query,'') ilike '%issue97_frozen_exact_mapping_wave%'
          or coalesce(activity.query,'') ilike '%20260817193212%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_rebuild_county_graph%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_activate_graph_build%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_reconcile%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_refresh_google%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_activate_cutover%'
        ))::integer as competing_backends,
    pg_catalog.current_setting('session_replication_role')='origin'
      as replication_role_origin,
    pg_catalog.has_function_privilege(
      current_user,
      'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)',
      'EXECUTE'
    ) as activation_execute
),
checks as materialized (
  select
    install.mapping_rows=46 and install.created_timestamps=1
      and install.install_timestamp is not null and install.exact as install_ok,
    manifest.header_rows=1 and manifest.key_rows=1 and manifest.member_rows=19
      and manifest.header_exact and manifest.members_exact as manifest_ok,
    builds.candidate_rows=8 and builds.candidates_exact
      and builds.candidate_set_digest='c3f925954d41cb6fbd5939eca5de3288'
      and builds.old_rows=8 and builds.old_exact
      and builds.retained_rows=11 and builds.retained_exact
      and builds.other_validated_rows=8 and builds.other_validated_not_false=0
      and builds.active_ohio_rows=19 and builds.active_exact as builds_ok,
    registry.active_county_rows=19 and registry.active_counties_exact
      and registry.active_release_generation_rows=1
      and registry.exact_release_generation_rows=1 as county_registry_exact,
    routes.frozen_rows=412 and routes.frozen_distinct_rows=412
      and routes.frozen_digest='711b1ddd3ba6c47e7642fc700197432f'
      and routes.primary_rows=340 and routes.alternate_rows=72
      and routes.mapping_rows=379 and routes.transition_rows=33
      and routes.active_ohio_rows=806 and routes.untouched_route_rows=394
      and routes.derived_exact
      and routes.dependency_exact as routes_ok,
    non_ohio.graph_digest='7776affed9bb9dd931aa86116e490a68'
      and non_ohio.route_digest='fd0a1f874a042ac532d3057ef0bedafb'
      as non_ohio_ok,
    impact.ambiguous_impact_order_keys=0
      and impact.unmapped_impacts=0 and impact.routes_outside_frozen=0
      and impact.conservative_pad_route_subset_exact
      and impact.route_rows=impact.conservative_pad_route_rows as impacts_ok,
    ingest_locks.rows=41 and ingest_locks.distinct_lock_rows=41
      and ingest_locks.complete_rows=41
      and ingest_locks.authority_digest~'^[0-9a-f]{32}$'
      as ingest_lock_authority_ok,
    build_protection.target_rows=16
      and build_protection.target_digest~'^[0-9a-f]{32}$'
      and build_protection.non_target_digest~'^[0-9a-f]{32}$'
      and pad_protection.target_rows=9
      and pad_protection.target_digest~'^[0-9a-f]{32}$'
      and pad_protection.non_target_digest~'^[0-9a-f]{32}$'
      and pad_protection.non_target_google_receipt_digest~'^[0-9a-f]{32}$'
      and manifest_baseline.header_full_digest~'^[0-9a-f]{32}$'
      and manifest_baseline.members_full_digest~'^[0-9a-f]{32}$'
      and route_protection.relation_rows=12
      and route_protection.distinct_relation_rows=12
      and route_protection.combined_digest~'^[0-9a-f]{32}$'
      as protected_baselines_ok,
    route_sequences.rows=4 and route_sequences.distinct_sequence_rows=4
      and route_sequences.exact_name_rows=4
      and route_sequences.sequence_state_digest~'^[0-9a-f]{32}$'
      as route_history_sequences_ok,
    pad_history.history_rows>=0
      and pad_history.history_digest~'^[0-9a-f]{32}$'
      and pad_history.sequence_name='public.pad_edit_history_id_seq'
      and pad_history.sequence_oid is not null
      and pad_history.last_value>=pad_history.history_rows
      and pad_history.is_called=(pad_history.history_rows>0)
      as pad_edit_history_ok,
    saved_road.baseline_rows=1
      and saved_road.baseline_digest~'^[0-9a-f]{32}$'
      and saved_road.run_rows=0
      and saved_road.run_digest='d41d8cd98f00b204e9800998ecf8427e'
      and saved_road.reconciliation_rows=0
      and saved_road.reconciliation_digest='d41d8cd98f00b204e9800998ecf8427e'
      as saved_road_state_ok,
    topology.junction_rows>0 and topology.anchor_rows>0
      and topology.membership_rows>0
      and topology.junction_digest~'^[0-9a-f]{32}$'
      and topology.anchor_digest~'^[0-9a-f]{32}$'
      and topology.membership_digest~'^[0-9a-f]{32}$'
      and topology.combined_digest~'^[0-9a-f]{32}$'
      as topology_protected_ok,
    google.canonical_rows=9
      and google.pad_digest='450948793c57a9a1535139fac4974792'
      and google.tuple_digest='5a75e5c4c34805b7dc2fdf8d0534a4f6'
      and google.canonical_exact and google.projected_rows=0
      and google.projection_exact and google.expected_post_deferred_rows=0
      and google.expected_post_deferred_exact
      and google_trigger.event_rows=0
      and google_trigger.trigger_event_digest='d41d8cd98f00b204e9800998ecf8427e'
      and google_trigger.trigger_pad_digest='d41d8cd98f00b204e9800998ecf8427e'
      and google_trigger.trigger_route_rows=0
      and google_trigger.trigger_route_digest='d41d8cd98f00b204e9800998ecf8427e'
      and google_trigger.trigger_routes_outside_frozen=0
      as google_projection_ok,
    public_detail.current_rows=0 and public_detail.projected_rows=0
      and public_detail.projected_byte_semantic_noop
      and public_detail.current_digest=public_detail.projected_digest
      and public_detail.current_digest='d41d8cd98f00b204e9800998ecf8427e'
      as collateral_projection_ok,
    projection_view.rows=1 and projection_view.exact as projection_view_ok,
    verification.current_rows between 0 and 9
      and verification.id_digest~'^[0-9a-f]{32}$'
      and verification.full_before_digest~'^[0-9a-f]{32}$'
      and verification.semantic_digest~'^[0-9a-f]{32}$'
      and verification.unaffected_digest~'^[0-9a-f]{32}$'
      as verification_projection_ok,
    functions.rows=29 and functions.present_rows=29
      and functions.hash_exact_rows=29 and functions.captured_hash_rows=29
      and functions.captured_catalog_rows=29
      and functions.volatility_exact_rows=29
      and functions.search_path_exact_rows=29 and functions.acl_exact_rows=29
      and functions.security_definer_exact
      and functions.invalidator_shape_exact
      and functions.queue_processor_shape_exact
      and functions.transition_projection_shape_exact
      and functions.dispatcher_shape_exact
      and functions.route_step_identity_clear_shape_exact as functions_ok,
    route_functions.rows=33 and route_functions.present_rows=33
      and route_functions.distinct_oid_rows=33
      and route_functions.captured_hash_rows=33
      and route_functions.captured_definition_rows=33
      and route_functions.captured_catalog_rows=33
      and route_functions.expected_hash_rows=33
      and route_functions.stale_hash_rows=0
      and route_functions.direct_public_route_mutator_rows=0
      as route_functions_ok,
    route_dependencies.rows=11 and route_dependencies.present_rows=11
      and route_dependencies.distinct_oid_rows=11
      and route_dependencies.captured_hash_rows=11
      and route_dependencies.captured_definition_rows=11
      and route_dependencies.captured_catalog_rows=11
      and route_dependencies.direct_public_route_mutator_rows=0
      as route_dependencies_ok,
    mutation_matcher.positive_matches and not mutation_matcher.negative_matches
      as public_route_mutation_matcher_ok,
    route_relation_triggers.rows=9 and route_relation_triggers.present_rows=9
      and route_relation_triggers.trigger_rows=0
      as route_relation_triggers_ok,
    public_route_triggers.rows=3 and public_route_triggers.present_rows=3
      and public_route_triggers.trigger_rows=4
      and public_route_triggers.exact_count_rows=3
      as public_route_triggers_ok,
    triggers.rows=16 and triggers.present_rows=16 and triggers.exact_rows=16
      and triggers.graph_catalog_rows=2 and triggers.queue_catalog_rows=1
      and triggers.receipt_catalog_rows=0
      and triggers.public_google_catalog_rows=0
      and triggers.public_detail_catalog_rows=1
      and triggers.verification_catalog_rows=0
      and triggers.route_prep_catalog_rows=0
      and triggers.route_prep_steps_catalog_rows=2
      and triggers.pad_roads_catalog_rows=2
      and triggers.pad_google_update_eligible_rows=5
      and triggers.pad_google_update_eligible_exact as triggers_ok,
    tables.rows=10 and tables.present_rows=10 and tables.rls_exact_rows=10
      and tables.browser_write_denied as table_security_ok,
    isolation.google_queue=0 and isolation.public_google=0
      and not isolation.cutover and isolation.staging=0
      and isolation.competing_backends=0 and isolation.replication_role_origin
      and isolation.activation_execute as isolation_ok
  from permanent_install_state install
  cross join manifest_state manifest cross join build_state builds
  cross join county_registry_state registry cross join route_metrics routes
  cross join non_ohio_state non_ohio cross join impact_state impact
  cross join ingest_lock_state ingest_locks
  cross join activation_build_protection_state build_protection
  cross join activation_pad_protection_state pad_protection
  cross join manifest_baseline_state manifest_baseline
  cross join route_relation_protected_digest route_protection
  cross join route_history_sequence_state route_sequences
  cross join pad_edit_history_protected_state pad_history
  cross join saved_road_protected_state saved_road
  cross join topology_protected_digest topology
  cross join google_state google cross join google_trigger_state google_trigger
  cross join public_detail_state public_detail
  cross join projection_view_state projection_view
  cross join verification_state verification
  cross join function_state functions
  cross join route_function_state route_functions
  cross join route_dependency_function_state route_dependencies
  cross join public_route_mutation_matcher_state mutation_matcher
  cross join route_relation_trigger_state route_relation_triggers
  cross join public_route_relation_trigger_state public_route_triggers
  cross join trigger_state triggers
  cross join table_security_state tables cross join isolation_state isolation
),
failures as materialized (
  select pg_catalog.concat_ws(',',
    case when not coalesce(install_ok,false) then 'install_ok' end,
    case when not coalesce(manifest_ok,false) then 'manifest_ok' end,
    case when not coalesce(builds_ok,false) then 'builds_ok' end,
    case when not coalesce(county_registry_exact,false)
      then 'county_registry_exact' end,
    case when not coalesce(routes_ok,false) then 'routes_ok' end,
    case when not coalesce(non_ohio_ok,false) then 'non_ohio_ok' end,
    case when not coalesce(impacts_ok,false) then 'impacts_ok' end,
    case when not coalesce(ingest_lock_authority_ok,false)
      then 'ingest_lock_authority_ok' end,
    case when not coalesce(protected_baselines_ok,false)
      then 'protected_baselines_ok' end,
    case when not coalesce(route_history_sequences_ok,false)
      then 'route_history_sequences_ok' end,
    case when not coalesce(pad_edit_history_ok,false)
      then 'pad_edit_history_ok' end,
    case when not coalesce(saved_road_state_ok,false)
      then 'saved_road_state_ok' end,
    case when not coalesce(topology_protected_ok,false)
      then 'topology_protected_ok' end,
    case when not coalesce(google_projection_ok,false)
      then 'google_projection_ok' end,
    case when not coalesce(collateral_projection_ok,false)
      then 'collateral_projection_ok' end,
    case when not coalesce(projection_view_ok,false)
      then 'projection_view_ok' end,
    case when not coalesce(verification_projection_ok,false)
      then 'verification_projection_ok' end,
    case when not coalesce(functions_ok,false) then 'functions_ok' end,
    case when not coalesce(route_functions_ok,false)
      then 'route_functions_ok' end,
    case when not coalesce(route_dependencies_ok,false)
      then 'route_dependencies_ok' end,
    case when not coalesce(public_route_mutation_matcher_ok,false)
      then 'public_route_mutation_matcher_ok' end,
    case when not coalesce(route_relation_triggers_ok,false)
      then 'route_relation_triggers_ok' end,
    case when not coalesce(public_route_triggers_ok,false)
      then 'public_route_triggers_ok' end,
    case when not coalesce(triggers_ok,false) then 'triggers_ok' end,
    case when not coalesce(table_security_ok,false) then 'table_security_ok' end,
    case when not coalesce(isolation_ok,false) then 'isolation_ok' end
  ) as labels
  from checks
),
gate as materialized (
  select checks.*,
    case when failures.labels='' then 1
      else ('ISSUE97_ACTIVATION_AUTHORITY_FAILURE|'||failures.labels)::integer
    end as contract_pass
  from checks cross join failures
),
summary_receipt as materialized (
  select pg_catalog.jsonb_build_object(
    'classification','FROZEN_WAVE_OHIO_ACTIVATION_AUTHORITY_EXTRACTED',
    'contract_pass',gate.contract_pass,
    'manifest_id','1ef4015c-b1ae-45d2-8baa-86c47c561f54',
    'manifest_key','issue97-ohio-r3-frozen-wave-candidate',
    'manifest_digest','77cb00cf83ad8bab4a45c9b552626f76',
    'permanent_install_timestamp',install.install_timestamp,
    'manifest_members',19,'new_builds',8,'old_builds',8,'retained_builds',11,
    'retained_detail_digest',builds.retained_detail_digest,
    'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
    'route_count',412,'route_digest','711b1ddd3ba6c47e7642fc700197432f',
    'non_target_route_count',routes.untouched_route_rows,
    'non_target_route_digest',routes.untouched_route_digest,
    'activation_impact_count',impact.impact_rows,
    'activation_impact_route_count',impact.route_rows,
    'county_impact_set_digest',impact.county_impact_set_digest,
    'impact_route_digest',impact.impact_route_digest,
    'ingest_lock_count',ingest_locks.rows,
    'ingest_lock_authority_digest',ingest_locks.authority_digest,
    'target_build_prestate_digest',build_protection.target_digest,
    'non_target_build_count',build_protection.non_target_rows,
    'non_target_build_digest',build_protection.non_target_digest,
    'target_pad_prestate_digest',pad_protection.target_digest,
    'non_target_pad_count',pad_protection.non_target_rows,
    'non_target_pad_digest',pad_protection.non_target_digest,
    'non_target_google_receipt_count',
      pad_protection.non_target_google_receipt_rows,
    'non_target_google_receipt_digest',
      pad_protection.non_target_google_receipt_digest,
    'manifest_header_full_digest',manifest_baseline.header_full_digest,
    'manifest_members_full_digest',manifest_baseline.members_full_digest,
    'route_relation_count',route_protection.relation_rows,
    'route_relations_protected_digest',route_protection.combined_digest,
    'route_history_sequence_state_digest',route_sequences.sequence_state_digest,
    'pad_edit_history_count',pad_history.history_rows,
    'pad_edit_history_digest',pad_history.history_digest,
    'pad_edit_history_sequence_last_value',pad_history.last_value,
    'pad_edit_history_sequence_is_called',pad_history.is_called,
    'saved_road_baseline_digest',saved_road.baseline_digest,
    'saved_road_reconciliation_run_count',saved_road.run_rows,
    'saved_road_reconciliation_count',saved_road.reconciliation_rows
  ) || pg_catalog.jsonb_build_object(
    'topology_junction_count',topology.junction_rows,
    'topology_anchor_count',topology.anchor_rows,
    'topology_membership_count',topology.membership_rows,
    'topology_protected_digest',topology.combined_digest,
    'google_projected_pads',google.projected_rows,
    'google_pad_digest','450948793c57a9a1535139fac4974792',
    'google_tuple_digest','5a75e5c4c34805b7dc2fdf8d0534a4f6',
    'google_trigger_event_count',google_trigger.event_rows,
    'google_trigger_event_digest',google_trigger.trigger_event_digest,
    'google_trigger_route_count',google_trigger.trigger_route_rows,
    'google_trigger_route_digest',google_trigger.trigger_route_digest,
    'expected_post_deferred_digest',google.expected_post_deferred_digest,
    'public_detail_digest',public_detail.current_digest,
    'public_detail_unaffected_count',public_detail.unaffected_rows,
    'public_detail_unaffected_digest',public_detail.unaffected_digest,
    'projection_view_definition_md5',projection_view.view_definition_md5,
    'pad_verification_affected_count',verification.current_rows,
    'pad_verification_id_digest',verification.id_digest,
    'pad_verification_full_before_digest',verification.full_before_digest,
    'pad_verification_semantic_digest',verification.semantic_digest,
    'pad_verification_unaffected_count',verification.unaffected_rows,
    'pad_verification_unaffected_digest',verification.unaffected_digest,
    'non_ohio_graph_digest',non_ohio.graph_digest,
    'non_ohio_route_digest',non_ohio.route_digest,
    'selected_route_function_authority_digest',
      route_functions.selected_authority_digest,
    'selected_route_function_catalog_authority_digest',
      route_functions.selected_catalog_authority_digest,
    'activation_function_authority_digest',functions.authority_digest,
    'activation_function_catalog_authority_digest',
      functions.catalog_authority_digest,
    'route_dependency_function_authority_digest',
      route_dependencies.authority_digest,
    'route_dependency_function_catalog_authority_digest',
      route_dependencies.catalog_authority_digest,
    'public_route_mutation_pattern',mutation_matcher.pattern,
    'route_relation_trigger_authority_digest',
      route_relation_triggers.authority_digest,
    'public_route_trigger_authority_digest',
      public_route_triggers.authority_digest,
    'queue',isolation.google_queue,'public_google',isolation.public_google,
    'cutover',isolation.cutover,'production_write',false
  ) as body
  from gate cross join permanent_install_state install
  cross join build_state builds
  cross join route_metrics routes cross join impact_state impact
  cross join ingest_lock_state ingest_locks
  cross join activation_build_protection_state build_protection
  cross join activation_pad_protection_state pad_protection
  cross join manifest_baseline_state manifest_baseline
  cross join route_relation_protected_digest route_protection
  cross join route_history_sequence_state route_sequences
  cross join pad_edit_history_protected_state pad_history
  cross join saved_road_protected_state saved_road
  cross join topology_protected_digest topology
  cross join google_state google cross join google_trigger_state google_trigger
  cross join public_detail_state public_detail
  cross join projection_view_state projection_view
  cross join verification_state verification cross join non_ohio_state non_ohio
  cross join route_function_state route_functions
  cross join function_state functions
  cross join route_dependency_function_state route_dependencies
  cross join public_route_mutation_matcher_state mutation_matcher
  cross join route_relation_trigger_state route_relation_triggers
  cross join public_route_relation_trigger_state public_route_triggers
  cross join isolation_state isolation
),
output_rows as materialized (
  select 0 as section,0 as ordinal,
    'ISSUE97_ACTIVATION_AUTHORITY'::text as row_kind,body as body
  from summary_receipt
  union all
  select 1,0,'MANIFEST_HEADER',pg_catalog.jsonb_build_object(
    'id',id,'manifest_key',manifest_key,'state_code',state_code,
    'generation_key',generation_key,'git_sha',git_sha,
    'member_count',member_count,'manifest_digest',manifest_digest,
    'created_at',created_at,'review_details',review_details
  ) from manifest_header
  union all
  select 2,expected.ordinal,'MANIFEST_MEMBER',pg_catalog.jsonb_build_object(
    'ordinal',expected.ordinal,'member_kind',expected.member_kind,
    'county_code',expected.county_code,'build_id',expected.build_id,
    'graph_digest',expected.graph_digest,
    'source_revision_digest',expected.source_revision_digest,
    'member_digest',expected.member_digest
  ) from expected_members expected
  union all
  select 3,candidate.build_order,'NEW_BUILD',pg_catalog.to_jsonb(candidate)
  from candidate_actual candidate
  union all
  select 4,row_number() over(order by old.county_code)::integer,'OLD_BUILD',
    pg_catalog.to_jsonb(old) from old_actual old
  union all
  select 5,retained.ordinal,'RETAINED_BUILD',pg_catalog.to_jsonb(retained)
  from retained_actual retained
  union all
  select 6,receipt.build_order,'ACTIVATION_IMPACT',pg_catalog.to_jsonb(receipt)
  from activation_impact_receipts receipt
  union all
  select 7,row_number() over(order by route.county_code,route.route_prep_id)::integer,
    'ACTIVATION_IMPACT_ROUTE',pg_catalog.to_jsonb(route)
  from impact_routes route
  union all
  select 8,row_number() over(order by current.pad_id)::integer,
    'GOOGLE_CANONICAL_PAD',pg_catalog.to_jsonb(current)
      ||pg_catalog.to_jsonb(expected_post)
      ||pg_catalog.jsonb_build_object(
        'projected_by',coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(detail)
            order by detail.event_order,detail.pad_id)
          from google_projection_detail detail
          where detail.pad_id=current.pad_id
        ),'[]'::jsonb),
        'public_detail_before',(select row_value from public_detail_current detail
          where detail.id=current.pad_id),
        'public_detail_projected',(select row_value from public_detail_projected detail
          where detail.id=current.pad_id),
        'pad_verification_before',(select row_value from verification_current verification
          where verification.pad_id=current.pad_id)
      )
  from google_current current
  join google_expected_post_deferred expected_post using(pad_id)
  union all
  select 9,row_number() over(order by inventory.label)::integer,
    'FUNCTION_INVENTORY',pg_catalog.jsonb_build_object(
      'label',inventory.label,'signature',inventory.signature,
      'expected_md5',inventory.expected_md5,'actual_md5',inventory.actual_md5,
      'definition',inventory.definition,
      'catalog_md5',inventory.catalog_md5,
      'owner_oid',inventory.proowner,'owner_name',inventory.owner_name,
      'security_definer',inventory.prosecdef,'volatility',inventory.provolatile,
      'kind',inventory.prokind,'proconfig',inventory.proconfig,
      'proacl',inventory.proacl,'public_execute',inventory.public_execute,
      'anon_execute',inventory.anon_execute,
      'authenticated_execute',inventory.authenticated_execute,
      'service_execute',inventory.service_execute
    )
  from function_inventory inventory
  union all
  select 10,row_number() over(order by inventory.trigger_name)::integer,
    'TRIGGER_INVENTORY',pg_catalog.jsonb_build_object(
      'trigger_name',inventory.trigger_name,
      'table_schema',inventory.table_schema,'table_name',inventory.table_name,
      'function_signature',inventory.function_signature,
      'enabled',inventory.tgenabled,'tgtype',inventory.tgtype,
      'tgattr',inventory.actual_tgattr,
      'tgqual',inventory.tgqual,'tgnargs',inventory.tgnargs,
      'tgargs_hex',pg_catalog.encode(inventory.tgargs,'hex'),
      'constraint_oid',inventory.tgconstraint,
      'deferrable',inventory.tgdeferrable,
      'initially_deferred',inventory.tginitdeferred,
      'trigger_md5',inventory.trigger_md5,
      'trigger_definition',inventory.trigger_definition
    )
  from trigger_inventory inventory
  union all
  select 11,row_number() over(order by route.route_prep_id)::integer,
    'FROZEN_ROUTE',pg_catalog.jsonb_build_object(
      'route_prep_id',route.route_prep_id,'pad_id',route_row.pad_id,
      'route_group',route_row.route_group,'variant_index',route_row.variant_index
    )
  from frozen_routes route
  join public.brinesearch_route_prep route_row on route_row.id=route.route_prep_id
  union all
  select 12,row_number() over(order by route.route_prep_id)::integer,
    'NON_TARGET_ROUTE',pg_catalog.to_jsonb(route)
  from untouched_routes route
  union all
  select 13,row_number() over(order by event.event_order,event.pad_id)::integer,
    'GOOGLE_TRIGGER_EVENT',pg_catalog.to_jsonb(event)
  from google_projection_detail event
  union all
  select 14,row_number() over(order by route.route_prep_id)::integer,
    'GOOGLE_TRIGGER_ROUTE',pg_catalog.to_jsonb(route)
  from google_trigger_routes route
  union all
  select 15,row_number() over(order by catalog.table_schema,catalog.table_name,
      catalog.tgname)::integer,
    'RELEVANT_TRIGGER_CATALOG',pg_catalog.to_jsonb(catalog)
  from relevant_trigger_catalog catalog
  union all
  select 16,row_number() over(order by inventory.table_schema,
      inventory.table_name)::integer,
    'TABLE_SECURITY_INVENTORY',pg_catalog.to_jsonb(inventory)
  from table_security_inventory inventory
  union all
  select 17,row_number() over(order by verification.pad_id)::integer,
    'PAD_VERIFICATION_PRESTATE',pg_catalog.to_jsonb(verification)
      ||pg_catalog.jsonb_build_object(
        'post_semantic_row_must_equal',true,
        'post_updated_at_rule','activation_transaction_timestamp',
        'unaffected_rows_must_be_byte_identical',true
      )
  from verification_current verification
  union all
  select 18,0,'NON_OHIO_PROTECTED_STATE',pg_catalog.to_jsonb(non_ohio)
  from non_ohio_state non_ohio
  union all
  select 19,authority.ordinal,'ROUTE_FUNCTION_AUTHORITY',
    pg_catalog.to_jsonb(authority)
  from route_function_authority authority
  union all
  select 20,0,'PROJECTION_VIEW_AUTHORITY',pg_catalog.to_jsonb(authority)
  from projection_view_authority authority
  union all
  select 21,authority.ordinal,'ROUTE_DEPENDENCY_FUNCTION_AUTHORITY',
    pg_catalog.to_jsonb(authority)
  from route_dependency_function_authority authority
  union all
  select 22,authority.ordinal,'ROUTE_RELATION_TRIGGER_AUTHORITY',
    pg_catalog.to_jsonb(authority)
  from route_relation_trigger_authority authority
  union all
  select 23,prestate.event_order,'ACTIVATION_BUILD_FULL_PRESTATE',
    pg_catalog.jsonb_build_object(
      'build_role',prestate.build_role,'county_code',prestate.county_code,
      'build_id',prestate.build_id,'row',prestate.row_value
    )
  from activation_build_prestate prestate
  union all
  select 24,row_number() over(order by prestate.pad_id)::integer,
    'ACTIVATION_PAD_FULL_PRESTATE',pg_catalog.jsonb_build_object(
      'pad_id',prestate.pad_id,'row',prestate.row_value
    )
  from activation_pad_prestate prestate
  union all
  select 25,0,'PROTECTED_BASELINE_COMPONENTS',
    pg_catalog.jsonb_build_object(
      'route_relations',pg_catalog.to_jsonb(route_protection),
      'route_history_sequences',pg_catalog.to_jsonb(route_sequences),
      'pad_edit_history',pg_catalog.to_jsonb(pad_history),
      'saved_road_state',pg_catalog.to_jsonb(saved_road),
      'topology',pg_catalog.to_jsonb(topology),
      'ingest_locks',pg_catalog.to_jsonb(ingest_locks),
      'graph_builds',pg_catalog.to_jsonb(build_protection),
      'pads_and_google_receipts',pg_catalog.to_jsonb(pad_protection),
      'manifest',pg_catalog.to_jsonb(manifest_baseline)
    )
  from route_relation_protected_digest route_protection
  cross join route_history_sequence_state route_sequences
  cross join pad_edit_history_protected_state pad_history
  cross join saved_road_protected_state saved_road
  cross join topology_protected_digest topology
  cross join ingest_lock_state ingest_locks
  cross join activation_build_protection_state build_protection
  cross join activation_pad_protection_state pad_protection
  cross join manifest_baseline_state manifest_baseline
  union all
  select 26,authority.ordinal,'ROUTE_HISTORY_SEQUENCE_AUTHORITY',
    pg_catalog.to_jsonb(authority)
  from route_history_sequence_authority authority
  union all
  select 27,0,'SAVED_ROAD_PROTECTED_STATE',pg_catalog.to_jsonb(saved_road)
  from saved_road_protected_state saved_road
  union all
  select 28,authority.ordinal,'INGEST_LOCK_AUTHORITY',
    pg_catalog.to_jsonb(authority)
  from ingest_lock_authority authority
  union all
  select 29,0,'TOPOLOGY_PROTECTED_STATE',pg_catalog.to_jsonb(topology)
  from topology_protected_digest topology
  union all
  select 30,authority.ordinal,'PUBLIC_ROUTE_RELATION_TRIGGER_AUTHORITY',
    pg_catalog.to_jsonb(authority)
  from public_route_relation_trigger_authority authority
  union all
  select 31,0,'PUBLIC_ROUTE_MUTATION_MATCHER_STATE',
    pg_catalog.to_jsonb(matcher)
  from public_route_mutation_matcher_state matcher
  union all
  select 32,0,'PAD_EDIT_HISTORY_PROTECTED_STATE',
    pg_catalog.to_jsonb(pad_history)
  from pad_edit_history_protected_state pad_history
)
select row_kind||'|'||body::text
from output_rows cross join gate
where gate.contract_pass=1
order by section,ordinal,row_kind;

rollback;
