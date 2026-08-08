-- Normalize names before stripping punctuation. The previous order removed lowercase letters
-- and inflated formatting-only alias results. This migration wraps the existing live importer,
-- preserves its source-fetch logic, and reconciles exact names after every batch.
create or replace function private_verification.normalize_identity_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path=pg_catalog
as $$
  select regexp_replace(upper(btrim(coalesce(p_value,''))),'[^A-Z0-9]+','','g')
$$;

alter function private_verification.stage_live_odnr_wellpads_batch(bigint,integer)
  rename to stage_live_odnr_wellpads_batch_raw;

revoke all on function private_verification.stage_live_odnr_wellpads_batch_raw(bigint,integer)
  from public,anon,authenticated;
grant execute on function private_verification.stage_live_odnr_wellpads_batch_raw(bigint,integer)
  to service_role;

create or replace function private_verification.stage_live_odnr_wellpads_batch(
  p_after_object_id bigint default 0,
  p_limit integer default 50
) returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,private_verification
as $wrapper$
declare
  v_result jsonb;
  v_run_id uuid;
  v_alias_removed integer:=0;
  v_exact_reclassified integer:=0;
  v_verified integer:=0;
  v_new integer:=0;
  v_duplicates integer:=0;
  v_aliases integer:=0;
begin
  v_result:=private_verification.stage_live_odnr_wellpads_batch_raw(p_after_object_id,p_limit);
  v_run_id:=nullif(v_result->>'import_run_id','')::uuid;
  if v_run_id is null then return v_result; end if;

  with aliases as (
    select c.id,
      max(e->>'value') filter(where e->>'kind'='previous_official_name') as previous_name,
      max(e->>'value') filter(where e->>'kind'='current_official_name') as current_name
    from private_verification.public_data_match_candidates c
    cross join lateral jsonb_array_elements(c.evidence)e
    where c.result_category='OFFICIAL_NAME_ALIAS'
      and c.source_record_id in(
        select id from private_verification.public_data_source_records where last_import_run_id=v_run_id
      )
    group by c.id
  ), deleted as (
    delete from private_verification.public_data_match_candidates c
    using aliases a
    where c.id=a.id
      and private_verification.normalize_identity_text(a.previous_name)=
          private_verification.normalize_identity_text(a.current_name)
    returning c.id
  ) select count(*) into v_alias_removed from deleted;

  create temporary table tmp_corrected_live_name_matches on commit drop as
  select r.id as source_record_uuid,p.id as pad_id
  from private_verification.public_data_source_records r
  join public.pads p
    on private_verification.normalize_identity_text(p.pad_name)=
       private_verification.normalize_identity_text(r.official_name)
   and upper(coalesce(btrim(p.county),''))=upper(coalesce(btrim(r.county),''))
   and private_verification.operator_match(p.company,r.operator_raw)
  where r.last_import_run_id=v_run_id and r.entity_type='pad';

  create temporary table tmp_corrected_live_name_summary on commit drop as
  select r.id as source_record_uuid,count(distinct m.pad_id) as pad_count,
         (array_agg(m.pad_id order by m.pad_id::text) filter(where m.pad_id is not null))[1] as selected_pad_id,
         coalesce(jsonb_agg(distinct jsonb_build_object(
           'pad_id',m.pad_id,'match_method','corrected_exact_name_county_operator'
         )) filter(where m.pad_id is not null),'[]'::jsonb) as matches
  from private_verification.public_data_source_records r
  left join tmp_corrected_live_name_matches m on m.source_record_uuid=r.id
  where r.last_import_run_id=v_run_id and r.entity_type='pad'
  group by r.id;

  delete from private_verification.public_data_match_candidates c
  using tmp_corrected_live_name_summary s
  where c.source_record_id=s.source_record_uuid and c.pad_id is null
    and c.result_category in('NEW_PAD_CANDIDATE','POSSIBLE_DUPLICATE') and s.pad_count=1;

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select s.source_record_uuid,s.selected_pad_id,'VERIFIED_EXISTING_RECORD',
         'corrected_exact_name_county_operator',0.99,
         jsonb_build_array(jsonb_build_object('kind','corrected_exact_name_county_operator','value',true)),
         '[]'::jsonb,'confirmed',now(),now()
  from tmp_corrected_live_name_summary s where s.pad_count=1
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set match_method=excluded.match_method,confidence=excluded.confidence,evidence=excluded.evidence,
                conflicts=excluded.conflicts,review_status='confirmed',updated_at=now();
  get diagnostics v_exact_reclassified=row_count;

  delete from private_verification.public_data_match_candidates c
  using tmp_corrected_live_name_summary s
  where c.source_record_id=s.source_record_uuid and c.pad_id is null
    and c.result_category='NEW_PAD_CANDIDATE' and s.pad_count>1;

  insert into private_verification.public_data_match_candidates
    (source_record_id,pad_id,result_category,match_method,confidence,evidence,conflicts,review_status,created_at,updated_at)
  select s.source_record_uuid,null,'POSSIBLE_DUPLICATE',
         'multiple_corrected_exact_name_county_operator_matches',0.50,
         jsonb_build_array(jsonb_build_object('kind','corrected_exact_name_match_count','value',s.pad_count)),
         s.matches,'needs_owner_review',now(),now()
  from tmp_corrected_live_name_summary s where s.pad_count>1
  on conflict(source_record_id,(coalesce(pad_id,'00000000-0000-0000-0000-000000000000'::uuid)),result_category)
  do update set match_method=excluded.match_method,confidence=excluded.confidence,evidence=excluded.evidence,
                conflicts=excluded.conflicts,review_status='needs_owner_review',updated_at=now();

  delete from private_verification.public_data_match_candidates c
  using tmp_corrected_live_name_summary s
  where c.source_record_id=s.source_record_uuid and c.pad_id is null and s.pad_count=1
    and c.result_category in('OPERATOR_CHANGE_OR_ALIAS','STATUS_UPDATE','OFFICIAL_NAME_ALIAS','LOCATION_CONFLICT')
    and exists(
      select 1 from private_verification.public_data_match_candidates x
      where x.source_record_id=c.source_record_id and x.pad_id=s.selected_pad_id
        and x.result_category=c.result_category
    );

  update private_verification.public_data_match_candidates c
  set pad_id=s.selected_pad_id,updated_at=now()
  from tmp_corrected_live_name_summary s
  where c.source_record_id=s.source_record_uuid and c.pad_id is null and s.pad_count=1
    and c.result_category in('OPERATOR_CHANGE_OR_ALIAS','STATUS_UPDATE','OFFICIAL_NAME_ALIAS','LOCATION_CONFLICT');

  select count(*) into v_verified
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='VERIFIED_EXISTING_RECORD';
  select count(*) into v_new
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='NEW_PAD_CANDIDATE';
  select count(*) into v_duplicates
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='POSSIBLE_DUPLICATE';
  select count(*) into v_aliases
  from private_verification.public_data_match_candidates
  where source_record_id in(select id from private_verification.public_data_source_records where last_import_run_id=v_run_id)
    and result_category='OFFICIAL_NAME_ALIAS';

  return v_result||jsonb_build_object(
    'verified_existing_records',v_verified,
    'new_pad_candidates',v_new,
    'possible_duplicates',v_duplicates,
    'official_name_changes',v_aliases,
    'formatting_only_aliases_removed',v_alias_removed,
    'corrected_exact_matches_upserted',v_exact_reclassified,
    'normalization_version','identity-v2'
  );
