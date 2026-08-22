-- GitHub #97 — state-scoped audited graph activation without weakening the
-- final all-state release/cutover contract.
--
-- Ohio-first rollout needs to activate an already-audited state's exact graph
-- set so that pad/route reconciliation can run against those release-current
-- graphs before WV/PA are rebuilt. Global cutover remains OFF. The final global
-- candidate manifest/report still binds the exact 38 new release-generation
-- builds (retained OHI is compatibility-qualified separately).

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create temporary table issue97_state_activation_before on commit drop as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_road_graph_builds) as build_count,
  (select count(*) from public.brinesearch_road_graph_builds where status='active') as active_count,
  (select count(*) from public.brinesearch_road_graph_builds where status='staging') as staging_count,
  (select count(*) from public.brinesearch_road_junctions) as junction_count,
  (select count(*) from public.brinesearch_road_junction_anchors) as anchor_count,
  (select count(*) from public.brinesearch_road_junction_memberships) as membership_count;

create table private_verification.brinesearch_issue97_state_candidate_manifests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  state_code text not null check(state_code in ('OH','WV','PA')),
  manifest_key text not null unique,
  generation_key text not null references
    private_verification.brinesearch_issue97_graph_release_generations(generation_key) on delete restrict,
  git_sha text not null check(git_sha~'^[0-9a-f]{40}$'),
  member_count integer not null check(member_count>0),
  manifest_digest text not null unique check(manifest_digest~'^[0-9a-f]{32}$'),
  review_details jsonb not null check(pg_catalog.jsonb_typeof(review_details)='object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  check(nullif(pg_catalog.btrim(review_details->>'reviewed_by'),'') is not null),
  check(nullif(pg_catalog.btrim(review_details->>'reviewed_at'),'') is not null),
  check(nullif(pg_catalog.btrim(review_details->>'evidence'),'') is not null)
);

create table private_verification.brinesearch_issue97_state_candidate_manifest_members (
  manifest_id uuid not null references
    private_verification.brinesearch_issue97_state_candidate_manifests(id) on delete restrict,
  member_key text not null check(nullif(pg_catalog.btrim(member_key),'') is not null),
  member_value jsonb not null check(pg_catalog.jsonb_typeof(member_value)='object'),
  member_digest text not null check(member_digest~'^[0-9a-f]{32}$'),
  primary key(manifest_id,member_key),
  unique(manifest_id,member_digest),
  check(member_digest=pg_catalog.md5(member_key||':'||member_value::text))
);

alter table private_verification.brinesearch_issue97_state_candidate_manifests enable row level security;
alter table private_verification.brinesearch_issue97_state_candidate_manifests force row level security;
alter table private_verification.brinesearch_issue97_state_candidate_manifest_members enable row level security;
alter table private_verification.brinesearch_issue97_state_candidate_manifest_members force row level security;
revoke all on private_verification.brinesearch_issue97_state_candidate_manifests
from public,anon,authenticated,service_role;
revoke all on private_verification.brinesearch_issue97_state_candidate_manifest_members
from public,anon,authenticated,service_role;

create trigger brinesearch_issue97_state_candidate_manifest_immutable
before update or delete on private_verification.brinesearch_issue97_state_candidate_manifests
for each row execute function private_verification.brinesearch_issue97_reject_release_receipt_mutation();
create trigger brinesearch_issue97_state_candidate_manifest_member_immutable
before update or delete on private_verification.brinesearch_issue97_state_candidate_manifest_members
for each row execute function private_verification.brinesearch_issue97_reject_release_receipt_mutation();

create or replace function private_verification.brinesearch_issue97_current_state_candidate_members(
  p_state_code text
)
returns table(member_key text,member_value jsonb)
language sql
stable
security definer
set search_path=''
as $$
  select build.state_code||':'||build.county_code,
    pg_catalog.jsonb_build_object(
      'state_code',build.state_code,
      'county_code',build.county_code,
      'build_id',build.id,
      'graph_digest',build.graph_digest,
      'source_revision_digest',build.source_revision_digest,
      'generation_key',private_verification.brinesearch_issue97_active_graph_release_generation()
    )
  from public.brinesearch_road_graph_counties county
  join public.brinesearch_road_graph_builds build
    on build.state_code=county.state_code and build.county_code=county.county_code
  where county.active
    and county.state_code=pg_catalog.upper(p_state_code)
    and build.status in ('validated','active')
    and private_verification.brinesearch_issue97_graph_build_release_current(build.id)
  order by build.state_code,build.county_code,build.id
