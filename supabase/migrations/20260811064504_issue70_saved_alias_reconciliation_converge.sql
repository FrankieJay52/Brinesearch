-- #70 saved alias reconciliation may create one Road Manager identity on the first
-- pass while sibling route-prep occurrences were staged from the same pre-create
-- snapshot. Re-stage after each pass so all repeated occurrences converge onto the
-- newly created trusted road without weakening any matching rule.

create or replace function public.brinesearch_apply_saved_alias_reconcile_all_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_pass integer;
  v_result jsonb;
  v_linked integer;
  v_total_linked integer:=0;
  v_total_created integer:=0;
  v_total_upgraded integer:=0;
  v_total_reused integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may apply #70 saved alias reconciliation';
  end if;

  for v_pass in 1..5 loop
    v_result:=public.brinesearch_apply_saved_alias_reconcile_issue70();
    v_linked:=coalesce((v_result->>'route_steps_linked')::integer,0);
    v_total_linked:=v_total_linked+v_linked;
    v_total_created:=v_total_created+coalesce((v_result->>'official_roads_created')::integer,0);
    v_total_upgraded:=v_total_upgraded+coalesce((v_result->>'existing_roads_upgraded')::integer,0);
    v_total_reused:=v_total_reused+coalesce((v_result->>'existing_roads_reused')::integer,0);
    exit when v_linked=0;
  end loop;

  return pg_catalog.jsonb_build_object(
    'passes',v_pass,
    'route_steps_linked',v_total_linked,
    'official_roads_created',v_total_created,
    'existing_roads_upgraded',v_total_upgraded,
    'existing_roads_reused',v_total_reused,
    'policy','Repeated occurrences are re-staged only after a prior exact apply pass. Matching evidence and no-guess rules are unchanged.'
  );
end;
$$;

revoke all on function public.brinesearch_apply_saved_alias_reconcile_all_issue70() from public,anon;
grant execute on function public.brinesearch_apply_saved_alias_reconcile_all_issue70() to authenticated;
