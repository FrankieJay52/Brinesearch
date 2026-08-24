\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned
\timing on

-- GitHub Issue #97 -- exact frozen-wave 412-route reconciliation.
--
-- issue97_route_apply=0 (default): locked, non-mutating rehearsal/preflight.
-- issue97_route_apply=1: execute the exact 412-route private receipt rebuild and
-- commit only after every target/non-target/isolation postcondition passes.
--
-- The rehearsal deliberately does not invoke writer functions. PostgreSQL
-- sequences are non-transactional, so invoking the history writers and then
-- ROLLBACK would still advance four production sequences.
--
-- This file never updates public route-prep/step/pad-road relations, pads,
-- public Google routes, the Google queue, graph builds, manifests, mappings,
-- source data, or cutover. The only persistent relations reachable in apply
-- mode are the nine private Issue #97 candidate/receipt/history relations
-- listed in issue97_non_target_before below.

\if :{?issue97_route_apply}
\else
  \set issue97_route_apply 0
\endif

select 1/(case when :'issue97_route_apply' in ('0','1') then 1 else 0 end)
  as issue97_route_apply_control
\gset

begin isolation level serializable;
set local statement_timeout='90min';
set local lock_timeout='2min';
set local idle_in_transaction_session_timeout='95min';
set local timezone='UTC';
set local datestyle='ISO, YMD';
set local extra_float_digits=3;
set local standard_conforming_strings=on;

-- Preserve the independently audited writer order.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
);
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

create temporary table issue97_frozen_routes(
  ordinal integer primary key,
  route_prep_id uuid not null unique
) on commit drop;

with
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
issue97_frozen_route_authority(route_prep_id) as (
  select route_prep_id from frozen_routes
)
insert into pg_temp.issue97_frozen_routes(ordinal,route_prep_id)
select pg_catalog.row_number() over(order by route_prep_id)::integer,route_prep_id
from issue97_frozen_route_authority
order by route_prep_id;

create temporary table issue97_target_steps on commit drop as
select step.id as route_prep_step_id,step.route_prep_id,step.step_order
from public.brinesearch_route_prep_steps step
join pg_temp.issue97_frozen_routes frozen
  on frozen.route_prep_id=step.route_prep_id
join public.brinesearch_route_prep route on route.id=step.route_prep_id
where step.active and route.active
  and step.step_kind in (
    'interstate','us_route','state_route','county_road',
    'township_road','local_road','private_segment'
  )
order by step.route_prep_id,step.step_order,step.id;
alter table pg_temp.issue97_target_steps
  add primary key(route_prep_step_id);

create temporary table issue97_target_pads on commit drop as
select distinct route.pad_id
from public.brinesearch_route_prep route
join pg_temp.issue97_frozen_routes frozen on frozen.route_prep_id=route.id
order by route.pad_id;
alter table pg_temp.issue97_target_pads add primary key(pad_id);

do $issue97_route_rebuild_locks$
declare lock_row record;
begin
  -- Freeze all exact successor-manifest source scopes.
  for lock_row in
    select distinct source.value->>'dataset_id' as dataset_id,
      source.value->>'state_code' as state_code,
      source.value->>'county_code' as county_code
    from private_verification.brinesearch_issue97_state_candidate_manifest_members member
    join public.brinesearch_road_graph_builds build
      on build.id=(member.member_value->>'build_id')::uuid
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(build.details->'source_run_vector','[]'::jsonb)
    ) source(value)
    where member.manifest_id='1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid
    order by dataset_id,state_code,county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||lock_row.dataset_id||':'||
        lock_row.county_code
    ));
  end loop;

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
$issue97_route_rebuild_locks$;

-- The phase-1 release gate intentionally permits an authoritative identity to
-- be resolved before a reviewed canonical-road mapping exists.  Pin the exact
-- pre-existing release blockers so this route rebuild may remove/hold them but
-- can never create a new one.
create temporary table issue97_resolved_unmapped_before(
  route_prep_id uuid not null,
  route_prep_step_id uuid primary key,
  identity_id uuid not null,
  source_identity_key text not null,
  source_digest text not null,
  mapping_fingerprint text not null,
  resolution_method text not null
) on commit drop;

insert into pg_temp.issue97_resolved_unmapped_before
select receipt.route_prep_id,receipt.route_prep_step_id,receipt.identity_id,
  receipt.source_identity_key,receipt.source_digest,receipt.mapping_fingerprint,
  receipt.resolution_method
from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
join pg_temp.issue97_frozen_routes frozen
  on frozen.route_prep_id=receipt.route_prep_id
where receipt.resolution_status='resolved'
  and receipt.canonical_road_id is null
  and not exists(
    select 1 from public.brinesearch_road_identity_mappings mapping
    where mapping.identity_id=receipt.identity_id
      and mapping.mapping_status='verified'
  )
order by receipt.route_prep_id,receipt.route_prep_step_id;

create temporary table issue97_non_target_before(
  ordinal integer primary key,
  relation_name text not null unique,
  row_count bigint not null,
  row_digest text not null
) on commit drop;

insert into pg_temp.issue97_non_target_before
select 1,'private_verification.brinesearch_route_occurrence_candidates_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    candidate.route_prep_step_id::text||':'||candidate.identity_id::text||':'||
      candidate.candidate_basis||':'||
      pg_catalog.md5(pg_catalog.to_jsonb(candidate)::text),
    '|' order by candidate.route_prep_step_id,candidate.identity_id,
      candidate.candidate_basis
  ),''))
