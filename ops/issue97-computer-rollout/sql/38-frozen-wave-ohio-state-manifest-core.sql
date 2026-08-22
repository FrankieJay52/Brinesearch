\set ON_ERROR_STOP on
\pset pager off
\timing on

-- GitHub Issue #97 -- successor Ohio frozen-wave manifest core.
--
-- This file is intentionally transaction-neutral: it contains neither BEGIN,
-- COMMIT, nor ROLLBACK. It refuses to run unless a fixed wrapper has opened a
-- SERIALIZABLE read-write transaction and installed the exact SET LOCAL token.
-- Files 39 and 40 own the rollback-rehearsal and permanent-commit boundaries.

select
  coalesce(pg_catalog.current_setting(
    'brinesearch.issue97_frozen_wave_manifest_transaction',true
  ),'')='issue97-ohio-r3-frozen-wave-manifest-v1'
  and pg_catalog.current_setting('transaction_isolation')='serializable'
  and pg_catalog.current_setting('transaction_read_only')='off'
  as wrapper_exact
\gset issue97_frozen_manifest_wrapper_

\if :issue97_frozen_manifest_wrapper_wrapper_exact
\else
  do $fail$ begin
    raise exception 'Issue #97 frozen-wave manifest core requires its exact SERIALIZABLE transaction wrapper';
  end $fail$;
\endif

set local statement_timeout='15min';
set local lock_timeout='2min';
set local idle_in_transaction_session_timeout='20min';

create temporary table issue97_frozen_manifest_pins(
  ordinal integer primary key,
  member_kind text not null check(member_kind in ('replacement','retained')),
  county_code text not null unique,
  build_id uuid not null unique,
  graph_digest text not null,
  source_revision_digest text not null,
  member_digest text not null
) on commit drop;

