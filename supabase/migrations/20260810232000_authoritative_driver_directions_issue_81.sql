-- GitHub #81 — authoritative driver directions contract.
--
-- Keep private/source direction text in public.pads for provenance and editor work,
-- but publish a driver-safe Clear Directions projection and one narrow anonymous
-- read contract. Verified pad-specific route corrections belong here in the data
-- layer, not in late frontend render overrides.

create or replace function private_verification.brinesearch_driver_safe_clear_v17330(p_text text)
returns text
language plpgsql
immutable
set search_path = 'pg_catalog', 'private_verification', 'public', 'pg_temp'
as $$
declare
  v text := p_text;
begin
  if v is null then return null; end if;

  -- Hospital/contact blocks are not driving instructions and were commonly
  -- appended to the final imported step without a reliable sentence boundary.
  v := pg_catalog.regexp_replace(
    v,
    '[[:space:]]+Nearest[[:space:]]+Hospital.*$',
    '',
    'i'
  );

  -- Remove high-confidence parenthetical landmark identifiers while preserving
  -- actual road names such as Church Road or Cemetery Road.
  v := pg_catalog.regexp_replace(
    v,
    '[[:space:]]*\\([^)]*(McDonald''?s?|dealership|YMCA|VFD|post[[:space:]]+office|Dairy[[:space:]]+Queen|restaurant|church[[:space:]]+(is|parking)|cemetery[[:space:]]+(is|at|on)|school[[:space:]]+(is|on)|hospital|medical[[:space:]]+center)[^)]*\\)',
    '',
    'gi'
  );

  v := pg_catalog.regexp_replace(v, '[[:space:]]{2,}', ' ', 'g');
  v := pg_catalog.regexp_replace(v, '[[:space:]]+([,.;])', '\\1', 'g');
  return nullif(pg_catalog.btrim(v), '');
end;
$$;

comment on function private_verification.brinesearch_driver_safe_clear_v17330(text) is
  'Issue #81 public driver-direction sanitizer. Private/source direction text remains in public.pads.';

-- Move the three source-verified corrections that were previously encoded as
-- frontend pad-specific overrides into the production data source of truth.
update public.pads
set
  directions_clear = case legacy_id
    when 'ascent--albert' then $albert$Road sequence reference:
I-70 → Exit 198 → OH-114 → Lease Road

Step-by-step directions:
1. From I-70 west, take Exit 198.
2. Turn left and go under I-70 to the stop sign.
3. Turn left on OH-114. Continue 1.2 miles.
4. The lease road is on the left.$albert$
    when 'expand--timmy-minch' then $timmy$Road sequence reference:
Exit 5 → I-70 → US-40 / National Rd → CR-25 / Peters Run Rd → CR-15 / Warden Run Rd → CR-15/1 / Boggs Hill Rd → CR-25/1 / Browns Run Rd → Access Road

Step-by-step directions:
1. Take Exit 5 from I-70 in Wheeling, West Virginia. Curfew: 5:45–6:45 AM, 7:35–8:35 AM, 2:45–3:45 PM, and 4:05–4:30 PM.
2. Turn right on US-40 East / National Rd. Continue 0.76 miles.
3. Turn left on CR-25 / Peters Run Rd. Continue 3.05 miles.
4. Turn left on CR-15 / Warden Run Rd. Continue 1.09 miles.
5. Turn left on CR-15/1 / Boggs Hill Rd. Continue 0.58 miles.
6. Turn left on CR-25/1 / Browns Run Rd. Continue 0.12 miles.
7. Access road on left.$timmy$
    when 'expand--van-aston' then $van$Road sequence reference:
WV-250 → CR-17 / Fork Ridge Rd → Brushy Run Rd → Access Road

Step-by-step directions:
1. Head south on WV-250. Continue 14.17 miles. Curfew: M,T,T,F 6:30–8:00 AM and 3:30–5:00 PM; Wed 7:30–9:00 AM and 3:30–5:00 PM.
2. Turn right on CR-17 / Fork Ridge Rd. Continue 3.80 miles.
3. Turn left on Brushy Run Rd. Continue approximately 0.65 miles. Brushy Run Rd is unsigned.
4. Take the well pad access road.$van$
    else directions_clear
  end,
  structured_road_sequence = case legacy_id
    when 'ascent--albert' then 'I-70 → Exit 198 → OH-114 → Lease Road'
    when 'expand--timmy-minch' then 'Exit 5 → I-70 → US-40 / National Rd → CR-25 / Peters Run Rd → CR-15 / Warden Run Rd → CR-15/1 / Boggs Hill Rd → CR-25/1 / Browns Run Rd → Access Road'
    when 'expand--van-aston' then 'WV-250 → CR-17 / Fork Ridge Rd → Brushy Run Rd → Access Road'
    else structured_road_sequence
  end,
  directions_clear_method = 'Issue #81 source-verified authoritative driver cleanup',
  directions_clear_updated_at = pg_catalog.now()
