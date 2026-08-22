-- GitHub #97 — persisted reviewed release manifests and final verification report.
--
-- Counts alone cannot authorize activation/cutover. Persist exact candidate
-- build IDs, exact active graph IDs, exact source-run receipts and the exact
-- non-list-only route denominator. These receipts are append-only and private.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create table private_verification.brinesearch_issue97_release_manifests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  manifest_kind text not null check(manifest_kind in (
    'candidate_graphs','active_counties','source_scopes','route_eligibility'
  )),
  manifest_key text not null unique,
  generation_key text not null references
    private_verification.brinesearch_issue97_graph_release_generations(generation_key) on delete restrict,
  git_sha text not null check(git_sha~'^[0-9a-f]{40}$'),
  member_count integer not null check(member_count>=0),
  manifest_digest text not null unique check(manifest_digest~'^[0-9a-f]{32}$'),
  review_details jsonb not null check(pg_catalog.jsonb_typeof(review_details)='object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check(nullif(pg_catalog.btrim(review_details->>'reviewed_by'),'') is not null),
  check(nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null),
  check(nullif(pg_catalog.btrim(review_details->>'evidence'),'') is not null)
);

create table private_verification.brinesearch_issue97_release_manifest_members (
  manifest_id uuid not null references private_verification.brinesearch_issue97_release_manifests(id) on delete restrict,
  member_key text not null check(nullif(pg_catalog.btrim(member_key),'') is not null),
  member_value jsonb not null check(pg_catalog.jsonb_typeof(member_value)='object'),
  member_digest text not null check(member_digest~'^[0-9a-f]{32}$'),
  primary key(manifest_id,member_key),
  unique(manifest_id,member_digest),
  check(member_digest=pg_catalog.md5(member_key||':'||member_value::text))
);

create table private_verification.brinesearch_issue97_verification_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_digest text not null unique check(report_digest~'^[0-9a-f]{32}$'),
  git_sha text not null check(git_sha~'^[0-9a-f]{40}$'),
  migration_set_digest text not null check(migration_set_digest~'^[0-9a-f]{32}$'),
  generation_key text not null references
    private_verification.brinesearch_issue97_graph_release_generations(generation_key) on delete restrict,
  candidate_graph_manifest_id uuid not null references private_verification.brinesearch_issue97_release_manifests(id) on delete restrict,
  active_county_manifest_id uuid not null references private_verification.brinesearch_issue97_release_manifests(id) on delete restrict,
  source_scope_manifest_id uuid not null references private_verification.brinesearch_issue97_release_manifests(id) on delete restrict,
  route_eligibility_manifest_id uuid not null references private_verification.brinesearch_issue97_release_manifests(id) on delete restrict,
  saved_road_reconciliation_run_id uuid not null references
    private_verification.brinesearch_issue97_saved_road_reconciliation_runs(id) on delete restrict,
  pinned_fixture_results jsonb not null check(pg_catalog.jsonb_typeof(pinned_fixture_results)='object'),
  route_materialization_receipt jsonb not null check(pg_catalog.jsonb_typeof(route_materialization_receipt)='object'),
  google_accounting_contract jsonb not null check(pg_catalog.jsonb_typeof(google_accounting_contract)='object'),
  report_body jsonb not null check(pg_catalog.jsonb_typeof(report_body)='object'),
  review_details jsonb not null check(pg_catalog.jsonb_typeof(review_details)='object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check(report_digest=pg_catalog.md5(report_body::text)),
  check(nullif(pg_catalog.btrim(review_details->>'reviewed_by'),'') is not null),
  check(nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null),
  check(nullif(pg_catalog.btrim(review_details->>'evidence'),'') is not null)
);

alter table private_verification.brinesearch_issue97_release_manifests enable row level security;
alter table private_verification.brinesearch_issue97_release_manifests force row level security;
alter table private_verification.brinesearch_issue97_release_manifest_members enable row level security;
alter table private_verification.brinesearch_issue97_release_manifest_members force row level security;
alter table private_verification.brinesearch_issue97_verification_reports enable row level security;
alter table private_verification.brinesearch_issue97_verification_reports force row level security;
revoke all on private_verification.brinesearch_issue97_release_manifests from public,anon,authenticated,service_role;
revoke all on private_verification.brinesearch_issue97_release_manifest_members from public,anon,authenticated,service_role;
revoke all on private_verification.brinesearch_issue97_verification_reports from public,anon,authenticated,service_role;

