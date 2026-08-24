-- Issue #108: exact, per-pad display boundaries for selected owner-map roads.
--
-- These receipts are presentation evidence only. They cannot carry an approved
-- status and are not read by route reconciliation, graph activation, or Google
-- publication. A selected pad may receive a clipped local-road line only after
-- its exact identity, entry boundary, and pad projection have been reviewed.

create table private_verification.brinesearch_owner_pad_road_display_receipts_issue108 (
  pad_id uuid not null references public.pads(id) on delete restrict,
  route_prep_id uuid not null references public.brinesearch_route_prep(id) on delete restrict,
  route_prep_step_id uuid not null references public.brinesearch_route_prep_steps(id) on delete restrict,
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  canonical_road_id uuid not null references public.brinesearch_roads(id) on delete restrict,
  prior_identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  display_name text not null check (pg_catalog.btrim(display_name)<>'' and pg_catalog.length(display_name)<=300),
  receipt_status text not null check (receipt_status in ('candidate','held','restricted','reference_only')),
  boundary_kind text not null check (boundary_kind='pad_endpoint_projection'),
  geometry_method text not null check (pg_catalog.btrim(geometry_method)<>''),
  start_coordinate extensions.geometry(Point,4326) not null,
  end_coordinate extensions.geometry(Point,4326) not null,
  display_geometry extensions.geometry(LineString,4326) not null,
  endpoint_offset_m numeric not null check (endpoint_offset_m>=0 and endpoint_offset_m<=25),
  pad_latitude double precision not null,
  pad_longitude double precision not null,
  route_sequence_hash text not null,
  identity_source_digest text not null,
  prior_identity_source_digest text not null,
  source_geometry_digest text not null,
  dependency_digest text not null,
  evidence jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(evidence)='object'),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (pad_id,route_prep_step_id),
  unique (pad_id,identity_id,boundary_kind),
  check (extensions.st_isvalid(display_geometry)),
  check (extensions.st_issimple(display_geometry)),
  check (extensions.st_npoints(display_geometry)>=2),
  check (extensions.st_dwithin(start_coordinate::extensions.geography,extensions.st_startpoint(display_geometry)::extensions.geography,0.25)),
  check (extensions.st_dwithin(end_coordinate::extensions.geography,extensions.st_endpoint(display_geometry)::extensions.geography,0.25))
);

create index brinesearch_owner_pad_road_display_receipts_issue108_pad_active_idx
  on private_verification.brinesearch_owner_pad_road_display_receipts_issue108(pad_id)
  where active;

alter table private_verification.brinesearch_owner_pad_road_display_receipts_issue108 enable row level security;
revoke all on table private_verification.brinesearch_owner_pad_road_display_receipts_issue108
  from public,anon,authenticated;

comment on table private_verification.brinesearch_owner_pad_road_display_receipts_issue108 is
  'Issue #108 private display-only per-pad exact-road boundary receipts. Rows never approve roads, reconcile routes, alter graphs, or publish Google output.';

do $seed_bannock_cr10$
declare
  v_pad public.pads%rowtype;
  v_route public.brinesearch_route_prep%rowtype;
  v_step public.brinesearch_route_prep_steps%rowtype;
  v_road public.brinesearch_roads%rowtype;
  v_prior_step public.brinesearch_route_prep_steps%rowtype;
  v_identity public.brinesearch_authoritative_road_identities%rowtype;
  v_prior_identity public.brinesearch_authoritative_road_identities%rowtype;
  v_terminal_line extensions.geometry;
  v_prior_line extensions.geometry;
  v_pad_point extensions.geometry;
  v_start_point extensions.geometry;
  v_end_point extensions.geometry;
  v_display_geometry extensions.geometry;
  v_start_fraction double precision;
  v_end_fraction double precision;
  v_endpoint_offset_m numeric;
  v_display_miles numeric;
  v_source_geometry_digest text;
  v_dependency_digest text;
  v_start_candidates integer;
  v_nearby_pads integer;
