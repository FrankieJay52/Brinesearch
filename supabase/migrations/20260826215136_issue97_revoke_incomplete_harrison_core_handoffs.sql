-- GitHub #97 — fail-close the incomplete HAMILTON/SPROULL navigation handoffs.
--
-- The frozen OH-799 line remains valid display evidence, but its first waypoint
-- is only the OH-800/OH-799 junction. It does not preserve the reviewed
-- southbound OH-800 approach, and the released geometry stops before Kennedy
-- Ridge. Google can therefore approach the required junction from the wrong
-- side and choose an unreviewed final path. Explicitly revoke both v2 receipts
-- until separately reviewed Freeport and Cadiz variants include their complete
-- ordered approach chains. The junction-only OH-800 ingress and omitted Kennedy Ridge segment
-- are not complete Freeport/Cadiz variants. No release content,
-- graph, route receipt, Google
-- publication, or cutover state is changed.

set local statement_timeout='30s';
set local lock_timeout='3s';

create temporary table issue97_revoke_harrison_core_before on commit drop as
select
  (select pg_catalog.to_jsonb(r)
   from private_verification.brinesearch_v18_core_destination_releases r
   where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4') as lasso_private,
  (select pg_catalog.to_jsonb(r)
   from public.brinesearch_driver_core_destination_releases_public r
   where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4') as lasso_public,
  public.brinesearch_v18_driver_core_destination_release(
    '518659d9-bca2-47b0-b294-3141ba679fc4'
  ) as lasso_driver,
  (select pg_catalog.jsonb_object_agg(r.pad_id::text,pg_catalog.to_jsonb(r))
   from private_verification.brinesearch_v18_core_destination_releases r
   where r.pad_id in (
     'b9a8e55c-3583-4019-85fc-54a03d420ace',
     'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
   )) as target_private,
  (select pg_catalog.jsonb_object_agg(r.pad_id::text,pg_catalog.to_jsonb(r))
   from public.brinesearch_driver_core_destination_releases_public r
   where r.pad_id in (
     'b9a8e55c-3583-4019-85fc-54a03d420ace',
     'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
   )) as target_public,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.concat_ws('|',n.nspname,p.proname,
        pg_catalog.pg_get_functiondef(p.oid),p.proacl::text,p.proconfig::text
      ),'|' order by n.nspname,p.proname
    ))
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where p.proargtypes='2950'::pg_catalog.oidvector
     and (
       (n.nspname='public' and p.proname in (
         'brinesearch_v18_driver_core_destination_release',
         'brinesearch_v18_driver_pad_status_with_google_handoff'
       ))
       or (n.nspname='private_verification' and p.proname in (
         'brinesearch_v18_core_destination_release_receipt_active',
         'brinesearch_v18_core_destination_release_receipt_active_v1_lass',
         'brinesearch_v18_core_destination_release_receipt_active_v2'
       ))
     )) as function_digest,
  (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
   from public.brinesearch_driver_google_routes_public r) as google_routes,
  (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
   from public.brinesearch_driver_google_handoffs_public r) as google_handoffs,
  (select cutover_at from public.brinesearch_issue97_release_state
   where singleton) as cutover_at,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(b)::text,'|' order by b.id::text
    ))
   from public.brinesearch_road_graph_builds b
   where b.state_code='OH' and b.county_name='Harrison') as graph_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(rp)::text,'|' order by rp.id::text
    ))
   from public.brinesearch_route_prep rp
   where rp.id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as route_prep_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(o)::text,'|' order by o.route_prep_id::text,o.occurrence_index
    ))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 o
   where o.route_prep_id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as occurrence_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(t)::text,'|' order by t.route_prep_id::text,t.boundary_index
    ))
   from private_verification.brinesearch_route_transition_receipts_issue97 t
   where t.route_prep_id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as transition_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(g)::text,'|' order by g.route_prep_id::text,g.occurrence_index
    ))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
   where g.route_prep_id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as geometry_digest;

do $preflight$
declare
  v_bundle jsonb;
  v_pad_id uuid;
