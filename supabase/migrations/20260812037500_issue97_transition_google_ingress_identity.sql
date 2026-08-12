-- GitHub #97 — preserve exact identity/road provenance on the first Google route shape.
-- The public manifest table requires the route-ingress shape to carry identity_id.
-- This is provenance only: it never selects a road and does not weaken no-guess rules.

do $issue97_patch_transition_google_ingress_identity$
declare
  v_definition text;
  v_old text:=$old$
      'occurrence_id',src.route_prep_step_id,
      'source_kind','authoritative_clipped_geometry',
$old$;
  v_new text:=$new$
      'occurrence_id',src.route_prep_step_id,
      'identity_id',src.identity_id,
      'road_id',src.canonical_road_id,
      'source_kind','authoritative_clipped_geometry',
$new$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
    /pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 transition Google ingress identity patch target changed unexpectedly: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not ilike '%''identity_id'',src.identity_id%'
     or v_definition not ilike '%''road_id'',src.canonical_road_id%'
  then
    raise exception 'Issue #97 transition Google ingress identity provenance did not install cleanly';
  end if;
end
$issue97_patch_transition_google_ingress_identity$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)
from public,anon,authenticated;
grant execute on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)
to service_role;