create trigger brinesearch_issue97_release_manifest_immutable
before update or delete on private_verification.brinesearch_issue97_release_manifests
for each row execute function private_verification.brinesearch_issue97_reject_release_receipt_mutation();
create trigger brinesearch_issue97_release_manifest_member_immutable
before update or delete on private_verification.brinesearch_issue97_release_manifest_members
for each row execute function private_verification.brinesearch_issue97_reject_release_receipt_mutation();
create trigger brinesearch_issue97_verification_report_immutable
before update or delete on private_verification.brinesearch_issue97_verification_reports
for each row execute function private_verification.brinesearch_issue97_reject_release_receipt_mutation();

create or replace function private_verification.brinesearch_issue97_current_route_eligibility_members()
returns table(member_key text,member_value jsonb)
language sql
stable
security definer
set search_path=''
as $$
  select p.id::text,
    pg_catalog.jsonb_build_object(
      'pad_id',p.id,
      'structured_route_revision',coalesce(p.structured_route_revision,0),
      'road_sequence_status',coalesce(p.road_sequence_status,''),
      'route_prep_count',coalesce(prep.primary_count,0),
      'route_prep_digest',coalesce(prep.prep_digest,pg_catalog.md5('')),
      'route_reconciliation_digest',coalesce(rr.receipt_digest,''),
      'disposition',case
        when coalesce(prep.primary_count,0)=1
          and rr.route_status='route_ready'
          and rr.road_occurrence_count=rr.resolved_occurrence_count
          and rr.held_occurrence_count=0
          and rr.canonical_mapping_count=rr.road_occurrence_count
          and rr.exact_geometry_count=rr.road_occurrence_count
          then 'materialized'
        else 'held'
      end,
      'hold_reason',case
        when coalesce(prep.primary_count,0)=0 then 'no_active_primary_route_prep'
        when prep.primary_count<>1 then 'multiple_active_primary_route_preps'
        when rr.route_prep_id is null then 'missing_route_reconciliation_receipt'
        when rr.route_status<>'route_ready' then coalesce(nullif(array_to_string(rr.exception_reasons,','),''),rr.route_status,'route_not_ready')
        when rr.held_occurrence_count<>0 then 'held_route_occurrence'
        when rr.canonical_mapping_count<>rr.road_occurrence_count then 'canonical_mapping_incomplete'
        when rr.exact_geometry_count<>rr.road_occurrence_count then 'exact_geometry_incomplete'
        else null
      end
    )
  from public.pads p
  left join lateral (
    select count(*)::integer as primary_count,
      (array_agg(rp.id order by rp.variant_index,rp.id))[1] as route_prep_id,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        rp.id::text||':'||rp.route_group||':'||rp.variant_index::text||':'||
        coalesce(rp.source_sequence_hash,'')||':'||coalesce(rp.readiness_status,'')||':'||
        coalesce(rp.issue_codes::text,''),
        '|' order by rp.variant_index,rp.id
      ),'')) as prep_digest
    from public.brinesearch_route_prep rp
    where rp.pad_id=p.id and rp.active and rp.route_group='primary'
  ) prep on true
  left join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
    on rr.route_prep_id=prep.route_prep_id
  where coalesce(p.list_only,false)=false
  order by p.id
$$;
revoke all on function private_verification.brinesearch_issue97_current_route_eligibility_members()
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_release_manifest_integrity(
  p_manifest_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select header.member_count=count(*)
      and header.manifest_digest=pg_catalog.md5(coalesce(pg_catalog.string_agg(
        member.member_key||':'||member.member_value::text,
        '|' order by member.member_key
      ),''))
      and bool_and(member.member_digest=pg_catalog.md5(member.member_key||':'||member.member_value::text))
    from private_verification.brinesearch_issue97_release_manifests header
    left join private_verification.brinesearch_issue97_release_manifest_members member
      on member.manifest_id=header.id
    where header.id=p_manifest_id
    group by header.id,header.member_count,header.manifest_digest
  ),false)
