-- GitHub #97 — complete release-currentness with graph-relevant derived inputs.
--
-- Source-run/content and canonical mapping freshness remain separate evidence.
-- A release-current graph must also bind the active authoritative names and the
-- active supplemental centerline mapping/disposition rows that can influence
-- its member identities. This closes the case where an out-of-band derived
-- name/mapping change leaves the stored ingest-run content receipt unchanged.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create or replace function private_verification.brinesearch_issue97_graph_name_input_digest(
  p_build_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  with identities as (
    select distinct membership.identity_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction
      on junction.id=membership.junction_id
    where junction.build_id=p_build_id
  )
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    name.identity_id::text||':'||name.source_dataset_id::text||':'||
    name.source_record_id||':'||name.name_type||':'||name.road_name||':'||
    coalesce(name.source_segment_key,'')||':'||coalesce(name.from_measure::text,'')||':'||
    coalesce(name.to_measure::text,'')||':'||name.provenance::text,
    '|' order by name.identity_id,name.source_dataset_id,name.source_record_id,
      name.name_type,name.road_name,name.id
  ),''))
  from public.brinesearch_authoritative_road_names name
  join identities using(identity_id)
  where name.active
$$;

create or replace function private_verification.brinesearch_issue97_graph_supplemental_input_digest(
  p_build_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  with identities as (
    select distinct membership.identity_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction
      on junction.id=membership.junction_id
    where junction.build_id=p_build_id
  ), rows as (
    select centerline.id as centerline_id,centerline.source_feature_key,
      centerline.source_digest,centerline.last_ingest_run_id,
      mapping.identity_id,mapping.mapping_status,mapping.mapping_method,
      mapping.source_segment_keys,mapping.evidence,
      disposition.disposition,disposition.candidate_count,
      disposition.verified_mapping_count,disposition.evidence as disposition_evidence
    from identities
    join public.brinesearch_supplemental_centerline_identity_mappings mapping
      on mapping.identity_id=identities.identity_id and mapping.active
    join public.brinesearch_authoritative_supplemental_centerlines centerline
      on centerline.id=mapping.centerline_id and centerline.active
      and mapping.ingest_run_id=centerline.last_ingest_run_id
    left join public.brinesearch_supplemental_centerline_dispositions disposition
      on disposition.centerline_id=centerline.id and disposition.active
      and disposition.ingest_run_id=centerline.last_ingest_run_id
  )
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    centerline_id::text||':'||source_feature_key||':'||source_digest||':'||
    coalesce(last_ingest_run_id::text,'')||':'||identity_id::text||':'||
    mapping_status||':'||mapping_method||':'||source_segment_keys::text||':'||
    evidence::text||':'||coalesce(disposition,'missing')||':'||
    coalesce(candidate_count::text,'')||':'||coalesce(verified_mapping_count::text,'')||':'||
    coalesce(disposition_evidence::text,''),
    '|' order by centerline_id,identity_id
  ),''))
  from rows
$$;

