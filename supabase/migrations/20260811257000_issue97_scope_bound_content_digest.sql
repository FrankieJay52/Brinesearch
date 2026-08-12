-- GitHub #97 — scope-bound source content-digest hardening.
--
-- Source ingestion is state/county scoped, but the original finalizer hashed every
-- active row for the entire dataset on every county finalization. As Ohio OGRIP
-- coverage grew, a 6,346-row Jefferson run completed ingest/materialization but
-- timed out while re-hashing all already-loaded Ohio counties. The run receipt
-- must describe the current source scope, while the registry-level dataset digest
-- can be derived cheaply from the latest complete per-scope receipt digests.
--
-- No identity or geometry matching semantics change here.

do $issue97_patch_scope_digest$
declare
  v_definition text;
  v_start integer;
  v_finish integer;
  v_replacement text:=$replacement$
select pg_catalog.md5(coalesce(pg_catalog.string_agg(x.digest,',' order by x.digest),''))
  into v_content_digest
  from (
    select s.source_digest as digest
    from public.brinesearch_authoritative_external_road_segments s
    where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code
      and s.county_code=v_run.county_code and s.active
    union all
    select n.source_digest
    from public.brinesearch_authoritative_road_nodes n
    where n.dataset_id=v_run.dataset_id and n.state_code=v_run.state_code
      and n.county_code=v_run.county_code and n.active
    union all
    select c.source_digest
    from public.brinesearch_authoritative_supplemental_centerlines c
    where c.dataset_id=v_run.dataset_id and c.state_code=v_run.state_code
      and c.county_code=v_run.county_code and c.active
    union all
    select pg_catalog.md5(m.centerline_id::text||':'||m.identity_id::text||':'||m.mapping_status||':'||m.source_segment_keys::text||':'||m.evidence::text)
    from public.brinesearch_supplemental_centerline_identity_mappings m
    join public.brinesearch_authoritative_supplemental_centerlines c on c.id=m.centerline_id
    where m.dataset_id=v_run.dataset_id and m.state_code=v_run.state_code
      and m.county_code=v_run.county_code and m.active and c.active
    union all
    select pg_catalog.md5(d.centerline_id::text||':'||d.disposition||':'||d.candidate_count::text||':'||d.verified_mapping_count::text||':'||d.evidence::text)
    from public.brinesearch_supplemental_centerline_dispositions d
    where d.dataset_id=v_run.dataset_id and d.state_code=v_run.state_code
      and d.county_code=v_run.county_code and d.active
    union all
    select pg_catalog.md5(c.roadway_inventory_id||':'||c.attributes::text||':'||coalesce(extensions.st_asewkb(c.geom)::text,'')||':'||c.source_active::text)
    from public.brinesearch_odot_road_catalog c
    where v_source='oh_odot_tims_road_inventory'
      and c.county_code=v_source_county and c.source_active
    union all
    select pg_catalog.md5(n.identity_id::text||':'||n.source_record_id||':'||n.road_name||':'||n.provenance::text)
    from public.brinesearch_authoritative_road_names n
    join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
    where n.source_dataset_id=v_run.dataset_id and n.active
      and i.state_code=v_run.state_code and i.county_code=v_run.county_code and i.active
  ) x;

  update public.brinesearch_road_source_datasets
  set fetched_at=now(),content_digest=(
      with latest_scope as (
        select distinct on(r.state_code,r.county_code)
          r.state_code,r.county_code,r.details->>'content_digest' as digest
        from public.brinesearch_road_source_ingest_runs r
        where r.dataset_id=v_run.dataset_id and r.status='complete'
          and r.id<>p_run_id and nullif(r.details->>'content_digest','') is not null
        order by r.state_code,r.county_code,r.started_at desc,r.id desc
      ), effective_scope as (
        select state_code,county_code,digest
        from latest_scope
        where not(state_code=v_run.state_code and county_code=v_run.county_code)
        union all
        select v_run.state_code,v_run.county_code,v_content_digest
      )
      select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        state_code||':'||county_code||':'||digest,',' order by state_code,county_code
      ),'')) from effective_scope
    ),
    source_timestamp=case
      when coalesce(p_details#>>'{end_source_snapshot,service_last_edit_ms}',v_run.details#>>'{source_snapshot,service_last_edit_ms}')~'^[0-9]+$'
      then pg_catalog.to_timestamp(coalesce(p_details#>>'{end_source_snapshot,service_last_edit_ms}',v_run.details#>>'{source_snapshot,service_last_edit_ms}')::numeric/1000.0)
      else null end,
    updated_at=now()
  where id=v_run.dataset_id;
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  v_start:=pg_catalog.strpos(
    v_definition,
    'select pg_catalog.md5(coalesce(pg_catalog.string_agg(x.digest,'','' order by x.digest),''''))'
  );
  v_finish:=pg_catalog.strpos(
    v_definition,
    'update public.brinesearch_road_source_ingest_runs set'
  );
  if v_start=0 or v_finish=0 or v_finish<=v_start then
    raise exception 'Issue #97 scope digest block changed unexpectedly: start=% finish=%',v_start,v_finish;
  end if;

  v_definition:=pg_catalog.substr(v_definition,1,v_start-1)
    ||v_replacement
    ||pg_catalog.substr(v_definition,v_finish);
  execute v_definition;
end
$issue97_patch_scope_digest$;

revoke all on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
to service_role;

comment on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb) is
  'Issue #97 authoritative ingest finalizer. Content receipts are state/county-scope bound; the source-registry dataset digest is aggregated from latest complete scope digests. Identity retirement remains exact source-assignment/source-segment based; no topology/name/nearest-road inference.';
