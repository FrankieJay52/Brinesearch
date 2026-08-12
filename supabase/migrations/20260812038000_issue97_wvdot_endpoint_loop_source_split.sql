-- GitHub #97 — preserve WVDOT single-path stem+loop source geometry without weakening topology safety.
--
-- Wetzel County production source ingestion exposed two WVDOT Publication LRS rows
-- whose one ArcGIS path is a legitimate "lollipop" shape: a stem reaches a source
-- vertex, continues around a loop, and the final source point returns exactly to
-- that earlier vertex. OGC ST_IsSimple is false for the combined path because the
-- endpoint repeats an interior vertex, even though the two source-preserving pieces
-- are individually simple and meet only at that exact source vertex.
--
-- Do not admit arbitrary non-simple WVDOT lines. This migration accepts only that
-- narrowly proven endpoint-to-interior source-vertex pattern, splits the path into
-- ordered simple components, preserves source measures and provenance, and rejects
-- interior crossings, overlaps, multiple repeated endpoint vertices, malformed M
-- endpoints, or any split whose pieces meet anywhere besides the exact source vertex.

create or replace function private_verification.brinesearch_issue97_wv_endpoint_loop_safe(
  p_geom extensions.geometry
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $issue97_wv_endpoint_loop_safe$
declare
  v_n integer;
  v_start_hits integer[];
  v_end_hits integer[];
  v_split integer;
  v_part1 extensions.geometry;
  v_part2 extensions.geometry;
  v_split_point extensions.geometry;
  v_intersection extensions.geometry;
begin
  if p_geom is null
     or extensions.st_isempty(p_geom)
     or extensions.st_geometrytype(p_geom)<>'ST_LineString'
     or not extensions.st_isvalid(p_geom)
     or extensions.st_issimple(p_geom)
     or extensions.st_dimension(p_geom)<>1
     or not extensions.st_coveredby(
       p_geom,extensions.st_makeenvelope(-180,-90,180,90,4326)
     ) then
    return false;
  end if;

  v_n:=extensions.st_npoints(p_geom);
  if v_n<4 then return false; end if;

  select
    pg_catalog.array_agg(g.i order by g.i) filter(where
      extensions.st_equals(extensions.st_pointn(p_geom,g.i),extensions.st_startpoint(p_geom))
    ),
    pg_catalog.array_agg(g.i order by g.i) filter(where
      extensions.st_equals(extensions.st_pointn(p_geom,g.i),extensions.st_endpoint(p_geom))
    )
  into v_start_hits,v_end_hits
  from pg_catalog.generate_series(2,v_n-1) as g(i);

  if coalesce(pg_catalog.cardinality(v_start_hits),0)
       +coalesce(pg_catalog.cardinality(v_end_hits),0)<>1 then
    return false;
  end if;

  v_split:=case
    when coalesce(pg_catalog.cardinality(v_start_hits),0)=1 then v_start_hits[1]
    else v_end_hits[1]
  end;
  v_split_point:=extensions.st_pointn(p_geom,v_split);

  select extensions.st_makeline(d.geom order by d.path[1])
  into v_part1
  from extensions.st_dumppoints(p_geom) as d
  where d.path[1]<=v_split;

  select extensions.st_makeline(d.geom order by d.path[1])
  into v_part2
  from extensions.st_dumppoints(p_geom) as d
  where d.path[1]>=v_split;

  if v_part1 is null or v_part2 is null
     or extensions.st_npoints(v_part1)<2 or extensions.st_npoints(v_part2)<2
     or extensions.st_isempty(v_part1) or extensions.st_isempty(v_part2)
     or extensions.st_dimension(v_part1)<>1 or extensions.st_dimension(v_part2)<>1
     or not extensions.st_isvalid(v_part1) or not extensions.st_isvalid(v_part2)
     or not extensions.st_issimple(v_part1) or not extensions.st_issimple(v_part2)
     or not extensions.st_coveredby(v_part1,extensions.st_makeenvelope(-180,-90,180,90,4326))
     or not extensions.st_coveredby(v_part2,extensions.st_makeenvelope(-180,-90,180,90,4326)) then
    return false;
  end if;

  v_intersection:=extensions.st_intersection(v_part1,v_part2);
  return extensions.st_geometrytype(v_intersection)='ST_Point'
    and extensions.st_equals(v_intersection,v_split_point);
exception when others then
  return false;
end
$issue97_wv_endpoint_loop_safe$;

revoke all on function private_verification.brinesearch_issue97_wv_endpoint_loop_safe(extensions.geometry)
from public,anon,authenticated;

create or replace function private_verification.brinesearch_issue97_wv_path_components(
  p_path jsonb
)
returns table(
  component_number integer,
  component_count integer,
  start_point_number integer,
  end_point_number integer,
  path_geom extensions.geometry,
  path_from numeric,
  path_to numeric,
  path_z integer,
  split_method text,
  path_digest text
)
language plpgsql
stable
security definer
set search_path=''
as $issue97_wv_path_components$
declare
  v_n integer;
  v_seen integer;
  v_full extensions.geometry;
  v_full_from numeric;
  v_full_to numeric;
  v_full_z integer;
  v_start_hits integer[];
  v_end_hits integer[];
  v_split integer;
  v_part1 extensions.geometry;
  v_part2 extensions.geometry;
  v_part1_from numeric;
  v_part1_to numeric;
  v_part2_from numeric;
  v_part2_to numeric;
  v_part1_z integer;
  v_part2_z integer;
begin
  if pg_catalog.jsonb_typeof(p_path) is distinct from 'array' then return; end if;
  v_n:=pg_catalog.jsonb_array_length(p_path);
  if v_n<2 then return; end if;

  begin
    select count(*)::integer,
      extensions.st_force2d(extensions.st_makeline(
        extensions.st_setsrid(extensions.st_makepoint(
          (point.coordinate->>0)::double precision,(point.coordinate->>1)::double precision
        ),4326) order by point.point_number
      )),
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number))[1],
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number desc))[1],
      case when max(pg_catalog.abs(coalesce(nullif(point.coordinate->>2,'')::numeric,0)))>0.01
        then pg_catalog.round(avg(coalesce(nullif(point.coordinate->>2,'')::numeric,0)))::integer end
    into v_seen,v_full,v_full_from,v_full_to,v_full_z
    from pg_catalog.jsonb_array_elements(p_path) with ordinality point(coordinate,point_number)
    where pg_catalog.jsonb_typeof(point.coordinate)='array'
      and pg_catalog.jsonb_array_length(point.coordinate)>=2;
  exception when others then
    return;
  end;

  if v_seen<>v_n or v_full is null
     or extensions.st_isempty(v_full)
     or extensions.st_dimension(v_full)<>1
     or not extensions.st_isvalid(v_full)
     or not extensions.st_coveredby(v_full,extensions.st_makeenvelope(-180,-90,180,90,4326))
     or ((v_full_from is null)<>(v_full_to is null)) then
    return;
  end if;

  if extensions.st_issimple(v_full) then
    component_number:=1;
    component_count:=1;
    start_point_number:=1;
    end_point_number:=v_n;
    path_geom:=v_full;
    path_from:=v_full_from;
    path_to:=v_full_to;
    path_z:=v_full_z;
    split_method:='source_path';
    path_digest:=pg_catalog.md5(p_path::text);
    return next;
    return;
  end if;

  if not private_verification.brinesearch_issue97_wv_endpoint_loop_safe(v_full) then
    return;
  end if;

  select
    pg_catalog.array_agg(g.i order by g.i) filter(where
      extensions.st_equals(extensions.st_pointn(v_full,g.i),extensions.st_startpoint(v_full))
    ),
    pg_catalog.array_agg(g.i order by g.i) filter(where
      extensions.st_equals(extensions.st_pointn(v_full,g.i),extensions.st_endpoint(v_full))
    )
  into v_start_hits,v_end_hits
  from pg_catalog.generate_series(2,v_n-1) as g(i);

  v_split:=case
    when coalesce(pg_catalog.cardinality(v_start_hits),0)=1 then v_start_hits[1]
    else v_end_hits[1]
  end;

  begin
    select extensions.st_force2d(extensions.st_makeline(
        extensions.st_setsrid(extensions.st_makepoint(
          (point.coordinate->>0)::double precision,(point.coordinate->>1)::double precision
        ),4326) order by point.point_number
      )),
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number))[1],
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number desc))[1],
      case when max(pg_catalog.abs(coalesce(nullif(point.coordinate->>2,'')::numeric,0)))>0.01
        then pg_catalog.round(avg(coalesce(nullif(point.coordinate->>2,'')::numeric,0)))::integer end
    into v_part1,v_part1_from,v_part1_to,v_part1_z
    from pg_catalog.jsonb_array_elements(p_path) with ordinality point(coordinate,point_number)
    where point.point_number<=v_split;

    select extensions.st_force2d(extensions.st_makeline(
        extensions.st_setsrid(extensions.st_makepoint(
          (point.coordinate->>0)::double precision,(point.coordinate->>1)::double precision
        ),4326) order by point.point_number
      )),
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number))[1],
      (pg_catalog.array_agg(nullif(point.coordinate->>3,'')::numeric order by point.point_number desc))[1],
      case when max(pg_catalog.abs(coalesce(nullif(point.coordinate->>2,'')::numeric,0)))>0.01
        then pg_catalog.round(avg(coalesce(nullif(point.coordinate->>2,'')::numeric,0)))::integer end
    into v_part2,v_part2_from,v_part2_to,v_part2_z
    from pg_catalog.jsonb_array_elements(p_path) with ordinality point(coordinate,point_number)
    where point.point_number>=v_split;
  exception when others then
    return;
  end;

  if ((v_part1_from is null)<>(v_part1_to is null))
     or ((v_part2_from is null)<>(v_part2_to is null)) then
    return;
  end if;

  component_number:=1;
  component_count:=2;
  start_point_number:=1;
  end_point_number:=v_split;
  path_geom:=v_part1;
  path_from:=v_part1_from;
  path_to:=v_part1_to;
  path_z:=v_part1_z;
  split_method:='source_endpoint_loop';
  path_digest:=pg_catalog.md5(p_path::text||':part:1');
  return next;

  component_number:=2;
  component_count:=2;
  start_point_number:=v_split;
  end_point_number:=v_n;
  path_geom:=v_part2;
  path_from:=v_part2_from;
  path_to:=v_part2_to;
  path_z:=v_part2_z;
  split_method:='source_endpoint_loop';
  path_digest:=pg_catalog.md5(p_path::text||':part:2');
  return next;