begin
  select p.* into strict v_pad
  from public.pads p
  where p.legacy_id='ascent--bannock';

  if v_pad.latitude is null or v_pad.longitude is null
     or extensions.st_distance(
       extensions.st_setsrid(extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326)::extensions.geography,
       extensions.st_setsrid(extensions.st_makepoint(-81.002932,40.111003),4326)::extensions.geography
     )>0.25 then
    raise exception 'Issue #108 Bannock coordinate evidence diverged';
  end if;

  select rp.* into strict v_route
  from public.brinesearch_route_prep rp
  where rp.pad_id=v_pad.id and rp.active
    and rp.route_group='primary' and rp.variant_index=1;

  select s.* into strict v_step
  from public.brinesearch_route_prep_steps s
  join public.brinesearch_roads r on r.id=s.road_id
  where s.route_prep_id=v_route.id and s.active
    and r.canonical_name='Lafferty-Bannock Rd'
    and 'CR-10'=any(r.aliases);

  select r.* into strict v_road
  from public.brinesearch_roads r
  where r.id=v_step.road_id;

  if v_road.road_type<>'county'
     or v_road.approved_by_default
     or v_road.geometry_status<>'not_loaded'
     or v_road.source_method<>'explicit_in_saved_directions' then
    raise exception 'Issue #108 Bannock canonical-road evidence diverged';
  end if;

  select i.* into strict v_identity
  from public.brinesearch_authoritative_road_identities i
  where i.active
    and i.source_identity_key='OH:ODOT:NLF:CBELCR00010**C'
    and i.state_code='OH' and i.county_code='BEL'
    and i.route_system='CR' and i.route_number='10';

  if v_identity.road_class<>'county'
     or pg_catalog.lower(coalesce(v_identity.public_access_status,''))<>'public'
     or pg_catalog.lower(coalesce(v_identity.drivable_status,''))<>'drivable'
     or v_identity.truck_status is not null
     or v_identity.source_digest is null
     or not private_verification.brinesearch_issue97_dataset_scope_current(
       v_identity.dataset_id,v_identity.state_code,v_identity.county_code
     ) then
    raise exception 'Issue #108 CR-10 identity is not current public/drivable candidate evidence';
  end if;

  select s.* into strict v_prior_step
  from public.brinesearch_route_prep_steps s
  where s.route_prep_id=v_route.id and s.active
    and s.road_id is not null and s.step_order<v_step.step_order
  order by s.step_order desc
  limit 1;

  select i.* into strict v_prior_identity
  from public.brinesearch_road_identity_mappings mapping
  join public.brinesearch_authoritative_road_identities i
    on i.id=mapping.identity_id and i.active
  where mapping.road_id=v_prior_step.road_id
    and mapping.mapping_status='verified'
    and i.state_code=v_identity.state_code
    and i.county_code=v_identity.county_code;

  if v_prior_identity.road_class<>'state_route'
     or v_prior_identity.route_system<>'SR'
     or v_prior_identity.route_number<>'331'
     or v_prior_identity.source_digest is null
     or not private_verification.brinesearch_issue97_dataset_scope_current(
       v_prior_identity.dataset_id,v_prior_identity.state_code,v_prior_identity.county_code
     ) then
    raise exception 'Issue #108 preceding OH-331 identity evidence diverged';
  end if;

  select extensions.st_linemerge(
    extensions.st_unaryunion(extensions.st_collect(c.geom order by c.ctl_begin,c.roadway_inventory_id))
  ) into v_terminal_line
  from public.brinesearch_authoritative_segment_identity_assignments assignment
  join public.brinesearch_odot_road_catalog c
    on assignment.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
   and c.source_active and c.geom is not null
  where assignment.dataset_id=v_identity.dataset_id
    and assignment.identity_id=v_identity.id
    and assignment.active;

  select extensions.st_linemerge(
    extensions.st_unaryunion(extensions.st_collect(c.geom order by c.ctl_begin,c.roadway_inventory_id))
  ) into v_prior_line
  from public.brinesearch_authoritative_segment_identity_assignments assignment
  join public.brinesearch_odot_road_catalog c
    on assignment.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
   and c.source_active and c.geom is not null
  where assignment.dataset_id=v_prior_identity.dataset_id
    and assignment.identity_id=v_prior_identity.id
    and assignment.active;

  if extensions.st_geometrytype(v_terminal_line)<>'ST_LineString'
     or extensions.st_geometrytype(v_prior_line)<>'ST_LineString' then
    raise exception 'Issue #108 exact source identities are not unambiguous lines';
  end if;

  select pg_catalog.count(*)::integer into v_start_candidates
  from public.brinesearch_authoritative_segment_identity_assignments assignment
  join public.brinesearch_odot_road_catalog c
    on assignment.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
   and c.source_active and c.geom is not null
  where assignment.dataset_id=v_identity.dataset_id
    and assignment.identity_id=v_identity.id
    and assignment.active
    and pg_catalog.upper(pg_catalog.btrim(c.official_name))='LAFFERTY RD'
    and extensions.st_dwithin(
      extensions.st_endpoint(c.geom)::extensions.geography,
      v_prior_line::extensions.geography,
      0.5
    );

  if v_start_candidates<>1 then
    raise exception 'Issue #108 expected one exact Lafferty/OH-331 entry boundary, found %',v_start_candidates;
  end if;

  select extensions.st_endpoint(c.geom) into strict v_start_point
  from public.brinesearch_authoritative_segment_identity_assignments assignment
  join public.brinesearch_odot_road_catalog c
    on assignment.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
   and c.source_active and c.geom is not null
  where assignment.dataset_id=v_identity.dataset_id
    and assignment.identity_id=v_identity.id
    and assignment.active
    and pg_catalog.upper(pg_catalog.btrim(c.official_name))='LAFFERTY RD'
    and extensions.st_dwithin(
      extensions.st_endpoint(c.geom)::extensions.geography,
      v_prior_line::extensions.geography,
      0.5
    );

  v_pad_point:=extensions.st_setsrid(
    extensions.st_makepoint(v_pad.longitude,v_pad.latitude),4326
  );
  v_end_point:=extensions.st_closestpoint(v_terminal_line,v_pad_point);
  v_endpoint_offset_m:=extensions.st_distance(
    v_pad_point::extensions.geography,v_end_point::extensions.geography
  );

  if v_endpoint_offset_m>25 then
    raise exception 'Issue #108 Bannock GPS is % m from the exact CR-10 identity',v_endpoint_offset_m;
  end if;

  select pg_catalog.count(*)::integer into v_nearby_pads
  from public.pads other
  where other.latitude is not null and other.longitude is not null
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(other.longitude,other.latitude),4326)::extensions.geography,
      v_terminal_line::extensions.geography,
      100
    );

  if v_nearby_pads<>1 then
    raise exception 'Issue #108 CR-10 pad exclusivity evidence diverged; nearby pads=%',v_nearby_pads;
  end if;

  v_start_fraction:=extensions.st_linelocatepoint(v_terminal_line,v_start_point);
  v_end_fraction:=extensions.st_linelocatepoint(v_terminal_line,v_end_point);
  v_display_geometry:=case when v_start_fraction<=v_end_fraction
    then extensions.st_linesubstring(v_terminal_line,v_start_fraction,v_end_fraction)
    else extensions.st_reverse(
      extensions.st_linesubstring(v_terminal_line,v_end_fraction,v_start_fraction)
    )
  end;
  v_display_miles:=extensions.st_length(v_display_geometry::extensions.geography)/1609.344;

  if extensions.st_geometrytype(v_display_geometry)<>'ST_LineString'
     or not extensions.st_isvalid(v_display_geometry)
     or not extensions.st_issimple(v_display_geometry)
     or extensions.st_npoints(v_display_geometry)<2
     or v_display_miles not between 1.4 and 1.7
     or not extensions.st_dwithin(
       v_start_point::extensions.geography,
       extensions.st_startpoint(v_display_geometry)::extensions.geography,
       0.25
     )
     or not extensions.st_dwithin(
       v_end_point::extensions.geography,
       extensions.st_endpoint(v_display_geometry)::extensions.geography,
       0.25
     ) then
    raise exception 'Issue #108 exact CR-10 display geometry failed validation';
  end if;

  v_source_geometry_digest:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    extensions.st_ashexewkb(v_terminal_line),'UTF8'
  ),'sha256'),'hex');
  v_dependency_digest:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws('|',
      v_pad.id::text,v_pad.latitude::text,v_pad.longitude::text,
      v_route.id::text,v_route.source_sequence_hash,
      v_step.id::text,v_road.id::text,
      v_identity.id::text,v_identity.source_digest,
      v_prior_identity.id::text,v_prior_identity.source_digest,
      v_source_geometry_digest,extensions.st_ashexewkb(v_display_geometry)
    ),'UTF8'
  ),'sha256'),'hex');

  insert into private_verification.brinesearch_owner_pad_road_display_receipts_issue108(
    pad_id,route_prep_id,route_prep_step_id,identity_id,canonical_road_id,prior_identity_id,
    display_name,receipt_status,boundary_kind,geometry_method,
    start_coordinate,end_coordinate,display_geometry,endpoint_offset_m,
    pad_latitude,pad_longitude,route_sequence_hash,
    identity_source_digest,prior_identity_source_digest,source_geometry_digest,dependency_digest,evidence
  ) values (
    v_pad.id,v_route.id,v_step.id,v_identity.id,v_road.id,v_prior_identity.id,
    'Lafferty-Bannock Rd / CR-10','candidate','pad_endpoint_projection',
    'owner_reviewed_exact_identity_entry_to_pad_projection',
    v_start_point,v_end_point,v_display_geometry,v_endpoint_offset_m,
    v_pad.latitude,v_pad.longitude,v_route.source_sequence_hash,
    v_identity.source_digest,v_prior_identity.source_digest,v_source_geometry_digest,v_dependency_digest,
    pg_catalog.jsonb_build_object(
      'issue',108,
      'authority_effect','display_only',
      'approval_upgrade',false,
      'route_authority_changed',false,
      'graph_authority_changed',false,
      'google_authority_changed',false,
      'entry_basis','unique exact LAFFERTY RD source-segment endpoint on the preceding OH-331 identity',
      'endpoint_basis','exact-road projection of the reviewed pad GPS',
      'nearby_pad_count',v_nearby_pads,
      'endpoint_offset_m',v_endpoint_offset_m,
      'display_miles',v_display_miles
    )
  );
