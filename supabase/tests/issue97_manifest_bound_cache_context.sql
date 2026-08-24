-- GitHub #97 — executable rollback-only state-manifest cache hardening regression.
-- This installs the unshipped migration in the current transaction, exercises
-- only cache/context behavior, and always rolls every database object back.
\set ON_ERROR_STOP on
\pset pager off
\timing on

begin;
set local statement_timeout='15min';
set local lock_timeout='2min';

\ir ../migrations/20260816160000_issue97_manifest_bound_release_current_cache.sql

select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_manifest_id',
  'c41f5320-1273-470c-a316-28b42211d697',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_manifest_digest',
  '9763dc5bb626da71881b7381ed28a436',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_state_code','OH',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_generation_key',
  'issue97-release-20260815-r2',true
);
select pg_catalog.set_config(
  'brinesearch.issue97_expected_member_count','19',true
);

create or replace function pg_temp.issue97_expect_error(
  p_setup text,
  p_statement text,
  p_message_fragment text
)
returns void
language plpgsql
set search_path=''
as $$
declare
  v_failed boolean:=false;
  v_message text;
begin
  begin
    if nullif(p_setup,'') is not null then
      execute p_setup;
    end if;
    execute p_statement;
  exception when others then
    v_failed:=true;
    v_message:=sqlerrm;
  end;
  if not v_failed then
    raise exception 'Issue #97 regression expected an error containing %',p_message_fragment;
  end if;
  if pg_catalog.strpos(v_message,p_message_fragment)=0 then
    raise exception 'Issue #97 regression expected error containing %, received %',
      p_message_fragment,v_message;
  end if;
end
$$;

create temporary table tmp_issue97_manifest_cache_first_result on commit drop as
select private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
  'c41f5320-1273-470c-a316-28b42211d697'::uuid,
  '9763dc5bb626da71881b7381ed28a436','OH',
  'issue97-release-20260815-r2',19
) as result;

create temporary table tmp_issue97_manifest_cache_test_baseline on commit drop as
select pg_catalog.to_regclass(
    'pg_temp.tmp_issue97_graph_release_current_cache'
  )::oid as cache_oid,
  cache_relation.relfilenode as cache_relfilenode,
  context.*
from pg_temp.tmp_issue97_graph_release_current_cache_context context
join pg_catalog.pg_class cache_relation
  on cache_relation.oid=pg_catalog.to_regclass(
    'pg_temp.tmp_issue97_graph_release_current_cache'
  );

do $issue97_initial_cache_assertions$
declare
  v_nonmember uuid;
begin
  if (select result->>'reused'
      from pg_temp.tmp_issue97_manifest_cache_first_result)<>'false' then
    raise exception 'Issue #97 first state-manifest preparation did not report reused=false';
  end if;
  if (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache)<>19
     or exists(
       select 1 from pg_temp.tmp_issue97_graph_release_current_cache where not current
     ) then
    raise exception 'Issue #97 exact Ohio cache is not 19/19 current';
  end if;
  if exists(
    (select (member.member_value->>'build_id')::uuid
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id='c41f5320-1273-470c-a316-28b42211d697'::uuid
     except select build_id from pg_temp.tmp_issue97_graph_release_current_cache)
    union all
    (select build_id from pg_temp.tmp_issue97_graph_release_current_cache
     except
     select (member.member_value->>'build_id')::uuid
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id='c41f5320-1273-470c-a316-28b42211d697'::uuid)
  ) then
    raise exception 'Issue #97 cache IDs differ from the exact Ohio manifest';
  end if;
  select build.id into v_nonmember
  from public.brinesearch_road_graph_builds build
  where build.status in ('active','validated')
    and not exists(
      select 1
      from private_verification.brinesearch_issue97_state_candidate_manifest_members member
      where member.manifest_id='c41f5320-1273-470c-a316-28b42211d697'::uuid
        and (member.member_value->>'build_id')::uuid=build.id
    )
  order by build.id limit 1;
  if v_nonmember is null
     or exists(select 1 from pg_temp.tmp_issue97_graph_release_current_cache
       where build_id=v_nonmember)
     or private_verification.brinesearch_issue97_graph_build_release_current_cached(
       v_nonmember
     ) then
    raise exception 'Issue #97 historical/nonmember cache exclusion failed';
  end if;
