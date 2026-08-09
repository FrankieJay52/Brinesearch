-- BrineSearch V17.3.20 follow-up 4
-- Directional maneuver language (turn/bear/veer/slight/stay/keep left/right) must
-- outrank the generic no-side `turn on/onto` classifier.

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
      evidence=d.evidence||jsonb_build_object('maneuver_review_v17320','saved source explicitly says turn on/onto road but provides no directional side')
  where d.maneuver_class<>'compound'
    and coalesce(d.evidence->>'instruction','') ~* '(^|[[:space:],.;])turn([[:space:]]+(northwest|northeast|southwest|southeast|north|south|east|west))?[[:space:]]+(on|onto)[[:space:]]+'
    and coalesce(d.evidence->>'instruction','') !~* '(^|[[:space:],.;])(turn|bear|veer|slight|stay|keep)[[:space:]]+(left|right)';
  get diagnostics changed=row_count;

  -- Restore directional rows that an earlier V17.3.20 no-side pass may have
  -- temporarily classified as turn_unspecified.
  update public.brinesearch_direction_step_intelligence d
  set maneuver_class=case
        when lower(btrim(d.evidence->>'instruction')) ~ '^(turn|bear|veer|slight|stay|keep)[[:space:]]+right' then
          case when lower(btrim(d.evidence->>'instruction')) ~ '^(bear|veer|slight|stay|keep)' then 'stay_right' else 'turn_right' end
        else
          case when lower(btrim(d.evidence->>'instruction')) ~ '^(bear|veer|slight|stay|keep)' then 'stay_left' else 'turn_left' end
      end,
      evidence=d.evidence||jsonb_build_object('maneuver_review_v17320','directional left/right wording outranks generic turn-on/onto classification')
  where d.maneuver_class='turn_unspecified'
    and lower(btrim(coalesce(d.evidence->>'instruction',''))) ~ '^(turn|bear|veer|slight|stay|keep)[[:space:]]+(left|right)';

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
