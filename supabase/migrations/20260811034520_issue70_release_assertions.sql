-- GitHub #70 release assertions for the all-operator Ohio exact road-coverage pipeline.
-- This migration changes no route or road data. It fails deployment if the
-- private staging / Owner RPC / #69 no-guess security boundary is not present.

do $issue70_release_assert$
declare
  v_rel record;
  v_name text;
  v_oid oid;
  v_def text;
begin
  select c.relrowsecurity,c.relforcerowsecurity
  into v_rel
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private_verification'
    and c.relname='brinesearch_oh_road_matches_issue70';

  if v_rel is null or not v_rel.relrowsecurity or not v_rel.relforcerowsecurity then
    raise exception 'Issue #70 private match staging is not FORCE RLS';
  end if;
  if pg_catalog.has_table_privilege('anon','private_verification.brinesearch_oh_road_matches_issue70','SELECT')
     or pg_catalog.has_table_privilege('authenticated','private_verification.brinesearch_oh_road_matches_issue70','SELECT') then
    raise exception 'Issue #70 private match staging became browser-readable';
  end if;

  foreach v_name in array array[
    'brinesearch_refresh_oh_road_matches_issue70()',
    'brinesearch_load_oh_road_geometry_issue70(integer)',
    'brinesearch_apply_oh_road_matches_issue70()',
    'brinesearch_oh_road_coverage_issue70()'
  ] loop
    v_oid:=pg_catalog.to_regprocedure('public.'||v_name);
    if v_oid is null then
      raise exception 'Issue #70 missing Owner RPC %',v_name;
    end if;
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_oid) then
      raise exception 'Issue #70 RPC % is not SECURITY DEFINER',v_name;
    end if;
    if not exists (
      select 1 from pg_catalog.pg_proc p
      where p.oid=v_oid and p.proconfig @> array['search_path=""']::text[]
    ) then
      raise exception 'Issue #70 RPC % does not have an empty fixed search_path',v_name;
    end if;
    if pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') then
      raise exception 'Issue #70 RPC % is anonymously executable',v_name;
    end if;
    if not pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') then
      raise exception 'Issue #70 RPC % is not callable by authenticated Owner session',v_name;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_refresh_oh_road_matches_issue70()'::pg_catalog.regprocedure
  ) into v_def;
  if pg_catalog.position('c.county_code=b.county_code' in v_def)=0
     or pg_catalog.position('multiple_exact_odot_matches' in v_def)=0
     or pg_catalog.position('fuzzy_matching' in v_def)=0 then
    raise exception 'Issue #70 exact county-scoped fail-closed matcher invariant failed';
  end if;
  if pg_catalog.position('similarity(' in pg_catalog.lower(v_def))>0
     or pg_catalog.position('levenshtein(' in pg_catalog.lower(v_def))>0 then
    raise exception 'Issue #70 matcher contains fuzzy road identity logic';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_load_oh_road_geometry_issue70(integer)'::pg_catalog.regprocedure
  ) into v_def;
  if pg_catalog.position('tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0/query' in v_def)=0
     or pg_catalog.position('OpenStreetMap' in v_def)>0
     or pg_catalog.position('overpass' in pg_catalog.lower(v_def))>0 then
    raise exception 'Issue #70 official geometry-loader source invariant failed';
  end if;

  if pg_catalog.to_regprocedure('public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)') is null then
    raise exception 'Issue #70 lost the #69 canonical structured-route publisher';
  end if;
end;
$issue70_release_assert$;
