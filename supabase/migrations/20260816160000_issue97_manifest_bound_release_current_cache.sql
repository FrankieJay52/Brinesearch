-- GitHub #97 — manifest-bound release-current cache for state dark reconciliation.
--
-- Root cause: the Ohio pad loop called route-corpus reconciliation once per pad.
-- Both the corpus entrypoint and each route identity solver dropped and rebuilt a
-- transaction-local cache across every retained active/validated graph, and each
-- build recomputed the complete source/name/supplemental release-current contract.
-- The exact audited state manifest is already the approved graph set. Prepare that
-- exact set once per transaction, keep cache misses fail-closed, and let hot route
-- consumers reuse the immutable snapshot. Generic callers outside a prepared
-- manifest transaction retain the complete live predicate.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

-- Generic/global preparation remains available for the reviewed all-state
-- diagnostic lane. It may never replace or coexist with declared state-manifest
-- context.
create or replace function private_verification.brinesearch_issue97_prepare_graph_release_current_cache()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_expected_context boolean:=
    nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_state_manifest_id',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_state_manifest_digest',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_state_code',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_generation_key',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_member_count',true
    ),'') is not null;
begin
  if v_expected_context
     or pg_catalog.to_regclass(
       'pg_temp.tmp_issue97_graph_release_current_cache_context'
     ) is not null then
    raise exception
      'Issue #97 generic release-current cache cannot replace state-manifest context';
  end if;
  drop table if exists pg_temp.tmp_issue97_graph_release_current_cache;
  create temporary table tmp_issue97_graph_release_current_cache(
    build_id uuid primary key,
    current boolean not null
  ) on commit drop;
  insert into tmp_issue97_graph_release_current_cache(build_id,current)
  select b.id,private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  from public.brinesearch_road_graph_builds b
  where b.status in ('active','validated')
  order by b.id;