end
$seed_bannock_cr10$;

-- Keep the already-reviewed bounded viewport implementation intact as a
-- private base and place the display-only receipt merger at the public edge.
do $base_guard$
begin
  if pg_catalog.to_regprocedure(
    'private_verification.brinesearch_owner_approved_routes_map_viewport_base_issue108(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)'
  ) is not null then
    raise exception 'Issue #108 private viewport base already exists';
  end if;
end
$base_guard$;

alter function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) set schema private_verification;

alter function private_verification.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) rename to brinesearch_owner_approved_routes_map_viewport_base_issue108;

revoke all on function private_verification.brinesearch_owner_approved_routes_map_viewport_base_issue108(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) from public,anon,authenticated;

create function public.owner_approved_routes_map_viewport(
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
  v_base jsonb;
  v_bbox extensions.geometry;
  v_limit integer:=greatest(25,least(coalesce(p_limit,800),800));
  v_zoom integer:=greatest(0,least(coalesce(p_zoom,10),19));
  v_tol double precision;
  v_county text:=nullif(pg_catalog.btrim(p_county),'');
  v_search text:=nullif(pg_catalog.btrim(p_search),'');
  v_result jsonb;
begin
  if not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'owner access required' using errcode='42501';
  end if;

  v_base:=private_verification.brinesearch_owner_approved_routes_map_viewport_base_issue108(
    p_west,p_south,p_east,p_north,p_zoom,p_state,p_county,p_road_classes,
    p_route_systems,p_statuses,p_search,p_pad_id,p_limit
  );

  if p_pad_id is null or v_zoom<8 then
    return v_base;
  end if;

  v_bbox:=extensions.st_makeenvelope(p_west,p_south,p_east,p_north,4326);
  v_tol:=case
    when v_zoom>=16 then 0
    when v_zoom>=14 then .00001
    when v_zoom>=12 then .00004
    when v_zoom>=10 then .00012
    else .0003
  end;

  with current_receipts as materialized (
    select receipt.*,identity.display_name identity_display_name,
      identity.road_class,identity.route_system,identity.route_number,
      identity.state_code,identity.county_code,identity.county_name,
      identity.township,identity.municipality,identity.source_identity_key,
      dataset.source_agency,dataset.source_dataset,dataset.source_version,
      road.canonical_name,
      coalesce(mapping_count.verified_road_count,0) verified_road_count
    from private_verification.brinesearch_owner_pad_road_display_receipts_issue108 receipt
    join public.pads pad on pad.id=receipt.pad_id
    join public.brinesearch_route_prep route on route.id=receipt.route_prep_id
    join public.brinesearch_route_prep_steps step on step.id=receipt.route_prep_step_id
    join public.brinesearch_roads road on road.id=receipt.canonical_road_id
    join public.brinesearch_authoritative_road_identities identity on identity.id=receipt.identity_id
    join public.brinesearch_authoritative_road_identities prior_identity on prior_identity.id=receipt.prior_identity_id
    join public.brinesearch_road_source_datasets dataset on dataset.id=identity.dataset_id
    left join lateral (
      select pg_catalog.count(distinct mapping.road_id)::integer verified_road_count
      from public.brinesearch_road_identity_mappings mapping
      where mapping.identity_id=identity.id and mapping.mapping_status='verified'
    ) mapping_count on true
    where receipt.active and receipt.pad_id=p_pad_id
      and route.active and route.pad_id=receipt.pad_id
      and route.route_group='primary' and route.variant_index=1
      and route.source_sequence_hash=receipt.route_sequence_hash
      and step.active and step.route_prep_id=route.id
      and step.road_id=receipt.canonical_road_id
      and pad.latitude is not distinct from receipt.pad_latitude
      and pad.longitude is not distinct from receipt.pad_longitude
      and identity.active and identity.source_digest=receipt.identity_source_digest
      and prior_identity.active and prior_identity.source_digest=receipt.prior_identity_source_digest
      and dataset.active
      and private_verification.brinesearch_issue97_dataset_scope_current(
        identity.dataset_id,identity.state_code,identity.county_code
      )
      and private_verification.brinesearch_issue97_dataset_scope_current(
        prior_identity.dataset_id,prior_identity.state_code,prior_identity.county_code
      )
      and extensions.st_geometrytype(receipt.display_geometry)='ST_LineString'
      and extensions.st_isvalid(receipt.display_geometry)
      and extensions.st_issimple(receipt.display_geometry)
      and extensions.st_dwithin(
        receipt.start_coordinate::extensions.geography,
        extensions.st_startpoint(receipt.display_geometry)::extensions.geography,
        0.25
      )
      and extensions.st_dwithin(
        receipt.end_coordinate::extensions.geography,
        extensions.st_endpoint(receipt.display_geometry)::extensions.geography,
        0.25
      )
      and pg_catalog.abs(extensions.st_distance(
        extensions.st_setsrid(extensions.st_makepoint(pad.longitude,pad.latitude),4326)::extensions.geography,
        receipt.end_coordinate::extensions.geography
      )-receipt.endpoint_offset_m::double precision)<=0.25
      and receipt.display_geometry operator(extensions.&&) v_bbox
      and extensions.st_intersects(receipt.display_geometry,v_bbox)
      and (p_state is null or identity.state_code=pg_catalog.upper(pg_catalog.btrim(p_state)))
      and (v_county is null or identity.county_code=pg_catalog.upper(v_county) or identity.county_name ilike '%'||v_county||'%')
      and (coalesce(pg_catalog.array_length(p_road_classes,1),0)=0 or identity.road_class=any(p_road_classes))
      and (coalesce(pg_catalog.array_length(p_route_systems,1),0)=0 or identity.route_system=any(p_route_systems))
      and (coalesce(pg_catalog.array_length(p_statuses,1),0)=0 or receipt.receipt_status=any(p_statuses))
      and (
        v_search is null
        or receipt.display_name ilike '%'||v_search||'%'
        or road.canonical_name ilike '%'||v_search||'%'
        or identity.source_identity_key ilike '%'||v_search||'%'
        or pg_catalog.concat_ws(' ',identity.route_system,identity.route_number) ilike '%'||v_search||'%'
        or identity.county_name ilike '%'||v_search||'%'
        or identity.township ilike '%'||v_search||'%'
        or identity.municipality ilike '%'||v_search||'%'
      )
  ), clipped_receipts as materialized (
    select receipt.*,
      extensions.st_collectionextract(
        extensions.st_intersection(receipt.display_geometry,v_bbox),2
      ) clipped_geometry
    from current_receipts receipt
  ), receipt_features as materialized (
    select receipt.identity_id,
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'geometry',extensions.st_asgeojson(
          case when v_tol=0 then receipt.clipped_geometry
            else extensions.st_simplifypreservetopology(receipt.clipped_geometry,v_tol)
          end,6
        )::jsonb,
        'properties',pg_catalog.jsonb_build_object(
          'identity_id',receipt.identity_id,
          'canonical_road_id',receipt.canonical_road_id,
          'display_name',receipt.display_name,
          'canonical_name',receipt.canonical_name,
          'route_system',receipt.route_system,
          'route_number',receipt.route_number,
          'route_designation',nullif(pg_catalog.concat_ws(' ',receipt.route_system,receipt.route_number),''),
          'road_class',receipt.road_class,
          'state_code',receipt.state_code,
          'county_code',receipt.county_code,
          'county_name',receipt.county_name,
          'township',receipt.township,
          'municipality',receipt.municipality,
          'approval_status',receipt.receipt_status,
          'source_current',true,
          'mapping_conflict',receipt.verified_road_count>1,
          'occurrence_count',1,
          'pad_count',1,
          'source_identity_key',receipt.source_identity_key,
          'source_agency',receipt.source_agency,
          'source_dataset',receipt.source_dataset,
          'source_version',receipt.source_version,
          'display_boundary',receipt.boundary_kind,
          'endpoint_offset_m',pg_catalog.round(receipt.endpoint_offset_m,3)
        )
      ) feature
    from clipped_receipts receipt
    where not extensions.st_isempty(receipt.clipped_geometry)
      and extensions.st_dimension(receipt.clipped_geometry)=1
  ), base_features as materialized (
    select item.feature,item.ordinality::integer sort_order
    from pg_catalog.jsonb_array_elements(coalesce(v_base->'features','[]'::jsonb))
      with ordinality item(feature,ordinality)
    where not exists (
      select 1 from receipt_features receipt
      where receipt.identity_id::text=item.feature->'properties'->>'identity_id'
    )
  ), combined as materialized (
    select base.feature,base.sort_order from base_features base
    union all
    select receipt.feature,100000+(pg_catalog.row_number() over(
      order by receipt.feature->'properties'->>'display_name',receipt.identity_id
    ))::integer
    from receipt_features receipt
  ), ranked as materialized (
    select combined.*,
      pg_catalog.row_number() over(order by combined.sort_order)::integer row_number,
      pg_catalog.count(*) over()::integer total_count
    from combined
  )
  select v_base||pg_catalog.jsonb_build_object(
    'features',coalesce(
      pg_catalog.jsonb_agg(ranked.feature order by ranked.row_number)
        filter(where ranked.row_number<=v_limit),
      '[]'::jsonb
    ),
    'truncated',coalesce((v_base->>'truncated')::boolean,false)
      or coalesce(pg_catalog.max(ranked.total_count),0)>v_limit
  ) into v_result
  from ranked;

  return coalesce(v_result,v_base);
