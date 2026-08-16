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

-- A generic global preparation must clear any prior manifest context. It remains
-- available for non-state/global diagnostics, but the fixed state lane does not
-- call it.
create or replace function private_verification.brinesearch_issue97_prepare_graph_release_current_cache()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  drop table if exists pg_temp.tmp_issue97_graph_release_current_cache_context;
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

create or replace function private_verification.brinesearch_issue97_ensure_graph_release_current_cache()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_graph_release_current_cache') is null then
    perform private_verification.brinesearch_issue97_prepare_graph_release_current_cache();
  end if;
end
$$;
revoke all on function private_verification.brinesearch_issue97_ensure_graph_release_current_cache()
from public,anon,authenticated,service_role;

-- Use the prepared transaction snapshot when present. Outside a prepared
-- transaction, preserve the complete authoritative live predicate.
create or replace function private_verification.brinesearch_issue97_graph_build_release_current_contextual(
  p_build_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_graph_release_current_cache') is not null then
    return private_verification.brinesearch_issue97_graph_build_release_current_cached(p_build_id);
  end if;
  return private_verification.brinesearch_issue97_graph_build_release_current(p_build_id);
end
$$;
revoke all on function private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
  p_manifest_id uuid
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
begin
  select manifest.* into v_header
  from private_verification.brinesearch_issue97_state_candidate_manifests manifest
  where manifest.id=p_manifest_id;
  if not found then
    raise exception 'Issue #97 manifest-bound cache requires an existing state manifest';
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
  if v_expected_count=0 or v_header.member_count<>v_expected_count then
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

  drop table if exists pg_temp.tmp_issue97_graph_release_current_cache_context;
  drop table if exists pg_temp.tmp_issue97_graph_release_current_cache;
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

  select count(*)::integer,count(*) filter(where cache.current)::integer
  into v_member_count,v_release_current_count
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
    prepared_at timestamptz not null
  ) on commit drop;
  insert into tmp_issue97_graph_release_current_cache_context(
    manifest_id,manifest_digest,state_code,generation_key,member_count,
    source_scope_count,prepared_at
  ) values(
    v_header.id,v_header.manifest_digest,v_header.state_code,v_header.generation_key,
    v_expected_count,v_source_scope_count,pg_catalog.clock_timestamp()
  );

  return pg_catalog.jsonb_build_object(
    'manifest_id',v_header.id,
    'manifest_digest',v_header.manifest_digest,
    'state_code',v_header.state_code,
    'generation_key',v_header.generation_key,
    'member_count',v_expected_count,
    'release_current_count',v_release_current_count,
    'source_scope_count',v_source_scope_count,
    'cache_scope','exact_state_manifest',
    'cache_miss_policy','fail_closed',
    'global_cutover_authorized',false
  );
end
$$;
revoke all on function
  private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid)
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

  if exists(
    select 1
    from (values
      ('private_verification.brinesearch_issue97_ensure_graph_release_current_cache()'),
      ('private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)'),
      ('private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid)')
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
