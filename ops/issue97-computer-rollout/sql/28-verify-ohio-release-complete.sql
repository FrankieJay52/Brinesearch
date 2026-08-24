\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Fixed, read-only whole-Ohio candidate gate. There are deliberately no state,
-- county, build, SQL or shell inputs. Historical rows remain retained, but only
-- the 19 exact release-current r2 candidates below can satisfy this gate.
\ir 17-release-preflight.sql

begin isolation level repeatable read read only;
set local statement_timeout='5min';

with selected_pins(county_code,build_id,graph_digest) as (
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
), candidate_eval as materialized (
  select build.*,
    private_verification.brinesearch_issue97_graph_build_sources_current(build.id) as source_current,
    private_verification.brinesearch_issue97_graph_build_release_current(build.id) as release_current
  from public.brinesearch_road_graph_builds build
  where build.state_code='OH'
    and build.details->>'release_generation_key'='issue97-release-20260815-r2'
), selected as materialized (
  select candidate.*
  from selected_pins pin
  join candidate_eval candidate
    on candidate.id=pin.build_id and candidate.county_code=pin.county_code
   and candidate.graph_digest=pin.graph_digest
  where candidate.status='validated' and candidate.activated_at is null
    and candidate.source_current and candidate.release_current
    and candidate.details->>'release_builder_md5'='06705f5b35a6d37151bb2c0dc5ade9bd'
), graph_receipts as materialized (
  select selected.id,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      junction.stable_junction_key||':'||junction.graph_digest,','
      order by junction.stable_junction_key
    ),'')) as recomputed_graph_digest,
    count(*) filter(where junction.junction_type<>'shared_segment')::integer as point_count,
    count(*) filter(where junction.junction_type='shared_segment')::integer as shared_count,
    (select count(*)::integer
      from public.brinesearch_road_junction_anchors anchor
      join public.brinesearch_road_junctions anchored_junction
        on anchored_junction.id=anchor.junction_id
      where anchored_junction.build_id=selected.id) as anchor_count
  from selected
  join public.brinesearch_road_junctions junction on junction.build_id=selected.id
  group by selected.id
), membership_receipts as materialized (
  select selected.id,count(membership.id)::integer as membership_count
  from selected
  join public.brinesearch_road_junctions junction on junction.build_id=selected.id
  join public.brinesearch_road_junction_memberships membership on membership.junction_id=junction.id
  group by selected.id
), activation_impacts as materialized (
  select selected.county_code,selected.id as build_id,referenced.reference_kind,
    referenced.reference_id,old_anchor.id as old_anchor_id,
    old_junction.stable_junction_key,old_anchor.anchor_role,
    case when new_junction.id is null then 'junction_missing'
      when new_anchor.id is null then 'anchor_missing'
      when new_anchor.anchor_digest<>old_anchor.anchor_digest then 'anchor_changed'
      when new_junction.graph_digest<>old_junction.graph_digest then 'junction_digest_changed'
      else null end as impact_reason
  from selected
  cross join lateral (
    select distinct pad_road.entry_junction_anchor_id as old_anchor_id,
      'published_route'::text as reference_kind,pad_road.pad_id::text as reference_id
    from public.brinesearch_pad_roads pad_road
    where pad_road.junction_build_id in (
      select historical.id from public.brinesearch_road_graph_builds historical
      where historical.state_code='OH' and historical.county_code=selected.county_code
    ) and pad_road.entry_junction_anchor_id is not null
    union
    select distinct review_segment.entry_junction_anchor_id,'route_review',review_segment.review_id::text
    from public.brinesearch_route_review_segments review_segment
    where review_segment.junction_build_id in (
      select historical.id from public.brinesearch_road_graph_builds historical
      where historical.state_code='OH' and historical.county_code=selected.county_code
    ) and review_segment.entry_junction_anchor_id is not null
  ) referenced
  join public.brinesearch_road_junction_anchors old_anchor on old_anchor.id=referenced.old_anchor_id
  join public.brinesearch_road_junctions old_junction on old_junction.id=old_anchor.junction_id
  left join public.brinesearch_road_junctions new_junction
    on new_junction.build_id=selected.id
   and new_junction.stable_junction_key=old_junction.stable_junction_key
  left join public.brinesearch_road_junction_anchors new_anchor
    on new_anchor.junction_id=new_junction.id and new_anchor.anchor_role=old_anchor.anchor_role
  where new_junction.id is null or new_anchor.id is null
     or new_anchor.anchor_digest<>old_anchor.anchor_digest
     or new_junction.graph_digest<>old_junction.graph_digest
), county_rows as (
  select county.county_code,
    count(candidate.id) filter(where candidate.status='validated' and candidate.activated_at is null
      and candidate.source_current and candidate.release_current)::integer as release_current_inactive
  from public.brinesearch_road_graph_counties county
  left join candidate_eval candidate on candidate.county_code=county.county_code
  where county.active and county.state_code='OH'
  group by county.county_code
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
), protected_state as (
  select
    (select count(*) from public.brinesearch_road_graph_counties
      where active and state_code='OH')::integer as registry_counties,
    (select count(*) from selected)::integer as selected_count,
    (select count(*) from county_rows where release_current_inactive=0)::integer as missing_counties,
    (select count(*) from county_rows where release_current_inactive>1)::integer as multi_current_counties,
    (select required from source_scopes)::integer as required_scopes,
    (select current from source_scopes)::integer as current_scopes,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
    )) as builder_md5,
    private_verification.brinesearch_issue97_active_graph_release_generation() as generation,
    public.brinesearch_issue97_cutover_active() as cutover,
    (select count(*) from public.brinesearch_road_graph_builds where status='staging')::integer as staging,
    (select count(*) from pg_catalog.pg_stat_activity activity
      where activity.pid<>pg_catalog.pg_backend_pid()
        and activity.state in ('active','idle in transaction','idle in transaction (aborted)')
        and activity.query ilike '%brinesearch_issue97_rebuild_county_graph%')::integer as builder_sessions,
    (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)::integer as reconciliation_runs,
    (select count(*) from public.brinesearch_driver_google_routes_public)::integer as public_google_routes,
    (select count(*) from activation_impacts)::integer as activation_impact_count,
    pg_catalog.md5('[]'::pg_catalog.jsonb::text) as expected_empty_impact_digest,
    (select count(*) from public.brinesearch_road_graph_builds build
      where build.state_code in ('WV','PA')
        and build.details->>'release_generation_key'='issue97-release-20260815-r2')::integer as non_oh_r2_builds,
    (select count(*) from public.pads pad
      where pad.state='Ohio' and coalesce(pad.list_only,false)=false)::integer as ohio_pads,
    (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pad.id::text||':'||pad.legacy_id,'|' order by pad.id
    ),'')) from public.pads pad
      where pad.state='Ohio' and coalesce(pad.list_only,false)=false) as ohio_pad_scope_digest
), result as (
  select
    (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'county_code',selected.county_code,'build_id',selected.id,
      'graph_digest',selected.graph_digest,
      'source_revision_digest',selected.source_revision_digest,
      'source_segment_count',selected.source_segment_count,
      'identity_count',selected.identity_count,
      'point_junction_count',selected.point_junction_count,
      'shared_segment_count',selected.shared_segment_count,
      'membership_count',selected.membership_count,
      'anchor_count',graph_receipts.anchor_count,
      'source_current',selected.source_current,'release_current',selected.release_current
    ) order by selected.county_code)
      from selected
      join graph_receipts on graph_receipts.id=selected.id) as candidate_receipt,
    pg_catalog.to_jsonb(protected_state) as protected_state_receipt,
    (select registry_counties=19 and selected_count=19 and missing_counties=0
      and multi_current_counties=0 and required_scopes=38 and current_scopes=38
      and builder_md5='06705f5b35a6d37151bb2c0dc5ade9bd'
      and generation='issue97-release-20260815-r2' and not cutover
      and staging=0 and builder_sessions=0 and reconciliation_runs=0
      and public_google_routes=0 and activation_impact_count=0
      and expected_empty_impact_digest='d751713988987e9331980363e24189ce'
      and non_oh_r2_builds=0 and ohio_pads=940
      and ohio_pad_scope_digest='9867f2352ac1b7276d057a83edd95d5f'
      from protected_state)
    and not exists(select 1 from county_rows where release_current_inactive<>1)
    and not exists(
      select 1 from selected
      join graph_receipts on graph_receipts.id=selected.id
      join membership_receipts on membership_receipts.id=selected.id
      where graph_receipts.recomputed_graph_digest<>selected.graph_digest
         or graph_receipts.point_count<>selected.point_junction_count
         or graph_receipts.shared_count<>selected.shared_segment_count
         or membership_receipts.membership_count<>selected.membership_count
    )
    and (select count(*) from supabase_migrations.schema_migrations
      where version='20260816090000' and name='issue97_vin_endpoint_index_performance'
        and cardinality(statements)=1)=1
    and (select count(*)
      from pg_catalog.pg_index index_row
      join pg_catalog.pg_class index_class on index_class.oid=index_row.indexrelid
      join pg_catalog.pg_am access_method on access_method.oid=index_class.relam
      where index_class.relname in (
        'brinesearch_supp_vin_start_geog_issue97_idx',
        'brinesearch_supp_vin_end_geog_issue97_idx'
      ) and index_row.indrelid=
        'public.brinesearch_authoritative_supplemental_centerlines'::pg_catalog.regclass
        and access_method.amname='gist' and index_row.indisvalid and index_row.indisready)=2
    as pass
  from protected_state
)
select pg_catalog.jsonb_pretty(candidate_receipt) as candidate_receipt,
  pg_catalog.jsonb_pretty(protected_state_receipt) as protected_state_receipt,pass
