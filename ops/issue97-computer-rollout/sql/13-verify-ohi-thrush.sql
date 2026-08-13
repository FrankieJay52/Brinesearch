\set ON_ERROR_STOP on
\pset pager off
\timing on

begin read only;
set local statement_timeout='5min';

do $verify_ohi$
declare
  v_build uuid;
  v_target uuid;
  v_cardinal uuid;
  v_junction uuid;
  v_actual text[];
  v_count integer;
  fixture record;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Issue #97 global cutover must remain off';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds
      where state_code='WV' and county_code='OHI')<>1 then
    raise exception 'OHI must have exactly one graph build at this checkpoint';
  end if;
  select build.id into strict v_build
  from public.brinesearch_road_graph_builds build
  where build.state_code='WV' and build.county_code='OHI'
    and build.status='validated' and build.activated_at is null;
  if not private_verification.brinesearch_issue97_graph_build_sources_current(v_build) then
    raise exception 'OHI validated graph is not source/mapping current';
  end if;
  if exists(select 1 from public.brinesearch_road_graph_builds where status='staging') then
    raise exception 'A staging graph exists after OHI build';
  end if;
  if (select count(*)
      from public.brinesearch_road_source_datasets dataset
      join public.brinesearch_road_source_dataset_counties scope
        on scope.dataset_id=dataset.id and scope.state_code='WV' and scope.county_code='OHI'
      where dataset.source_key in (
        'wv_wvdot_publication_lrs','wv_wvdot_street_name_doh',
        'wv_wvdot_street_name_sams','wv_wvdot_alternate_route_name'
      ) and dataset.active and scope.active and scope.ingest_enabled
        and scope.required_for_graph
        and private_verification.brinesearch_issue97_dataset_scope_current(
          dataset.id,'WV','OHI'
        ))<>4 then
    raise exception 'OHI four-feed WVDOT source-current contract failed';
  end if;
  if (select count(*) from public.brinesearch_road_graph_builds build
      where build.state_code='OH' and build.county_code in ('BEL','JEF','NOB')
        and build.status='active'
        and private_verification.brinesearch_issue97_graph_build_sources_current(build.id))<>3 then
    raise exception 'BEL/JEF/NOB frozen currentness changed';
  end if;

  select identity.id into strict v_target
  from public.brinesearch_authoritative_road_identities identity
  where identity.source_identity_key='WV:WVDOT:ROUTE_ID:3500895000000'
    and identity.active;

  select count(*) into v_count
  from public.brinesearch_road_junction_memberships membership
  join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
  where junction.build_id=v_build and junction.verification_status='verified'
    and membership.identity_id=v_target;
  if v_count<>4 then
    raise exception 'Thrush must have exactly 4 physical junction memberships; found %',v_count;
  end if;

  for fixture in select * from (values
    (-80.7132635::numeric,40.0836389::numeric,'t_junction'::text,
      array['WV:WVDOT:ROUTE_ID:3500895000000','WV:WVDOT:ROUTE_ID:3578278001900']::text[]),
    (-80.7132025::numeric,40.0841629::numeric,'t_junction'::text,
      array['WV:WVDOT:ROUTE_ID:3500329000000','WV:WVDOT:ROUTE_ID:3500895000000']::text[]),
    (-80.7127235::numeric,40.0848739::numeric,'t_junction'::text,
      array['WV:WVDOT:ROUTE_ID:3500895000000','WV:WVDOT:ROUTE_ID:3501102000000']::text[]),
    (-80.7129895::numeric,40.0855589::numeric,'multiway'::text,
      array[
        'WV:WVDOT:ROUTE_ID:3500272000000',
        'WV:WVDOT:ROUTE_ID:3500895000000',
        'WV:WVDOT:ROUTE_ID:3501008000000'
      ]::text[])
  ) expected(lng,lat,expected_type,expected_keys)
  loop
    select junction.id into strict v_junction
    from public.brinesearch_road_junctions junction
    where junction.build_id=v_build and junction.verification_status='verified'
      and pg_catalog.round(extensions.st_x(junction.geom)::numeric,7)=fixture.lng
      and pg_catalog.round(extensions.st_y(junction.geom)::numeric,7)=fixture.lat
      and exists(
        select 1 from public.brinesearch_road_junction_memberships membership
        where membership.junction_id=junction.id and membership.identity_id=v_target
      );

    select pg_catalog.array_agg(identity.source_identity_key order by identity.source_identity_key)
      into v_actual
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=membership.identity_id
    where membership.junction_id=v_junction;

    if v_actual is distinct from fixture.expected_keys then
      raise exception 'Thrush member set changed at %, %: %',fixture.lng,fixture.lat,v_actual;
    end if;
    if (select junction_type from public.brinesearch_road_junctions where id=v_junction)
         is distinct from fixture.expected_type then
      raise exception 'Thrush junction type changed at %, %; expected %',
        fixture.lng,fixture.lat,fixture.expected_type;
    end if;
    if fixture.expected_type<>'multiway' and (
      select count(*) from public.brinesearch_road_junction_memberships
      where junction_id=v_junction
    )<>2 then
      raise exception 'Thrush non-Cardinal junction must contain exactly two identities';
    end if;
    if fixture.expected_type='multiway' then v_cardinal:=v_junction; end if;
  end loop;

  if v_cardinal is null then raise exception 'Cardinal multiway was not found'; end if;

  select pg_catalog.array_agg(actual.source_identity_key order by actual.source_identity_key)
    into v_actual
  from (
    select distinct connected_identity.source_identity_key
    from public.brinesearch_road_junction_memberships own
    join public.brinesearch_road_junctions junction on junction.id=own.junction_id
    join public.brinesearch_road_junction_memberships connected
      on connected.junction_id=junction.id and connected.identity_id<>v_target
    join public.brinesearch_authoritative_road_identities connected_identity
      on connected_identity.id=connected.identity_id
    where junction.build_id=v_build and junction.verification_status='verified'
      and own.identity_id=v_target
  ) actual;
  if v_actual is distinct from array[
    'WV:WVDOT:ROUTE_ID:3500272000000',
    'WV:WVDOT:ROUTE_ID:3500329000000',
    'WV:WVDOT:ROUTE_ID:3501008000000',
    'WV:WVDOT:ROUTE_ID:3501102000000',
    'WV:WVDOT:ROUTE_ID:3578278001900'
  ]::text[] then
    raise exception 'Thrush exact five-identity connection set changed: %',v_actual;
  end if;

  if exists(
    select 1
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=v_build and membership.identity_id=v_target
      and junction.verification_status='verified'
      and (
        junction.junction_type in ('shared_segment','name_change')
        or junction.source_method<>'exact_authoritative_source_vertex'
        or coalesce((junction.source_provenance->>'grade_conflict')::boolean,false)
        or coalesce(
          (junction.source_provenance->>'name_matching_used_for_topology')::boolean,false
        )
        or coalesce(
          junction.source_provenance->'source_exact_coordinate_evidence','[]'::jsonb
        )='[]'::jsonb
        or not ('Thrush Ave'=any(membership.aliases_at_junction))
        or membership.distance_along_road_m is null
        or membership.distance_along_road_m<0
      )
  ) then
    raise exception 'Thrush admitted a held/name/shared/grade connection or lost exact provenance';
  end if;

  if exists(
    select 1
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    where junction.build_id=v_build and membership.identity_id=v_target
      and junction.verification_status='held'
      and (
        junction.confidence<>'held'
        or not (
          coalesce((junction.source_provenance->>'grade_conflict')::boolean,false)
          or not coalesce(
            (junction.source_provenance->>'topology_supported')::boolean,false
          )
        )
      )
  ) then
    raise exception 'Thrush held evidence is not an explicit grade/topology hold';
  end if;

  if exists(
    select 1
    from public.brinesearch_road_identity_mappings mapping
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=mapping.identity_id
    where identity.source_identity_key=any(array[
      'WV:WVDOT:ROUTE_ID:3500895000000','WV:WVDOT:ROUTE_ID:3578278001900',
      'WV:WVDOT:ROUTE_ID:3500329000000','WV:WVDOT:ROUTE_ID:3501102000000',
      'WV:WVDOT:ROUTE_ID:3500272000000','WV:WVDOT:ROUTE_ID:3501008000000'
    ]::text[])
      and mapping.mapping_status='verified'
      and (
        mapping.mapping_method in ('name_only','fuzzy_name','nearest_road','route_number_only')
        or coalesce((mapping.evidence->>'fuzzy_matching_used')::boolean,false)
        or coalesce((mapping.evidence->>'nearest_road_used')::boolean,false)
        or coalesce((mapping.evidence->>'name_matching_used')::boolean,false)
        or coalesce((mapping.evidence->>'uses_name_only')::boolean,false)
        or coalesce((mapping.evidence->>'uses_fuzzy_name')::boolean,false)
        or coalesce((mapping.evidence->>'uses_nearest_road')::boolean,false)
      )
  ) then
    raise exception 'Thrush fixture contains a forbidden mapping proof';
  end if;

  if exists(
    select 1
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=membership.identity_id
    where junction.build_id=v_build and junction.verification_status='verified'
      and identity.source_identity_key=any(array[
        'WV:WVDOT:ROUTE_ID:3500895000000','WV:WVDOT:ROUTE_ID:3578278001900',
        'WV:WVDOT:ROUTE_ID:3500329000000','WV:WVDOT:ROUTE_ID:3501102000000',
        'WV:WVDOT:ROUTE_ID:3500272000000','WV:WVDOT:ROUTE_ID:3501008000000'
      ]::text[])
      and (
        membership.provenance->>'source_identity_key'
          is distinct from identity.source_identity_key
        or membership.provenance->>'source_digest' is distinct from identity.source_digest
        or nullif(membership.approach_data->>'chosen_source_segment_key','') is null
        or not ((membership.approach_data->>'chosen_source_segment_key')
          =any(membership.source_segment_keys))
      )
      and exists(
        select 1
        from public.brinesearch_road_junction_memberships own
        where own.junction_id=junction.id and own.identity_id=v_target
      )
  ) then
    raise exception 'Thrush membership identity/source-segment provenance changed';
  end if;

  for fixture in select * from (values
    ('WV:WVDOT:ROUTE_ID:3578278001900','Mt Wood Rd'),
    ('WV:WVDOT:ROUTE_ID:3500329000000','Finch Ave'),
    ('WV:WVDOT:ROUTE_ID:3501102000000','Northwood Dr'),
    ('WV:WVDOT:ROUTE_ID:3500272000000','E Cardinal Ave'),
    ('WV:WVDOT:ROUTE_ID:3501008000000','W Cardinal Ave')
  ) expected(identity_key,required_alias)
  loop
    if not exists(
      select 1
      from public.brinesearch_road_junction_memberships own
      join public.brinesearch_road_junctions junction on junction.id=own.junction_id
      join public.brinesearch_road_junction_memberships connected
        on connected.junction_id=junction.id
      join public.brinesearch_authoritative_road_identities identity
        on identity.id=connected.identity_id
      where junction.build_id=v_build and junction.verification_status='verified'
        and own.identity_id=v_target
        and identity.source_identity_key=fixture.identity_key
        and fixture.required_alias=any(connected.aliases_at_junction)
    ) then
      raise exception 'Thrush connected alias missing: %',fixture.required_alias;
    end if;
  end loop;

  if not exists(
    select 1
    from public.brinesearch_road_junction_memberships own
    join public.brinesearch_road_junctions junction on junction.id=own.junction_id
    join public.brinesearch_road_junction_memberships mt on mt.junction_id=junction.id
    join public.brinesearch_authoritative_road_identities identity on identity.id=mt.identity_id
    where junction.build_id=v_build and junction.verification_status='verified'
      and own.identity_id=v_target
      and identity.source_identity_key='WV:WVDOT:ROUTE_ID:3578278001900'
      and 'WV:WVDOT:SEGMENT:1774131'=any(mt.source_segment_keys)
      and 'WV:WVDOT:SEGMENT:1861464'=any(mt.source_segment_keys)
      and (select count(*) from public.brinesearch_road_junction_memberships duplicate
        where duplicate.junction_id=junction.id and duplicate.identity_id=mt.identity_id)=1
  ) then
    raise exception 'Mt Wood temporal rows did not collapse to one identity membership';
  end if;

  if not exists(
    select 1
    from public.brinesearch_road_junction_memberships membership
    join public.brinesearch_authoritative_road_identities identity
      on identity.id=membership.identity_id
    where membership.junction_id=v_cardinal
      and identity.source_identity_key='WV:WVDOT:ROUTE_ID:3501008000000'
      and membership.source_measure=0 and membership.distance_along_road_m=0
      and (membership.approach_data->>'raw_source_measure')::numeric
        =(-0.000000027168425731360912)::numeric
      and membership.approach_data->>'source_measure_normalized'='true'
      and (membership.approach_data->>'endpoint_measure_normalization_bound_miles')::numeric
        =0.0000001::numeric
      and 'W Cardinal Ave'=any(membership.aliases_at_junction)
  ) then
    raise exception 'W Cardinal endpoint normalization/alias/raw provenance changed';
  end if;

  if not exists(
    select 1
    from public.brinesearch_road_junction_memberships membership
    where membership.junction_id=v_cardinal and membership.identity_id=v_target
      and pg_catalog.abs(
        membership.source_measure-0.143000002484769::numeric
      )<0.000000000001::numeric
      and pg_catalog.abs(
        (membership.approach_data->>'raw_source_measure')::numeric-membership.source_measure
      )<0.000000000001::numeric
      and pg_catalog.abs(
        membership.distance_along_road_m-membership.source_measure*1609.344
      )<0.000000001::numeric
      and membership.approach_data->>'source_measure_normalized'='false'
      and 'Thrush Ave'=any(membership.aliases_at_junction)
  ) then
    raise exception 'Thrush upper endpoint alias/raw provenance changed';
  end if;

  if exists(
    select 1 from (
      select membership.distance_along_road_m,
        pg_catalog.lag(membership.distance_along_road_m)
          over(order by membership.source_measure) as prior_distance
      from public.brinesearch_road_junction_memberships membership
      join public.brinesearch_road_junctions junction on junction.id=membership.junction_id
      where junction.build_id=v_build and junction.verification_status='verified'
        and membership.identity_id=v_target
    ) ordered
    where distance_along_road_m is null
      or (prior_distance is not null and distance_along_road_m<=prior_distance)
  ) then
    raise exception 'Thrush authoritative measures are not strictly ordered';
  end if;