-- ISSUE97_FROZEN_MANIFEST_MEMBERS_BEGIN
insert into issue97_frozen_manifest_pins values
  (1,'retained','ATH','8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb','2080a5a06944f3d4842e31937748267f','4e955e0c8736f17dbd6ff79aa1c17e9d','9b7f9a9c682b51da132b927fba446429'),
  (2,'replacement','BEL','1c1320b3-4257-4239-9c55-b18a801aa97e','269e903e991f1790bf5d1428e4c2bb43','b20843ddf3d2a648b8d53a0b3eb1a1c2','d2897b014f14e74eda72c11d1cac5f21'),
  (3,'replacement','CAR','8e565c14-33a4-4862-9bf8-be9b5557b293','2943504592861b83abce581f29a1cacb','8405344f91e795398ab261a51f2a03bf','5cfeca8cfde72a71c70db7e0acaccf17'),
  (4,'replacement','COL','b86d14c7-5c8a-4cb9-8a3b-903965340678','6bd88992a7a63c9643d1a6f1535ca2af','44b4e720a523face3149d7dbdc8a298b','85b6c4c11c8e8bff38624a1af957346f'),
  (5,'retained','COS','7c979743-72e4-42a2-a6a9-006a369168c0','7791b63c7bcb5848200b5bc4cc970fb4','b9da0eb95ae5b4e03a0143484372b658','b4186d15df742d0fc8293dc806970350'),
  (6,'replacement','GUE','44245144-3e39-45fe-907b-95e2b01b9c32','d7a43bacbf54794d4e92d9e8ceca2e28','b0cc4e8e3aaa7121cc39cc7935189664','d6b0bd997ae6b615ac3062adb91d0e31'),
  (7,'replacement','HAS','0870470a-11f8-4f33-8af3-08d6849d5f34','fc53a1492a3eecab78a524dbadcddfe8','ece929162c9063ea35a6a276de59a940','38e64b032a5b6dda397adff52c2b0e84'),
  (8,'replacement','JEF','c9bac3a2-82d4-4b76-813c-6a29c1bf062a','ce2de7721f56a145b21ddded270f07fd','0d40dc262b0097cf48783f7271531153','fed45e0eb7e217338b2b0a8d0e9d09da'),
  (9,'retained','MAH','360472bf-cb96-4ba7-b2fe-efa04e230f69','4a80abcc01932b7a169189ec5f706cc4','79d1cd99ffcad7a04a06bd5ad7138417','b8f88d2df1a54a23bad6d77d68fdb5aa'),
  (10,'retained','MEG','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048','2fcf1a69c13907789a2f902574a35674','e90b8b30a449199a490fe85688670dfb','75886082576aece46f6da8bfe3512d78'),
  (11,'replacement','MOE','8493f66b-b3d2-4673-be8a-07b024b9723d','fafd62f37b76e57859164010d1be967b','5a82a31c86fdd78804bf113f73e49694','287992b389092b7611328b7cceb3d66b'),
  (12,'retained','MUS','98ae1835-1064-4c18-a8a7-9a9e570e212d','04a4c9d7a4274ac638cad78a406f76fa','0761cc66281b70da78dd0375ecb7cb86','d0a61a9e48eecf2bdd181af144c12278'),
  (13,'replacement','NOB','200d56dc-5b13-4f84-82cb-946b8ebeada2','576c5e1b1012fcb8020fa637fb272082','795f812c7a9042318196195cccccf3a4','33dc4563999762e315d87ebf29581c70'),
  (14,'retained','POR','c645a8bf-a920-432a-a341-a7b60d9cfd49','89513e609f359ad9064814ebbf074810','a86ed19837abdfa55047ddabbc60ffcc','f82c1db46f4f405610f4a7be525fd851'),
  (15,'retained','STA','67541fad-5cf2-4483-b0f6-f4060197fda9','67be9ebece47e78c4c7ccf29ea92786e','adaeac05c1e99de304b1c9a10ac83443','d0826c5f57a593105b3aa43215e33873'),
  (16,'retained','TRU','3c94b14c-9d9e-41ec-a897-b754dab6d8dd','2ff743a4c7f223a6821d3eaff7416d1d','60f07d2d3e4328c1f448c07aca49f4c8','c655a2dc29c81177694565dbc069f1a8'),
  (17,'retained','TUS','fd6fdfff-f23f-42cc-a633-64448bd9d044','b5d73c4e9a397596bbdc1dd0697a0b6d','810a6b9c9f96448c52c722fbba8c3996','8232b7174a6e40b383f08173a3a2e81e'),
  (18,'retained','VIN','785f5277-369c-4ae3-ba80-31411745e46d','551be5443af26c64d5ed5e92a58ee71b','c8962e1b5eec1d974533a973ca1f9362','7ae096daf0adf869efe405a5b5ae8530'),
  (19,'retained','WAS','90982f30-8a06-4a53-8b4b-9efd5d9042bf','6ccff50666a085a4387c20fb49f90a59','d372a68557e29d1ae871025c372eb785','d6de47b387317ed968b15c1f74d7429c');
-- ISSUE97_FROZEN_MANIFEST_MEMBERS_END

create temporary table issue97_frozen_manifest_members on commit drop as
select pin.ordinal,pin.member_kind,pin.county_code,pin.build_id,
  pin.graph_digest,pin.source_revision_digest,pin.member_digest,
  'OH:'||pin.county_code as member_key,
  pg_catalog.jsonb_build_object(
    'state_code','OH','county_code',pin.county_code,'build_id',pin.build_id,
    'graph_digest',pin.graph_digest,
    'source_revision_digest',pin.source_revision_digest,
    'generation_key','issue97-release-20260815-r2'
  ) as member_value
from issue97_frozen_manifest_pins pin;

select count(*)=19
  and count(*) filter(where member_kind='replacement')=8
  and count(*) filter(where member_kind='retained')=11
  and count(distinct county_code)=19
  and count(distinct build_id)=19
  and pg_catalog.md5(pg_catalog.string_agg(
    member_key||':'||member_value::text,'|' order by member_key
  ))='77cb00cf83ad8bab4a45c9b552626f76'
  and pg_catalog.bool_and(
    pg_catalog.md5(member_key||':'||member_value::text)=member_digest
  ) as literal_contract_exact
from issue97_frozen_manifest_members
\gset issue97_frozen_manifest_literals_

\if :issue97_frozen_manifest_literals_literal_contract_exact
\else
  do $fail$ begin
    raise exception 'Issue #97 successor manifest literal digest contract failed';
  end $fail$;
\endif

-- Freeze the complete state in the installed graph lock order: state release,
-- every county graph scope, every required ingest scope, mapping, then saved
-- road reconciliation. Mapping also serializes private Google and cutover paths.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
);

