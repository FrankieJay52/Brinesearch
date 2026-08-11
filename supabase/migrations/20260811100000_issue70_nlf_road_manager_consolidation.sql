-- GitHub #70 — consolidate duplicate Road Manager rows that represent the same
-- exact ODOT NLF/numbered road, then rerun literal exact-alias convergence.
--
-- Identity is exact NLF + county + one ODOT route type/number. Street-name pieces
-- of that same numbered route become aliases on one Road Manager row. No fuzzy,
-- nearest-road, or spatial identity decision. No #69 structured-route publication.

create table if not exists private_verification.brinesearch_nlf_consolidation_issue70 (
  nlfid text primary key,
  state text not null,
  county text not null,
  route_type text not null,
  route_number text not null,
  route_label text not null,
  survivor_road_id uuid not null references public.brinesearch_roads(id),
  merged_road_ids uuid[] not null,
  old_canonical_names text[] not null,
  consolidated_aliases text[] not null,
  catalog_segments integer not null,
  geometry_digest text not null,
  rewired_references jsonb not null default '{}'::jsonb,
  consolidated_at timestamptz not null default now()
);
alter table private_verification.brinesearch_nlf_consolidation_issue70 enable row level security;
alter table private_verification.brinesearch_nlf_consolidation_issue70 force row level security;
revoke all on private_verification.brinesearch_nlf_consolidation_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_nlf_consolidation_issue70 to service_role;

create temporary table tmp_issue70_nlf_groups on commit drop as
with road_groups as (
  select r.state,r.county,split_part(r.source_record_id,'|',1) as nlfid,
         count(*) as road_rows,
         (array_agg(r.id order by (r.source_record_id like split_part(r.source_record_id,'|',1)||'|route:%') desc,r.id::text))[1] as survivor_road_id,
         array_agg(r.id order by r.id::text) as merged_road_ids,
         array_agg(distinct r.canonical_name order by r.canonical_name) as old_canonical_names
  from public.brinesearch_roads r
  where split_part(coalesce(r.source_record_id,''),'|',1)<>''
  group by r.state,r.county,split_part(r.source_record_id,'|',1)
  having count(*)>1
), catalog as (
  select g.state,g.county,g.nlfid,g.road_rows,g.survivor_road_id,g.merged_road_ids,g.old_canonical_names,
         count(c.*) as catalog_segments,
         count(c.geom) as loaded_segments,
         count(distinct c.route_type) as route_types,
         count(distinct c.route_number_normalized) as route_numbers,
         min(c.route_type) as route_type,
         min(c.route_number_normalized) as route_number,
         extensions.st_unaryunion(extensions.st_collect(c.geom)) as full_geom
  from road_groups g
  left join public.brinesearch_odot_road_catalog c on c.nlf_id=g.nlfid
  group by g.state,g.county,g.nlfid,g.road_rows,g.survivor_road_id,g.merged_road_ids,g.old_canonical_names
)
select *,route_type||'-'||route_number as route_label
from catalog
where catalog_segments>0 and catalog_segments=loaded_segments and route_types=1 and route_numbers=1 and full_geom is not null;

do $guard$
declare all_dup_groups integer; safe_groups integer; excess_rows integer;
begin
  select count(*),coalesce(sum(rows-1),0) into all_dup_groups,excess_rows
  from (
    select count(*) rows
    from public.brinesearch_roads r
    where split_part(coalesce(r.source_record_id,''),'|',1)<>''
    group by r.state,r.county,split_part(r.source_record_id,'|',1)
    having count(*)>1
  ) x;
  select count(*) into safe_groups from tmp_issue70_nlf_groups;
  if all_dup_groups<>24 or safe_groups<>24 or excess_rows<>29 then
    raise exception '#70 duplicate NLF set changed: groups % safe % excess %',all_dup_groups,safe_groups,excess_rows;
  end if;
  if exists(select 1 from tmp_issue70_nlf_groups where route_type not in ('CR','TR')) then
    raise exception '#70 duplicate NLF consolidation is limited to CR/TR identities';
  end if;
end;$guard$;

create temporary table tmp_issue70_nlf_map on commit drop as
select g.nlfid,g.survivor_road_id,r.id as old_road_id
from tmp_issue70_nlf_groups g
join public.brinesearch_roads r
  on r.state=g.state and r.county=g.county and split_part(r.source_record_id,'|',1)=g.nlfid;

