-- BrineSearch V17.3.18
-- Resolve a missing road_key only when a local road name written in that exact
-- saved direction step maps to exactly one verified numbered road in the pad's
-- state/county. This is segment/name evidence, not a route-number-wide alias.

create or replace function public.brinesearch_apply_exact_saved_step_road_identities()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare changed integer := 0;
begin
  with road_names as (
    select r.id,r.state,r.county,r.source_agency,r.source_record_id,
      case r.road_type
        when 'interstate' then 'I-'||r.route_number
        when 'us_route' then 'US-'||r.route_number
        when 'state_route' then upper(r.state)||'-'||r.route_number
        when 'county' then 'CR-'||r.route_number
        when 'township' then 'TR-'||r.route_number
        else null
      end route_label,
      r.canonical_name matched_name
    from public.brinesearch_roads r
    where r.verification_status='verified' and nullif(btrim(r.route_number),'') is not null
      and length(btrim(coalesce(r.canonical_name,'')))>3
      and r.canonical_name !~* '^(?:I|US|OH|WV|PA|SR|CR|TR)[ -]*[0-9]'
      and r.canonical_name !~* '^(?:County|Township|State) (?:Road|Route|Hwy) [0-9]'
    union all
    select r.id,r.state,r.county,r.source_agency,r.source_record_id,
      case r.road_type
        when 'interstate' then 'I-'||r.route_number
        when 'us_route' then 'US-'||r.route_number
        when 'state_route' then upper(r.state)||'-'||r.route_number
        when 'county' then 'CR-'||r.route_number
        when 'township' then 'TR-'||r.route_number
        else null
      end route_label,
      a matched_name
    from public.brinesearch_roads r
    cross join lateral unnest(coalesce(r.aliases,'{}'::text[])) a
    where r.verification_status='verified' and nullif(btrim(r.route_number),'') is not null
      and length(btrim(a))>3
      and a !~* '^(?:I|US|OH|WV|PA|SR|CR|TR)[ -]*[0-9]'
      and a !~* '^(?:County|Township|State) (?:Road|Route|Hwy) [0-9]'
  ), matches as (
    select d.pad_id,d.step_order,r.route_label,r.matched_name,r.source_agency,r.source_record_id
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    join road_names r
      on upper(r.state)=case p.state when 'Ohio' then 'OH' when 'West Virginia' then 'WV' when 'Pennsylvania' then 'PA' else upper(p.state) end
     and lower(coalesce(r.county,''))=lower(coalesce(p.county,''))
    where d.road_key is null
      and coalesce(d.evidence->>'navigation_note_only','false')<>'true'
      and r.route_label is not null
      and lower(coalesce(d.evidence->>'instruction','')) like '%'||lower(btrim(r.matched_name))||'%'
  ), route_counts as (
    select pad_id,step_order,count(distinct route_label) route_count
    from matches group by pad_id,step_order
  ), ranked as (
    select m.*,row_number() over(partition by m.pad_id,m.step_order
      order by length(btrim(m.matched_name)) desc,m.route_label,m.matched_name) rn
    from matches m join route_counts c using(pad_id,step_order)
    where c.route_count=1
  )
  update public.brinesearch_direction_step_intelligence d
  set road_key=r.route_label,
      primary_road=r.route_label,
      local_road_name=btrim(r.matched_name),
      display_road=r.route_label||' / '||btrim(r.matched_name),
      evidence=d.evidence||jsonb_build_object(
        'road_identity_source','verified official road name written in this saved direction step',
        'road_identity_source_agency',r.source_agency,
        'road_identity_source_record_id',r.source_record_id,
        'road_identity_match_name',btrim(r.matched_name),
        'road_identity_v17318',true
      )
  from ranked r
  where r.rn=1 and d.pad_id=r.pad_id and d.step_order=r.step_order and d.road_key is null;
  get diagnostics changed=row_count;
  return changed;
end
$$;
revoke all on function public.brinesearch_apply_exact_saved_step_road_identities() from public,anon,authenticated;

