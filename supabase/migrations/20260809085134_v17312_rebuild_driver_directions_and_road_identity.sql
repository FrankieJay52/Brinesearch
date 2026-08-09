-- Production V17.3.12 direction rebuild.
-- The original all-operator publish had a legacy paragraph formatter that could
-- chop route numbers and combine several turns/mileages into one driver card.

create table if not exists private_verification.brinesearch_direction_archive_v17312 (
  pad_id uuid primary key,
  legacy_id text,
  company text,
  state text,
  county text,
  structured_road_sequence text,
  written_directions text,
  directions_clear text,
  directions_clear_method text,
  directions_clear_updated_at timestamptz,
  archived_at timestamptz not null default now()
);

insert into private_verification.brinesearch_direction_archive_v17312(
  pad_id,legacy_id,company,state,county,structured_road_sequence,written_directions,
  directions_clear,directions_clear_method,directions_clear_updated_at
)
select id,legacy_id,company,state,county,structured_road_sequence,written_directions,
       directions_clear,directions_clear_method,directions_clear_updated_at
from public.pads
where directions_clear_method='saved_route_structured_all_operators_20260808'
on conflict (pad_id) do nothing;

create or replace function public.brinesearch_resolve_generic_highway_v17312(
  p_state text,
  p_county text,
  p_number text,
  p_source text default null
)
returns text
language plpgsql
stable
set search_path='public'
as $function$
declare
  state_code text := case lower(coalesce(p_state,''))
    when 'ohio' then 'OH' when 'oh' then 'OH'
    when 'west virginia' then 'WV' when 'wv' then 'WV'
    when 'pennsylvania' then 'PA' when 'pa' then 'PA'
    else null end;
  n text := regexp_replace(coalesce(p_number,''),'[^0-9A-Z]','','gi');
  src text := coalesce(p_source,'');
  candidates text[];
  odot_types text[];
  answer text;
begin
  if n='' then return null; end if;

  if src ~* ('(^|[^A-Za-z0-9])I[ -]*0*'||n||'([^0-9A-Z]|$)|Interstate[[:space:]]+0*'||n||'([^0-9A-Z]|$)') then
    return 'I-'||n;
  end if;
  if src ~* ('(^|[^A-Za-z0-9])U[.]?S[.]?[ -]*(Route[[:space:]]+)?0*'||n||'([^0-9A-Z]|$)') then
    return 'US-'||n;
  end if;
  if state_code is not null and src ~* ('(State[[:space:]]+Route|S[.]?R[.]?|SR|'||state_code||')[ -]*0*'||n||'([^0-9A-Z]|$)') then
    return state_code||'-'||n;
  end if;

  select array_agg(distinct r.canonical_name order by r.canonical_name)
  into candidates
  from public.brinesearch_roads r
  where regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','gi')=n
    and r.road_type in ('interstate','us_route','state_route')
    and coalesce(r.candidate_only,false)=false
    and (r.state is null or state_code is null or r.state=state_code)
    and (r.verification_status='verified' or r.source_agency is not null or r.source_method='official_centerline');
  if cardinality(candidates)=1 then return candidates[1]; end if;

  if state_code='OH' then
    select array_agg(distinct upper(c.route_type) order by upper(c.route_type))
    into odot_types
    from public.brinesearch_odot_road_catalog c
    where c.county_code=public.brinesearch_oh_county_code(p_county)
      and c.route_number_normalized=regexp_replace(n,'^0+','')
      and upper(c.route_type) in ('I','US','SR')
      and coalesce(c.truck_route_indicator,'Y')='Y';
    if cardinality(odot_types)=1 then
      answer:=case odot_types[1]
        when 'I' then 'I-'||n
        when 'US' then 'US-'||n
        when 'SR' then 'OH-'||n
      end;
      if answer is not null then return answer; end if;
    end if;
  end if;

  select array_agg(distinct r.canonical_name order by r.canonical_name)
  into candidates
  from public.brinesearch_roads r
  where regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','gi')=n
    and r.road_type in ('interstate','us_route','state_route')
    and coalesce(r.candidate_only,false)=false
    and (r.state is null or state_code is null or r.state=state_code);
  if cardinality(candidates)=1 then return candidates[1]; end if;
  return null;
end;
$function$;

-- All Interstates, U.S. routes and state routes are approved-road defaults.
-- Explicit closures/restrictions/hazards still override this default.
update public.brinesearch_roads
set approved_by_default=true,updated_at=now()
where road_type in ('interstate','us_route','state_route')
  and approved_by_default is distinct from true;

-- The final formatter and manual high-confidence corrections are installed by
-- 20260809085652_v17312_finish_route_sequence_and_direction_cleanup.sql.
