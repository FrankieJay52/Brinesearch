-- GitHub #97 — explicit topology/release currentness.
--
-- Source/mapping freshness remains a separate historical predicate. Release
-- currentness additionally binds an active builder generation, supplemental
-- materializer generation and the exact content digests of every captured
-- source run. Historical graph-build rows are immutable; an independently
-- audited older graph may be carried forward only through the compatibility
-- qualification ledger below.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create table private_verification.brinesearch_issue97_graph_release_generations (
  generation_key text primary key,
  algorithm_version text not null,
  builder_definition_md5 text not null check(builder_definition_md5~'^[0-9a-f]{32}$'),
  supplemental_mapper_md5 text not null check(supplemental_mapper_md5~'^[0-9a-f]{32}$'),
  county_manifest_count integer not null check(county_manifest_count>0),
  county_manifest_digest text not null check(county_manifest_digest~'^[0-9a-f]{32}$'),
  source_scope_manifest_count integer not null check(source_scope_manifest_count>0),
  source_scope_manifest_digest text not null check(source_scope_manifest_digest~'^[0-9a-f]{32}$'),
  source_content_contract text not null,
  review_details jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  activated_at timestamptz,
  constraint brinesearch_issue97_graph_release_generation_review_check check(
    pg_catalog.jsonb_typeof(review_details)='object'
    and nullif(pg_catalog.btrim(review_details->>'reviewed_by'),'') is not null
    and nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null
    and nullif(pg_catalog.btrim(review_details->>'audit_baseline_sha'),'') is not null
  )
);
create unique index brinesearch_issue97_one_active_graph_release_generation_idx
on private_verification.brinesearch_issue97_graph_release_generations((active))
where active;

create table private_verification.brinesearch_issue97_graph_release_qualifications (
  build_id uuid primary key references public.brinesearch_road_graph_builds(id) on delete restrict,
  generation_key text not null references private_verification.brinesearch_issue97_graph_release_generations(generation_key) on delete restrict,
  graph_digest text not null check(graph_digest~'^[0-9a-f]{32}$'),
  source_revision_digest text not null check(source_revision_digest~'^[0-9a-f]{32}$'),
  mapping_snapshot_digest text not null check(mapping_snapshot_digest~'^[0-9a-f]{32}$'),
  source_content_digest text not null check(source_content_digest~'^[0-9a-f]{32}$'),
  qualification_digest text not null check(qualification_digest~'^[0-9a-f]{32}$'),
  review_details jsonb not null,
  active boolean not null default true,
  qualified_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint brinesearch_issue97_graph_release_qualification_review_check check(
    pg_catalog.jsonb_typeof(review_details)='object'
    and nullif(pg_catalog.btrim(review_details->>'reviewed_by'),'') is not null
    and nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null
    and nullif(pg_catalog.btrim(review_details->>'evidence'),'') is not null
  )
);

alter table private_verification.brinesearch_issue97_graph_release_generations enable row level security;
alter table private_verification.brinesearch_issue97_graph_release_generations force row level security;
alter table private_verification.brinesearch_issue97_graph_release_qualifications enable row level security;
alter table private_verification.brinesearch_issue97_graph_release_qualifications force row level security;
revoke all on private_verification.brinesearch_issue97_graph_release_generations
from public,anon,authenticated,service_role;
revoke all on private_verification.brinesearch_issue97_graph_release_qualifications
from public,anon,authenticated,service_role;

-- A captured source vector is release-current only if every exact run still has
-- the same immutable content receipt. This catches reviewed supplemental
-- rematerialization even when the raw run UUID/page set did not change.
create or replace function private_verification.brinesearch_issue97_graph_source_content_digest(
  p_build_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  with build as (
    select details->'source_run_vector' as vector
    from public.brinesearch_road_graph_builds where id=p_build_id
  ), entries as (
    select e.value as entry
    from build cross join lateral pg_catalog.jsonb_array_elements(coalesce(vector,'[]'::jsonb)) e
  ), resolved as (
    select entry,r.id as run_id,r.details->>'content_digest' as content_digest
    from entries
    left join public.brinesearch_road_source_ingest_runs r
      on r.id=(entry->>'run_id')::uuid
  ), summary as (
    select count(*)::integer as entry_count,
      count(*) filter(where run_id is not null and content_digest~'^[0-9a-f]{32}$')::integer as valid_count,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        (entry->>'dataset_id')||':'||(entry->>'state_code')||':'||(entry->>'county_code')||':'||
        (entry->>'run_id')||':'||coalesce(entry->>'page_set_digest','')||':'||coalesce(content_digest,''),
        ',' order by entry->>'dataset_id',entry->>'state_code',entry->>'county_code'
      ),'')) as digest
    from resolved
  )
  select case when entry_count>0 and entry_count=valid_count then digest end
  from summary
