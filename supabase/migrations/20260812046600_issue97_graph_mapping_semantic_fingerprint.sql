-- GitHub #97 — graph freshness must track mapping truth, not refresh bookkeeping.
--
-- County graph generations include adjacent-county identities at physical boundary
-- junctions. A later county-scoped exact-mapping refresh can change only the
-- machine-owned `refresh_scope` evidence field. The legacy graph fingerprint hashes
-- that operational field and therefore marks an unchanged boundary graph stale.
--
-- This migration adds a graph-only, explicitly versioned fingerprint. It removes
-- only `refresh_scope`, and only for the two machine-owned exact methods. The
-- generic route/reconciliation fingerprint remains byte-for-byte unchanged.

create or replace function private_verification.brinesearch_issue97_graph_mapping_evidence(
  p_mapping_method text,
  p_evidence jsonb
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select case
    when p_mapping_method in ('exact_source_record_id','exact_route_designation')
      then p_evidence-'refresh_scope'
    else p_evidence
  end
$$;

revoke all on function private_verification.brinesearch_issue97_graph_mapping_evidence(text,jsonb)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(
  p_identity_id uuid
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select pg_catalog.md5(pg_catalog.concat_ws('|',
    p_identity_id::text,coalesce(m.road_id::text,'unmapped'),
    coalesce(m.mapping_method,''),coalesce(
      private_verification.brinesearch_issue97_graph_mapping_evidence(
        m.mapping_method,m.evidence
      )::text,''
    ),
    coalesce(r.canonical_name,''),coalesce(r.state,''),coalesce(r.county,''),
    coalesce(r.township,''),coalesce(r.road_type,''),coalesce(r.route_number,''),
    coalesce(r.source_record_id,''),coalesce(r.verification_status,''),
    coalesce(r.candidate_only::text,''),coalesce(r.geometry_status,''),
    coalesce(pg_catalog.md5(r.centerline_geojson::text),'')
  ))
  from (select 1) seed
  left join public.brinesearch_road_identity_mappings m
    on m.identity_id=p_identity_id and m.mapping_status='verified'
  left join public.brinesearch_roads r on r.id=m.road_id
$$;

revoke all on function private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(uuid)
from public,anon,authenticated,service_role;

do $issue97_verify_graph_mapping_evidence_v2$
begin
  if private_verification.brinesearch_issue97_graph_mapping_evidence(
       'exact_source_record_id','{"proof":"kept","refresh_scope":"OH:JEF"}'::jsonb
     ) is distinct from '{"proof":"kept"}'::jsonb
     or private_verification.brinesearch_issue97_graph_mapping_evidence(
       'exact_route_designation','{"proof":"kept","refresh_scope":"OH:NOB"}'::jsonb
     ) is distinct from '{"proof":"kept"}'::jsonb
     or private_verification.brinesearch_issue97_graph_mapping_evidence(
       'owner_verified_source_record_id',
       '{"proof":"kept","refresh_scope":"manual-review"}'::jsonb
     ) is distinct from '{"proof":"kept","refresh_scope":"manual-review"}'::jsonb
  then
    raise exception 'Issue #97 graph mapping evidence normalization escaped machine refresh bookkeeping';
  end if;
end
$issue97_verify_graph_mapping_evidence_v2$;

-- New builds capture v2. The source/registry digest remains raw provenance.
do $issue97_patch_graph_mapping_snapshot_v2$
declare
  v_definition text;
  v_old_fingerprint text :=
    'private_verification.brinesearch_issue97_mapping_fingerprint(snapshot.identity_id)';
  v_new_fingerprint text :=
    'private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(snapshot.identity_id)';
  v_old_detail text := '''mapping_snapshot_digest'',v_mapping_snapshot_digest';
  v_new_detail text := '''mapping_snapshot_digest'',v_mapping_snapshot_digest,'||
    ' ''mapping_snapshot_version'',''issue97-graph-mapping-v2''';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_fingerprint,'')
  ))/pg_catalog.length(v_old_fingerprint);
  if v_count<>1 then
    raise exception 'Issue #97 graph snapshot fingerprint target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old_fingerprint,v_new_fingerprint);

  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old_detail,'')
  ))/pg_catalog.length(v_old_detail);
  if v_count<>1 then
    raise exception 'Issue #97 graph snapshot version target changed: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old_detail,v_new_detail);
end
$issue97_patch_graph_mapping_snapshot_v2$;

