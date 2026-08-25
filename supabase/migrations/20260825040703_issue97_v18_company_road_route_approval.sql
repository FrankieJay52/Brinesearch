-- GitHub #97 — distinguish route-specific exact approval from the global
-- canonical-road policy default in the V18 public company-road publisher.
--
-- The publisher already admits only one owner-released current directory,
-- terminal route_ready/ready receipts, exact occurrence geometry, verified
-- mappings, public/drivable identities, active release-current graphs, and a
-- private-dark no-guess Google manifest. Its final occurrence filter also
-- required `brinesearch_roads.approved_by_default`, which is the standing
-- road-wide policy flag. That rejected every traveled COLOGIE occurrence even
-- though the exact primary route had been owner-reviewed and passed the full
-- route-specific authority chain.
--
-- This migration changes the publisher function only. It requires a current
-- owner reviewer on the route preparation and removes the unrelated global
-- road-policy predicate. It also schema-qualifies the two existing PostGIS
-- overlap operators so the reviewed empty search_path remains executable once
-- an occurrence reaches the union/dedupe phase. It does not update a road,
-- receipt, graph, pad, direction, Google row, cutover state, or overlay row.
-- The existing authority-definition digest includes the publisher definition,
-- so every older owner release receipt becomes unusable automatically.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:issue97:v18-company-road-route-approval',97
  )
);

do $issue97_v18_company_road_route_approval$
declare
  v_definition text;
  v_installed_definition text;
  v_before_authority_sha256 text;
  v_after_authority_sha256 text;
  v_old_review_count integer;
  v_old_policy_count integer;
  v_old_link_overlap_count integer;
  v_old_dedupe_overlap_count integer;
  v_expected_definition_md5 constant text:=
    'e6fd290966ff75f24f2c99d471127bd6';
  v_old_review constant text:=E'    and route.readiness_status=''ready_for_road_matching''\n    and receipt.route_status=''route_ready'' and receipt.stage=''ready''';
  v_new_review constant text:=E'    and route.readiness_status=''ready_for_road_matching''\n    and route.reviewed_by is not null\n    and route.reviewed_at is not null\n    and private_verification.brinesearch_v18_owner_authority_current(\n      route.reviewed_by\n    )\n    and receipt.route_status=''route_ready'' and receipt.stage=''ready''';
  v_old_policy constant text:=
    '    and coalesce(road.approved_by_default,false)';
  v_old_link_overlap constant text:=
    'occurrence.step_geometry&&part.part_geometry';
  v_new_link_overlap constant text:=
    'occurrence.step_geometry operator(extensions.&&) part.part_geometry';
  v_old_dedupe_overlap constant text:=
    'right_row.part_geometry&&left_row.part_geometry';
  v_new_dedupe_overlap constant text:=
    'right_row.part_geometry operator(extensions.&&) left_row.part_geometry';