end
$wrapper$;

revoke all on function private_verification.stage_live_odnr_wellpads_batch(bigint,integer)
  from public,anon,authenticated;
grant execute on function private_verification.stage_live_odnr_wellpads_batch(bigint,integer)
  to service_role;

-- Clean existing formatting-only alias rows from the completed statewide import.
with live_source as (
  select id from private_verification.public_data_sources where source_key='oh_odnr_live_wellpads'
), aliases as (
  select c.id,
    max(e->>'value') filter(where e->>'kind'='previous_official_name') as previous_name,
    max(e->>'value') filter(where e->>'kind'='current_official_name') as current_name
  from private_verification.public_data_match_candidates c
  join private_verification.public_data_source_records r on r.id=c.source_record_id
  cross join lateral jsonb_array_elements(c.evidence)e
  where r.source_id=(select id from live_source) and c.result_category='OFFICIAL_NAME_ALIAS'
  group by c.id
)
delete from private_verification.public_data_match_candidates c
using aliases a
where c.id=a.id
  and private_verification.normalize_identity_text(a.previous_name)=
      private_verification.normalize_identity_text(a.current_name);

update private_verification.public_data_sources
set source_metadata=source_metadata||jsonb_build_object('identity_normalization_version','identity-v2'),
    updated_at=now()
where source_key='oh_odnr_live_wellpads';