end
$$;

revoke all on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) from public,anon;
grant execute on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) to authenticated;

comment on function public.owner_approved_routes_map_viewport(
  double precision,double precision,double precision,double precision,
  integer,text,text,text[],text[],text[],text,uuid,integer
) is 'V18 owner-only bounded exact-road viewport. Per-pad display receipts may clip non-approved local-road evidence at the selected pad projection; they never change route, graph, approval, or Google authority.';

do $assert$
declare
  v_definition text;
  v_security_definer boolean;
  v_config text[];
  v_receipt_count integer;
  v_receipt record;
begin
  select pg_catalog.regexp_replace(
      pg_catalog.lower(pg_catalog.pg_get_functiondef(proc.oid)),'\s+','','g'
    ),proc.prosecdef,proc.proconfig
  into v_definition,v_security_definer,v_config
  from pg_catalog.pg_proc proc
  where proc.oid='public.owner_approved_routes_map_viewport(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)'::pg_catalog.regprocedure;

  if not v_security_definer
     or not ('search_path=""'=any(v_config))
     or not ('statement_timeout=8s'=any(v_config))
     or pg_catalog.strpos(v_definition,'brinesearch_owner_pad_road_display_receipts_issue108')=0
     or pg_catalog.strpos(v_definition,'''display_boundary'',receipt.boundary_kind')=0
     or pg_catalog.strpos(v_definition,'''endpoint_offset_m'',pg_catalog.round(receipt.endpoint_offset_m,3)')=0
     or pg_catalog.strpos(v_definition,'receipt.receipt_status=any(p_statuses)')=0 then
    raise exception 'Issue #108 public viewport wrapper assertion failed';
  end if;

  if pg_catalog.to_regprocedure(
    'private_verification.brinesearch_owner_approved_routes_map_viewport_base_issue108(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)'
  ) is null then
    raise exception 'Issue #108 private viewport base is missing';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'private_verification.brinesearch_owner_approved_routes_map_viewport_base_issue108(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'private_verification.brinesearch_owner_approved_routes_map_viewport_base_issue108(double precision,double precision,double precision,double precision,integer,text,text,text[],text[],text[],text,uuid,integer)',
    'execute'
  ) then
    raise exception 'Issue #108 private viewport base is directly executable';
  end if;

  if exists(
    select 1 from information_schema.routine_privileges privilege
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
    raise exception 'Issue #108 public viewport execute grant assertion failed';
  end if;

  if pg_catalog.has_table_privilege(
    'authenticated','private_verification.brinesearch_owner_pad_road_display_receipts_issue108','select'
  ) or pg_catalog.has_table_privilege(
    'anon','private_verification.brinesearch_owner_pad_road_display_receipts_issue108','select'
  ) then
    raise exception 'Issue #108 private display receipts are directly readable';
  end if;

  select pg_catalog.count(*)::integer into v_receipt_count
  from private_verification.brinesearch_owner_pad_road_display_receipts_issue108;
  if v_receipt_count<>1 then
    raise exception 'Issue #108 expected one reviewed endpoint receipt, found %',v_receipt_count;
  end if;

  select receipt.receipt_status,receipt.boundary_kind,receipt.endpoint_offset_m,
    extensions.st_length(receipt.display_geometry::extensions.geography)/1609.344 display_miles,
    receipt.evidence
  into v_receipt
  from private_verification.brinesearch_owner_pad_road_display_receipts_issue108 receipt;

  if v_receipt.receipt_status<>'candidate'
     or v_receipt.boundary_kind<>'pad_endpoint_projection'
     or v_receipt.endpoint_offset_m>25
     or v_receipt.display_miles not between 1.4 and 1.7
     or v_receipt.evidence->>'authority_effect'<>'display_only'
     or (v_receipt.evidence->>'approval_upgrade')::boolean
     or (v_receipt.evidence->>'route_authority_changed')::boolean
     or (v_receipt.evidence->>'graph_authority_changed')::boolean
     or (v_receipt.evidence->>'google_authority_changed')::boolean then
    raise exception 'Issue #108 reviewed endpoint receipt assertion failed';
  end if;
end
$assert$;