$$;
revoke all on function private_verification.brinesearch_issue97_graph_source_content_digest(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_active_graph_release_generation()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select generation_key
  from private_verification.brinesearch_issue97_graph_release_generations
  where active
$$;
revoke all on function private_verification.brinesearch_issue97_active_graph_release_generation()
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_release_manifest_current()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  with generation as (
    select * from private_verification.brinesearch_issue97_graph_release_generations where active
  ), counties as (
    select count(*)::integer as row_count,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        state_code||':'||county_code||':'||county_name||':'||county_geoid||':'||source_county_code,
        ',' order by state_code,county_code
      ),'')) as digest
    from public.brinesearch_road_graph_counties where active
  ), scopes as (
    select count(*)::integer as row_count,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        d.source_key||':'||s.state_code||':'||s.county_code||':'||s.ingest_enabled::text||':'||s.required_for_graph::text,
        ',' order by d.source_key,s.state_code,s.county_code
      ),'')) as digest
    from public.brinesearch_road_source_dataset_counties s
    join public.brinesearch_road_source_datasets d on d.id=s.dataset_id
    where s.active and s.ingest_enabled and s.required_for_graph and d.active
  )
  select coalesce((
    select generation.county_manifest_count=counties.row_count
      and generation.county_manifest_digest=counties.digest
      and generation.source_scope_manifest_count=scopes.row_count
      and generation.source_scope_manifest_digest=scopes.digest
    from generation,counties,scopes
  ),false)
$$;
revoke all on function private_verification.brinesearch_issue97_release_manifest_current()
from public,anon,authenticated,service_role;

-- Install exactly the reviewed post-performance/post-Possum generation.
do $issue97_release_generation_install$
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
     ))<>'7abd11f432c3e7b475b10d0817f5e8fc' then
    raise exception 'Issue #97 release generation requires final audited builder 7abd11f4';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
     ))<>'4dd8a572b153d795163cf38a41ea9d1f' then
    raise exception 'Issue #97 release generation requires reviewed Possum supplemental core 4dd8a572';
  end if;
end
$issue97_release_generation_install$;

insert into private_verification.brinesearch_issue97_graph_release_generations(
  generation_key,algorithm_version,builder_definition_md5,supplemental_mapper_md5,
  county_manifest_count,county_manifest_digest,source_scope_manifest_count,source_scope_manifest_digest,
  source_content_contract,review_details,active,activated_at
) values(
  'issue97-release-20260814-r1','issue97-authoritative-topology-v2',
  '7abd11f432c3e7b475b10d0817f5e8fc','4dd8a572b153d795163cf38a41ea9d1f',
  39,'7493c03da13f57707cb00bf90167bf7d',114,'5571341192c3573861ed0318fe0b71b3',
  'captured-run-content-digest-v1',
  pg_catalog.jsonb_build_object(
    'reviewed_by','ChatGPT post-Grok controlled implementation cycle',
    'reviewed_at','2026-08-14T16:00:00Z',
    'audit_baseline_sha','f8bae92818b88a768e1d2ed38aeb4f0e9b0c8da4',
    'implementation_checkpoint','resolved by the durable GitHub commit containing this migration',
    'builder_contract','temp geography GiST + ANALYZE; no topology tolerance change',
    'supplemental_contract','reviewed Possum source-subsegment paired-boundary bridge',
    'historical_build_rows_immutable',true
  ),true,pg_catalog.clock_timestamp()
);

-- Stamp every future validated graph with the active release generation and the
-- exact content digest of its captured run vector. The trigger does not mutate
-- already validated/active historical receipts.