end
$issue97_wv_path_components$;

revoke all on function private_verification.brinesearch_issue97_wv_path_components(jsonb)
from public,anon,authenticated;

-- Executable synthetic regression: simple source path remains one component;
-- a source endpoint-loop becomes exactly two ordered simple components; an
-- interior bow-tie crossing remains rejected.
do $issue97_wv_endpoint_loop_regression$
declare
  v_simple integer;
  v_loop integer;
  v_bowtie integer;
  v_loop_simple boolean;
  v_loop_measures jsonb;
  v_loop_shared boolean;
begin
  select count(*) into v_simple
  from private_verification.brinesearch_issue97_wv_path_components(
    '[[0,0,0,0],[1,0,0,1]]'::jsonb
  );
  if v_simple<>1 then
    raise exception 'Issue #97 WVDOT simple-path regression failed: %',v_simple;
  end if;

  select count(*),bool_and(extensions.st_issimple(path_geom)),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(component_number,path_from,path_to) order by component_number)
  into v_loop,v_loop_simple,v_loop_measures
  from private_verification.brinesearch_issue97_wv_path_components(
    '[[0,0,0,0],[1,0,0,1],[1,1,0,2],[0,1,0,3],[1,0,0,4]]'::jsonb
  );
  select extensions.st_equals(a.path_geom |> extensions.st_endpoint,b.path_geom |> extensions.st_startpoint)
  into v_loop_shared
  from private_verification.brinesearch_issue97_wv_path_components(
    '[[0,0,0,0],[1,0,0,1],[1,1,0,2],[0,1,0,3],[1,0,0,4]]'::jsonb
  ) a
  join private_verification.brinesearch_issue97_wv_path_components(
    '[[0,0,0,0],[1,0,0,1],[1,1,0,2],[0,1,0,3],[1,0,0,4]]'::jsonb
  ) b on a.component_number=1 and b.component_number=2;

  if v_loop<>2 or coalesce(v_loop_simple,false) is not true
     or v_loop_measures<>'[[1, 0, 1], [2, 1, 4]]'::jsonb
     or coalesce(v_loop_shared,false) is not true then
    raise exception 'Issue #97 WVDOT endpoint-loop regression failed: count %, simple %, measures %, shared %',
      v_loop,v_loop_simple,v_loop_measures,v_loop_shared;
  end if;

  select count(*) into v_bowtie
  from private_verification.brinesearch_issue97_wv_path_components(
    '[[0,0,0,0],[1,1,0,1],[0,1,0,2],[1,0,0,3]]'::jsonb
  );
  if v_bowtie<>0 then
    raise exception 'Issue #97 WVDOT interior-crossing regression failed: %',v_bowtie;
  end if;