end
$$;
revoke all on function private_verification.brinesearch_issue97_prepare_graph_release_current_cache()
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(
  p_manifest_id uuid,
  p_manifest_digest text,
  p_state_code text,
  p_generation_key text,
  p_member_count integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_manifest_id is null
     or p_manifest_digest !~ '^[0-9a-f]{32}$'
     or p_state_code not in ('OH','WV','PA')
     or nullif(p_generation_key,'') is null
     or p_member_count is null or p_member_count<=0 then
    raise exception 'Issue #97 expected state-manifest cache arguments are invalid';
  end if;

  if nullif(pg_catalog.current_setting(
       'brinesearch.issue97_expected_state_manifest_id',true
     ),'') is distinct from p_manifest_id::text
     or nullif(pg_catalog.current_setting(
       'brinesearch.issue97_expected_state_manifest_digest',true
     ),'') is distinct from p_manifest_digest
     or nullif(pg_catalog.current_setting(
       'brinesearch.issue97_expected_state_code',true
     ),'') is distinct from p_state_code
     or nullif(pg_catalog.current_setting(
       'brinesearch.issue97_expected_generation_key',true
     ),'') is distinct from p_generation_key
     or nullif(pg_catalog.current_setting(
       'brinesearch.issue97_expected_member_count',true
     ),'') is distinct from p_member_count::text then
    raise exception
      'Issue #97 expected transaction state-manifest context is absent or mismatched';
  end if;
end
$$;
revoke all on function
  private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(
    uuid,text,text,text,integer
  )
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(
  p_manifest_id uuid,
  p_manifest_digest text,
  p_state_code text,
  p_generation_key text,
  p_member_count integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_context record;
  v_context_count integer;
  v_manifest_count integer;
  v_manifest_member_digest text;
  v_cache_count integer;
  v_release_current_count integer;
  v_cache_member_digest text;
begin
  perform private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(
    p_manifest_id,p_manifest_digest,p_state_code,p_generation_key,p_member_count
  );

  if pg_catalog.to_regclass(
       'pg_temp.tmp_issue97_graph_release_current_cache'
     ) is null
     or pg_catalog.to_regclass(
       'pg_temp.tmp_issue97_graph_release_current_cache_context'
     ) is null then
    raise exception 'Issue #97 state-manifest cache/context pair is partial or missing';
  end if;

  select count(*)::integer into v_context_count
  from pg_temp.tmp_issue97_graph_release_current_cache_context;
  if v_context_count<>1 then
    raise exception 'Issue #97 state-manifest cache context requires exactly one row; found %',
      v_context_count;
  end if;
  select context.* into strict v_context
  from pg_temp.tmp_issue97_graph_release_current_cache_context context;

  if v_context.manifest_id is distinct from p_manifest_id
     or v_context.manifest_digest is distinct from p_manifest_digest
     or v_context.state_code is distinct from p_state_code
     or v_context.generation_key is distinct from p_generation_key
     or v_context.member_count is distinct from p_member_count
     or v_context.cache_scope is distinct from 'exact_state_manifest'
     or v_context.cache_miss_policy is distinct from 'fail_closed'
     or v_context.full_predicate_evaluation_count is distinct from p_member_count
     or v_context.prepared_at is null
     or nullif(v_context.preparation_token,'') is null then
    raise exception 'Issue #97 state-manifest cache context differs from expected context';
  end if;

  if not exists(
    select 1
    from private_verification.brinesearch_issue97_state_candidate_manifests manifest
    where manifest.id=p_manifest_id
      and manifest.manifest_digest=p_manifest_digest
      and manifest.state_code=p_state_code
      and manifest.generation_key=p_generation_key
      and manifest.member_count=p_member_count
  ) or not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(
    p_manifest_id
  ) then
    raise exception 'Issue #97 expected state manifest header/integrity changed';
  end if;

  select count(*)::integer,pg_catalog.md5(coalesce(pg_catalog.string_agg(
    member.member_key||':'||(member.member_value->>'build_id')||':'||
      (member.member_value->>'graph_digest')||':'||
      (member.member_value->>'source_revision_digest'),
    '|' order by member.member_key
  ),''))
  into v_manifest_count,v_manifest_member_digest
  from private_verification.brinesearch_issue97_state_candidate_manifest_members member
  where member.manifest_id=p_manifest_id;

  select count(*)::integer,count(*) filter(where cache.current)::integer,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      cache.build_id::text||':'||cache.current::text,
      '|' order by cache.build_id
    ),''))
  into v_cache_count,v_release_current_count,v_cache_member_digest
  from pg_temp.tmp_issue97_graph_release_current_cache cache;

  if v_manifest_count<>p_member_count
     or v_cache_count<>p_member_count
     or v_release_current_count<>p_member_count
     or v_context.manifest_member_digest is distinct from v_manifest_member_digest
     or v_context.cache_member_digest is distinct from v_cache_member_digest then
    raise exception 'Issue #97 state-manifest cache count/current/digest verification failed';
  end if;

  if exists(
    (select (member.member_value->>'build_id')::uuid
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id
     except
     select cache.build_id
     from pg_temp.tmp_issue97_graph_release_current_cache cache)
    union all
    (select cache.build_id
     from pg_temp.tmp_issue97_graph_release_current_cache cache
     except
     select (member.member_value->>'build_id')::uuid
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id)
  ) then
    raise exception 'Issue #97 state-manifest cache member set differs from manifest';
  end if;

  return pg_catalog.jsonb_build_object(
    'manifest_id',v_context.manifest_id,
    'manifest_digest',v_context.manifest_digest,
    'state_code',v_context.state_code,
    'generation_key',v_context.generation_key,
    'member_count',v_context.member_count,
    'release_current_count',v_release_current_count,
    'source_scope_count',v_context.source_scope_count,
    'manifest_member_digest',v_context.manifest_member_digest,
    'cache_member_digest',v_context.cache_member_digest,
    'prepared_at',v_context.prepared_at,
    'preparation_token',v_context.preparation_token,
    'full_predicate_evaluation_count',v_context.full_predicate_evaluation_count,
    'cache_scope',v_context.cache_scope,
    'cache_miss_policy',v_context.cache_miss_policy,
    'global_cutover_authorized',false
  );
