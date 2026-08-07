-- BrineSearch Road Manager direction-readiness queue.
-- Core safety rule: local-road routes are never guessed. A clearly labeled
-- estimate is permitted only for a pad proven to sit directly on an official
-- interstate, U.S. route, or state route, and it still requires owner review.

create table if not exists public.brinesearch_route_reviews (
  id uuid primary key default gen_random_uuid(),
  pad_id uuid not null unique references public.pads(id) on delete cascade,
  legacy_id text,
  pad_name text not null,
  company text,
  state text,
  pad_latitude double precision,
  pad_longitude double precision,
  source_directions_snapshot text,
  structured_sequence_snapshot text,
  source_quality text not null default 'written' check (source_quality in ('clear','written','sequence_only')),
  status text not null default 'queued' check (status in (
    'queued','analyzing','official_match_ready','needs_road_match',
    'state_route_estimate','blocked_no_guess','owner_review','approved','rejected'
  )),
  route_scope text not null default 'unknown' check (route_scope in ('unknown','local_roads','state_route_only')),
  candidate_kind text not null default 'none' check (candidate_kind in ('none','official_match','state_route_estimate')),
  state_route_name text,
  state_route_distance_feet numeric,
  candidate_route jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  no_guess_reason text,
  measured_total_miles numeric,
  field_verification_status text not null default 'not_reviewed' check (field_verification_status in ('not_reviewed','pending','confirmed','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_reviews_state_estimate_guard check (
    candidate_kind <> 'state_route_estimate'
    or (
      route_scope = 'state_route_only'
      and state_route_name is not null
      and btrim(state_route_name) <> ''
      and state_route_name ~* '^(I|IR|US|SR|OH|PA|WV)[ -]?[0-9]+'
    )
  ),
  constraint route_reviews_approved_guard check (
    status <> 'approved'
    or (reviewed_by is not null and reviewed_at is not null)
  )
);

create table if not exists public.brinesearch_route_review_segments (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.brinesearch_route_reviews(id) on delete cascade,
  outbound_order integer,
  inbound_order integer,
  road_id uuid,
  road_name text not null,
  official_road_name text,
  route_type text,
  route_number text,
  miles numeric,
  outbound_turn text,
  inbound_turn text,
  source_level text not null check (source_level in ('official_geometry','saved_direction','owner_verified','state_route_estimate')),
  source_agency text,
  source_url text,
  source_record_id text,
  is_state_route boolean not null default false,
  confidence text not null default 'unreviewed' check (confidence in ('unreviewed','matched','owner_confirmed','estimated')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_review_segment_estimate_guard check (
    source_level <> 'state_route_estimate'
    or (is_state_route and coalesce(route_type,'') ~* '^(I|IR|US|SR|OH|PA|WV)$')
  ),
  constraint route_review_segment_miles_guard check (miles is null or miles >= 0)
);

create index if not exists brinesearch_route_reviews_status_idx
  on public.brinesearch_route_reviews(status, updated_at desc);
create index if not exists brinesearch_route_reviews_state_idx
  on public.brinesearch_route_reviews(state, status);
create index if not exists brinesearch_route_review_segments_review_idx
  on public.brinesearch_route_review_segments(review_id, inbound_order, outbound_order);

create or replace function public.enforce_brinesearch_route_review_policy()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.candidate_kind = 'state_route_estimate' then
    if new.route_scope <> 'state_route_only' then
      raise exception 'No-guess policy: an estimate is permitted only for a pad directly on an official state or federal route.';
    end if;
    if new.state_route_name is null
       or new.state_route_name !~* '^(I|IR|US|SR|OH|PA|WV)[ -]?[0-9]+' then
      raise exception 'No-guess policy: an official state or federal route name is required.';
    end if;
    if new.status not in ('state_route_estimate','owner_review','approved','rejected') then
      raise exception 'State-route estimates must remain in the owner review workflow.';
    end if;
  end if;

  if new.route_scope = 'local_roads'
     and new.candidate_kind = 'state_route_estimate' then
    raise exception 'No-guess policy: local-road routes may never be estimated.';
  end if;

  if new.status = 'approved' then
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'Owner review is required before a route can be approved.';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
  else
    new.approved_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_brinesearch_route_review_policy on public.brinesearch_route_reviews;
create trigger trg_enforce_brinesearch_route_review_policy
before insert or update on public.brinesearch_route_reviews
for each row execute function public.enforce_brinesearch_route_review_policy();

create or replace function public.enforce_brinesearch_route_segment_policy()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  parent_scope text;
begin
  select route_scope into parent_scope
  from public.brinesearch_route_reviews
  where id = new.review_id;

  if new.source_level = 'state_route_estimate' then
    if parent_scope <> 'state_route_only'
       or not new.is_state_route
       or coalesce(new.route_type,'') !~* '^(I|IR|US|SR|OH|PA|WV)$' then
      raise exception 'No-guess policy: estimated segments are restricted to official state or federal routes.';
    end if;
    new.confidence := 'estimated';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_brinesearch_route_segment_policy on public.brinesearch_route_review_segments;
create trigger trg_enforce_brinesearch_route_segment_policy
before insert or update on public.brinesearch_route_review_segments
for each row execute function public.enforce_brinesearch_route_segment_policy();

alter table public.brinesearch_route_reviews enable row level security;
alter table public.brinesearch_route_review_segments enable row level security;

drop policy if exists "Owner manages route reviews" on public.brinesearch_route_reviews;
create policy "Owner manages route reviews"
on public.brinesearch_route_reviews
for all to authenticated
using (public.is_brinesearch_owner(auth.uid()))
with check (public.is_brinesearch_owner(auth.uid()));

drop policy if exists "Owner manages route review segments" on public.brinesearch_route_review_segments;
create policy "Owner manages route review segments"
on public.brinesearch_route_review_segments
for all to authenticated
using (public.is_brinesearch_owner(auth.uid()))
with check (public.is_brinesearch_owner(auth.uid()));

-- Seed every GPS + structured-sequence pad into the Road Manager queue.
-- This does not generate, infer, or publish a route.
insert into public.brinesearch_route_reviews (
  pad_id, legacy_id, pad_name, company, state, pad_latitude, pad_longitude,
  source_directions_snapshot, structured_sequence_snapshot, source_quality,
  status, route_scope, candidate_kind, evidence, no_guess_reason
)
select
  p.id,
  p.legacy_id,
  p.pad_name,
  p.company,
  p.state,
  p.latitude,
  p.longitude,
  coalesce(nullif(btrim(p.directions_clear),''), nullif(btrim(p.written_directions),''), p.structured_road_sequence),
  p.structured_road_sequence,
  case
    when nullif(btrim(p.directions_clear),'') is not null then 'clear'
    when nullif(btrim(p.written_directions),'') is not null then 'written'
    else 'sequence_only'
  end,
  'queued',
  'unknown',
  'none',
  jsonb_build_object(
    'seeded_from', 'pads GPS + structured road sequence',
    'seeded_at', now(),
    'policy', 'No route assumed. Official road matching or owner review is required.'
  ),
  'Route has not been evaluated yet; no roads or turns have been guessed.'
from public.pads p
where p.latitude is not null
  and p.longitude is not null
  and nullif(btrim(p.structured_road_sequence),'') is not null
  and (
    nullif(btrim(p.directions_clear),'') is not null
    or nullif(btrim(p.written_directions),'') is not null
    or nullif(btrim(p.structured_road_sequence),'') is not null
  )
on conflict (pad_id) do update set
  legacy_id = excluded.legacy_id,
  pad_name = excluded.pad_name,
  company = excluded.company,
  state = excluded.state,
  pad_latitude = excluded.pad_latitude,
  pad_longitude = excluded.pad_longitude,
  source_directions_snapshot = excluded.source_directions_snapshot,
  structured_sequence_snapshot = excluded.structured_sequence_snapshot,
  source_quality = excluded.source_quality,
  updated_at = now();

create or replace function public.brinesearch_route_review_dashboard(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access required';
  end if;

  select jsonb_build_object(
    'policy', jsonb_build_object(
      'local_road_guesses', false,
      'state_route_estimates', 'Road Manager candidate only; official route frontage and owner review required',
      'automatic_pad_updates', false
    ),
    'counts', (
      select jsonb_build_object(
        'total', count(*),
        'queued', count(*) filter (where status='queued'),
        'official_match_ready', count(*) filter (where status='official_match_ready'),
        'needs_road_match', count(*) filter (where status='needs_road_match'),
        'state_route_estimate', count(*) filter (where status='state_route_estimate'),
        'blocked_no_guess', count(*) filter (where status='blocked_no_guess'),
        'owner_review', count(*) filter (where status='owner_review'),
        'approved', count(*) filter (where status='approved')
      ) from public.brinesearch_route_reviews
    ),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.updated_at desc, q.pad_name)
      from (
        select id, pad_id, legacy_id, pad_name, company, state,
               pad_latitude, pad_longitude, source_quality, status, route_scope,
               candidate_kind, state_route_name, state_route_distance_feet,
               no_guess_reason, measured_total_miles, field_verification_status,
               structured_sequence_snapshot, source_directions_snapshot,
               evidence, updated_at
        from public.brinesearch_route_reviews r
        where (nullif(btrim(p_status),'') is null or r.status=p_status)
          and (
            nullif(btrim(p_search),'') is null
            or r.pad_name ilike '%'||btrim(p_search)||'%'
            or r.company ilike '%'||btrim(p_search)||'%'
            or r.structured_sequence_snapshot ilike '%'||btrim(p_search)||'%'
          )
        order by r.updated_at desc, r.pad_name
        limit greatest(1,least(coalesce(p_limit,50),200))
        offset greatest(coalesce(p_offset,0),0)
      ) q
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.brinesearch_route_review_mark(
  p_review_id uuid,
  p_status text,
  p_reason text default null
)
returns public.brinesearch_route_reviews
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.brinesearch_route_reviews;
begin
  if not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access required';
  end if;
  if p_status not in ('queued','needs_road_match','blocked_no_guess','owner_review','rejected') then
    raise exception 'This manual action may only change review workflow status; it cannot approve or invent a route.';
  end if;

  update public.brinesearch_route_reviews
  set status=p_status,
      no_guess_reason=nullif(btrim(coalesce(p_reason,'')),''),
      reviewed_by=case when p_status in ('owner_review','rejected') then auth.uid() else reviewed_by end,
      reviewed_at=case when p_status in ('owner_review','rejected') then now() else reviewed_at end
  where id=p_review_id
  returning * into result;

  if result.id is null then raise exception 'Route review not found'; end if;
  return result;
end;
$$;

grant execute on function public.brinesearch_route_review_dashboard(text,text,integer,integer) to authenticated;
grant execute on function public.brinesearch_route_review_mark(uuid,text,text) to authenticated;

comment on table public.brinesearch_route_reviews is 'Owner-only Road Manager staging queue. It never writes pad directions automatically and prohibits local-road route guesses.';
comment on table public.brinesearch_route_review_segments is 'Evidence-backed segment measurements for Road Manager review; estimates are allowed only on official state/federal routes.';