from result
\gset issue97_ohio_complete_

\echo :issue97_ohio_complete_candidate_receipt
\echo :issue97_ohio_complete_protected_state_receipt
\if :issue97_ohio_complete_pass
\else
  do $fail$ begin raise exception 'Issue #97 fixed whole-Ohio candidate/currentness/count gate failed'; end $fail$;
\endif

rollback;

-- Re-run the exact high-value semantic canaries from their reviewed files.
\ir 21-verify-nob-leonard-release.sql
\set issue97_state OH
\set issue97_county BEL
\set issue97_expected_build_id 24ffa531-0e69-4625-a137-da52020e6fd0
\ir 26-verify-bel-concurrency-release.sql
\ir 27-verify-stark-scale-release.sql

-- Exact all-county authoritative ODOT expected/observed set equality. Disable
-- nested loops only for this pair comparison, after currentness was established.
begin isolation level repeatable read read only;
set local statement_timeout='5min';
set local enable_nestloop=off;

with selected_pins(county_code,build_id,graph_digest) as (
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
), expected as materialized (
  select distinct secondary.county_code,
    secondary.source_record_id as secondary_source_record_id,
    primary_segment.source_record_id as primary_source_record_id,
    secondary.source_segment_key as secondary_source_segment_key,
    primary_segment.source_segment_key as primary_source_segment_key,
    secondary.attributes->>'OVERLAP_INVERSE_IND' as overlap_inverse_ind
  from public.brinesearch_authoritative_road_segments secondary
  join selected_pins pin on pin.county_code=secondary.county_code
  join public.brinesearch_authoritative_road_identities secondary_identity
    on secondary_identity.id=secondary.identity_id and secondary_identity.active
  join public.brinesearch_authoritative_road_segments primary_segment
    on primary_segment.state_code='OH' and primary_segment.county_code=secondary.county_code
   and primary_segment.source_record_id=secondary.attributes->>'PRIMARY_OVERLAP_ID'
   and primary_segment.active
   and primary_segment.drivable_status in ('drivable','non_drivable')
   and primary_segment.public_access_status in ('public','private','access')
   and primary_segment.attributes->>'OVERLAP_INDICATOR'='P'
   and primary_segment.attributes->>'PRIMARY_IND'='Y'
  join public.brinesearch_authoritative_road_identities primary_identity
    on primary_identity.id=primary_segment.identity_id and primary_identity.active
   and primary_identity.drivable_status in ('drivable','non_drivable')
   and primary_identity.public_access_status in ('public','private','access')
  where secondary.state_code='OH' and secondary.active
    and secondary.drivable_status in ('drivable','non_drivable')
    and secondary.public_access_status in ('public','private','access')
    and secondary_identity.drivable_status in ('drivable','non_drivable')
    and secondary_identity.public_access_status in ('public','private','access')
    and secondary.attributes->>'OVERLAP_INDICATOR'='S'
    and secondary.attributes->>'PRIMARY_IND'='N'
    and secondary.attributes->>'OVERLAP_INVERSE_IND' in ('N','Y')
    and nullif(secondary.attributes->>'PRIMARY_OVERLAP_ID','') is not null
    and secondary.identity_id<>primary_segment.identity_id
), observed as materialized (
  select distinct pin.county_code,
    pair.value->>'secondary_source_record_id' as secondary_source_record_id,
    pair.value->>'primary_source_record_id' as primary_source_record_id,
    pair.value->>'secondary_source_segment_key' as secondary_source_segment_key,
    pair.value->>'primary_source_segment_key' as primary_source_segment_key,
    pair.value->>'overlap_inverse_ind' as overlap_inverse_ind
  from selected_pins pin
  join public.brinesearch_road_junctions junction on junction.build_id=pin.build_id
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(junction.source_provenance->'odot_authoritative_overlap_pairs','[]'::jsonb)
  ) pair(value)
  where junction.junction_type='shared_segment'
    and junction.verification_status='verified'
    and pair.value->>'topology_geometry_source'='odot_primary_overlap'
    and pair.value->>'persistent_secondary_geometry_unchanged'='true'
), missing as materialized (
  select * from expected except select * from observed
), extra as materialized (
  select * from observed except select * from expected
), county_evidence as (
  select pin.county_code,pin.build_id,pin.graph_digest,
    (select count(*) from expected where expected.county_code=pin.county_code) as expected,
    (select count(*) from observed where observed.county_code=pin.county_code) as observed,
    (select count(*) from missing where missing.county_code=pin.county_code) as missing,
    (select count(*) from extra where extra.county_code=pin.county_code) as extra
  from selected_pins pin
)
select pg_catalog.jsonb_pretty(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(county_evidence) order by county_code)) as evidence,
  count(*)=19 and sum(expected)=2923 and sum(observed)=2923
    and sum(missing)=0 and sum(extra)=0
    and not exists(select 1 from county_evidence where expected<>observed) as pass
from county_evidence
\gset issue97_ohio_odot_

\echo :issue97_ohio_odot_evidence
\if :issue97_ohio_odot_pass
\else
  do $fail$ begin raise exception 'Issue #97 fixed whole-Ohio ODOT equality gate failed'; end $fail$;
\endif

rollback;
\echo 'Issue #97 fixed whole-Ohio completion gate PASS: 19 exact inactive/current r2 candidates, 38/38 sources, NOB/BEL/STA semantics, 2,923/2,923 authoritative pairs, no cutover/reconciliation/publication/WV/PA r2 work.'