end
$issue97_initial_cache_assertions$;

select private_verification.brinesearch_issue97_ensure_graph_release_current_cache();
select private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(
  'c41f5320-1273-470c-a316-28b42211d697'::uuid,
  '9763dc5bb626da71881b7381ed28a436','OH',
  'issue97-release-20260815-r2',19
);

create temporary table tmp_issue97_manifest_cache_reuse_result on commit drop as
select private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
  'c41f5320-1273-470c-a316-28b42211d697'::uuid,
  '9763dc5bb626da71881b7381ed28a436','OH',
  'issue97-release-20260815-r2',19
) as result;

do $issue97_reuse_assertions$
begin
  if (select result->>'reused'
      from pg_temp.tmp_issue97_manifest_cache_reuse_result)<>'true' then
    raise exception 'Issue #97 repeated preparation did not report reused=true';
  end if;
  if exists(
    select 1
    from pg_temp.tmp_issue97_manifest_cache_test_baseline baseline
    cross join pg_temp.tmp_issue97_graph_release_current_cache_context context
    join pg_catalog.pg_class cache_relation
      on cache_relation.oid=pg_catalog.to_regclass(
        'pg_temp.tmp_issue97_graph_release_current_cache'
      )
    where baseline.cache_oid<>cache_relation.oid
      or baseline.cache_relfilenode<>cache_relation.relfilenode
      or baseline.prepared_at<>context.prepared_at
      or baseline.preparation_token<>context.preparation_token
      or baseline.manifest_member_digest<>context.manifest_member_digest
      or baseline.cache_member_digest<>context.cache_member_digest
      or baseline.full_predicate_evaluation_count<>
         context.full_predicate_evaluation_count
  ) then
    raise exception 'Issue #97 same-manifest reuse rebuilt or changed cache/context evidence';
  end if;
end
$issue97_reuse_assertions$;