end
$$;
revoke all on function
  private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(
    uuid,text,text,text,integer
  )
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(
  p_manifest_id uuid,
  p_manifest_digest text,
  p_state_code text,
  p_generation_key text,
  p_member_count integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  return private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(
    p_manifest_id,p_manifest_digest,p_state_code,p_generation_key,p_member_count
  )||pg_catalog.jsonb_build_object('reused',true);
end
$$;
revoke all on function
  private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(
    uuid,text,text,text,integer
  )
from public,anon,authenticated,service_role;

-- Patched corpus/solver callers use this compatibility entrypoint. A complete
-- declared state context routes only to the strict state helper; partial context
-- fails. With no declared state context, the historical generic/global behavior
-- remains available for the separate all-state diagnostic lane.
create or replace function private_verification.brinesearch_issue97_ensure_graph_release_current_cache()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_manifest_id text:=nullif(pg_catalog.current_setting(
    'brinesearch.issue97_expected_state_manifest_id',true
  ),'');
  v_manifest_digest text:=nullif(pg_catalog.current_setting(
    'brinesearch.issue97_expected_state_manifest_digest',true
  ),'');
  v_state_code text:=nullif(pg_catalog.current_setting(
    'brinesearch.issue97_expected_state_code',true
  ),'');
  v_generation_key text:=nullif(pg_catalog.current_setting(
    'brinesearch.issue97_expected_generation_key',true
  ),'');
  v_member_count text:=nullif(pg_catalog.current_setting(
    'brinesearch.issue97_expected_member_count',true
  ),'');
  v_context_values integer;
begin
  v_context_values:=
    (v_manifest_id is not null)::integer+
    (v_manifest_digest is not null)::integer+
    (v_state_code is not null)::integer+
    (v_generation_key is not null)::integer+
    (v_member_count is not null)::integer;

  if v_context_values not in (0,5) then
    raise exception 'Issue #97 expected transaction state-manifest context is partial';
  end if;
  if v_context_values=5 then
    if v_manifest_id !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or v_member_count !~ '^[1-9][0-9]*$' then
      raise exception 'Issue #97 expected transaction state-manifest context is invalid';
    end if;
    perform private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(
      v_manifest_id::uuid,v_manifest_digest,v_state_code,v_generation_key,
      v_member_count::integer
    );
    return;
  end if;

  if pg_catalog.to_regclass(
       'pg_temp.tmp_issue97_graph_release_current_cache_context'
     ) is not null then
    raise exception 'Issue #97 state-manifest cache context exists without expected transaction context';
  end if;
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_graph_release_current_cache') is null then
    perform private_verification.brinesearch_issue97_prepare_graph_release_current_cache();
  end if;
end
$$;
revoke all on function private_verification.brinesearch_issue97_ensure_graph_release_current_cache()
from public,anon,authenticated,service_role;

-- A declared or present state cache is usable only after strict context/set
-- verification. Outside state-manifest mode, retain generic cached behavior and
-- the complete live predicate when no cache exists.
create or replace function private_verification.brinesearch_issue97_graph_build_release_current_contextual(
  p_build_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_state_context boolean:=
    pg_catalog.to_regclass(
      'pg_temp.tmp_issue97_graph_release_current_cache_context'
    ) is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_state_manifest_id',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_state_manifest_digest',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_state_code',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_generation_key',true
    ),'') is not null
    or nullif(pg_catalog.current_setting(
      'brinesearch.issue97_expected_member_count',true
    ),'') is not null;