do $issue97_frozen_manifest_graph_locks$
declare lock_row record;
begin
  for lock_row in
    select county_code from issue97_frozen_manifest_pins order by ordinal
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:graph:OH:'||lock_row.county_code
    ));
  end loop;
end
$issue97_frozen_manifest_graph_locks$;

do $issue97_frozen_manifest_ingest_locks$
declare lock_row record;
begin
  for lock_row in
    select distinct lock_scope.dataset_id,lock_scope.state_code,lock_scope.county_code
    from (
      select scope.dataset_id::text,scope.state_code,scope.county_code
      from public.brinesearch_road_source_dataset_counties scope
      join public.brinesearch_road_source_datasets dataset
        on dataset.id=scope.dataset_id and dataset.active
      where scope.active and scope.ingest_enabled and scope.required_for_graph
        and scope.state_code='OH'
      union
      select source_entry.value->>'dataset_id',source_entry.value->>'state_code',
        source_entry.value->>'county_code'
      from issue97_frozen_manifest_pins pin
      join public.brinesearch_road_graph_builds build on build.id=pin.build_id
      cross join lateral pg_catalog.jsonb_array_elements(
        coalesce(build.details->'source_run_vector','[]'::jsonb)
      ) source_entry(value)
    ) lock_scope
    order by lock_scope.dataset_id,lock_scope.state_code,lock_scope.county_code
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
      'brinesearch:issue97:ingest:'||lock_row.dataset_id::text||':'||
        lock_row.county_code
    ));
  end loop;
end
$issue97_frozen_manifest_ingest_locks$;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
);

-- Exact post-install/pre-activation authority, re-evaluated under the locks and
-- in the same SERIALIZABLE snapshot that will own the manifest insertion.
\ir 37-frozen-mapping-wave-production-pins.sql

with expected(signature,definition_md5) as (
  values
    ('private_verification.brinesearch_issue97_graph_build_sources_current(uuid)','5653fb3e85b9a9962dbcc9f5af0329e7'),
    ('private_verification.brinesearch_issue97_graph_build_release_current(uuid)','6471a34ccf42d058b846776d23cb0216'),
    ('private_verification.brinesearch_issue97_current_state_candidate_members(text)','508fe45bbfa886beb892734a2c1284b8'),
    ('private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb)','4a0875ea950d93807180affc093a0448'),
    ('private_verification.brinesearch_issue97_reject_release_receipt_mutation()','efc91280ee792db0bedf6415a0b2fb3b'),
    ('private_verification.brinesearch_issue97_state_candidate_manifest_current(uuid)','0720949a9b7a08e741a07979d0dd02be'),
    ('private_verification.brinesearch_issue97_state_candidate_manifest_integrity(uuid)','75d25d5298c59869b656bb9db3cc3fe2')
), function_state as (
  select count(*)=7
    and count(*) filter(where pg_catalog.to_regprocedure(signature) is not null)=7
    and count(*) filter(where pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(signature)
    ))=definition_md5)=7 as exact
  from expected
), table_state as (
  select count(*)=2 and pg_catalog.bool_and(c.relrowsecurity and c.relforcerowsecurity)
    as exact
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private_verification'
    and c.relname in (
      'brinesearch_issue97_state_candidate_manifests',
      'brinesearch_issue97_state_candidate_manifest_members'
    )
), trigger_expected(trigger_name,table_name) as (
  values
    ('brinesearch_issue97_state_candidate_manifest_immutable',
      'brinesearch_issue97_state_candidate_manifests'),
    ('brinesearch_issue97_state_candidate_manifest_member_immutable',
      'brinesearch_issue97_state_candidate_manifest_members')
), trigger_state as (
  select count(*)=2 and pg_catalog.bool_and(
    expected.trigger_name is not null
      and t.tgfoid=
        'private_verification.brinesearch_issue97_reject_release_receipt_mutation()'::pg_catalog.regprocedure
      and t.tgenabled='O' and t.tgtype=27
  ) as exact
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  left join trigger_expected expected
    on expected.trigger_name=t.tgname and expected.table_name=c.relname
  where not t.tgisinternal and n.nspname='private_verification'
    and c.relname in (
      'brinesearch_issue97_state_candidate_manifests',
      'brinesearch_issue97_state_candidate_manifest_members'
    )
), manifest_state as (
  select
    (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)=1
    and (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests
      where id='c41f5320-1273-470c-a316-28b42211d697'::uuid
        and state_code='OH'
        and manifest_key='issue97-ohio-r2-final-candidate'
        and generation_key='issue97-release-20260815-r2'
        and git_sha='e59f8580787bfa05a9f5c05bd3584197ac84444d'
        and member_count=19
        and manifest_digest='9763dc5bb626da71881b7381ed28a436'
        and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(id)
    )=1
    and not exists(
      select 1 from private_verification.brinesearch_issue97_state_candidate_manifests
      where manifest_key='issue97-ohio-r3-frozen-wave-candidate'
         or manifest_digest='77cb00cf83ad8bab4a45c9b552626f76'
    ) as exact
)
select function_state.exact and table_state.exact and trigger_state.exact
  and manifest_state.exact
  and pg_catalog.current_setting('session_replication_role')='origin'
  as preflight_exact