where legacy_id in ('ascent--albert', 'expand--timmy-minch', 'expand--van-aston');

-- The anonymous public projection now publishes the driver-safe clear text while
-- keeping all private/source fields in public.pads unchanged.
create or replace view private_verification.public_pad_projection_source as
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
  written_directions,
  road_sequence_status,
  road_sequence_reviewed_date,
  road_sequence_final_cleanup_date,
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
  private_verification.brinesearch_sanitize_public_extra_data_issue73(extra_data) as extra_data,
  null::uuid as created_by,
  null::uuid as updated_by,
  created_at,
  updated_at,
  private_verification.brinesearch_driver_safe_clear_v17330(directions_clear) as directions_clear,
  null::text as directions_clear_method,
  directions_clear_updated_at,
  null::uuid as directions_clear_updated_by,
  well_entries,
  private_verification.brinesearch_sanitize_public_route_steps_issue73(structured_route_steps) as structured_route_steps
from public.pads p;

-- Refresh just the public direction field to the new contract. Existing #73
-- sanitizers and public projection columns remain untouched.
update public.public_pad_detail d
set
  directions_clear = private_verification.brinesearch_driver_safe_clear_v17330(p.directions_clear),
  directions_clear_updated_at = p.directions_clear_updated_at,
  structured_road_sequence = p.structured_road_sequence,
  updated_at = p.updated_at
from public.pads p
where d.id = p.id
  and (
    d.directions_clear is distinct from private_verification.brinesearch_driver_safe_clear_v17330(p.directions_clear)
    or d.directions_clear_updated_at is distinct from p.directions_clear_updated_at
    or d.structured_road_sequence is distinct from p.structured_road_sequence
    or d.updated_at is distinct from p.updated_at
  );

-- One narrow, versioned public contract for the browser's authoritative direction
-- refresh. Security-invoker keeps public_pad_detail RLS as the access boundary.
drop view if exists public.brinesearch_driver_directions_public;
create view public.brinesearch_driver_directions_public
with (security_invoker = true)
as
select
  id as pad_id,
  legacy_id,
  directions_clear,
  coalesce(directions_clear_updated_at, updated_at) as source_revision
from public.public_pad_detail
where directions_clear is not null;

revoke all on public.brinesearch_driver_directions_public from public;
grant select on public.brinesearch_driver_directions_public to anon, authenticated;

comment on view public.brinesearch_driver_directions_public is
  'Issue #81 exact-allowlist public driver-direction contract: pad id, legacy id, sanitized clear directions, source revision.';

-- Release invariants.
do $$
declare
  v_columns text[];
begin
  if exists (
    select 1 from public.public_pad_detail
    where directions_clear ~* 'Nearest[[:space:]]+Hospital'
  ) then
    raise exception 'issue81 invariant failed: public Clear Directions still contain Nearest Hospital';
  end if;

  select pg_catalog.array_agg(column_name order by ordinal_position)
  into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'brinesearch_driver_directions_public';

  if v_columns is distinct from array['pad_id','legacy_id','directions_clear','source_revision']::text[] then
    raise exception 'issue81 invariant failed: public direction view column allow-list changed: %', v_columns;
  end if;

  if not pg_catalog.has_table_privilege('anon', 'public.brinesearch_driver_directions_public', 'SELECT') then
    raise exception 'issue81 invariant failed: anon cannot read public driver directions';
  end if;

  if exists (
    select 1 from public.pads p
    where p.legacy_id = 'ascent--albert'
      and (p.directions_clear !~* 'OH-114' or p.directions_clear !~* '1[.]2[[:space:]]+miles')
  ) then
    raise exception 'issue81 invariant failed: Albert source-verified correction missing';
  end if;

  if exists (
    select 1 from public.pads p
    where p.legacy_id = 'expand--timmy-minch'
      and (p.directions_clear !~* 'CR-15/1' or p.directions_clear !~* 'CR-25/1')
  ) then
    raise exception 'issue81 invariant failed: Timmy Minch source-verified correction missing';
  end if;

  if exists (
    select 1 from public.pads p
    where p.legacy_id = 'expand--van-aston'
      and (p.directions_clear !~* 'Brushy Run Rd' or p.directions_clear ~* 'Nearest[[:space:]]+Hospital')
  ) then
    raise exception 'issue81 invariant failed: Van Aston source-verified correction missing';
  end if;
end;
$$;
