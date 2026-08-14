\set ON_ERROR_STOP on
\pset pager off

begin read only;
set local statement_timeout='2min';

do $issue97_dark_plan_gate$
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 dark-build plan blocked: global cutover is active';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'Issue #97 dark-build plan blocked: a staging build exists';
  end if;
end
$issue97_dark_plan_gate$;

with registered as (
  select county.state_code,county.county_code,county.county_name
  from public.brinesearch_road_graph_counties county
  where county.active
), candidate_builds as (
  select build.*
  from public.brinesearch_road_graph_builds build
  join registered using(state_code,county_code)
  where build.status in ('active','validated')
), build_freshness as (
  select build.id,build.state_code,build.county_code,build.status,
    pg_catalog.jsonb_array_length(
      coalesce(build.details->'source_run_vector','[]'::jsonb)
    )>0
    and not exists(
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(build.details->'source_run_vector','[]'::jsonb)
      ) entry
      left join lateral (
        select run.id
        from public.brinesearch_road_source_ingest_runs run
        where run.dataset_id=(entry->>'dataset_id')::uuid
          and run.state_code=entry->>'state_code'
          and run.county_code=entry->>'county_code'
        order by run.started_at desc,run.id desc
        limit 1
      ) latest on true
      where latest.id is distinct from (entry->>'run_id')::uuid
    ) as source_vector_latest,
    nullif(build.details->>'mapping_snapshot_digest','') is not null
    and build.details->>'mapping_snapshot_digest'=(
      select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        current_map.identity_id::text||':'||current_map.fingerprint,
        ',' order by current_map.identity_id
      ),''))
      from (
        select identities.identity_id,
          pg_catalog.md5(pg_catalog.concat_ws('|',
            identities.identity_id::text,
            coalesce(mapping.road_id::text,'unmapped'),
            coalesce(mapping.mapping_method,''),
            coalesce(
              case
                when build.details->>'mapping_snapshot_version'='issue97-graph-mapping-v2'
                  then private_verification.brinesearch_issue97_graph_mapping_evidence(
                    mapping.mapping_method,mapping.evidence
                  )
                when nullif(build.details->>'mapping_snapshot_version','') is null
                  then mapping.evidence
                else null
              end::text,''
            ),
            coalesce(road.canonical_name,''),
            coalesce(road.state,''),
            coalesce(road.county,''),
            coalesce(road.township,''),
            coalesce(road.road_type,''),
            coalesce(road.route_number,''),
            coalesce(road.source_record_id,''),
            coalesce(road.verification_status,''),
            coalesce(road.candidate_only::text,''),
            coalesce(road.geometry_status,''),
            coalesce(pg_catalog.md5(road.centerline_geojson::text),'')
          )) as fingerprint
        from (
          select distinct membership.identity_id
          from public.brinesearch_road_junction_memberships membership
          join public.brinesearch_road_junctions junction
            on junction.id=membership.junction_id
          where junction.build_id=build.id
        ) identities
        left join public.brinesearch_road_identity_mappings mapping
          on mapping.identity_id=identities.identity_id
         and mapping.mapping_status='verified'
        left join public.brinesearch_roads road on road.id=mapping.road_id
      ) current_map
    ) as mapping_current
  from candidate_builds build
), plan as (
  select registered.state_code,registered.county_code,registered.county_name
  from registered
  where registered.state_code||':'||registered.county_code
      not in ('OH:BEL','OH:JEF','OH:NOB')
    and not exists(
      select 1
      from build_freshness fresh
      where fresh.state_code=registered.state_code
        and fresh.county_code=registered.county_code
        and fresh.source_vector_latest
        and fresh.mapping_current
    )
    and not exists(
      select 1
      from public.brinesearch_road_graph_builds build
      where build.state_code=registered.state_code
        and build.county_code=registered.county_code
        and build.status='staging'
    )
)
select state_code,county_code
from plan
order by
  case
    when state_code='PA' and county_code='WAS' then 0
    when state_code='PA' then 1
    when state_code='WV' then 2
    when state_code='OH' then 3
    else 4
  end,
  county_code;

commit;