$$;
revoke all on function private_verification.brinesearch_issue97_release_manifest_integrity(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_persist_release_manifest(
  p_manifest_kind text,
  p_manifest_key text,
  p_git_sha text,
  p_review_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_generation text;
  v_id uuid:=pg_catalog.gen_random_uuid();
  v_count integer;
  v_digest text;
begin
  if p_manifest_kind not in ('candidate_graphs','active_counties','source_scopes','route_eligibility')
     or coalesce(p_git_sha,'')!~'^[0-9a-f]{40}$'
     or pg_catalog.jsonb_typeof(p_review_details) is distinct from 'object'
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_by'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_at'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'evidence'),'') is null then
    raise exception 'Issue #97 reviewed release manifest arguments are incomplete';
  end if;
  v_generation:=private_verification.brinesearch_issue97_active_graph_release_generation();
  if nullif(v_generation,'') is null or not private_verification.brinesearch_issue97_release_manifest_current() then
    raise exception 'Issue #97 release generation/39-county/114-scope contract is not current';
  end if;

  drop table if exists pg_temp.tmp_issue97_release_manifest_members;
  create temporary table tmp_issue97_release_manifest_members(
    member_key text primary key,member_value jsonb not null
  ) on commit drop;

  if p_manifest_kind='candidate_graphs' then
    insert into tmp_issue97_release_manifest_members
    select b.state_code||':'||b.county_code,
      pg_catalog.jsonb_build_object(
        'state_code',b.state_code,'county_code',b.county_code,'build_id',b.id,
        'graph_digest',b.graph_digest,'source_revision_digest',b.source_revision_digest,
        'generation_key',b.details->>'release_generation_key'
      )
    from public.brinesearch_road_graph_builds b
    where b.status='validated' and b.activated_at is null
      and b.details->>'release_generation_key'=v_generation
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
    order by b.state_code,b.county_code;
    select count(*) into v_count from tmp_issue97_release_manifest_members;
    if v_count<>38 then
      raise exception 'Issue #97 candidate manifest requires 38 release-current dark builds plus retained OHI; found %',v_count;
    end if;
  elsif p_manifest_kind='active_counties' then
    insert into tmp_issue97_release_manifest_members
    select b.state_code||':'||b.county_code,
      pg_catalog.jsonb_build_object(
        'state_code',b.state_code,'county_code',b.county_code,'build_id',b.id,
        'graph_digest',b.graph_digest,'source_revision_digest',b.source_revision_digest
      )
    from public.brinesearch_road_graph_builds b
    where b.status='active'
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
    order by b.state_code,b.county_code;
    select count(*) into v_count from tmp_issue97_release_manifest_members;
    if v_count<>39 then raise exception 'Issue #97 active manifest requires exactly 39 release-current graphs; found %',v_count; end if;
  elsif p_manifest_kind='source_scopes' then
    insert into tmp_issue97_release_manifest_members
    select d.source_key||':'||scope.state_code||':'||scope.county_code,
      pg_catalog.jsonb_build_object(
        'source_key',d.source_key,'state_code',scope.state_code,'county_code',scope.county_code,
        'dataset_id',scope.dataset_id,'run_id',scope.last_success_run_id,
        'page_set_digest',run.details->>'page_set_digest','content_digest',run.details->>'content_digest'
      )
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
    join public.brinesearch_road_source_ingest_runs run on run.id=scope.last_success_run_id
    where scope.active and scope.ingest_enabled and scope.required_for_graph
      and private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      )
      and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
      and coalesce(run.details->>'page_set_digest','')~'^[0-9a-f]{32}$'
      and coalesce(run.details->>'content_digest','')~'^[0-9a-f]{32}$'
    order by d.source_key,scope.state_code,scope.county_code;
    select count(*) into v_count from tmp_issue97_release_manifest_members;
    if v_count<>114 then raise exception 'Issue #97 source manifest requires exactly 114 verified scopes; found %',v_count; end if;
  else
    insert into tmp_issue97_release_manifest_members
    select member_key,member_value
    from private_verification.brinesearch_issue97_current_route_eligibility_members();
    select count(*) into v_count from tmp_issue97_release_manifest_members;
    if v_count<>(select count(*) from public.pads where coalesce(list_only,false)=false) or v_count=0 then
      raise exception 'Issue #97 route eligibility manifest does not equal the exact non-list-only pad set';
    end if;
  end if;

  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    member_key||':'||member_value::text,'|' order by member_key
  ),'')) into v_count,v_digest
  from tmp_issue97_release_manifest_members;

  insert into private_verification.brinesearch_issue97_release_manifests(
    id,manifest_kind,manifest_key,generation_key,git_sha,member_count,manifest_digest,review_details
  ) values(v_id,p_manifest_kind,p_manifest_key,v_generation,p_git_sha,v_count,v_digest,p_review_details);
  insert into private_verification.brinesearch_issue97_release_manifest_members(
    manifest_id,member_key,member_value,member_digest
  ) select v_id,member_key,member_value,pg_catalog.md5(member_key||':'||member_value::text)
    from tmp_issue97_release_manifest_members order by member_key;

  if not private_verification.brinesearch_issue97_release_manifest_integrity(v_id) then
    raise exception 'Issue #97 persisted release manifest failed its child-row digest';
  end if;
  return pg_catalog.jsonb_build_object(
    'manifest_id',v_id,'manifest_kind',p_manifest_kind,'member_count',v_count,'manifest_digest',v_digest
  );
