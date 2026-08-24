-- GitHub #97 — source identity retirement hardening.
--
-- The first post-timestamp-fix Athens run reached finalization but timed out while
-- retiring source identities through public.brinesearch_authoritative_road_segments.
-- That normalized topology view is intentionally geometry-strict and is the wrong
-- source-presence test: an authoritative identity may remain valid/searchable even
-- when its source geometry is held from routable topology (for example a valid but
-- non-simple ODOT loop). Retire identities from exact source presence instead.

create or replace function public.brinesearch_issue97_finalize_ingest(
  p_run_id uuid,
  p_page_count integer,
  p_source_row_count integer,
  p_ingested_row_count integer,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_run record;
  v_lock record;
  v_source text;
  v_role text;
  v_source_county text;
  v_retired_segments integer:=0;
  v_retired_nodes integer:=0;
  v_retired_names integer:=0;
  v_retired_identities integer:=0;
  v_content_digest text;
  v_supplemental_result jsonb;
begin
  select r.dataset_id,r.county_code into v_lock
  from public.brinesearch_road_source_ingest_runs r where r.id=p_run_id;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_lock.dataset_id::text||':'||v_lock.county_code)
  );
  select r.*,d.source_key,d.topology_role into v_run
  from public.brinesearch_road_source_ingest_runs r
  join public.brinesearch_road_source_datasets d on d.id=r.dataset_id
  where r.id=p_run_id
  for update of r;
  if not found then raise exception 'Authoritative ingest run not found' using errcode='P0002'; end if;
  if v_run.status<>'loading' then
    raise exception 'Authoritative ingest run is not loading' using errcode='55000';
  end if;
  v_source:=v_run.source_key;
  v_role:=v_run.topology_role;
  if coalesce(p_page_count,0)<1 or coalesce(p_source_row_count,0)<0
     or coalesce(p_ingested_row_count,0)<0
     or (v_role in ('primary_network','at_grade_nodes')
       and coalesce(p_ingested_row_count,0)<>coalesce(p_source_row_count,0))
     or (v_role='primary_network' and coalesce(p_source_row_count,0)=0) then
    update public.brinesearch_road_source_ingest_runs set
      status='failed',completed_at=now(),page_count=greatest(coalesce(p_page_count,0),0),
      source_row_count=greatest(coalesce(p_source_row_count,0),0),
      ingested_row_count=greatest(coalesce(p_ingested_row_count,0),0),
      details=details||coalesce(p_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'coverage_complete',false,
        'failure','incomplete source coverage; stale rows were not retired'
      )
    where id=p_run_id;
    return pg_catalog.jsonb_build_object(
      'run_id',p_run_id,'status','failed','coverage_complete',false,
      'source_rows',greatest(coalesce(p_source_row_count,0),0),
      'ingested_rows',greatest(coalesce(p_ingested_row_count,0),0)
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_run.dataset_id::text||':'||v_run.county_code)
  );

  if v_source='oh_odot_tims_road_inventory' then
    select source_county_code into v_source_county
    from public.brinesearch_road_graph_counties
    where state_code='OH' and county_code=v_run.county_code;
    update public.brinesearch_odot_road_catalog
    set source_active=false
    where county_code=v_source_county and source_active and fetched_at<v_run.started_at;
    get diagnostics v_retired_segments=row_count;
    perform public.brinesearch_issue97_refresh_oh_identities(v_source_county);
  else
    update public.brinesearch_authoritative_external_road_segments
    set active=false
    where dataset_id=v_run.dataset_id and state_code=v_run.state_code
      and county_code=v_run.county_code and active and fetched_at<v_run.started_at;
    get diagnostics v_retired_segments=row_count;
    update public.brinesearch_authoritative_road_nodes
    set active=false
    where dataset_id=v_run.dataset_id and state_code=v_run.state_code
      and county_code=v_run.county_code and active and fetched_at<v_run.started_at;
    get diagnostics v_retired_nodes=row_count;
  end if;

  update public.brinesearch_authoritative_road_names n set active=false,updated_at=now()
  where n.source_dataset_id=v_run.dataset_id and n.active and n.last_seen_at<v_run.started_at
    and exists(select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=n.identity_id and i.state_code=v_run.state_code and i.county_code=v_run.county_code);
  get diagnostics v_retired_names=row_count;

  if v_role='primary_network' then
    if v_run.state_code='OH' then
      -- Ohio identities are source identities, not only topology identities.
      -- A held/non-simple source row must remain active/searchable even though
      -- the normalized route-segment view correctly excludes it from topology.
      update public.brinesearch_authoritative_road_identities i
      set active=false,last_seen_at=now()
      where i.dataset_id=v_run.dataset_id and i.state_code='OH'
        and i.county_code=v_run.county_code and i.active
        and not exists(
          select 1
          from public.brinesearch_authoritative_segment_identity_assignments a
          join public.brinesearch_odot_road_catalog c
            on a.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
          where a.dataset_id=v_run.dataset_id
            and a.identity_id=i.id and a.active
            and c.county_code=v_source_county and c.source_active
        );
    else
      update public.brinesearch_authoritative_road_identities i
      set active=false,last_seen_at=now()
      where i.dataset_id=v_run.dataset_id and i.state_code=v_run.state_code
        and i.county_code=v_run.county_code and i.active
        and not exists(
          select 1
          from public.brinesearch_authoritative_external_road_segments s
          where s.dataset_id=v_run.dataset_id and s.identity_id=i.id and s.active
        );
    end if;
    get diagnostics v_retired_identities=row_count;

    if v_run.state_code in ('WV','PA') then
      with aggregate_segments as (
        select s.identity_id,
          array_agg(distinct s.source_record_id order by s.source_record_id) as source_record_ids,
          pg_catalog.md5(pg_catalog.string_agg(
            s.source_segment_key||':'||s.source_digest,',' order by s.source_segment_key
          )) as source_digest,
          max(s.source_timestamp) as source_timestamp,
          count(*)::integer as segment_count,
          case
            when count(distinct s.public_access_status)=1 then min(s.public_access_status)
            else 'held'
          end as resolved_access,
          case
            when count(distinct s.drivable_status)=1 then min(s.drivable_status)
            else 'held'
          end as resolved_drivable
        from public.brinesearch_authoritative_external_road_segments s
        where s.dataset_id=v_run.dataset_id and s.state_code=v_run.state_code
          and s.county_code=v_run.county_code and s.active
        group by s.identity_id
      )
      update public.brinesearch_authoritative_road_identities i set
        source_record_ids=a.source_record_ids,source_digest=a.source_digest,
        source_timestamp=a.source_timestamp,active=true,last_seen_at=now(),
        public_access_status=a.resolved_access,drivable_status=a.resolved_drivable,
        attributes=i.attributes||pg_catalog.jsonb_build_object(
          'active_segment_count',a.segment_count,
          'identity_digest_method','ordered active source-segment digest',
          'identity_access_rule','held whenever active segment classifications disagree'
        )
      from aggregate_segments a where i.id=a.identity_id;
    end if;
  end if;

  if v_source in (
    'oh_ogrip_lbrs_centerlines',
    'pa_allegheny_ng911_centerlines','pa_bradford_ng911_centerlines',
    'pa_butler_centerlines','pa_fayette_ng911_centerlines',
    'pa_indiana_ng911_centerlines','pa_washington_ng911_centerlines'
  ) then
    v_supplemental_result:=public.brinesearch_issue97_refresh_supplemental_aliases(p_run_id);
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(x.digest,',' order by x.digest),''))
  into v_content_digest
  from (
    select s.source_digest as digest
    from public.brinesearch_authoritative_external_road_segments s
    where s.dataset_id=v_run.dataset_id and s.active
    union all
    select n.source_digest from public.brinesearch_authoritative_road_nodes n
    where n.dataset_id=v_run.dataset_id and n.active
    union all
    select c.source_digest
    from public.brinesearch_authoritative_supplemental_centerlines c
    where c.dataset_id=v_run.dataset_id and c.active
    union all
    select pg_catalog.md5(m.centerline_id::text||':'||m.identity_id::text||':'||
      m.mapping_status||':'||m.source_segment_keys::text||':'||m.evidence::text)
    from public.brinesearch_supplemental_centerline_identity_mappings m
    join public.brinesearch_authoritative_supplemental_centerlines c on c.id=m.centerline_id
    where c.dataset_id=v_run.dataset_id and c.active and m.active
    union all
    select pg_catalog.md5(d.centerline_id::text||':'||d.disposition||':'||
      d.candidate_count::text||':'||d.verified_mapping_count::text||':'||d.evidence::text)
    from public.brinesearch_supplemental_centerline_dispositions d
    where d.dataset_id=v_run.dataset_id and d.active
    union all
    select pg_catalog.md5(c.roadway_inventory_id||':'||c.attributes::text||':'
      ||coalesce(extensions.st_asewkb(c.geom)::text,'')||':'||c.source_active::text)
    from public.brinesearch_odot_road_catalog c
    where v_source='oh_odot_tims_road_inventory' and c.source_active
    union all
    select pg_catalog.md5(n.identity_id::text||':'||n.source_record_id||':'||n.road_name||':'||n.provenance::text)
    from public.brinesearch_authoritative_road_names n
    where n.source_dataset_id=v_run.dataset_id and n.active
  ) x;
  update public.brinesearch_road_source_datasets
  set fetched_at=now(),content_digest=v_content_digest,
    source_timestamp=case
      when coalesce(
        p_details#>>'{end_source_snapshot,service_last_edit_ms}',
        v_run.details#>>'{source_snapshot,service_last_edit_ms}'
      )~'^[0-9]+$'
      then pg_catalog.to_timestamp(coalesce(
        p_details#>>'{end_source_snapshot,service_last_edit_ms}',
        v_run.details#>>'{source_snapshot,service_last_edit_ms}'
      )::numeric/1000.0)
      else null
    end,
    updated_at=now()
  where id=v_run.dataset_id;
  update public.brinesearch_road_source_ingest_runs set
    status='complete',completed_at=now(),page_count=p_page_count,
    source_row_count=p_source_row_count,ingested_row_count=p_ingested_row_count,
    details=details||coalesce(p_details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'coverage_complete',true,'retired_segments',v_retired_segments,
      'retired_nodes',v_retired_nodes,'retired_names',v_retired_names,
      'retired_identities',v_retired_identities,'content_digest',v_content_digest,
      'identity_retirement_basis',case when v_run.state_code='OH'
        then 'active exact ODOT segment assignment/source row'
        else 'active authoritative external source segment' end,
      'supplemental_materialization',coalesce(v_supplemental_result,'{}'::jsonb)
    )
  where id=p_run_id;
  return pg_catalog.jsonb_build_object(
    'run_id',p_run_id,'status','complete','coverage_complete',true,
    'source_rows',p_source_row_count,'ingested_rows',p_ingested_row_count,
    'retired_segments',v_retired_segments,'retired_nodes',v_retired_nodes,
    'retired_names',v_retired_names,'retired_identities',v_retired_identities,
    'content_digest',v_content_digest
  );
end
$$;

revoke all on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb)
to service_role;

comment on function public.brinesearch_issue97_finalize_ingest(uuid,integer,integer,integer,jsonb) is
  'Issue #97 authoritative ingest finalizer. Identity retirement uses exact source presence, never the geometry-strict topology view; held source identities remain searchable while topology remains fail-closed.';
