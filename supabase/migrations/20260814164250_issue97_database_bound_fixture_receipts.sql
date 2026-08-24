-- GitHub #97 — database-bound pinned fixture receipts.
--
-- The original final report accepted ten caller-supplied booleans. That was not
-- an acceptable authorization boundary: a caller could state that a fixture
-- passed without binding the claim to current production evidence.
--
-- This final release migration removes that trust path. Eight fixtures that the
-- production database can prove are recomputed from ACTIVE release-current
-- graphs/route receipts every time a report is persisted or revalidated.
-- Mobile chunk mapping and the synthetic parallel-shortcut rejection remain
-- exact-SHA CI requirements because they execute in the JavaScript route-plan
-- runtime; the database records those requirements but does not pretend to have
-- executed JavaScript. Caller fixture JSON must be empty and never authorizes a
-- report.

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create or replace function private_verification.brinesearch_issue97_current_pinned_fixture_receipts(
  p_git_sha text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_thrush jsonb;
  v_bellaire jsonb;
  v_leonard jsonb;
  v_cr26 jsonb;
  v_possum jsonb;
  v_cologie jsonb;
  v_repeated jsonb;
  v_shared jsonb;
begin
  if coalesce(p_git_sha,'')!~'^[0-9a-f]{40}$' then
    raise exception 'Issue #97 fixture receipts require an exact 40-character Git SHA';
  end if;

  -- Thrush Ave / Ohio County WV: exact four physical junctions, exact four
  -- reviewed coordinates/types/methods and exactly five connected identities.
  with build as (
    select b.id
    from public.brinesearch_road_graph_builds b
    where b.state_code='WV' and b.county_code='OHI' and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  ), target as (
    select i.id
    from public.brinesearch_authoritative_road_identities i
    where i.active and i.source_identity_key='WV:WVDOT:ROUTE_ID:3500895000000'
  ), occurrence as (
    select distinct j.id,j.logical_junction_id,j.stable_junction_key,j.graph_digest,
      j.junction_type,j.source_method,
      pg_catalog.round(extensions.st_x(j.geom)::numeric,7) as lng,
      pg_catalog.round(extensions.st_y(j.geom)::numeric,7) as lat,
      (select count(*)::integer from public.brinesearch_road_junction_memberships x
       where x.junction_id=j.id) as member_count
    from build b cross join target t
    join public.brinesearch_road_junction_memberships m on m.identity_id=t.id
    join public.brinesearch_road_junctions j on j.id=m.junction_id and j.build_id=b.id
    where j.verification_status='verified'
  ), expected(lng,lat,junction_type,source_method,member_count) as (values
    (-80.7132635::numeric,40.0836389::numeric,'t_junction'::text,'exact_authoritative_endpoint_on_interior'::text,2),
    (-80.7132025::numeric,40.0841629::numeric,'t_junction'::text,'exact_authoritative_endpoint_on_interior'::text,2),
    (-80.7127235::numeric,40.0848739::numeric,'t_junction'::text,'exact_authoritative_endpoint_on_interior'::text,2),
    (-80.7129895::numeric,40.0855589::numeric,'multiway'::text,'exact_authoritative_source_vertex'::text,3)
  ), exact_points as (
    select count(*)::integer as row_count
    from expected e
    where exists(select 1 from occurrence o
      where o.lng=e.lng and o.lat=e.lat and o.junction_type=e.junction_type
        and o.source_method=e.source_method and o.member_count=e.member_count)
  ), connected as (
    select count(distinct connected_identity.source_identity_key)::integer as row_count
    from build b cross join target t
    join public.brinesearch_road_junction_memberships own on own.identity_id=t.id
    join public.brinesearch_road_junctions j on j.id=own.junction_id and j.build_id=b.id
      and j.verification_status='verified'
    join public.brinesearch_road_junction_memberships other
      on other.junction_id=j.id and other.identity_id<>t.id
    join public.brinesearch_authoritative_road_identities connected_identity
      on connected_identity.id=other.identity_id and connected_identity.active
  ), facts as (
    select
      (select count(*) from build)::integer as build_count,
      (select count(*) from target)::integer as target_count,
      (select count(distinct logical_junction_id) from occurrence)::integer as occurrence_count,
      (select row_count from exact_points)::integer as exact_point_count,
      (select row_count from connected)::integer as connected_identity_count,
      pg_catalog.md5(coalesce((select pg_catalog.string_agg(
        stable_junction_key||':'||graph_digest,'|' order by stable_junction_key
      ) from occurrence),'')) as graph_evidence_digest
  )
  select pg_catalog.jsonb_build_object(
    'pass',build_count=1 and target_count=1 and occurrence_count=4
      and exact_point_count=4 and connected_identity_count=5,
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_thrush from facts;

  -- Bellaire 44th: exactly six shared sections and two point occurrences. The
  -- Noble/44th source vertex must be independently corroborated and VERIFIED.
  with build as (
    select b.id from public.brinesearch_road_graph_builds b
    where b.state_code='OH' and b.county_code='BEL' and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  ), target as (
    select i.id from public.brinesearch_authoritative_road_identities i
    where i.active and i.source_identity_key='OH:ODOT:NLF:MBELMR00093**C'
  ), occurrence as (
    select distinct j.id,j.logical_junction_id,j.junction_type,j.stable_junction_key,j.graph_digest
    from build b cross join target t
    join public.brinesearch_road_junction_memberships m on m.identity_id=t.id
    join public.brinesearch_road_junctions j on j.id=m.junction_id and j.build_id=b.id
    where j.verification_status='verified'
  ), pinned as (
    select count(*)::integer as row_count
    from build b cross join target t
    join public.brinesearch_road_junction_memberships own on own.identity_id=t.id
    join public.brinesearch_road_junctions j on j.id=own.junction_id and j.build_id=b.id
      and j.verification_status='verified'
      and extensions.geometrytype(j.geom)='POINT'
      and extensions.st_dwithin(
        j.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(-80.7408324,40.0259094),4326)::extensions.geography,
        0.03
      )
    where exists(select 1
      from public.brinesearch_road_junction_memberships other
      join public.brinesearch_authoritative_road_identities oi on oi.id=other.identity_id
      where other.junction_id=j.id and oi.source_identity_key='OH:ODOT:NLF:MBELMR01345**C')
      and (select count(*) from public.brinesearch_road_junction_memberships x where x.junction_id=j.id)=2
  ), facts as (
    select (select count(*) from build)::integer as build_count,
      (select count(*) from target)::integer as target_count,
      (select count(distinct logical_junction_id) from occurrence)::integer as occurrence_count,
      (select count(distinct logical_junction_id) from occurrence where junction_type='shared_segment')::integer as shared_count,
      (select count(distinct logical_junction_id) from occurrence where junction_type not in ('shared_segment','name_change'))::integer as point_count,
      (select row_count from pinned)::integer as pinned_noble_point_count,
      pg_catalog.md5(coalesce((select pg_catalog.string_agg(
        stable_junction_key||':'||graph_digest,'|' order by stable_junction_key
      ) from occurrence),'')) as graph_evidence_digest
  )
  select pg_catalog.jsonb_build_object(
    'pass',build_count=1 and target_count=1 and occurrence_count=8 and shared_count=6
      and point_count=2 and pinned_noble_point_count=1,
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_bellaire from facts;

  -- Leonard Ridge: one exact three-member multiway with the exact source
  -- component/segment evidence. The disconnected base TR3 identity stays split.
  with build as (
    select b.id from public.brinesearch_road_graph_builds b
    where b.state_code='OH' and b.county_code='NOB' and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  ), fixture as (
    select j.id,j.stable_junction_key,j.graph_digest,j.junction_type,j.verification_status,
      array_agg(distinct i.source_identity_key order by i.source_identity_key) as identities,
      array_agg(distinct source_key order by source_key) as segment_keys
    from build b
    join public.brinesearch_road_junctions j on j.build_id=b.id
      and extensions.geometrytype(j.geom)='POINT'
      and extensions.st_dwithin(
        j.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(-81.604160472398632,39.76125865161314),4326)::extensions.geography,
        0.03
      )
    join public.brinesearch_road_junction_memberships m on m.junction_id=j.id
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    cross join lateral unnest(m.source_segment_keys) source_key
    group by j.id
  ), facts as (
    select (select count(*) from build)::integer as build_count,
      (select count(*) from fixture)::integer as fixture_count,
      coalesce((select bool_and(junction_type='multiway' and verification_status='verified') from fixture),false) as semantic_ok,
      coalesce((select bool_and(identities=array[
        'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134',
        'OH:ODOT:NLF:TNOBTR00054**C',
        'OH:ODOT:NLF:TNOBTR00055**C'
      ]::text[]) from fixture),false) as identity_set_ok,
      coalesce((select bool_and(segment_keys @> array[
        'OH:ODOT:SEGMENT:2025_000000000428134',
        'OH:ODOT:SEGMENT:2025_000000000428260',
        'OH:ODOT:SEGMENT:2025_000000000428264'
      ]::text[]) from fixture),false) as source_segments_ok,
      (select count(*) from public.brinesearch_authoritative_road_identities i
        where i.active and i.source_identity_key='OH:ODOT:NLF:TNOBTR00003**C')::integer as collapsed_base_identity_count,
      pg_catalog.md5(coalesce((select pg_catalog.string_agg(
        stable_junction_key||':'||graph_digest,'|' order by stable_junction_key
      ) from fixture),'')) as graph_evidence_digest
  )
  select pg_catalog.jsonb_build_object(
    'pass',build_count=1 and fixture_count=1 and semantic_ok and identity_set_ok
      and source_segments_ok and collapsed_base_identity_count=0,
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_leonard from facts;

  -- Jefferson CR26: five connected-road occurrences, one exact CR23/CR26/TR139A
  -- multiway and one exact CR26/TR174 shared section.
  with build as (
    select b.id from public.brinesearch_road_graph_builds b
    where b.state_code='OH' and b.county_code='JEF' and b.status='active'
      and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
  ), target as (
    select i.id from public.brinesearch_authoritative_road_identities i
    where i.active and i.source_identity_key='OH:ODOT:NLF:CJEFCR00026**C'
  ), occurrences as (
    select distinct j.id,j.logical_junction_id,j.junction_type,j.stable_junction_key,j.graph_digest
    from build b cross join target t
    join public.brinesearch_road_junction_memberships own on own.identity_id=t.id
    join public.brinesearch_road_junctions j on j.id=own.junction_id and j.build_id=b.id
      and j.verification_status='verified'
    where exists(select 1 from public.brinesearch_road_junction_memberships other
      where other.junction_id=j.id and other.identity_id<>t.id)
  ), multiway as (
    select j.id,
      array_agg(distinct i.source_identity_key order by i.source_identity_key) as identities
    from build b
    join public.brinesearch_road_junctions j on j.build_id=b.id
      and j.junction_type='multiway' and j.verification_status='verified'
    join public.brinesearch_road_junction_memberships m on m.junction_id=j.id
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    group by j.id
    having array_agg(distinct i.source_identity_key order by i.source_identity_key)=array[
      'OH:ODOT:NLF:CJEFCR00023**C','OH:ODOT:NLF:CJEFCR00026**C','OH:ODOT:NLF:TJEFTR00139A*C'
    ]::text[]
  ), shared as (
    select count(distinct j.id)::integer as row_count
    from build b cross join target t
    join public.brinesearch_road_junctions j on j.build_id=b.id
      and j.junction_type='shared_segment' and j.verification_status='verified'
    where exists(select 1 from public.brinesearch_road_junction_memberships m
      where m.junction_id=j.id and m.identity_id=t.id)
      and exists(select 1
        from public.brinesearch_road_junction_memberships m
        join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
        where m.junction_id=j.id and i.source_identity_key='OH:ODOT:NLF:TJEFTR00174**C')
  ), facts as (
    select (select count(*) from build)::integer as build_count,
      (select count(*) from target)::integer as target_count,
      (select count(distinct logical_junction_id) from occurrences)::integer as connected_occurrence_count,
      (select count(*) from multiway)::integer as exact_multiway_count,
      (select row_count from shared)::integer as cr26_tr174_shared_count,
      pg_catalog.md5(coalesce((select pg_catalog.string_agg(
        stable_junction_key||':'||graph_digest,'|' order by stable_junction_key
      ) from occurrences),'')) as graph_evidence_digest
  )
  select pg_catalog.jsonb_build_object(
    'pass',build_count=1 and target_count=1 and connected_occurrence_count=5
      and exact_multiway_count=1 and cr26_tr174_shared_count=1,
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_cr26 from facts;

  -- Possum Hollow: both reviewed Washington County NG911 subsegment bridges must
  -- still be the exact source-to-source mappings, with no name/nearest promotion.
  with expected(feature_key,identity_key,segment_key) as (values
    ('pa_washington_ng911_centerlines:NGUID:RCL22649@co.washington.pa.us:SCOPE:PA:WAS',
      'PA:PENNDOT:LOCAL:62:2049:110961:EJM9','PA:PENNDOT:LOCAL:SEGMENT:379767'),
    ('pa_washington_ng911_centerlines:NGUID:RCL39851@co.washington.pa.us:SCOPE:PA:WAS',
      'PA:PENNDOT:LOCAL:62:2061:107905:EHBS','PA:PENNDOT:LOCAL:SEGMENT:386101')
  ), matched as (
    select e.feature_key,e.identity_key,e.segment_key,m.id as mapping_id,
      m.evidence,c.source_digest
    from expected e
    join public.brinesearch_authoritative_supplemental_centerlines c
      on c.active and c.source_feature_key=e.feature_key
    join public.brinesearch_authoritative_road_identities i
      on i.active and i.source_identity_key=e.identity_key
    join public.brinesearch_supplemental_centerline_identity_mappings m
      on m.centerline_id=c.id and m.identity_id=i.id and m.active
      and m.ingest_run_id=c.last_ingest_run_id
      and m.mapping_status='verified'
      and m.mapping_method='exact_source_subsegment_boundary_pair'
      and m.source_segment_keys=array[e.segment_key]
      and coalesce((m.evidence->>'name_used_for_mapping')::boolean,false)=false
      and coalesce((m.evidence->>'nearest_road_used_for_mapping')::boolean,false)=false
    join public.brinesearch_supplemental_centerline_dispositions d
      on d.centerline_id=c.id and d.active and d.ingest_run_id=c.last_ingest_run_id
      and d.disposition='verified' and d.candidate_count=1 and d.verified_mapping_count=1
  ), facts as (
    select (select count(*) from public.brinesearch_road_graph_builds b
      where b.state_code='PA' and b.county_code='WAS' and b.status='active'
        and private_verification.brinesearch_issue97_graph_build_release_current(b.id))::integer as build_count,
      (select count(*) from matched)::integer as mapping_count,
      pg_catalog.md5(coalesce((select pg_catalog.string_agg(
        feature_key||':'||identity_key||':'||segment_key||':'||source_digest,
        '|' order by feature_key
      ) from matched),'')) as mapping_evidence_digest
  )
  select pg_catalog.jsonb_build_object(
    'pass',build_count=1 and mapping_count=2,
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_possum from facts;

  -- Cologie must be a real current dark-route dependency, not a synthetic pass.
  with pad as (
    select p.id from public.pads p
    where p.legacy_id='ascent--cologie' and coalesce(p.list_only,false)=false
  ), prep as (
    select rp.id,rp.pad_id
    from public.brinesearch_route_prep rp join pad p on p.id=rp.pad_id
    where rp.active and rp.route_group='primary'
  ), facts as (
    select (select count(*) from pad)::integer as pad_count,
      (select count(*) from prep)::integer as primary_prep_count,
      coalesce((select rr.route_status from prep
        join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
          on rr.route_prep_id=prep.id limit 1),'') as route_status,
      coalesce((select rr.road_occurrence_count from prep
        join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
          on rr.route_prep_id=prep.id limit 1),0)::integer as occurrence_count,
      coalesce((select rr.resolved_occurrence_count from prep
        join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
          on rr.route_prep_id=prep.id limit 1),0)::integer as resolved_count,
      coalesce((select rr.held_occurrence_count from prep
        join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
          on rr.route_prep_id=prep.id limit 1),-1)::integer as held_count,
      coalesce((select rr.canonical_mapping_count from prep
        join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
          on rr.route_prep_id=prep.id limit 1),0)::integer as canonical_count,
      coalesce((select rr.exact_geometry_count from prep
        join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
          on rr.route_prep_id=prep.id limit 1),0)::integer as exact_geometry_count,
      (select private_verification.brinesearch_issue97_transition_google_dependency(p.id) from pad p) as google_dependency,
      (select rr.receipt_digest from prep
        join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
          on rr.route_prep_id=prep.id limit 1) as reconciliation_digest
  )
  select pg_catalog.jsonb_build_object(
    'pass',pad_count=1 and primary_prep_count=1 and route_status='route_ready'
      and occurrence_count>1 and resolved_count=occurrence_count and held_count=0
      and canonical_count=occurrence_count and exact_geometry_count=occurrence_count
      and coalesce(google_dependency,'')~'^[0-9a-f]{32}$',
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_cologie from facts;

  -- A real current route must preserve the same canonical road as two distinct,
  -- non-adjacent occurrence identities with exact geometry receipts.
  with candidate as (
    select o.route_prep_id,o.pad_id,o.canonical_road_id,
      count(*)::integer as occurrence_count,min(o.occurrence_index)::integer as first_occurrence,
      max(o.occurrence_index)::integer as last_occurrence,
      pg_catalog.md5(pg_catalog.string_agg(
        o.occurrence_index::text||':'||o.route_prep_step_id::text||':'||o.receipt_digest||':'||g.receipt_digest,
        '|' order by o.occurrence_index
      )) as receipt_digest
    from private_verification.brinesearch_route_occurrence_receipts_issue97 o
    join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
      on g.route_prep_id=o.route_prep_id and g.occurrence_index=o.occurrence_index
      and g.route_prep_step_id=o.route_prep_step_id
    join private_verification.brinesearch_route_reconciliation_receipts_issue97 rr
      on rr.route_prep_id=o.route_prep_id and rr.route_status='route_ready'
    where o.resolution_status='resolved' and o.canonical_road_id is not null
      and g.status='resolved'
    group by o.route_prep_id,o.pad_id,o.canonical_road_id
    having count(*)>=2 and max(o.occurrence_index)-min(o.occurrence_index)>=2
      and private_verification.brinesearch_issue97_transition_google_dependency(o.pad_id) is not null
    order by o.route_prep_id,o.canonical_road_id
    limit 1
  ), facts as (
    select count(*)::integer as candidate_count,
      coalesce((select occurrence_count from candidate),0)::integer as occurrence_count,
      coalesce((select first_occurrence from candidate),0)::integer as first_occurrence,
      coalesce((select last_occurrence from candidate),0)::integer as last_occurrence,
      coalesce((select receipt_digest from candidate),'') as receipt_digest
    from candidate
  )
  select pg_catalog.jsonb_build_object(
    'pass',candidate_count=1 and occurrence_count>=2 and last_occurrence-first_occurrence>=2,
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_repeated from facts;

  -- Walking Tall is the pinned generic A -> B shared-pavement proof. It must be
  -- resolved by the exact right-continuation context method added after the old
  -- A -> B -> A-only resolver.
  with fixture as (
    select t.route_prep_id,t.boundary_index,t.receipt_digest,t.graph_build_id,
      t.graph_digest,t.anchor_digest,t.resolution_method,
      il.source_identity_key as left_identity,ir.source_identity_key as right_identity
    from private_verification.brinesearch_route_transition_receipts_issue97 t
    join public.pads p on p.id=t.pad_id and p.pad_name='WALKING TALL'
    join public.brinesearch_authoritative_road_identities il on il.id=t.left_identity_id and il.active
    join public.brinesearch_authoritative_road_identities ir on ir.id=t.right_identity_id and ir.active
    join public.brinesearch_road_junctions j on j.id=t.junction_id
      and j.junction_type='shared_segment' and j.verification_status='verified'
    join public.brinesearch_road_junction_anchors a on a.id=t.anchor_id and a.junction_id=j.id
      and a.anchor_digest=t.anchor_digest
    join public.brinesearch_road_graph_builds b on b.id=t.graph_build_id and b.id=j.build_id
      and b.status='active' and private_verification.brinesearch_issue97_graph_build_release_current(b.id)
    where t.status='resolved' and t.boundary_index=1
      and t.resolution_method='shared_segment_right_continuation_context'
      and il.source_identity_key='OH:ODOT:NLF:SBELSR00149**C'
      and ir.source_identity_key='OH:ODOT:NLF:TBELTR00202**C'
      and coalesce((t.evidence->>'right_context_outside_shared_interval')::boolean,false)
      and coalesce((t.evidence->>'selection_uses_exact_right_identity')::boolean,false)
      and coalesce((t.evidence->>'selection_uses_name_similarity')::boolean,true)=false
      and coalesce((t.evidence->>'selection_uses_nearest_road')::boolean,true)=false
  ), facts as (
    select count(*)::integer as fixture_count,
      pg_catalog.md5(coalesce(pg_catalog.string_agg(
        route_prep_id::text||':'||boundary_index::text||':'||receipt_digest||':'||
        graph_build_id::text||':'||graph_digest||':'||anchor_digest,
        '|' order by route_prep_id,boundary_index
      ),'')) as receipt_digest
    from fixture
  )
  select pg_catalog.jsonb_build_object(
    'pass',fixture_count=1,
    'evidence_digest',pg_catalog.md5(pg_catalog.to_jsonb(facts)::text),
    'observed',pg_catalog.to_jsonb(facts)
  ) into v_shared from facts;

  return pg_catalog.jsonb_build_object(
    'receipt_version','issue97-database-bound-fixtures-v1',
    'database_bound',pg_catalog.jsonb_build_object(
      'thrush',v_thrush,'bellaire',v_bellaire,'leonard',v_leonard,'cr26',v_cr26,
      'possum',v_possum,'cologie',v_cologie,'repeated_road',v_repeated,'shared_segment',v_shared
    ),
    'ci_required',pg_catalog.jsonb_build_object(
      'exact_git_sha',p_git_sha,
      'database_authoritative',false,
      'requirements',pg_catalog.jsonb_build_object(
        'long_chunk',pg_catalog.jsonb_build_object(
          'suite','v17/scripts/verify-google-route-plan-issue97.mjs',
          'contract','exact N=2,4,5,8,9 point-to-chunk mapping, continuity, <=3 waypoints and <=2048 URL length'
        ),
        'parallel_shortcut',pg_catalog.jsonb_build_object(
          'suite','v17/scripts/verify-google-route-plan-issue97.mjs + v17/scripts/audit-authoritative-occurrence-geometry-issue97.mjs',
          'contract','unproven/parallel shaping geometry is held; route geometry stays occurrence/source bound'
        )
      ),
      'authorization_note','CI requirements are verified outside PostgreSQL at this exact Git SHA; no caller boolean can substitute for them'
    )
  );
end
$$;
revoke all on function private_verification.brinesearch_issue97_current_pinned_fixture_receipts(text)
from public,anon,authenticated,service_role;

-- Replace the original report writer. Keep the signature for migration/runtime
-- compatibility, but non-empty p_pinned_fixture_results is now an error and its
-- contents are never stored or used for authorization.
create or replace function private_verification.brinesearch_issue97_persist_verification_report(
  p_git_sha text,
  p_candidate_manifest_id uuid,
  p_active_manifest_id uuid,
  p_source_manifest_id uuid,
  p_route_manifest_id uuid,
  p_pinned_fixture_results jsonb,
  p_review_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_generation text;
  v_reconcile record;
  v_child jsonb;
  v_phase1 jsonb;
  v_baseline record;
  v_migration_digest text;
  v_candidate_digest text;
  v_active_digest text;
  v_source_digest text;
  v_route_digest text;
  v_eligible integer;
  v_materialized integer;
  v_held integer;
  v_fixture_results jsonb;
  v_report_body jsonb;
  v_report_digest text;
  v_id uuid:=pg_catalog.gen_random_uuid();
begin
  if coalesce(p_git_sha,'')!~'^[0-9a-f]{40}$'
     or pg_catalog.jsonb_typeof(coalesce(p_pinned_fixture_results,'{}'::jsonb)) is distinct from 'object'
     or coalesce(p_pinned_fixture_results,'{}'::jsonb)<>'{}'::jsonb
     or pg_catalog.jsonb_typeof(p_review_details) is distinct from 'object'
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_by'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'reviewed_at'),'') is null
     or nullif(pg_catalog.btrim(p_review_details->>'evidence'),'') is null then
    raise exception 'Issue #97 verification report arguments are incomplete or caller fixture results were supplied';
  end if;

  v_fixture_results:=private_verification.brinesearch_issue97_current_pinned_fixture_receipts(p_git_sha);
  if pg_catalog.jsonb_object_length(v_fixture_results->'database_bound')<>8
     or exists(select 1
       from pg_catalog.jsonb_each(v_fixture_results->'database_bound') fixture(key,value)
       where coalesce((fixture.value->>'pass')::boolean,false) is not true
          or coalesce(fixture.value->>'evidence_digest','')!~'^[0-9a-f]{32}$') then
    raise exception 'Issue #97 database-bound pinned fixture receipts are not all current/green';
  end if;

  v_generation:=private_verification.brinesearch_issue97_active_graph_release_generation();
  if not private_verification.brinesearch_issue97_candidate_manifest_activation_current(p_candidate_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(p_active_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(p_source_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(p_route_manifest_id) then
    raise exception 'Issue #97 verification report requires exact current candidate/active/source/route manifests';
  end if;
  if exists(select 1
    from private_verification.brinesearch_issue97_release_manifests manifest
    where manifest.id=any(array[p_candidate_manifest_id,p_active_manifest_id,p_source_manifest_id,p_route_manifest_id])
      and manifest.git_sha<>p_git_sha) then
    raise exception 'Issue #97 report Git SHA differs from one or more persisted release manifests';
  end if;

  select manifest_digest into strict v_candidate_digest
  from private_verification.brinesearch_issue97_release_manifests
  where id=p_candidate_manifest_id and manifest_kind='candidate_graphs';
  select manifest_digest into strict v_active_digest
  from private_verification.brinesearch_issue97_release_manifests
  where id=p_active_manifest_id and manifest_kind='active_counties';
  select manifest_digest into strict v_source_digest
  from private_verification.brinesearch_issue97_release_manifests
  where id=p_source_manifest_id and manifest_kind='source_scopes';
  select manifest_digest,member_count into strict v_route_digest,v_eligible
  from private_verification.brinesearch_issue97_release_manifests
  where id=p_route_manifest_id and manifest_kind='route_eligibility';

  select count(*) filter(where member_value->>'disposition'='materialized')::integer,
    count(*) filter(where member_value->>'disposition'='held')::integer
  into v_materialized,v_held
  from private_verification.brinesearch_issue97_release_manifest_members
  where manifest_id=p_route_manifest_id;
  if v_materialized+v_held<>v_eligible then
    raise exception 'Issue #97 route eligibility manifest is not completely materialized-or-held';
  end if;

  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline where singleton;
  select * into v_reconcile
  from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
  where status='complete' order by completed_at desc,id desc limit 1;
  if not found then raise exception 'Issue #97 verification report requires a complete saved-road reconciliation'; end if;
  v_child:=private_verification.brinesearch_issue97_saved_road_child_receipt(v_reconcile.id);
  if v_reconcile.source_digest<>private_verification.brinesearch_issue97_saved_road_source_digest()
     or (v_child->>'occurrence_count')::integer<>v_baseline.expected_occurrence_count
     or v_child->>'inventory_digest'<>v_baseline.expected_inventory_digest
     or (v_child->>'route_critical_held_count')::integer<>0
     or (v_child->>'forbidden_resolution_count')::integer<>0 then
    raise exception 'Issue #97 verification report saved-road reconciliation is not current/release-safe';
  end if;

  v_phase1:=private_verification.brinesearch_issue97_phase1_release_gate();
  if coalesce((v_phase1->>'pass')::boolean,false) is not true then
    raise exception 'Issue #97 Phase 1 route occurrence/geometry gate is not green';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,''),'|' order by version
  ),'')) into v_migration_digest
  from supabase_migrations.schema_migrations;

  v_report_body:=pg_catalog.jsonb_build_object(
    'git_sha',p_git_sha,'migration_set_digest',v_migration_digest,'generation_key',v_generation,
    'candidate_graph_manifest_digest',v_candidate_digest,
    'active_county_manifest_digest',v_active_digest,
    'source_scope_manifest_digest',v_source_digest,
    'route_eligibility_manifest_digest',v_route_digest,
    'saved_road_reconciliation_run_id',v_reconcile.id,
    'saved_road_inventory_digest',v_child->>'inventory_digest',
    'pinned_fixture_results',v_fixture_results,
    'route_materialization_receipt',pg_catalog.jsonb_build_object(
      'complete',true,'eligible_total',v_eligible,'materialized_total',v_materialized,
      'explicit_held_total',v_held,'critical_hold_total',(v_child->>'route_critical_held_count')::integer,
      'forbidden_resolution_count',(v_child->>'forbidden_resolution_count')::integer,
      'phase1_gate',v_phase1
    ),
    'google_accounting_contract',pg_catalog.jsonb_build_object(
      'eligible_total',v_eligible,'required','ready_or_explicit_held_during_cutover_transaction',
      'stale_allowed',false,'public_ready_only',true
    )
  );
  v_report_digest:=pg_catalog.md5(v_report_body::text);

  insert into private_verification.brinesearch_issue97_verification_reports(
    id,report_digest,git_sha,migration_set_digest,generation_key,
    candidate_graph_manifest_id,active_county_manifest_id,source_scope_manifest_id,
    route_eligibility_manifest_id,saved_road_reconciliation_run_id,
    pinned_fixture_results,route_materialization_receipt,google_accounting_contract,
    report_body,review_details
  ) values(
    v_id,v_report_digest,p_git_sha,v_migration_digest,v_generation,
    p_candidate_manifest_id,p_active_manifest_id,p_source_manifest_id,p_route_manifest_id,
    v_reconcile.id,v_fixture_results,
    v_report_body->'route_materialization_receipt',v_report_body->'google_accounting_contract',
    v_report_body,p_review_details
  );

  return pg_catalog.jsonb_build_object(
    'report_id',v_id,'verification_report_digest',v_report_digest,
    'database_fixture_receipt_version',v_fixture_results->>'receipt_version',
    'ci_requirements',v_fixture_results->'ci_required'
  );
end
$$;
revoke all on function private_verification.brinesearch_issue97_persist_verification_report(text,uuid,uuid,uuid,uuid,jsonb,jsonb)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_verification_report_current(
  p_report_digest text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_report record;
  v_baseline record;
  v_reconcile record;
  v_child jsonb;
  v_phase1 jsonb;
  v_migration_digest text;
  v_candidate_count integer;
  v_eligible integer;
  v_current_fixtures jsonb;
begin
  select * into v_report
  from private_verification.brinesearch_issue97_verification_reports
  where report_digest=p_report_digest;
  if not found or v_report.report_digest<>pg_catalog.md5(v_report.report_body::text)
     or v_report.generation_key is distinct from private_verification.brinesearch_issue97_active_graph_release_generation() then
    return false;
  end if;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,''),'|' order by version
  ),'')) into v_migration_digest from supabase_migrations.schema_migrations;
  if v_report.migration_set_digest is distinct from v_migration_digest then return false; end if;

  if not private_verification.brinesearch_issue97_candidate_manifest_activation_current(v_report.candidate_graph_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.active_county_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.source_scope_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.route_eligibility_manifest_id) then
    return false;
  end if;
  if exists(select 1
    from private_verification.brinesearch_issue97_release_manifests manifest
    where manifest.id=any(array[
      v_report.candidate_graph_manifest_id,v_report.active_county_manifest_id,
      v_report.source_scope_manifest_id,v_report.route_eligibility_manifest_id
    ]) and manifest.git_sha<>v_report.git_sha) then return false; end if;

  select member_count into v_candidate_count
  from private_verification.brinesearch_issue97_release_manifests
  where id=v_report.candidate_graph_manifest_id;
  if v_candidate_count<>38 or exists(
    select 1 from private_verification.brinesearch_issue97_release_manifest_members candidate
    where candidate.manifest_id=v_report.candidate_graph_manifest_id
      and not exists(
        select 1 from private_verification.brinesearch_issue97_release_manifest_members active_member
        where active_member.manifest_id=v_report.active_county_manifest_id
          and active_member.member_value->>'build_id'=candidate.member_value->>'build_id'
      )
  ) then return false; end if;

  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline where singleton;
  select * into v_reconcile
  from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
  where id=v_report.saved_road_reconciliation_run_id and status='complete';
  if not found or v_reconcile.id is distinct from (
      select id from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
      where status='complete' order by completed_at desc,id desc limit 1
    ) or v_reconcile.source_digest<>private_verification.brinesearch_issue97_saved_road_source_digest() then
    return false;
  end if;
  v_child:=private_verification.brinesearch_issue97_saved_road_child_receipt(v_reconcile.id);
  if (v_child->>'occurrence_count')::integer<>v_baseline.expected_occurrence_count
     or v_child->>'inventory_digest'<>v_baseline.expected_inventory_digest
     or (v_child->>'route_critical_held_count')::integer<>0
     or (v_child->>'forbidden_resolution_count')::integer<>0 then return false; end if;

  v_phase1:=private_verification.brinesearch_issue97_phase1_release_gate();
  if coalesce((v_phase1->>'pass')::boolean,false) is not true
     or v_report.route_materialization_receipt->'phase1_gate' is distinct from v_phase1 then return false; end if;

  select member_count into v_eligible
  from private_verification.brinesearch_issue97_release_manifests
  where id=v_report.route_eligibility_manifest_id;
  if (v_report.route_materialization_receipt->>'eligible_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'materialized_total')::integer+
        (v_report.route_materialization_receipt->>'explicit_held_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'critical_hold_total')::integer<>0
     or (v_report.route_materialization_receipt->>'forbidden_resolution_count')::integer<>0
     or (v_report.google_accounting_contract->>'eligible_total')::integer<>v_eligible
     or coalesce((v_report.google_accounting_contract->>'stale_allowed')::boolean,true) then return false; end if;

  v_current_fixtures:=private_verification.brinesearch_issue97_current_pinned_fixture_receipts(v_report.git_sha);
  if v_report.pinned_fixture_results is distinct from v_current_fixtures
     or v_report.report_body->'pinned_fixture_results' is distinct from v_current_fixtures
     or pg_catalog.jsonb_object_length(v_current_fixtures->'database_bound')<>8
     or exists(select 1 from pg_catalog.jsonb_each(v_current_fixtures->'database_bound') fixture(key,value)
       where coalesce((fixture.value->>'pass')::boolean,false) is not true
          or coalesce(fixture.value->>'evidence_digest','')!~'^[0-9a-f]{32}$') then
    return false;
  end if;
  return true;
end
$$;
revoke all on function private_verification.brinesearch_issue97_verification_report_current(text)
from public,anon,authenticated,service_role;

-- Post-cutover integrity uses the same immutable report/body/manifest checks and
-- recomputes the database-bound fixture vector. It intentionally does not
-- compare the pre-cutover Phase 1 JSON to the post-cutover cutover state.
create or replace function private_verification.brinesearch_issue97_verification_report_integrity(
  p_report_digest text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_report record;
  v_baseline record;
  v_reconcile record;
  v_child jsonb;
  v_migration_digest text;
  v_candidate_count integer;
  v_eligible integer;
  v_current_fixtures jsonb;
begin
  select * into v_report
  from private_verification.brinesearch_issue97_verification_reports
  where report_digest=p_report_digest;
  if not found or v_report.report_digest<>pg_catalog.md5(v_report.report_body::text)
     or v_report.generation_key is distinct from private_verification.brinesearch_issue97_active_graph_release_generation() then
    return false;
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    version||':'||coalesce(name,''),'|' order by version
  ),'')) into v_migration_digest from supabase_migrations.schema_migrations;
  if v_report.migration_set_digest is distinct from v_migration_digest then return false; end if;

  if not private_verification.brinesearch_issue97_candidate_manifest_activation_current(v_report.candidate_graph_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.active_county_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.source_scope_manifest_id)
     or not private_verification.brinesearch_issue97_release_manifest_matches_live(v_report.route_eligibility_manifest_id) then
    return false;
  end if;
  if exists(select 1
    from private_verification.brinesearch_issue97_release_manifests manifest
    where manifest.id=any(array[
      v_report.candidate_graph_manifest_id,v_report.active_county_manifest_id,
      v_report.source_scope_manifest_id,v_report.route_eligibility_manifest_id
    ]) and manifest.git_sha<>v_report.git_sha) then return false; end if;

  select member_count into v_candidate_count
  from private_verification.brinesearch_issue97_release_manifests
  where id=v_report.candidate_graph_manifest_id;
  if v_candidate_count<>38 then return false; end if;

  select * into strict v_baseline
  from private_verification.brinesearch_issue97_saved_road_release_baseline where singleton;
  select * into v_reconcile
  from private_verification.brinesearch_issue97_saved_road_reconciliation_runs
  where id=v_report.saved_road_reconciliation_run_id and status='complete';
  if not found or v_reconcile.source_digest<>private_verification.brinesearch_issue97_saved_road_source_digest() then
    return false;
  end if;
  v_child:=private_verification.brinesearch_issue97_saved_road_child_receipt(v_reconcile.id);
  if (v_child->>'occurrence_count')::integer<>v_baseline.expected_occurrence_count
     or v_child->>'inventory_digest'<>v_baseline.expected_inventory_digest
     or (v_child->>'route_critical_held_count')::integer<>0
     or (v_child->>'forbidden_resolution_count')::integer<>0 then return false; end if;

  select member_count into v_eligible
  from private_verification.brinesearch_issue97_release_manifests
  where id=v_report.route_eligibility_manifest_id;
  if (v_report.route_materialization_receipt->>'complete')::boolean is not true
     or (v_report.route_materialization_receipt->>'eligible_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'materialized_total')::integer+
        (v_report.route_materialization_receipt->>'explicit_held_total')::integer<>v_eligible
     or (v_report.route_materialization_receipt->>'critical_hold_total')::integer<>0
     or (v_report.route_materialization_receipt->>'forbidden_resolution_count')::integer<>0
     or coalesce((v_report.route_materialization_receipt->'phase1_gate'->>'pass')::boolean,false) is not true
     or (v_report.google_accounting_contract->>'eligible_total')::integer<>v_eligible
     or coalesce((v_report.google_accounting_contract->>'stale_allowed')::boolean,true) then return false; end if;

  v_current_fixtures:=private_verification.brinesearch_issue97_current_pinned_fixture_receipts(v_report.git_sha);
  if v_report.pinned_fixture_results is distinct from v_current_fixtures
     or v_report.report_body->'pinned_fixture_results' is distinct from v_current_fixtures
     or pg_catalog.jsonb_object_length(v_current_fixtures->'database_bound')<>8
     or exists(select 1 from pg_catalog.jsonb_each(v_current_fixtures->'database_bound') fixture(key,value)
       where coalesce((fixture.value->>'pass')::boolean,false) is not true) then return false; end if;
  return true;
end
$$;
revoke all on function private_verification.brinesearch_issue97_verification_report_integrity(text)
from public,anon,authenticated,service_role;

-- Guard the trust-boundary change itself.
do $issue97_database_fixture_receipt_contract$
declare
  v_persist text;
  v_current text;
  v_integrity text;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_persist_verification_report(text,uuid,uuid,uuid,uuid,jsonb,jsonb)'::pg_catalog.regprocedure
  ) into strict v_persist;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_verification_report_current(text)'::pg_catalog.regprocedure
  ) into strict v_current;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_verification_report_integrity(text)'::pg_catalog.regprocedure
  ) into strict v_integrity;

  if v_persist like '%p_pinned_fixture_results->>key%'
     or v_persist like '%v_required_fixture_keys%'
     or v_persist not like '%caller fixture results were supplied%'
     or v_persist not like '%brinesearch_issue97_current_pinned_fixture_receipts%'
     or v_current like '%v_report.pinned_fixture_results->>key%'
     or v_integrity like '%v_report.pinned_fixture_results->>key%'
     or v_current not like '%brinesearch_issue97_current_pinned_fixture_receipts%'
     or v_integrity not like '%brinesearch_issue97_current_pinned_fixture_receipts%' then
    raise exception 'Issue #97 caller-supplied fixture boolean trust path remains';
  end if;

  if pg_catalog.has_function_privilege(
       'service_role','private_verification.brinesearch_issue97_current_pinned_fixture_receipts(text)','EXECUTE'
     ) or pg_catalog.has_function_privilege(
       'service_role','private_verification.brinesearch_issue97_persist_verification_report(text,uuid,uuid,uuid,uuid,jsonb,jsonb)','EXECUTE'
     ) then
    raise exception 'Issue #97 private fixture/report authorization helper is exposed to service_role';
  end if;
end
$issue97_database_fixture_receipt_contract$;