-- Immutable legacy validated builds retain legacy activation semantics. New v2
-- builds use the semantic graph fingerprint.
do $issue97_patch_graph_mapping_activation_v2$
declare
  v_definition text;
  v_old text :=
    'private_verification.brinesearch_issue97_mapping_fingerprint(current_map.identity_id)';
  v_new text := $replacement$case
        when v_build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2'
          then private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(
            current_map.identity_id
          )
        when nullif(v_build.details->>'mapping_snapshot_version','') is null
          then private_verification.brinesearch_issue97_mapping_fingerprint(
            current_map.identity_id
          )
        else null
      end$replacement$;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,'')
  ))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 graph activation fingerprint target changed: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_graph_mapping_activation_v2$;

-- Keep the proven set-based currentness path. The build's explicit version
-- selects raw legacy evidence or graph-semantic evidence.
create or replace function private_verification.brinesearch_issue97_graph_build_sources_current(
  p_build_id uuid
)
returns boolean
language plpgsql
stable
set search_path=''
as $$
declare v_current boolean:=false;
begin
  select
    pg_catalog.jsonb_array_length(coalesce(b.details->'source_run_vector','[]'::jsonb))>0
    and pg_catalog.jsonb_array_length(coalesce(b.details->'source_run_vector','[]'::jsonb))=(
      select count(*) from (
        select distinct entry->>'dataset_id',entry->>'state_code',entry->>'county_code'
        from pg_catalog.jsonb_array_elements(coalesce(b.details->'source_run_vector','[]'::jsonb)) entry
      ) unique_entries
    )
    and not exists(
      select 1 from pg_catalog.jsonb_array_elements(coalesce(b.details->'source_run_vector','[]'::jsonb)) entry
      where not exists(
        select 1
        from public.brinesearch_road_source_ingest_runs r
        join public.brinesearch_road_source_datasets d on d.id=r.dataset_id and d.active
        join public.brinesearch_road_source_dataset_counties scope
          on scope.dataset_id=r.dataset_id and scope.state_code=r.state_code
          and scope.county_code=r.county_code and scope.active
          and scope.ingest_enabled and scope.required_for_graph
        where r.id=(entry->>'run_id')::uuid
          and r.dataset_id=(entry->>'dataset_id')::uuid
          and r.state_code=entry->>'state_code'
          and r.county_code=entry->>'county_code'
          and r.id=(select latest.id
            from public.brinesearch_road_source_ingest_runs latest
            where latest.dataset_id=r.dataset_id and latest.state_code=r.state_code
              and latest.county_code=r.county_code
            order by latest.started_at desc,latest.id desc limit 1)
          and private_verification.brinesearch_issue97_dataset_scope_current(
            r.dataset_id,r.state_code,r.county_code
          )
      )
    )
    and not exists(
      with touched as (
        select distinct entry->>'state_code' as state_code,entry->>'county_code' as county_code
        from pg_catalog.jsonb_array_elements(coalesce(b.details->'source_run_vector','[]'::jsonb)) entry
      )
      select 1
      from touched
      join public.brinesearch_road_source_dataset_counties scope
        on scope.state_code=touched.state_code and scope.county_code=touched.county_code
        and scope.active and scope.ingest_enabled and scope.required_for_graph
      join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
      where not exists(
        select 1 from pg_catalog.jsonb_array_elements(coalesce(b.details->'source_run_vector','[]'::jsonb)) entry
        where (entry->>'dataset_id')::uuid=scope.dataset_id
          and entry->>'state_code'=scope.state_code
          and entry->>'county_code'=scope.county_code
      )
    )
    and nullif(b.details->>'mapping_snapshot_digest','') is not null
    and (nullif(b.details->>'mapping_snapshot_version','') is null
      or b.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2')
    and b.details->>'mapping_snapshot_digest'=(
      select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        current_map.identity_id::text||':'||current_map.fingerprint,
        ',' order by current_map.identity_id
      ),''))
      from (
        select identities.identity_id,
          pg_catalog.md5(pg_catalog.concat_ws('|',
            identities.identity_id::text,coalesce(m.road_id::text,'unmapped'),
            coalesce(m.mapping_method,''),coalesce(
              case
                when b.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2'
                  then private_verification.brinesearch_issue97_graph_mapping_evidence(
                    m.mapping_method,m.evidence
                  )
                when nullif(b.details->>'mapping_snapshot_version','') is null
                  then m.evidence
                else null
              end::text,''
            ),
            coalesce(road.canonical_name,''),coalesce(road.state,''),coalesce(road.county,''),
            coalesce(road.township,''),coalesce(road.road_type,''),coalesce(road.route_number,''),
            coalesce(road.source_record_id,''),coalesce(road.verification_status,''),
            coalesce(road.candidate_only::text,''),coalesce(road.geometry_status,''),
            coalesce(pg_catalog.md5(road.centerline_geojson::text),'')
          )) as fingerprint
        from (
          select distinct membership.identity_id
          from public.brinesearch_road_junction_memberships membership
          join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
          where junction.build_id=b.id
        ) identities
        left join public.brinesearch_road_identity_mappings m
          on m.identity_id=identities.identity_id and m.mapping_status='verified'
        left join public.brinesearch_roads road on road.id=m.road_id
      ) current_map
    )
  into v_current
  from public.brinesearch_road_graph_builds b where b.id=p_build_id;
  return coalesce(v_current,false);
