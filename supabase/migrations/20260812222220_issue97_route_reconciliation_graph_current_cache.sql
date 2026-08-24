-- GitHub #97 — cache active graph-build freshness once per corpus reconciliation.
--
-- A full production-dark reconciliation progressed past candidate discovery after
-- the WV/PA indexed-name fix, then timed out while the recursive route identity
-- path repeatedly recomputed graph-build source freshness. The existing
-- brinesearch_issue97_graph_build_sources_current_cached() helper already supports
-- a transaction-local temp cache; the corpus entrypoint simply was not preparing
-- it. This patch prepares that cache before resolving route paths. No topology or
-- resolution semantics change.

do $issue97_patch_route_reconciliation_graph_current_cache$
declare
  v_definition text;
  v_old text:=E'  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''brinesearch:issue97:route-corpus'',97));\n\n';
  v_new text:=v_old||E'  perform private_verification.brinesearch_issue97_prepare_graph_current_cache();\n\n';
begin
  select pg_catalog.pg_get_functiondef('public.brinesearch_issue97_reconcile_route_corpus(uuid)'::pg_catalog.regprocedure) into v_definition;
  if pg_catalog.strpos(v_definition,v_new)>0 then return; end if;
  if pg_catalog.strpos(v_definition,v_old)=0 then raise exception 'Issue #97 route-corpus graph-cache patch target not found'; end if;
  if pg_catalog.strpos(pg_catalog.substr(v_definition,pg_catalog.strpos(v_definition,v_old)+1),v_old)>0 then raise exception 'Issue #97 route-corpus graph-cache patch target is not unique'; end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_route_reconciliation_graph_current_cache$;

do $issue97_verify_route_reconciliation_graph_current_cache$
declare v_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.brinesearch_issue97_reconcile_route_corpus(uuid)'::pg_catalog.regprocedure) into v_definition;
  if v_definition not like '%perform private_verification.brinesearch_issue97_prepare_graph_current_cache();%' or v_definition not like '%brinesearch_issue97_resolve_route_identity_path(v_route.id)%' then raise exception 'Issue #97 route-corpus graph-current cache contract did not install cleanly'; end if;
end
$issue97_verify_route_reconciliation_graph_current_cache$;
