-- GitHub #70 verified-existing-road alias reuse release assertions.
-- This changes no road/route data. It fails deployment if browser access,
-- non-explicit alias inference, Road Manager mutation, or route publishing enters
-- this deliberately narrow reuse boundary.

do $issue70_verified_alias_release_assert$
declare
  v_rel record;
  v_name text;
  v_oid oid;
  v_stage text;
  v_apply text;
begin
  select c.relrowsecurity,c.relforcerowsecurity into v_rel
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private_verification' and c.relname='brinesearch_verified_alias_matches_issue70';
  if v_rel is null or not v_rel.relrowsecurity or not v_rel.relforcerowsecurity then
    raise exception 'Issue #70 verified-alias evidence table is not FORCE RLS';
  end if;
  if pg_catalog.has_table_privilege('anon','private_verification.brinesearch_verified_alias_matches_issue70','SELECT')
     or pg_catalog.has_table_privilege('authenticated','private_verification.brinesearch_verified_alias_matches_issue70','SELECT') then
    raise exception 'Issue #70 verified-alias evidence became browser-readable';
  end if;

  foreach v_name in array array[
    'brinesearch_stage_verified_alias_matches_issue70()',
    'brinesearch_apply_verified_alias_matches_issue70()'
  ] loop
    v_oid:=pg_catalog.to_regprocedure('public.'||v_name);
    if v_oid is null then raise exception 'Issue #70 missing verified-alias RPC %',v_name; end if;
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_oid) then
      raise exception 'Issue #70 verified-alias RPC % is not SECURITY DEFINER',v_name;
    end if;
    if not exists(select 1 from pg_catalog.pg_proc p where p.oid=v_oid and p.proconfig @> array['search_path=""']::text[]) then
      raise exception 'Issue #70 verified-alias RPC % lacks empty fixed search_path',v_name;
    end if;
    if pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') then
      raise exception 'Issue #70 verified-alias RPC % is anonymously executable',v_name;
    end if;
    if not pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') then
      raise exception 'Issue #70 verified-alias RPC % is not callable by authenticated Owner session',v_name;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef('public.brinesearch_stage_verified_alias_matches_issue70()'::pg_catalog.regprocedure) into v_stage;
  if pg_catalog.strpos(v_stage,'a.alias_exact=n.raw_exact')=0
     or pg_catalog.strpos(v_stage,'having count(*)=1')=0
     or pg_catalog.strpos(v_stage,'exact_slash_alias_component')=0 then
    raise exception 'Issue #70 explicit-alias staging invariant failed';
  end if;
  if pg_catalog.strpos(pg_catalog.lower(v_stage),'brinesearch_road_name_core(')>0
     or pg_catalog.strpos(pg_catalog.lower(v_stage),'similarity(')>0
     or pg_catalog.strpos(pg_catalog.lower(v_stage),'st_distance(')>0 then
    raise exception 'Issue #70 verified-alias staging contains inferred/fuzzy/spatial identity logic';
  end if;

  select pg_catalog.pg_get_functiondef('public.brinesearch_apply_verified_alias_matches_issue70()'::pg_catalog.regprocedure) into v_apply;
  if pg_catalog.strpos(pg_catalog.lower(v_apply),'insert into public.brinesearch_roads')>0
     or pg_catalog.strpos(pg_catalog.lower(v_apply),'update public.brinesearch_roads')>0
     or pg_catalog.strpos(pg_catalog.lower(v_apply),'brinesearch_publish_structured_route')>0 then
    raise exception 'Issue #70 verified-alias reuse may not create/mutate Road Manager roads or publish routes';
  end if;
  if pg_catalog.strpos(v_apply,'pg_catalog.md5(r.centerline_geojson::text)=rec.road_geometry_digest')=0 then
    raise exception 'Issue #70 verified-alias apply is not revalidating trusted Road Manager geometry';
  end if;

  if pg_catalog.to_regprocedure('public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)') is null then
    raise exception 'Issue #70 verified-alias slice lost the #69 canonical publisher';
  end if;
end;
$issue70_verified_alias_release_assert$;