begin
  if v_state_context then
    perform private_verification.brinesearch_issue97_ensure_graph_release_current_cache();
    return private_verification.brinesearch_issue97_graph_build_release_current_cached(p_build_id);
  end if;
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_graph_release_current_cache') is not null then
    return private_verification.brinesearch_issue97_graph_build_release_current_cached(p_build_id);
  end if;
  return private_verification.brinesearch_issue97_graph_build_release_current(p_build_id);
end
$$;
revoke all on function private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
  p_manifest_id uuid,
  p_manifest_digest text,
  p_state_code text,
  p_generation_key text,
  p_member_count integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_header record;
  v_expected_count integer;
  v_member_count integer;
  v_exact_build_count integer;
  v_active_build_count integer;
  v_source_scope_count integer;
  v_current_source_scope_count integer;
  v_release_current_count integer;
  v_manifest_member_digest text;
  v_cache_member_digest text;
  v_prepared_at timestamptz;
  v_preparation_token text;
  v_cache_exists boolean;
  v_context_exists boolean;
begin
  perform private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(
    p_manifest_id,p_manifest_digest,p_state_code,p_generation_key,p_member_count
  );

  v_cache_exists:=pg_catalog.to_regclass(
    'pg_temp.tmp_issue97_graph_release_current_cache'
  ) is not null;
  v_context_exists:=pg_catalog.to_regclass(
    'pg_temp.tmp_issue97_graph_release_current_cache_context'
  ) is not null;
  if v_cache_exists or v_context_exists then
    if not v_cache_exists or not v_context_exists then
      raise exception 'Issue #97 state-manifest cache/context pair is partial or missing';
    end if;
    return private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(
      p_manifest_id,p_manifest_digest,p_state_code,p_generation_key,p_member_count
    )||pg_catalog.jsonb_build_object('reused',true);
  end if;

  select manifest.* into v_header
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id=p_manifest_id
    and manifest.manifest_digest=p_manifest_digest
    and manifest.state_code=p_state_code
    and manifest.generation_key=p_generation_key
    and manifest.member_count=p_member_count;
  if not found then
    raise exception 'Issue #97 manifest-bound cache requires the exact expected state manifest';
  end if;
  if v_header.state_code not in ('OH','WV','PA') then
    raise exception 'Issue #97 manifest-bound cache refuses unsupported state %',v_header.state_code;
  end if;
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 manifest-bound state cache is forbidden after global cutover';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 manifest-bound state cache refuses a staging graph';
  end if;
  if v_header.generation_key is distinct from
       private_verification.brinesearch_issue97_active_graph_release_generation() then
    raise exception 'Issue #97 state manifest release generation is not current';
  end if;
  if not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(p_manifest_id) then
    raise exception 'Issue #97 state manifest child-row digest failed';
  end if;

  select count(*)::integer into v_expected_count
  from public.brinesearch_road_graph_counties county
  where county.active and county.state_code=v_header.state_code;
  if v_expected_count=0 or v_expected_count<>p_member_count
     or v_header.member_count<>v_expected_count then
    raise exception
      'Issue #97 manifest-bound cache expected % registered counties but manifest header has %',
      v_expected_count,v_header.member_count;
  end if;

  select count(*)::integer into v_member_count
  from private_verification.brinesearch_issue97_state_candidate_manifest_members member
  where member.manifest_id=p_manifest_id;
  if v_member_count<>v_expected_count then
    raise exception
      'Issue #97 manifest-bound cache expected % exact members but found %',
      v_expected_count,v_member_count;
  end if;

  if exists(
    select 1
    from private_verification.brinesearch_issue97_state_candidate_manifest_members member
    where member.manifest_id=p_manifest_id
      and (
        member.member_key is distinct from
          v_header.state_code||':'||coalesce(member.member_value->>'county_code','')
        or member.member_value->>'state_code' is distinct from v_header.state_code
        or member.member_value->>'generation_key' is distinct from v_header.generation_key
        or coalesce(member.member_value->>'build_id','') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(member.member_value->>'graph_digest','') !~ '^[0-9a-f]{32}$'
        or coalesce(member.member_value->>'source_revision_digest','') !~ '^[0-9a-f]{32}$'
      )
  ) then
    raise exception 'Issue #97 state manifest member shape/generation is invalid';
  end if;

  if exists(
    (select county.state_code||':'||county.county_code
     from public.brinesearch_road_graph_counties county
     where county.active and county.state_code=v_header.state_code
     except
     select member.member_key
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id)
    union all
    (select member.member_key
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id
     except
     select county.state_code||':'||county.county_code
     from public.brinesearch_road_graph_counties county
     where county.active and county.state_code=v_header.state_code)
  ) then
    raise exception 'Issue #97 state manifest county set changed';
  end if;

  select count(*)::integer,
    count(*) filter(where private_verification.brinesearch_issue97_dataset_scope_current(
      scope.dataset_id,scope.state_code,scope.county_code
    ))::integer
  into v_source_scope_count,v_current_source_scope_count
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled and scope.required_for_graph
    and scope.state_code=v_header.state_code;
  if v_source_scope_count=0 or v_current_source_scope_count<>v_source_scope_count then
    raise exception
      'Issue #97 manifest-bound cache requires every % source scope current; found %/%',
      v_header.state_code,v_current_source_scope_count,v_source_scope_count;
  end if;

  select count(*)::integer into v_exact_build_count
  from private_verification.brinesearch_issue97_state_candidate_manifest_members member
  join public.brinesearch_road_graph_builds build
    on build.id=(member.member_value->>'build_id')::uuid
   and build.state_code=v_header.state_code
   and build.county_code=member.member_value->>'county_code'
   and build.graph_digest=member.member_value->>'graph_digest'
   and build.source_revision_digest=member.member_value->>'source_revision_digest'
   and build.status='active'
  where member.manifest_id=p_manifest_id;
  if v_exact_build_count<>v_expected_count then
    raise exception
      'Issue #97 manifest-bound cache exact active build match failed: expected %, found %',
      v_expected_count,v_exact_build_count;
  end if;

  select count(*)::integer into v_active_build_count
  from public.brinesearch_road_graph_builds build
  where build.state_code=v_header.state_code and build.status='active';
  if v_active_build_count<>v_expected_count then
    raise exception
      'Issue #97 manifest-bound cache requires exactly % active % builds; found %',
      v_expected_count,v_header.state_code,v_active_build_count;
  end if;

  if exists(
    (select build.state_code||':'||build.county_code,build.id::text
     from public.brinesearch_road_graph_builds build
     where build.state_code=v_header.state_code and build.status='active'
     except
     select member.member_key,member.member_value->>'build_id'
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id)
    union all
    (select member.member_key,member.member_value->>'build_id'
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id
     except
     select build.state_code||':'||build.county_code,build.id::text
     from public.brinesearch_road_graph_builds build
     where build.state_code=v_header.state_code and build.status='active')
  ) then
    raise exception 'Issue #97 manifest-bound cache active build set differs from the immutable manifest';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    member.member_key||':'||(member.member_value->>'build_id')||':'||
      (member.member_value->>'graph_digest')||':'||
      (member.member_value->>'source_revision_digest'),
    '|' order by member.member_key
  ),'')) into v_manifest_member_digest
  from private_verification.brinesearch_issue97_state_candidate_manifest_members member
  where member.manifest_id=p_manifest_id;

  create temporary table tmp_issue97_graph_release_current_cache(
    build_id uuid primary key,
    current boolean not null
  ) on commit drop;

  insert into tmp_issue97_graph_release_current_cache(build_id,current)
  select (member.member_value->>'build_id')::uuid,
    private_verification.brinesearch_issue97_graph_build_release_current(
      (member.member_value->>'build_id')::uuid
    )
  from private_verification.brinesearch_issue97_state_candidate_manifest_members member
  where member.manifest_id=p_manifest_id
  order by member.member_key;

  select count(*)::integer,count(*) filter(where cache.current)::integer,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      cache.build_id::text||':'||cache.current::text,
      '|' order by cache.build_id
    ),''))
  into v_member_count,v_release_current_count,v_cache_member_digest
  from pg_temp.tmp_issue97_graph_release_current_cache cache;
  if v_member_count<>v_expected_count or v_release_current_count<>v_expected_count then
    raise exception
      'Issue #97 manifest-bound cache requires %/% exact members release-current; found %/%',
      v_expected_count,v_expected_count,v_release_current_count,v_member_count;
  end if;

  create temporary table tmp_issue97_graph_release_current_cache_context(
    manifest_id uuid primary key,
    manifest_digest text not null,
    state_code text not null,
    generation_key text not null,
    member_count integer not null,
    source_scope_count integer not null,
    manifest_member_digest text not null,
    cache_member_digest text not null,
    full_predicate_evaluation_count integer not null,
    cache_scope text not null,
    cache_miss_policy text not null,
    prepared_at timestamptz not null,
    preparation_token text not null
  ) on commit drop;
  v_prepared_at:=pg_catalog.clock_timestamp();
  v_preparation_token:=pg_catalog.md5(pg_catalog.concat_ws(
    ':',p_manifest_id::text,p_manifest_digest,pg_catalog.pg_backend_pid()::text,
    v_prepared_at::text
  ));
  insert into tmp_issue97_graph_release_current_cache_context(
    manifest_id,manifest_digest,state_code,generation_key,member_count,
    source_scope_count,manifest_member_digest,cache_member_digest,
    full_predicate_evaluation_count,cache_scope,cache_miss_policy,
    prepared_at,preparation_token
  ) values(
    v_header.id,v_header.manifest_digest,v_header.state_code,v_header.generation_key,
    v_expected_count,v_source_scope_count,v_manifest_member_digest,v_cache_member_digest,
    v_expected_count,'exact_state_manifest','fail_closed',
    v_prepared_at,v_preparation_token
  );

  return private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(
    p_manifest_id,p_manifest_digest,p_state_code,p_generation_key,p_member_count
  )||pg_catalog.jsonb_build_object('reused',false);
