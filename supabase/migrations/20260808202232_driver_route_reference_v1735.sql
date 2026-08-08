-- BrineSearch V17.3.5 driver route-reference rollout.
-- Publishes only the finalized safe outcome from the private all-pad mileage audit.
-- Raw review evidence, straight-line research references, and unresolved candidates stay private.

create table if not exists public.brinesearch_driver_route_reference (
  pad_id uuid primary key references public.pads(id) on delete cascade,
  legacy_id text not null unique,
  anchor_name text,
  anchor_kind text,
  distance_miles numeric(10,3),
  display_distance text not null,
  status text not null,
  distance_mode text,
  reference_point text,
  source_label text not null,
  source_version text not null default '20260808',
  updated_at timestamptz not null default now(),
  constraint brinesearch_driver_route_reference_status_check check (
    status in (
      'verified_distance',
      'verified_approximate',
      'verified_range',
      'direct_on_anchor',
      'located_on_anchor',
      'route_marker',
      'distance_unavailable',
      'no_route_evidence',
      'research_only',
      'blocked_conflict'
    )
  )
);

alter table public.brinesearch_driver_route_reference enable row level security;
revoke all on public.brinesearch_driver_route_reference from public,anon,authenticated;
grant select on public.brinesearch_driver_route_reference to anon,authenticated;
grant all on public.brinesearch_driver_route_reference to service_role;

drop policy if exists "Public reads safe driver route references" on public.brinesearch_driver_route_reference;
create policy "Public reads safe driver route references"
on public.brinesearch_driver_route_reference
for select
to anon,authenticated
using (true);

create index if not exists brinesearch_driver_route_reference_status_idx
  on public.brinesearch_driver_route_reference(status);

create or replace function private_verification.refresh_driver_route_reference_internal()
returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification
as $function$
declare
  inserted_count integer;
begin
  if to_regclass('private_verification.anchor_mileage_pads_20260808') is null then
    raise exception 'Private anchor/mileage staging table is unavailable';
  end if;

  if exists (
    select 1
    from private_verification.anchor_mileage_pads_20260808
    where final_candidate_status is null
  ) then
    raise exception 'Driver route-reference audit still contains unresolved records';
  end if;

  delete from public.brinesearch_driver_route_reference;

  insert into public.brinesearch_driver_route_reference (
    pad_id,
    legacy_id,
    anchor_name,
    anchor_kind,
    distance_miles,
    display_distance,
    status,
    distance_mode,
    reference_point,
    source_label,
    source_version,
    updated_at
  )
  select
    p.pad_id,
    p.legacy_id,
    case
      when p.final_candidate_status in ('final_reference_only_not_driver_distance')
        or p.final_candidate_status like 'final_no_route_evidence%'
        or p.final_candidate_status like 'blocked%'
        then null
      else nullif(btrim(p.selected_anchor_text),'')
    end as anchor_name,
    case
      when p.final_candidate_status in ('final_reference_only_not_driver_distance')
        or p.final_candidate_status like 'final_no_route_evidence%'
        or p.final_candidate_status like 'blocked%'
        then null
      else nullif(btrim(p.selected_anchor_kind),'')
    end as anchor_kind,
    case
      when p.final_candidate_status='ready_for_publish' then p.anchor_distance_miles
      else null
    end as distance_miles,
    case
      when p.final_candidate_status='ready_range_for_publish' then
        coalesce(nullif(p.selected_anchor_evidence->>'display_mileage',''),'Saved mileage range')
      when p.final_candidate_status='ready_on_anchor_no_mileage_needed' then
        'On this road'
      when p.final_candidate_status='ready_on_anchor_reference_marker' then
        coalesce(nullif(p.selected_anchor_evidence->>'display_distance_text',''),nullif(p.anchor_reference_point,''),'Route marker')
      when p.final_candidate_status='ready_for_publish' and p.anchor_distance_miles is not null then
        (case
          when lower(coalesce(p.distance_status,'')) like '%approx%'
            or lower(coalesce(p.distance_status,'')) like '%slightly%'
            or lower(coalesce(p.distance_source,'')) like '%approx%'
            then '≈ '
          else ''
        end)
        || trim(trailing '.' from trim(trailing '0' from to_char(p.anchor_distance_miles,'FM999999990.000')))
        || ' mi'
      when p.final_candidate_status='ready_for_publish' then
        'Directly off this road'
      when p.final_candidate_status='final_reference_only_not_driver_distance' then
        'No verified driving mileage'
      when p.final_candidate_status like 'final_distance_unavailable%' then
        'Mileage not verified'
      when p.final_candidate_status like 'final_no_route_evidence%' then
        'No verified route'
      when p.final_candidate_status like 'blocked%' then
        'Route conflict — do not use'
      else
        'Mileage not verified'
    end as display_distance,
    case
      when p.final_candidate_status='ready_range_for_publish' then 'verified_range'
      when p.final_candidate_status='ready_on_anchor_no_mileage_needed' then 'located_on_anchor'
      when p.final_candidate_status='ready_on_anchor_reference_marker' then 'route_marker'
      when p.final_candidate_status='ready_for_publish' and p.anchor_distance_miles is null then 'direct_on_anchor'
      when p.final_candidate_status='ready_for_publish' and (
        lower(coalesce(p.distance_status,'')) like '%approx%'
        or lower(coalesce(p.distance_status,'')) like '%slightly%'
        or lower(coalesce(p.distance_source,'')) like '%approx%'
      ) then 'verified_approximate'
      when p.final_candidate_status='ready_for_publish' then 'verified_distance'
      when p.final_candidate_status='final_reference_only_not_driver_distance' then 'research_only'
      when p.final_candidate_status like 'final_distance_unavailable%' then 'distance_unavailable'
      when p.final_candidate_status like 'final_no_route_evidence%' then 'no_route_evidence'
      when p.final_candidate_status like 'blocked%' then 'blocked_conflict'
      else 'distance_unavailable'
    end as status,
    case
      when p.final_candidate_status in ('final_reference_only_not_driver_distance')
        or p.final_candidate_status like 'final_no_route_evidence%'
        or p.final_candidate_status like 'blocked%'
        then null
      else nullif(btrim(p.distance_mode),'')
    end as distance_mode,
    case
      when p.final_candidate_status in ('final_reference_only_not_driver_distance')
        or p.final_candidate_status like 'final_no_route_evidence%'
        or p.final_candidate_status like 'blocked%'
        then null
      else nullif(btrim(p.anchor_reference_point),'')
    end as reference_point,
    case
      when p.final_candidate_status='ready_range_for_publish' then 'Saved haul directions + verified road identity'
      when p.final_candidate_status in ('ready_on_anchor_no_mileage_needed','ready_on_anchor_reference_marker') then 'Saved route + verified road reference'
      when p.final_candidate_status='ready_for_publish' and lower(coalesce(p.distance_source,'')) like '%geometry%' then 'Official road geometry + saved route'
      when p.final_candidate_status='ready_for_publish' and lower(coalesce(p.distance_source,'')) like '%official%' then 'Saved haul directions + official road data'
      when p.final_candidate_status='ready_for_publish' then 'Saved haul directions'
      when p.final_candidate_status='final_reference_only_not_driver_distance' then 'Research only — not a driving route'
      when p.final_candidate_status like 'final_distance_unavailable%' then 'Saved route reviewed; mileage unavailable'
      when p.final_candidate_status like 'final_no_route_evidence%' then 'No verified route evidence'
      when p.final_candidate_status like 'blocked%' then 'Route conflict — review required'
      else 'BrineSearch route review'
    end as source_label,
    '20260808',
    now()
  from private_verification.anchor_mileage_pads_20260808 p;

  get diagnostics inserted_count=row_count;

  if inserted_count<>1173 then
    raise exception 'Expected 1173 driver route-reference records, inserted %',inserted_count;
  end if;

  if exists (
    select 1 from public.brinesearch_driver_route_reference
    where status in ('research_only','no_route_evidence','blocked_conflict')
      and (anchor_name is not null or distance_miles is not null or reference_point is not null)
  ) then
    raise exception 'Private/non-driving reference details leaked into public route-reference rows';
  end if;

  return inserted_count;
