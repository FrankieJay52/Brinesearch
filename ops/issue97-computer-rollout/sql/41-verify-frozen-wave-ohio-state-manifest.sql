\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned
\timing on

-- Fixed postcommit verifier. It is observational and phase-specific: file 37
-- is intentionally pre-manifest-only and must not be reused after persistence.
begin isolation level repeatable read read only;
set local statement_timeout='15min';

with
expected(
  ordinal,member_kind,county_code,build_id,graph_digest,
  source_revision_digest,member_digest
) as (
  -- ISSUE97_FROZEN_MANIFEST_MEMBERS_BEGIN
  values
    (1,'retained','ATH','8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb'::uuid,'2080a5a06944f3d4842e31937748267f','4e955e0c8736f17dbd6ff79aa1c17e9d','9b7f9a9c682b51da132b927fba446429'),
    (2,'replacement','BEL','1c1320b3-4257-4239-9c55-b18a801aa97e'::uuid,'269e903e991f1790bf5d1428e4c2bb43','b20843ddf3d2a648b8d53a0b3eb1a1c2','d2897b014f14e74eda72c11d1cac5f21'),
    (3,'replacement','CAR','8e565c14-33a4-4862-9bf8-be9b5557b293'::uuid,'2943504592861b83abce581f29a1cacb','8405344f91e795398ab261a51f2a03bf','5cfeca8cfde72a71c70db7e0acaccf17'),
    (4,'replacement','COL','b86d14c7-5c8a-4cb9-8a3b-903965340678'::uuid,'6bd88992a7a63c9643d1a6f1535ca2af','44b4e720a523face3149d7dbdc8a298b','85b6c4c11c8e8bff38624a1af957346f'),
    (5,'retained','COS','7c979743-72e4-42a2-a6a9-006a369168c0'::uuid,'7791b63c7bcb5848200b5bc4cc970fb4','b9da0eb95ae5b4e03a0143484372b658','b4186d15df742d0fc8293dc806970350'),
    (6,'replacement','GUE','44245144-3e39-45fe-907b-95e2b01b9c32'::uuid,'d7a43bacbf54794d4e92d9e8ceca2e28','b0cc4e8e3aaa7121cc39cc7935189664','d6b0bd997ae6b615ac3062adb91d0e31'),
    (7,'replacement','HAS','0870470a-11f8-4f33-8af3-08d6849d5f34'::uuid,'fc53a1492a3eecab78a524dbadcddfe8','ece929162c9063ea35a6a276de59a940','38e64b032a5b6dda397adff52c2b0e84'),
    (8,'replacement','JEF','c9bac3a2-82d4-4b76-813c-6a29c1bf062a'::uuid,'ce2de7721f56a145b21ddded270f07fd','0d40dc262b0097cf48783f7271531153','fed45e0eb7e217338b2b0a8d0e9d09da'),
    (9,'retained','MAH','360472bf-cb96-4ba7-b2fe-efa04e230f69'::uuid,'4a80abcc01932b7a169189ec5f706cc4','79d1cd99ffcad7a04a06bd5ad7138417','b8f88d2df1a54a23bad6d77d68fdb5aa'),
    (10,'retained','MEG','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048'::uuid,'2fcf1a69c13907789a2f902574a35674','e90b8b30a449199a490fe85688670dfb','75886082576aece46f6da8bfe3512d78'),
    (11,'replacement','MOE','8493f66b-b3d2-4673-be8a-07b024b9723d'::uuid,'fafd62f37b76e57859164010d1be967b','5a82a31c86fdd78804bf113f73e49694','287992b389092b7611328b7cceb3d66b'),
    (12,'retained','MUS','98ae1835-1064-4c18-a8a7-9a9e570e212d'::uuid,'04a4c9d7a4274ac638cad78a406f76fa','0761cc66281b70da78dd0375ecb7cb86','d0a61a9e48eecf2bdd181af144c12278'),
    (13,'replacement','NOB','200d56dc-5b13-4f84-82cb-946b8ebeada2'::uuid,'576c5e1b1012fcb8020fa637fb272082','795f812c7a9042318196195cccccf3a4','33dc4563999762e315d87ebf29581c70'),
    (14,'retained','POR','c645a8bf-a920-432a-a341-a7b60d9cfd49'::uuid,'89513e609f359ad9064814ebbf074810','a86ed19837abdfa55047ddabbc60ffcc','f82c1db46f4f405610f4a7be525fd851'),
    (15,'retained','STA','67541fad-5cf2-4483-b0f6-f4060197fda9'::uuid,'67be9ebece47e78c4c7ccf29ea92786e','adaeac05c1e99de304b1c9a10ac83443','d0826c5f57a593105b3aa43215e33873'),
    (16,'retained','TRU','3c94b14c-9d9e-41ec-a897-b754dab6d8dd'::uuid,'2ff743a4c7f223a6821d3eaff7416d1d','60f07d2d3e4328c1f448c07aca49f4c8','c655a2dc29c81177694565dbc069f1a8'),
    (17,'retained','TUS','fd6fdfff-f23f-42cc-a633-64448bd9d044'::uuid,'b5d73c4e9a397596bbdc1dd0697a0b6d','810a6b9c9f96448c52c722fbba8c3996','8232b7174a6e40b383f08173a3a2e81e'),
    (18,'retained','VIN','785f5277-369c-4ae3-ba80-31411745e46d'::uuid,'551be5443af26c64d5ed5e92a58ee71b','c8962e1b5eec1d974533a973ca1f9362','7ae096daf0adf869efe405a5b5ae8530'),
    (19,'retained','WAS','90982f30-8a06-4a53-8b4b-9efd5d9042bf'::uuid,'6ccff50666a085a4387c20fb49f90a59','d372a68557e29d1ae871025c372eb785','d6de47b387317ed968b15c1f74d7429c')
  -- ISSUE97_FROZEN_MANIFEST_MEMBERS_END
),
old_affected(county_code,build_id,graph_digest,source_revision_digest) as (
  -- ISSUE97_FROZEN_MANIFEST_OLD_AFFECTED_BEGIN
  values
    ('BEL','24ffa531-0e69-4625-a137-da52020e6fd0'::uuid,'fc6dcbc8482b2e5c89f4069941c557de','81355d7958b89ffccd08a5f521730f8e'),
    ('CAR','5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,'e9f4ed56bb2b1308b8b9913a751c78f5','853c139290afee94e391fc0395d40fed'),
    ('COL','c9f50b03-4328-4d8b-9995-4dc8bc85dd01'::uuid,'c13278c74933205f5c55cdf85f23f27e','7f54d4a6e143c4006cb90b4b4fa0b67e'),
    ('GUE','84568854-3257-46b7-8581-374dc620ef16'::uuid,'b11b2f5ac3c1c5d492c2233494706f4c','b2bee82327b4ce24833fee33c4873238'),
    ('HAS','542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid,'1d8f6a52d2541e313932906f944b2f92','610d4d5fe3a19cd1d07e9fc3049b2785'),
    ('JEF','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4'::uuid,'06e8bd25f7fb46fe750214dd77e2b67d','03efea8f142bb29e5f27cb12bf84c49f'),
    ('MOE','ab9f4083-d572-4d9d-8e0a-28ebb77517e7'::uuid,'69010044273a611876c3a8ace7c198a2','0921c5ea8751f20f079ba1a776bc7c1e'),
    ('NOB','70f30495-860a-4199-9360-8e880f3b515b'::uuid,'eefc679ed36e6aba3a590c7ba2c9e541','89af7128d56bbc4ef3733436d0813823')
  -- ISSUE97_FROZEN_MANIFEST_OLD_AFFECTED_END
),
expected_members as materialized (
  select 'OH:'||county_code as member_key,
    pg_catalog.jsonb_build_object(
      'state_code','OH','county_code',county_code,'build_id',build_id,
      'graph_digest',graph_digest,'source_revision_digest',source_revision_digest,
      'generation_key','issue97-release-20260815-r2'
    ) as member_value,member_digest
  from expected
),
pinned_builds as (
  select member_kind as kind,county_code,build_id,graph_digest,
    source_revision_digest from expected
  union all
  select 'old_affected',county_code,build_id,graph_digest,source_revision_digest
  from old_affected
),
currentness_decision as materialized (
  select pin.*,
    case when pin.kind='old_affected'
      then private_verification.brinesearch_issue97_graph_build_sources_current(
        pin.build_id
      )
      else private_verification.brinesearch_issue97_graph_build_release_current(
        pin.build_id
      )
    end as decisive_current
  from pinned_builds pin
),
build_currentness as materialized (
  select decision.*,build.id as actual_id,build.status,build.activated_at,
    build.graph_digest as actual_graph_digest,
    build.source_revision_digest as actual_source_revision_digest,
    decision.decisive_current as sources_current,
    case when decision.kind='old_affected' then false
      else decision.decisive_current end as release_current
  from currentness_decision decision
  left join public.brinesearch_road_graph_builds build
    on build.id=decision.build_id and build.state_code='OH'
      and build.county_code=decision.county_code
),
replacement_state as (
  select count(*)=8 and pg_catalog.bool_and(coalesce(
    actual_id=build_id and actual_graph_digest=graph_digest
    and actual_source_revision_digest=source_revision_digest
    and status='validated' and activated_at is null
    and sources_current and release_current,false
  )) as exact
  from build_currentness where kind='replacement'
),
retained_state as (
  select count(*)=11 and pg_catalog.bool_and(coalesce(
    actual_id=build_id and actual_graph_digest=graph_digest
    and actual_source_revision_digest=source_revision_digest
    and status='active'
    and activated_at='2026-08-16 11:08:18.355674+00'::timestamptz
    and sources_current and release_current,false
  )) as exact
  from build_currentness where kind='retained'
),
old_state as (
  select count(*)=8 and pg_catalog.bool_and(coalesce(
    actual_id=build_id and actual_graph_digest=graph_digest
    and actual_source_revision_digest=source_revision_digest
    and status='active'
    and activated_at='2026-08-16 11:08:18.355674+00'::timestamptz
    and not sources_current and not release_current,false
  )) as exact
  from build_currentness where kind='old_affected'
),
retained_ohio_builds as materialized (
  select build.id as build_id,build.status
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
    and not exists(
      select 1 from pinned_builds pin where pin.build_id=retained.build_id
    )
),
currentness_universe_state as materialized (
  select
    (select count(*) from retained_ohio_builds)::integer as retained_rows,
    (select count(*) from retained_ohio_builds where status='active')::integer
      as active_rows,
    (select count(*) from retained_ohio_builds where status='validated')::integer
      as validated_rows,
    (select count(*) from unexpected_validated_currentness)::integer
      as unexpected_validated_rows,
    (select count(*) from unexpected_validated_currentness
      where release_current is not false)::integer as unexpected_not_false_rows
),
eligible_members as materialized (
  select 'OH:'||currentness.county_code as member_key,
    pg_catalog.jsonb_build_object(
      'state_code','OH','county_code',currentness.county_code,
      'build_id',currentness.build_id,'graph_digest',currentness.graph_digest,
      'source_revision_digest',currentness.source_revision_digest,
      'generation_key','issue97-release-20260815-r2'
    ) as member_value
  from build_currentness currentness
  where currentness.kind in ('replacement','retained')
    and currentness.release_current
),
active_expected as (
  select county_code,build_id,graph_digest from expected where member_kind='retained'
  union all
  select county_code,build_id,graph_digest from old_affected
),
active_state as materialized (
  select count(*)::integer as rows,
    not exists(
      (select county_code,build_id,graph_digest from active_expected
       except select county_code,id,graph_digest
       from public.brinesearch_road_graph_builds
       where state_code='OH' and status='active')
      union all
      (select county_code,id,graph_digest
       from public.brinesearch_road_graph_builds
       where state_code='OH' and status='active'
       except select county_code,build_id,graph_digest from active_expected)
    ) as exact
  from public.brinesearch_road_graph_builds
  where state_code='OH' and status='active'
),
active_counties_expected as (
  select county_code from expected
),
active_counties_actual as materialized (
  select county_code
  from public.brinesearch_road_graph_counties
  where active and state_code='OH'
),
active_counties_state as materialized (
  select
    (select count(*) from active_counties_expected)::integer as expected_rows,
    (select count(*) from active_counties_actual)::integer as actual_rows,
    not exists(
      (select county_code from active_counties_expected
       except select county_code from active_counties_actual)
      union all
      (select county_code from active_counties_actual
       except select county_code from active_counties_expected)
    ) as exact
),
release_generation_state as materialized (
  select count(*) filter(where generation.active)::integer as active_rows,
    count(*) filter(where generation.active
      and generation.generation_key='issue97-release-20260815-r2')::integer
      as exact_rows
  from private_verification.brinesearch_issue97_graph_release_generations generation
),
historical_manifest as materialized (
  select * from private_verification.brinesearch_issue97_state_candidate_manifests
  where id='c41f5320-1273-470c-a316-28b42211d697'::uuid
    and manifest_key='issue97-ohio-r2-final-candidate'
),
historical_members as materialized (
  select member.*
  from historical_manifest manifest
  join private_verification.brinesearch_issue97_state_candidate_manifest_members member
    on member.manifest_id=manifest.id
),
new_manifest as materialized (
  select * from private_verification.brinesearch_issue97_state_candidate_manifests
  where manifest_key='issue97-ohio-r3-frozen-wave-candidate'
),
new_members as materialized (
  select member.*
  from new_manifest manifest
  join private_verification.brinesearch_issue97_state_candidate_manifest_members member
    on member.manifest_id=manifest.id
),
source_scopes as materialized (
  select count(*)::integer as required,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer as current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code='OH'
),
function_expected(signature,definition_md5) as (
  values
    ('private_verification.brinesearch_issue97_graph_build_sources_current(uuid)','5653fb3e85b9a9962dbcc9f5af0329e7'),
    ('private_verification.brinesearch_issue97_graph_build_release_current(uuid)','6471a34ccf42d058b846776d23cb0216'),
    ('private_verification.brinesearch_issue97_current_state_candidate_members(text)','508fe45bbfa886beb892734a2c1284b8'),
    ('private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb)','4a0875ea950d93807180affc093a0448'),
    ('private_verification.brinesearch_issue97_reject_release_receipt_mutation()','efc91280ee792db0bedf6415a0b2fb3b'),
    ('private_verification.brinesearch_issue97_state_candidate_manifest_current(uuid)','0720949a9b7a08e741a07979d0dd02be'),
    ('private_verification.brinesearch_issue97_state_candidate_manifest_integrity(uuid)','75d25d5298c59869b656bb9db3cc3fe2')
),
function_state as materialized (
  select count(*)=7 and count(*) filter(where
    pg_catalog.to_regprocedure(signature) is not null
    and pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(signature)
    ))=definition_md5
  )=7 as exact
  from function_expected
),
table_state as materialized (
  select count(*)=2 and pg_catalog.bool_and(c.relrowsecurity and c.relforcerowsecurity)
    as exact
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private_verification'
    and c.relname in (
      'brinesearch_issue97_state_candidate_manifests',
      'brinesearch_issue97_state_candidate_manifest_members'
    )
),
trigger_expected(trigger_name,table_name) as (
  values
    ('brinesearch_issue97_state_candidate_manifest_immutable',
      'brinesearch_issue97_state_candidate_manifests'),
    ('brinesearch_issue97_state_candidate_manifest_member_immutable',
      'brinesearch_issue97_state_candidate_manifest_members')
),
trigger_state as materialized (
  select count(*)=2 and pg_catalog.bool_and(
    expected.trigger_name is not null
      and t.tgfoid=
        'private_verification.brinesearch_issue97_reject_release_receipt_mutation()'::pg_catalog.regprocedure
      and t.tgenabled='O' and t.tgtype=27
  ) as exact
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class relation on relation.oid=t.tgrelid
  join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  left join trigger_expected expected
    on expected.trigger_name=t.tgname and expected.table_name=relation.relname
  where not t.tgisinternal and namespace.nspname='private_verification'
    and relation.relname in (
      'brinesearch_issue97_state_candidate_manifests',
      'brinesearch_issue97_state_candidate_manifest_members'
    )
),
protected_state as materialized (
  select
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      build.id::text||':'||pg_catalog.to_jsonb(build)::text,
      '|' order by build.id
    ),'')) from public.brinesearch_road_graph_builds build) as graph_registry_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      mapping.id::text||':'||pg_catalog.to_jsonb(mapping)::text,
      '|' order by mapping.id
    ),'')) from public.brinesearch_road_identity_mappings mapping) as mapping_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      route.id::text||':'||pg_catalog.to_jsonb(route)::text,
      '|' order by route.id
    ),'')) from public.brinesearch_route_prep route) as route_digest,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      receipt.pad_id::text||':'||pg_catalog.to_jsonb(receipt)::text,
      '|' order by receipt.pad_id
    ),'')) from private_verification.brinesearch_google_route_receipts_issue97 receipt)
      as google_receipt_digest,
    (select count(*)::integer
      from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)
      as reconciliation_runs,
    (select count(*)::integer
      from private_verification.brinesearch_google_route_refresh_queue_issue97)
      as google_queue,
    (select count(*)::integer from public.brinesearch_driver_google_routes_public)
      as public_google,
    (select count(*)::integer from public.brinesearch_road_graph_builds
      where status='staging') as staging,
    public.brinesearch_issue97_cutover_active() as cutover,
    (select count(*)::integer from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and (
          coalesce(activity.application_name,'') ilike '%issue97%'
          or coalesce(activity.query,'') ilike '%issue97_frozen_exact_mapping_wave%'
          or coalesce(activity.query,'') ilike '%20260817193212%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_rebuild_county_graph%'
          or coalesce(activity.query,'') ilike '%brinesearch_issue97_activate_graph_build%'
        )) as competing_backends,
    pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
    ) as mapping_lock_available
),
non_ohio_state as materialized (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||
      build.details::text,'|' order by build.id
  ),'')) as graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
  ))) as route_digest
  from public.brinesearch_road_graph_builds build
  where build.state_code in ('WV','PA')
),
manifest_state as materialized (
  select
    (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)=2
    and (select count(*) from historical_manifest)=1
    and (select count(*) from historical_members)=19
    and coalesce((select
      state_code='OH' and generation_key='issue97-release-20260815-r2'
      and git_sha='e59f8580787bfa05a9f5c05bd3584197ac84444d'
      and member_count=19 and manifest_digest='9763dc5bb626da71881b7381ed28a436'
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(id)
      from historical_manifest),false)
    and exists(
      (select member_key,member_value from historical_members
       except select member_key,member_value from eligible_members)
      union all
      (select member_key,member_value from eligible_members
       except select member_key,member_value from historical_members)
    )
    and (select count(*) from new_manifest)=1
    and (select count(*) from new_members)=19
    and coalesce((select
      state_code='OH' and generation_key='issue97-release-20260815-r2'
      and git_sha='1f49bcb8edfdc386105fe84727fd53448c277d37'
      and member_count=19 and manifest_digest='77cb00cf83ad8bab4a45c9b552626f76'
      and review_details->>'repository_pin_checkpoint_id'='5378340646'
      and pg_catalog.jsonb_object_length(review_details)=31
      and review_details->>'reviewed_by'=
        'Codex sole writer under repository-owner production-manifest authorization'
      and nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null
      and review_details->>'evidence'=
        'Issue #97 repository-pin checkpoint 5378340646 at 1f49bcb8edfdc386105fe84727fd53448c277d37'
      and review_details->>'repository_pin_git_sha'='1f49bcb8edfdc386105fe84727fd53448c277d37'
      and review_details->>'repository_pin_tree'='3014f559859d4980493fac5fca5c09eb458309c4'
      and review_details->>'whole_state_gate'='37-frozen-mapping-wave-production-pins.sql'
      and review_details->>'candidate_set_digest'='c3f925954d41cb6fbd5939eca5de3288'
      and review_details->>'manifest_digest'='77cb00cf83ad8bab4a45c9b552626f76'
      and review_details->>'candidate_count'='8'
      and review_details->>'retained_count'='11'
      and review_details->>'member_count'='19'
      and review_details->>'route_count'='412'
      and review_details->>'route_set_digest'='711b1ddd3ba6c47e7642fc700197432f'
      and review_details->>'google_pad_count'='9'
      and review_details->>'google_pad_digest'='450948793c57a9a1535139fac4974792'
      and review_details->>'google_tuple_digest'='5a75e5c4c34805b7dc2fdf8d0534a4f6'
      and review_details->>'historical_manifest_id'='c41f5320-1273-470c-a316-28b42211d697'
      and review_details->>'historical_manifest_digest'='9763dc5bb626da71881b7381ed28a436'
      and review_details->>'activation_authorized'='false'
      and review_details->>'activation_impact_reviewed'='false'
      and review_details->>'route_reconciliation_authorized'='false'
      and review_details->>'private_google_refresh_authorized'='false'
      and review_details->>'public_google_authorized'='false'
      and review_details->>'global_cutover_authorized'='false'
      and review_details->>'graph_registry_digest'=protected.graph_registry_digest
      and review_details->>'mapping_digest'=protected.mapping_digest
      and review_details->>'route_state_digest'=protected.route_digest
      and review_details->>'google_receipt_digest'=protected.google_receipt_digest
      and review_details->>'non_ohio_graph_digest'=non_ohio.graph_digest
      and review_details->>'non_ohio_route_digest'=non_ohio.route_digest
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(id)
      from new_manifest),false)
    and not exists(
      (select member_key,member_value,member_digest from expected_members
       except select member_key,member_value,member_digest from new_members)
      union all
      (select member_key,member_value,member_digest from new_members
       except select member_key,member_value,member_digest from expected_members)
    )
    and not exists(
      (select member_key,member_value from eligible_members
       except select member_key,member_value from new_members)
      union all
      (select member_key,member_value from new_members
       except select member_key,member_value from eligible_members)
    ) as exact
  from protected_state protected cross join non_ohio_state non_ohio
),
checks as materialized (
  select
    function_state.exact as functions_ok,
    table_state.exact and trigger_state.exact
      and pg_catalog.current_setting('session_replication_role')='origin'
      as storage_guards_ok,
    replacement_state.exact as replacements_ok,
    retained_state.exact as retained_ok,
    old_state.exact as old_ok,
    currentness.retained_rows=35 and currentness.active_rows=19
      and currentness.validated_rows=16
      and currentness.unexpected_validated_rows=8
      and currentness.unexpected_not_false_rows=0
      as currentness_universe_ok,
    active_state.rows=19 and active_state.exact as active_boundary_ok,
    active_counties.expected_rows=19 and active_counties.actual_rows=19
      and active_counties.exact as active_counties_ok,
    release_generation.active_rows=1 and release_generation.exact_rows=1
      as release_generation_ok,
    source_scopes.required=38 and source_scopes.current=38 as sources_ok,
    manifest_state.exact as manifests_ok,
    non_ohio.graph_digest='7776affed9bb9dd931aa86116e490a68'
      and non_ohio.route_digest='fd0a1f874a042ac532d3057ef0bedafb'
      as non_ohio_ok,
    protected.reconciliation_runs=0 and protected.google_queue=0
      and protected.public_google=0 and protected.staging=0
      and not protected.cutover and protected.competing_backends=0
      and protected.mapping_lock_available
      as isolation_ok
  from function_state cross join table_state cross join trigger_state
  cross join replacement_state cross join retained_state
  cross join old_state cross join currentness_universe_state currentness
  cross join active_state cross join active_counties_state active_counties
  cross join release_generation_state release_generation cross join source_scopes
  cross join manifest_state cross join non_ohio_state non_ohio
  cross join protected_state protected
),
failures as materialized (
  select pg_catalog.concat_ws(',',
    case when not coalesce(functions_ok,false) then 'functions_ok' end,
    case when not coalesce(storage_guards_ok,false) then 'storage_guards_ok' end,
    case when not coalesce(replacements_ok,false) then 'replacements_ok' end,
    case when not coalesce(retained_ok,false) then 'retained_ok' end,
    case when not coalesce(old_ok,false) then 'old_ok' end,
    case when not coalesce(currentness_universe_ok,false)
      then 'currentness_universe_ok' end,
    case when not coalesce(active_boundary_ok,false) then 'active_boundary_ok' end,
    case when not coalesce(active_counties_ok,false) then 'active_counties_ok' end,
    case when not coalesce(release_generation_ok,false) then 'release_generation_ok' end,
    case when not coalesce(sources_ok,false) then 'sources_ok' end,
    case when not coalesce(manifests_ok,false) then 'manifests_ok' end,
    case when not coalesce(non_ohio_ok,false) then 'non_ohio_ok' end,
    case when not coalesce(isolation_ok,false) then 'isolation_ok' end
  ) as labels
  from checks
),
gate as materialized (
  select checks.*,
    case when failures.labels='' then 1
      else ('ISSUE97_MANIFEST_VERIFY_FAILURE|'||failures.labels)::integer end
      as contract_pass
  from checks cross join failures
),
receipt as materialized (
  select pg_catalog.jsonb_build_object(
    'classification','FROZEN_WAVE_SUCCESSOR_MANIFEST_COMMITTED',
    'contract_pass',gate.contract_pass,
    'manifest_key','issue97-ohio-r3-frozen-wave-candidate',
    'manifest_id',manifest.id,'manifest_digest',manifest.manifest_digest,
    'git_sha',manifest.git_sha,'generation_key',manifest.generation_key,
    'member_count',manifest.member_count,'candidate_count',8,'retained_count',11,
    'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
    'active_ohio',19,'validated_candidates',8,'old_active_stale',8,
    'currentness_builds_evaluated_once',27,
    'unexpected_validated_evaluated_once',8,
    'source_scopes',38,'reconciliation_runs',0,'google_queue',0,
    'public_google',0,'cutover',false,
    'activation_authorized',false,'route_reconciliation_authorized',false,
    'private_google_refresh_authorized',false,'global_cutover_authorized',false
  ) as body
  from gate left join new_manifest manifest on true
)
select 'ISSUE97_FROZEN_WAVE_OHIO_MANIFEST_VERIFY|'||body::text
from receipt;

rollback;