create temporary table tmp_issue70_nlf_aliases on commit drop as
with candidates as (
  select g.nlfid,g.route_label as alias from tmp_issue70_nlf_groups g
  union all
  select g.nlfid,r.canonical_name from tmp_issue70_nlf_groups g join public.brinesearch_roads r on r.id=any(g.merged_road_ids)
  union all
  select g.nlfid,a from tmp_issue70_nlf_groups g join public.brinesearch_roads r on r.id=any(g.merged_road_ids) cross join lateral unnest(coalesce(r.aliases,'{}'::text[])) a
  union all
  select g.nlfid,initcap(lower(c.official_name)) from tmp_issue70_nlf_groups g join public.brinesearch_odot_road_catalog c on c.nlf_id=g.nlfid where c.official_name is not null and btrim(c.official_name)<>''
), cleaned as (
  select nlfid,btrim(alias) alias from candidates where alias is not null and btrim(alias)<>''
), dedup as (
  select nlfid,lower(alias) alias_key,min(alias) alias from cleaned group by nlfid,lower(alias)
)
select g.nlfid,array[g.route_label]::text[] || coalesce(array_agg(d.alias order by lower(d.alias)) filter(where lower(d.alias)<>lower(g.route_label)),'{}'::text[]) as aliases
from tmp_issue70_nlf_groups g left join dedup d on d.nlfid=g.nlfid
group by g.nlfid,g.route_label;

-- Repoint every durable FK/evidence reference before deleting redundant rows.
update public.brinesearch_route_prep_steps t
set road_id=m.survivor_road_id,
    source_details=coalesce(t.source_details,'{}'::jsonb)||jsonb_build_object('nlf_consolidated_issue70',true,'previous_road_id',t.road_id,'survivor_road_id',m.survivor_road_id)
from tmp_issue70_nlf_map m where t.road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;

update public.brinesearch_pad_roads t set road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_driver_safety_facts_issue69 t set road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_lbrs_catalog_gap_issue70 t set road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_oh_context_resolutions_issue70 t set applied_road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.applied_road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_oh_context_resolutions_issue70 t set prev_road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.prev_road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_oh_context_resolutions_issue70 t set next_road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.next_road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_oh_road_matches_issue70 t set applied_road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.applied_road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_saved_alias_reconcile_issue70 t set selected_road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.selected_road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update private_verification.brinesearch_source_conflict_corrections_issue70 t set road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update public.brinesearch_odot_context_resolutions t set applied_road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.applied_road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;
update public.brinesearch_odot_step_matches t set applied_road_id=m.survivor_road_id from tmp_issue70_nlf_map m where t.applied_road_id=m.old_road_id and m.old_road_id<>m.survivor_road_id;

-- Rebuild each survivor as the one exact numbered-road identity with the complete
-- official ODOT NLF geometry and all local street names as aliases.
update public.brinesearch_roads r
set canonical_name=g.route_label,
    normalized_name=public.brinesearch_road_match_key(g.route_label),
    road_type=case g.route_type when 'CR' then 'county' else 'township' end,
    route_number=g.route_number,
    aliases=a.aliases,
    verification_status='verified',verified_at=now(),
    source_agency='Ohio Department of Transportation',source_dataset='Road Inventory',
    source_method='official_odot_issue70_nlf_consolidation',
    source_url='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
    source_record_id=g.nlfid||'|route:'||g.route_type||':'||g.route_number,
    centerline_geojson=extensions.st_asgeojson(g.full_geom,7)::jsonb,
    geometry_status='official_centerline_loaded',geometry_checked_at=now(),
    candidate_only=false,approved_by_default=false,
    notes=concat_ws(E'\n',nullif(r.notes,''),'Issue #70 consolidated duplicate Road Manager rows for the same exact ODOT NLF into one numbered-road identity; prior street-name rows are preserved as aliases.')
from tmp_issue70_nlf_groups g join tmp_issue70_nlf_aliases a on a.nlfid=g.nlfid
where r.id=g.survivor_road_id;

insert into private_verification.brinesearch_nlf_consolidation_issue70(
  nlfid,state,county,route_type,route_number,route_label,survivor_road_id,merged_road_ids,old_canonical_names,consolidated_aliases,catalog_segments,geometry_digest,rewired_references
)
select g.nlfid,g.state,g.county,g.route_type,g.route_number,g.route_label,g.survivor_road_id,g.merged_road_ids,g.old_canonical_names,a.aliases,g.catalog_segments,
       md5(extensions.st_asgeojson(g.full_geom,7)),
       jsonb_build_object(
         'route_prep_steps',(select count(*) from public.brinesearch_route_prep_steps s where s.road_id=g.survivor_road_id),
         'private_oh_matches',(select count(*) from private_verification.brinesearch_oh_road_matches_issue70 x where x.applied_road_id=g.survivor_road_id),
         'public_odot_matches',(select count(*) from public.brinesearch_odot_step_matches x where x.applied_road_id=g.survivor_road_id)
       )
from tmp_issue70_nlf_groups g join tmp_issue70_nlf_aliases a on a.nlfid=g.nlfid;

