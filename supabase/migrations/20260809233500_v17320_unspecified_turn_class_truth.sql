-- BrineSearch V17.3.20 follow-up 3
-- A saved instruction that explicitly says TURN ON/ONTO a road is a turn even when
-- it does not say left or right. Preserve that fact as turn_unspecified instead of
-- misclassifying it as continue. The UI separately preserves compass wording such
-- as "Turn west on ..." without inventing a left/right side.

create or replace function public.brinesearch_apply_v17320_unspecified_turn_classes()
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare changed integer:=0;
begin
  update public.brinesearch_direction_step_intelligence d
  set maneuver_class='turn_unspecified',
      evidence=d.evidence||jsonb_build_object(
        'maneuver_review_v17320','saved source explicitly says turn on/onto road but provides no left/right side'
      )
  where d.maneuver_class<>'compound'
    and coalesce(d.evidence->>'instruction','') ~* '(^|[[:space:],.;])turn([[:space:]]+(northwest|northeast|southwest|southeast|north|south|east|west))?[[:space:]]+(on|onto)[[:space:]]+'
    and coalesce(d.evidence->>'instruction','') !~* 'turn[[:space:]]+(left|right)';
  get diagnostics changed=row_count;
  return changed;
end
$$;
revoke all on function public.brinesearch_apply_v17320_unspecified_turn_classes() from public,anon,authenticated;

create or replace function public.brinesearch_refresh_all_direction_intelligence()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare base_result jsonb; truth_result jsonb; target_result jsonb; alias_result jsonb; turn_rows integer;
begin
  base_result:=public.brinesearch_refresh_all_direction_intelligence_v17319_base();
  truth_result:=public.brinesearch_apply_v17320_direction_truth();
  target_result:=public.brinesearch_apply_v17320_target_road_truth();
  alias_result:=public.brinesearch_apply_v17320_alias_sanity();
  turn_rows:=public.brinesearch_apply_v17320_unspecified_turn_classes();
  return base_result
    ||jsonb_build_object('v17320_road_turn_mileage_truth',truth_result)
    ||jsonb_build_object('v17320_target_road_alias_truth',target_result)
    ||jsonb_build_object('v17320_alias_sanity',alias_result)
    ||jsonb_build_object('v17320_unspecified_turn_rows',turn_rows);
end
$$;
revoke all on function public.brinesearch_refresh_all_direction_intelligence() from public,anon,authenticated;

select public.brinesearch_apply_v17320_unspecified_turn_classes();