end
$issue97_wv_endpoint_loop_regression$;

-- Patch the already-hardened WVDOT loader in place so this forward migration
-- composes with every earlier #97 ingest lifecycle and multipart fix.
do $issue97_patch_wvdot_endpoint_loop$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
  v_start integer;
  v_relative_end integer;
  v_old_length integer;
  v_end_marker text:=E'      order by path_number\n    loop';
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:='and extensions.st_issimple(q.path_geom)';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT endpoint-loop validation patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,
    'and (extensions.st_issimple(q.path_geom) or private_verification.brinesearch_issue97_wv_endpoint_loop_safe(q.path_geom))');

  v_old:=E'    if coalesce(v_path_count,0)=0\n       or v_path_count<>v_source_path_count\n       or v_valid_path_count<>v_path_count then\n      continue;\n    end if;';
  v_new:=v_old||E'\n\n    -- The geometry-only predicate above prevents arbitrary non-simple input.\n    -- The JSON component helper additionally proves that every original path can\n    -- be materialized with valid endpoint measures before the source row counts.\n    if exists(\n      select 1\n      from pg_catalog.jsonb_array_elements(v_feature->''geometry''->''paths'') path(path_value)\n      where not exists(\n        select 1\n        from private_verification.brinesearch_issue97_wv_path_components(path.path_value)\n      )\n    ) then\n      continue;\n    end if;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT component-proof patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:='case when v_path_count=1 then v_base_segment_key else null end,';
  v_new:=E'case when v_path_count=1 and coalesce((\n          select max(component.component_count)\n          from pg_catalog.jsonb_array_elements(v_feature->''geometry''->''paths'')\n            with ordinality path(path_value,path_number)\n          cross join lateral private_verification.brinesearch_issue97_wv_path_components(path.path_value) component\n          where path.path_number=1\n        ),0)=1 then v_base_segment_key else null end,';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT name segment-key patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_start:=pg_catalog.strpos(v_definition,E'    for v_path in\n      select path_number,');
  if v_start=0 then
    raise exception 'Issue #97 WVDOT component loop start marker changed';
  end if;
  v_relative_end:=pg_catalog.strpos(pg_catalog.substr(v_definition,v_start),v_end_marker);
  if v_relative_end=0 then
    raise exception 'Issue #97 WVDOT component loop end marker changed';
  end if;
  v_old_length:=v_relative_end-1+pg_catalog.length(v_end_marker);
  v_new:=E'    for v_path in\n      select path.path_number,\n        component.component_number,component.component_count,\n        component.path_geom,component.path_from,component.path_to,\n        component.path_z,component.path_digest,component.split_method\n      from pg_catalog.jsonb_array_elements(v_feature->''geometry''->''paths'')\n        with ordinality path(path_value,path_number)\n      cross join lateral private_verification.brinesearch_issue97_wv_path_components(path.path_value) component\n      order by path.path_number,component.component_number\n    loop';
  v_definition:=pg_catalog.overlay(v_definition placing v_new from v_start for v_old_length);

  v_old:=E'v_segment_key:=case when v_path_count=1 then v_base_segment_key\n        else v_base_segment_key||'':PATH:''||v_path.path_number::text end;';
  v_new:=E'v_segment_key:=case\n        when v_path_count=1 and v_path.component_count=1 then v_base_segment_key\n        when v_path.component_count=1 then v_base_segment_key||'':PATH:''||v_path.path_number::text\n        else v_base_segment_key||'':PATH:''||v_path.path_number::text||'':PART:''||v_path.component_number::text\n      end;';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT component segment-key patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  v_old:=E'''source_path_number'',v_path.path_number,\n          ''source_path_count'',v_path_count,';
  v_new:=E'''source_path_number'',v_path.path_number,\n          ''source_path_component_number'',v_path.component_number,\n          ''source_path_component_count'',v_path.component_count,\n          ''source_path_split_method'',v_path.split_method,\n          ''source_path_count'',v_path_count,';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 WVDOT component provenance patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);

  execute v_definition;
end
$issue97_patch_wvdot_endpoint_loop$;

revoke all on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)
to service_role;

comment on function public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer) is
  'Issue #97 WVDOT loader. Preserves multipart source paths and narrowly splits a single authoritative endpoint-loop path at its exact repeated source vertex into ordered simple components. Arbitrary non-simple/crossing geometry remains rejected.';

-- Static post-patch contract: the final loader must use the narrow safety proof,
-- component materializer, and component-specific segment keys.
do $issue97_verify_wvdot_endpoint_loop_patch$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_ingest_wv_network_page(text,integer,integer)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not ilike '%brinesearch_issue97_wv_endpoint_loop_safe(q.path_geom)%'
     or v_definition not ilike '%brinesearch_issue97_wv_path_components(path.path_value)%'
     or v_definition not ilike '%source_path_component_count%'
     or v_definition not ilike '%:PART:%'
     or v_definition ilike '%or not extensions.st_isvalid(q.path_geom)% and true%'
  then
    raise exception 'Issue #97 WVDOT endpoint-loop patch did not install cleanly';
  end if;
end
$issue97_verify_wvdot_endpoint_loop_patch$;