revoke all on function private_verification.brinesearch_issue97_graph_name_input_digest(uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_graph_supplemental_input_digest(uuid)
from public,anon,authenticated,service_role;

alter table private_verification.brinesearch_issue97_graph_release_qualifications
  add column authoritative_name_input_digest text,
  add column supplemental_input_digest text;

update private_verification.brinesearch_issue97_graph_release_qualifications q
set authoritative_name_input_digest=
      private_verification.brinesearch_issue97_graph_name_input_digest(q.build_id),
    supplemental_input_digest=
      private_verification.brinesearch_issue97_graph_supplemental_input_digest(q.build_id);

alter table private_verification.brinesearch_issue97_graph_release_qualifications
  alter column authoritative_name_input_digest set not null,
  alter column supplemental_input_digest set not null,
  add constraint brinesearch_issue97_graph_release_qualification_name_digest_check
    check(authoritative_name_input_digest~'^[0-9a-f]{32}$'),
  add constraint brinesearch_issue97_graph_release_qualification_supplemental_digest_check
    check(supplemental_input_digest~'^[0-9a-f]{32}$');

update private_verification.brinesearch_issue97_graph_release_generations
set source_content_contract='captured-run-content+authoritative-name+supplemental-map-v2'
where active and generation_key='issue97-release-20260814-r1';

update private_verification.brinesearch_issue97_graph_release_qualifications q
set qualification_digest=pg_catalog.md5(
  q.build_id::text||':'||q.generation_key||':'||q.graph_digest||':'||
  q.source_revision_digest||':'||q.mapping_snapshot_digest||':'||q.source_content_digest||':'||
  q.authoritative_name_input_digest||':'||q.supplemental_input_digest
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
  v_name_digest text;
  v_supplemental_digest text;
  v_builder_md5 text;
  v_mapper_md5 text;
begin
  if tg_op='UPDATE' and old.details ? 'release_generation_key' then
    if new.details->>'release_generation_key' is distinct from old.details->>'release_generation_key'
       or new.details->>'release_builder_md5' is distinct from old.details->>'release_builder_md5'
       or new.details->>'release_supplemental_mapper_md5' is distinct from old.details->>'release_supplemental_mapper_md5'
       or new.details->>'release_source_content_digest' is distinct from old.details->>'release_source_content_digest'
       or new.details->>'release_authoritative_name_digest' is distinct from old.details->>'release_authoritative_name_digest'
       or new.details->>'release_supplemental_input_digest' is distinct from old.details->>'release_supplemental_input_digest'
       or new.details->>'release_source_content_contract' is distinct from old.details->>'release_source_content_contract' then
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

    v_name_digest:=private_verification.brinesearch_issue97_graph_name_input_digest(new.id);
    v_supplemental_digest:=private_verification.brinesearch_issue97_graph_supplemental_input_digest(new.id);
    if coalesce(v_name_digest,'')!~'^[0-9a-f]{32}$'
       or coalesce(v_supplemental_digest,'')!~'^[0-9a-f]{32}$' then
      raise exception 'Issue #97 graph validation lacks complete derived input digests';
    end if;

    new.details:=new.details||pg_catalog.jsonb_build_object(
      'release_generation_key',v_generation.generation_key,
      'release_builder_md5',v_builder_md5,
      'release_supplemental_mapper_md5',v_mapper_md5,
      'release_source_content_digest',v_source_content_digest,
      'release_authoritative_name_digest',v_name_digest,
      'release_supplemental_input_digest',v_supplemental_digest,
      'release_source_content_contract',v_generation.source_content_contract,
      'release_receipt_stamped_at',pg_catalog.clock_timestamp()
    );
  end if;
  return new;
end
$$;

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
  v_current_names text;
  v_current_supplemental text;
  v_qualification record;
begin
  select * into v_build from public.brinesearch_road_graph_builds where id=p_build_id;
  if not found or v_build.status not in ('active','validated') then return false; end if;
  if not private_verification.brinesearch_issue97_graph_build_sources_current(p_build_id) then return false; end if;
  select * into v_generation
  from private_verification.brinesearch_issue97_graph_release_generations where active;
  if not found then return false; end if;

  v_current_content:=private_verification.brinesearch_issue97_graph_source_content_digest(p_build_id);
  v_current_names:=private_verification.brinesearch_issue97_graph_name_input_digest(p_build_id);
  v_current_supplemental:=private_verification.brinesearch_issue97_graph_supplemental_input_digest(p_build_id);
  if coalesce(v_current_content,'')!~'^[0-9a-f]{32}$'
     or coalesce(v_current_names,'')!~'^[0-9a-f]{32}$'
     or coalesce(v_current_supplemental,'')!~'^[0-9a-f]{32}$' then return false; end if;

  if v_build.details->>'release_generation_key'=v_generation.generation_key
     and v_build.details->>'release_builder_md5'=v_generation.builder_definition_md5
     and v_build.details->>'release_supplemental_mapper_md5'=v_generation.supplemental_mapper_md5
     and v_build.details->>'release_source_content_digest'=v_current_content
     and v_build.details->>'release_authoritative_name_digest'=v_current_names
     and v_build.details->>'release_supplemental_input_digest'=v_current_supplemental
     and v_build.details->>'release_source_content_contract'=v_generation.source_content_contract
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
    and v_qualification.authoritative_name_input_digest=v_current_names
    and v_qualification.supplemental_input_digest=v_current_supplemental
    and v_qualification.qualification_digest=pg_catalog.md5(
      p_build_id::text||':'||v_generation.generation_key||':'||v_build.graph_digest||':'||
      v_build.source_revision_digest||':'||(v_build.details->>'mapping_snapshot_digest')||':'||
      v_current_content||':'||v_current_names||':'||v_current_supplemental
    );
end
$$;

create or replace function private_verification.brinesearch_issue97_reject_release_receipt_mutation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  raise exception 'Issue #97 reviewed release receipt is append-only';
end
$$;
revoke all on function private_verification.brinesearch_issue97_reject_release_receipt_mutation()
from public,anon,authenticated,service_role;

drop trigger if exists brinesearch_issue97_graph_release_qualification_immutable
on private_verification.brinesearch_issue97_graph_release_qualifications;
create trigger brinesearch_issue97_graph_release_qualification_immutable
before update or delete on private_verification.brinesearch_issue97_graph_release_qualifications
for each row execute function private_verification.brinesearch_issue97_reject_release_receipt_mutation();

revoke all on function private_verification.brinesearch_issue97_stamp_graph_release_receipt()
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_graph_build_release_current(uuid)
from public,anon,authenticated,service_role;

do $issue97_release_input_digest_verify$
declare
  v_generation record;
  v_ohi record;
begin
  select * into strict v_generation
  from private_verification.brinesearch_issue97_graph_release_generations where active;
  if v_generation.source_content_contract<>'captured-run-content+authoritative-name+supplemental-map-v2' then
    raise exception 'Issue #97 release generation did not adopt the complete graph-input contract';
  end if;
  select * into strict v_ohi
  from private_verification.brinesearch_issue97_graph_release_qualifications q
  join public.brinesearch_road_graph_builds b on b.id=q.build_id
  where q.active and b.state_code='WV' and b.county_code='OHI' and b.status='active';
  if v_ohi.authoritative_name_input_digest is distinct from
       private_verification.brinesearch_issue97_graph_name_input_digest(v_ohi.build_id)
     or v_ohi.supplemental_input_digest is distinct from
       private_verification.brinesearch_issue97_graph_supplemental_input_digest(v_ohi.build_id)
     or not private_verification.brinesearch_issue97_graph_build_release_current(v_ohi.build_id) then
    raise exception 'Issue #97 OHI compatibility qualification is not bound to current derived inputs';
  end if;
end
$issue97_release_input_digest_verify$;
