-- BrineSearch V17.3.29: canonical intersection-bounded route steps.
-- Applied to production as migration version 20260810165718.
--
-- A route row now represents one traveled occurrence of one Road Manager road.
-- Existing rows remain explicitly legacy/unresolved; they are never backfilled
-- with a whole master centerline. New structured routes publish atomically via
-- brinesearch_publish_structured_route after exact geometry validation.

alter table public.brinesearch_pad_roads
  add column if not exists route_step_id uuid not null default gen_random_uuid(),
  add column if not exists step_geometry extensions.geometry(LineString,4326),
  add column if not exists start_point extensions.geometry(Point,4326)
    generated always as (
      case when step_geometry is null then null else extensions.st_startpoint(step_geometry) end
    ) stored,
  add column if not exists end_point extensions.geometry(Point,4326)
    generated always as (
      case when step_geometry is null then null else extensions.st_endpoint(step_geometry) end
    ) stored,
  add column if not exists step_aliases text[] not null default '{}'::text[],
  add column if not exists geometry_source text,
  add column if not exists geometry_source_record_id text,
  add column if not exists geometry_status text not null default 'needs_step_geometry',
  add column if not exists geometry_version integer not null default 0,
  add column if not exists inbound_turn text,
  add column if not exists route_revision bigint not null default 0,
  add column if not exists published_review_id uuid references public.brinesearch_route_reviews(id) on delete set null;

alter table public.brinesearch_pad_roads
  drop constraint if exists brinesearch_pad_roads_pad_id_route_group_step_order_key;

-- The live data used variant 1 while the editor read/wrote variant 0. Standardize
-- the single canonical primary route to variant 0 before fixing the unique key.
update public.brinesearch_pad_roads
set route_variant_index = 0
where route_variant_index = 1;

alter table public.brinesearch_pad_roads
  alter column route_variant_index set default 0;

create unique index if not exists brinesearch_pad_roads_route_step_order_uq
  on public.brinesearch_pad_roads(pad_id,route_group,route_variant_index,step_order);
create unique index if not exists brinesearch_pad_roads_route_step_id_uq
  on public.brinesearch_pad_roads(route_step_id);

alter table public.brinesearch_pad_roads
  drop constraint if exists brinesearch_pad_roads_geometry_status_check;
alter table public.brinesearch_pad_roads
  add constraint brinesearch_pad_roads_geometry_status_check
  check (geometry_status in ('needs_step_geometry','intersection_bounded','snapped_intersections','field_confirmed'));

alter table public.brinesearch_pad_roads
  drop constraint if exists brinesearch_pad_roads_structured_geometry_guard;
alter table public.brinesearch_pad_roads
  add constraint brinesearch_pad_roads_structured_geometry_guard
  check (
    geometry_version = 0
    or (
      geometry_version = 1
      and geometry_status in ('intersection_bounded','snapped_intersections','field_confirmed')
      and step_geometry is not null
      and not extensions.st_isempty(step_geometry)
      and extensions.st_npoints(step_geometry) >= 2
      and extensions.st_issimple(step_geometry)
      and distance_miles is not null
      and distance_miles > 0
    )
  );

-- Existing editors retain the legacy route-row workflow, but only an Owner may
-- mutate version-1 canonical rows. This keeps the validated RPC as the normal
-- publication boundary instead of allowing direct REST writes to bypass its
-- cross-step topology checks.
drop policy if exists pad_roads_editor_insert on public.brinesearch_pad_roads;
create policy pad_roads_editor_insert on public.brinesearch_pad_roads
  for insert to authenticated
  with check (
    (public.is_brinesearch_editor(auth.uid()) or public.is_brinesearch_owner(auth.uid()))
    and (geometry_version=0 or public.is_brinesearch_owner(auth.uid()))
  );