from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
join public.brinesearch_route_prep_steps step
  on step.id=candidate.route_prep_step_id
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=step.route_prep_id)
union all
select 2,'private_verification.brinesearch_route_occurrence_receipts_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_step_id::text||':'||
      pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
    '|' order by receipt.route_prep_step_id
  ),''))
from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=receipt.route_prep_id)
union all
select 3,'private_verification.brinesearch_route_occurrence_receipt_history_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
    '|' order by history.id
  ),''))
from private_verification.brinesearch_route_occurrence_receipt_history_issue97 history
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=history.route_prep_id)
union all
select 4,'private_verification.brinesearch_route_reconciliation_receipts_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_id::text||':'||
      pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
    '|' order by receipt.route_prep_id
  ),''))
from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=receipt.route_prep_id)
union all
select 5,'private_verification.brinesearch_route_reconciliation_history_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
    '|' order by history.id
  ),''))
from private_verification.brinesearch_route_reconciliation_history_issue97 history
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=history.route_prep_id)
union all
select 6,'private_verification.brinesearch_route_transition_receipts_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||
      pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
    '|' order by receipt.route_prep_id,receipt.boundary_index
  ),''))
from private_verification.brinesearch_route_transition_receipts_issue97 receipt
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=receipt.route_prep_id)
union all
select 7,'private_verification.brinesearch_route_transition_history_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
    '|' order by history.id
  ),''))
from private_verification.brinesearch_route_transition_history_issue97 history
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=history.route_prep_id)
union all
select 8,'private_verification.brinesearch_route_occurrence_geometry_receipts_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.route_prep_step_id::text||':'||
      pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
    '|' order by receipt.route_prep_step_id
  ),''))
from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=receipt.route_prep_id)
union all
select 9,'private_verification.brinesearch_route_occurrence_geometry_history_issue97',
  count(*)::bigint,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(
    history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
    '|' order by history.id
  ),''))
from private_verification.brinesearch_route_occurrence_geometry_history_issue97 history
where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
  where frozen.route_prep_id=history.route_prep_id);

create temporary table issue97_guard_before on commit drop as
select
  (select count(*)::bigint from public.pads) as pads_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pad.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(pad)::text),
    '|' order by pad.id
  ),'')) from public.pads pad) as pads_digest,
  (select count(*)::bigint
   from private_verification.brinesearch_google_route_receipts_issue97)
    as google_receipt_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    receipt.pad_id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
    '|' order by receipt.pad_id
  ),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt)
    as google_receipt_digest,
  (select count(*)::bigint
   from private_verification.brinesearch_google_route_refresh_queue_issue97)
    as queue_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    queue.pad_id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(queue)::text),
    '|' order by queue.pad_id
  ),'')) from private_verification.brinesearch_google_route_refresh_queue_issue97 queue)
    as queue_digest,
  (select count(*)::bigint from public.brinesearch_driver_google_routes_public)
    as public_google_rows,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    route.pad_id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(route)::text),
    '|' order by route.pad_id
  ),'')) from public.brinesearch_driver_google_routes_public route)
    as public_google_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||
      build.status||':'||coalesce(build.activated_at::text,'')||':'||
      coalesce(build.graph_digest,'')||':'||build.details::text,
    '|' order by build.id
  ),'')) from public.brinesearch_road_graph_builds build
    where build.state_code in ('WV','PA')) as non_ohio_graph_digest;

create temporary table issue97_history_sequence_before on commit drop as
select 1 as ordinal,
  'private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq'
    as sequence_name,last_value,is_called
from private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq
union all
select 2,
  'private_verification.brinesearch_route_reconciliation_history_issue97_id_seq',
  last_value,is_called
from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq
union all
select 3,
  'private_verification.brinesearch_route_transition_history_issue97_id_seq',
  last_value,is_called
from private_verification.brinesearch_route_transition_history_issue97_id_seq
union all
select 4,
  'private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq',
  last_value,is_called
from private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq;

create temporary table issue97_route_execution(
  route_prep_id uuid primary key,
  identity_result jsonb not null,
  transition_result jsonb not null,
  geometry_result jsonb not null,
  reconciliation_result jsonb not null
) on commit drop;

do $issue97_route_rebuild_preflight$
declare
  v_manifest record;
  v_cache jsonb;
  v_route_count integer;
  v_route_digest text;
  v_primary integer;
  v_alternate integer;
  v_untouched integer;
  v_function_count integer;
  v_function_exact integer;
