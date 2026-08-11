-- GitHub #69 release hardening after the canonical structured-route checkpoint.
--
-- This migration deliberately follows 20260811002000_issue69_route_geometry_draft_helpers.sql.
-- It restores the #81 public directions sanitizer after the #69 projection grows
-- the safe driver_safety_context column, restricts exact review-segment writes to
-- the canonical publisher, and asserts the reviewed publisher lock order.

-- #81 invariant: public directions must always pass through the same driver-safe
-- sanitizer used by the live V17.3.30 narrow directions contract.
create or replace view private_verification.public_pad_projection_source
with (security_invoker=true,security_barrier=true)
as
select
  p.id,p.legacy_id,p.record_number,p.company,p.state,p.pad_name,p.record_type,
  p.address,p.latitude,p.longitude,p.county,p.township,p.well_name,p.api,
  p.property_number,p.structured_road_sequence,p.written_directions,
  p.road_sequence_status,p.road_sequence_reviewed_date,
  p.road_sequence_final_cleanup_date,p.verification_status,p.operating_status,
  null::text as import_source,null::text as import_status,p.research_status,
  null::text as research_note,'[]'::jsonb as research_sources,p.research_date,
  p.list_only,null::text as research_method,null::text as research_notes,
  p.number_of_road_steps,'[]'::jsonb as source_workbook_rows,
  '[]'::jsonb as alternate_locations,null::text as last_updated_by,
  null::timestamptz as last_updated_date,null::text as audit_source,
  null::boolean as audit_verified,
  private_verification.brinesearch_sanitize_public_extra_data_issue73(p.extra_data) as extra_data,
  null::uuid as created_by,null::uuid as updated_by,p.created_at,p.updated_at,
  private_verification.brinesearch_driver_safe_clear_v17330(p.directions_clear) as directions_clear,
  null::text as directions_clear_method,
  p.directions_clear_updated_at,null::uuid as directions_clear_updated_by,
  p.well_entries,
  private_verification.brinesearch_sanitize_public_route_steps_issue73(
    p.structured_route_steps
  ) as structured_route_steps,
  private_verification.brinesearch_sanitize_public_safety_context_issue69(
    p.driver_safety_context
  ) as driver_safety_context
from public.pads p;

revoke all on private_verification.public_pad_projection_source
from public,anon,authenticated;
grant select on private_verification.public_pad_projection_source to service_role;

-- Defense in depth for the row-synchronized public table. The normal sync path
-- already receives sanitized text from the projection view, but a future
-- service-role maintenance write must not be able to bypass #81 accidentally.
create or replace function private_verification.brinesearch_sanitize_public_pad_detail_issue73()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  new.extra_data:=
    private_verification.brinesearch_sanitize_public_extra_data_issue73(new.extra_data);
  new.structured_route_steps:=
    private_verification.brinesearch_sanitize_public_route_steps_issue73(new.structured_route_steps);
  new.driver_safety_context:=
    private_verification.brinesearch_sanitize_public_safety_context_issue69(new.driver_safety_context);
  new.directions_clear:=
    private_verification.brinesearch_driver_safe_clear_v17330(new.directions_clear);
  return new;
end;
$$;

revoke all on function private_verification.brinesearch_sanitize_public_pad_detail_issue73()
from public,anon,authenticated;

drop trigger if exists public_pad_detail_sanitize_route_notes_issue73
  on public.public_pad_detail;
create trigger public_pad_detail_sanitize_route_notes_issue73
before insert or update of extra_data,structured_route_steps,driver_safety_context,directions_clear
on public.public_pad_detail
for each row execute function
  private_verification.brinesearch_sanitize_public_pad_detail_issue73();

-- Exact review segments are a mirror/audit artifact of the canonical version-1
-- pad-road occurrences. Owners may still maintain legacy review-only version-0
-- rows directly, but only the postgres-owned structured publisher may create,
-- mutate, or delete exact version-1 review segments.
drop policy if exists "Owner manages route review segments"
  on public.brinesearch_route_review_segments;
drop policy if exists route_review_segments_owner_read_issue69
  on public.brinesearch_route_review_segments;
drop policy if exists route_review_segments_owner_insert_legacy_issue69
  on public.brinesearch_route_review_segments;
drop policy if exists route_review_segments_owner_update_legacy_issue69
  on public.brinesearch_route_review_segments;
drop policy if exists route_review_segments_owner_delete_legacy_issue69
  on public.brinesearch_route_review_segments;