end
$$;
revoke all on function
  private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
    uuid,text,text,text,integer
  )
from public,anon,authenticated,service_role;

-- Once an exact transaction snapshot exists, neither the corpus entrypoint nor
-- the per-route recursive solver may drop/rebuild it.
do $issue97_patch_manifest_cache_consumers$
declare
  v_signature text;
  v_definition text;
  v_old text:='perform private_verification.brinesearch_issue97_prepare_graph_release_current_cache();';
  v_new text:='perform private_verification.brinesearch_issue97_ensure_graph_release_current_cache();';
  v_expected_md5 text;
  v_matches integer;
begin
  for v_signature,v_expected_md5 in
    select * from (values
      ('public.brinesearch_issue97_reconcile_route_corpus(uuid)',
       'cbfcec5e9f814399f1ec69ee4974cb4b'),
      ('private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)',
       'e9e0b2d7000c21595ef102fb99f4cb6c')
    ) expected(signature,definition_md5)
  loop
    select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature))
      into strict v_definition;
    if pg_catalog.md5(v_definition)<>v_expected_md5 then
      raise exception 'Issue #97 manifest-cache patch target changed: %',v_signature;
    end if;
    v_matches:=(pg_catalog.length(v_definition)-
      pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/
      pg_catalog.length(v_old);
    if v_matches<>1 then
      raise exception 'Issue #97 manifest-cache patch expected one cache prepare in %, found %',
        v_signature,v_matches;
    end if;
    execute pg_catalog.replace(v_definition,v_old,v_new);
  end loop;
end
$issue97_patch_manifest_cache_consumers$;

-- Transition generation is part of the same per-route hot path. Bind all seven
-- complete-currentness checks to the prepared snapshot when present, while
-- preserving complete live evaluation for every caller without a snapshot.
do $issue97_patch_transition_release_current$
declare
  v_definition text;
  v_old text:='private_verification.brinesearch_issue97_graph_build_release_current(';
  v_new text:='private_verification.brinesearch_issue97_graph_build_release_current_contextual(';
  v_matches integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'9e381ce3e36b4c05483992d11e642b01' then
    raise exception 'Issue #97 transition manifest-cache patch target changed';
  end if;
  v_matches:=(pg_catalog.length(v_definition)-
    pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/
    pg_catalog.length(v_old);
  if v_matches<>7 then
    raise exception 'Issue #97 transition manifest-cache patch expected 7 release-current calls; found %',
      v_matches;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_transition_release_current$;

do $issue97_verify_manifest_bound_cache$
declare
  v_definition text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_reconcile_route_corpus(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like
       '%perform private_verification.brinesearch_issue97_ensure_graph_release_current_cache();%'
     or v_definition like
       '%perform private_verification.brinesearch_issue97_prepare_graph_release_current_cache();%' then
    raise exception 'Issue #97 route corpus does not preserve a prepared manifest cache';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like
       '%perform private_verification.brinesearch_issue97_ensure_graph_release_current_cache();%'
     or v_definition like
       '%perform private_verification.brinesearch_issue97_prepare_graph_release_current_cache();%' then
    raise exception 'Issue #97 route identity solver does not preserve a prepared manifest cache';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  v_count:=(pg_catalog.length(v_definition)-
    pg_catalog.length(pg_catalog.replace(
      v_definition,
      'private_verification.brinesearch_issue97_graph_build_release_current_contextual(',
      ''
    )))/pg_catalog.length(
      'private_verification.brinesearch_issue97_graph_build_release_current_contextual('
    );
  if v_count<>7 or v_definition like
       '%private_verification.brinesearch_issue97_graph_build_release_current(%' then
    raise exception 'Issue #97 transition currentness is not fully snapshot-bound';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_graph_build_release_current_cached(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like
       '%select current into v_current%where build_id=p_build_id;%'
     or v_definition not like '%return coalesce(v_current,false);%' then
    raise exception 'Issue #97 cached release-current miss is not fail-closed';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like
       '%brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(%'
     or v_definition like
       '%brinesearch_issue97_prepare_graph_release_current_cache();%' then
    raise exception 'Issue #97 strict state-manifest ensure can reach global preparation';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_ensure_graph_release_current_cache()'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like
       '%brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(%'
     or v_definition not like
       '%expected transaction state-manifest context is partial%'
     or v_definition not like
       '%brinesearch_issue97_prepare_graph_release_current_cache();%' then
    raise exception 'Issue #97 compatibility ensure does not separate strict state and generic lanes';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like '%jsonb_build_object(''reused'',true)%'
     or v_definition not like '%jsonb_build_object(''reused'',false)%'
     or v_definition like '%drop table%'
     or v_definition like '%status in (''active'',''validated'')%' then
    raise exception 'Issue #97 state-manifest preparation is not reuse-only and exact-member-bound';
  end if;

  if exists(
    select 1
    from (values
      ('private_verification.brinesearch_issue97_prepare_graph_release_current_cache()'),
      ('private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(uuid,text,text,text,integer)'),
      ('private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'),
      ('private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)'),
      ('private_verification.brinesearch_issue97_ensure_graph_release_current_cache()'),
      ('private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)'),
      ('private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)')
    ) helper(signature)
    cross join (values('anon'),('authenticated'),('service_role')) api_role(role_name)
    where pg_catalog.has_function_privilege(
      api_role.role_name,helper.signature,'EXECUTE'
    )
  ) then
    raise exception 'Issue #97 manifest-bound cache helper is exposed to an API role';
  end if;
end
$issue97_verify_manifest_bound_cache$;
