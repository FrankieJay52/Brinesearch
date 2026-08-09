-- BrineSearch V17.3.18
-- Expose only verified official road-name/route-number pairs that are actually
-- mentioned in a pad's saved direction text. This lets the driver UI show
-- CR-15 / Foxes Bottom Rd, TR-79 / Springdale Hill Rd, etc. without assigning
-- one county-route name to unrelated segments.

create or replace function public.brinesearch_pad_official_road_aliases(p_pad_id uuid)
returns table(
  route_label text,
  canonical_name text,
  aliases text[],
  road_type text,
  source_agency text,
  source_record_id text
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with pad as (
    select id,
      case when state='Ohio' then 'OH' when state='West Virginia' then 'WV' when state='Pennsylvania' then 'PA' else upper(state) end state_code,
      county,
      lower(coalesce(directions_clear,'') || ' ' || coalesce(written_directions,'')) source_text
    from public.pads where id=p_pad_id
  ), candidates as (
    select distinct
      case r.road_type
        when 'interstate' then 'I-'||r.route_number
        when 'us_route' then 'US-'||r.route_number
        when 'state_route' then upper(r.state)||'-'||r.route_number
        when 'county' then 'CR-'||r.route_number
        when 'township' then 'TR-'||r.route_number
        else null
      end route_label,
      r.canonical_name,r.aliases,r.road_type,r.source_agency,r.source_record_id
    from pad p
    join public.brinesearch_roads r
      on upper(r.state)=p.state_code
     and lower(coalesce(r.county,''))=lower(coalesce(p.county,''))
    where r.verification_status='verified'
      and nullif(btrim(r.route_number),'') is not null
      and (
        (length(btrim(r.canonical_name))>3 and p.source_text like '%'||lower(btrim(r.canonical_name))||'%')
        or exists (
          select 1 from unnest(coalesce(r.aliases,'{}'::text[])) a
          where length(btrim(a))>3
            and a !~* '^(?:I|US|OH|WV|PA|SR|CR|TR)[ -]*[0-9]'
            and a !~* '^(?:County|Township|State) (?:Road|Route|Hwy) [0-9]'
            and p.source_text like '%'||lower(btrim(a))||'%'
        )
      )
  )
  select route_label,canonical_name,aliases,road_type,source_agency,source_record_id
  from candidates
  where route_label is not null
  order by route_label,canonical_name
$$;

revoke all on function public.brinesearch_pad_official_road_aliases(uuid) from public,anon,authenticated;
grant execute on function public.brinesearch_pad_official_road_aliases(uuid) to anon,authenticated;