end
$$;
revoke all on function private_verification.brinesearch_issue97_persist_release_manifest(text,text,text,jsonb)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_candidate_manifest_activation_current(
  p_manifest_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  with header as (
    select * from private_verification.brinesearch_issue97_release_manifests
    where id=p_manifest_id and manifest_kind='candidate_graphs'
      and generation_key=private_verification.brinesearch_issue97_active_graph_release_generation()
  ), stored as (
    select member.member_key,member.member_value
    from header join private_verification.brinesearch_issue97_release_manifest_members member
      on member.manifest_id=header.id
  ), live as (
    select b.state_code||':'||b.county_code as member_key,
      pg_catalog.jsonb_build_object(
        'state_code',b.state_code,'county_code',b.county_code,'build_id',b.id,
        'graph_digest',b.graph_digest,'source_revision_digest',b.source_revision_digest,
        'generation_key',b.details->>'release_generation_key'
      ) as member_value
    from public.brinesearch_road_graph_builds b
    where b.status in ('validated','active')
      and b.details->>'release_generation_key'=
        private_verification.brinesearch_issue97_active_graph_release_generation()
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  )
  select coalesce(
    private_verification.brinesearch_issue97_release_manifest_integrity(p_manifest_id)
    and (select count(*) from stored)=38
    and not exists((select * from stored except select * from live)
      union all (select * from live except select * from stored)),false
  )
$$;
revoke all on function private_verification.brinesearch_issue97_candidate_manifest_activation_current(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_release_manifest_matches_live(
  p_manifest_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_header record;
  v_count integer;
  v_digest text;
begin
  select * into v_header from private_verification.brinesearch_issue97_release_manifests where id=p_manifest_id;
  if not found or not private_verification.brinesearch_issue97_release_manifest_integrity(p_manifest_id)
     or v_header.generation_key is distinct from private_verification.brinesearch_issue97_active_graph_release_generation()
  then return false; end if;

  if v_header.manifest_kind='active_counties' then
    with rows as (
      select b.state_code||':'||b.county_code as member_key,
        pg_catalog.jsonb_build_object(
          'state_code',b.state_code,'county_code',b.county_code,'build_id',b.id,
          'graph_digest',b.graph_digest,'source_revision_digest',b.source_revision_digest
        ) as member_value
      from public.brinesearch_road_graph_builds b
      where b.status='active' and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
    ) select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
        member_key||':'||member_value::text,'|' order by member_key
      ),'')) into v_count,v_digest from rows;
    return v_count=39 and v_count=v_header.member_count and v_digest=v_header.manifest_digest;
  elsif v_header.manifest_kind='source_scopes' then
    with rows as (
      select d.source_key||':'||scope.state_code||':'||scope.county_code as member_key,
        pg_catalog.jsonb_build_object(
          'source_key',d.source_key,'state_code',scope.state_code,'county_code',scope.county_code,
          'dataset_id',scope.dataset_id,'run_id',scope.last_success_run_id,
          'page_set_digest',run.details->>'page_set_digest','content_digest',run.details->>'content_digest'
        ) as member_value
      from public.brinesearch_road_source_dataset_counties scope
      join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
      join public.brinesearch_road_source_ingest_runs run on run.id=scope.last_success_run_id
      where scope.active and scope.ingest_enabled and scope.required_for_graph
        and private_verification.brinesearch_issue97_dataset_scope_current(scope.dataset_id,scope.state_code,scope.county_code)
        and private_verification.brinesearch_issue97_ingest_run_verified(run.id)
    ) select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
        member_key||':'||member_value::text,'|' order by member_key
      ),'')) into v_count,v_digest from rows;
    return v_count=114 and v_count=v_header.member_count and v_digest=v_header.manifest_digest;
  elsif v_header.manifest_kind='route_eligibility' then
    select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
      member_key||':'||member_value::text,'|' order by member_key
    ),'')) into v_count,v_digest
    from private_verification.brinesearch_issue97_current_route_eligibility_members();
    return v_count=v_header.member_count and v_digest=v_header.manifest_digest;
  elsif v_header.manifest_kind='candidate_graphs' then
    return private_verification.brinesearch_issue97_candidate_manifest_activation_current(p_manifest_id);
  end if;
  return false;
