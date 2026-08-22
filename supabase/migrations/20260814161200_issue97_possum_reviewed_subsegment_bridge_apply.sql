-- GitHub #97 — continuation of reviewed PA/WAS supplemental subsegment bridge rollout.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

create or replace function private_verification.brinesearch_issue97_apply_reviewed_subsegment_bridges(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_expected integer:=0;
  v_proven integer:=0;
  v_mapping_rows integer:=0;
  v_disposition_rows integer:=0;
  v_name_rows integer:=0;
  v_content_digest text;
  v_result jsonb;
begin
  select r.*,d.source_key,d.topology_role into strict v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
  where r.id=p_run_id;

  if v_run.topology_role<>'supplemental_aliases' then
    raise exception 'Issue #97 reviewed subsegment bridge requires a supplemental source';
  end if;
  if v_run.status not in ('loading','complete') then
    raise exception 'Issue #97 reviewed subsegment bridge run is not loading/current-complete';
  end if;
  if v_run.status='complete'
     and not private_verification.brinesearch_issue97_ingest_run_verified(p_run_id) then
    raise exception 'Issue #97 reviewed subsegment bridge cannot rematerialize an unverified complete run';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
    'brinesearch:issue97:ingest:'||v_run.dataset_id::text||':'||v_run.county_code
  ));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  select count(*)::integer into v_expected
  from private_verification.brinesearch_issue97_reviewed_supplemental_subsegment_bridges bridge
  where bridge.dataset_id=v_run.dataset_id and bridge.state_code=v_run.state_code
    and bridge.county_code=v_run.county_code and bridge.active;
  if v_expected=0 then
    return pg_catalog.jsonb_build_object('run_id',p_run_id,'reviewed_bridges',0,'mapping_rows',0);
  end if;

  select count(*)::integer into v_proven
  from private_verification.brinesearch_issue97_reviewed_subsegment_bridge_proof(p_run_id);
  if v_proven<>v_expected then
    raise exception 'Issue #97 reviewed subsegment bridge structural proof failed: % of %',v_proven,v_expected
      using errcode='55000';
  end if;

  insert into public.brinesearch_supplemental_centerline_identity_mappings(
    centerline_id,dataset_id,state_code,county_code,identity_id,
    mapping_status,mapping_method,source_segment_keys,evidence,ingest_run_id,active
  )
  select proof.centerline_id,v_run.dataset_id,v_run.state_code,v_run.county_code,
    proof.identity_id,'verified','exact_source_subsegment_boundary_pair',
    array[proof.source_segment_key],proof.evidence,p_run_id,true
  from private_verification.brinesearch_issue97_reviewed_subsegment_bridge_proof(p_run_id) proof
  on conflict(centerline_id,identity_id) do update set
    dataset_id=excluded.dataset_id,state_code=excluded.state_code,county_code=excluded.county_code,
    mapping_status=excluded.mapping_status,mapping_method=excluded.mapping_method,
    source_segment_keys=excluded.source_segment_keys,evidence=excluded.evidence,
    ingest_run_id=excluded.ingest_run_id,active=true,updated_at=now();
  get diagnostics v_mapping_rows=row_count;

  -- A complete historical source run may be safely rematerialized after the
  -- reviewed bridge rule is installed. Loading runs let the ordinary core
  -- disposition/name passes perform these same upserts later in the finalizer.
  if v_run.status='complete' then
    insert into public.brinesearch_supplemental_centerline_dispositions(
      centerline_id,dataset_id,state_code,county_code,ingest_run_id,disposition,
      candidate_count,verified_mapping_count,evidence,active,updated_at
    )
    select c.id,c.dataset_id,c.state_code,c.county_code,p_run_id,'verified',1,1,
      pg_catalog.jsonb_build_object(
        'source_feature_key',c.source_feature_key,'source_record_id',c.source_record_id,
        'source_digest',c.source_digest,'source_key',v_run.source_key,
        'mapping_contract','reviewed exact source subsegment + paired municipal boundary; names excluded',
        'mapping_method','exact_source_subsegment_boundary_pair',
        'name_used_for_mapping',false,'nearest_road_used_for_mapping',false,
        'source_endpoint_snapping_forbidden',true
      ),true,now()
    from private_verification.brinesearch_issue97_reviewed_subsegment_bridge_proof(p_run_id) proof
    join public.brinesearch_authoritative_supplemental_centerlines c on c.id=proof.centerline_id
    on conflict(centerline_id) do update set
      dataset_id=excluded.dataset_id,state_code=excluded.state_code,county_code=excluded.county_code,
      ingest_run_id=excluded.ingest_run_id,disposition=excluded.disposition,
      candidate_count=excluded.candidate_count,verified_mapping_count=excluded.verified_mapping_count,
      evidence=excluded.evidence,active=true,updated_at=now();
    get diagnostics v_disposition_rows=row_count;

    insert into public.brinesearch_authoritative_road_names(
      identity_id,source_dataset_id,source_record_id,name_type,road_name,normalized_name,
      source_segment_key,from_measure,to_measure,provenance,active,last_seen_at
    )
    select proof.identity_id,v_run.dataset_id,
      c.source_feature_key||':'||proof.source_segment_key||':'||coalesce(event->>'type','local')||':'||
        pg_catalog.md5(event->>'name'),
      case event->>'type' when '911' then '911' when 'legacy' then 'legacy'
        when 'alternate' then 'alternate' else 'local' end,
      event->>'name',pg_catalog.regexp_replace(pg_catalog.lower(event->>'name'),'[^a-z0-9]+',' ','g'),
      proof.source_segment_key,
      case when s.from_measure is not null and s.to_measure is not null then
        s.from_measure+(s.to_measure-s.from_measure)*least(overlap.start_fraction,overlap.end_fraction)
        else s.from_measure end,
      case when s.from_measure is not null and s.to_measure is not null then
        s.from_measure+(s.to_measure-s.from_measure)*greatest(overlap.start_fraction,overlap.end_fraction)
        else s.to_measure end,
      pg_catalog.jsonb_build_object(
        'supplemental_source_feature_key',c.source_feature_key,
        'supplemental_source_record_id',c.source_record_id,
        'supplemental_source_digest',c.source_digest,
        'geometry_match',proof.evidence,'source_name_event',event,
        'target_overlap',extensions.st_asgeojson(extensions.st_transform(overlap.geom,4326),15)::jsonb,
        'target_overlap_fraction',pg_catalog.jsonb_build_array(
          least(overlap.start_fraction,overlap.end_fraction),
          greatest(overlap.start_fraction,overlap.end_fraction)),
        'municipality_left',c.municipality_left,'municipality_right',c.municipality_right,
        'topology_authority',false,'source_endpoint_snapping_forbidden',true,
        'ingest_run_id',p_run_id,'mapping_method','exact_source_subsegment_boundary_pair'
      ),true,now()
    from private_verification.brinesearch_issue97_reviewed_subsegment_bridge_proof(p_run_id) proof
    join public.brinesearch_authoritative_supplemental_centerlines c on c.id=proof.centerline_id
    cross join lateral pg_catalog.jsonb_array_elements(c.name_events) event
    join private_verification.brinesearch_issue97_authoritative_road_segments_internal s
      on s.identity_id=proof.identity_id and s.source_segment_key=proof.source_segment_key and s.active
    cross join lateral (
      select overlap_line.geom,
        extensions.st_linelocatepoint(
          extensions.st_linemerge(extensions.st_transform(s.geom,3857)),
          extensions.st_startpoint(overlap_line.geom)
        ) as start_fraction,
        extensions.st_linelocatepoint(
          extensions.st_linemerge(extensions.st_transform(s.geom,3857)),
          extensions.st_endpoint(overlap_line.geom)
        ) as end_fraction
      from (
        select (dumped).geom
        from extensions.st_dump(extensions.st_collectionextract(extensions.st_intersection(
          extensions.st_transform(s.geom,3857),
          extensions.st_buffer(extensions.st_transform(c.geom,3857),1)
        ),2)) dumped
        order by extensions.st_length((dumped).geom) desc limit 1
      ) overlap_line
    ) overlap
    where nullif(pg_catalog.btrim(event->>'name'),'') is not null
    on conflict(identity_id,source_dataset_id,source_record_id,name_type,road_name) do update set
      normalized_name=excluded.normalized_name,source_segment_key=excluded.source_segment_key,
      from_measure=excluded.from_measure,to_measure=excluded.to_measure,
      provenance=excluded.provenance,active=true,last_seen_at=now(),updated_at=now();
    get diagnostics v_name_rows=row_count;

    v_content_digest:=private_verification.brinesearch_issue97_supplemental_scope_content_digest(p_run_id);
    if coalesce(v_content_digest,'')!~'^[0-9a-f]{32}$' then
      raise exception 'Issue #97 reviewed bridge did not produce a supplemental content digest';
    end if;

    update public.brinesearch_road_source_ingest_runs run set
      details=run.details||pg_catalog.jsonb_build_object(
        'content_digest',v_content_digest,
        'supplemental_materialization',
          coalesce(run.details->'supplemental_materialization','{}'::jsonb)||
          pg_catalog.jsonb_build_object(
            'mappings',(select count(*) from public.brinesearch_supplemental_centerline_identity_mappings m
              where m.dataset_id=v_run.dataset_id and m.state_code=v_run.state_code
                and m.county_code=v_run.county_code and m.ingest_run_id=p_run_id and m.active),
            'centerline_dispositions',(select count(*) from public.brinesearch_supplemental_centerline_dispositions d
              where d.dataset_id=v_run.dataset_id and d.state_code=v_run.state_code
                and d.county_code=v_run.county_code and d.ingest_run_id=p_run_id and d.active),
            'unmatched_held',(select count(*) from public.brinesearch_supplemental_centerline_dispositions d
              where d.dataset_id=v_run.dataset_id and d.state_code=v_run.state_code
                and d.county_code=v_run.county_code and d.ingest_run_id=p_run_id and d.active
                and d.disposition='unmatched_held'),
            'ambiguous_held',(select count(*) from public.brinesearch_supplemental_centerline_dispositions d
              where d.dataset_id=v_run.dataset_id and d.state_code=v_run.state_code
                and d.county_code=v_run.county_code and d.ingest_run_id=p_run_id and d.active
                and d.disposition='ambiguous'),
            'name_events_materialized',(select count(*) from public.brinesearch_authoritative_road_names n
              join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
              where n.source_dataset_id=v_run.dataset_id and n.active and i.active
                and i.state_code=v_run.state_code and i.county_code=v_run.county_code
                and n.provenance->>'ingest_run_id'=p_run_id::text),
            'reviewed_subsegment_bridge_count',v_expected,
            'name_matching_used',false,'nearest_road_matching_used',false,
            'every_centerline_disposed',true
          )
      )
    where run.id=p_run_id;

    -- Keep the dataset aggregate receipt in sync with the latest complete scope
    -- content digests after rematerialization.
    update public.brinesearch_road_source_datasets dataset set
      content_digest=(
        select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          latest.state_code||':'||latest.county_code||':'||latest.content_digest,
          ',' order by latest.state_code,latest.county_code
        ),''))
        from (
          select distinct on(r.state_code,r.county_code)
            r.state_code,r.county_code,r.details->>'content_digest' as content_digest
          from public.brinesearch_road_source_ingest_runs r
          where r.dataset_id=v_run.dataset_id and r.status='complete'
            and nullif(r.details->>'content_digest','') is not null
          order by r.state_code,r.county_code,r.started_at desc,r.id desc
        ) latest
      ),updated_at=now()
    where dataset.id=v_run.dataset_id;
  end if;

  v_result:=pg_catalog.jsonb_build_object(
    'run_id',p_run_id,'reviewed_bridges',v_expected,'proven_bridges',v_proven,
    'mapping_rows',v_mapping_rows,'disposition_rows',v_disposition_rows,
    'name_rows',v_name_rows,'content_digest',v_content_digest,
    'mapping_method','exact_source_subsegment_boundary_pair',
    'name_matching_used',false,'nearest_road_matching_used',false,
    'endpoint_snapping_used',false
  );
  return v_result;
end
$$;

revoke all on function private_verification.brinesearch_issue97_apply_reviewed_subsegment_bridges(uuid)
from public,anon,authenticated,service_role;

-- Wire the reviewed bridge into future PA supplemental finalization without
-- weakening the generic whole-feature geometry rule.