$$;
revoke all on function private_verification.brinesearch_issue97_current_state_candidate_members(text)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_state_candidate_manifest_integrity(
  p_manifest_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select header.member_count=count(member.member_key)
      and header.manifest_digest=pg_catalog.md5(coalesce(pg_catalog.string_agg(
        member.member_key||':'||member.member_value::text,
        '|' order by member.member_key
      ),''))
      and bool_and(member.member_digest=
        pg_catalog.md5(member.member_key||':'||member.member_value::text))
    from private_verification.brinesearch_issue97_state_candidate_manifests header
    left join private_verification.brinesearch_issue97_state_candidate_manifest_members member
      on member.manifest_id=header.id
    where header.id=p_manifest_id
    group by header.id,header.member_count,header.manifest_digest
  ),false)
$$;
revoke all on function private_verification.brinesearch_issue97_state_candidate_manifest_integrity(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_persist_state_candidate_manifest(
  p_state_code text,
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
  v_state text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_state_code,'')));
  v_generation text;
  v_expected integer;
  v_count integer;
  v_distinct integer;
  v_digest text;
  v_id uuid:=pg_catalog.gen_random_uuid();
begin
  if v_state not in ('OH','WV','PA')
     or nullif(pg_catalog.btrim(coalesce(p_manifest_key,'')),'') is null
     or coalesce(p_git_sha,'')!~'^[0-9a-f]{40}$'
     or pg_catalog.jsonb_typeof(p_review_details) is distinct from 'object'
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_by'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_at'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'evidence'),'') is null then
    raise exception 'Issue #97 state candidate manifest arguments are incomplete';
  end if;
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 state candidate manifests are forbidden after global cutover';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 state candidate manifest refuses a staging graph';
  end if;
  if exists(
    select 1
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets dataset
      on dataset.id=scope.dataset_id and dataset.active
    where scope.active and scope.ingest_enabled and scope.required_for_graph
      and scope.state_code=v_state
      and not private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      )
  ) then
    raise exception 'Issue #97 state candidate manifest requires all % source scopes current',v_state;
  end if;

  v_generation:=private_verification.brinesearch_issue97_active_graph_release_generation();
  if nullif(v_generation,'') is null then
    raise exception 'Issue #97 active graph release generation is missing';
  end if;
  select count(*)::integer into v_expected
  from public.brinesearch_road_graph_counties
  where active and state_code=v_state;
  if v_expected=0 then raise exception 'Issue #97 state candidate has no registered counties'; end if;

  drop table if exists pg_temp.tmp_issue97_state_candidate_members;
  create temporary table tmp_issue97_state_candidate_members(
    member_key text primary key,
    member_value jsonb not null
  ) on commit drop;
  insert into tmp_issue97_state_candidate_members(member_key,member_value)
  select member_key,member_value
  from private_verification.brinesearch_issue97_current_state_candidate_members(v_state);

  select count(*)::integer,count(distinct member_key)::integer,
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      member_key||':'||member_value::text,'|' order by member_key
    ),''))
  into v_count,v_distinct,v_digest
  from tmp_issue97_state_candidate_members;
  if v_count<>v_expected or v_distinct<>v_expected then
    raise exception 'Issue #97 % state candidate requires exactly one release-current validated/active build for each of % counties; found %',
      v_state,v_expected,v_count;
  end if;

  insert into private_verification.brinesearch_issue97_state_candidate_manifests(
    id,state_code,manifest_key,generation_key,git_sha,member_count,manifest_digest,review_details
  ) values(
    v_id,v_state,p_manifest_key,v_generation,p_git_sha,v_count,v_digest,p_review_details
  );
  insert into private_verification.brinesearch_issue97_state_candidate_manifest_members(
    manifest_id,member_key,member_value,member_digest
  )
  select v_id,member_key,member_value,
    pg_catalog.md5(member_key||':'||member_value::text)
  from tmp_issue97_state_candidate_members
  order by member_key;

  if not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(v_id) then
    raise exception 'Issue #97 state candidate manifest failed child-row digest';
  end if;
  return pg_catalog.jsonb_build_object(
    'manifest_id',v_id,'state_code',v_state,'member_count',v_count,
    'manifest_digest',v_digest,'global_cutover_authorized',false
  );
