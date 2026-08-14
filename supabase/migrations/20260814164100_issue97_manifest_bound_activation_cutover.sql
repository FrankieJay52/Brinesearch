-- GitHub #97 — make reviewed manifests/report authoritative at irreversible gates.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

-- Every graph activation must identify the exact audited 38-build candidate
-- manifest. This prevents an individually valid but unaudited replacement build
-- from being activated outside the reviewed checkpoint.
do $issue97_candidate_manifest_activation_gate$
declare v_definition text; v_patched text; v_anchor text; v_insert text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  v_anchor:=$anchor$  if not private_verification.brinesearch_issue97_graph_build_release_current(p_build_id) then$anchor$;
  v_insert:=$insert$  if p_review_details is null
     or pg_catalog.jsonb_typeof(p_review_details)<>'object'
     or coalesce(p_review_details->>'candidate_manifest_digest','')!~'^[0-9a-f]{32}$'
     or nullif(p_review_details->>'reviewed_by','') is null
     or nullif(p_review_details->>'reviewed_at','') is null
     or nullif(p_review_details->>'evidence','') is null
     or not private_verification.brinesearch_issue97_candidate_manifest_authorizes_build(
       p_review_details->>'candidate_manifest_digest',p_build_id
     ) then
    update public.brinesearch_road_graph_builds set details=details||pg_catalog.jsonb_build_object(
      'activation_status','blocked_unreviewed_candidate_manifest'
    ) where id=p_build_id;
    return pg_catalog.jsonb_build_object(
      'build_id',p_build_id,'activated',false,'reason','candidate_manifest_is_not_current_or_does_not_authorize_build'
    );
  end if;

  if not private_verification.brinesearch_issue97_graph_build_release_current(p_build_id) then$insert$;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_anchor,'')))
       /pg_catalog.length(v_anchor)<>1 then
    raise exception 'Issue #97 activation candidate-manifest anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_anchor,v_insert);
  execute v_patched;
end
$issue97_candidate_manifest_activation_gate$;

-- Even the owner-only inner cutover implementation must resolve a real current
-- persisted verification report. Revoking service_role is necessary but not a
-- substitute for a database-enforced release receipt.
do $issue97_inner_cutover_verification_report_gate$
declare v_definition text; v_patched text; v_anchor text; v_insert text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  v_anchor:=$anchor$  -- Freeze all graph/source/mapping/reconciliation generations while the$anchor$;
  v_insert:=$insert$  if not private_verification.brinesearch_issue97_verification_report_current(
       p_review_details->>'verification_report_digest'
     ) then
    raise exception 'Issue #97 cutover verification_report_digest does not resolve to the current persisted release report'
      using errcode='55000';
  end if;

  -- Freeze all graph/source/mapping/reconciliation generations while the$insert$;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_anchor,'')))
       /pg_catalog.length(v_anchor)<>1 then
    raise exception 'Issue #97 inner cutover verification-report anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_anchor,v_insert);
  execute v_patched;
end
$issue97_inner_cutover_verification_report_gate$;

-- The public wrapper verifies the same report before flipping state, then binds
-- the post-flip all-pad Google refresh to that report's exact route denominator.
do $issue97_outer_cutover_verification_report_gate$
declare v_definition text; v_patched text; v_anchor text; v_insert text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_cutover(jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;

  v_anchor:='declare v_result jsonb; v_google jsonb;';
  v_insert:='declare v_result jsonb; v_google jsonb; v_report record; v_eligible integer;';
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_anchor,'')))
       /pg_catalog.length(v_anchor)<>1 then
    raise exception 'Issue #97 public cutover declaration anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_anchor,v_insert);

  v_anchor:=$anchor$begin
  v_result:=public.brinesearch_issue97_activate_cutover_without_google_routes(p_review_details);$anchor$;
  v_insert:=$insert$begin
  if p_review_details is null or pg_catalog.jsonb_typeof(p_review_details)<>'object'
     or coalesce(p_review_details->>'verification_report_digest','')!~'^[0-9a-f]{32}$'
     or not private_verification.brinesearch_issue97_verification_report_current(
       p_review_details->>'verification_report_digest'
     ) then
    raise exception 'Issue #97 public cutover requires a current persisted verification report'
      using errcode='55000';
  end if;
  select report.* into strict v_report
  from private_verification.brinesearch_issue97_verification_reports report
  where report.report_digest=p_review_details->>'verification_report_digest';
  select member_count into strict v_eligible
  from private_verification.brinesearch_issue97_release_manifests
  where id=v_report.route_eligibility_manifest_id and manifest_kind='route_eligibility';

  v_result:=public.brinesearch_issue97_activate_cutover_without_google_routes(p_review_details);$insert$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_anchor,'')))
       /pg_catalog.length(v_anchor)<>1 then
    raise exception 'Issue #97 public cutover report precheck anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_anchor,v_insert);

  v_anchor:=$anchor$    v_google:=public.brinesearch_issue97_refresh_google_routes(null);$anchor$;
  v_insert:=$insert$    v_google:=public.brinesearch_issue97_refresh_google_routes(null);
    if coalesce((v_google->>'processed')::integer,-1)<>v_eligible
       or coalesce((v_google->>'current_pad_scope')::integer,-1)<>v_eligible then
      raise exception 'Issue #97 cutover Google refresh denominator % does not match reviewed route eligibility manifest %',
        v_google,v_eligible using errcode='55000';
    end if;$insert$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_anchor,'')))
       /pg_catalog.length(v_anchor)<>1 then
    raise exception 'Issue #97 public cutover Google denominator anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_anchor,v_insert);

  -- Persisted private receipt accounting must use the same non-list-only scope
  -- as the all-pad refresh, even if an old list-only receipt exists historically.
  v_patched:=pg_catalog.replace(v_patched,
    '(select count(*) from private_verification.brinesearch_google_route_receipts_issue97\n             where status=''ready'')',
    '(select count(*) from private_verification.brinesearch_google_route_receipts_issue97 receipt\n             join public.pads pad on pad.id=receipt.pad_id\n             where coalesce(pad.list_only,false)=false and receipt.status=''ready'')'
  );
  v_patched:=pg_catalog.replace(v_patched,
    '(select count(*) from private_verification.brinesearch_google_route_receipts_issue97\n             where status=''held'')',
    '(select count(*) from private_verification.brinesearch_google_route_receipts_issue97 receipt\n             join public.pads pad on pad.id=receipt.pad_id\n             where coalesce(pad.list_only,false)=false and receipt.status=''held'')'
  );
  execute v_patched;
end
$issue97_outer_cutover_verification_report_gate$;

-- Static runtime safety: no database API role regains direct inner-bypass access.
do $issue97_manifest_bound_gate_verify$
declare v_definition text;
begin
  if pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)','EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)','EXECUTE'
     ) then
    raise exception 'Issue #97 internal release bypass regained service_role execute';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like '%brinesearch_issue97_verification_report_current%'
     or v_definition not like '%verification_report_digest%' then
    raise exception 'Issue #97 inner cutover is not bound to the persisted final verification report';
  end if;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if v_definition not like '%brinesearch_issue97_candidate_manifest_authorizes_build%'
     or v_definition not like '%candidate_manifest_digest%' then
    raise exception 'Issue #97 graph activation is not bound to the audited candidate manifest';
  end if;
end
$issue97_manifest_bound_gate_verify$;