end
$$;
revoke all on function private_verification.brinesearch_issue97_release_manifest_matches_live(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(
  p_manifest_digest text,p_build_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select private_verification.brinesearch_issue97_candidate_manifest_activation_current(header.id)
      and exists(
        select 1 from private_verification.brinesearch_issue97_release_manifest_members member
        where member.manifest_id=header.id
          and member.member_value->>'build_id'=p_build_id::text
      )
    from private_verification.brinesearch_issue97_release_manifests header
    where header.manifest_kind='candidate_graphs' and header.manifest_digest=p_manifest_digest
  ),false)
$$;
revoke all on function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_persist_verification_report(
  p_git_sha text,
  p_candidate_manifest_id uuid,
  p_active_manifest_id uuid,
  p_source_manifest_id uuid,
  p_route_manifest_id uuid,
  p_pinned_fixture_results jsonb,
  p_review_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_generation text;
  v_reconcile record;
  v_child jsonb;
  v_phase1 jsonb;
  v_baseline record;
  v_migration_digest text;
  v_candidate_digest text;
  v_active_digest text;
  v_source_digest text;
  v_route_digest text;
  v_eligible integer;
  v_materialized integer;
  v_held integer;
  v_report_body jsonb;
  v_report_digest text;
  v_id uuid:=pg_catalog.gen_random_uuid();
  v_required_fixture_keys text[]:=array[
    'thrush','bellaire','leonard','cr26','possum',
    'cologie','repeated_road','shared_segment','long_chunk','parallel_shortcut'
  ];
begin
  if coalesce(p_git_sha,'')!~'^[0-9a-f]{40}$'
     or pg_catalog.jsonb_typeof(p_pinned_fixture_results) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_review_details) is distinct from 'object'
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_by'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_at'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'evidence'),'') is null then
    raise exception 'Issue #97 verification report arguments are incomplete';
  end if;
  if exists(select 1 from unnest(v_required_fixture_keys) key
      where coalesce((p_pinned_fixture_results->>key)::boolean,false) is not true) then
    raise exception 'Issue #97 verification report requires every pinned topology/product fixture to pass';
  end if;

  v_generation:=private_verification.brinesearch_issue97_active_graph_release_generation();
  if not private_verification.brinesearch_issue97_candidate_manifest_activation_current(p_candidate_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(p_active_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(p_source_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(p_route_manifest_id) then
    raise exception 'Issue #97 verification report requires exact current candidate/active/source/route manifests';
  end if;

  select manifest_digest into strict v_candidate_digest from private_verification.brinesearch_issue97_release_manifests
    where id=p_candidate_manifest_id and manifest_kind='candidate_graphs';
  select manifest_digest into strict v_active_digest from private_verification.brinesearch_issue97_release_manifests
    where id=p_active_manifest_id and manifest_kind='active_counties';
  select manifest_digest into strict v_source_digest from private_verification.brinesearch_issue97_release_manifests
    where id=p_source_manifest_id and manifest_kind='source_scopes';
  select manifest_digest,member_count into strict v_route_digest,v_eligible
    from private_verification.brinesearch_issue97_release_manifests
    where id=p_route_manifest_id and manifest_kind='route_eligibility';

  select count(*) filter(where member_value->>'disposition'='materialized')::integer,
    count(*) filter(where member_value->>'disposition'='held')::integer
  into v_materialized,v_held
  from private_verification.brinesearch_issue97_release_manifest_members
  where manifest_id=p_route_manifest_id;
  if v_materialized+v_held<>v_eligible then
    raise exception 'Issue #97 route eligibility manifest is not completely materialized-or-held';
  end if;

  select * into strict v_baseline from private_verification.brinesearch_issue97_saved_road_release_baseline where singleton;
  select * into v_reconcile from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
    where status='complete' order by completed_at desc,id desc limit 1;
  if not found then raise exception 'Issue #97 verification report requires a complete saved-road reconciliation'; end if;
  v_child:=private_verification.brinesearch_issue97_saved_road_child_receipt(v_reconcile.id);
  if v_reconcile.source_digest<>private_verification.brinesearch_issue97_saved_road_source_digest()
     or (v_child->>'occurrence_count')::integer<>v_baseline.expected_occurrence_count
     or v_child->>'inventory_digest'<>v_baseline.expected_inventory_digest
     or (v_child->>'route_critical_held_count')::integer<>0
     or (v_child->>'forbidden_resolution_count')::integer<>0 then
    raise exception 'Issue #97 verification report saved-road reconciliation is not current/release-safe';
  end if;

  v_phase1:=private_verification.brinesearch_issue97_phase1_release_gate();
  if coalesce((v_phase1->>'pass')::boolean,false) is not true then
    raise exception 'Issue #97 Phase 1 route occurrence/geometry gate is not green';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,''),'|' order by version
  ),'')) into v_migration_digest
  from supabase_migrations.schema_migrations;

  v_report_body:=pg_catalog.jsonb_build_object(
    'git_sha',p_git_sha,'migration_set_digest',v_migration_digest,'generation_key',v_generation,
    'candidate_graph_manifest_digest',v_candidate_digest,
    'active_county_manifest_digest',v_active_digest,
    'source_scope_manifest_digest',v_source_digest,
    'route_eligibility_manifest_digest',v_route_digest,
    'saved_road_reconciliation_run_id',v_reconcile.id,
    'saved_road_inventory_digest',v_child->>'inventory_digest',
    'pinned_fixture_results',p_pinned_fixture_results,
    'route_materialization_receipt',pg_catalog.jsonb_build_object(
      'complete',true,'eligible_total',v_eligible,'materialized_total',v_materialized,
      'explicit_held_total',v_held,'critical_hold_total',(v_child->>'route_critical_held_count')::integer,
      'forbidden_resolution_count',(v_child->>'forbidden_resolution_count')::integer,
      'phase1_gate',v_phase1
    ),
    'google_accounting_contract',pg_catalog.jsonb_build_object(
      'eligible_total',v_eligible,'required','ready_or_explicit_held_during_cutover_transaction',
      'stale_allowed',false,'public_ready_only',true
    )
  );
  v_report_digest:=pg_catalog.md5(v_report_body::text);

  insert into private_verification.brinesearch_issue97_verification_reports(
    id,report_digest,git_sha,migration_set_digest,generation_key,
    candidate_graph_manifest_id,active_county_manifest_id,source_scope_manifest_id,
    route_eligibility_manifest_id,saved_road_reconciliation_run_id,
    pinned_fixture_results,route_materialization_receipt,google_accounting_contract,
    report_body,review_details
  ) values(
    v_id,v_report_digest,p_git_sha,v_migration_digest,v_generation,
    p_candidate_manifest_id,p_active_manifest_id,p_source_manifest_id,p_route_manifest_id,
    v_reconcile.id,p_pinned_fixture_results,
    v_report_body->'route_materialization_receipt',v_report_body->'google_accounting_contract',
    v_report_body,p_review_details
  );

  return pg_catalog.jsonb_build_object('report_id',v_id,'verification_report_digest',v_report_digest);