end
$function$;

revoke all on function private_verification.refresh_driver_route_reference_internal() from public,anon,authenticated;
grant execute on function private_verification.refresh_driver_route_reference_internal() to service_role;

create or replace function public.refresh_driver_route_reference()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private_verification,auth
as $function$
declare
  caller uuid:=auth.uid();
  jwt_role text:=coalesce(
    nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'
  );
  refreshed integer;
begin
  if jwt_role is distinct from 'service_role'
     and (caller is null or not public.is_brinesearch_owner(caller)) then
    raise exception 'Owner access required';
  end if;

  refreshed:=private_verification.refresh_driver_route_reference_internal();
  return jsonb_build_object('refreshed',refreshed,'source_version','20260808','refreshed_at',now());
end
$function$;

revoke all on function public.refresh_driver_route_reference() from public,anon,authenticated;
grant execute on function public.refresh_driver_route_reference() to authenticated,service_role;

select private_verification.refresh_driver_route_reference_internal();

notify pgrst,'reload schema';

do $assertions$
declare
  total_count integer;
  unresolved_count integer;
begin
  select count(*) into total_count from public.brinesearch_driver_route_reference;
  if total_count<>1173 then
    raise exception 'Driver route-reference table contains % rows instead of 1173',total_count;
  end if;

  select count(*) into unresolved_count
  from public.brinesearch_driver_route_reference
  where status not in (
    'verified_distance','verified_approximate','verified_range','direct_on_anchor',
    'located_on_anchor','route_marker','distance_unavailable','no_route_evidence',
    'research_only','blocked_conflict'
  );
  if unresolved_count<>0 then
    raise exception 'Unexpected driver route-reference statuses remain';
  end if;

  if not has_table_privilege('anon','public.brinesearch_driver_route_reference','SELECT') then
    raise exception 'Anonymous driver route-reference read access is unavailable';
  end if;

  if has_table_privilege('anon','public.brinesearch_driver_route_reference','INSERT')
     or has_table_privilege('anon','public.brinesearch_driver_route_reference','UPDATE')
     or has_table_privilege('anon','public.brinesearch_driver_route_reference','DELETE') then
    raise exception 'Anonymous write access exists on driver route-reference table';
  end if;
end
$assertions$;