drop policy if exists pad_roads_editor_update on public.brinesearch_pad_roads;
create policy pad_roads_editor_update on public.brinesearch_pad_roads
  for update to authenticated
  using (
    (public.is_brinesearch_editor(auth.uid()) or public.is_brinesearch_owner(auth.uid()))
    and (geometry_version=0 or public.is_brinesearch_owner(auth.uid()))
  )
  with check (
    (public.is_brinesearch_editor(auth.uid()) or public.is_brinesearch_owner(auth.uid()))
    and (geometry_version=0 or public.is_brinesearch_owner(auth.uid()))
  );

drop policy if exists pad_roads_editor_delete on public.brinesearch_pad_roads;
create policy pad_roads_editor_delete on public.brinesearch_pad_roads
  for delete to authenticated
  using (
    (public.is_brinesearch_editor(auth.uid()) or public.is_brinesearch_owner(auth.uid()))
    and (geometry_version=0 or public.is_brinesearch_owner(auth.uid()))
  );

alter table public.brinesearch_route_review_segments
  add column if not exists route_step_id uuid not null default gen_random_uuid(),
  add column if not exists step_geometry extensions.geometry(LineString,4326),
  add column if not exists start_point extensions.geometry(Point,4326)
    generated always as (
      case when step_geometry is null then null else extensions.st_startpoint(step_geometry) end
    ) stored,
  add column if not exists end_point extensions.geometry(Point,4326)
    generated always as (
      case when step_geometry is null then null else extensions.st_endpoint(step_geometry) end
    ) stored,
  add column if not exists step_aliases text[] not null default '{}'::text[],
  add column if not exists geometry_source text,
  add column if not exists geometry_source_record_id text,
  add column if not exists geometry_status text not null default 'needs_step_geometry',
  add column if not exists geometry_version integer not null default 0;

create unique index if not exists brinesearch_route_review_segments_order_uq
  on public.brinesearch_route_review_segments(review_id,outbound_order);
create unique index if not exists brinesearch_route_review_segments_step_id_uq
  on public.brinesearch_route_review_segments(review_id,route_step_id);

alter table public.brinesearch_route_review_segments
  drop constraint if exists brinesearch_route_review_segments_geometry_status_check;
alter table public.brinesearch_route_review_segments
  add constraint brinesearch_route_review_segments_geometry_status_check
  check (geometry_status in ('needs_step_geometry','intersection_bounded','snapped_intersections','field_confirmed'));

alter table public.brinesearch_route_review_segments
  drop constraint if exists brinesearch_route_review_segments_structured_geometry_guard;
alter table public.brinesearch_route_review_segments
  add constraint brinesearch_route_review_segments_structured_geometry_guard
  check (
    geometry_version = 0
    or (
      geometry_version = 1
      and geometry_status in ('intersection_bounded','snapped_intersections','field_confirmed')
      and step_geometry is not null
      and not extensions.st_isempty(step_geometry)
      and extensions.st_npoints(step_geometry) >= 2
      and extensions.st_issimple(step_geometry)
      and miles is not null
      and miles > 0
    )
  );

-- Public driver cards consume this sanitized snapshot directly. It deliberately
-- excludes review IDs, reviewers, evidence, source URLs and internal review
-- state. Geometry remains present because exact occurrence highlighting and the
-- public card integrity check both use the same persisted clipped LineString.
alter table public.pads
  add column if not exists structured_route_steps jsonb not null default '[]'::jsonb;
alter table public.pads
  drop constraint if exists pads_structured_route_steps_array_check;
alter table public.pads
  add constraint pads_structured_route_steps_array_check
  check (jsonb_typeof(structured_route_steps) = 'array');

alter table public.public_pad_detail
  add column if not exists structured_route_steps jsonb not null default '[]'::jsonb;
alter table public.public_pad_detail
  drop constraint if exists public_pad_detail_structured_route_steps_array_check;
alter table public.public_pad_detail
  add constraint public_pad_detail_structured_route_steps_array_check
  check (jsonb_typeof(structured_route_steps) = 'array');

