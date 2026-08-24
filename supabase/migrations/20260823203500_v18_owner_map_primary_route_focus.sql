-- V18 owner Road Manager selected-location graph focus.
-- A selected location may display only exact mapped occurrences from its
-- active primary route. Alternate variants remain available as reviewed
-- source data, but are not merged into the teal selected-route emphasis.
-- This changes no pad, route, road, graph, Google, or publication data.

create or replace function public.owner_approved_routes_map_viewport(
  p_west double precision,
  p_south double precision,
  p_east double precision,
  p_north double precision,
  p_zoom integer default 10,
  p_state text default null,
  p_county text default null,
  p_road_classes text[] default null,
  p_route_systems text[] default null,
  p_statuses text[] default null,
  p_search text default null,
  p_pad_id uuid default null,
  p_limit integer default 800
) returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_bbox extensions.geometry;
  v_limit integer := greatest(25,least(coalesce(p_limit,800),800));
  v_zoom integer := greatest(0,least(coalesce(p_zoom,10),19));
  v_tol double precision;
  v_search text := nullif(pg_catalog.btrim(p_search),'');
  v_county text := nullif(pg_catalog.btrim(p_county),'');
  v_result jsonb;
begin
  if not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'owner access required' using errcode='42501';
  end if;
  if p_west is null or p_south is null or p_east is null or p_north is null
     or p_west < -180 or p_east > 180
     or p_south < -85.05112878 or p_north > 85.05112878
     or p_west >= p_east or p_south >= p_north then
    raise exception 'invalid map bounds' using errcode='22023';
  end if;
  if p_state is not null and pg_catalog.upper(pg_catalog.btrim(p_state)) not in ('OH','WV','PA') then
    raise exception 'invalid state filter' using errcode='22023';
  end if;
  if pg_catalog.length(coalesce(v_search,'')) > 120
     or pg_catalog.length(coalesce(v_county,'')) > 100
     or coalesce(pg_catalog.array_length(p_road_classes,1),0) > 16
     or coalesce(pg_catalog.array_length(p_route_systems,1),0) > 12
     or coalesce(pg_catalog.array_length(p_statuses,1),0) > 8 then
    raise exception 'map filter is too large' using errcode='22023';
  end if;
  if v_zoom < 8 then
    return pg_catalog.jsonb_build_object(
      'type','FeatureCollection','features','[]'::jsonb,'pads','[]'::jsonb,
      'zoom_required',8,'truncated',false,'limit',v_limit,'zoom',v_zoom
    );
  end if;
  if (p_east-p_west) > (case when v_zoom>=12 then 1.2 else 3.5 end)
     or (p_north-p_south) > (case when v_zoom>=12 then .9 else 2.5 end) then
    raise exception 'map bounds too large for zoom level' using errcode='22023';
  end if;

  v_bbox := extensions.st_makeenvelope(p_west,p_south,p_east,p_north,4326);
  v_tol := case
    when v_zoom>=16 then 0
    when v_zoom>=14 then .00001
    when v_zoom>=12 then .00004
    when v_zoom>=10 then .00012
    else .0003
  end;

  with odot as materialized (
    select c.roadway_inventory_id,c.county_code,c.geom
    from public.brinesearch_odot_road_catalog c
    where c.source_active and c.geom is not null
      and c.geom operator(extensions.&&) v_bbox
      and extensions.st_intersects(c.geom,v_bbox)
  ), spatial as materialized (
    select a.identity_id,c.geom
    from odot c
    join public.brinesearch_road_graph_counties gc
      on gc.state_code='OH' and gc.source_county_code=c.county_code and gc.active
    join public.brinesearch_authoritative_segment_identity_assignments a
      on a.dataset_id=private_verification.brinesearch_issue97_uuid('dataset:oh_odot_tims_road_inventory')
     and a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
     and a.active
    union all
    select s.identity_id,s.geom
    from public.brinesearch_authoritative_external_road_segments s
    where s.active and s.geom is not null
      and s.geom operator(extensions.&&) v_bbox
      and extensions.st_intersects(s.geom,v_bbox)
  ), ids as materialized (
    select distinct identity_id from spatial
  ), narrow as materialized (
    select i.id,i.dataset_id,i.display_name,i.road_class,i.route_system,i.route_number,
      i.state_code,i.county_code,i.county_name,i.township,i.municipality,
      i.public_access_status,i.drivable_status,i.truck_status,i.source_identity_key,
      d.source_agency,d.source_dataset,d.source_version
    from ids x
    join public.brinesearch_authoritative_road_identities i on i.id=x.identity_id and i.active
    join public.brinesearch_road_source_datasets d on d.id=i.dataset_id and d.active
    where (p_state is null or i.state_code=pg_catalog.upper(pg_catalog.btrim(p_state)))
      and (v_county is null or i.county_code=pg_catalog.upper(v_county) or i.county_name ilike '%'||v_county||'%')
      and (coalesce(pg_catalog.array_length(p_road_classes,1),0)=0 or i.road_class=any(p_road_classes))
      and (coalesce(pg_catalog.array_length(p_route_systems,1),0)=0 or i.route_system=any(p_route_systems))
      and (
        v_search is null
        or i.display_name ilike '%'||v_search||'%'
        or i.source_identity_key ilike '%'||v_search||'%'
        or pg_catalog.concat_ws(' ',i.route_system,i.route_number) ilike '%'||v_search||'%'
        or i.county_name ilike '%'||v_search||'%'
        or i.township ilike '%'||v_search||'%'
        or i.municipality ilike '%'||v_search||'%'
        or exists (
          select 1
          from public.brinesearch_authoritative_road_names rn
          where rn.identity_id=i.id and rn.active
            and (rn.valid_from is null or rn.valid_from<=pg_catalog.now())
            and (rn.valid_to is null or rn.valid_to>pg_catalog.now())
            and rn.road_name ilike '%'||v_search||'%'
        )
      )
  ), scopes as materialized (
    select distinct dataset_id,state_code,county_code from narrow
  ), current_scopes as materialized (
    select s.*,
      private_verification.brinesearch_issue97_dataset_scope_current(s.dataset_id,s.state_code,s.county_code) current_scope
    from scopes s
  ), base as materialized (
    select n.*,s.current_scope
    from narrow n
    join current_scopes s
      on s.dataset_id=n.dataset_id
     and s.state_code=n.state_code
     and s.county_code is not distinct from n.county_code
  ), canonical as materialized (
    select distinct on(m.identity_id)
      m.identity_id,r.id road_id,r.canonical_name,
      r.low_bridge,r.weight_limit,r.construction,r.gate,
      r.narrow,r.steep_grade,r.one_lane,r.seasonal
    from base b
    join public.brinesearch_road_identity_mappings m
      on m.identity_id=b.id and m.mapping_status='verified'
    join public.brinesearch_roads r on r.id=m.road_id
    order by m.identity_id,m.verified_at desc nulls last,m.updated_at desc,m.id
  ), mapping_counts as materialized (
    select m.identity_id,count(distinct m.road_id)::integer verified_road_count
    from base b
    join public.brinesearch_road_identity_mappings m
      on m.identity_id=b.id and m.mapping_status='verified'
    group by m.identity_id
  ), use_rows as materialized (
    select m.identity_id,s.id step_id,rp.pad_id
    from base b
    join public.brinesearch_road_identity_mappings m
      on m.identity_id=b.id and m.mapping_status='verified'
    join public.brinesearch_route_prep_steps s on s.road_id=m.road_id and s.active
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    where p_pad_id is null or (
      rp.pad_id=p_pad_id
      and rp.route_group='primary'
      and rp.variant_index=1
    )
  ), use_count as materialized (
    select identity_id,count(distinct step_id)::integer occurrences,count(distinct pad_id)::integer pads
    from use_rows group by identity_id
  ), classified as materialized (
    select b.*,c.road_id,c.canonical_name,
      coalesce(mc.verified_road_count,0) verified_road_count,
      coalesce(u.occurrences,0) occurrences,
      coalesce(u.pads,0) pads,
      case
        -- Exact verified restrictions always outrank every positive approval path.
        when pg_catalog.lower(coalesce(b.public_access_status,'held')) in ('private','nonpublic','non_public','blocked','restricted','prohibited') then 'restricted'
        when pg_catalog.lower(coalesce(b.drivable_status,'held')) in ('non_drivable','nondrivable','blocked','restricted','prohibited') then 'restricted'
        when coalesce(c.low_bridge,false) or coalesce(c.weight_limit,false)
          or coalesce(c.construction,false) or coalesce(c.gate,false) then 'restricted'
        -- Stale/conflicting/unresolved source or safety state fails closed as held.
        when not b.current_scope then 'held'
        when coalesce(mc.verified_road_count,0)>1 then 'held'
        when pg_catalog.lower(coalesce(b.public_access_status,'held'))<>'public'
          or pg_catalog.lower(coalesce(b.drivable_status,'held'))<>'drivable' then 'held'
        when coalesce(c.narrow,false) or coalesce(c.steep_grade,false)
          or coalesce(c.one_lane,false) or coalesce(c.seasonal,false) then 'held'
        -- A policy class without its exact dataset-specific system and number is held.
        when b.road_class in ('interstate','us_route','state_route') and not (
          nullif(pg_catalog.btrim(b.route_number),'') is not null and (
            (b.road_class='interstate' and b.route_system in ('1','IR'))
            or (b.road_class='us_route' and b.route_system in ('2','US'))
            or (b.road_class='state_route' and b.route_system in ('3','SR','PennDOT NLF'))
          )
        ) then 'held'
        when nullif(pg_catalog.btrim(b.route_number),'') is not null and (
          (b.road_class='interstate' and b.route_system in ('1','IR'))
          or (b.road_class='us_route' and b.route_system in ('2','US'))
          or (b.road_class='state_route' and b.route_system in ('3','SR','PennDOT NLF'))
        ) then 'approved_by_policy'
        when b.road_class in ('county','township','municipal','local')
          and b.truck_status='official_truck_route' then 'explicitly_approved'
        when coalesce(u.occurrences,0)>0 then 'candidate'
        else 'reference_only'
      end approval_status
    from base b
    left join canonical c on c.identity_id=b.id
    left join mapping_counts mc on mc.identity_id=b.id
    left join use_count u on u.identity_id=b.id
  ), picked as materialized (
    select *
    from classified c
    where (p_pad_id is null or c.occurrences>0)
      and (coalesce(pg_catalog.array_length(p_statuses,1),0)=0 or c.approval_status=any(p_statuses))
    order by case c.approval_status
      when 'restricted' then 1 when 'held' then 2 when 'explicitly_approved' then 3
      when 'approved_by_policy' then 4 when 'candidate' then 5 else 6 end,
      c.display_name,c.state_code,c.county_code,c.id
    limit v_limit+1
  ), bounded as materialized (
    select * from picked limit v_limit
  ), features as materialized (
    select b.id,
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'geometry',extensions.st_asgeojson(
          case when v_tol=0
            then extensions.st_collectionextract(
              extensions.st_collect(extensions.st_intersection(s.geom,v_bbox)),2
            )
            else extensions.st_simplifypreservetopology(
              extensions.st_collectionextract(
                extensions.st_collect(extensions.st_intersection(s.geom,v_bbox)),2
              ),v_tol
            )
          end,6
        )::jsonb,
        'properties',pg_catalog.jsonb_build_object(
          'identity_id',b.id,'canonical_road_id',b.road_id,
          'display_name',b.display_name,'canonical_name',b.canonical_name,
          'route_system',b.route_system,'route_number',b.route_number,
          'route_designation',nullif(pg_catalog.concat_ws(' ',b.route_system,b.route_number),''),
          'road_class',b.road_class,'state_code',b.state_code,
          'county_code',b.county_code,'county_name',b.county_name,
          'township',b.township,'municipality',b.municipality,
          'approval_status',b.approval_status,'source_current',b.current_scope,
          'mapping_conflict',b.verified_road_count>1,
          'occurrence_count',b.occurrences,'pad_count',b.pads,
          'source_identity_key',b.source_identity_key,
          'source_agency',b.source_agency,'source_dataset',b.source_dataset,'source_version',b.source_version
        )
      ) feature
    from bounded b
    join spatial s on s.identity_id=b.id
    group by b.id,b.road_id,b.display_name,b.canonical_name,b.route_system,b.route_number,
      b.road_class,b.state_code,b.county_code,b.county_name,b.township,b.municipality,
      b.approval_status,b.current_scope,b.verified_road_count,b.occurrences,b.pads,b.source_identity_key,
      b.source_agency,b.source_dataset,b.source_version
  ), pad_markers as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'pad_id',p.id,'pad_name',p.pad_name,'company',p.company,
          'lat',p.latitude,'lng',p.longitude
        ) order by p.company,p.pad_name
      ),'[]'::jsonb
    ) rows
    from public.pads p
    where p_pad_id is not null and p.id=p_pad_id
  )
  select pg_catalog.jsonb_build_object(
    'type','FeatureCollection',
    'features',coalesce(
      (select pg_catalog.jsonb_agg(feature order by feature->'properties'->>'display_name') from features),
      '[]'::jsonb
    ),
    'pads',(select rows from pad_markers),
    'truncated',(select count(*)>v_limit from picked),
    'limit',v_limit,'zoom',v_zoom
  ) into v_result;
  return v_result;
