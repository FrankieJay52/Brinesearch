-- GitHub #70 strict-context release assertions.
-- No route or road data is mutated by this file. It fails deployment if the
-- private evidence table, Owner RPC boundaries, strict thresholds, or #69
-- canonical publisher are missing.

do $issue70_context_release_assert$
declare
  v_rel record;
  v_name text;
  v_oid oid;
  v_def text;
begin
  select c.relrowsecurity,c.relforcerowsecurity into v_rel
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private_verification' and c.relname='brinesearch_oh_context_resolutions_issue70';
  if v_rel is null or not v_rel.relrowsecurity or not v_rel.relforcerowsecurity then
    raise exception 'Issue #70 strict-context evidence table is not FORCE RLS';
  end if;
  if pg_catalog.has_table_privilege('anon','private_verification.brinesearch_oh_context_resolutions_issue70','SELECT')
     or pg_catalog.has_table_privilege('authenticated','private_verification.brinesearch_oh_context_resolutions_issue70','SELECT') then
    raise exception 'Issue #70 strict-context evidence became browser-readable';
  end if;

  foreach v_name in array array[
    'brinesearch_load_oh_ambiguous_geometry_issue70(integer)',
    'brinesearch_stage_oh_ambiguous_context_issue70()',
    'brinesearch_apply_oh_ambiguous_context_issue70()'
  ] loop
    v_oid:=pg_catalog.to_regprocedure('public.'||v_name);
    if v_oid is null then raise exception 'Issue #70 missing strict-context RPC %',v_name; end if;
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid=v_oid) then
      raise exception 'Issue #70 strict-context RPC % is not SECURITY DEFINER',v_name;
    end if;
    if not exists(select 1 from pg_catalog.pg_proc p where p.oid=v_oid and p.proconfig @> array['search_path=""']::text[]) then
      raise exception 'Issue #70 strict-context RPC % lacks empty fixed search_path',v_name;
    end if;
    if pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') then
      raise exception 'Issue #70 strict-context RPC % is anonymously executable',v_name;
    end if;
    if not pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') then
      raise exception 'Issue #70 strict-context RPC % is not callable by authenticated Owner session',v_name;
    end if;
  end loop;

  select pg_catalog.pg_get_functiondef('public.brinesearch_stage_oh_ambiguous_context_issue70()'::pg_catalog.regprocedure) into v_def;
  if pg_catalog.strpos(v_def,'candidate_geometry_count=r.candidate_count')=0
     or pg_catalog.strpos(v_def,'r.second_neighbor_m>=200')=0
     or pg_catalog.strpos(v_def,'r.pad_m<=100')=0
     or pg_catalog.strpos(v_def,'r.second_pad_m>=greatest(500,r.pad_m*5)')=0
     or pg_catalog.strpos(v_def,'name_similarity_decision')=0 then
    raise exception 'Issue #70 strict ambiguity threshold invariant failed';
  end if;
  if pg_catalog.strpos(pg_catalog.lower(v_def),'similarity(')>0
     or pg_catalog.strpos(pg_catalog.lower(v_def),'levenshtein(')>0 then
    raise exception 'Issue #70 strict ambiguity resolver contains fuzzy identity logic';
  end if;

  select pg_catalog.pg_get_functiondef('public.brinesearch_load_oh_ambiguous_geometry_issue70(integer)'::pg_catalog.regprocedure) into v_def;
  if pg_catalog.strpos(v_def,'tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0/query')=0
     or pg_catalog.strpos(pg_catalog.lower(v_def),'overpass')>0
     or pg_catalog.strpos(pg_catalog.lower(v_def),'nominatim')>0 then
    raise exception 'Issue #70 ambiguous candidate geometry source invariant failed';
  end if;

  if pg_catalog.to_regprocedure('public.brinesearch_publish_structured_route(uuid,uuid,jsonb,bigint)') is null then
    raise exception 'Issue #70 strict context lost the #69 canonical publisher';
  end if;
end;
$issue70_context_release_assert$;
