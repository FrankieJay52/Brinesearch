-- GitHub #97 — bind the reviewed saved-road source generation to pad destination GPS.
--
-- 20260814160000 deliberately removed pads.updated_at because unrelated pad
-- metadata edits made that timestamp-sensitive source digest unstable. Independent
-- Grok review correctly identified the remaining blind spot: latitude/longitude
-- are routing-critical and must not be allowed to change without invalidating the
-- reviewed saved-road source generation. The transition-Google dependency already
-- hashes the same coordinates at 7 decimal places and requires the final resolved
-- occurrence to end within one metre of saved pad GPS. This forward migration
-- adds that same rounded destination GPS to the saved-road pad token itself.
-- alternate_locations is not a navigation destination in the #97 route pipeline
-- and is therefore intentionally not part of this source token.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')
);

do $issue97_saved_source_gps_runtime$
declare
  v_definition text;
  v_patched text;
  v_effective_definition text;
  v_old text;
  v_new text;
  v_owner oid;
  v_acl pg_catalog.aclitem[];
  v_security_definer boolean;
  v_volatility text;
  v_config text[];
  v_effective_owner oid;
  v_effective_acl pg_catalog.aclitem[];
  v_effective_security_definer boolean;
  v_effective_volatility text;
  v_effective_config text[];
begin
  select pg_catalog.pg_get_functiondef(p.oid),p.proowner,p.proacl,p.prosecdef,
         p.provolatile::text,p.proconfig
  into strict v_definition,v_owner,v_acl,v_security_definer,v_volatility,v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private_verification'
    and p.proname='brinesearch_issue97_saved_road_source_digest'
    and p.oid='private_verification.brinesearch_issue97_saved_road_source_digest()'
      ::pg_catalog.regprocedure;

  if pg_catalog.md5(v_definition)<>'ebcacb4b049483fdc48cfcf04dc97dad' then
    raise exception 'Issue #97 route-semantic v2 source digest changed before GPS binding';
  end if;
  if private_verification.brinesearch_issue97_saved_road_source_digest()
       <>'cb49d2f5912019abfefe553337860b61' then
    raise exception 'Issue #97 route-semantic v2 source generation changed before GPS binding';
  end if;

  v_old:=$old$      p.structured_route_steps::text,p.driver_safety_context::text))$old$;
  v_new:=$new$      p.structured_route_steps::text,p.driver_safety_context::text,
      coalesce(pg_catalog.round(p.latitude::numeric,7)::text,''),
      coalesce(pg_catalog.round(p.longitude::numeric,7)::text,'')))$new$;
  if (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 route-semantic v2 pad-token anchor changed before GPS binding';
  end if;
  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);
  if pg_catalog.md5(v_patched)<>'927896ee5fd992bfe18eb21774559101' then
    raise exception 'Issue #97 GPS-bound saved-road source patch is not the reviewed definition';
  end if;

  execute v_patched;

  select pg_catalog.pg_get_functiondef(p.oid),p.proowner,p.proacl,p.prosecdef,
         p.provolatile::text,p.proconfig
  into strict v_effective_definition,v_effective_owner,v_effective_acl,
       v_effective_security_definer,v_effective_volatility,v_effective_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private_verification'
    and p.proname='brinesearch_issue97_saved_road_source_digest'
    and p.oid='private_verification.brinesearch_issue97_saved_road_source_digest()'
      ::pg_catalog.regprocedure;

  if pg_catalog.md5(v_effective_definition)<>'927896ee5fd992bfe18eb21774559101'
     or private_verification.brinesearch_issue97_saved_road_source_digest()
          <>'2ad7b559ddd3394265643abd8a5a01a7'
     or v_effective_owner is distinct from v_owner
     or v_effective_acl is distinct from v_acl
     or v_effective_security_definer is distinct from v_security_definer
     or v_effective_volatility is distinct from v_volatility
     or v_effective_config is distinct from v_config
     or v_effective_definition not like
       '%coalesce(pg_catalog.round(p.latitude::numeric, 7)::text, '''')%'
     or v_effective_definition not like
       '%coalesce(pg_catalog.round(p.longitude::numeric, 7)::text, '''')%'
     or v_effective_definition like
       '%p.driver_safety_context::text,p.updated_at::text%' then
    raise exception 'Issue #97 GPS-bound saved-road source digest did not install exactly';
  end if;
end
$issue97_saved_source_gps_runtime$;

-- 20260814160000 must already have persisted the exact independently reviewed
-- 16,111 occurrence-key baseline. This migration changes only source-generation
-- currentness, never the occurrence count or immutable inventory digest.
do $issue97_saved_gps_baseline_precheck$
declare
  v_baseline record;
