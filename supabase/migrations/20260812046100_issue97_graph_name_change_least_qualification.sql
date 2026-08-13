-- GitHub #97 — correct the name-change owner-scope LEAST call introduced by
-- the performance rewrite. LEAST is SQL syntax/function resolution and is not
-- exposed as pg_catalog.least(text,text) in production. This is semantics-neutral.

do $issue97_patch_name_change_least$
declare
  v_definition text;
  v_bad constant text := 'pg_catalog.least(';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_count := (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_bad,'')))
    / pg_catalog.length(v_bad);

  if v_count=0 then
    return;
  end if;
  if v_count<>1 then
    raise exception 'Issue #97 unexpected pg_catalog.least occurrence count: %',v_count;
  end if;

  v_definition := pg_catalog.replace(v_definition,v_bad,'least(');
  execute v_definition;
end
$issue97_patch_name_change_least$;

do $issue97_verify_name_change_least$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition like '%pg_catalog.least(%'
     or v_definition not like '%least(%left_state_code%left_county_code%right_state_code%right_county_code%'
  then
    raise exception 'Issue #97 name-change owner-scope LEAST contract did not install cleanly';
  end if;
end
$issue97_verify_name_change_least$;