end
$verify_ohi$;

select build.id as validated_build_id,build.graph_digest,
  build.source_revision_digest,build.source_segment_count,build.identity_count,
  build.point_junction_count,build.shared_segment_count,build.membership_count,
  build.details->>'held_junction_count' as held_junction_count,
  private_verification.brinesearch_issue97_graph_build_sources_current(build.id)
    as sources_current
from public.brinesearch_road_graph_builds build
where build.state_code='WV' and build.county_code='OHI';

select pg_catalog.round(extensions.st_x(junction.geom)::numeric,7) as longitude,
  pg_catalog.round(extensions.st_y(junction.geom)::numeric,7) as latitude,
  junction.junction_type,junction.source_method,junction.confidence,
  pg_catalog.array_agg(identity.source_identity_key order by identity.source_identity_key)
    as exact_identity_keys,
  pg_catalog.array_agg(membership.road_name_at_junction order by identity.source_identity_key)
    as primary_names,
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(membership.aliases_at_junction)
    order by identity.source_identity_key) as aliases
from public.brinesearch_road_graph_builds build
join public.brinesearch_road_junctions junction on junction.build_id=build.id
join public.brinesearch_road_junction_memberships membership on membership.junction_id=junction.id
join public.brinesearch_authoritative_road_identities identity on identity.id=membership.identity_id
where build.state_code='WV' and build.county_code='OHI' and build.status='validated'
  and exists(
    select 1 from public.brinesearch_road_junction_memberships own
    join public.brinesearch_authoritative_road_identities target on target.id=own.identity_id
    where own.junction_id=junction.id
      and target.source_identity_key='WV:WVDOT:ROUTE_ID:3500895000000'
  )
