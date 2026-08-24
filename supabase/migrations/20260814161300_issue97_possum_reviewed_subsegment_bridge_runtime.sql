-- GitHub #97 — continuation of reviewed PA/WAS supplemental subsegment bridge rollout.
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
);

do $issue97_patch_pa_supplemental_core$
declare
  v_definition text;
  v_patched text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_refresh_supplemental_aliases_issue97_core(uuid)'::pg_catalog.regprocedure
  ) into strict v_definition;
  if pg_catalog.md5(v_definition)<>'0a3111241993908bd3b58c35a3a8eb23' then
    raise exception 'Issue #97 PA supplemental core changed before reviewed bridge patch';
  end if;

  v_old:=$old$  v_target_runs jsonb:='[]'::jsonb;
  v_expected_target_runs integer;$old$;
  v_new:=$new$  v_target_runs jsonb:='[]'::jsonb;
  v_expected_target_runs integer;
  v_reviewed_bridge_result jsonb:='{}'::jsonb;$new$;
  v_patched:=pg_catalog.replace(v_definition,v_old,v_new);
  if v_patched=v_definition then
    raise exception 'Issue #97 PA supplemental core declaration anchor changed';
  end if;

  v_old:=$old$  get diagnostics v_mapping_count=row_count;

  insert into public.brinesearch_supplemental_centerline_dispositions($old$;
  v_new:=$new$  get diagnostics v_mapping_count=row_count;
  if v_run.state_code='PA' then
    v_reviewed_bridge_result:=private_verification.brinesearch_issue97_apply_reviewed_subsegment_bridges(p_run_id);
    v_mapping_count:=v_mapping_count+coalesce((v_reviewed_bridge_result->>'mapping_rows')::integer,0);
  end if;

  insert into public.brinesearch_supplemental_centerline_dispositions($new$;
  if (pg_catalog.length(v_patched)-pg_catalog.length(pg_catalog.replace(v_patched,v_old,'')))
       /pg_catalog.length(v_old)<>1 then
    raise exception 'Issue #97 PA supplemental core mapping-count anchor changed';
  end if;
  v_patched:=pg_catalog.replace(v_patched,v_old,v_new);

  execute v_patched;
end
$issue97_patch_pa_supplemental_core$;

-- Rematerialize only the two independently reviewed bridges on the exact current
-- Washington NG911 run. The helper revalidates source geometry before writing.
do $issue97_apply_current_possum_bridges$
declare
  v_run uuid;
  v_result jsonb;
begin
  select r.id into strict v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
  where d.source_key='pa_washington_ng911_centerlines'
    and r.state_code='PA' and r.county_code='WAS'
  order by r.started_at desc,r.id desc limit 1;

  if not private_verification.brinesearch_issue97_ingest_run_verified(v_run)
     or (select details->>'page_set_digest' from public.brinesearch_road_source_ingest_runs where id=v_run)
          <> 'af72c01100aa90636ba0d40304724531'
     or (select source_row_count from public.brinesearch_road_source_ingest_runs where id=v_run)<>20447
     or (select details#>>'{source_snapshot,object_id_set_digest}' from public.brinesearch_road_source_ingest_runs where id=v_run)
          <> '1072f796d437a8e9bf94bb025785ea8e' then
    raise exception 'Issue #97 Washington NG911 current run changed before Possum bridge migration';
  end if;

  v_result:=private_verification.brinesearch_issue97_apply_reviewed_subsegment_bridges(v_run);
  if (v_result->>'reviewed_bridges')::integer<>2
     or (v_result->>'proven_bridges')::integer<>2
     or coalesce((v_result->>'mapping_rows')::integer,0)<>2 then
    raise exception 'Issue #97 Possum bridge rematerialization was not exactly two reviewed mappings: %',v_result;
  end if;
end
$issue97_apply_current_possum_bridges$;

-- Exact fixture verification: two mappings, two current dispositions, and both
-- 911/legacy alias events on the exact PennDOT source segments.
do $issue97_verify_current_possum_bridges$
declare
  v_count integer;
  v_run uuid;
begin
  select r.id into strict v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets source on source.id=r.dataset_id
  where source.source_key='pa_washington_ng911_centerlines'
    and r.state_code='PA' and r.county_code='WAS'
    and r.status='complete' and r.details->>'page_set_digest'='af72c01100aa90636ba0d40304724531'
    and r.source_row_count=20447
    and r.details#>>'{source_snapshot,object_id_set_digest}'='1072f796d437a8e9bf94bb025785ea8e';
  select count(*) into v_count
  from (values
    ('pa_washington_ng911_centerlines:NGUID:RCL22649@co.washington.pa.us:SCOPE:PA:WAS',
      'PA:PENNDOT:LOCAL:62:2049:110961:EJM9','PA:PENNDOT:LOCAL:SEGMENT:379767'),
    ('pa_washington_ng911_centerlines:NGUID:RCL39851@co.washington.pa.us:SCOPE:PA:WAS',
      'PA:PENNDOT:LOCAL:62:2061:107905:EHBS','PA:PENNDOT:LOCAL:SEGMENT:386101')
  ) expected(feature_key,identity_key,segment_key)
  join public.brinesearch_authoritative_supplemental_centerlines c
    on c.source_feature_key=expected.feature_key and c.active and c.last_ingest_run_id=v_run
  join public.brinesearch_authoritative_road_identities i
    on i.source_identity_key=expected.identity_key and i.active
  join public.brinesearch_supplemental_centerline_identity_mappings m
    on m.centerline_id=c.id and m.identity_id=i.id and m.ingest_run_id=v_run and m.active
    and m.mapping_status='verified' and m.mapping_method='exact_source_subsegment_boundary_pair'
    and m.source_segment_keys=array[expected.segment_key]
    and m.evidence->>'name_used_for_mapping'='false'
    and m.evidence->>'nearest_road_used_for_mapping'='false'
  join public.brinesearch_supplemental_centerline_dispositions d
    on d.centerline_id=c.id and d.ingest_run_id=v_run and d.active
    and d.disposition='verified' and d.candidate_count=1 and d.verified_mapping_count=1
  where exists(select 1 from public.brinesearch_authoritative_road_names n
      where n.identity_id=i.id and n.source_dataset_id=c.dataset_id and n.active
        and n.source_segment_key=expected.segment_key and n.name_type='911'
        and n.source_record_id like c.source_feature_key||':%')
    and exists(select 1 from public.brinesearch_authoritative_road_names n
      where n.identity_id=i.id and n.source_dataset_id=c.dataset_id and n.active
        and n.source_segment_key=expected.segment_key and n.name_type='legacy'
        and n.source_record_id like c.source_feature_key||':%');
  if v_count<>2 then
    raise exception 'Issue #97 required Possum Hollow reviewed bridge fixtures failed: %',v_count;
  end if;

  if (select details->>'content_digest' from public.brinesearch_road_source_ingest_runs where id=v_run)
       is distinct from private_verification.brinesearch_issue97_supplemental_scope_content_digest(v_run) then
    raise exception 'Issue #97 Washington supplemental run content digest is stale after Possum bridge rematerialization';
  end if;
end
$issue97_verify_current_possum_bridges$;
