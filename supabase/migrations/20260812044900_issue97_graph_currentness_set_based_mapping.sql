-- GitHub #97 — preserve graph-build currentness semantics while removing the
-- per-identity mapping-fingerprint function call that made active-build checks
-- exceed the production statement timeout during full corpus reconciliation.
--
-- The fingerprint expression below is byte-for-byte equivalent in inputs/order to
-- brinesearch_issue97_mapping_fingerprint(identity_id), but computes all identities
-- in one joined aggregate. Source-run freshness and required-scope checks are
-- unchanged.

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
        from pg_catalog.jsonb_array_elements(coalesce(
          b.details->'source_run_vector','[]'::jsonb
        )) entry
      ) unique_entries
    )
    and not exists(
      select 1 from pg_catalog.jsonb_array_elements(
        coalesce(b.details->'source_run_vector','[]'::jsonb)
      ) entry
      where not exists(
        select 1
        from public.brinesearch_road_source_ingest_runs r
        join public.brinesearch_road_source_datasets d
          on d.id=r.dataset_id and d.active
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
        select distinct entry->>'state_code' as state_code,
          entry->>'county_code' as county_code
        from pg_catalog.jsonb_array_elements(coalesce(
          b.details->'source_run_vector','[]'::jsonb
        )) entry
      )
      select 1
      from touched
      join public.brinesearch_road_source_dataset_counties scope
        on scope.state_code=touched.state_code and scope.county_code=touched.county_code
        and scope.active and scope.ingest_enabled and scope.required_for_graph
      join public.brinesearch_road_source_datasets d
        on d.id=scope.dataset_id and d.active
      where not exists(
        select 1 from pg_catalog.jsonb_array_elements(coalesce(
          b.details->'source_run_vector','[]'::jsonb
        )) entry
        where (entry->>'dataset_id')::uuid=scope.dataset_id
          and entry->>'state_code'=scope.state_code
          and entry->>'county_code'=scope.county_code
      )
    )
    and nullif(b.details->>'mapping_snapshot_digest','') is not null
    and b.details->>'mapping_snapshot_digest'=(
      select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        current_map.identity_id::text||':'||pg_catalog.md5(pg_catalog.concat_ws('|',
          current_map.identity_id::text,
          coalesce(current_map.road_id::text,'unmapped'),
          coalesce(current_map.mapping_method,''),
          coalesce(current_map.mapping_evidence::text,''),
          coalesce(current_map.canonical_name,''),
          coalesce(current_map.road_state,''),
          coalesce(current_map.road_county,''),
          coalesce(current_map.road_township,''),
          coalesce(current_map.road_type,''),
          coalesce(current_map.route_number,''),
          coalesce(current_map.source_record_id,''),
          coalesce(current_map.verification_status,''),
          coalesce(current_map.candidate_only::text,''),
          coalesce(current_map.geometry_status,''),
          coalesce(pg_catalog.md5(current_map.centerline_geojson::text),'')
        )),',' order by current_map.identity_id
      ),''))
      from (
        select identities.identity_id,m.road_id,m.mapping_method,m.evidence as mapping_evidence,
          road.canonical_name,road.state as road_state,road.county as road_county,
          road.township as road_township,road.road_type,road.route_number,
          road.source_record_id,road.verification_status,road.candidate_only,
          road.geometry_status,road.centerline_geojson
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

-- Verify the set-based expression stays aligned with the canonical helper for a
-- bounded real sample. This is an equality proof, not a substitute data source.
do $issue97_verify_graph_currentness_set_based$
declare
  v_mismatch integer;
  v_definition text;
begin
  with ids as (
    select distinct membership.identity_id
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    join public.brinesearch_road_graph_builds build on build.id=junction.build_id
    where build.status='active'
    order by membership.identity_id
    limit 1000
  ), compare as (
    select ids.identity_id,
      private_verification.brinesearch_issue97_mapping_fingerprint(ids.identity_id) as helper_fingerprint,
      pg_catalog.md5(pg_catalog.concat_ws('|',
        ids.identity_id::text,coalesce(m.road_id::text,'unmapped'),
        coalesce(m.mapping_method,''),coalesce(m.evidence::text,''),
        coalesce(road.canonical_name,''),coalesce(road.state,''),coalesce(road.county,''),
        coalesce(road.township,''),coalesce(road.road_type,''),coalesce(road.route_number,''),
        coalesce(road.source_record_id,''),coalesce(road.verification_status,''),
        coalesce(road.candidate_only::text,''),coalesce(road.geometry_status,''),
        coalesce(pg_catalog.md5(road.centerline_geojson::text),'')
      )) as set_fingerprint
    from ids
    left join public.brinesearch_road_identity_mappings m
      on m.identity_id=ids.identity_id and m.mapping_status='verified'
    left join public.brinesearch_roads road on road.id=m.road_id
  )
  select count(*)::integer into v_mismatch from compare
  where helper_fingerprint is distinct from set_fingerprint;

  if v_mismatch<>0 then
    raise exception 'Issue #97 set-based mapping fingerprint mismatch: %',v_mismatch;
  end if;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_graph_build_sources_current(uuid)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition like '%brinesearch_issue97_mapping_fingerprint(current_map.identity_id)%'
     or v_definition not like '%current_map.mapping_evidence%'
     or v_definition not like '%current_map.centerline_geojson%'
  then raise exception 'Issue #97 graph currentness set-based mapping proof did not install cleanly'; end if;
end
$issue97_verify_graph_currentness_set_based$;
