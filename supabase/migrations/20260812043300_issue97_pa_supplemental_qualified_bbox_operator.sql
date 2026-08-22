-- GitHub #97 — qualify the PostGIS bbox operator inside the SECURITY DEFINER
-- supplemental alias mapper.
--
-- The preceding 43200 migration added the correct conservative GiST prefilter,
-- but the mapper runs with search_path='' and a bare `&&` operator therefore
-- cannot be resolved at runtime. Keep the exact same bounding box and exact
-- 1-meter ST_DWithin predicate; only schema-qualify the PostGIS operator.

-- Executable namespace regression: the qualified operator must work with an
-- empty search_path, matching the SECURITY DEFINER runtime environment.
do $issue97_pa_bbox_operator_regression$
declare
  v_a extensions.geometry:=extensions.st_setsrid(extensions.st_makepoint(-76,41),4326);
  v_ok boolean;
begin
  select v_a OPERATOR(extensions.&&) extensions.st_expand(v_a,0.0002) into v_ok;
  if coalesce(v_ok,false) is not true then
    raise exception 'Issue #97 qualified PostGIS bbox operator regression failed';
  end if;
end
$issue97_pa_bbox_operator_regression$;

do $issue97_patch_pa_bbox_operator$
declare
  v_definition text;
  v_old text;
  v_new text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_old:='and s.geom && extensions.st_expand(c.geom,0.0002)';
  v_new:='and s.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.0002)';
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 PA bbox operator patch expected 1 target, found %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_pa_bbox_operator$;

do $issue97_verify_pa_bbox_operator$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%s.geom OPERATOR(extensions.&&) extensions.st_expand(c.geom,0.0002)%'
     or v_definition not like '%extensions.st_dwithin(c.geom::extensions.geography,s.geom::extensions.geography,1)%'
     or v_definition like '%and s.geom && extensions.st_expand(c.geom,0.0002)%'
  then
    raise exception 'Issue #97 PA qualified bbox operator contract did not install cleanly';
  end if;
end
$issue97_verify_pa_bbox_operator$;
