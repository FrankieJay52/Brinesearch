-- GitHub #97 — Pennsylvania supplemental exact-mapping spatial prefilter.
--
-- Bradford (9k supplemental centerlines x ~6k PennDOT primary segments) proved
-- that the exact 1 m geography ST_DWithin predicate was being executed as a
-- county-scope nested-loop join filter. The query could exceed the production
-- statement timeout even though the no-guess mapping rules were correct.
--
-- Add a conservative geometry GiST bounding-box prefilter before the existing
-- exact geodesic predicate. The 0.0002 degree box is intentionally much wider
-- than 1 meter anywhere in the OH/PA product footprint. It is candidate discovery
-- only: ST_DWithin(...geography...,1) remains mandatory and all later official-ID,
-- municipality, coverage, ambiguity, and no-name/no-nearest gates are unchanged.

-- Synthetic safety proof at representative PA coordinates: points projected one
-- meter in all cardinal directions must remain inside the conservative candidate
-- box. Exact route/mapping truth is still established by ST_DWithin afterward.
do $issue97_pa_supp_bbox_regression$
declare
  v_origin extensions.geometry:=extensions.st_setsrid(extensions.st_makepoint(-76.0,41.0),4326);
  v_n extensions.geometry;
  v_e extensions.geometry;
  v_s extensions.geometry;
  v_w extensions.geometry;
begin
  v_n:=extensions.st_project(v_origin::extensions.geography,1,0)::extensions.geometry;
  v_e:=extensions.st_project(v_origin::extensions.geography,1,pi()/2)::extensions.geometry;
  v_s:=extensions.st_project(v_origin::extensions.geography,1,pi())::extensions.geometry;
  v_w:=extensions.st_project(v_origin::extensions.geography,1,3*pi()/2)::extensions.geometry;
  if not (v_n && extensions.st_expand(v_origin,0.0002))
     or not (v_e && extensions.st_expand(v_origin,0.0002))
     or not (v_s && extensions.st_expand(v_origin,0.0002))
     or not (v_w && extensions.st_expand(v_origin,0.0002)) then
    raise exception 'Issue #97 PA supplemental bounding-box prefilter is too narrow for a 1 m exact candidate';
  end if;
end
$issue97_pa_supp_bbox_regression$;

do $issue97_patch_pa_supp_bbox$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:='and extensions.st_dwithin(c.geom::extensions.geography,s.geom::extensions.geography,1)';
  v_new:=E'and s.geom && extensions.st_expand(c.geom,0.0002)\n       and extensions.st_dwithin(c.geom::extensions.geography,s.geom::extensions.geography,1)';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 PA supplemental exact ST_DWithin patch expected 1 target, found %',v_count;
  end if;
  if v_definition like '%s.geom && extensions.st_expand(c.geom,0.0002)%' then
    raise exception 'Issue #97 PA supplemental bounding-box prefilter is already installed';
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_pa_supp_bbox$;

-- Composed-runtime proof: the exact geodesic predicate must still exist directly
-- after the coarse geometry prefilter, and no name/nearest resolution is added.
do $issue97_verify_pa_supp_bbox$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%s.geom && extensions.st_expand(c.geom,0.0002)%'
     or v_definition not like '%extensions.st_dwithin(c.geom::extensions.geography,s.geom::extensions.geography,1)%'
     or v_definition like '%nearest_road_used'', true%'
  then
    raise exception 'Issue #97 PA supplemental spatial prefilter contract did not install cleanly';
  end if;
end
$issue97_verify_pa_supp_bbox$;