begin
  if (select pg_catalog.count(*)
      from public.brinesearch_company_road_overlay_snapshots_v18)<>0
     or (select pg_catalog.count(*)
         from public.brinesearch_company_road_overlay_rows_v18)<>0 then
    raise exception
      'Issue #97 company-road approval correction requires the proven unpublished overlay baseline';
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()'::
      pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>v_expected_definition_md5 then
    raise exception
      'Issue #97 company-road publisher drifted: expected %, observed %',
      v_expected_definition_md5,pg_catalog.md5(v_definition);
  end if;

  v_old_review_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_review,'')))
    /pg_catalog.length(v_old_review);
  v_old_policy_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_policy,'')))
    /pg_catalog.length(v_old_policy);
  v_old_link_overlap_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_link_overlap,'')))
    /pg_catalog.length(v_old_link_overlap);
  v_old_dedupe_overlap_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_dedupe_overlap,'')))
    /pg_catalog.length(v_old_dedupe_overlap);
  if v_old_review_count<>1 or v_old_policy_count<>1
     or v_old_link_overlap_count<>1 or v_old_dedupe_overlap_count<>1 then
    raise exception
      'Issue #97 company-road publisher patch points drifted: review %, policy %, link overlap %, dedupe overlap %',
      v_old_review_count,v_old_policy_count,
      v_old_link_overlap_count,v_old_dedupe_overlap_count;
  end if;

  v_before_authority_sha256:=
    private_verification.brinesearch_v18_company_road_authority_definition_sha256();
  if v_before_authority_sha256!~'^[0-9a-f]{64}$' then
    raise exception 'Issue #97 company-road pre-change authority digest is unavailable';
  end if;

  v_definition:=pg_catalog.replace(v_definition,v_old_review,v_new_review);
  v_definition:=pg_catalog.replace(v_definition,v_old_policy,'');
  v_definition:=pg_catalog.replace(
    v_definition,v_old_link_overlap,v_new_link_overlap
  );
  v_definition:=pg_catalog.replace(
    v_definition,v_old_dedupe_overlap,v_new_dedupe_overlap
  );
  execute v_definition;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()'::
      pg_catalog.regprocedure
  ) into strict v_installed_definition;
  if pg_catalog.strpos(v_installed_definition,v_new_review)=0
     or pg_catalog.strpos(v_installed_definition,v_old_review)>0
     or pg_catalog.strpos(v_installed_definition,v_old_policy)>0
     or pg_catalog.strpos(v_installed_definition,v_old_link_overlap)>0
     or pg_catalog.strpos(v_installed_definition,v_old_dedupe_overlap)>0
     or pg_catalog.strpos(v_installed_definition,v_new_link_overlap)=0
     or pg_catalog.strpos(v_installed_definition,v_new_dedupe_overlap)=0
     or pg_catalog.strpos(v_installed_definition,
       'receipt.route_status=''route_ready'' and receipt.stage=''ready''')=0
     or pg_catalog.strpos(v_installed_definition,
       'google.evidence->>''publication_mode''=''private_dark''')=0
     or pg_catalog.strpos(v_installed_definition,
       'coalesce((google.evidence->>''no_guess'')::boolean,false)')=0
     or pg_catalog.strpos(v_installed_definition,
       'identity.public_access_status=''public''')=0
     or pg_catalog.strpos(v_installed_definition,
       'identity.drivable_status=''drivable''')=0
     or pg_catalog.strpos(v_installed_definition,
       'mapping.mapping_status=''verified''')=0
     or pg_catalog.strpos(v_installed_definition,
       'road.verification_status=''verified''')=0
     or pg_catalog.strpos(v_installed_definition,
       'not coalesce(road.candidate_only,false)')=0
     or pg_catalog.strpos(v_installed_definition,
       'geometry.status=''resolved'' and geometry.hold_reason is null')=0
     or (pg_catalog.length(v_installed_definition)-pg_catalog.length(
       pg_catalog.replace(v_installed_definition,
         'private_verification.brinesearch_v18_owner_authority_current(','')))
       /pg_catalog.length(
         'private_verification.brinesearch_v18_owner_authority_current(')
       <>4 then
    raise exception 'Issue #97 route-specific approval publisher patch failed';
  end if;

  v_after_authority_sha256:=
    private_verification.brinesearch_v18_company_road_authority_definition_sha256();
  if v_after_authority_sha256!~'^[0-9a-f]{64}$'
     or v_after_authority_sha256=v_before_authority_sha256 then
    raise exception
      'Issue #97 publisher correction did not rotate the authority digest';
  end if;

  if not exists(
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid=
      'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()'::
        pg_catalog.regprocedure
      and procedure.prosecdef
      and procedure.provolatile='v'
      and procedure.proowner='postgres'::pg_catalog.regrole
      and 'search_path=""'=any(procedure.proconfig)
      and 'statement_timeout=14min'=any(procedure.proconfig)
      and 'lock_timeout=30s'=any(procedure.proconfig)
  )
     or exists(
       select 1
       from information_schema.routine_privileges privilege
       where privilege.specific_schema='private_verification'
         and privilege.routine_name=
           'brinesearch_v18_refresh_company_road_overlay_snapshot'
         and privilege.grantee='PUBLIC'
         and privilege.privilege_type='EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()',
       'EXECUTE'
     ) then
    raise exception 'Issue #97 company-road publisher execution boundary changed';
  end if;
end;
$issue97_v18_company_road_route_approval$;

comment on function
  private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()
is 'Service-only V18 company-road publisher gated by one unexpired, one-shot authenticated-owner release receipt. Only owner-reviewed terminal route-ready exact geometry on active/current graphs, public/drivable authoritative identities, and verified non-candidate mappings can enter the immutable public overlay. Global road-policy defaults remain separate and are never mutated here.';

do $issue97_v18_company_road_route_approval_no_side_effects$
begin
  if (select pg_catalog.count(*)
      from public.brinesearch_company_road_overlay_snapshots_v18)<>0
     or (select pg_catalog.count(*)
         from public.brinesearch_company_road_overlay_rows_v18)<>0 then
    raise exception 'Issue #97 company-road correction published an overlay';
  end if;
end;
$issue97_v18_company_road_route_approval_no_side_effects$;