end
$$;
revoke all on function private_verification.brinesearch_issue97_persist_verification_report(text,uuid,uuid,uuid,uuid,jsonb,jsonb)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_verification_report_current(
  p_report_digest text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_report record;
  v_baseline record;
  v_reconcile record;
  v_child jsonb;
  v_phase1 jsonb;
  v_migration_digest text;
  v_candidate_count integer;
  v_eligible integer;
begin
  select * into v_report from private_verification.brinesearch_issue97_verification_reports
  where report_digest=p_report_digest;
  if not found or v_report.report_digest<>pg_catalog.md5(v_report.report_body::text)
     or v_report.generation_key is distinct from private_verification.brinesearch_issue97_active_graph_release_generation() then
    return false;
  end if;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,''),'|' order by version
  ),'')) into v_migration_digest from supabase_migrations.schema_migrations;
  if v_report.migration_set_digest is distinct from v_migration_digest then return false; end if;

  if not private_verification.brinesearch_issue97_candidate_manifest_activation_current(v_report.candidate_graph_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.active_county_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.source_scope_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.route_eligibility_manifest_id) then
    return false;
  end if;

  select member_count into v_candidate_count from private_verification.brinesearch_issue97_release_manifests
    where id=v_report.candidate_graph_manifest_id;
  if v_candidate_count<>38 or exists(
    select 1 from private_verification.brinesearch_issue97_release_manifest_members candidate
    where candidate.manifest_id=v_report.candidate_graph_manifest_id
      and not exists(
        select 1 from private_verification.brinesearch_issue97_release_manifest_members active_member
        where active_member.manifest_id=v_report.active_county_manifest_id
          and active_member.member_value->>'build_id'=candidate.member_value->>'build_id'
      )
  ) then return false; end if;

  select * into strict v_baseline from private_verification.brinesearch_issue97_saved_road_release_baseline where singleton;
  select * into v_reconcile from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
    where id=v_report.saved_road_reconciliation_run_id and status='complete';
  if not found or v_reconcile.id is distinct from (
      select id from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
      where status='complete' order by completed_at desc,id desc limit 1
    ) or v_reconcile.source_digest<>private_verification.brinesearch_issue97_saved_road_source_digest() then
    return false;
  end if;
  v_child:=private_verification.brinesearch_issue97_saved_road_child_receipt(v_reconcile.id);
  if (v_child->>'occurrence_count')::integer<>v_baseline.expected_occurrence_count
     or v_child->>'inventory_digest'<>v_baseline.expected_inventory_digest
     or (v_child->>'route_critical_held_count')::integer<>0
     or (v_child->>'forbidden_resolution_count')::integer<>0 then return false; end if;

  v_phase1:=private_verification.brinesearch_issue97_phase1_release_gate();
  if coalesce((v_phase1->>'pass')::boolean,false) is not true
     or v_report.route_materialization_receipt->'phase1_gate' is distinct from v_phase1 then return false; end if;

  select member_count into v_eligible from private_verification.brinesearch_issue97_release_manifests
    where id=v_report.route_eligibility_manifest_id;
  if (v_report.route_materialization_receipt->>'eligible_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'materialized_total')::integer+
        (v_report.route_materialization_receipt->>'explicit_held_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'critical_hold_total')::integer<>0
     or (v_report.route_materialization_receipt->>'forbidden_resolution_count')::integer<>0
     or (v_report.google_accounting_contract->>'eligible_total')::integer<>v_eligible
     or coalesce((v_report.google_accounting_contract->>'stale_allowed')::boolean,true) then return false; end if;

  if exists(select 1 from unnest(array[
      'thrush','bellaire','leonard','cr26','possum',
      'cologie','repeated_road','shared_segment','long_chunk','parallel_shortcut'
    ]) key where coalesce((v_report.pinned_fixture_results->>key)::boolean,false) is not true) then return false; end if;

  return true;
end
$$;
revoke all on function private_verification.brinesearch_issue97_verification_report_current(text)
from public,anon,authenticated,service_role;