end
$$;

revoke all on function private_verification.brinesearch_issue97_graph_build_sources_current(uuid)
from public,anon,authenticated,service_role;

-- Production Belmont repair: do not rebuild or restamp from current truth. Upgrade
-- only if removing post-build, cross-county machine refresh_scope fields reconstructs
-- the captured legacy digest exactly. A clean database with no active Belmont build
-- simply skips this guarded data repair.
do $issue97_repair_belmont_graph_mapping_snapshot$
declare
  v_build public.brinesearch_road_graph_builds%rowtype;
  v_reconstructed_legacy text;
  v_semantic_digest text;
  v_ignored_boundary_rows integer;
  v_membership_mapping_mismatches integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:graph:OH:BEL')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  select b.* into v_build
  from public.brinesearch_road_graph_builds b
  where b.state_code='OH' and b.county_code='BEL' and b.status='active'
  for update;
  if not found then return; end if;

  if v_build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2' then
    if not private_verification.brinesearch_issue97_graph_build_sources_current(v_build.id) then
      raise exception 'Issue #97 Belmont v2 build is not current during convergent migration replay';
    end if;
    return;
  end if;

  if v_build.source_revision_digest<>'e1a1fb0cd807e34c99d0ff7f8b8c7cf7'
     or v_build.graph_digest<>'2dbc52372d06b0b64038a57244ff1c48'
     or v_build.source_segment_count<>5687
     or v_build.identity_count<>3001
     or v_build.point_junction_count<>4880
     or v_build.shared_segment_count<>114
     or v_build.membership_count<>9919
     or v_build.details->>'mapping_snapshot_digest'<>'a59393a99e44a63b6ecb069d31947259'
  then
    raise exception 'Issue #97 Belmont guarded mapping repair does not match the verified frozen build';
  end if;

  -- A graph snapshot captures the verified road_id on every membership. Prove
  -- those stored references still equal the builder's current latest-verified
  -- mapping before changing metadata; the mapping digest alone does not inspect
  -- membership.road_id.
  with captured as (
    select distinct membership.identity_id,membership.road_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=v_build.id
  ), current_mapping as (
    select captured.identity_id,captured.road_id as captured_road_id,
      mapping.road_id as current_road_id
    from captured
    left join lateral (
      select candidate.road_id
      from public.brinesearch_road_identity_mappings candidate
      where candidate.identity_id=captured.identity_id
        and candidate.mapping_status='verified'
      order by candidate.updated_at desc,candidate.id
      limit 1
    ) mapping on true
  )
  select count(*)::integer into v_membership_mapping_mismatches
  from current_mapping
  where captured_road_id is distinct from current_road_id;

  if v_membership_mapping_mismatches<>0 then
    raise exception 'Issue #97 Belmont membership/current mapping proof failed: % mismatches',
      v_membership_mapping_mismatches;
  end if;

  with identity_set as (
    select distinct membership.identity_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=v_build.id
  ), fingerprints as (
    select ids.identity_id,
      pg_catalog.md5(pg_catalog.concat_ws('|',
        ids.identity_id::text,coalesce(mapping.road_id::text,'unmapped'),
        coalesce(mapping.mapping_method,''),coalesce((case
          when mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
            and mapping.updated_at>v_build.completed_at
            and (identity.state_code||':'||identity.county_code)<>'OH:BEL'
            and mapping.evidence ? 'refresh_scope'
          then mapping.evidence-'refresh_scope'
          else mapping.evidence
        end)::text,''),
        coalesce(road.canonical_name,''),coalesce(road.state,''),coalesce(road.county,''),
        coalesce(road.township,''),coalesce(road.road_type,''),coalesce(road.route_number,''),
        coalesce(road.source_record_id,''),coalesce(road.verification_status,''),
        coalesce(road.candidate_only::text,''),coalesce(road.geometry_status,''),
        coalesce(pg_catalog.md5(road.centerline_geojson::text),'')
      )) as reconstructed_fingerprint,
      private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(ids.identity_id)
        as semantic_fingerprint,
      (mapping.mapping_method in ('exact_source_record_id','exact_route_designation')
        and mapping.updated_at>v_build.completed_at
        and (identity.state_code||':'||identity.county_code)<>'OH:BEL'
        and mapping.evidence ? 'refresh_scope') as ignored_boundary_refresh
    from identity_set ids
    join public.brinesearch_authoritative_road_identities identity on identity.id=ids.identity_id
    left join public.brinesearch_road_identity_mappings mapping
      on mapping.identity_id=ids.identity_id and mapping.mapping_status='verified'
    left join public.brinesearch_roads road on road.id=mapping.road_id
  )
  select
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      identity_id::text||':'||reconstructed_fingerprint,',' order by identity_id
    ),'')),
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      identity_id::text||':'||semantic_fingerprint,',' order by identity_id
    ),'')),
    count(*) filter(where ignored_boundary_refresh)::integer
  into v_reconstructed_legacy,v_semantic_digest,v_ignored_boundary_rows
  from fingerprints;

  if v_reconstructed_legacy is distinct from v_build.details->>'mapping_snapshot_digest'
     or v_ignored_boundary_rows<>4
  then
    raise exception 'Issue #97 Belmont legacy reconstruction proof failed: digest %, rows %',
      v_reconstructed_legacy,v_ignored_boundary_rows;
  end if;

  update public.brinesearch_road_graph_builds set
    details=details||pg_catalog.jsonb_build_object(
      'mapping_snapshot_legacy_digest',v_build.details->>'mapping_snapshot_digest',
      'mapping_snapshot_digest',v_semantic_digest,
      'mapping_snapshot_version','issue97-graph-mapping-v2',
      'mapping_snapshot_upgrade_reason','machine_refresh_scope_is_operational',
      'mapping_snapshot_upgrade_proof',pg_catalog.jsonb_build_object(
        'reconstructed_legacy_digest',v_reconstructed_legacy,
        'ignored_post_build_boundary_refresh_rows',v_ignored_boundary_rows,
        'membership_current_mapping_mismatch_count',v_membership_mapping_mismatches,
        'topology_changed',false
      )
    )
  where id=v_build.id;

  if not private_verification.brinesearch_issue97_graph_build_sources_current(v_build.id) then
    raise exception 'Issue #97 Belmont remained stale after the guarded semantic snapshot repair';
  end if;
