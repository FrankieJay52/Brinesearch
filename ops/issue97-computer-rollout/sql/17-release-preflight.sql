\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set local statement_timeout='2min';

with required_scopes as (
  select scope.dataset_id,scope.state_code,scope.county_code
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset on dataset.id=scope.dataset_id
  where scope.active and scope.ingest_enabled and scope.required_for_graph and dataset.active
), possum as (
  select count(*)::integer as fixture_count
  from (values
    ('pa_washington_ng911_centerlines:NGUID:RCL22649@co.washington.pa.us:SCOPE:PA:WAS',
      'PA:PENNDOT:LOCAL:62:2049:110961:EJM9','PA:PENNDOT:LOCAL:SEGMENT:379767'),
    ('pa_washington_ng911_centerlines:NGUID:RCL39851@co.washington.pa.us:SCOPE:PA:WAS',
      'PA:PENNDOT:LOCAL:62:2061:107905:EHBS','PA:PENNDOT:LOCAL:SEGMENT:386101')
  ) expected(feature_key,identity_key,segment_key)
  join public.brinesearch_authoritative_supplemental_centerlines c
    on c.source_feature_key=expected.feature_key and c.active
  join public.brinesearch_authoritative_road_identities i
    on i.source_identity_key=expected.identity_key and i.active
  join public.brinesearch_supplemental_centerline_identity_mappings m
    on m.centerline_id=c.id and m.identity_id=i.id and m.active
      and m.ingest_run_id=c.last_ingest_run_id
      and m.mapping_status='verified'
      and m.mapping_method='exact_source_subsegment_boundary_pair'
      and m.source_segment_keys=array[expected.segment_key]
      and m.evidence->>'name_used_for_mapping'='false'
      and m.evidence->>'nearest_road_used_for_mapping'='false'
  join public.brinesearch_supplemental_centerline_dispositions d
    on d.centerline_id=c.id and d.active and d.ingest_run_id=c.last_ingest_run_id
      and d.disposition='verified' and d.candidate_count=1 and d.verified_mapping_count=1
  where exists(select 1 from public.brinesearch_authoritative_road_names n
      where n.identity_id=i.id and n.source_dataset_id=c.dataset_id and n.active
        and n.source_segment_key=expected.segment_key and n.name_type='911'
        and n.source_record_id like c.source_feature_key||':%')
    and exists(select 1 from public.brinesearch_authoritative_road_names n
      where n.identity_id=i.id and n.source_dataset_id=c.dataset_id and n.active
        and n.source_segment_key=expected.segment_key and n.name_type='legacy'
        and n.source_record_id like c.source_feature_key||':%')
), baseline as (
  select * from private_verification.brinesearch_issue97_saved_road_release_baseline where singleton
), transition_definition as (
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'::pg_catalog.regprocedure
  ) as definition,
  pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  ) as route_definition
), checks as (
  select
    not public.brinesearch_issue97_cutover_active() as cutover_off,
    (select count(*) from required_scopes)=114 as source_scope_count_exact,
    not exists(select 1 from required_scopes r where not private_verification.brinesearch_issue97_dataset_scope_current(r.dataset_id,r.state_code,r.county_code)) as all_sources_current,
    not exists(select 1 from public.brinesearch_road_graph_builds where status='staging') as no_staging,
    not exists(select 1 from pg_catalog.pg_stat_activity a where a.pid<>pg_catalog.pg_backend_pid()
      and a.state in ('active','idle in transaction','idle in transaction (aborted)')
      and a.query ilike '%brinesearch_issue97_rebuild_county_graph%') as no_builder,
    (select count(*) from private_verification.brinesearch_issue97_graph_release_generations where active)=1 as one_release_generation,
    private_verification.brinesearch_issue97_active_graph_release_generation()='issue97-release-20260814-r1' as release_generation_exact,
    private_verification.brinesearch_issue97_release_manifest_current() as exact_release_manifest_current,
    pg_catalog.md5(pg_catalog.pg_get_functiondef('public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure))='7abd11f432c3e7b475b10d0817f5e8fc'
      and pg_catalog.pg_get_functiondef('public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure) like '%independent_ogrip_endpoint_corroboration%'
      and pg_catalog.pg_get_functiondef('public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure) like '%create index tmp_issue97_segments_geog_idx%'
      and pg_catalog.pg_get_functiondef('public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure) like '%analyze tmp_issue97_segments;%' as builder_exact,
    pg_catalog.to_regclass('public.brinesearch_supp_centerline_oh_active_start_geog_issue97_idx') is not null
      and pg_catalog.to_regclass('public.brinesearch_supp_centerline_oh_active_end_geog_issue97_idx') is not null
      as ogrip_endpoint_indexes_ready,
    pg_catalog.md5(pg_catalog.pg_get_functiondef('public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure))='4dd8a572b153d795163cf38a41ea9d1f' as supplemental_mapper_exact,
    (select count(*) from public.brinesearch_road_graph_builds b where b.state_code='WV' and b.county_code='OHI' and b.status='active' and private_verification.brinesearch_issue97_graph_build_release_current(b.id))=1 as ohi_release_current,
    (select count(*) from public.brinesearch_road_graph_builds b where b.state_code='OH' and b.county_code in ('BEL','JEF','NOB') and b.status='active' and private_verification.brinesearch_issue97_graph_build_release_current(b.id))=0 as old_frozen_not_grandfathered,
    (select fixture_count from possum)=2 as possum_ready,
    (select expected_occurrence_count from baseline)=16111
      and (select expected_inventory_digest from baseline)='4825b5291ea682af7f659130cd735838' as saved_road_baseline_exact,
    not pg_catalog.has_function_privilege('service_role','public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)','EXECUTE')
      and not pg_catalog.has_function_privilege('service_role','public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)','EXECUTE') as inner_bypasses_closed,
    (select definition not like '%public.brinesearch_issue97_road_mapping_fingerprint%'
      and definition not like '%graph_build_digest%'
      and definition not like '%run.page_set_digest%'
      and definition not like '%run.coverage_complete%'
      and definition not like '%status=''succeeded''%'
      and definition not like '%public.brinesearch_issue97_graph_build_sources_current%'
      and definition not like '%public.brinesearch_issue97_dataset_scope_current%'
      and route_definition not like '%public.brinesearch_issue97_road_mapping_fingerprint%'
      and route_definition not like '%public.brinesearch_issue97_dataset_scope_current%'
      from transition_definition) as transition_schema_current
)
select * from checks
\gset issue97_release_

\if :issue97_release_cutover_off
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: cutover must be off'; end $fail$;
\endif
\if :issue97_release_source_scope_count_exact
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: source scope count changed'; end $fail$;
\endif
\if :issue97_release_all_sources_current
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: required source scope is stale'; end $fail$;
\endif
\if :issue97_release_no_staging
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: staging graph exists'; end $fail$;
\endif
\if :issue97_release_no_builder
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: graph builder is active'; end $fail$;
\endif
\if :issue97_release_one_release_generation
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: active release generation is not unique'; end $fail$;
\endif
\if :issue97_release_release_generation_exact
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: release generation changed'; end $fail$;
\endif
\if :issue97_release_exact_release_manifest_current
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: exact county/source-scope manifest changed'; end $fail$;
\endif
\if :issue97_release_builder_exact
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: builder definition changed'; end $fail$;
\endif
\if :issue97_release_ogrip_endpoint_indexes_ready
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: OGRIP endpoint geography indexes are missing'; end $fail$;
\endif
\if :issue97_release_supplemental_mapper_exact
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: supplemental mapper changed'; end $fail$;
\endif
\if :issue97_release_ohi_release_current
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: OHI compatibility qualification failed'; end $fail$;
\endif
\if :issue97_release_old_frozen_not_grandfathered
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: BEL/JEF/NOB were silently grandfathered'; end $fail$;
\endif
\if :issue97_release_possum_ready
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: Possum reviewed bridge fixture failed'; end $fail$;
\endif
\if :issue97_release_saved_road_baseline_exact
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: saved-road baseline is not the reviewed 16,111 manifest'; end $fail$;
\endif
\if :issue97_release_inner_bypasses_closed
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: internal cutover/publisher bypass remains executable'; end $fail$;
\endif
\if :issue97_release_transition_schema_current
\else
  do $fail$ begin raise exception 'Issue #97 release preflight: transition Google dependency still references stale schema'; end $fail$;
\endif

commit;
\echo 'Issue #97 release preflight PASS'