-- Direct proof that same-manifest prepare does not call the complete predicate:
-- temporarily replace it with a fail-fast function, require reuse to succeed,
-- then roll the replacement back to this savepoint.
savepoint issue97_no_recompute;
create or replace function private_verification.brinesearch_issue97_graph_build_release_current(
  p_build_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Issue #97 regression full predicate was recomputed for %',p_build_id;
end
$$;
do $issue97_no_recompute_assertion$
declare
  v_result jsonb;
begin
  v_result:=private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(
    'c41f5320-1273-470c-a316-28b42211d697'::uuid,
    '9763dc5bb626da71881b7381ed28a436','OH',
    'issue97-release-20260815-r2',19
  );
  if v_result->>'reused'<>'true' then
    raise exception 'Issue #97 fail-fast predicate reuse proof did not report reuse';
  end if;
end
$issue97_no_recompute_assertion$;
rollback to savepoint issue97_no_recompute;
release savepoint issue97_no_recompute;

-- Cross-manifest and expected-context mismatches must fail without replacing the
-- exact Ohio cache.
select pg_temp.issue97_expect_error(
  $setup$select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_id','11111111-1111-4111-8111-111111111111',true)$setup$,
  $statement$select private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest('11111111-1111-4111-8111-111111111111'::uuid,'9763dc5bb626da71881b7381ed28a436','OH','issue97-release-20260815-r2',19)$statement$,
  'cache context differs from expected context'
);
select pg_temp.issue97_expect_error(
  $setup$select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_id','11111111-1111-4111-8111-111111111111',true)$setup$,
  $statement$select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()$statement$,
  'cache context differs from expected context'
);
select pg_temp.issue97_expect_error(
  $setup$select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_digest','00000000000000000000000000000000',true)$setup$,
  $statement$select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()$statement$,
  'cache context differs from expected context'
);
select pg_temp.issue97_expect_error(
  $setup$select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_id','',true)$setup$,
  $statement$select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()$statement$,
  'expected transaction state-manifest context is partial'
);

-- Every partial or tampered temp-state case must fail in a subtransaction; the
-- caught error rolls the tamper back before the next case.
select pg_temp.issue97_expect_error(
  'drop table pg_temp.tmp_issue97_graph_release_current_cache_context',
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache/context pair is partial or missing'
);
select pg_temp.issue97_expect_error(
  'drop table pg_temp.tmp_issue97_graph_release_current_cache',
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache/context pair is partial or missing'
);
select pg_temp.issue97_expect_error(
  $setup$update pg_temp.tmp_issue97_graph_release_current_cache_context set manifest_id='11111111-1111-4111-8111-111111111111'::uuid$setup$,
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache context differs from expected context'
);
select pg_temp.issue97_expect_error(
  $setup$update pg_temp.tmp_issue97_graph_release_current_cache_context set manifest_digest='00000000000000000000000000000000'$setup$,
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache context differs from expected context'
);
select pg_temp.issue97_expect_error(
  'update pg_temp.tmp_issue97_graph_release_current_cache_context set member_count=18',
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache context differs from expected context'
);
select pg_temp.issue97_expect_error(
  $setup$insert into pg_temp.tmp_issue97_graph_release_current_cache(build_id,current) values('11111111-1111-4111-8111-111111111111'::uuid,true)$setup$,
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache count/current/digest verification failed'
);
select pg_temp.issue97_expect_error(
  $setup$delete from pg_temp.tmp_issue97_graph_release_current_cache where build_id=(select build_id from pg_temp.tmp_issue97_graph_release_current_cache order by build_id limit 1)$setup$,
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache count/current/digest verification failed'
);
select pg_temp.issue97_expect_error(
  $setup$update pg_temp.tmp_issue97_graph_release_current_cache set current=false where build_id=(select build_id from pg_temp.tmp_issue97_graph_release_current_cache order by build_id limit 1)$setup$,
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache count/current/digest verification failed'
);
select pg_temp.issue97_expect_error(
  $setup$insert into pg_temp.tmp_issue97_graph_release_current_cache_context(manifest_id,manifest_digest,state_code,generation_key,member_count,source_scope_count,manifest_member_digest,cache_member_digest,full_predicate_evaluation_count,cache_scope,cache_miss_policy,prepared_at,preparation_token) select '11111111-1111-4111-8111-111111111111'::uuid,manifest_digest,state_code,generation_key,member_count,source_scope_count,manifest_member_digest,cache_member_digest,full_predicate_evaluation_count,cache_scope,cache_miss_policy,prepared_at,preparation_token from pg_temp.tmp_issue97_graph_release_current_cache_context$setup$,
  'select private_verification.brinesearch_issue97_ensure_graph_release_current_cache()',
  'cache context requires exactly one row'
);

-- With no state declaration and no temp snapshot, contextual currentness keeps
-- its original complete-live behavior rather than manufacturing state context.
savepoint issue97_generic_context;
drop table pg_temp.tmp_issue97_graph_release_current_cache_context;
drop table pg_temp.tmp_issue97_graph_release_current_cache;
select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_id','',true);
select pg_catalog.set_config('brinesearch.issue97_expected_state_manifest_digest','',true);
select pg_catalog.set_config('brinesearch.issue97_expected_state_code','',true);
select pg_catalog.set_config('brinesearch.issue97_expected_generation_key','',true);
select pg_catalog.set_config('brinesearch.issue97_expected_member_count','',true);
do $issue97_generic_live_predicate$
begin
  if not private_verification.brinesearch_issue97_graph_build_release_current_contextual(
    '8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb'::uuid
  ) then
    raise exception 'Issue #97 generic contextual full-live predicate compatibility failed';
  end if;
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_graph_release_current_cache') is not null
     or pg_catalog.to_regclass(
       'pg_temp.tmp_issue97_graph_release_current_cache_context'
     ) is not null then
    raise exception 'Issue #97 generic contextual lookup created unexpected cache state';
  end if;
end
$issue97_generic_live_predicate$;
rollback to savepoint issue97_generic_context;
release savepoint issue97_generic_context;

-- Final exact state-cache proof after all caught tamper cases.
select private_verification.brinesearch_issue97_ensure_graph_release_current_cache();
do $issue97_final_cache_assertion$
begin
  if (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache)<>19
     or (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache_context)<>1
     or exists(select 1 from pg_temp.tmp_issue97_graph_release_current_cache where not current) then
    raise exception 'Issue #97 final exact state cache was not preserved';
  end if;
end
$issue97_final_cache_assertion$;

rollback;
\echo 'Issue #97 rollback-only manifest-context cache regression passed; no reconciliation/build/activation/cutover/publication was invoked.'
