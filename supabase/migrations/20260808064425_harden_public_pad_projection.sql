-- Replace the owner-rights public pad views with a synchronized, read-only
-- projection table. Public clients keep the same relation names and columns,
-- but the private pads table remains inaccessible to browser roles.

lock table public.pads in share row exclusive mode;

create table public.public_pad_detail_next as
select * from public.public_pad_detail with no data;

insert into public.public_pad_detail_next
select * from public.public_pad_detail;

alter table public.public_pad_detail_next add primary key (id);
create index public_pad_detail_next_legacy_id_idx
  on public.public_pad_detail_next (legacy_id);
create index public_pad_detail_next_directory_idx
  on public.public_pad_detail_next (record_number, pad_name);
create index public_pad_detail_next_company_state_name_idx
  on public.public_pad_detail_next (company, state, pad_name);

create table private_verification.public_pad_view_definition_backup_20260808 as
select
  c.relname as view_name,
  pg_get_viewdef(c.oid,true) as definition,
  now() as captured_at
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('public_pad_detail','public_pad_directory_summary');

revoke all on private_verification.public_pad_view_definition_backup_20260808
  from public,anon,authenticated;
grant select on private_verification.public_pad_view_definition_backup_20260808
  to service_role;

drop view if exists private_verification.public_pad_projection_source;

do $capture_projection$
declare
  v_definition text;
begin
  select pg_get_viewdef('public.public_pad_detail'::regclass,true)
    into v_definition;
  v_definition:=regexp_replace(v_definition,';[[:space:]]*$','');
  execute
    'create view private_verification.public_pad_projection_source '
    'with (security_invoker=true, security_barrier=true) as '
    ||v_definition;
end
$capture_projection$;

revoke all on private_verification.public_pad_projection_source
  from public,anon,authenticated;
grant select on private_verification.public_pad_projection_source
  to service_role;

drop view public.public_pad_directory_summary;
drop view public.public_pad_detail;

alter table public.public_pad_detail_next rename to public_pad_detail;
alter table public.public_pad_detail enable row level security;

revoke all on public.public_pad_detail from public,anon,authenticated;
grant select on public.public_pad_detail to anon,authenticated;
grant all on public.public_pad_detail to service_role;

create policy "Public reads safe pad projection"
on public.public_pad_detail
for select
to anon,authenticated
using (true);

create view public.public_pad_directory_summary
with (security_invoker=true, security_barrier=true)
as
select
  id,
  legacy_id,
  record_number,
  company,
  state,
  pad_name,
  record_type,
  address,
  latitude,
  longitude,
  county,
  township,
  well_name,
  api,
  property_number,
  structured_road_sequence,
  null::text as written_directions,
  null::text as road_sequence_status,
  null::date as road_sequence_reviewed_date,
  null::date as road_sequence_final_cleanup_date,
  verification_status,
  operating_status,
  null::text as import_source,
  null::text as import_status,
  research_status,
  null::text as research_note,
  '[]'::jsonb as research_sources,
  research_date,
  list_only,
  null::text as research_method,
  null::text as research_notes,
  number_of_road_steps,
  '[]'::jsonb as source_workbook_rows,
  '[]'::jsonb as alternate_locations,
  null::text as last_updated_by,
  null::timestamptz as last_updated_date,
  null::text as audit_source,
  null::boolean as audit_verified,
  jsonb_strip_nulls(jsonb_build_object(
    '_public_summary',true,
    'official_pad_record',case
      when jsonb_typeof(extra_data->'official_pad_record')='object' then
        jsonb_strip_nulls(jsonb_build_object(
          'pad_name',extra_data->'official_pad_record'->'pad_name',
          'operator',extra_data->'official_pad_record'->'operator',
          'pad_status',extra_data->'official_pad_record'->'pad_status'
        ))
      else null::jsonb
    end,
    'official_status',extra_data->'official_status',
    'official_operator',extra_data->'official_operator',
    'field_pad_alias',extra_data->'field_pad_alias',
    'section',extra_data->'section'
  )) as extra_data,
  null::uuid as created_by,
  null::uuid as updated_by,
  created_at,
  updated_at,
  null::text as directions_clear,
  null::text as directions_clear_method,
  directions_clear_updated_at,
  null::uuid as directions_clear_updated_by,
  well_entries
from public.public_pad_detail;

revoke all on public.public_pad_directory_summary
  from public,anon,authenticated;
grant select on public.public_pad_directory_summary to anon,authenticated;
grant all on public.public_pad_directory_summary to service_role;

create or replace function public.sync_public_pad_detail_projection()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification
as $sync$
declare
  v_id uuid;
begin
  if tg_op='DELETE' then
    v_id:=old.id;
  else
    v_id:=new.id;
  end if;

  delete from public.public_pad_detail where id=v_id;

  if tg_op<>'DELETE' then
    insert into public.public_pad_detail
    select *
    from private_verification.public_pad_projection_source
    where id=v_id;
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end
$sync$;

revoke all on function public.sync_public_pad_detail_projection()
  from public,anon,authenticated;
grant execute on function public.sync_public_pad_detail_projection()
  to service_role;

drop trigger if exists pads_sync_public_pad_detail_projection on public.pads;
create trigger pads_sync_public_pad_detail_projection
after insert or update or delete on public.pads
for each row execute function public.sync_public_pad_detail_projection();

-- Explicit deny policies document the intentionally service-only tables and
-- clear the RLS-with-no-policy advisor notices without granting browser access.
create policy "Browser access explicitly denied"
on private_verification.public_submission_rate_events
for all to anon,authenticated
using(false) with check(false);

create policy "Browser access explicitly denied"
on public.brinesearch_odot_road_catalog
for all to anon,authenticated
using(false) with check(false);

create policy "Browser access explicitly denied"
on public.brinesearch_odot_step_matches
for all to anon,authenticated
using(false) with check(false);

create policy "Browser access explicitly denied"
on public.pad_submissions
for all to anon,authenticated
using(false) with check(false);

-- Retain the completed temporary patch payload privately, then remove the
-- leftover public transfer relation.
create table private_verification.v17_3_source_provenance_patch_transfer_archive_20260808 as
select *,now() as archived_at
from public.v17_3_source_provenance_patch_transfer;

revoke all on private_verification.v17_3_source_provenance_patch_transfer_archive_20260808
  from public,anon,authenticated;
grant select on private_verification.v17_3_source_provenance_patch_transfer_archive_20260808
  to service_role;

drop table public.v17_3_source_provenance_patch_transfer;

do $assert_projection$
declare
  pad_count bigint;
  detail_count bigint;
begin
  select count(*) into pad_count from public.pads;
  select count(*) into detail_count from public.public_pad_detail;

  if pad_count<>detail_count then
    raise exception 'Public pad projection count mismatch: % versus %',detail_count,pad_count;
  end if;

  if exists(
    select 1
    from public.pads p
    left join public.public_pad_detail d on d.id=p.id
    where d.id is null
  ) then
    raise exception 'Public pad projection is missing one or more pads';
  end if;

  if not has_table_privilege('anon','public.public_pad_detail','SELECT')
     or not has_table_privilege('anon','public.public_pad_directory_summary','SELECT') then
    raise exception 'Anonymous safe projection reads are unavailable';
  end if;

  if has_table_privilege('anon','public.pads','SELECT') then
    raise exception 'Anonymous direct pads-table access returned';
  end if;
end
$assert_projection$;
