-- GitHub #70 — resolve explicit suffixed Ohio county/township route identities
-- that the earlier exact matcher held because the route suffix was not part of
-- its Road Manager identity comparison.
--
-- Eligibility is intentionally narrow:
--   * active unmatched Ohio route-prep road step
--   * raw text begins with an explicit CR/TR number WITH an alphabetic suffix
--   * exactly one ODOT NLF in the same county/type/number/suffix
--   * every segment of that NLF has official geometry
--   * zero or one Road Manager row may already own that exact full route/NLF
--
-- Existing rows are upgraded only when their source NLF or exact suffixed route
-- identity proves they are the same road. No fuzzy/name similarity, no nearest
-- road, no spatial identity choice, and no #69 route publication.

create temporary table issue70_suffix_candidates on commit drop as
with unmatched as (
  select
    s.id as step_id,
    s.route_prep_id,
    s.raw_text,
    rp.pad_id,
    rp.company,
    rp.pad_name,
    p.county,
    p.township,
    upper((regexp_match(upper(btrim(s.raw_text)),'^(CR|TR)[ -]?0*([0-9]+)([A-Z])(?:[[:space:]]|/|$)'))[1]) as route_type,
    ltrim((regexp_match(upper(btrim(s.raw_text)),'^(CR|TR)[ -]?0*([0-9]+)([A-Z])(?:[[:space:]]|/|$)'))[2],'0') as route_number,
    upper((regexp_match(upper(btrim(s.raw_text)),'^(CR|TR)[ -]?0*([0-9]+)([A-Z])(?:[[:space:]]|/|$)'))[3]) as route_suffix
  from public.brinesearch_route_prep_steps s
  join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
  join public.pads p on p.id=rp.pad_id
  where s.active
    and s.road_id is null
    and upper(coalesce(rp.state,p.state,'')) in ('OH','OHIO')
    and s.step_kind in ('local_road','county_road','township_road')
    and upper(btrim(s.raw_text)) ~ '^(CR|TR)[ -]?0*[0-9]+[A-Z](?:[[:space:]]|/|$)'
), official as (
  select
    u.*,
    public.brinesearch_oh_county_code(u.county) as county_code,
    count(distinct c.nlf_id)::integer as nlf_count,
    min(c.nlf_id) as nlf_id,
    count(c.roadway_inventory_id)::integer as official_segments,
    count(c.geom)::integer as loaded_segments,
    extensions.st_unaryunion(extensions.st_collect(c.geom)) as official_geom
  from unmatched u
  left join public.brinesearch_odot_road_catalog c
    on c.county_code=public.brinesearch_oh_county_code(u.county)
   and c.route_type=u.route_type
   and c.route_number_normalized=u.route_number
   and upper(coalesce(nullif(c.route_suffix,'*'),''))=u.route_suffix
  group by u.step_id,u.route_prep_id,u.raw_text,u.pad_id,u.company,u.pad_name,
           u.county,u.township,u.route_type,u.route_number,u.route_suffix
), exact_official as (
  select *,route_number||route_suffix as route_number_full,
         route_type||'-'||route_number||route_suffix as route_label
  from official
  where nlf_count=1
    and official_segments>0
    and loaded_segments=official_segments
    and official_geom is not null
), road_match as (
  select
    o.*,
    coalesce(r.existing_count,0) as existing_count,
    r.road_id,
    r.road_nlf,
    r.existing_route_number
  from exact_official o
  left join lateral (
    select
      count(*)::integer as existing_count,
      (min(rr.id::text))::uuid as road_id,
      min(split_part(coalesce(rr.source_record_id,''),'|',1)) as road_nlf,
      min(rr.route_number) as existing_route_number
    from public.brinesearch_roads rr
    where rr.state='OH'
      and lower(coalesce(rr.county,''))=lower(o.county)
      and rr.road_type=case o.route_type when 'CR' then 'county' when 'TR' then 'township' end
      and (
        split_part(coalesce(rr.source_record_id,''),'|',1)=o.nlf_id
        or upper(regexp_replace(coalesce(rr.route_number,''),'[^0-9A-Z]','','g'))=upper(o.route_number_full)
      )
  ) r on true
)
select *
from road_match
where existing_count<=1;