from function_state cross join table_state cross join trigger_state
cross join manifest_state
\gset issue97_frozen_manifest_preflight_

\if :issue97_frozen_manifest_preflight_preflight_exact
\else
  do $fail$ begin
    raise exception 'Issue #97 successor manifest function/table/trigger/prestate gate failed';
  end $fail$;
\endif

create temporary table issue97_frozen_manifest_prestate on commit drop as
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
  public.brinesearch_issue97_cutover_active() as cutover,
  '7776affed9bb9dd931aa86116e490a68'::text as non_ohio_graph_digest,
  'fd0a1f874a042ac532d3057ef0bedafb'::text as non_ohio_route_digest;

create temporary table issue97_frozen_manifest_receipt on commit drop as
select private_verification.brinesearch_issue97_persist_state_candidate_manifest(
  'OH',
  'issue97-ohio-r3-frozen-wave-candidate',
  '1f49bcb8edfdc386105fe84727fd53448c277d37',
  pg_catalog.jsonb_build_object(
    'reviewed_by','Codex sole writer under repository-owner production-manifest authorization',
    'reviewed_at',pg_catalog.clock_timestamp(),
    'evidence','Issue #97 repository-pin checkpoint 5378340646 at 1f49bcb8edfdc386105fe84727fd53448c277d37',
    'repository_pin_checkpoint_id',5378340646,
    'repository_pin_git_sha','1f49bcb8edfdc386105fe84727fd53448c277d37',
    'repository_pin_tree','3014f559859d4980493fac5fca5c09eb458309c4',
    'whole_state_gate','37-frozen-mapping-wave-production-pins.sql',
    'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
    'manifest_digest','77cb00cf83ad8bab4a45c9b552626f76',
    'candidate_count',8,'retained_count',11,'member_count',19,
    'route_count',412,'route_set_digest','711b1ddd3ba6c47e7642fc700197432f',
    'google_pad_count',9,'google_pad_digest','450948793c57a9a1535139fac4974792',
    'google_tuple_digest','5a75e5c4c34805b7dc2fdf8d0534a4f6',
    'historical_manifest_id','c41f5320-1273-470c-a316-28b42211d697',
    'historical_manifest_digest','9763dc5bb626da71881b7381ed28a436',
    'graph_registry_digest',pre.graph_registry_digest,
    'mapping_digest',pre.mapping_digest,'route_state_digest',pre.route_digest,
    'google_receipt_digest',pre.google_receipt_digest,
    'non_ohio_graph_digest',pre.non_ohio_graph_digest,
    'non_ohio_route_digest',pre.non_ohio_route_digest,
    'activation_authorized',false,'activation_impact_reviewed',false,
    'route_reconciliation_authorized',false,
    'private_google_refresh_authorized',false,
    'public_google_authorized',false,'global_cutover_authorized',false
  )
) as receipt
from issue97_frozen_manifest_prestate pre;

