-- Follow-up for #70 saved alias reconciliation.
-- PostgreSQL does not provide min(uuid). Replace the staging function's UUID
-- aggregate with a deterministic text-min cast before the function is invoked.

do $issue70_fix$
declare
  v_oid oid;
  v_def text;
  v_fixed text;
begin
  select p.oid into v_oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='brinesearch_stage_saved_alias_reconcile_issue70'
    and pg_catalog.pg_get_function_identity_arguments(p.oid)='';

  if v_oid is null then
    raise exception '#70 saved alias staging function is missing';
  end if;

  v_def:=pg_catalog.pg_get_functiondef(v_oid);
  v_fixed:=pg_catalog.regexp_replace(
    v_def,
    'min\(rr\.id\)[[:space:]]+as[[:space:]]+selected_road_id',
    '(min(rr.id::text))::uuid as selected_road_id',
    'i'
  );

  if v_fixed=v_def then
    raise exception '#70 UUID aggregate patch target was not found';
  end if;

  execute v_fixed;
end;
$issue70_fix$;
