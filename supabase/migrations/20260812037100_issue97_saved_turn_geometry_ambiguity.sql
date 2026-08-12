-- GitHub #97 — saved turn fallback only for an exact-but-ambiguous geometry angle.
--
-- Cologie's Foxs Bottom -> Springdale Hill exact clipped geometries meet at the
-- same verified junction, but their 2 m heading delta is -33.931 degrees. The
-- existing turn classifier intentionally holds the 20..45 degree band rather than
-- guessing left/right. Both persistent driver sources explicitly say left. When
-- geometry exists and is continuous but the angle alone is ambiguous, preserve the
-- explicit saved turn. Never use this fallback for missing/broken geometry, and
-- never override a clear geometry-derived maneuver that conflicts with saved data.

do $issue97_patch_saved_turn_angle_ambiguity$
declare
  v_definition text;
  v_old text:=$old$
          if not coalesce((v_turn_json->>'resolved')::boolean,false) then v_hold:='geometry_'||coalesce(v_turn_json->>'reason','turn_unresolved');
          else
            v_turn:=v_turn_json->>'turn';v_delta=(v_turn_json->>'delta_degrees')::numeric;v_turn_source:='exact_adjacent_step_geometry';
            if v_saved_turn is not null and v_saved_turn<>v_turn then v_hold:='geometry_turn_conflicts_saved_direction'; end if;
          end if;
$old$;
  v_new text:=$new$
          if not coalesce((v_turn_json->>'resolved')::boolean,false) then
            if v_turn_json->>'reason'='turn_angle_ambiguous' and v_saved_turn is not null then
              v_turn:=v_saved_turn;
              v_delta:=nullif(v_turn_json->>'delta_degrees','')::numeric;
              v_turn_source:='saved_direction_exact_geometry_angle_ambiguous';
            else
              v_hold:='geometry_'||coalesce(v_turn_json->>'reason','turn_unresolved');
            end if;
          else
            v_turn:=v_turn_json->>'turn';v_delta=(v_turn_json->>'delta_degrees')::numeric;v_turn_source:='exact_adjacent_step_geometry';
            if v_saved_turn is not null and v_saved_turn<>v_turn then v_hold:='geometry_turn_conflicts_saved_direction'; end if;
          end if;
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_route_geometry(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 saved-turn ambiguity patch changed unexpectedly: matches=%',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_saved_turn_angle_ambiguity$;

revoke all on function private_verification.brinesearch_issue97_refresh_route_geometry(uuid)
from public,anon,authenticated,service_role;

comment on function private_verification.brinesearch_issue97_refresh_route_geometry(uuid) is
  'Issue #97 occurrence geometry/turn materializer. Clear exact geometry maneuvers remain authoritative and conflicts fail closed. Only an exact contiguous geometry result held solely for turn_angle_ambiguous may use an explicit saved turn; missing geometry never falls back to text.';
