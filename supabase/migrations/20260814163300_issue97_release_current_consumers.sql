-- GitHub #97 — continuation of explicit topology/release currentness rollout.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

do $issue97_activation_release_gate$
declare v_definition text; v_patched text; v_old text; v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'dd7d177f2de7436369fe95662295a9a8' then
    raise exception 'Issue #97 activation definition changed before release-current gate';
  end if;
  v_old:=$old$  perform j.id from public.brinesearch_road_junctions j
  where j.build_id=p_build_id order by j.id for share;$old$;
  v_new:=$new$  if not private_verification.brinesearch_issue97_graph_build_release_current(p_build_id) then
    update public.brinesearch_road_graph_builds set details=details||pg_catalog.jsonb_build_object(
      'activation_status','blocked_release_generation_not_current'
    ) where id=p_build_id;
    return pg_catalog.jsonb_build_object(
      'build_id',p_build_id,'activated',false,'reason','release_generation_is_not_current'
    );
  end if;

  perform j.id from public.brinesearch_road_junctions j
  where j.build_id=p_build_id order by j.id for share;$new$;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 activation release-current anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_patched;
end
$issue97_activation_release_gate$;

-- Replace source/mapping-only currentness at every topology/release consumer.
-- The original helper remains available for explicitly source-only diagnostics.
do $issue97_release_current_consumers$
declare
  v_signature text;
  v_definition text;
  v_patched text;
  v_direct_signatures text[]:=array[
    'private_verification.brinesearch_issue97_refresh_google_route_published_core(uuid)',
    'private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)',
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)',
    'public.brinesearch_authoritative_road_connection_pair(uuid,uuid)',
    'public.brinesearch_authoritative_road_connections(uuid,jsonb,integer)',
    'public.brinesearch_authoritative_road_connections_for_canonical(uuid,jsonb,integer)',
    'public.brinesearch_authoritative_road_registry()',
    'public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)',
    'public.brinesearch_issue97_google_route_current_published_core(uuid)',
    'public.brinesearch_issue97_refresh_saved_road_reconciliation()',
    'public.brinesearch_publish_structured_route_issue97_without_google(uuid,uuid,jsonb,bigint)',
    'public.brinesearch_route_step_boundary_candidates(uuid,uuid,jsonb,integer)'
  ];
  v_cached_signatures text[]:=array[
    'private_verification.brinesearch_issue97_identities_connected(uuid,uuid)'
  ];
  v_prepare_signatures text[]:=array[
    'private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)',
    'public.brinesearch_issue97_reconcile_route_corpus(uuid)'
  ];
begin
  foreach v_signature in array v_direct_signatures loop
    select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature)) into strict v_definition;
    v_patched:=pg_catalog.replace(v_definition,
      'private_verification.brinesearch_issue97_graph_build_sources_current(',
      'private_verification.brinesearch_issue97_graph_build_release_current('
    );
    if v_patched=v_definition then
      raise exception 'Issue #97 release-current direct consumer anchor missing: %',v_signature;
    end if;
    execute v_patched;
  end loop;

  foreach v_signature in array v_cached_signatures loop
    select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature)) into strict v_definition;
    v_patched:=pg_catalog.replace(v_definition,
      'private_verification.brinesearch_issue97_graph_build_sources_current_cached(',
      'private_verification.brinesearch_issue97_graph_build_release_current_cached('
    );
    if v_patched=v_definition then
      raise exception 'Issue #97 release-current cached consumer anchor missing: %',v_signature;
    end if;
    execute v_patched;
  end loop;

  foreach v_signature in array v_prepare_signatures loop
    select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature)) into strict v_definition;
    v_patched:=pg_catalog.replace(v_definition,
      'private_verification.brinesearch_issue97_prepare_graph_current_cache()',
      'private_verification.brinesearch_issue97_prepare_graph_release_current_cache()'
    );
    if v_patched=v_definition then
      raise exception 'Issue #97 release-current cache-prep consumer anchor missing: %',v_signature;
    end if;
    execute v_patched;
  end loop;
end
$issue97_release_current_consumers$;

-- Global cutover must bind the exact reviewed 39-county and 114-scope manifests,
-- not only their counts. This is separate from per-graph release-currentness.
do $issue97_cutover_release_manifest_gate$
declare v_definition text; v_old text; v_new text; v_patched text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_cutover_without_google_routes(jsonb)'::pg_catalog.regprocedure
  ) into strict v_definition;
  v_old:=$old$  if p_review_details is null or pg_catalog.jsonb_typeof(p_review_details)<>'object'$old$;
  v_new:=$new$  if not private_verification.brinesearch_issue97_release_manifest_current() then
    raise exception 'Issue #97 cutover exact county/source-scope release manifest changed' using errcode='55000';
  end if;
  if p_review_details is null or pg_catalog.jsonb_typeof(p_review_details)<>'object'$new$;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 cutover release-manifest gate anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_patched;
end
$issue97_cutover_release_manifest_gate$;

-- Verify fail-closed state: OHI is the only pre-existing graph deliberately
-- qualified; stale-generation Ohio graphs must not be silently accepted.
do $issue97_release_current_verify$
declare v_ohi integer; v_frozen integer;
begin
  if not private_verification.brinesearch_issue97_release_manifest_current() then
    raise exception 'Issue #97 exact county/source-scope release manifest failed';
  end if;
  select count(*)::integer into v_ohi
  from public.brinesearch_road_graph_builds b
  where b.state_code='WV' and b.county_code='OHI' and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id);
  if v_ohi<>1 then raise exception 'Issue #97 OHI release qualification failed'; end if;

  select count(*)::integer into v_frozen
  from public.brinesearch_road_graph_builds b
  where b.state_code='OH' and b.county_code in ('BEL','JEF','NOB') and b.status='active'
    and private_verification.brinesearch_issue97_graph_build_release_current(b.id);
  if v_frozen<>0 then
    raise exception 'Issue #97 stale-generation BEL/JEF/NOB graphs were silently grandfathered';
  end if;

  if not exists(select 1 from pg_catalog.pg_trigger t
    where t.tgrelid='public.brinesearch_road_graph_builds'::pg_catalog.regclass
      and t.tgname='brinesearch_issue97_stamp_graph_release_receipt' and t.tgenabled<>'D') then
    raise exception 'Issue #97 graph release receipt trigger is missing';
  end if;
end
$issue97_release_current_verify$;