begin
  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;
  if v_baseline.expected_occurrence_count<>16111
     or v_baseline.expected_inventory_digest<>'4825b5291ea682af7f659130cd735838'
     or v_baseline.review_details->>'source_digest'<>'cb49d2f5912019abfefe553337860b61'
     or v_baseline.review_details->>'source_digest_function_md5'
          <>'ebcacb4b049483fdc48cfcf04dc97dad'
     or v_baseline.review_details->>'verification_report_digest'
          <>'4668be7f41b420225c0ae7261ac19b71'
     or pg_catalog.md5((v_baseline.review_details->'verification_report')::text)
          <>'4668be7f41b420225c0ae7261ac19b71' then
    raise exception 'Issue #97 reviewed 16,111 route-semantic v2 baseline changed before GPS binding';
  end if;
  if (select count(*) from private_verification.brinesearch_issue97_saved_road_reconciliation_runs)<>0 then
    raise exception 'Issue #97 saved-road reconciliation history appeared before GPS-bound baseline migration';
  end if;
end
$issue97_saved_gps_baseline_precheck$;

update private_verification.brinesearch_issue97_saved_road_release_baseline
set review_details =
  (review_details
    || pg_catalog.jsonb_build_object(
      'reviewed_by','ChatGPT independent current-production reconciliation plus Grok GPS-currentness challenge',
      'reviewed_at','2026-08-15T02:33:00Z',
      'verification_report_digest','6cb07ec60d0e84fbc3f443721eefa242',
      'source_digest','2ad7b559ddd3394265643abd8a5a01a7',
      'source_digest_algorithm','route-semantic-v3-gps-bound: ordered saved-road source tokens; pad token includes structured_road_sequence, written_directions, directions_clear, structured_route_steps, driver_safety_context, and saved pad latitude/longitude rounded to 7 decimals; pads.updated_at excluded',
      'source_digest_function_md5','927896ee5fd992bfe18eb21774559101',
      'prior_route_semantic_v2_source_digest','cb49d2f5912019abfefe553337860b61'
    ))
  || pg_catalog.jsonb_build_object(
    'verification_report',
    (review_details->'verification_report')
      || pg_catalog.jsonb_build_object(
        'review','issue97_saved_road_semantic_source_v3_gps_bound',
        'reviewed_at','2026-08-15T02:33:00Z',
        'prior_route_semantic_v2_digest','cb49d2f5912019abfefe553337860b61',
        'semantic_source_digest','2ad7b559ddd3394265643abd8a5a01a7',
        'pad_destination_gps_precision_decimals',7
      )
  ),
  populated_at=pg_catalog.clock_timestamp()
where singleton;

-- Verify the exact GPS-bound baseline and independently prove that the existing
-- transition-Google dependency is aligned to the same 7-decimal destination GPS.
do $issue97_saved_gps_baseline_verify$
declare
  v_baseline record;
  v_source_definition text;
  v_google_dependency text;
begin
  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline
  where singleton;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_saved_road_source_digest()'
      ::pg_catalog.regprocedure
  ) into strict v_source_definition;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_transition_google_dependency(uuid)'
      ::pg_catalog.regprocedure
  ) into strict v_google_dependency;

  if v_baseline.expected_occurrence_count<>16111
     or v_baseline.expected_inventory_digest<>'4825b5291ea682af7f659130cd735838'
     or v_baseline.review_details->>'source_digest'<>'2ad7b559ddd3394265643abd8a5a01a7'
     or v_baseline.review_details->>'source_digest_function_md5'
          <>'927896ee5fd992bfe18eb21774559101'
     or v_baseline.review_details->>'verification_report_digest'
          <>'6cb07ec60d0e84fbc3f443721eefa242'
     or pg_catalog.md5((v_baseline.review_details->'verification_report')::text)
          <>'6cb07ec60d0e84fbc3f443721eefa242'
     or v_baseline.review_details->'verification_report'->>'review'
          <>'issue97_saved_road_semantic_source_v3_gps_bound'
     or (v_baseline.review_details->'verification_report'->>'pad_destination_gps_precision_decimals')::integer<>7
     or pg_catalog.md5(v_source_definition)<>'927896ee5fd992bfe18eb21774559101'
     or private_verification.brinesearch_issue97_saved_road_source_digest()
          <>'2ad7b559ddd3394265643abd8a5a01a7'
     or v_source_definition not like
       '%pg_catalog.round(p.latitude::numeric, 7)%'
     or v_source_definition not like
       '%pg_catalog.round(p.longitude::numeric, 7)%'
     or v_google_dependency not like
       '%pg_catalog.round(v_pad.latitude::numeric, 7)::text%'
     or v_google_dependency not like
       '%pg_catalog.round(v_pad.longitude::numeric, 7)::text%' then
    raise exception 'Issue #97 GPS-bound saved-road currentness verification failed';
  end if;
end
$issue97_saved_gps_baseline_verify$;