with new_manifest as materialized (
  select manifest.*
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.manifest_key='issue97-ohio-r3-frozen-wave-candidate'
), new_members as materialized (
  select member.*
  from new_manifest manifest
  join private_verification.brinesearch_issue97_state_candidate_manifest_members member
    on member.manifest_id=manifest.id
), post_state as materialized (
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
    public.brinesearch_issue97_cutover_active() as cutover
), checks as materialized (
  select
    (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)=2
    and (select count(*) from new_manifest)=1
    and (select count(*) from new_members)=19
    and coalesce((select
      state_code='OH'
      and generation_key='issue97-release-20260815-r2'
      and git_sha='1f49bcb8edfdc386105fe84727fd53448c277d37'
      and member_count=19
      and manifest_digest='77cb00cf83ad8bab4a45c9b552626f76'
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
      and review_details->>'graph_registry_digest'=pre.graph_registry_digest
      and review_details->>'mapping_digest'=pre.mapping_digest
      and review_details->>'route_state_digest'=pre.route_digest
      and review_details->>'google_receipt_digest'=pre.google_receipt_digest
      and review_details->>'non_ohio_graph_digest'=pre.non_ohio_graph_digest
      and review_details->>'non_ohio_route_digest'=pre.non_ohio_route_digest
      and review_details->>'activation_authorized'='false'
      and review_details->>'activation_impact_reviewed'='false'
      and review_details->>'route_reconciliation_authorized'='false'
      and review_details->>'private_google_refresh_authorized'='false'
      and review_details->>'public_google_authorized'='false'
      and review_details->>'global_cutover_authorized'='false'
      and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(id)
      from new_manifest),false)
    and not exists(
      (select member_key,member_value,member_digest from issue97_frozen_manifest_members
       except select member_key,member_value,member_digest from new_members)
      union all
      (select member_key,member_value,member_digest from new_members
       except select member_key,member_value,member_digest from issue97_frozen_manifest_members)
    )
    and coalesce((select
      receipt->>'manifest_id'=(select id::text from new_manifest)
      and receipt->>'manifest_digest'='77cb00cf83ad8bab4a45c9b552626f76'
      and (receipt->>'member_count')::integer=19
      and receipt->>'state_code'='OH'
      and (receipt->>'global_cutover_authorized')::boolean=false
      from issue97_frozen_manifest_receipt),false)
    and (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests
      where id='c41f5320-1273-470c-a316-28b42211d697'::uuid
        and state_code='OH'
        and manifest_key='issue97-ohio-r2-final-candidate'
        and generation_key='issue97-release-20260815-r2'
        and git_sha='e59f8580787bfa05a9f5c05bd3584197ac84444d'
        and manifest_digest='9763dc5bb626da71881b7381ed28a436'
        and member_count=19
        and private_verification.brinesearch_issue97_state_candidate_manifest_integrity(id))=1
    and pre.graph_registry_digest=post.graph_registry_digest
    and pre.mapping_digest=post.mapping_digest
    and pre.route_digest=post.route_digest
    and pre.google_receipt_digest=post.google_receipt_digest
    and pre.reconciliation_runs=0 and post.reconciliation_runs=0
    and pre.google_queue=0 and post.google_queue=0
    and pre.public_google=0 and post.public_google=0
    and not pre.cutover and not post.cutover
    as pass
  from issue97_frozen_manifest_prestate pre cross join post_state post
)
select pass as manifest_persisted_exactly from checks
\gset issue97_frozen_manifest_post_

\if :issue97_frozen_manifest_post_manifest_persisted_exactly
\else
  do $fail$ begin
    raise exception 'Issue #97 successor manifest post-insert exactness gate failed';
  end $fail$;
\endif

select 'ISSUE97_FROZEN_WAVE_OHIO_MANIFEST|'||pg_catalog.jsonb_build_object(
  'classification','SUCCESSOR_MANIFEST_PENDING_TRANSACTION_END',
  'manifest_key','issue97-ohio-r3-frozen-wave-candidate',
  'manifest_id',manifest.id,'manifest_digest',manifest.manifest_digest,
  'git_sha',manifest.git_sha,'generation_key',manifest.generation_key,
  'member_count',manifest.member_count,'candidate_count',8,'retained_count',11,
  'candidate_set_digest','c3f925954d41cb6fbd5939eca5de3288',
  'activation_authorized',false,'route_reconciliation_authorized',false,
  'private_google_refresh_authorized',false,'public_google_authorized',false,
  'global_cutover_authorized',false
)::text
from private_verification.brinesearch_issue97_state_candidate_manifests manifest
where manifest.manifest_key='issue97-ohio-r3-frozen-wave-candidate';
