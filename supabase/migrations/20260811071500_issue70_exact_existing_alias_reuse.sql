-- GitHub #70 — link route-prep steps that already exactly name one trusted
-- Road Manager road in the same geographic scope.
--
-- Evidence may be the Road Manager canonical name, a stored alias, or an exact
-- slash-delimited component of a stored alias. The decision is literal
-- case-insensitive text equality only. No fuzzy/name-core/spatial/nearest-road
-- inference and no #69 structured-route publication.

create temporary table issue70_exact_existing_alias_candidates on commit drop as
with unmatched as (
  select
    s.id as step_id,
    s.route_prep_id,
    s.raw_text,
    rp.pad_id,
    rp.company,
    rp.pad_name,
    case
      when upper(coalesce(rp.state,p.state,'')) in ('OH','OHIO') then 'OH'
      when upper(coalesce(rp.state,p.state,'')) in ('WV','WEST VIRGINIA') then 'WV'
      when upper(coalesce(rp.state,p.state,'')) in ('PA','PENNSYLVANIA') then 'PA'
      else upper(coalesce(rp.state,p.state,''))
    end as state_code,
    p.county,
    p.township
  from public.brinesearch_route_prep_steps s
  join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
  join public.pads p on p.id=rp.pad_id
  where s.active
    and s.road_id is null
    and s.step_kind in ('local_road','county_road','township_road','state_route','us_route','interstate')
    and nullif(pg_catalog.btrim(coalesce(s.raw_text,'')),'') is not null
), road_names as (
  select distinct
    r.id as road_id,
    r.canonical_name,
    r.road_type,
    r.state,
    r.county,
    r.township,
    r.route_number,
    r.source_record_id,
    pg_catalog.md5(r.centerline_geojson::text) as geometry_digest,
    pg_catalog.lower(pg_catalog.btrim(n.name)) as exact_name
  from public.brinesearch_roads r
  cross join lateral (
    select r.canonical_name as name
    union
    select a from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])) a
    union
    select pg_catalog.regexp_split_to_table(a,'\s*/\s*')
    from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])) a
  ) n
  where r.verification_status='verified'
    and r.centerline_geojson is not null
    and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
    and not coalesce(r.candidate_only,false)
    and nullif(pg_catalog.btrim(n.name),'') is not null
), possible as (
  select distinct
    u.step_id,u.route_prep_id,u.pad_id,u.company,u.pad_name,u.raw_text,
    u.state_code,u.county as pad_county,u.township as pad_township,
    rn.road_id,rn.canonical_name,rn.road_type,rn.state as road_state,
    rn.county as road_county,rn.township as road_township,rn.route_number,
    rn.source_record_id,rn.geometry_digest
  from unmatched u
  join road_names rn
    on pg_catalog.lower(pg_catalog.btrim(u.raw_text))=rn.exact_name
   and (rn.state is null or upper(rn.state)=u.state_code)
   and (rn.county is null or pg_catalog.lower(rn.county)=pg_catalog.lower(u.county))
   and (
     rn.road_type<>'township'
     or rn.township is null
     or pg_catalog.lower(rn.township)=pg_catalog.lower(u.township)
   )
), unique_steps as (
  select step_id
  from possible
  group by step_id
  having count(distinct road_id)=1
)
select p.*
from possible p
join unique_steps u using(step_id);

-- A road may appear through both its canonical name and one alias. Collapse that
-- duplicate evidence before applying.
create temporary table issue70_exact_existing_alias_apply on commit drop as
select distinct on (step_id)
  step_id,route_prep_id,pad_id,company,pad_name,raw_text,state_code,pad_county,pad_township,
  road_id,canonical_name,road_type,road_state,road_county,road_township,route_number,
  source_record_id,geometry_digest
from issue70_exact_existing_alias_candidates
order by step_id,road_id;

-- Revalidate every candidate immediately before write. If any Road Manager row
-- lost trusted status or scope, the update below simply does not link it.
update public.brinesearch_route_prep_steps s
set road_id=a.road_id,
    step_kind=case a.road_type
      when 'county' then 'county_road'
      when 'township' then 'township_road'
      when 'state_route' then 'state_route'
      when 'us_route' then 'us_route'
      when 'interstate' then 'interstate'
      else s.step_kind
    end,
    match_status='exact_master',
    match_method='road_manager_exact_existing_alias_issue70',
    match_confidence=1.0,
    source_details=coalesce(s.source_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'issue',70,
      'match_basis','exact canonical/stored Road Manager alias in same state/county scope',
      'exact_match_text',a.raw_text,
      'road_id',a.road_id,
      'road_canonical_name',a.canonical_name,
      'route_number',a.route_number,
      'source_record_id',a.source_record_id,
      'road_geometry_digest',a.geometry_digest,
      'fuzzy_matching',false,
      'name_similarity_decision',false,
      'normalized_core_decision',false,
      'spatial_fallback',false,
      'nearest_road_fallback',false
    ),
    geometry_status='ready',
    updated_at=now()
from issue70_exact_existing_alias_apply a
join public.brinesearch_roads r on r.id=a.road_id
where s.id=a.step_id
  and s.active
  and s.road_id is null
  and pg_catalog.lower(pg_catalog.btrim(s.raw_text))=pg_catalog.lower(pg_catalog.btrim(a.raw_text))
  and r.verification_status='verified'
  and r.centerline_geojson is not null
  and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
  and not coalesce(r.candidate_only,false)
  and (r.state is null or upper(r.state)=a.state_code)
  and (r.county is null or pg_catalog.lower(r.county)=pg_catalog.lower(a.pad_county))
  and (r.road_type<>'township' or r.township is null or pg_catalog.lower(r.township)=pg_catalog.lower(a.pad_township));

-- Promote exact composite-alias components to standalone aliases on the same road
-- so future exact lookup does not have to rediscover the slash relationship.
update public.brinesearch_roads r
set aliases=(
      select pg_catalog.array_agg(value order by pg_catalog.lower(value),value)
      from (
        select distinct on (pg_catalog.lower(pg_catalog.btrim(x))) pg_catalog.btrim(x) as value
        from pg_catalog.unnest(
          coalesce(r.aliases,'{}'::text[])
          || coalesce((
            select pg_catalog.array_agg(distinct a.raw_text)
            from issue70_exact_existing_alias_apply a
            join public.brinesearch_route_prep_steps s on s.id=a.step_id
            where a.road_id=r.id
              and s.road_id=r.id
              and s.match_method='road_manager_exact_existing_alias_issue70'
          ),'{}'::text[])
        ) x
        where nullif(pg_catalog.btrim(x),'') is not null
        order by pg_catalog.lower(pg_catalog.btrim(x)),pg_catalog.btrim(x)
      ) q
    ),
    updated_at=now()
where exists (
  select 1
  from issue70_exact_existing_alias_apply a
  join public.brinesearch_route_prep_steps s on s.id=a.step_id
  where a.road_id=r.id
    and s.road_id=r.id
    and s.match_method='road_manager_exact_existing_alias_issue70'
);

select public.road_manager_recalculate_route_readiness();