-- public_pad_detail is a row-synchronized table populated from this private,
-- allow-listed view with `insert ... select *`. Keep the existing 48-column
-- order intact and append the new safe snapshot as column 49 in both relations.
create or replace view private_verification.public_pad_projection_source
with (security_invoker=true, security_barrier=true)
as
select
  p.id,
  p.legacy_id,
  p.record_number,
  p.company,
  p.state,
  p.pad_name,
  p.record_type,
  p.address,
  p.latitude,
  p.longitude,
  p.county,
  p.township,
  p.well_name,
  p.api,
  p.property_number,
  p.structured_road_sequence,
  p.written_directions,
  p.road_sequence_status,
  p.road_sequence_reviewed_date,
  p.road_sequence_final_cleanup_date,
  p.verification_status,
  p.operating_status,
  null::text as import_source,
  null::text as import_status,
  p.research_status,
  null::text as research_note,
  '[]'::jsonb as research_sources,
  p.research_date,
  p.list_only,
  null::text as research_method,
  null::text as research_notes,
  p.number_of_road_steps,
  '[]'::jsonb as source_workbook_rows,
  '[]'::jsonb as alternate_locations,
  null::text as last_updated_by,
  null::timestamptz as last_updated_date,
  null::text as audit_source,
  null::boolean as audit_verified,
  jsonb_strip_nulls(jsonb_build_object(
    '_public_summary',false,
    'official_pad_record',p.extra_data->'official_pad_record',
    'official_well_records',p.extra_data->'official_well_records',
    'api_verification_summary',p.extra_data->'api_verification_summary',
    'official_operator',p.extra_data->'official_operator',
    'official_status',p.extra_data->'official_status',
    'turn_by_turn_route',p.extra_data->'turn_by_turn_route',
    'field_address_confirmed',p.extra_data->'field_address_confirmed',
    'field_pad_alias',p.extra_data->'field_pad_alias',
    'field_property_number_observation',p.extra_data->'field_property_number_observation',
    'field_sign_api_as_displayed',p.extra_data->'field_sign_api_as_displayed',
    'field_sign_section',p.extra_data->'field_sign_section',
    'field_sign_township',p.extra_data->'field_sign_township',
    'field_well_sign_observation',p.extra_data->'field_well_sign_observation',
    'section',p.extra_data->'section',
    'site_operator_sign',p.extra_data->'site_operator_sign',
    'spill_contact',p.extra_data->'spill_contact'
  )) as extra_data,
  null::uuid as created_by,
  null::uuid as updated_by,
  p.created_at,
  p.updated_at,
  p.directions_clear,
  null::text as directions_clear_method,
  p.directions_clear_updated_at,
  null::uuid as directions_clear_updated_by,
  p.well_entries,
  p.structured_route_steps
from public.pads p;

create or replace function public.brinesearch_get_structured_route_steps(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_steps jsonb;
  v_revision bigint;
  v_review_id uuid;
  v_sequence text;
  v_directions text;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to load structured route geometry' using errcode='42501';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'route_step_id',pr.route_step_id,
      'step_order',pr.step_order,
      'step_index',pr.step_order-1,
      'road_id',pr.road_id,
      'road_name',r.canonical_name,
      'aliases',to_jsonb(pr.step_aliases),
      'start_coordinate',jsonb_build_array(extensions.st_x(pr.start_point),extensions.st_y(pr.start_point)),
      'end_coordinate',jsonb_build_array(extensions.st_x(pr.end_point),extensions.st_y(pr.end_point)),
      'clipped_geometry',(extensions.st_asgeojson(pr.step_geometry,9)::jsonb),
      'miles',pr.distance_miles,
      'turn_direction',pr.turn_direction,
      'inbound_turn',pr.inbound_turn,
      'instruction',pr.instruction,
      'note',pr.step_note,
      'geometry_source',pr.geometry_source,
      'geometry_source_record_id',pr.geometry_source_record_id,
      'geometry_status',pr.geometry_status,
      'geometry_version',pr.geometry_version
    ) order by pr.step_order) filter (where pr.id is not null),'[]'::jsonb),
    coalesce(max(pr.route_revision),0),
    min(pr.published_review_id::text)::uuid
  into v_steps,v_revision,v_review_id
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id
    and pr.route_group='primary'
    and pr.route_variant_index=0
    and pr.geometry_version=1;

  select p.structured_road_sequence,p.directions_clear
  into v_sequence,v_directions
  from public.pads p where p.id=p_pad_id;

  return jsonb_build_object(
    'route_revision',v_revision,
    'review_id',v_review_id,
    'structured_sequence',v_sequence,
    'directions_clear',v_directions,
    'structured_route_steps',v_steps,
    'steps',v_steps
  );
