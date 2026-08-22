-- GitHub #97 — Ohio graph rebuild JIT performance guard.
--
-- Guernsey registry-digest profiling showed the exact same digest query, with the
-- same 1-metre node predicate and same temp geography index, executes in roughly
-- 6.8 seconds with PostgreSQL JIT enabled versus roughly 0.29 seconds with JIT
-- disabled. The expensive time is LLVM compilation, not graph/digest semantics.
--
-- Disable JIT transaction-locally only when the graph builder is rebuilding Ohio.
-- No SQL predicate, source scope, topology rule, digest formula, tolerance,
-- mapping rule, or no-guess behavior changes. Non-Ohio rebuilds remain unchanged.

do $issue97_patch_oh_graph_disable_jit$
declare
  v_definition text;
  v_old text:=E'begin\n  select county_name into v_county_name\n';
  v_new text:=E'begin\n  if v_state=''OH'' then\n    perform pg_catalog.set_config(''jit'',''off'',true);\n  end if;\n\n  select county_name into v_county_name\n';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%if v_state=''OH'' then%set_config(''jit'',''off'',true)%' then
    null;
  else
    v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
      pg_catalog.replace(v_definition,v_old,'')
    ))/pg_catalog.length(v_old);
    if v_count<>1 then
      raise exception 'Issue #97 Ohio graph JIT patch target changed: %',v_count;
    end if;
    execute pg_catalog.replace(v_definition,v_old,v_new);
  end if;
end
$issue97_patch_oh_graph_disable_jit$;

do $issue97_verify_oh_graph_disable_jit$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not like '%if v_state=''OH'' then%set_config(''jit'',''off'',true)%'
     or v_definition not like '%select county_name into v_county_name%'
  then
    raise exception 'Issue #97 Ohio graph JIT performance guard did not install cleanly';
  end if;
end
$issue97_verify_oh_graph_disable_jit$;
