-- GitHub #97 — continuation of explicit topology/release currentness rollout.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

do $issue97_qualify_ohi$
declare
  v_build record;
  v_generation text;
  v_content text;
  v_mapping_digest text;
  v_possum_memberships integer;
begin
  select * into strict v_build
  from public.brinesearch_road_graph_builds
  where state_code='WV' and county_code='OHI' and status='active'
    and graph_digest='a14358e638db5d01ca2ac07fef35e357'
    and source_revision_digest='06f8d4f4ea6396058342178ecb159b6c'
    and point_junction_count=2587 and shared_segment_count=61 and membership_count=5977;
  if not private_verification.brinesearch_issue97_graph_build_sources_current(v_build.id) then
    raise exception 'Issue #97 OHI compatibility candidate is no longer source/mapping current';
  end if;
  if coalesce((v_build.details->>'held_junction_count')::integer,-1)<>513 then
    raise exception 'Issue #97 OHI held-junction receipt changed';
  end if;
  if exists(select 1 from public.brinesearch_road_junctions j
      where j.build_id=v_build.id and j.junction_type='shared_segment'
        and pg_catalog.jsonb_typeof(j.source_provenance->'source_segment_keys_by_identity') is distinct from 'object')
     or exists(select 1 from public.brinesearch_road_junction_memberships m
      join public.brinesearch_road_junctions j on j.id=m.junction_id
      where j.build_id=v_build.id and j.junction_type='shared_segment'
        and pg_catalog.cardinality(m.source_segment_keys)=0) then
    raise exception 'Issue #97 OHI compatibility candidate lacks final shared provenance';
  end if;

  select count(*)::integer into v_possum_memberships
  from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id and j.build_id=v_build.id
  join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
  where i.source_identity_key in (
    'PA:PENNDOT:LOCAL:62:2049:110961:EJM9',
    'PA:PENNDOT:LOCAL:62:2061:107905:EHBS'
  );
  if v_possum_memberships<>0 then
    raise exception 'Issue #97 OHI compatibility review unexpectedly intersects the rematerialized Possum identities';
  end if;

  v_content:=private_verification.brinesearch_issue97_graph_source_content_digest(v_build.id);
  if coalesce(v_content,'')!~'^[0-9a-f]{32}$' then
    raise exception 'Issue #97 OHI compatibility source content receipt is incomplete';
  end if;
  v_mapping_digest:=v_build.details->>'mapping_snapshot_digest';
  if coalesce(v_mapping_digest,'')!~'^[0-9a-f]{32}$' then
    raise exception 'Issue #97 OHI compatibility mapping digest is incomplete';
  end if;
  v_generation:=private_verification.brinesearch_issue97_active_graph_release_generation();

  insert into private_verification.brinesearch_issue97_graph_release_qualifications(
    build_id,generation_key,graph_digest,source_revision_digest,mapping_snapshot_digest,
    source_content_digest,qualification_digest,review_details,active
  ) values(
    v_build.id,v_generation,v_build.graph_digest,v_build.source_revision_digest,v_mapping_digest,
    v_content,pg_catalog.md5(v_build.id::text||':'||v_generation||':'||v_build.graph_digest||':'||
      v_build.source_revision_digest||':'||v_mapping_digest||':'||v_content),
    pg_catalog.jsonb_build_object(
      'reviewed_by','ChatGPT independent OHI post-activation reconciliation',
      'reviewed_at','2026-08-14T16:00:00Z',
      'evidence','Exact active OHI graph previously passed full shared provenance, 4/5 Thrush fixture, digest/count and activation audit; current Possum bridge identities are absent from this graph',
      'historical_build_receipt_rewritten',false,
      'graph_digest',v_build.graph_digest,'source_revision_digest',v_build.source_revision_digest
    ),true
  );
end
$issue97_qualify_ohi$;

-- Activation receives an independent release-generation gate after the existing
-- locked source/mapping/graph-content checks and before impact approval/flip.
