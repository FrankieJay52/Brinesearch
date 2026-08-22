-- GitHub #97 — preserve complete ODOT source coverage without weakening route topology.
--
-- Production ingestion of Athens County proved that ODOT Road Inventory contains
-- valid LineStrings that are not ST_IsSimple (for example looped apartment/private
-- PATH records). Required-source ingestion must retain those authoritative rows;
-- silently rejecting them makes the source receipt incomplete. The canonical
-- authoritative road-segment view remains strict and continues to expose only
-- valid, simple line geometry to junction/topology construction, so this change
-- preserves source truth without making a loop route-selectable.

create or replace function public.brinesearch_issue97_ingest_oh_page(
  p_county_code text,
  p_offset integer default 0,
  p_page_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_offset integer:=greatest(0,coalesce(p_offset,0));
  v_limit integer:=greatest(1,least(coalesce(p_page_size,1000),2000));
  v_url text;
  v_response extensions.http_response;
  v_body jsonb;
  v_feature jsonb;
  v_props jsonb;
  v_geom extensions.geometry;
  v_geometry_present boolean;
  v_rows integer:=0;
  v_source_rows integer:=0;
  v_has_more boolean:=false;
  v_inventory_id text;
  v_official_name text;
begin
  if not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code='OH' and c.source_county_code=v_county and c.active
  ) then
    raise exception 'County is outside the issue #97 Ohio footprint';
  end if;

  v_url:='https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0/query'
    ||'?where=COUNTY_CD%3D%27'||v_county||'%27'
    ||'&outFields=*&returnGeometry=true&returnM=false&returnZ=false&outSR=4326'
    ||'&orderByFields=OBJECTID'
    ||'&resultOffset='||v_offset||'&resultRecordCount='||v_limit||'&f=geojson';
  v_response:=extensions.http_get(v_url);
  if v_response.status<>200 then
    raise exception 'ODOT request failed with HTTP %',v_response.status;
  end if;
  v_body:=v_response.content::jsonb;
  if v_body ? 'error' then raise exception 'ODOT response contained an ArcGIS error'; end if;
  v_source_rows:=pg_catalog.jsonb_array_length(coalesce(v_body->'features','[]'::jsonb));
  v_has_more:=coalesce(
    nullif(v_body->>'exceededTransferLimit','')::boolean,
    nullif(v_body->'properties'->>'exceededTransferLimit','')::boolean,
    v_source_rows=v_limit
  );

  for v_feature in select value from pg_catalog.jsonb_array_elements(coalesce(v_body->'features','[]'::jsonb))
  loop
    v_props:=v_feature->'properties';
    v_geom:=null;
    v_geometry_present:=v_feature->'geometry' is not null
      and pg_catalog.jsonb_typeof(v_feature->'geometry')<>'null';
    if v_geometry_present then
      begin
        v_geom:=extensions.st_force2d(extensions.st_setsrid(
          extensions.st_geomfromgeojson((v_feature->'geometry')::text),4326
        ));
      exception when others then
        continue;
      end;
      -- Preserve every valid authoritative line row. ST_IsSimple is deliberately
      -- NOT an ingestion requirement: downstream authoritative_road_segments and
      -- Ohio component topology remain simple-only and therefore fail closed.
      if v_geom is null or extensions.st_isempty(v_geom)
         or not extensions.st_isvalid(v_geom)
         or extensions.st_dimension(v_geom)<>1
         or not extensions.st_coveredby(v_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
        continue;
      end if;
    end if;

    v_inventory_id:=coalesce(nullif(v_props->>'ROADWAY_INVENTORY_ID',''),v_props->>'OBJECTID');
    if v_inventory_id is null then continue; end if;
    v_official_name:=nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ',
      nullif(v_props->>'STREET_PREFIX_DIR_CD',''),nullif(v_props->>'STREET_NAME',''),
      nullif(v_props->>'STREET_SUFFIX_CD',''),nullif(v_props->>'STREET_DIR_SUFFIX_CD','')
    )), '');

    insert into public.brinesearch_odot_road_catalog(
      roadway_inventory_id,objectid,nlf_id,county_code,jurisdiction_code,
      route_type,route_number,route_suffix,route_extension_code,cardinality_code,
      direction_of_travel_code,street_prefix_direction,street_name,street_suffix,
      street_direction_suffix,segment_description,segment_length_miles,ctl_begin,
      ctl_end,truck_route_indicator,roadway_class,surface_type_left,surface_type_right,
      official_name,street_match_key,route_number_normalized,attributes,geom,
      geometry_loaded_at,fetched_at,source_url
    ) values (
      v_inventory_id,(v_props->>'OBJECTID')::bigint,v_props->>'NLF_ID',v_county,
      v_props->>'JURISDICTION_CD',v_props->>'ROUTE_TYPE',v_props->>'ROUTE_NBR',
      v_props->>'ROUTE_SUFFIX',v_props->>'ROUTE_EXTENSION_CD',v_props->>'CARDINALITY_CD',
      v_props->>'DIRECTION_OF_TRAVEL_CD',v_props->>'STREET_PREFIX_DIR_CD',
      v_props->>'STREET_NAME',v_props->>'STREET_SUFFIX_CD',v_props->>'STREET_DIR_SUFFIX_CD',
      v_props->>'SEGMENT_DESCRIPTION_TXT',nullif(v_props->>'SEGMENT_LENGTH_NBR','')::numeric,
      nullif(v_props->>'CTL_BEGIN_NBR','')::numeric,nullif(v_props->>'CTL_END_NBR','')::numeric,
      v_props->>'TRUCK_ROUTE_IND',nullif(v_props->>'ROADWAY_CLASS','')::integer,
      v_props->>'SURFACE_TYPE_LEFT_CD',v_props->>'SURFACE_TYPE_RIGHT_CD',
      coalesce(v_official_name,nullif(pg_catalog.btrim(v_props->>'STREET_NAME'),'')),
      pg_catalog.regexp_replace(pg_catalog.lower(coalesce(v_official_name,v_props->>'STREET_NAME','')),'[^a-z0-9]+','-','g'),
      nullif(pg_catalog.ltrim(coalesce(v_props->>'ROUTE_NBR',''),'0'),''),v_props,v_geom,
      case when v_geom is null then null else now() end,now(),
      'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0'
    )
    on conflict(roadway_inventory_id) do update set
      objectid=excluded.objectid,nlf_id=excluded.nlf_id,county_code=excluded.county_code,
      jurisdiction_code=excluded.jurisdiction_code,route_type=excluded.route_type,
      route_number=excluded.route_number,route_suffix=excluded.route_suffix,
      route_extension_code=excluded.route_extension_code,cardinality_code=excluded.cardinality_code,
      direction_of_travel_code=excluded.direction_of_travel_code,
      street_prefix_direction=excluded.street_prefix_direction,street_name=excluded.street_name,
      street_suffix=excluded.street_suffix,street_direction_suffix=excluded.street_direction_suffix,
      segment_description=excluded.segment_description,segment_length_miles=excluded.segment_length_miles,
      ctl_begin=excluded.ctl_begin,ctl_end=excluded.ctl_end,
      truck_route_indicator=excluded.truck_route_indicator,roadway_class=excluded.roadway_class,
      surface_type_left=excluded.surface_type_left,surface_type_right=excluded.surface_type_right,
      official_name=excluded.official_name,street_match_key=excluded.street_match_key,
      route_number_normalized=excluded.route_number_normalized,attributes=excluded.attributes,
      geom=excluded.geom,geometry_loaded_at=excluded.geometry_loaded_at,
      fetched_at=now(),source_url=excluded.source_url,
      source_active=true;
    v_rows:=v_rows+1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'source','oh_odot_tims_road_inventory','county_code',v_county,
    'offset',v_offset,'page_size',v_limit,'source_rows',v_source_rows,
    'rows',v_rows,'rejected_rows',v_source_rows-v_rows,'has_more',v_has_more,
    'page_digest',pg_catalog.md5(coalesce((v_body->'features')::text,'[]'))
  );
end
$$;

revoke all on function public.brinesearch_issue97_ingest_oh_page(text,integer,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_ingest_oh_page(text,integer,integer)
to service_role;

comment on function public.brinesearch_issue97_ingest_oh_page(text,integer,integer) is
  'Issue #97 ODOT loader. Preserves all valid authoritative line rows, including valid non-simple source geometry; topology exposure remains valid+simple only and therefore fails closed.';
