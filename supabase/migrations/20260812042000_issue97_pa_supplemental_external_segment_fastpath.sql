-- GitHub #97 — Pennsylvania supplemental alias materialization fast path.
--
-- The trusted dispatcher already routes Ohio supplemental work to the dedicated
-- Ohio candidate-cache implementation. The remaining issue97_core path is PA.
-- PA mappings store exact PennDOT external source_segment_keys, so re-reading the
-- cross-state authoritative road UNION view during mapping/name materialization is
-- both unnecessary and extremely expensive. Use the physical PA external segment
-- table directly and make the PA-only contract explicit.
--
-- Production rollback proof on Washington County NG911 (20,447 source centerlines):
--   broad UNION-view core: > 2 minute statement timeout during name materialization
--   direct external-segment core: ~32 seconds, same 180 verified mappings,
--   20,267 unmatched-held dispositions, and 362 materialized name rows.

do $issue97_pa_supplemental_external_fastpath$
declare
  v_core text;
  v_original text;
  v_old_join constant text:='public.brinesearch_authoritative_road_segments s';
  v_new_join constant text:='public.brinesearch_authoritative_external_road_segments s';
  v_join_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
  ) into v_core;
  v_original:=v_core;

  v_join_count:=(pg_catalog.length(v_core)-pg_catalog.length(pg_catalog.replace(v_core,v_old_join,'')))
    /pg_catalog.length(v_old_join);
  if v_join_count<>3 then
    raise exception 'Issue #97 PA supplemental fast path expected 3 broad-view joins, found %',v_join_count;
  end if;

  v_core:=pg_catalog.replace(v_core,
    'v_expected_target_runs:=case when v_run.state_code=''OH'' then 1 else 2 end;',
    'if v_run.state_code<>''PA'' then raise exception ''PA supplemental implementation helper received non-PA run'' using errcode=''22023''; end if;'||chr(10)||
    '  v_expected_target_runs:=2;'
  );
  v_core:=pg_catalog.replace(v_core,v_old_join,v_new_join);

  if v_core=v_original
     or v_core like '%'||v_old_join||'%'
     or v_core not like '%PA supplemental implementation helper received non-PA run%'
  then
    raise exception 'Issue #97 PA supplemental external-segment fast path patch did not compose cleanly';
  end if;

  execute v_core;
end
$issue97_pa_supplemental_external_fastpath$;

-- Implementation helper stays private; only the trusted dispatcher is callable.
revoke all on function public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)
from public,anon,authenticated,service_role;

-- Executable composed-runtime regression.
do $issue97_verify_pa_supplemental_external_fastpath$
declare
  v_core text;
  v_dispatch text;
  v_external_join_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
  ) into v_core;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases(uuid)'::pg_catalog.regprocedure
  ) into v_dispatch;

  v_external_join_count:=(pg_catalog.length(v_core)-pg_catalog.length(pg_catalog.replace(
    v_core,'public.brinesearch_authoritative_external_road_segments s','')))
    /pg_catalog.length('public.brinesearch_authoritative_external_road_segments s');

  if v_core like '%public.brinesearch_authoritative_road_segments s%'
     or v_external_join_count<>3
     or v_core not like '%PA supplemental implementation helper received non-PA run%'
     or v_dispatch not like '%if v_state=''OH'' then return public.brinesearch_issue97_refresh_supplemental_aliases_oh%'
     or v_dispatch not like '%return public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core%'
  then
    raise exception 'Issue #97 PA supplemental external-segment runtime contract failed';
  end if;
end
$issue97_verify_pa_supplemental_external_fastpath$;

comment on function public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid) is
  'Issue #97 private PA supplemental alias materializer. Uses exact PennDOT external source segment keys directly; road-name and nearest-road identity matching remain prohibited. Ohio is dispatched to the separate OH candidate-cache implementation.';
