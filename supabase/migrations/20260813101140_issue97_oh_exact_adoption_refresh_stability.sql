-- GitHub #97 — preserve independently verified Ohio canonical-adoption
-- mappings as first-class exact candidates during county refresh.
--
-- The generic refresher cannot reproduce nine adopted suffix/extension route
-- family identities and chooses a different exact method for three more. Those
-- mappings were established from exact ODOT identity components by migrations
-- 438/440/445. Revalidate that complete proof against current source + Road
-- Manager truth before retiring, then UNION it into the normal candidate set.
-- A second road remains an ambiguity hold; changed source/road/proof simply
-- fails retention and the existing generic fail-closed behavior controls.

do $issue97_patch_oh_adoption_candidates$
declare
  v_definition text;
  v_old_scope text:=E'  update public.brinesearch_road_identity_mappings m set';
  v_new_scope text:=E'  drop table if exists pg_temp.tmp_issue97_oh_prior_exact_mappings;\n'
    ||E'  create temporary table tmp_issue97_oh_prior_exact_mappings on commit drop as\n'
    ||E'  select m.*\n'
    ||E'  from public.brinesearch_road_identity_mappings m\n'
    ||E'  join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id\n'
    ||E'  where i.active and i.state_code=''OH'' and i.county_code=v_county\n'
    ||E'    and m.mapping_method in (''exact_source_record_id'',''exact_route_designation'')\n'
    ||E'    and m.mapping_status in (''verified'',''candidate'');\n\n'
    ||E'  update public.brinesearch_road_identity_mappings m set';
  v_old_candidate text:=E'  ), raw_candidates as (\n'
    ||E'    select i.id as identity_id,r.id as road_id,0 as priority,';
  v_new_candidate text:=E'  ), retained_adoption_candidates as (\n'
    ||E'    select i.id as identity_id,r.id as road_id,-1 as priority,\n'
    ||E'      ''exact_route_designation''::text as method,\n'
    ||E'      (prior.evidence-''retired_by_refresh'')||\n'
    ||E'        pg_catalog.jsonb_build_object(''refresh_scope'',''OH:''||v_county) as evidence\n'
    ||E'    from scope_identities i\n'
    ||E'    join tmp_issue97_oh_prior_exact_mappings prior\n'
    ||E'      on prior.identity_id=i.id and prior.mapping_status=''verified''\n'
    ||E'      and prior.mapping_method=''exact_route_designation''\n'
    ||E'    join public.brinesearch_roads r on r.id=prior.road_id\n'
    ||E'    where i.public_access_status=''public'' and i.drivable_status=''drivable''\n'
    ||E'      and private_verification.brinesearch_issue97_dataset_scope_current(\n'
    ||E'        i.dataset_id,i.state_code,i.county_code\n'
    ||E'      )\n'
    ||E'      and r.verification_status=''verified'' and not r.candidate_only\n'
    ||E'      and r.road_type=i.road_class\n'
    ||E'      and ((i.road_class=''us_route'' and r.state is null)\n'
    ||E'        or (i.road_class=''state_route'' and r.state=''OH''))\n'
    ||E'      and r.geometry_status=''official_centerline_loaded''\n'
    ||E'      and r.source_method=''issue97_oh_exact_route_family''\n'
    ||E'      and r.source_agency=''Ohio Department of Transportation''\n'
    ||E'      and r.source_dataset=''Road Inventory''\n'
    ||E'      and r.candidate_basis @> pg_catalog.jsonb_build_object(\n'
    ||E'        ''issue'',97,''scope'',''OH-only'',''adoption'',''exact_route_family''\n'
    ||E'      )\n'
    ||E'      and pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(\n'
    ||E'        coalesce(r.route_number,''''),''[^0-9A-Z]'','''',''g'')),''^0+'','''')\n'
    ||E'        =pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(\n'
    ||E'          coalesce(i.route_number,''''),''[^0-9A-Z]'','''',''g'')),''^0+'','''')\n'
    ||E'      and prior.evidence->>''issue''=''97''\n'
    ||E'      and prior.evidence->>''scope''=''OH-only''\n'
    ||E'      and prior.evidence->>''state_code''=''OH''\n'
    ||E'      and prior.evidence->>''source_identity_key''=i.source_identity_key\n'
    ||E'      and prior.evidence->>''source_digest''=i.source_digest\n'
    ||E'      and prior.evidence->>''source_current''=''true''\n'
    ||E'      and prior.evidence->>''exact_designation''=''true''\n'
    ||E'      and prior.evidence->>''name_matching_used''=''false''\n'
    ||E'      and prior.evidence->>''fuzzy_matching_used''=''false''\n'
    ||E'      and prior.evidence->>''nearest_road_used''=''false''\n'
    ||E'      and not (prior.evidence ? ''retired_by_refresh'')\n'
    ||E'      and coalesce((prior.evidence->>''uses_name_only'')::boolean,false)=false\n'
    ||E'      and coalesce((prior.evidence->>''uses_fuzzy_name'')::boolean,false)=false\n'
    ||E'      and coalesce((prior.evidence->>''uses_nearest_road'')::boolean,false)=false\n'
    ||E'      and prior.evidence->>''road_class''=i.road_class\n'
    ||E'      and prior.evidence->>''route_number''=i.route_number\n'
    ||E'      and (\n'
    ||E'        (prior.evidence->>''migration''=''issue97_oh_route_used_canonical_adoption''\n'
    ||E'          and (i.road_class,i.route_number) in (\n'
    ||E'            (''us_route'',''22''),(''state_route'',''43''),\n'
    ||E'            (''state_route'',''145''),(''state_route'',''151''),\n'
    ||E'            (''state_route'',''164'')\n'
    ||E'          ))\n'
    ||E'        or (prior.evidence->>''migration''=''issue97_oh_us40_canonical_adoption''\n'
    ||E'          and i.road_class=''us_route'' and i.route_number=''40'')\n'
    ||E'        or (prior.evidence->>''migration''=''issue97_oh_sr331_canonical_adoption''\n'
    ||E'          and i.road_class=''state_route'' and i.route_number=''331'')\n'
    ||E'      )\n'
    ||E'  ), raw_candidates as (\n'
    ||E'    select retained.identity_id,retained.road_id,retained.priority,\n'
    ||E'      retained.method,retained.evidence\n'
    ||E'    from retained_adoption_candidates retained\n\n'
    ||E'    union all\n\n'
    ||E'    select i.id as identity_id,r.id as road_id,0 as priority,';
  v_old_evidence text:=
    'e.evidence||pg_catalog.jsonb_build_object('||
    '''exact_candidate_count'',e.candidate_count,'||
    '''ambiguity_held'',e.candidate_count>1,'||
    '''refresh_scope'',''OH:''||v_county),';
  v_new_evidence text:=E'    case when e.priority=-1 and e.candidate_count=1 then e.evidence\n'
    ||E'      else e.evidence||pg_catalog.jsonb_build_object(\n'
    ||E'        ''exact_candidate_count'',e.candidate_count,\n'
    ||E'        ''ambiguity_held'',e.candidate_count>1,\n'
    ||E'        ''refresh_scope'',''OH:''||v_county\n'
    ||E'      ) end,';
  v_count integer;
  v_normalized text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_exact_mappings_oh(text)'::
      pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%tmp_issue97_oh_prior_exact_mappings%'
     and v_definition like '%retained_adoption_candidates%' then
    null;
  else
    v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
      pg_catalog.replace(v_definition,v_old_scope,'')
    ))/pg_catalog.length(v_old_scope);
    if v_count<>1 then
      raise exception 'Issue #97 Ohio prior-mapping snapshot target changed: %',v_count;
    end if;
    v_definition:=pg_catalog.replace(v_definition,v_old_scope,v_new_scope);

    v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
      pg_catalog.replace(v_definition,v_old_candidate,'')
    ))/pg_catalog.length(v_old_candidate);
    if v_count<>1 then
      raise exception 'Issue #97 Ohio exact-candidate target changed: %',v_count;
    end if;
    v_definition:=pg_catalog.replace(v_definition,v_old_candidate,v_new_candidate);

    v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
      pg_catalog.replace(v_definition,v_old_evidence,'')
    ))/pg_catalog.length(v_old_evidence);
    if v_count<>1 then
      raise exception 'Issue #97 Ohio exact-evidence target changed: %',v_count;
    end if;
    v_definition:=pg_catalog.replace(v_definition,v_old_evidence,v_new_evidence);
    execute v_definition;
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_exact_mappings_oh(text)'::
      pg_catalog.regprocedure
  ) into v_definition;
  v_normalized:=pg_catalog.lower(pg_catalog.regexp_replace(
    v_definition,'[[:space:]]+','','g'
  ));
  if v_normalized not like '%createtemporarytabletmp_issue97_oh_prior_exact_mappingsoncommitdrop%'
     or v_normalized not like '%droptableifexistspg_temp.tmp_issue97_oh_prior_exact_mappings%'
     or v_normalized not like '%retained_adoption_candidates%'
     or v_normalized not like '%casewhene.priority=-1ande.candidate_count=1thene.evidence%'
     or v_normalized not like '%prior.mapping_status=''verified''%'
     or v_normalized not like '%prior.mapping_method=''exact_route_designation''%'
     or v_normalized not like '%prior.evidence->>''source_digest''=i.source_digest%'
     or v_normalized not like '%brinesearch_issue97_dataset_scope_current(%'
     or v_normalized not like '%r.verification_status=''verified''%'
     or v_normalized not like '%notr.candidate_only%'
     or v_normalized not like '%i.road_class=''us_route''andr.stateisnull%'
     or v_normalized not like '%r.geometry_status=''official_centerline_loaded''%'
     or v_normalized not like '%r.source_method=''issue97_oh_exact_route_family''%'
     or v_normalized not like '%r.source_agency=''ohiodepartmentoftransportation''%'
     or v_normalized not like '%r.source_dataset=''roadinventory''%'
     or v_normalized not like '%''adoption'',''exact_route_family''%'
     or v_normalized not like '%issue97_oh_us40_canonical_adoption%'
     or v_normalized not like '%issue97_oh_sr331_canonical_adoption%'
     or v_normalized not like '%issue97_oh_route_used_canonical_adoption%'
     or v_normalized like '%similarity(%'
     or v_normalized like '%<->%'
  then
    raise exception 'Issue #97 adoption-stable Ohio mapping refresher did not install cleanly';
  end if;
end
$issue97_patch_oh_adoption_candidates$;