begin
  select manifest.* into strict v_manifest
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id='1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid
    and manifest.manifest_key='issue97-ohio-r3-frozen-wave-candidate'
    and manifest.state_code='OH'
    and manifest.generation_key='issue97-release-20260815-r2'
    and manifest.member_count=19
    and manifest.manifest_digest='77cb00cf83ad8bab4a45c9b552626f76';

  if not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(
       v_manifest.id
     )
     or public.brinesearch_issue97_cutover_active()
     or exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
     or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
     or (select count(*)
       from private_verification.brinesearch_google_route_refresh_queue_issue97)<>0
     or exists(
       select 1 from pg_catalog.pg_stat_activity activity
       where activity.pid<>pg_catalog.pg_backend_pid()
         and activity.state in (
           'active','idle in transaction','idle in transaction (aborted)'
         )
         and (
           coalesce(activity.application_name,'') ilike '%issue97%'
           or coalesce(activity.query,'') ilike '%brinesearch_issue97_reconcile%'
           or coalesce(activity.query,'') ilike '%brinesearch_issue97_refresh_google%'
           or coalesce(activity.query,'') ilike '%brinesearch_issue97_activate%'
           or coalesce(activity.query,'') ilike '%brinesearch_issue97_rebuild%'
         )
     ) then
    raise exception 'Issue #97 exact-route isolation/manifest preflight failed';
  end if;

  if (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifest_members
      where manifest_id=v_manifest.id)<>19
     or exists(
       (select build.state_code||':'||build.county_code,build.id::text
        from public.brinesearch_road_graph_builds build
        where build.state_code='OH' and build.status='active'
        except
        select member.member_key,member.member_value->>'build_id'
        from private_verification.brinesearch_issue97_state_candidate_manifest_members member
        where member.manifest_id=v_manifest.id)
       union all
       (select member.member_key,member.member_value->>'build_id'
        from private_verification.brinesearch_issue97_state_candidate_manifest_members member
        where member.manifest_id=v_manifest.id
        except
        select build.state_code||':'||build.county_code,build.id::text
        from public.brinesearch_road_graph_builds build
        where build.state_code='OH' and build.status='active')
     )
     or (select count(*) from public.brinesearch_road_graph_builds
       where id in (
         '1c1320b3-4257-4239-9c55-b18a801aa97e'::uuid,
         '8e565c14-33a4-4862-9bf8-be9b5557b293'::uuid,
         'b86d14c7-5c8a-4cb9-8a3b-903965340678'::uuid,
         '44245144-3e39-45fe-907b-95e2b01b9c32'::uuid,
         '0870470a-11f8-4f33-8af3-08d6849d5f34'::uuid,
         'c9bac3a2-82d4-4b76-813c-6a29c1bf062a'::uuid,
         '8493f66b-b3d2-4673-be8a-07b024b9723d'::uuid,
         '200d56dc-5b13-4f84-82cb-946b8ebeada2'::uuid
       ) and status='active')<>8
     or (select count(*) from public.brinesearch_road_graph_builds
       where id in (
         '24ffa531-0e69-4625-a137-da52020e6fd0'::uuid,
         '5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,
         'c9f50b03-4328-4d8b-9995-4dc8bc85dd01'::uuid,
         '84568854-3257-46b7-8581-374dc620ef16'::uuid,
         '542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid,
         'cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4'::uuid,
         'ab9f4083-d572-4d9d-8e0a-28ebb77517e7'::uuid,
         '70f30495-860a-4199-9360-8e880f3b515b'::uuid
       ) and status='retired')<>8 then
    raise exception 'Issue #97 successor/retired graph set is not exact';
  end if;

  select count(*)::integer,
    pg_catalog.md5(pg_catalog.string_agg(
      frozen.route_prep_id::text,'|' order by frozen.route_prep_id
    )),
    count(*) filter(where route.route_group='primary')::integer,
    count(*) filter(where route.route_group='alternate')::integer
  into v_route_count,v_route_digest,v_primary,v_alternate
  from pg_temp.issue97_frozen_routes frozen
  join public.brinesearch_route_prep route on route.id=frozen.route_prep_id
    and route.active
  join public.pads pad on pad.id=route.pad_id
    and pad.state='Ohio' and not coalesce(pad.list_only,false);

  select count(*)::integer into v_untouched
  from public.brinesearch_route_prep route
  join public.pads pad on pad.id=route.pad_id
  where route.active and route.route_group in ('primary','alternate')
    and pad.state='Ohio' and not coalesce(pad.list_only,false)
    and not exists(select 1 from pg_temp.issue97_frozen_routes frozen
      where frozen.route_prep_id=route.id);

  if v_route_count<>412
     or v_route_digest<>'711b1ddd3ba6c47e7642fc700197432f'
     or v_primary<>340 or v_alternate<>72 or v_untouched<>394
     or (select count(*) from pg_temp.issue97_frozen_routes)<>412
     or (select count(distinct route_prep_id)
       from pg_temp.issue97_frozen_routes)<>412 then
    raise exception 'Issue #97 exact 412-route scope changed';
  end if;

  if (select count(*) from public.brinesearch_route_prep)<>1142
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       route.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(route)::text),
       '|' order by route.id
     ),'')) from public.brinesearch_route_prep route)
       <>'ad0f05a78c5076a6d8c9d82a1cd21445'
     or (select count(*) from public.brinesearch_route_prep_steps)<>4903
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       step.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(step)::text),
       '|' order by step.id
     ),'')) from public.brinesearch_route_prep_steps step)
       <>'2a918cb88cbbc9d120b4de29f326870a'
     or (select count(*) from public.brinesearch_pad_roads)<>23
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       pad_road.route_step_id::text||':'||
         pg_catalog.md5(pg_catalog.to_jsonb(pad_road)::text),
       '|' order by pad_road.route_step_id
     ),'')) from public.brinesearch_pad_roads pad_road)
       <>'b7ecec9d58ae5a06765486cf62919958'
     or (select non_ohio_graph_digest from pg_temp.issue97_guard_before)
       <>'7776affed9bb9dd931aa86116e490a68' then
    raise exception 'Issue #97 route/public/non-Ohio authority baseline changed';
  end if;

  with expected(signature,definition_md5) as (
    values
      ('private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)',
       '0f139df2a01f68722958ff10f1dd6f49'),
      ('private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)',
       '8ad311611cf361ca457e4084128b9cfb'),
      ('private_verification.brinesearch_issue97_refresh_route_receipt(uuid)',
       '8283a543bf42f939296d32e5e5a92b4f'),
      ('private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)',
       '5d6a002a25bd37011b574858b3870382'),
      ('private_verification.brinesearch_issue97_refresh_route_geometry(uuid)',
       '89ec2a0f5821d7b6a7d8e569aef8d5de'),
      ('private_verification.brinesearch_issue97_write_occurrence_history(uuid)',
       '2f0b95ff3a52f63e98a72f0e89a4d985'),
      ('private_verification.brinesearch_issue97_write_transition_history(uuid,integer)',
       '068d6a1a561e5f61c8178a77120775d6'),
      ('private_verification.brinesearch_issue97_write_geometry_history(uuid)',
       '6ab9ad6eb96980ef24cd896cfa7a360f'),
      ('private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)',
       'a09e01457d5bf95108e2c9ef71656006'),
      ('private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(uuid,text,text,text,integer)',
       '101d7b6c21b60aeb64886fa3b6ba9343'),
      ('private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)',
       '80675198042cb9d4407dbe4fc8d9251f'),
      ('private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)',
       'd29e371803a956cb94ed13e81e7c2317')
  ), authority as (
    select expected.*,
      pg_catalog.to_regprocedure(expected.signature) as oid
    from expected
  )
  select count(*)::integer,
    count(*) filter(where oid is not null
      and pg_catalog.md5(pg_catalog.pg_get_functiondef(oid))=definition_md5)::integer
  into v_function_count,v_function_exact
  from authority;

  if v_function_count<>12 or v_function_exact<>12 then
    raise exception 'Issue #97 exact-route function authority changed: %/%',
      v_function_exact,v_function_count;
  end if;

  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_id',v_manifest.id::text,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_manifest_digest',
    v_manifest.manifest_digest,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_state_code',v_manifest.state_code,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_generation_key',v_manifest.generation_key,true
  );
  perform pg_catalog.set_config(
    'brinesearch.issue97_expected_member_count',v_manifest.member_count::text,true
  );

  v_cache:=
    private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
      v_manifest.id,v_manifest.manifest_digest,v_manifest.state_code,
      v_manifest.generation_key,v_manifest.member_count
    );

  if v_cache->>'manifest_id'<>v_manifest.id::text
     or v_cache->>'manifest_digest'<>'77cb00cf83ad8bab4a45c9b552626f76'
     or v_cache->>'state_code'<>'OH'
     or v_cache->>'generation_key'<>'issue97-release-20260815-r2'
     or v_cache->>'member_count'<>'19'
     or v_cache->>'release_current_count'<>'19'
     or v_cache->>'source_scope_count'<>'38'
     or v_cache->>'cache_scope'<>'exact_state_manifest'
     or v_cache->>'cache_miss_policy'<>'fail_closed'
     or v_cache->>'global_cutover_authorized'<>'false'
     or v_cache->>'reused'<>'false'
     or v_cache->>'full_predicate_evaluation_count'<>'19'
     or (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache)<>19
     or exists(select 1 from pg_temp.tmp_issue97_graph_release_current_cache
       where not current) then
    raise exception 'Issue #97 successor manifest cache preparation failed';
  end if;

  if (select count(*) from pg_temp.issue97_resolved_unmapped_before)<>9
     or (select count(distinct route_prep_id)
       from pg_temp.issue97_resolved_unmapped_before)<>7
     or (select count(distinct identity_id)
       from pg_temp.issue97_resolved_unmapped_before)<>7
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
       blocker.route_prep_id::text||':'||blocker.route_prep_step_id::text||':'||
         blocker.identity_id::text||':'||blocker.source_identity_key,
       '|' order by blocker.route_prep_id,blocker.route_prep_step_id
     ),'')) from pg_temp.issue97_resolved_unmapped_before blocker)
       <>'db1f515b32bf8a9837f57cf6a22fba8f'
     or exists(
       select 1
       from pg_temp.issue97_resolved_unmapped_before blocker
       left join public.brinesearch_authoritative_road_identities identity
         on identity.id=blocker.identity_id
       where blocker.resolution_method<>'route_graph_unique_identity_path'
          or identity.id is null or not identity.active
          or identity.source_identity_key is distinct from
            blocker.source_identity_key
          or identity.source_digest is distinct from blocker.source_digest
          or blocker.mapping_fingerprint is distinct from
            private_verification.brinesearch_issue97_mapping_fingerprint(
              blocker.identity_id
            )
          or private_verification.brinesearch_issue97_dataset_scope_current(
            identity.dataset_id,identity.state_code,identity.county_code
          ) is distinct from true
     ) then
    raise exception 'Issue #97 pre-existing resolved/unmapped authority changed';
  end if;
