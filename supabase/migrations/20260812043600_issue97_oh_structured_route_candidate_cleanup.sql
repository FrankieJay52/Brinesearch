-- GitHub #97 — Ohio route candidate cleanup using existing structured evidence.
--
-- Two recurring Route Prep shapes are currently held even when exact authoritative
-- graph evidence exists:
--   1. maneuver text is embedded in the saved road token, e.g.
--      "Right/west Onto Holly View Dr";
--   2. the step is already typed as interstate/us_route/state_route and backed by
--      a saved Road Manager highway family, but the text is the generic
--      "Route <number>" form.
--
-- This migration adds candidate evidence only. Neither lane is strong proof.
-- The existing full-sequence authoritative graph solver must still select one
-- unique geographic route path. Generic/untyped Route <number> steps remain held.
-- No fuzzy matching, no nearest-road selection, and no road-number-only resolution.
--
-- Keep the existing candidate_basis enum narrow. Structured cleanup evidence is
-- recorded inside evidence, while the candidate itself remains one of the existing
-- exact-name or exact-designation candidate categories.

do $issue97_patch_oh_structured_candidate_cleanup$
declare
  v_definition text;
  v_marker constant text:=E'    else\n    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(';
  v_insert text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_marker,'')))
    /pg_catalog.length(v_marker);
  if v_count<>1 then
    raise exception 'Issue #97 Ohio structured candidate cleanup expected one OH/WV-PA branch marker, found %',v_count;
  end if;

  if v_definition like '%structured maneuver prefix removed before exact authoritative equality%'
     or v_definition like '%saved typed route family + exact route number%' then
    raise exception 'Issue #97 Ohio structured candidate cleanup is already installed';
  end if;

  v_insert:=E'      -- Structured maneuver-prefix cleanup: candidate evidence only.\n'
