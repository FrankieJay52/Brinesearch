\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Fixed, observational post-activation receipt. It cannot activate, reconcile,
-- cut over, publish or select a caller-provided scope.
begin isolation level repeatable read read only;
set local statement_timeout='15min';

with expected(county_code,build_id,graph_digest) as (
  values
    ('ATH','8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb'::uuid,'2080a5a06944f3d4842e31937748267f'),
    ('BEL','24ffa531-0e69-4625-a137-da52020e6fd0'::uuid,'fc6dcbc8482b2e5c89f4069941c557de'),
    ('CAR','5ee5f97b-447f-41d3-946a-68a8b28d8367'::uuid,'e9f4ed56bb2b1308b8b9913a751c78f5'),
    ('COL','c9f50b03-4328-4d8b-9995-4dc8bc85dd01'::uuid,'c13278c74933205f5c55cdf85f23f27e'),
    ('COS','7c979743-72e4-42a2-a6a9-006a369168c0'::uuid,'7791b63c7bcb5848200b5bc4cc970fb4'),
    ('GUE','84568854-3257-46b7-8581-374dc620ef16'::uuid,'b11b2f5ac3c1c5d492c2233494706f4c'),
    ('HAS','542c35d5-a9ba-4b43-8a64-63a66f6b29e2'::uuid,'1d8f6a52d2541e313932906f944b2f92'),
    ('JEF','cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4'::uuid,'06e8bd25f7fb46fe750214dd77e2b67d'),
    ('MAH','360472bf-cb96-4ba7-b2fe-efa04e230f69'::uuid,'4a80abcc01932b7a169189ec5f706cc4'),
    ('MEG','e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048'::uuid,'2fcf1a69c13907789a2f902574a35674'),
    ('MOE','ab9f4083-d572-4d9d-8e0a-28ebb77517e7'::uuid,'69010044273a611876c3a8ace7c198a2'),
    ('MUS','98ae1835-1064-4c18-a8a7-9a9e570e212d'::uuid,'04a4c9d7a4274ac638cad78a406f76fa'),
    ('NOB','70f30495-860a-4199-9360-8e880f3b515b'::uuid,'eefc679ed36e6aba3a590c7ba2c9e541'),
    ('POR','c645a8bf-a920-432a-a341-a7b60d9cfd49'::uuid,'89513e609f359ad9064814ebbf074810'),
    ('STA','67541fad-5cf2-4483-b0f6-f4060197fda9'::uuid,'67be9ebece47e78c4c7ccf29ea92786e'),
    ('TRU','3c94b14c-9d9e-41ec-a897-b754dab6d8dd'::uuid,'2ff743a4c7f223a6821d3eaff7416d1d'),
    ('TUS','fd6fdfff-f23f-42cc-a633-64448bd9d044'::uuid,'b5d73c4e9a397596bbdc1dd0697a0b6d'),
    ('VIN','785f5277-369c-4ae3-ba80-31411745e46d'::uuid,'551be5443af26c64d5ed5e92a58ee71b'),
    ('WAS','90982f30-8a06-4a53-8b4b-9efd5d9042bf'::uuid,'6ccff50666a085a4387c20fb49f90a59')
), manifest as (
  select * from private_verification.brinesearch_issue97_state_candidate_manifests
  where manifest_key='issue97-ohio-r2-final-candidate'
), actual as (
  select build.county_code,build.id as build_id,build.graph_digest,
    build.source_revision_digest,build.activated_at,
    private_verification.brinesearch_issue97_graph_build_sources_current(build.id) as source_current,
    private_verification.brinesearch_issue97_graph_build_release_current(build.id) as release_current
  from public.brinesearch_road_graph_builds build
  where build.state_code='OH' and build.status='active'
), source_scopes as (
  select count(*)::integer as required,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer as current
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code='OH'
), current_non_ohio as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
      coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||build.details::text,
    '|' order by build.id
  ),'')) as graph_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
  ))) as route_digest
  from public.brinesearch_road_graph_builds build where build.state_code in ('WV','PA')
), result as (
  select (select count(*) from manifest)=1
    and (select state_code='OH' and member_count=19
      and generation_key='issue97-release-20260815-r2'
      and review_details->>'global_cutover_authorized'='false'
      and private_verification.brinesearch_issue97_state_candidate_manifest_current(id)
      from manifest)
    and (select count(*) from actual)=19
    and not exists((select county_code,build_id,graph_digest from expected
      except select county_code,build_id,graph_digest from actual)
      union all (select county_code,build_id,graph_digest from actual
      except select county_code,build_id,graph_digest from expected))
    and not exists(select 1 from actual where not source_current or not release_current)
    and (select required=38 and current=38 from source_scopes)
    and (select current_non_ohio.graph_digest=manifest.review_details->>'non_ohio_graph_digest'
      and current_non_ohio.route_digest=manifest.review_details->>'non_ohio_route_digest'
      from current_non_ohio cross join manifest)
    and not public.brinesearch_issue97_cutover_active()
    and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
    and not exists(select 1 from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%')
    and (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)=0
    and (select count(*) from public.brinesearch_driver_google_routes_public)=0
    and (select count(*) from public.pads where state='Ohio' and coalesce(list_only,false)=false)=940
    and (select pg_catalog.md5(coalesce(pg_catalog.string_agg(id::text||':'||legacy_id,'|' order by id),''))
      from public.pads where state='Ohio' and coalesce(list_only,false)=false)=
      '9867f2352ac1b7276d057a83edd95d5f' as pass,
    (select pg_catalog.jsonb_pretty(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'county_code',actual.county_code,'build_id',actual.build_id,
      'graph_digest',actual.graph_digest,'source_revision_digest',actual.source_revision_digest,
      'activated_at',actual.activated_at,'source_current',actual.source_current,
      'release_current',actual.release_current
    ) order by actual.county_code)) from actual) as active_receipt,
    (select pg_catalog.jsonb_pretty(pg_catalog.jsonb_build_object(
      'manifest_id',manifest.id,'manifest_digest',manifest.manifest_digest,
      'git_sha',manifest.git_sha,'member_count',manifest.member_count,
      'non_ohio_graph_digest',current_non_ohio.graph_digest,
      'non_ohio_route_digest',current_non_ohio.route_digest,
      'cutover',public.brinesearch_issue97_cutover_active(),
      'public_google_routes',(select count(*) from public.brinesearch_driver_google_routes_public)
    )) from manifest cross join current_non_ohio) as state_receipt
)
select pass,active_receipt,state_receipt from result
\gset issue97_ohio_active_

\echo :issue97_ohio_active_active_receipt
\echo :issue97_ohio_active_state_receipt
\if :issue97_ohio_active_pass
\else
  do $fail$ begin raise exception 'Issue #97 exact Ohio manifest activation verification failed'; end $fail$;
\endif

rollback;
\echo 'Issue #97 Ohio activation verification PASS: exact manifest 19/19 active/current, 38/38 sources, non-Ohio unchanged, cutover/public routes OFF.'