end
$issue97_route_rebuild_preflight$;

\if :issue97_route_apply
  do $issue97_route_rebuild_apply$
  declare
    step_row record;
    route_row record;
    v_identity jsonb;
    v_transition jsonb;
    v_geometry jsonb;
    v_reconciliation jsonb;
    v_steps integer:=0;
    v_routes integer:=0;
  begin
    -- Match the installed corpus stale-receipt semantics, narrowed to the
    -- frozen route set.
    update private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
    set resolution_status='stale',
      hold_reason='source_route_occurrence_inactive',
      resolved_at=null,updated_at=now(),
      receipt_digest=pg_catalog.md5(
        receipt.input_digest||'|stale|source_route_occurrence_inactive'
      )
    where exists(select 1 from pg_temp.issue97_frozen_routes frozen
        where frozen.route_prep_id=receipt.route_prep_id)
      and not exists(
        select 1
        from public.brinesearch_route_prep_steps step
        join public.brinesearch_route_prep route
          on route.id=step.route_prep_id
        where step.id=receipt.route_prep_step_id
          and step.active and route.active
          and step.step_kind in (
            'interstate','us_route','state_route','county_road',
            'township_road','local_road','private_segment'
          )
      );

    for step_row in
      select target.route_prep_step_id
      from pg_temp.issue97_target_steps target
      order by target.route_prep_id,target.step_order,target.route_prep_step_id
    loop
      perform private_verification.brinesearch_issue97_refresh_occurrence_candidate(
        step_row.route_prep_step_id
      );
      v_steps:=v_steps+1;
    end loop;

    for route_row in
      select route_prep_id from pg_temp.issue97_frozen_routes order by ordinal
    loop
      v_identity:=
        private_verification.brinesearch_issue97_resolve_route_identity_path(
          route_row.route_prep_id
        );
      v_transition:=
        private_verification.brinesearch_issue97_refresh_transition_receipts(
          route_row.route_prep_id
        );
      v_geometry:=
        private_verification.brinesearch_issue97_refresh_route_geometry(
          route_row.route_prep_id
        );
      v_reconciliation:=
        private_verification.brinesearch_issue97_refresh_route_receipt(
          route_row.route_prep_id
        );

      insert into pg_temp.issue97_route_execution(
        route_prep_id,identity_result,transition_result,geometry_result,
        reconciliation_result
      ) values(
        route_row.route_prep_id,v_identity,v_transition,v_geometry,
        v_reconciliation
      );
      v_routes:=v_routes+1;
    end loop;

    if v_routes<>412
       or v_steps<>(select count(*) from pg_temp.issue97_target_steps)
       or (select count(*) from pg_temp.issue97_route_execution)<>412 then
      raise exception 'Issue #97 exact route execution cardinality failed';
    end if;
  end
  $issue97_route_rebuild_apply$;

  create temporary table issue97_non_target_after(
    ordinal integer primary key,
    relation_name text not null unique,
    row_count bigint not null,
    row_digest text not null
  ) on commit drop;

  insert into pg_temp.issue97_non_target_after
  select 1,'private_verification.brinesearch_route_occurrence_candidates_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      candidate.route_prep_step_id::text||':'||candidate.identity_id::text||':'||
        candidate.candidate_basis||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(candidate)::text),
      '|' order by candidate.route_prep_step_id,candidate.identity_id,
        candidate.candidate_basis
    ),''))
  from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
  join public.brinesearch_route_prep_steps step
    on step.id=candidate.route_prep_step_id
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=step.route_prep_id)
  union all
  select 2,'private_verification.brinesearch_route_occurrence_receipts_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_step_id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_step_id
    ),''))
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=receipt.route_prep_id)
  union all
  select 3,'private_verification.brinesearch_route_occurrence_receipt_history_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
  from private_verification.brinesearch_route_occurrence_receipt_history_issue97 history
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=history.route_prep_id)
  union all
  select 4,'private_verification.brinesearch_route_reconciliation_receipts_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_id
    ),''))
  from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=receipt.route_prep_id)
  union all
  select 5,'private_verification.brinesearch_route_reconciliation_history_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
  from private_verification.brinesearch_route_reconciliation_history_issue97 history
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=history.route_prep_id)
  union all
  select 6,'private_verification.brinesearch_route_transition_receipts_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_id,receipt.boundary_index
    ),''))
  from private_verification.brinesearch_route_transition_receipts_issue97 receipt
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=receipt.route_prep_id)
  union all
  select 7,'private_verification.brinesearch_route_transition_history_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
  from private_verification.brinesearch_route_transition_history_issue97 history
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=history.route_prep_id)
  union all
  select 8,'private_verification.brinesearch_route_occurrence_geometry_receipts_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.route_prep_step_id::text||':'||
        pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
      '|' order by receipt.route_prep_step_id
    ),''))
  from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=receipt.route_prep_id)
  union all
  select 9,'private_verification.brinesearch_route_occurrence_geometry_history_issue97',
    count(*)::bigint,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      history.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(history)::text),
      '|' order by history.id
    ),''))
  from private_verification.brinesearch_route_occurrence_geometry_history_issue97 history
  where not exists(select 1 from pg_temp.issue97_frozen_routes frozen
    where frozen.route_prep_id=history.route_prep_id);

  create temporary table issue97_resolved_unmapped_after(
    route_prep_id uuid not null,
    route_prep_step_id uuid primary key,
    identity_id uuid not null,
    source_identity_key text not null,
    source_digest text not null,
    mapping_fingerprint text not null,
    resolution_method text not null
  ) on commit drop;

  insert into pg_temp.issue97_resolved_unmapped_after
  select receipt.route_prep_id,receipt.route_prep_step_id,receipt.identity_id,
    receipt.source_identity_key,receipt.source_digest,
    receipt.mapping_fingerprint,receipt.resolution_method
  from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
  join pg_temp.issue97_frozen_routes frozen
    on frozen.route_prep_id=receipt.route_prep_id
  where receipt.resolution_status='resolved'
    and receipt.canonical_road_id is null
    and not exists(
      select 1 from public.brinesearch_road_identity_mappings mapping
      where mapping.identity_id=receipt.identity_id
        and mapping.mapping_status='verified'
    )
  order by receipt.route_prep_id,receipt.route_prep_step_id;

  do $issue97_route_rebuild_postcheck$
  declare
    v_transaction_time timestamptz:=pg_catalog.transaction_timestamp();
  begin
    if exists(
      (select * from pg_temp.issue97_non_target_before
       except select * from pg_temp.issue97_non_target_after)
      union all
      (select * from pg_temp.issue97_non_target_after
       except select * from pg_temp.issue97_non_target_before)
    ) then
      raise exception 'Issue #97 non-target private route state changed';
    end if;

    if (select count(*)
        from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
        join pg_temp.issue97_frozen_routes frozen
          on frozen.route_prep_id=receipt.route_prep_id
        where receipt.updated_at=v_transaction_time)=412
       and not exists(
         select 1
         from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
         join pg_temp.issue97_frozen_routes frozen
           on frozen.route_prep_id=receipt.route_prep_id
         where receipt.route_status='stale'
       )
    then
      null;
    else
      raise exception 'Issue #97 target reconciliation receipts are incomplete/stale';
    end if;

    if exists(
      select 1 from pg_temp.issue97_target_steps target
      left join private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
        on receipt.route_prep_step_id=target.route_prep_step_id
       and receipt.route_prep_id=target.route_prep_id
       and receipt.updated_at=v_transaction_time
      where receipt.route_prep_step_id is null
    ) or exists(
      select 1
      from private_verification.brinesearch_route_occurrence_candidates_issue97 candidate
      join pg_temp.issue97_target_steps target
        on target.route_prep_step_id=candidate.route_prep_step_id
      where candidate.updated_at<>v_transaction_time
    ) then
      raise exception 'Issue #97 target occurrence refresh is incomplete';
    end if;

    if exists(
      (select blocker_after.route_prep_id,blocker_after.route_prep_step_id,
         blocker_after.identity_id,blocker_after.source_identity_key
       from pg_temp.issue97_resolved_unmapped_after blocker_after
       except
       select blocker_before.route_prep_id,blocker_before.route_prep_step_id,
         blocker_before.identity_id,blocker_before.source_identity_key
       from pg_temp.issue97_resolved_unmapped_before blocker_before)
    ) or exists(
      select 1
      from pg_temp.issue97_resolved_unmapped_after blocker_after
      left join public.brinesearch_authoritative_road_identities identity
        on identity.id=blocker_after.identity_id
      where blocker_after.resolution_method not in (
            'explicit_authoritative_source_receipt',
            'route_graph_unique_identity_path'
          )
         or identity.id is null or not identity.active
         or identity.source_identity_key is distinct from
           blocker_after.source_identity_key
         or identity.source_digest is distinct from blocker_after.source_digest
         or blocker_after.mapping_fingerprint is distinct from
           private_verification.brinesearch_issue97_mapping_fingerprint(
             blocker_after.identity_id
           )
         or private_verification.brinesearch_issue97_dataset_scope_current(
           identity.dataset_id,identity.state_code,identity.county_code
         ) is distinct from true
    ) then
      raise exception 'Issue #97 route rebuild created a new resolved/unmapped blocker';
    end if;

    if exists(
      select 1
      from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
      join pg_temp.issue97_frozen_routes frozen
        on frozen.route_prep_id=receipt.route_prep_id
      where receipt.resolution_status='resolved'
        and (
          receipt.identity_id is null
          or receipt.source_identity_key is null
          or receipt.driver_road_name is null
          or receipt.source_digest is null
          or receipt.hold_reason is not null
          or receipt.resolved_at is null
          or receipt.resolution_method is null
          or receipt.resolution_method not in (
            'explicit_authoritative_source_receipt',
            'route_graph_unique_identity_path'
          )
          or (receipt.canonical_road_id is null and exists(
            select 1 from public.brinesearch_road_identity_mappings mapping
            where mapping.identity_id=receipt.identity_id
              and mapping.mapping_status='verified'
          ))
          or (receipt.canonical_road_id is not null and not exists(
            select 1 from public.brinesearch_road_identity_mappings mapping
            where mapping.identity_id=receipt.identity_id
              and mapping.road_id=receipt.canonical_road_id
              and mapping.mapping_status='verified'
          ))
        )
    ) then
      raise exception 'Issue #97 resolved target occurrence coherence failed';
    end if;

    if exists(
      select 1
      from private_verification.brinesearch_route_transition_receipts_issue97 receipt
      join pg_temp.issue97_frozen_routes frozen
        on frozen.route_prep_id=receipt.route_prep_id
      where receipt.updated_at<>v_transaction_time
         or (receipt.graph_build_id is not null and not exists(
           select 1
           from private_verification.brinesearch_issue97_state_candidate_manifest_members member
           where member.manifest_id=
             '1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid
             and (member.member_value->>'build_id')::uuid=receipt.graph_build_id
         ))
         or receipt.graph_build_id in (
           '24ffa531-0e69-4625-a137-da52020e6fd0'::uuid,
           '5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,
           'c9f50b03-4328-4d8b-9995-4dc8bc85dd01'::uuid,
           '84568854-3257-46b7-8581-374dc620ef16'::uuid,
           '542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid,
           'cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4'::uuid,
           'ab9f4083-d572-4d9d-8e0a-28ebb77517e7'::uuid,
           '70f30495-860a-4199-9360-8e880f3b515b'::uuid
         )
    ) then
      raise exception 'Issue #97 target transition used stale/non-manifest graph';
    end if;

    if exists(
      select 1
      from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
      join pg_temp.issue97_frozen_routes frozen
        on frozen.route_prep_id=geometry.route_prep_id
      left join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
        on occurrence.route_prep_step_id=geometry.route_prep_step_id
       and occurrence.route_prep_id=geometry.route_prep_id
      where geometry.updated_at<>v_transaction_time
         or occurrence.route_prep_step_id is null
         or (geometry.status='resolved' and (
           occurrence.resolution_status<>'resolved'
           or geometry.identity_id is distinct from occurrence.identity_id
           or geometry.road_id is distinct from occurrence.canonical_road_id
         ))
    ) then
      raise exception 'Issue #97 target geometry receipt consistency failed';
    end if;

    if (select count(*) from public.brinesearch_route_prep)<>1142
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         route.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(route)::text),
         '|' order by route.id
       ),'')) from public.brinesearch_route_prep route)
         <>'ad0f05a78c5076a6d8c9d82a1cd21445'
       or (select count(*) from public.brinesearch_route_prep_steps)<>4903
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         step.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(step)::text),
         '|' order by step.id
       ),'')) from public.brinesearch_route_prep_steps step)
         <>'2a918cb88cbbc9d120b4de29f326870a'
       or (select count(*) from public.brinesearch_pad_roads)<>23
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         pad_road.route_step_id::text||':'||
           pg_catalog.md5(pg_catalog.to_jsonb(pad_road)::text),
         '|' order by pad_road.route_step_id
       ),'')) from public.brinesearch_pad_roads pad_road)
         <>'b7ecec9d58ae5a06765486cf62919958'
       or (select count(*) from public.brinesearch_driver_google_routes_public)<>0
       or (select count(*)
         from private_verification.brinesearch_google_route_refresh_queue_issue97)<>0
       or public.brinesearch_issue97_cutover_active()
       or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         build.id::text||':'||build.state_code||':'||build.county_code||':'||
           build.status||':'||coalesce(build.activated_at::text,'')||':'||
           coalesce(build.graph_digest,'')||':'||build.details::text,
         '|' order by build.id
       ),'')) from public.brinesearch_road_graph_builds build
         where build.state_code in ('WV','PA'))
         <>'7776affed9bb9dd931aa86116e490a68'
       or exists(
         select 1 from pg_temp.issue97_guard_before guard
         where guard.pads_rows<>(select count(*) from public.pads)
            or guard.pads_digest<>(select pg_catalog.md5(coalesce(
              pg_catalog.string_agg(
                pad.id::text||':'||pg_catalog.md5(pg_catalog.to_jsonb(pad)::text),
                '|' order by pad.id
              ),'')) from public.pads pad)
            or guard.google_receipt_rows<>(select count(*)
              from private_verification.brinesearch_google_route_receipts_issue97)
            or guard.google_receipt_digest<>(select pg_catalog.md5(coalesce(
              pg_catalog.string_agg(
                receipt.pad_id::text||':'||
                  pg_catalog.md5(pg_catalog.to_jsonb(receipt)::text),
                '|' order by receipt.pad_id
              ),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt)
       ) then
      raise exception 'Issue #97 public/Google/pad/non-Ohio isolation changed';
    end if;
  end
  $issue97_route_rebuild_postcheck$;

  with target_metrics as (
    select
      (select count(*) from pg_temp.issue97_target_steps)::integer as step_count,
      (select pg_catalog.md5(pg_catalog.string_agg(
        route_prep_step_id::text,'|' order by route_prep_step_id
      )) from pg_temp.issue97_target_steps) as step_digest,
      (select count(*) from pg_temp.issue97_target_pads)::integer as pad_count,
      (select pg_catalog.md5(pg_catalog.string_agg(
        pad_id::text,'|' order by pad_id
      )) from pg_temp.issue97_target_pads) as pad_digest,
      (select count(*)
       from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
       join pg_temp.issue97_frozen_routes frozen
         on frozen.route_prep_id=receipt.route_prep_id)::integer
        as occurrence_receipts,
      (select count(*)
       from private_verification.brinesearch_route_transition_receipts_issue97 receipt
       join pg_temp.issue97_frozen_routes frozen
         on frozen.route_prep_id=receipt.route_prep_id)::integer
        as transition_receipts,
      (select count(*)
       from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt
       join pg_temp.issue97_frozen_routes frozen
         on frozen.route_prep_id=receipt.route_prep_id)::integer
        as geometry_receipts,
      (select count(*) filter(where receipt.route_status='route_ready')
       from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
       join pg_temp.issue97_frozen_routes frozen
         on frozen.route_prep_id=receipt.route_prep_id)::integer as route_ready,
      (select count(*) filter(where receipt.route_status='needs_review')
       from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
       join pg_temp.issue97_frozen_routes frozen
         on frozen.route_prep_id=receipt.route_prep_id)::integer as needs_review
  ), non_target as (
    select pg_catalog.md5(pg_catalog.string_agg(
      ordinal::text||':'||relation_name||':'||row_count::text||':'||row_digest,
      '|' order by ordinal
    )) as digest
    from pg_temp.issue97_non_target_after
  ), unmapped_before as (
    select count(*)::integer as receipt_count,
      count(distinct route_prep_id)::integer as route_count,
      count(distinct identity_id)::integer as identity_count,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        route_prep_id::text||':'||route_prep_step_id::text||':'||
          identity_id::text||':'||source_identity_key,
        '|' order by route_prep_id,route_prep_step_id
      ),'')) as receipt_digest
    from pg_temp.issue97_resolved_unmapped_before
  ), unmapped_after as (
    select count(*)::integer as receipt_count,
      count(distinct route_prep_id)::integer as route_count,
      count(distinct identity_id)::integer as identity_count,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        route_prep_id::text||':'||route_prep_step_id::text||':'||
          identity_id::text||':'||source_identity_key,
        '|' order by route_prep_id,route_prep_step_id
      ),'')) as receipt_digest
    from pg_temp.issue97_resolved_unmapped_after
  ), sequence_after as (
    select 1 as ordinal,
      'private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq'
        as sequence_name,last_value,is_called
    from private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq
    union all
    select 2,
      'private_verification.brinesearch_route_reconciliation_history_issue97_id_seq',
      last_value,is_called
    from private_verification.brinesearch_route_reconciliation_history_issue97_id_seq
    union all
    select 3,
      'private_verification.brinesearch_route_transition_history_issue97_id_seq',
      last_value,is_called
    from private_verification.brinesearch_route_transition_history_issue97_id_seq
    union all
    select 4,
      'private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq',
      last_value,is_called
    from private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq
  ), sequence_receipt as (
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'sequence_name',before.sequence_name,
      'before_last_value',before.last_value,
      'before_is_called',before.is_called,
      'after_last_value',after.last_value,
      'after_is_called',after.is_called
    ) order by before.ordinal) as body
    from pg_temp.issue97_history_sequence_before before
    join sequence_after after using(ordinal,sequence_name)
  )
  select 'ISSUE97_EXACT_412_ROUTE_REBUILD|'||
    pg_catalog.jsonb_build_object(
      'classification','FROZEN_WAVE_EXACT_412_ROUTE_REBUILD_COMPLETE',
      'contract_pass',1,'production_write',true,
      'manifest_id','1ef4015c-b1ae-45d2-8baa-86c47c561f54',
      'manifest_digest','77cb00cf83ad8bab4a45c9b552626f76',
      'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
      'route_count',412,
      'route_digest','711b1ddd3ba6c47e7642fc700197432f',
      'primary_routes',340,'alternate_routes',72,
      'target_step_count',target.step_count,
      'target_step_digest',target.step_digest,
      'target_pad_count',target.pad_count,
      'target_pad_digest',target.pad_digest,
      'occurrence_receipts',target.occurrence_receipts,
      'transition_receipts',target.transition_receipts,
      'geometry_receipts',target.geometry_receipts,
      'route_ready',target.route_ready,'needs_review',target.needs_review,
      'resolved_unmapped_before',unmapped_before.receipt_count,
      'resolved_unmapped_before_routes',unmapped_before.route_count,
      'resolved_unmapped_before_identities',unmapped_before.identity_count,
      'resolved_unmapped_before_digest',unmapped_before.receipt_digest,
      'resolved_unmapped_after',unmapped_after.receipt_count,
      'resolved_unmapped_after_routes',unmapped_after.route_count,
      'resolved_unmapped_after_identities',unmapped_after.identity_count,
      'resolved_unmapped_after_digest',unmapped_after.receipt_digest,
      'new_resolved_unmapped_blockers',0,
      'non_target_route_count',394,
      'non_target_private_state_digest',non_target.digest,
      'history_sequences',sequence_receipt.body,
      'queue',0,'public_google',0,'cutover',false,
      'private_google_refreshed',false,'public_google_projected',false
    )::text
  from target_metrics target cross join non_target
    cross join unmapped_before cross join unmapped_after
    cross join sequence_receipt;

  commit;