||E'      if v_step.step_kind in (''local_road'',''county_road'',''township_road'')\n'
||E'         and v_token~''^(left|right)([[:space:]]+(north|south|east|west))?[[:space:]]+onto[[:space:]]+'' then\n'
||E'        insert into private_verification.brinesearch_route_occurrence_candidates_issue97(\n'
||E'          route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,\n'
||E'          source_identity_key,source_digest,mapping_fingerprint,evidence\n'
||E'        )\n'
||E'        select distinct p_step_id,i.id,m.road_id,''exact_authoritative_name_candidate'',false,\n'
||E'          i.source_identity_key,i.source_digest,\n'
||E'          private_verification.brinesearch_issue97_mapping_fingerprint(i.id),\n'
||E'          pg_catalog.jsonb_build_object(\n'
||E'            ''original_token'',v_token,\n'
||E'            ''candidate_token'',pg_catalog.regexp_replace(\n'
||E'              v_token,''^(left|right)([[:space:]]+(north|south|east|west))?[[:space:]]+onto[[:space:]]+'','''',''i''\n'
||E'            ),\n'
||E'            ''basis'',''structured maneuver prefix removed before exact authoritative equality'',\n'
||E'            ''warning'',''candidate evidence only; graph path still required''\n'
||E'          )\n'
||E'        from (\n'
||E'          select i.id as identity_id\n'
||E'          from public.brinesearch_authoritative_road_identities i\n'
||E'          where i.state_code=''OH'' and i.active\n'
||E'            and i.normalized_name=pg_catalog.regexp_replace(\n'
||E'              v_token,''^(left|right)([[:space:]]+(north|south|east|west))?[[:space:]]+onto[[:space:]]+'','''',''i''\n'
||E'            )\n'
||E'          union\n'
||E'          select n.identity_id\n'
||E'          from public.brinesearch_authoritative_road_names n\n'
||E'          join public.brinesearch_authoritative_road_identities i\n'
||E'            on i.id=n.identity_id and i.state_code=''OH'' and i.active\n'
||E'          where n.active\n'
||E'            and n.normalized_name=pg_catalog.regexp_replace(\n'
||E'              v_token,''^(left|right)([[:space:]]+(north|south|east|west))?[[:space:]]+onto[[:space:]]+'','''',''i''\n'
||E'            )\n'
||E'            and (n.valid_from is null or n.valid_from<=now())\n'
||E'            and (n.valid_to is null or n.valid_to>now())\n'
||E'            and private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
||E'              n.source_dataset_id,i.state_code,i.county_code\n'
||E'            )\n'
||E'        ) hit\n'
||E'        join public.brinesearch_authoritative_road_identities i on i.id=hit.identity_id and i.active\n'
||E'        left join public.brinesearch_road_identity_mappings m\n'
||E'          on m.identity_id=i.id and m.mapping_status=''verified''\n'
||E'        where private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
||E'            i.dataset_id,i.state_code,i.county_code\n'
||E'          )\n'
||E'          and i.drivable_status=''drivable'' and i.public_access_status in (''public'',''access'')\n'
||E'          and pg_catalog.regexp_replace(\n'
||E'            v_token,''^(left|right)([[:space:]]+(north|south|east|west))?[[:space:]]+onto[[:space:]]+'','''',''i''\n'
||E'          ) not in (''road'',''rd'',''county road'',''county rd'',''township road'',''township rd'',''township hwy'')\n'
||E'        on conflict(route_prep_step_id,identity_id,candidate_basis) do update set\n'
||E'          canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,\n'
||E'          mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();\n'
||E'      end if;\n\n'
||E'      -- Typed generic Route <number>: both saved step kind and saved Road Manager\n'
||E'      -- family/number must agree before authoritative source identities become candidates.\n'
||E'      if v_step.step_kind in (''interstate'',''us_route'',''state_route'')\n'
||E'         and v_step.road_id is not null and v_token~''^route[[:space:]]+[0-9a-z]+$''\n'
||E'         and exists(\n'
||E'           select 1 from public.brinesearch_roads r\n'
||E'           where r.id=v_step.road_id and r.road_type=v_step.step_kind\n'
||E'             and pg_catalog.lower(coalesce(r.route_number,''''))=pg_catalog.regexp_replace(v_token,''^route[[:space:]]+'','''')\n'
||E'         ) then\n'
||E'        insert into private_verification.brinesearch_route_occurrence_candidates_issue97(\n'
||E'          route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,\n'
||E'          source_identity_key,source_digest,mapping_fingerprint,evidence\n'
||E'        )\n'
||E'        select distinct p_step_id,i.id,m.road_id,''exact_authoritative_designation_candidate'',false,\n'
||E'          i.source_identity_key,i.source_digest,\n'
||E'          private_verification.brinesearch_issue97_mapping_fingerprint(i.id),\n'
||E'          pg_catalog.jsonb_build_object(\n'
||E'            ''token'',v_token,''step_kind'',v_step.step_kind,''saved_road_id'',v_step.road_id,\n'
||E'            ''route_number'',i.route_number,\n'
||E'            ''basis'',''saved typed route family + exact route number'',\n'
||E'            ''warning'',''candidate evidence only; graph path still required''\n'
||E'          )\n'
||E'        from public.brinesearch_authoritative_road_identities i\n'
||E'        left join public.brinesearch_road_identity_mappings m\n'
||E'          on m.identity_id=i.id and m.mapping_status=''verified''\n'
||E'        where i.state_code=''OH'' and i.active and i.road_class=v_step.step_kind\n'
||E'          and pg_catalog.lower(coalesce(i.route_number,''''))=pg_catalog.regexp_replace(v_token,''^route[[:space:]]+'','''')\n'
||E'          and private_verification.brinesearch_issue97_dataset_scope_current_cached(\n'
||E'            i.dataset_id,i.state_code,i.county_code\n'
||E'          )\n'
||E'          and i.drivable_status=''drivable'' and i.public_access_status in (''public'',''access'')\n'
||E'        on conflict(route_prep_step_id,identity_id,candidate_basis) do update set\n'
||E'          canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,\n'
||E'          mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();\n'
||E'      end if;\n\n';

  v_definition:=pg_catalog.replace(v_definition,v_marker,v_insert||v_marker);
  execute v_definition;
end
$issue97_patch_oh_structured_candidate_cleanup$;

-- Composed runtime safety proof.
do $issue97_verify_oh_structured_candidate_cleanup$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition not like '%structured maneuver prefix removed before exact authoritative equality%'
     or v_definition not like '%saved typed route family + exact route number%'
     or v_definition not like '%r.road_type=v_step.step_kind%'
     or v_definition not like '%i.road_class=v_step.step_kind%'
     or v_definition not like '%candidate evidence only; graph path still required%'
     or v_definition like '%similarity(%'
     or v_definition like '%<->%'
     or v_definition like '%nearest_road_used'',true%'
  then
    raise exception 'Issue #97 Ohio structured candidate cleanup did not install cleanly';
  end if;
end
$issue97_verify_oh_structured_candidate_cleanup$;
