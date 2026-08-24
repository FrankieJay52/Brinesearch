-- GitHub #97 — continuation of explicit topology/release currentness rollout.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create or replace function private_verification.brinesearch_issue97_stamp_graph_release_receipt()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_generation record;
  v_source_content_digest text;
  v_builder_md5 text;
  v_mapper_md5 text;
begin
  if tg_op='UPDATE' and old.details ? 'release_generation_key' then
    if new.details->>'release_generation_key' is distinct from old.details->>'release_generation_key'
       or new.details->>'release_builder_md5' is distinct from old.details->>'release_builder_md5'
       or new.details->>'release_supplemental_mapper_md5' is distinct from old.details->>'release_supplemental_mapper_md5'
       or new.details->>'release_source_content_digest' is distinct from old.details->>'release_source_content_digest' then
      raise exception 'Issue #97 graph release receipt is immutable after validation';
    end if;
  end if;

  if tg_op='UPDATE' and new.status='validated' and old.status='staging' then
    select * into strict v_generation
    from private_verification.brinesearch_issue97_graph_release_generations where active;
    v_builder_md5:=pg_catalog.md5(pg_catalog.pg_get_functiondef(
      'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
    ));
    v_mapper_md5:=pg_catalog.md5(pg_catalog.pg_get_functiondef(
      'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
    ));
    if new.started_at<v_generation.activated_at then
      raise exception 'Issue #97 pre-generation graph cannot be stamped as a current release build';
    end if;
    if v_builder_md5<>v_generation.builder_definition_md5
       or v_mapper_md5<>v_generation.supplemental_mapper_md5
       or new.algorithm_version<>v_generation.algorithm_version then
      raise exception 'Issue #97 graph cannot validate under an unapproved builder/materializer generation';
    end if;

    -- Compute from NEW.source_run_vector directly because the row is being
    -- finalized in this same BEFORE trigger and the table still contains OLD.
    with entries as (
      select e.value as entry
      from pg_catalog.jsonb_array_elements(coalesce(new.details->'source_run_vector','[]'::jsonb)) e
    ), resolved as (
      select entry,r.id as run_id,r.details->>'content_digest' as content_digest
      from entries left join public.brinesearch_road_source_ingest_runs r
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
      into v_source_content_digest from summary;
    if coalesce(v_source_content_digest,'')!~'^[0-9a-f]{32}$' then
      raise exception 'Issue #97 graph validation lacks complete source content receipts';
    end if;

    new.details:=new.details||pg_catalog.jsonb_build_object(
      'release_generation_key',v_generation.generation_key,
      'release_builder_md5',v_builder_md5,
      'release_supplemental_mapper_md5',v_mapper_md5,
      'release_source_content_digest',v_source_content_digest,
      'release_source_content_contract',v_generation.source_content_contract,
      'release_receipt_stamped_at',pg_catalog.clock_timestamp()
    );
  end if;
  return new;
end
$$;
revoke all on function private_verification.brinesearch_issue97_stamp_graph_release_receipt()
from public,anon,authenticated,service_role;

drop trigger if exists brinesearch_issue97_stamp_graph_release_receipt
on public.brinesearch_road_graph_builds;
create trigger brinesearch_issue97_stamp_graph_release_receipt
before update of status,details on public.brinesearch_road_graph_builds
for each row execute function private_verification.brinesearch_issue97_stamp_graph_release_receipt();

create or replace function private_verification.brinesearch_issue97_graph_build_release_current(
  p_build_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_build record;
  v_generation record;
  v_current_content text;
  v_qualification record;
begin
  select * into v_build from public.brinesearch_road_graph_builds where id=p_build_id;
  if not found or v_build.status not in ('active','validated') then return false; end if;
  if not private_verification.brinesearch_issue97_graph_build_sources_current(p_build_id) then
    return false;
  end if;
  select * into v_generation
  from private_verification.brinesearch_issue97_graph_release_generations where active;
  if not found then return false; end if;
  v_current_content:=private_verification.brinesearch_issue97_graph_source_content_digest(p_build_id);
  if coalesce(v_current_content,'')!~'^[0-9a-f]{32}$' then return false; end if;

  if v_build.details->>'release_generation_key'=v_generation.generation_key
     and v_build.details->>'release_builder_md5'=v_generation.builder_definition_md5
     and v_build.details->>'release_supplemental_mapper_md5'=v_generation.supplemental_mapper_md5
     and v_build.details->>'release_source_content_digest'=v_current_content
     and v_build.algorithm_version=v_generation.algorithm_version then
    return true;
  end if;

  select * into v_qualification
  from private_verification.brinesearch_issue97_graph_release_qualifications q
  where q.build_id=p_build_id and q.active and q.generation_key=v_generation.generation_key;
  if not found then return false; end if;
  return v_qualification.graph_digest=v_build.graph_digest
    and v_qualification.source_revision_digest=v_build.source_revision_digest
    and v_qualification.mapping_snapshot_digest=v_build.details->>'mapping_snapshot_digest'
    and v_qualification.source_content_digest=v_current_content
    and v_qualification.qualification_digest=pg_catalog.md5(
      p_build_id::text||':'||v_generation.generation_key||':'||v_build.graph_digest||':'||
      v_build.source_revision_digest||':'||(v_build.details->>'mapping_snapshot_digest')||':'||v_current_content
    );
end
$$;
revoke all on function private_verification.brinesearch_issue97_graph_build_release_current(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_prepare_graph_release_current_cache()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  drop table if exists pg_temp.tmp_issue97_graph_release_current_cache;
  create temporary table tmp_issue97_graph_release_current_cache(
    build_id uuid primary key,current boolean not null
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

create or replace function private_verification.brinesearch_issue97_graph_build_release_current_cached(
  p_build_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_current boolean;
begin
  if pg_catalog.to_regclass('pg_temp.tmp_issue97_graph_release_current_cache') is null then
    return false;
  end if;
  select current into v_current
  from pg_temp.tmp_issue97_graph_release_current_cache where build_id=p_build_id;
  return coalesce(v_current,false);
end
$$;
revoke all on function private_verification.brinesearch_issue97_graph_build_release_current_cached(uuid)
from public,anon,authenticated,service_role;

-- OHI is the one historical generation that already passed the exact full
-- shared-provenance/Thrush audit. Requalify it without rewriting its build row.
-- The two new Possum bridge identities do not participate in OHI memberships.