\else
  with target_metrics as (
    select
      count(*)::integer as step_count,
      pg_catalog.md5(pg_catalog.string_agg(
        route_prep_step_id::text,'|' order by route_prep_step_id
      )) as step_digest
    from pg_temp.issue97_target_steps
  ), pad_metrics as (
    select count(*)::integer as pad_count,
      pg_catalog.md5(pg_catalog.string_agg(
        pad_id::text,'|' order by pad_id
      )) as pad_digest
    from pg_temp.issue97_target_pads
  ), non_target as (
    select pg_catalog.md5(pg_catalog.string_agg(
      ordinal::text||':'||relation_name||':'||row_count::text||':'||row_digest,
      '|' order by ordinal
    )) as digest
    from pg_temp.issue97_non_target_before
  ), unmapped_before as (
    select count(*)::integer as receipt_count,
      count(distinct route_prep_id)::integer as route_count,
      count(distinct identity_id)::integer as identity_count,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        route_prep_id::text||':'||route_prep_step_id::text||':'||
          identity_id::text||':'||source_identity_key,
        '|' order by route_prep_id,route_prep_step_id
      ),'')) as receipt_digest
    from pg_temp.issue97_resolved_unmapped_before
  )
  select 'ISSUE97_EXACT_412_ROUTE_REBUILD|'||
    pg_catalog.jsonb_build_object(
      'classification','FROZEN_WAVE_EXACT_412_ROUTE_REBUILD_REHEARSAL_READY',
      'contract_pass',1,'production_write',false,
      'rollback_rehearsal',true,
      'mutating_functions_invoked',false,
      'sequence_advancement',false,
      'manifest_id','1ef4015c-b1ae-45d2-8baa-86c47c561f54',
      'manifest_digest','77cb00cf83ad8bab4a45c9b552626f76',
      'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
      'route_count',412,
      'route_digest','711b1ddd3ba6c47e7642fc700197432f',
      'primary_routes',340,'alternate_routes',72,
      'target_step_count',target.step_count,
      'target_step_digest',target.step_digest,
      'target_pad_count',pads.pad_count,
      'target_pad_digest',pads.pad_digest,
      'resolved_unmapped_before',unmapped_before.receipt_count,
      'resolved_unmapped_before_routes',unmapped_before.route_count,
      'resolved_unmapped_before_identities',unmapped_before.identity_count,
      'resolved_unmapped_before_digest',unmapped_before.receipt_digest,
      'non_target_route_count',394,
      'non_target_private_state_digest',non_target.digest,
      'queue',0,'public_google',0,'cutover',false
    )::text
  from target_metrics target cross join pad_metrics pads cross join non_target
    cross join unmapped_before;

  rollback;
\endif