group by junction.id,junction.geom,junction.junction_type,junction.source_method,junction.confidence
order by latitude,longitude;

select identity.source_identity_key,junction.junction_type,
  pg_catalog.round(extensions.st_x(junction.geom)::numeric,7) as longitude,
  pg_catalog.round(extensions.st_y(junction.geom)::numeric,7) as latitude,
  membership.source_segment_keys,membership.source_measure,
  membership.distance_along_road_m,membership.approach_data,membership.provenance
from public.brinesearch_road_graph_builds build
join public.brinesearch_road_junctions junction on junction.build_id=build.id
join public.brinesearch_road_junction_memberships membership on membership.junction_id=junction.id
join public.brinesearch_authoritative_road_identities identity on identity.id=membership.identity_id
where build.state_code='WV' and build.county_code='OHI' and build.status='validated'
  and identity.source_identity_key=any(array[
    'WV:WVDOT:ROUTE_ID:3500895000000','WV:WVDOT:ROUTE_ID:3578278001900',
    'WV:WVDOT:ROUTE_ID:3500329000000','WV:WVDOT:ROUTE_ID:3501102000000',
    'WV:WVDOT:ROUTE_ID:3500272000000','WV:WVDOT:ROUTE_ID:3501008000000'
  ]::text[])
  and exists(
    select 1 from public.brinesearch_road_junction_memberships own
    join public.brinesearch_authoritative_road_identities target on target.id=own.identity_id
    where own.junction_id=junction.id
      and target.source_identity_key='WV:WVDOT:ROUTE_ID:3500895000000'
  )
order by latitude,longitude,identity.source_identity_key;

select junction.id,junction.junction_type,junction.confidence,
  junction.source_method,junction.source_provenance
from public.brinesearch_road_graph_builds build
join public.brinesearch_road_junctions junction on junction.build_id=build.id
join public.brinesearch_road_junction_memberships membership on membership.junction_id=junction.id
join public.brinesearch_authoritative_road_identities identity on identity.id=membership.identity_id
where build.state_code='WV' and build.county_code='OHI' and build.status='validated'
  and junction.verification_status='held'
  and identity.source_identity_key='WV:WVDOT:ROUTE_ID:3500895000000'
order by junction.stable_junction_key;

commit;
\echo 'OHI validated-dark Thrush regression: PASS'