end;
$$;

revoke all on function public.brinesearch_get_structured_route_steps(uuid) from public,anon;
grant execute on function public.brinesearch_get_structured_route_steps(uuid) to authenticated;

create or replace function public.brinesearch_publish_structured_route(
  p_pad_id uuid,
  p_review_id uuid,
  p_steps jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pad record;
  v_review_id uuid;
  v_current_revision bigint;
  v_next_revision bigint;
  v_step jsonb;
  v_index integer:=0;
  v_count integer;
  v_road record;
  v_geometry extensions.geometry;
  v_master_geometry extensions.geometry;
  v_previous_master_geometry extensions.geometry:=null;
  v_start extensions.geometry;
  v_end extensions.geometry;
  v_previous_end extensions.geometry:=null;
  v_previous_road_id uuid:=null;
  v_step_id uuid;
  v_road_id uuid;
  v_seen_step_ids uuid[]:='{}'::uuid[];
  v_pad_state_code text;
  v_road_state_code text;
  v_previous_has_node boolean;
  v_current_has_node boolean;
  v_miles numeric;
  v_turn text;
  v_inbound_turn text;
  v_instruction text;
  v_sequence text;
  v_directions text;
  v_total numeric;
  v_public_steps jsonb;
begin
  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then
    raise exception 'Owner access is required to publish structured routes' using errcode='42501';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps)=0 then
    raise exception 'Structured route must contain at least one step';
  end if;
  if jsonb_array_length(p_steps)>250 then
    raise exception 'Structured route exceeds the 250-step safety limit';
  end if;

  select p.id,p.legacy_id,p.pad_name,p.company,p.state,p.county,p.township,p.latitude,p.longitude
  into v_pad
  from public.pads p
  where p.id=p_pad_id
  for update;
  if not found then raise exception 'Pad not found'; end if;
  v_pad_state_code:=case lower(btrim(coalesce(v_pad.state,'')))
    when 'ohio' then 'OH' when 'oh' then 'OH'
    when 'pennsylvania' then 'PA' when 'pa' then 'PA'
    when 'west virginia' then 'WV' when 'wv' then 'WV'
    else upper(nullif(btrim(coalesce(v_pad.state,'')),''))
  end;

  select coalesce(max(route_revision),0)
  into v_current_revision
  from public.brinesearch_pad_roads
  where pad_id=p_pad_id and route_group='primary' and route_variant_index=0;
  if p_expected_revision is not null and p_expected_revision <> v_current_revision then
    raise exception 'Route changed after it was loaded; reload before publishing' using errcode='40001';
  end if;
  v_next_revision:=v_current_revision+1;

  if p_review_id is not null then
    select id into v_review_id
    from public.brinesearch_route_reviews
    where id=p_review_id and pad_id=p_pad_id
    for update;
    if not found then raise exception 'Route review does not belong to this pad'; end if;
  else
    select id into v_review_id
    from public.brinesearch_route_reviews
    where pad_id=p_pad_id
    for update;
    if not found then
      insert into public.brinesearch_route_reviews(
        pad_id,legacy_id,pad_name,company,state,pad_latitude,pad_longitude,
        source_quality,status,route_scope,candidate_kind,candidate_route,evidence,
        field_verification_status
      ) values (
        p_pad_id,v_pad.legacy_id,v_pad.pad_name,v_pad.company,v_pad.state,
        v_pad.latitude,v_pad.longitude,'sequence_only','owner_review','unknown',
        'none','[]'::jsonb,jsonb_build_object('method','owner_structured_route_steps_v17329'),
        'pending'
      ) returning id into v_review_id;
    end if;
  end if;

  -- Validate every client step before mutating any canonical route rows.
  v_count:=jsonb_array_length(p_steps);
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    v_index:=v_index+1;
    if jsonb_typeof(v_step)<>'object' then
      raise exception 'Structured step % must be an object',v_index;
    end if;
    begin
      if coalesce((v_step->>'step_order')::integer,0) <> v_index then
        raise exception 'Structured step order must be contiguous at step %',v_index;
      end if;
      v_step_id:=nullif(v_step->>'route_step_id','')::uuid;
      v_road_id:=nullif(v_step->>'road_id','')::uuid;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Step % has an invalid order, occurrence ID or Road Manager road ID',v_index;
    end;
    if v_step_id is null or v_road_id is null then
      raise exception 'Step % requires an occurrence ID and Road Manager road ID',v_index;
    end if;
    if v_step_id=any(v_seen_step_ids) then
      raise exception 'Step % repeats occurrence ID %',v_index,v_step_id;
    end if;
    v_seen_step_ids:=array_append(v_seen_step_ids,v_step_id);
    select r.* into v_road from public.brinesearch_roads r where r.id=v_road_id;
    if not found or coalesce(v_road.candidate_only,false) then
      raise exception 'Step % does not reference a publishable Road Manager road',v_index;
    end if;
    v_road_state_code:=case lower(btrim(coalesce(v_road.state,'')))
      when 'ohio' then 'OH' when 'oh' then 'OH'
      when 'pennsylvania' then 'PA' when 'pa' then 'PA'
      when 'west virginia' then 'WV' when 'wv' then 'WV'
      else upper(nullif(btrim(coalesce(v_road.state,'')),''))
    end;
    if v_road.road_type in ('state_route','county','township','local','access')
       and v_road_state_code is not null
       and v_road_state_code <> v_pad_state_code then
      raise exception 'Step % road is outside the pad state',v_index;
    end if;
    if v_road.road_type in ('county','township','local','access')
       and nullif(v_road.county,'') is not null and nullif(v_pad.county,'') is not null
       and lower(v_road.county) <> lower(v_pad.county) then
      raise exception 'Step % local road is outside the pad county',v_index;
    end if;
    if v_road.road_type in ('interstate','us_route')
       and cardinality(coalesce(v_road.coverage_states,'{}'::text[]))>0
       and not (v_pad_state_code=any(v_road.coverage_states)) then
      raise exception 'Step % highway does not cover the pad state',v_index;
    end if;

    begin
      v_geometry:=extensions.st_setsrid(extensions.st_geomfromgeojson((v_step->'clipped_geometry')::text),4326);
      v_start:=extensions.st_setsrid(extensions.st_makepoint(
        (v_step#>>'{start_coordinate,0}')::double precision,
        (v_step#>>'{start_coordinate,1}')::double precision
      ),4326);
      v_end:=extensions.st_setsrid(extensions.st_makepoint(
        (v_step#>>'{end_coordinate,0}')::double precision,
        (v_step#>>'{end_coordinate,1}')::double precision
      ),4326);
    exception when others then
      raise exception 'Step % has invalid GeoJSON or boundary coordinates',v_index;
    end;
    if extensions.geometrytype(v_geometry) <> 'LINESTRING'
       or extensions.st_isempty(v_geometry)
       or extensions.st_npoints(v_geometry)<2
       or not extensions.st_isvalid(v_geometry)
       or not extensions.st_issimple(v_geometry)
       or extensions.st_equals(extensions.st_startpoint(v_geometry),extensions.st_endpoint(v_geometry))
       or extensions.st_length(v_geometry)<=0
       or not extensions.st_coveredby(v_geometry,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
      raise exception 'Step % requires one valid, simple, nonzero clipped LineString',v_index;
    end if;
    if extensions.st_x(v_start) not between -180 and 180
       or extensions.st_y(v_start) not between -90 and 90
       or extensions.st_x(v_end) not between -180 and 180
       or extensions.st_y(v_end) not between -90 and 90 then
      raise exception 'Step % boundary coordinates are outside valid longitude/latitude ranges',v_index;
    end if;
    if not extensions.st_equals(v_start,extensions.st_startpoint(v_geometry))
       or not extensions.st_equals(v_end,extensions.st_endpoint(v_geometry)) then
      raise exception 'Step % geometry endpoints do not equal its stored boundaries',v_index;
    end if;
    if v_previous_end is not null
       and not extensions.st_equals(v_previous_end,v_start) then
      raise exception 'Step % is not continuous with the preceding step',v_index;
    end if;

    if v_road.centerline_geojson is null then
      raise exception 'Step % Road Manager road has no publishable centerline geometry',v_index;
    end if;
    begin
      v_master_geometry:=extensions.st_setsrid(extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326);
    exception when others then
      raise exception 'Step % Road Manager centerline GeoJSON is invalid',v_index;
    end;
    if extensions.geometrytype(v_master_geometry) not in ('LINESTRING','MULTILINESTRING')
       or extensions.st_isempty(v_master_geometry)
       or not extensions.st_isvalid(v_master_geometry)
       or not extensions.st_coveredby(v_master_geometry,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
      raise exception 'Step % Road Manager centerline is not a valid line geometry',v_index;
    end if;
    if not extensions.st_coveredby(
      v_geometry,
      extensions.st_buffer(v_master_geometry::extensions.geography,1)::extensions.geometry
    ) then
      raise exception 'Step % clipped geometry is not supported by its Road Manager centerline',v_index;
    end if;

    -- A geometric crossing is not necessarily an intersection. For different
    -- roads, the shared step boundary must coincide with a stored vertex on
    -- both Road Manager centerlines. Same-road occurrences may split at an
    -- explicitly projected point anywhere on that road.
    if v_previous_master_geometry is not null and v_previous_road_id<>v_road.id then
      select exists(
        select 1
        from extensions.st_dumppoints(v_previous_master_geometry) dp
        where extensions.st_dwithin(dp.geom::extensions.geography,v_start::extensions.geography,1)
      ) into v_previous_has_node;
      select exists(
        select 1
        from extensions.st_dumppoints(v_master_geometry) dp
        where extensions.st_dwithin(dp.geom::extensions.geography,v_start::extensions.geography,1)
      ) into v_current_has_node;
      if not coalesce(v_previous_has_node,false) or not coalesce(v_current_has_node,false) then
        raise exception 'Step % boundary is not a shared Road Manager intersection node',v_index;
      end if;
    end if;
    v_turn:=nullif(v_step->>'turn_direction','');
    v_inbound_turn:=nullif(v_step->>'inbound_turn','');
    if v_index>1 and v_turn is null then raise exception 'Step % requires a turn instruction',v_index; end if;
    if v_turn is not null and v_turn not in ('left','right','straight','slight_left','slight_right','merge_left','merge_right','arrive') then
      raise exception 'Step % has an invalid turn instruction',v_index;
    end if;
    if v_inbound_turn is not null and v_inbound_turn not in ('left','right','straight','slight_left','slight_right','merge_left','merge_right','arrive') then
      raise exception 'Step % has an invalid reverse-route turn instruction',v_index;
    end if;
    v_previous_end:=v_end;
    v_previous_master_geometry:=v_master_geometry;
    v_previous_road_id:=v_road.id;
  end loop;

  delete from public.brinesearch_pad_roads
  where pad_id=p_pad_id and route_group='primary' and route_variant_index=0;

  v_index:=0;
  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    v_index:=v_index+1;
    select r.* into v_road from public.brinesearch_roads r where r.id=(v_step->>'road_id')::uuid;
    v_geometry:=extensions.st_setsrid(extensions.st_geomfromgeojson((v_step->'clipped_geometry')::text),4326);
    v_miles:=round((extensions.st_length(v_geometry::extensions.geography)/1609.344)::numeric,6);
    v_turn:=nullif(v_step->>'turn_direction','');
    v_instruction:=case
      when v_index=1 and v_turn is null then 'Take '
      when v_turn='left' then 'Turn left on '
      when v_turn='right' then 'Turn right on '
      when v_turn='slight_left' then 'Slight left on '
      when v_turn='slight_right' then 'Slight right on '
      when v_turn='merge_left' then 'Merge left onto '
      when v_turn='merge_right' then 'Merge right onto '
      when v_turn='arrive' then 'Arrive via '
      else 'Continue on '
    end || v_road.canonical_name;

    insert into public.brinesearch_pad_roads(
      pad_id,road_id,route_group,step_order,instruction,distance_miles,step_note,
      route_variant_index,turn_direction,distance_source,distance_status,
      source_details,match_confidence,route_step_id,step_geometry,step_aliases,
      geometry_source,geometry_source_record_id,geometry_status,geometry_version,
      inbound_turn,route_revision,published_review_id,created_by,updated_by
    ) values (
      p_pad_id,v_road.id,'primary',v_index,v_instruction,v_miles,nullif(v_step->>'note',''),
      0,v_turn,'clipped_step_geometry','map_measured',
      jsonb_build_object('method','owner_structured_route_steps_v17329','published_at',now()),
      1,(v_step->>'route_step_id')::uuid,v_geometry,coalesce(v_road.aliases,'{}'::text[]),
      coalesce(nullif(v_step->>'geometry_source',''),'road_manager_intersections_v17329'),
      v_road.source_record_id,
      case when v_step->>'geometry_status'='snapped_intersections' then 'snapped_intersections' else 'intersection_bounded' end,
      1,nullif(v_step->>'inbound_turn',''),v_next_revision,v_review_id,auth.uid(),auth.uid()
    );
  end loop;

  delete from public.brinesearch_route_review_segments where review_id=v_review_id;
  insert into public.brinesearch_route_review_segments(
    review_id,outbound_order,inbound_order,road_id,road_name,official_road_name,
    route_type,route_number,miles,outbound_turn,inbound_turn,source_level,
    source_agency,source_url,source_record_id,is_state_route,confidence,evidence,
    route_step_id,step_geometry,step_aliases,geometry_source,
    geometry_source_record_id,geometry_status,geometry_version
  )
  select
    v_review_id,pr.step_order,v_count-pr.step_order+1,pr.road_id,r.canonical_name,r.canonical_name,
    case r.road_type
      when 'interstate' then 'I'
      when 'us_route' then 'US'
      when 'state_route' then case lower(btrim(coalesce(r.state,v_pad.state,'')))
        when 'ohio' then 'OH' when 'oh' then 'OH'
        when 'pennsylvania' then 'PA' when 'pa' then 'PA'
        when 'west virginia' then 'WV' when 'wv' then 'WV'
        else upper(nullif(btrim(coalesce(r.state,v_pad.state,'')),''))
      end
      when 'county' then 'CR'
      when 'township' then 'TR'
      else upper(r.road_type)
    end,
    r.route_number,pr.distance_miles,pr.turn_direction,pr.inbound_turn,'owner_verified',
    r.source_agency,r.source_url,r.source_record_id,r.road_type='state_route','owner_confirmed',
    jsonb_build_object('method','owner_structured_route_steps_v17329','route_revision',v_next_revision),
    pr.route_step_id,pr.step_geometry,pr.step_aliases,pr.geometry_source,
    pr.geometry_source_record_id,pr.geometry_status,1
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0
  order by pr.step_order;

  -- One sanitized ordered model drives public cards. It is generated only
  -- from the canonical rows just inserted, never by parsing written text.
  select coalesce(jsonb_agg(jsonb_build_object(
    'route_step_id',pr.route_step_id,
    'step_order',pr.step_order,
    'step_index',pr.step_order-1,
    'road_id',pr.road_id,
    'road_name',r.canonical_name,
    'aliases',to_jsonb(pr.step_aliases),
    'start_coordinate',jsonb_build_array(extensions.st_x(pr.start_point),extensions.st_y(pr.start_point)),
    'end_coordinate',jsonb_build_array(extensions.st_x(pr.end_point),extensions.st_y(pr.end_point)),
    'clipped_geometry',extensions.st_asgeojson(pr.step_geometry,9)::jsonb,
    'miles',pr.distance_miles,
    'turn_direction',pr.turn_direction,
    'inbound_turn',pr.inbound_turn,
    'instruction',pr.instruction,
    'note',pr.step_note,
    'geometry_status',pr.geometry_status,
    'geometry_version',pr.geometry_version,
    'route_revision',pr.route_revision
  ) order by pr.step_order),'[]'::jsonb)
  into v_public_steps
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id
    and pr.route_group='primary'
    and pr.route_variant_index=0
    and pr.geometry_version=1;

  select
    string_agg(r.canonical_name,' → ' order by pr.step_order),
    string_agg(
      pr.step_order::text||'. '||pr.instruction||' — '||trim(trailing '.' from trim(trailing '0' from to_char(pr.distance_miles,'FM999990.00')))||' mi',
      E'\n' order by pr.step_order
    ),
    sum(pr.distance_miles)
  into v_sequence,v_directions,v_total
  from public.brinesearch_pad_roads pr
  join public.brinesearch_roads r on r.id=pr.road_id
  where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0;

  -- Retain the legacy section markers for downstream direction intelligence,
  -- while the public cards themselves read structured_route_steps directly.
  v_directions:='Road sequence reference:'||E'\n'||v_sequence||E'\n\nStep-by-step directions:\n'||v_directions;

  update public.brinesearch_route_reviews rr
  set structured_sequence_snapshot=v_sequence,
      source_directions_snapshot=v_directions,
      source_quality='clear',
      candidate_kind='none',
      state_route_name=null,
      state_route_distance_feet=null,
      no_guess_reason=null,
      candidate_route=v_public_steps,
      evidence=coalesce(rr.evidence,'{}'::jsonb)||jsonb_build_object('method','owner_structured_route_steps_v17329','route_revision',v_next_revision,'published_at',now()),
      measured_total_miles=v_total,status='approved',route_scope=case when exists(
        select 1 from public.brinesearch_pad_roads pr join public.brinesearch_roads r on r.id=pr.road_id
        where pr.pad_id=p_pad_id and pr.route_group='primary' and pr.route_variant_index=0
          and r.road_type in ('county','township','local','access')
      ) then 'local_roads' else 'state_route_only' end,
      field_verification_status='confirmed',reviewed_by=auth.uid(),reviewed_at=now(),approved_at=now(),updated_at=now()
  where rr.id=v_review_id;

  update public.pads
  set structured_road_sequence=v_sequence,
      structured_route_steps=v_public_steps,
      directions_clear=v_directions,
      directions_clear_method='owner_structured_route_steps_v17329',
      directions_clear_updated_at=now(),
      directions_clear_updated_by=auth.uid(),
      road_sequence_status='owner_verified',
      road_sequence_reviewed_date=current_date,
      number_of_road_steps=v_count,
      last_updated_by='BrineSearch Owner',
      last_updated_date=now(),
      updated_by=auth.uid(),
      updated_at=now()
  where id=p_pad_id;

  return public.brinesearch_get_structured_route_steps(p_pad_id);
end;
$$;

revoke all on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint) from public,anon;
grant execute on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint) to authenticated;

comment on function public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint) is
  'Owner-only atomic V17.3.29 structured route publish. Validates exact clipped geometry and continuity, computes mileage, persists review/canonical steps, then generates driver directions from those rows.';
