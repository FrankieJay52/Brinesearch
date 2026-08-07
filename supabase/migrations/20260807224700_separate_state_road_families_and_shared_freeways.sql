-- Separate state-owned and local road families by state.
-- Interstates/freeways remain shared across state lines.
-- U.S. routes remain their own national route family and never merge with
-- a same-number state route.

begin;

drop index if exists public.brinesearch_roads_family_idx;

alter table public.brinesearch_roads
  drop column if exists route_family_key;

alter table public.brinesearch_roads
  add column route_family_key text generated always as (
    case
      when road_type = 'interstate' then
        'freeway|' || regexp_replace(coalesce(route_number, ''), '[NSEW]$', '', 'i')
      when road_type = 'us_route' then
        'us_route|' || regexp_replace(coalesce(route_number, ''), '[NSEW]$', '', 'i')
      when road_type = 'state_route' then
        'state_route|'
        || coalesce(nullif(upper(btrim(state)), ''), 'UNASSIGNED')
        || '|'
        || regexp_replace(coalesce(route_number, ''), '[NSEW]$', '', 'i')
      else
        'road|'
        || coalesce(nullif(upper(btrim(state)), ''), 'UNASSIGNED')
        || '|'
        || normalized_name
        || '|'
        || coalesce(county, '')
        || '|'
        || coalesce(township, '')
    end
  ) stored;

create index brinesearch_roads_family_idx
  on public.brinesearch_roads(route_family_key, canonical_name, state);

alter table public.brinesearch_roads
  drop constraint if exists brinesearch_roads_state_route_requires_state;

alter table public.brinesearch_roads
  add constraint brinesearch_roads_state_route_requires_state
  check (
    road_type <> 'state_route'
    or nullif(btrim(coalesce(state, '')), '') is not null
  );

comment on column public.brinesearch_roads.route_family_key is
  'Road Manager grouping key: interstates shared nationally; U.S. routes grouped by U.S. route number; state routes and all other roads separated by state.';

commit;
