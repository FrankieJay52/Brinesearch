-- #70 structural correction: one Jefferson County Road Manager row for CR-10
-- had CR-12 aliases and six CR-12 route-prep occurrences attached to it. The saved
-- authoritative directions distinguish CR-12 from Smithfield-Adena Rd / CR-10,
-- and the ODOT catalog contains a separate complete CJEFCR00012**C centerline.
-- Split the identities by exact numbered route. No generated IDs are hard-coded.

do $issue70_cr12$
declare
  v_cr10 uuid;
  v_cr12 uuid;
  v_count integer;
  v_nlf_count integer;
  v_total integer;
  v_loaded integer;
  v_geom extensions.geometry;
  v_moved integer;
begin
  select count(*),min(id::text)::uuid
  into v_count,v_cr10
  from public.brinesearch_roads
  where state='OH' and county='Jefferson' and road_type='county'
    and route_number='10'
    and pg_catalog.split_part(coalesce(source_record_id,''),'|',1)='CJEFCR00010**C';
  if v_count<>1 then
    raise exception '#70 expected exactly one Jefferson CR-10 ODOT Road Manager row, found %',v_count;
  end if;

  select count(distinct nlf_id),count(*),count(geom),
         extensions.st_unaryunion(extensions.st_collect(geom))
  into v_nlf_count,v_total,v_loaded,v_geom
  from public.brinesearch_odot_road_catalog
  where county_code='JEF' and route_type='CR' and route_number_normalized='12'
    and coalesce(nullif(route_suffix,'*'),'')='';
  if v_nlf_count<>1 or v_total=0 or v_loaded<>v_total or v_geom is null then
    raise exception '#70 Jefferson CR-12 official geometry is not uniquely complete (nlf %, total %, loaded %)',v_nlf_count,v_total,v_loaded;
  end if;

  select count(*),min(id::text)::uuid
  into v_count,v_cr12
  from public.brinesearch_roads
  where state='OH' and county='Jefferson' and road_type='county'
    and (
      route_number='12'
      or pg_catalog.split_part(coalesce(source_record_id,''),'|',1)='CJEFCR00012**C'
    );

  if v_count>1 then
    raise exception '#70 multiple Jefferson CR-12 Road Manager rows already exist';
  elsif v_count=0 then
    insert into public.brinesearch_roads(
      canonical_name,normalized_name,road_type,state,county,aliases,
      verification_status,verified_at,route_number,
      source_agency,source_dataset,source_method,source_url,source_record_id,
      centerline_geojson,geometry_status,geometry_checked_at,candidate_only,approved_by_default,notes
    ) values (
      'CR-12',public.brinesearch_road_match_key('CR-12'),'county','OH','Jefferson',array['CR-12','Unionvale Rd']::text[],
      'verified',now(),'12',
      'Ohio Department of Transportation','Road Inventory','official_odot_issue70_identity_split',
      'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
      'CJEFCR00012**C|route:CR:12',extensions.st_asgeojson(v_geom,7)::jsonb,
      'official_centerline_loaded',now(),false,false,
      'Issue #70 split CR-12 from a contaminated CR-10 Road Manager identity using explicit saved directions plus exact ODOT CR-12 geometry. Unionvale Rd is saved alias evidence and may describe a route segment.'
    ) returning id into v_cr12;
  else
    update public.brinesearch_roads
    set aliases=(
          select pg_catalog.array_agg(a order by pg_catalog.lower(a))
          from (
            select distinct on (pg_catalog.lower(pg_catalog.btrim(x))) pg_catalog.btrim(x) a
            from pg_catalog.unnest(coalesce(aliases,'{}'::text[])||array['CR-12','Unionvale Rd']::text[]) x
            where nullif(pg_catalog.btrim(x),'') is not null
            order by pg_catalog.lower(pg_catalog.btrim(x)),pg_catalog.btrim(x)
          ) q
        ),
        verification_status='verified',verified_at=coalesce(verified_at,now()),route_number='12',
        source_agency='Ohio Department of Transportation',source_dataset='Road Inventory',
        source_method='official_odot_issue70_identity_split',
        source_url='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
        source_record_id='CJEFCR00012**C|route:CR:12',
        centerline_geojson=extensions.st_asgeojson(v_geom,7)::jsonb,
        geometry_status='official_centerline_loaded',geometry_checked_at=now(),candidate_only=false,updated_at=now()
    where id=v_cr12;
  end if;

  update public.brinesearch_route_prep_steps s
  set road_id=v_cr12,
      step_kind='county_road',match_status='exact_master',
      match_method='issue70_exact_cr12_identity_split',match_confidence=1.0,
      geometry_status='ready',updated_at=now(),
      source_details=coalesce(s.source_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'issue',70,'match_basis','saved directions explicitly distinguish CR-12 from CR-10 and ODOT has separate CJEFCR00012**C',
        'source_record_id','CJEFCR00012**C|route:CR:12','road_id',v_cr12,
        'fuzzy_matching',false,'nearest_road_fallback',false
      )
  where s.active and s.road_id=v_cr10
    and s.raw_text ~* '^\s*CR[ -]?12(?:\s|/|$)';
  get diagnostics v_moved=row_count;

  if v_moved=0 then
    raise exception '#70 CR-10/CR-12 correction found no mislinked CR-12 route-prep rows';
  end if;

  update public.brinesearch_roads r
  set aliases=coalesce((
        select pg_catalog.array_agg(x order by x)
        from pg_catalog.unnest(r.aliases) x
        where x !~* '^\s*CR[ -]?12(?:\s|/|$)'
      ),'{}'::text[]),
      updated_at=now(),
      notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 removed CR-12 aliases that belonged to separate Jefferson CR-12 identity.')
  where r.id=v_cr10;

  perform public.road_manager_recalculate_route_readiness();
end;
$issue70_cr12$;