delete from public.brinesearch_roads r
using tmp_issue70_nlf_map m
where r.id=m.old_road_id and m.old_road_id<>m.survivor_road_id;

-- Literal exact-alias convergence after Road Manager identity cleanup. This is
-- state+county scoped and requires exactly one verified trusted-geometry identity.
create temporary table tmp_issue70_exact_convergence on commit drop as
with active_unmatched as (
  select s.id,s.raw_text,s.step_kind,coalesce(rp.state,p.state,'') route_state,p.county
  from public.brinesearch_route_prep_steps s
  join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
  join public.pads p on p.id=rp.pad_id
  where s.active and s.road_id is null and s.step_kind in ('local_road','county_road','township_road')
), road_names as (
  select r.id,r.state,r.county,lower(btrim(r.canonical_name)) exact_name from public.brinesearch_roads r
  where r.verification_status='verified' and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline','owner_verified_complete') and r.road_type in ('county','township','local')
  union all
  select r.id,r.state,r.county,lower(btrim(a)) from public.brinesearch_roads r cross join lateral unnest(coalesce(r.aliases,'{}'::text[])) a
  where r.verification_status='verified' and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline','owner_verified_complete') and r.road_type in ('county','township','local')
), candidates as (
  select s.id,count(distinct rn.id) roads,(min(rn.id::text))::uuid road_id
  from active_unmatched s join road_names rn
    on rn.exact_name=lower(btrim(s.raw_text))
   and lower(coalesce(rn.state,''))=case lower(s.route_state) when 'ohio' then 'oh' when 'west virginia' then 'wv' when 'pennsylvania' then 'pa' else lower(s.route_state) end
   and lower(coalesce(rn.county,''))=lower(coalesce(s.county,''))
  group by s.id
)
select id,road_id from candidates where roads=1;

update public.brinesearch_route_prep_steps s
set road_id=x.road_id,
    match_status='exact_master',match_method='road_manager_exact_current_alias_issue70',match_confidence=1.0,
    geometry_status=case when r.centerline_geojson is not null then 'ready' else 'not_started' end,
    source_details=coalesce(s.source_details,'{}'::jsonb)||jsonb_build_object(
      'issue',70,'match_basis','literal canonical/stored alias equality after exact NLF Road Manager consolidation',
      'road_id',x.road_id,'fuzzy_matching',false,'name_similarity_decision',false,'nearest_road_fallback',false,'spatial_fallback',false,'local_road_guessing',false
    ),updated_at=now()
from tmp_issue70_exact_convergence x join public.brinesearch_roads r on r.id=x.road_id
where s.id=x.id;

do $final$
declare duplicate_groups integer; evidence_rows integer; exact_links integer;
begin
  select count(*) into duplicate_groups from (
    select 1 from public.brinesearch_roads r
    where split_part(coalesce(r.source_record_id,''),'|',1)<>''
    group by r.state,r.county,split_part(r.source_record_id,'|',1)
    having count(*)>1
  ) d;
  select count(*) into evidence_rows from private_verification.brinesearch_nlf_consolidation_issue70;
  select count(*) into exact_links from tmp_issue70_exact_convergence;
  if duplicate_groups<>0 or evidence_rows<>24 then
    raise exception '#70 NLF consolidation incomplete: duplicate groups % evidence %',duplicate_groups,evidence_rows;
  end if;
  if exact_links<>10 then
    raise exception '#70 exact convergence set changed: expected 10, got %',exact_links;
  end if;
  if exists(
    select 1 from private_verification.brinesearch_nlf_consolidation_issue70 e
    join public.brinesearch_roads r on r.id=e.survivor_road_id
    where split_part(r.source_record_id,'|',1)<>e.nlfid or r.canonical_name<>e.route_label or r.geometry_status<>'official_centerline_loaded' or r.verification_status<>'verified'
       or md5(r.centerline_geojson::text) is null
  ) then raise exception '#70 consolidated survivor invariant failed'; end if;
  if exists(
    select 1 from public.brinesearch_route_prep_steps s
    where s.match_method='road_manager_exact_current_alias_issue70'
      and (coalesce((s.source_details->>'fuzzy_matching')::boolean,false) or coalesce((s.source_details->>'name_similarity_decision')::boolean,false) or coalesce((s.source_details->>'nearest_road_fallback')::boolean,false) or coalesce((s.source_details->>'spatial_fallback')::boolean,false))
  ) then raise exception '#70 exact convergence contains a guessing flag'; end if;
  if (select count(*) from public.pads where jsonb_typeof(structured_route_steps)='array' and jsonb_array_length(structured_route_steps)>0)<>0 then
    raise exception '#70 NLF consolidation must not publish #69 structured routes';
  end if;
end;$final$;