end
$$;
revoke all on function private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_state_candidate_manifest_current(
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
  v_expected integer;
  v_live integer;
  v_live_distinct integer;
begin
  select * into v_header
  from private_verification.brinesearch_issue97_state_candidate_manifests
  where id=p_manifest_id;
  if not found
     or public.brinesearch_issue97_cutover_active()
     or v_header.generation_key is distinct from
       private_verification.brinesearch_issue97_active_graph_release_generation()
     or not private_verification.brinesearch_issue97_state_candidate_manifest_integrity(p_manifest_id)
  then return false; end if;

  if exists(
    select 1
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets dataset
      on dataset.id=scope.dataset_id and dataset.active
    where scope.active and scope.ingest_enabled and scope.required_for_graph
      and scope.state_code=v_header.state_code
      and not private_verification.brinesearch_issue97_dataset_scope_current(
        scope.dataset_id,scope.state_code,scope.county_code
      )
  ) then return false; end if;

  select count(*)::integer into v_expected
  from public.brinesearch_road_graph_counties
  where active and state_code=v_header.state_code;
  select count(*)::integer,count(distinct member_key)::integer
  into v_live,v_live_distinct
  from private_verification.brinesearch_issue97_current_state_candidate_members(v_header.state_code);
  if v_header.member_count<>v_expected or v_live<>v_expected or v_live_distinct<>v_expected then
    return false;
  end if;

  return not exists(
    (select member.member_key,member.member_value
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id
     except
     select live.member_key,live.member_value
     from private_verification.brinesearch_issue97_current_state_candidate_members(v_header.state_code) live)
    union all
    (select live.member_key,live.member_value
     from private_verification.brinesearch_issue97_current_state_candidate_members(v_header.state_code) live
     except
     select member.member_key,member.member_value
     from private_verification.brinesearch_issue97_state_candidate_manifest_members member
     where member.manifest_id=p_manifest_id)
  );
end
$$;
revoke all on function private_verification.brinesearch_issue97_state_candidate_manifest_current(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_state_candidate_manifest_authorizes_build(
  p_manifest_digest text,
  p_build_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select private_verification.brinesearch_issue97_state_candidate_manifest_current(header.id)
      and exists(
        select 1
        from private_verification.brinesearch_issue97_state_candidate_manifest_members member
        where member.manifest_id=header.id
          and member.member_value->>'build_id'=p_build_id::text
      )
    from private_verification.brinesearch_issue97_state_candidate_manifests header
    where header.manifest_digest=p_manifest_digest
  ),false)
$$;
revoke all on function private_verification.brinesearch_issue97_state_candidate_manifest_authorizes_build(text,uuid)
from public,anon,authenticated,service_role;

-- After state-by-state activation, the final global 38-build candidate manifest
-- must still be persistable from the exact same release-generation builds. OHI
-- remains excluded because it is the separately qualified compatibility graph.
do $issue97_global_candidate_after_state_activation$
declare
  v_definition text;
  v_old text:='where b.status=''validated'' and b.activated_at is null';
  v_new text:='where b.status in (''validated'',''active'') and not (b.state_code=''WV'' and b.county_code=''OHI'')';
  v_matches integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_persist_release_manifest(text,text,text,jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  v_matches:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_matches<>1 then
    raise exception 'Issue #97 global candidate persistence state-activation anchor changed: matches=%',v_matches;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_global_candidate_after_state_activation$;

-- Keep the existing activation call site unchanged: candidate_manifest_digest
-- may now resolve either to the final global candidate manifest or to one exact
-- state-scoped audited manifest. Neither path authorizes global cutover.
create or replace function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(
  p_manifest_digest text,
  p_build_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_global_id uuid;
begin
  select header.id into v_global_id
  from private_verification.brinesearch_issue97_release_manifests header
  where header.manifest_kind='candidate_graphs'
    and header.manifest_digest=p_manifest_digest;
  if found then
    return private_verification.brinesearch_issue97_candidate_manifest_activation_current(v_global_id)
      and exists(
        select 1
        from private_verification.brinesearch_issue97_release_manifest_members member
        where member.manifest_id=v_global_id
          and member.member_value->>'build_id'=p_build_id::text
      );
  end if;
  return private_verification.brinesearch_issue97_state_candidate_manifest_authorizes_build(
    p_manifest_digest,p_build_id
  );
end
$$;
revoke all on function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)
from public,anon,authenticated,service_role;

comment on function private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb) is
  'Issue #97 private state activation receipt. Binds every registered county in exactly one state to one release-current validated/active graph at an exact Git SHA. Does not authorize global cutover.';
comment on function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid) is
  'Issue #97 activation authorization resolver. Accepts either the exact final global candidate manifest or an exact current state candidate manifest; global cutover remains separately report-gated.';