create or replace function public.brinesearch_rebuild_direction_road_neighbors_v17318()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare changed integer := 0;
begin
  with neighbors as (
    select d.pad_id,d.step_order,
      (select x.road_key from public.brinesearch_direction_step_intelligence x
       where x.pad_id=d.pad_id and x.step_order<d.step_order and x.road_key is not null
       order by x.step_order desc limit 1) prev_key,
      (select x.road_key from public.brinesearch_direction_step_intelligence x
       where x.pad_id=d.pad_id and x.step_order>d.step_order and x.road_key is not null
       order by x.step_order asc limit 1) next_key
    from public.brinesearch_direction_step_intelligence d
  )
  update public.brinesearch_direction_step_intelligence d
  set prev_road_key=n.prev_key,
      next_road_key=n.next_key,
      same_road_continuation=coalesce(
        d.road_key is not null and d.road_key=n.prev_key
        and d.maneuver_class in('turn_left','turn_right','stay_left','stay_right','continue'),false)
  from neighbors n
  where d.pad_id=n.pad_id and d.step_order=n.step_order
    and (d.prev_road_key is distinct from n.prev_key
      or d.next_road_key is distinct from n.next_key
      or d.same_road_continuation is distinct from coalesce(
        d.road_key is not null and d.road_key=n.prev_key
        and d.maneuver_class in('turn_left','turn_right','stay_left','stay_right','continue'),false));
  get diagnostics changed=row_count;
  return changed;
end
$$;
revoke all on function public.brinesearch_rebuild_direction_road_neighbors_v17318() from public,anon,authenticated;

-- Apply to the current live intelligence snapshot, then recompute safe Ohio road
-- legs using the newly resolved road identities/neighbors.
do $$
declare r record;
begin
  perform public.brinesearch_apply_exact_saved_step_road_identities();
  perform public.brinesearch_rebuild_direction_road_neighbors_v17318();
  perform public.brinesearch_apply_official_road_aliases();
  for r in
    select distinct d.pad_id
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where p.state='Ohio' and d.road_key is not null
      and (d.distance_miles is null or d.distance_miles<=0)
  loop
    begin perform public.brinesearch_measure_safe_oh_road_legs(r.pad_id);
    exception when others then null;
    end;
  end loop;
end
$$;

-- Wrap the existing full refresh instead of duplicating its large parser. The
-- base refresh still owns parsing/shared-distance logic; V17.3.18 then applies
-- exact saved-step road identities, skips null-note rows when building neighbors,
-- reapplies official aliases, and refreshes safe road-leg measurements.
do $$
begin
  if to_regprocedure('public.brinesearch_refresh_all_direction_intelligence_v17318_base()') is null
     and to_regprocedure('public.brinesearch_refresh_all_direction_intelligence()') is not null then
    execute 'alter function public.brinesearch_refresh_all_direction_intelligence() rename to brinesearch_refresh_all_direction_intelligence_v17318_base';
  end if;
end
$$;

create or replace function public.brinesearch_refresh_all_direction_intelligence()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  result jsonb;
  exact_rows integer;
  neighbor_rows integer;
  official_rows integer;
  measured_rows integer:=0;
  r record;
begin
  result:=public.brinesearch_refresh_all_direction_intelligence_v17318_base();
  exact_rows:=public.brinesearch_apply_exact_saved_step_road_identities();
  neighbor_rows:=public.brinesearch_rebuild_direction_road_neighbors_v17318();
  official_rows:=public.brinesearch_apply_official_road_aliases();

  for r in
    select distinct d.pad_id
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where p.state='Ohio' and d.road_key is not null
      and (d.distance_miles is null or d.distance_miles<=0)
  loop
    begin measured_rows:=measured_rows+public.brinesearch_measure_safe_oh_road_legs(r.pad_id);
    exception when others then null;
    end;
  end loop;

  return result||jsonb_build_object(
    'v17318_exact_saved_step_road_identities',exact_rows,
    'v17318_neighbor_rows_rebuilt',neighbor_rows,
    'v17318_official_alias_rows_after_exact_identity',official_rows,
    'v17318_safe_oh_road_leg_measurements',measured_rows
  );
end
$$;
revoke all on function public.brinesearch_refresh_all_direction_intelligence() from public,anon,authenticated;