end
$$;

revoke all on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) from public, anon;
grant execute on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) to authenticated;

comment on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) is 'V18 owner-only bounded exact-road viewport. Selected-location focus is restricted to active primary route variant 1; viewing never changes authority.';

do $assert$
declare
  v_definition text;
  v_security_definer boolean;
  v_config text[];
begin
  select
    pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_functiondef(proc.oid)),'\s+','','g'),
    proc.prosecdef,
    proc.proconfig
  into v_definition,v_security_definer,v_config
  from pg_catalog.pg_proc proc
  where proc.oid='public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)'::pg_catalog.regprocedure;
  if pg_catalog.strpos(
    v_definition,
    'wherep_pad_idisnullor(rp.pad_id=p_pad_idandrp.route_group=''primary''andrp.variant_index=1)'
  )=0 then
    raise exception 'owner map primary-route focus assertion failed';
  end if;
  if not v_security_definer
     or not ('search_path=""'=any(v_config))
     or not ('statement_timeout=8s'=any(v_config)) then
    raise exception 'owner map execution-hardening assertion failed';
  end if;
  if exists(
    select 1
    from information_schema.routine_privileges privilege
    where privilege.routine_schema='public'
      and privilege.routine_name='owner_approved_routes_map_viewport'
      and privilege.grantee='PUBLIC'
      and privilege.privilege_type='EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'authenticated',
    'public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) then
    raise exception 'owner map execute grant assertion failed';
  end if;
end
$assert$;