create policy route_review_segments_owner_read_issue69
on public.brinesearch_route_review_segments
for select to authenticated
using (public.is_brinesearch_owner((select auth.uid())));

create policy route_review_segments_owner_insert_legacy_issue69
on public.brinesearch_route_review_segments
for insert to authenticated
with check (
  public.is_brinesearch_owner((select auth.uid()))
  and geometry_version=0
);

create policy route_review_segments_owner_update_legacy_issue69
on public.brinesearch_route_review_segments
for update to authenticated
using (
  public.is_brinesearch_owner((select auth.uid()))
  and geometry_version=0
)
with check (
  public.is_brinesearch_owner((select auth.uid()))
  and geometry_version=0
);

create policy route_review_segments_owner_delete_legacy_issue69
on public.brinesearch_route_review_segments
for delete to authenticated
using (
  public.is_brinesearch_owner((select auth.uid()))
  and geometry_version=0
);

revoke all on public.brinesearch_route_review_segments from public,anon;
grant select,insert,update,delete on public.brinesearch_route_review_segments to authenticated;

comment on policy route_review_segments_owner_insert_legacy_issue69
on public.brinesearch_route_review_segments is
  'Issue #69: direct Owner review staging is legacy geometry_version=0 only; exact version-1 rows are RPC-owned.';
comment on policy route_review_segments_owner_update_legacy_issue69
on public.brinesearch_route_review_segments is
  'Issue #69: direct Owner updates cannot target or promote exact version-1 review segments.';
comment on policy route_review_segments_owner_delete_legacy_issue69
on public.brinesearch_route_review_segments is
  'Issue #69: direct Owner deletes cannot remove exact version-1 review segments.';

-- Release-time invariants: preserve #73/#81 projection security and sanitizer,
-- exact review-segment write ownership, and the publisher's deadlock-resistant
-- lock order: pad row -> sorted Road Manager rows -> sorted safety rows -> pad's
-- route review. Same-pad publishers serialize on the pad before later locks.
do $issue69_release_hardening_assert$
declare
  v_options text[];
  v_view text;
  v_publisher text;
  v_pad_lock integer;
  v_road_lock integer;
  v_safety_lock integer;
  v_review_lock integer;
begin
  select c.reloptions,pg_catalog.pg_get_viewdef(c.oid,true)
  into v_options,v_view
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private_verification'
    and c.relname='public_pad_projection_source';

  if not coalesce('security_invoker=true'=any(v_options),false)
     or not coalesce('security_barrier=true'=any(v_options),false) then
    raise exception 'Issue #69 regressed #73/#81 projection security options';
  end if;
  if position('brinesearch_driver_safe_clear_v17330' in v_view)=0 then
    raise exception 'Issue #69 public projection is not using the #81 directions sanitizer';
  end if;
  if pg_catalog.has_table_privilege(
       'anon','private_verification.public_pad_projection_source','SELECT'
     ) or pg_catalog.has_table_privilege(
       'authenticated','private_verification.public_pad_projection_source','SELECT'
     ) then
    raise exception 'Issue #69 private projection became directly readable';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='brinesearch_route_review_segments'
      and policyname='route_review_segments_owner_insert_legacy_issue69'
      and with_check ilike '%geometry_version = 0%'
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='brinesearch_route_review_segments'
      and policyname='route_review_segments_owner_update_legacy_issue69'
      and qual ilike '%geometry_version = 0%'
      and with_check ilike '%geometry_version = 0%'
  ) or not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='brinesearch_route_review_segments'
      and policyname='route_review_segments_owner_delete_legacy_issue69'
      and qual ilike '%geometry_version = 0%'
  ) then
    raise exception 'Issue #69 exact review-segment RLS invariant failed';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)'::pg_catalog.regprocedure
  ) into v_publisher;
  v_pad_lock:=position('select p.* into v_pad' in lower(v_publisher));
  v_road_lock:=position('order by r.id' in lower(v_publisher));
  v_safety_lock:=position('order by f.id' in lower(v_publisher));
  v_review_lock:=position('from public.brinesearch_route_reviews rr' in lower(v_publisher));
  if v_pad_lock=0 or v_road_lock=0 or v_safety_lock=0 or v_review_lock=0
     or not (v_pad_lock<v_road_lock and v_road_lock<v_safety_lock and v_safety_lock<v_review_lock) then
    raise exception 'Issue #69 publisher lock-order invariant failed';
  end if;
end;
$issue69_release_hardening_assert$;