-- Create one Road Manager identity per exact official NLF not already represented.
with new_roads as (
  select distinct on (nlf_id)
    nlf_id,county,route_type,route_number,route_suffix,route_number_full,route_label,official_geom
  from issue70_suffix_candidates
  where existing_count=0
  order by nlf_id,route_label
)
insert into public.brinesearch_roads(
  canonical_name,normalized_name,road_type,state,county,aliases,
  verification_status,verified_at,route_number,
  source_agency,source_dataset,source_method,source_url,source_record_id,
  centerline_geojson,geometry_status,geometry_checked_at,candidate_only,approved_by_default,notes
)
select
  route_label,public.brinesearch_road_match_key(route_label),
  case route_type when 'CR' then 'county' when 'TR' then 'township' end,
  'OH',county,array[route_label]::text[],
  'verified',now(),route_number_full,
  'Ohio Department of Transportation','Road Inventory','official_odot_issue70_suffix_route_reconcile',
  'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
  nlf_id||'|route:'||route_type||':'||route_number_full,
  extensions.st_asgeojson(official_geom,7)::jsonb,'official_centerline_loaded',now(),false,false,
  'Issue #70 exact suffixed numbered-road identity from one complete official ODOT NLF.'
from new_roads;

-- Upgrade the one already represented exact NLF/full route. This covers a local
-- street-name Road Manager row that was originally loaded from only part of the
-- same official NLF: preserve the local name/aliases, correct the route suffix,
-- and replace partial geometry with the complete official NLF centerline.
with existing as (
  select distinct on (road_id)
    road_id,nlf_id,route_type,route_number,route_suffix,route_number_full,route_label,official_geom
  from issue70_suffix_candidates
  where existing_count=1 and road_id is not null
    and (road_nlf=nlf_id or upper(regexp_replace(coalesce(existing_route_number,''),'[^0-9A-Z]','','g'))=upper(route_number_full))
  order by road_id,route_label
)
update public.brinesearch_roads r
set route_number=e.route_number_full,
    aliases=(
      select coalesce(array_agg(value order by lower(value),value),'{}'::text[])
      from (
        select distinct on (lower(btrim(x))) btrim(x) as value
        from unnest(coalesce(r.aliases,'{}'::text[])||array[e.route_label]::text[]) x
        where nullif(btrim(x),'') is not null
          and not (
            e.route_suffix<>''
            and upper(regexp_replace(btrim(x),'[^0-9A-Z]','','g'))=upper(e.route_type||e.route_number)
          )
        order by lower(btrim(x)),btrim(x)
      ) q
    ),
    verification_status='verified',verified_at=coalesce(r.verified_at,now()),
    source_agency='Ohio Department of Transportation',source_dataset='Road Inventory',
    source_method='official_odot_issue70_suffix_route_reconcile',
    source_url='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
    source_record_id=e.nlf_id||'|route:'||e.route_type||':'||e.route_number_full,
    centerline_geojson=extensions.st_asgeojson(e.official_geom,7)::jsonb,
    geometry_status='official_centerline_loaded',geometry_checked_at=now(),candidate_only=false,updated_at=now(),
    notes=btrim(coalesce(r.notes,'')||' #70 corrected exact route suffix and upgraded to complete official ODOT NLF geometry.')
from existing e
where r.id=e.road_id;

-- Link only the exact explicit suffixed route-prep occurrences to the Road Manager
-- row that now owns the same exact ODOT NLF/full numbered identity.
update public.brinesearch_route_prep_steps s
set road_id=r.id,
    step_kind=case c.route_type when 'CR' then 'county_road' when 'TR' then 'township_road' end,
    match_status='exact_master',
    match_method='official_odot_exact_suffix_issue70',
    match_confidence=1.0,
    source_details=coalesce(s.source_details,'{}'::jsonb)||jsonb_build_object(
      'issue',70,
      'match_basis','explicit suffixed route text + exact county/type/number/suffix + one complete official ODOT NLF',
      'route_label',c.route_label,
      'official_nlf_id',c.nlf_id,
      'road_id',r.id,
      'fuzzy_matching',false,
      'name_similarity_decision',false,
      'normalized_core_decision',false,
      'spatial_fallback',false,
      'nearest_road_fallback',false
    ),
    geometry_status='ready',updated_at=now()
from issue70_suffix_candidates c
join public.brinesearch_roads r
  on r.state='OH'
 and lower(coalesce(r.county,''))=lower(c.county)
 and r.road_type=case c.route_type when 'CR' then 'county' when 'TR' then 'township' end
 and split_part(coalesce(r.source_record_id,''),'|',1)=c.nlf_id
 and upper(regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','g'))=upper(c.route_number_full)
where s.id=c.step_id
  and s.active
  and s.road_id is null
  and upper(btrim(s.raw_text)) ~ ('^'||c.route_type||'[ -]?0*'||c.route_number||c.route_suffix||'(?:[[:space:]]|/|$)');