end
$issue97_repair_belmont_graph_mapping_snapshot$;

do $issue97_verify_graph_mapping_semantic_fingerprint$
declare
  v_rebuild text;
  v_activate text;
  v_currentness text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_rebuild;
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_activate_graph_build(uuid,text,jsonb)'::pg_catalog.regprocedure
  ) into v_activate;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)'::pg_catalog.regprocedure
  ) into v_currentness;

  if v_rebuild not like '%brinesearch_issue97_graph_mapping_fingerprint_v2(snapshot.identity_id)%'
     or v_rebuild not like '%mapping_snapshot_version%issue97-graph-mapping-v2%'
     or v_activate not like '%brinesearch_issue97_graph_mapping_fingerprint_v2%'
     or v_activate not like '%brinesearch_issue97_mapping_fingerprint(%'
     or v_currentness not like '%current_map.fingerprint%'
     or v_currentness not like '%brinesearch_issue97_graph_mapping_evidence%'
  then
    raise exception 'Issue #97 graph mapping semantic-v2 contract did not install cleanly';
  end if;
end
$issue97_verify_graph_mapping_semantic_fingerprint$;

comment on function private_verification.brinesearch_issue97_graph_mapping_fingerprint_v2(uuid) is
  'Issue #97 graph-only mapping fingerprint. It ignores only machine refresh_scope bookkeeping; generic route fingerprints remain unchanged.';