do $issue97_state_activation_manifest_verify$
declare
  v_before issue97_state_activation_before%rowtype;
  v_persist text;
  v_authorizer text;
  v_activation text;
begin
  select * into strict v_before from issue97_state_activation_before;
  if public.brinesearch_issue97_cutover_active() is distinct from v_before.cutover_active
     or (select count(*) from public.brinesearch_road_graph_builds)<>v_before.build_count
     or (select count(*) from public.brinesearch_road_graph_builds where status='active')<>v_before.active_count
     or (select count(*) from public.brinesearch_road_graph_builds where status='staging')<>v_before.staging_count
     or (select count(*) from public.brinesearch_road_junctions)<>v_before.junction_count
     or (select count(*) from public.brinesearch_road_junction_anchors)<>v_before.anchor_count
     or (select count(*) from public.brinesearch_road_junction_memberships)<>v_before.membership_count then
    raise exception 'Issue #97 state activation manifest migration changed graph/cutover state';
  end if;
  if pg_catalog.has_table_privilege(
       'service_role','private_verification.brinesearch_issue97_state_candidate_manifests','SELECT'
     ) or pg_catalog.has_table_privilege(
       'service_role','private_verification.brinesearch_issue97_state_candidate_manifest_members','SELECT'
     ) or pg_catalog.has_function_privilege(
       'service_role','private_verification.brinesearch_issue97_persist_state_candidate_manifest(text,text,text,jsonb)','EXECUTE'
     ) then
    raise exception 'Issue #97 state candidate release evidence is exposed to service_role';
  end if;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_persist_release_manifest(text,text,text,jsonb)'::pg_catalog.regprocedure
  ) into strict v_persist;
  if v_persist not like '%status in (''validated'',''active'')%'
     or v_persist not like '%not (b.state_code=''WV'' and b.county_code=''OHI'')%' then
    raise exception 'Issue #97 final global candidate manifest cannot survive state-by-state activation';
  end if;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(text,uuid)'::pg_catalog.regprocedure
  ) into strict v_authorizer;
  if v_authorizer not like '%brinesearch_issue97_candidate_manifest_activation_current%'
     or v_authorizer not like '%brinesearch_issue97_state_candidate_manifest_authorizes_build%' then
    raise exception 'Issue #97 activation authorizer lost global/state manifest resolution';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into strict v_activation;
  if v_activation not like '%brinesearch_issue97_candidate_manifest_authorizes_build%'
     or v_activation not like '%candidate_manifest_digest%' then
    raise exception 'Issue #97 graph activation is no longer bound to reviewed manifest evidence';
  end if;
end
$issue97_state_activation_manifest_verify$;