begin
  if (select count(*)
      from private_verification.brinesearch_v18_core_destination_releases)<>3
     or (select count(*)
         from private_verification.brinesearch_v18_core_destination_releases
         where revoked_at is null)<>3
     or (select count(*)
         from public.brinesearch_driver_core_destination_releases_public)<>3
     or (select count(*)
         from private_verification.brinesearch_v18_core_destination_releases
         where release_version='v18-core-destination-v1')<>1
     or (select count(*)
         from private_verification.brinesearch_v18_core_destination_releases
         where release_version='v18-core-destination-v2')<>2 then
    raise exception 'Core-destination starting counts diverged';
  end if;

  if (select pg_catalog.md5(pg_catalog.to_jsonb(r)::text)
      from private_verification.brinesearch_v18_core_destination_releases r
      where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4')
       <>'ee4ef610318c0f1052d3981c35f78b0a'
     or (select pg_catalog.md5(pg_catalog.to_jsonb(r)::text)
         from public.brinesearch_driver_core_destination_releases_public r
         where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4')
       <>'8fdbb409e148916f4fb1208cf6a97233'
     or (select pg_catalog.md5(pg_catalog.to_jsonb(r)::text)
         from private_verification.brinesearch_v18_core_destination_releases r
         where r.pad_id='b9a8e55c-3583-4019-85fc-54a03d420ace')
       <>'054534784ca2307be3fd8b54699b3700'
     or (select pg_catalog.md5(pg_catalog.to_jsonb(r)::text)
         from public.brinesearch_driver_core_destination_releases_public r
         where r.pad_id='b9a8e55c-3583-4019-85fc-54a03d420ace')
       <>'d48866dfbdbcda5b2f9e8a0240d4efa5'
     or (select pg_catalog.md5(pg_catalog.to_jsonb(r)::text)
         from private_verification.brinesearch_v18_core_destination_releases r
         where r.pad_id='f5a82acf-d7c0-4ce3-ad4e-0de810551450')
       <>'6840392f1a3cf83d696959c6fdc2f20a'
     or (select pg_catalog.md5(pg_catalog.to_jsonb(r)::text)
         from public.brinesearch_driver_core_destination_releases_public r
         where r.pad_id='f5a82acf-d7c0-4ce3-ad4e-0de810551450')
       <>'82f8404a3370945f626f319fb77da705' then
    raise exception 'Frozen release bytes diverged';
  end if;

  foreach v_pad_id in array array[
    'b9a8e55c-3583-4019-85fc-54a03d420ace'::uuid,
    'f5a82acf-d7c0-4ce3-ad4e-0de810551450'::uuid
  ] loop
    if private_verification.brinesearch_v18_core_destination_release_receipt_active(
         v_pad_id
       ) is not true then
      raise exception 'Expected active v2 receipt is absent for %',v_pad_id;
    end if;
    v_bundle:=public.brinesearch_v18_driver_pad_status_with_google_handoff(v_pad_id);
    if v_bundle#>>'{status,route,source}'<>'exact_graph_handoff'
       or v_bundle#>>'{coreDestinationRelease,releaseVersion}'
            <>'v18-core-destination-v2'
       or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
       or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
      raise exception 'Expected incomplete v2 dispatch diverged for %',v_pad_id;
    end if;
  end loop;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or (select count(*) from public.brinesearch_driver_google_handoffs_public)<>1
     or (select cutover_at from public.brinesearch_issue97_release_state
         where singleton) is not null
     or private_verification.brinesearch_issue97_graph_build_release_current(
          'f4e4d43f-e86c-499c-893f-73f2eef3dc29'
        ) is not true then
    raise exception 'Google/cutover/Harrison graph checkpoint diverged';
  end if;
end
$preflight$;

do $revoke$
declare
  v_count integer;
begin
  update private_verification.brinesearch_v18_core_destination_releases
  set revoked_at='2026-08-26T21:45:00Z'::timestamptz
  where pad_id in (
    'b9a8e55c-3583-4019-85fc-54a03d420ace'::uuid,
    'f5a82acf-d7c0-4ce3-ad4e-0de810551450'::uuid
  ) and release_version='v18-core-destination-v2' and revoked_at is null;
  get diagnostics v_count=row_count;
  if v_count<>2 then
    raise exception 'Expected exactly two v2 revocations, changed %',v_count;
  end if;
end
$revoke$;

do $postflight$
declare
  v_before issue97_revoke_harrison_core_before%rowtype;
  v_bundle jsonb;
  v_pad_id uuid;
begin
  select * into strict v_before from issue97_revoke_harrison_core_before;

  if private_verification.brinesearch_v18_core_destination_release_receipt_active(
       '518659d9-bca2-47b0-b294-3141ba679fc4'
     ) is not true
     or (select pg_catalog.to_jsonb(r)
         from private_verification.brinesearch_v18_core_destination_releases r
         where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4')
          is distinct from v_before.lasso_private
     or (select pg_catalog.to_jsonb(r)
         from public.brinesearch_driver_core_destination_releases_public r
         where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4')
          is distinct from v_before.lasso_public
     or public.brinesearch_v18_driver_core_destination_release(
          '518659d9-bca2-47b0-b294-3141ba679fc4'
        ) is distinct from v_before.lasso_driver then
    raise exception 'Frozen LASSO release changed';
  end if;

  foreach v_pad_id in array array[
    'b9a8e55c-3583-4019-85fc-54a03d420ace'::uuid,
    'f5a82acf-d7c0-4ce3-ad4e-0de810551450'::uuid
  ] loop
    if private_verification.brinesearch_v18_core_destination_release_receipt_active(
         v_pad_id
       ) is not false
       or public.brinesearch_v18_driver_core_destination_release(v_pad_id)
            is not null
       or (select revoked_at
           from private_verification.brinesearch_v18_core_destination_releases
           where pad_id=v_pad_id)
            is distinct from '2026-08-26T21:45:00Z'::timestamptz
       or ((select pg_catalog.to_jsonb(r)-'revoked_at'
            from private_verification.brinesearch_v18_core_destination_releases r
            where r.pad_id=v_pad_id)
           is distinct from ((v_before.target_private->(v_pad_id::text))-'revoked_at'))
       or (select pg_catalog.to_jsonb(r)
           from public.brinesearch_driver_core_destination_releases_public r
           where r.pad_id=v_pad_id)
            is distinct from (v_before.target_public->(v_pad_id::text)) then
      raise exception 'Exact one-way revocation failed for %',v_pad_id;
    end if;

    v_bundle:=public.brinesearch_v18_driver_pad_status_with_google_handoff(v_pad_id);
    if v_bundle#>>'{status,route,source}'='exact_graph_handoff'
       or coalesce(v_bundle->'coreDestinationRelease','null'::jsonb)
            is distinct from 'null'::jsonb
       or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
       or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
      raise exception 'Revoked handoff still dispatches for %',v_pad_id;
    end if;
  end loop;

  if (select count(*)
      from private_verification.brinesearch_v18_core_destination_releases)<>3
     or (select count(*)
         from private_verification.brinesearch_v18_core_destination_releases
         where revoked_at is null)<>1
     or (select count(*)
         from public.brinesearch_driver_core_destination_releases_public)<>3
     or (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
         from public.brinesearch_driver_google_routes_public r)
          is distinct from v_before.google_routes
     or (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
         from public.brinesearch_driver_google_handoffs_public r)
          is distinct from v_before.google_handoffs
     or (select cutover_at from public.brinesearch_issue97_release_state
         where singleton) is distinct from v_before.cutover_at then
    raise exception 'Release counts, Google publication, or cutover changed';
  end if;

  if (select pg_catalog.md5(pg_catalog.string_agg(
        pg_catalog.concat_ws('|',n.nspname,p.proname,
          pg_catalog.pg_get_functiondef(p.oid),p.proacl::text,p.proconfig::text
        ),'|' order by n.nspname,p.proname
      ))
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where p.proargtypes='2950'::pg_catalog.oidvector
        and (
          (n.nspname='public' and p.proname in (
            'brinesearch_v18_driver_core_destination_release',
            'brinesearch_v18_driver_pad_status_with_google_handoff'
          ))
          or (n.nspname='private_verification' and p.proname in (
            'brinesearch_v18_core_destination_release_receipt_active',
            'brinesearch_v18_core_destination_release_receipt_active_v1_lass',
            'brinesearch_v18_core_destination_release_receipt_active_v2'
          ))
        )) is distinct from v_before.function_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(b)::text,'|' order by b.id::text
        ))
        from public.brinesearch_road_graph_builds b
        where b.state_code='OH' and b.county_name='Harrison')
          is distinct from v_before.graph_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(rp)::text,'|' order by rp.id::text
        ))
        from public.brinesearch_route_prep rp
        where rp.id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.route_prep_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(o)::text,'|' order by o.route_prep_id::text,o.occurrence_index
        ))
        from private_verification.brinesearch_route_occurrence_receipts_issue97 o
        where o.route_prep_id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.occurrence_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(t)::text,'|' order by t.route_prep_id::text,t.boundary_index
        ))
        from private_verification.brinesearch_route_transition_receipts_issue97 t
        where t.route_prep_id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.transition_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(g)::text,'|' order by g.route_prep_id::text,g.occurrence_index
        ))
        from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
        where g.route_prep_id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.geometry_digest then
    raise exception 'Function, graph, route, or receipt state changed';
  end if;
end
$postflight$;
