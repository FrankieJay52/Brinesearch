\set ON_ERROR_STOP on
\pset pager off
\timing on

-- The fixed wrapper derives this from the clean, fetched PR checkout. It is not
-- accepted from a caller argument, database URI, token or free-form review blob.
\if :{?issue97_git_sha}
\else
  \quit 2
\endif

-- Re-establish the exact audited candidate set immediately before the write.
\ir 28-verify-ohio-release-complete.sql

begin;
set local statement_timeout='5min';
set local lock_timeout='2min';
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

select (:'issue97_git_sha'~'^[0-9a-f]{40}$')
  and not public.brinesearch_issue97_cutover_active()
  and not exists(select 1 from public.brinesearch_road_graph_builds where status='staging')
  and not exists(select 1 from pg_catalog.pg_stat_activity activity
    where activity.pid<>pg_catalog.pg_backend_pid()
      and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
      and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%')
  and not exists(select 1
    from private_verification.brinesearch_issue97_state_candidate_manifests
    where manifest_key='issue97-ohio-r2-final-candidate') as safe_to_persist
\gset issue97_ohio_manifest_pre_

\if :issue97_ohio_manifest_pre_safe_to_persist
\else
  do $fail$ begin raise exception 'Issue #97 Ohio state manifest preflight failed or the immutable key already exists'; end $fail$;
\endif

select private_verification.brinesearch_issue97_persist_state_candidate_manifest(
  'OH',
  'issue97-ohio-r2-final-candidate',
  :'issue97_git_sha',
  pg_catalog.jsonb_build_object(
    'reviewed_by','Grok whole-Ohio audit + Codex independent current-state verification',
    'reviewed_at',pg_catalog.clock_timestamp(),
    'evidence','GitHub Issue #97 durable whole-Ohio candidate/lane checkpoint at exact PR Git SHA '||:'issue97_git_sha',
    'whole_ohio_gate','28-verify-ohio-release-complete.sql',
    'candidate_count',19,
    'authoritative_odot_expected',2923,
    'authoritative_odot_observed',2923,
    'authoritative_odot_missing',0,
    'authoritative_odot_extra',0,
    'activation_impact_count',0,
    'activation_impact_digest',pg_catalog.md5('[]'::pg_catalog.jsonb::text),
    'ohio_non_list_only_pad_count',940,
    'ohio_pad_scope_digest','9867f2352ac1b7276d057a83edd95d5f',
    'non_ohio_graph_digest',(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      build.id::text||':'||build.state_code||':'||build.county_code||':'||build.status||':'||
        coalesce(build.activated_at::text,'')||':'||coalesce(build.graph_digest,'')||':'||build.details::text,
      '|' order by build.id
    ),'')) from public.brinesearch_road_graph_builds build where build.state_code in ('WV','PA')),
    'non_ohio_route_digest',(select pg_catalog.md5(pg_catalog.concat_ws('|',
      (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
      (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.boundary_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.boundary_index),'')) from private_verification.brinesearch_route_transition_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
      (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.occurrence_index::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id,receipt.occurrence_index),'')) from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania')),
      (select pg_catalog.md5(coalesce(pg_catalog.string_agg(receipt.route_prep_id::text||':'||receipt.receipt_digest,'|' order by receipt.route_prep_id),'')) from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.pads pad on pad.id=receipt.pad_id where pad.state in ('West Virginia','Pennsylvania'))
    ))),
    'global_cutover_authorized',false,
    'name_only_or_nearest_resolution_authorized',false
  )
) as manifest_receipt
\gset issue97_ohio_manifest_

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
), header as (
  select manifest.*
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.manifest_key='issue97-ohio-r2-final-candidate'
), actual as (
  select member.member_value->>'county_code' as county_code,
    (member.member_value->>'build_id')::uuid as build_id,
    member.member_value->>'graph_digest' as graph_digest
  from header
  join private_verification.brinesearch_issue97_state_candidate_manifest_members member
    on member.manifest_id=header.id
)
select (select count(*) from header)=1
  and (select state_code='OH' and generation_key='issue97-release-20260815-r2'
    and git_sha=:'issue97_git_sha' and member_count=19
    and review_details->>'global_cutover_authorized'='false'
    and review_details->>'activation_impact_count'='0'
    from header)
  and (select private_verification.brinesearch_issue97_state_candidate_manifest_current(id)
    from header)
  and not exists((select * from expected except select * from actual)
    union all (select * from actual except select * from expected)) as persisted_exactly
\gset issue97_ohio_manifest_post_

\if :issue97_ohio_manifest_post_persisted_exactly
\else
  do $fail$ begin raise exception 'Issue #97 Ohio state manifest persistence receipt is not the exact audited 19-member set'; end $fail$;
\endif

commit;
\echo :issue97_ohio_manifest_manifest_receipt
\echo 'Issue #97 immutable/private Ohio state candidate manifest persisted; global cutover remains unauthorized and OFF.'
