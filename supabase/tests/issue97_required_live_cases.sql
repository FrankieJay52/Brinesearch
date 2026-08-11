-- GitHub #97 post-ingest/live regression. Read-only by construction.
-- Run only after all 89 county/dataset scopes are complete and active graphs exist.
begin transaction read only;

do $issue97_live$
declare
  v_target uuid;
  v_left uuid;
  v_right uuid;
  v_junction uuid;
  v_cr33_junction uuid;
  v_tr174_junction uuid;
  v_count integer;
  v_from_measure numeric;
  v_measure numeric;
  fixture record;
begin
  -- Release scope is exact: 39 counties and 89 run-bound primary/name/node
  -- receipts. Registry-only supplemental sources must never block a build.
  select count(*) into v_count
  from public.brinesearch_road_graph_counties where active;
  if v_count<>39 then raise exception '#97 expected 39 active graph counties, found %',v_count; end if;
  if exists(
    select 1 from (values ('OH',19),('WV',10),('PA',10)) expected(state_code,county_count)
    left join lateral (
      select count(*)::integer as county_count
      from public.brinesearch_road_graph_counties c
      where c.active and c.state_code=expected.state_code
    ) actual on true
    where actual.county_count<>expected.county_count
  ) then raise exception '#97 active county count by state is incomplete'; end if;

  select count(*) into v_count
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
  where scope.active and scope.required_for_graph;
  if v_count<>89 then raise exception '#97 expected 89 required county/dataset scopes, found %',v_count; end if;
  for fixture in select * from (values
    ('oh_odot_tims_road_inventory',19),
    ('wv_wvdot_publication_lrs',10),('wv_wvdot_street_name_doh',10),
    ('wv_wvdot_street_name_sams',10),('wv_wvdot_alternate_route_name',10),
    ('pa_penndot_state_roads',10),('pa_penndot_local_roads',10),
    ('pa_penndot_at_grade_intersections',10)
  ) x(source_key,scope_count)
  loop
    select count(*) into v_count
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id
    where d.source_key=fixture.source_key and d.active and scope.active
      and scope.ingest_enabled and scope.required_for_graph;
    if v_count<>fixture.scope_count then
      raise exception '#97 source % expected % required scopes, found %',fixture.source_key,fixture.scope_count,v_count;
    end if;
  end loop;
  if exists(
    select 1
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
    left join lateral (
      select r.* from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=scope.dataset_id and r.state_code=scope.state_code
        and r.county_code=scope.county_code
      order by r.started_at desc,r.id desc limit 1
    ) latest on true
    where scope.active and scope.required_for_graph and (
      latest.id is null or latest.status<>'complete' or latest.completed_at is null
      or latest.page_count<1
      or coalesce(latest.details->>'run_bound','false')<>'true'
      or coalesce(latest.details->>'coverage_complete','false')<>'true'
      or coalesce(latest.details->>'coverage_receipts_verified','false')<>'true'
      or coalesce(latest.details->>'page_set_digest','')!~'^[0-9a-f]{32}$'
      or coalesce(latest.details->'source_snapshot'->>'query_url','')=''
      or coalesce(latest.details->'source_snapshot'->>'source_version','')=''
      or coalesce(latest.details->'source_snapshot'->>'count_checked_at','')=''
      or case
        when coalesce(latest.details->>'expected_source_rows','')~'^[0-9]+$'
          then (latest.details->>'expected_source_rows')::integer<>latest.source_row_count
        else true
      end
    )
  ) then raise exception '#97 a required source scope lacks a receipt-complete latest run'; end if;
  if exists(
    select 1
    from public.brinesearch_road_source_dataset_counties scope
    join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id
    join lateral (
      select r.* from public.brinesearch_road_source_ingest_runs r
      where r.dataset_id=scope.dataset_id and r.state_code=scope.state_code
        and r.county_code=scope.county_code
      order by r.started_at desc,r.id desc limit 1
    ) latest on true
    where scope.active and scope.required_for_graph and (
      exists(
        with ordered as (
          select p.*,lag(p.page_offset+p.requested_limit) over(order by p.page_offset) as expected_offset,
            row_number() over(order by p.page_offset) as ordinal
          from public.brinesearch_road_source_ingest_pages p where p.run_id=latest.id
        )
        select 1 from ordered where (ordinal=1 and page_offset<>0)
          or (ordinal>1 and page_offset<>expected_offset)
      )
      or (select count(*) from public.brinesearch_road_source_ingest_pages p
          where p.run_id=latest.id and not p.has_more)<>1
      or (select count(*) from public.brinesearch_road_source_ingest_pages p
          where p.run_id=latest.id)<>latest.page_count
      or (select coalesce(sum(p.source_row_count),0) from public.brinesearch_road_source_ingest_pages p
          where p.run_id=latest.id)<>latest.source_row_count
      or (select coalesce(sum(p.ingested_row_count),0) from public.brinesearch_road_source_ingest_pages p
          where p.run_id=latest.id)<>latest.ingested_row_count
      or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
            p.page_offset::text||':'||p.page_digest,',' order by p.page_offset
          ),'')) from public.brinesearch_road_source_ingest_pages p where p.run_id=latest.id)
          <>latest.details->>'page_set_digest'
    )
  ) then raise exception '#97 a required ingest receipt page set is incomplete or inconsistent'; end if;

  select count(*) into v_count
  from public.brinesearch_road_graph_builds where status='active';
  if v_count<>39 then raise exception '#97 expected 39 active county graph builds, found %',v_count; end if;
  if exists(
    select c.state_code,c.county_code
    from public.brinesearch_road_graph_counties c
    left join public.brinesearch_road_graph_builds b
      on b.state_code=c.state_code and b.county_code=c.county_code and b.status='active'
    where c.active group by c.state_code,c.county_code having count(b.id)<>1
  ) then raise exception '#97 every active county must have exactly one active graph build'; end if;
  if exists(
    select 1 from public.brinesearch_road_graph_builds b
    where b.status='active' and (
      b.algorithm_version<>'issue97-authoritative-topology-v2'
      or b.completed_at is null or b.activated_at is null
      or coalesce(b.source_revision_digest,'')!~'^[0-9a-f]{32}$'
      or coalesce(b.graph_digest,'')!~'^[0-9a-f]{32}$'
      or coalesce(b.details->>'activation_status','')<>'active'
      or b.point_junction_count<>(select count(*) from public.brinesearch_road_junctions j
        where j.build_id=b.id and j.junction_type<>'shared_segment')
      or b.shared_segment_count<>(select count(*) from public.brinesearch_road_junctions j
        where j.build_id=b.id and j.junction_type='shared_segment')
      or b.membership_count<>(select count(*) from public.brinesearch_road_junction_memberships m
        join public.brinesearch_road_junctions j on j.id=m.junction_id where j.build_id=b.id)
      or b.graph_digest<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg(
        j.stable_junction_key||':'||j.graph_digest,',' order by j.stable_junction_key
      ),'')) from public.brinesearch_road_junctions j where j.build_id=b.id)
    )
  ) then raise exception '#97 an active graph build receipt does not match its persisted graph'; end if;

  -- Thrush Avenue, Ohio County, WV: four physical occurrences and five
  -- connected identities; East/West Cardinal share one three-member node.
  select id into strict v_target from public.brinesearch_authoritative_road_identities
  where source_identity_key='WV:WVDOT:ROUTE_ID:3500895000000' and active;
  select count(distinct j.logical_junction_id) into v_count
  from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id and j.verification_status='verified'
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
  where m.identity_id=v_target;
  if v_count<>4 then raise exception '#97 Thrush expected 4 physical junctions, found %',v_count; end if;

  for fixture in select * from (values
    ('WV:WVDOT:ROUTE_ID:3578278001900',-80.7132635::numeric,40.0836389::numeric),
    ('WV:WVDOT:ROUTE_ID:3500329000000',-80.7132025::numeric,40.0841629::numeric),
    ('WV:WVDOT:ROUTE_ID:3501102000000',-80.7127235::numeric,40.0848739::numeric)
  ) x(identity_key,lng,lat)
  loop
    select id into strict v_right from public.brinesearch_authoritative_road_identities
    where source_identity_key=fixture.identity_key and active;
    if not exists(
      select 1 from public.brinesearch_road_junctions j
      join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      where j.verification_status='verified'
        and extensions.st_dwithin(j.geom::extensions.geography,
          extensions.st_setsrid(extensions.st_makepoint(fixture.lng::double precision,fixture.lat::double precision),4326)::extensions.geography,0.03)
        and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_target)
        and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_right)
    ) then raise exception '#97 missing Thrush fixture %',fixture.identity_key; end if;
  end loop;
  select j.id into strict v_junction
  from public.brinesearch_road_junctions j
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
  where j.verification_status='verified'
    and extensions.st_dwithin(j.geom::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(-80.7129895,40.0855589),4326)::extensions.geography,0.03)
    and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_target);
  if (select count(*) from public.brinesearch_road_junction_memberships where junction_id=v_junction)<>3
     or not exists(select 1 from public.brinesearch_road_junction_memberships m
       join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
       where m.junction_id=v_junction and i.source_identity_key='WV:WVDOT:ROUTE_ID:3500272000000')
     or not exists(select 1 from public.brinesearch_road_junction_memberships m
       join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
       where m.junction_id=v_junction and i.source_identity_key='WV:WVDOT:ROUTE_ID:3501008000000') then
    raise exception '#97 Cardinal must be one physical junction with Thrush/E/W memberships';
  end if;
  if exists(
    select 1 from (
      select m.distance_along_road_m,lag(m.distance_along_road_m) over(order by m.source_measure) as prior
      from public.brinesearch_road_junction_memberships m
      join public.brinesearch_road_junctions j on j.id=m.junction_id
      join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      where m.identity_id=v_target and j.verification_status='verified'
    ) ordered where distance_along_road_m is null or (prior is not null and distance_along_road_m<=prior)
  ) then raise exception '#97 Thrush authoritative measures are not strictly ordered'; end if;

  -- Bellaire 44th Street: six shared sections plus Noble/Jefferson point
  -- occurrences. Shared endpoints are anchors, not duplicate connection cards.
  select id into strict v_target from public.brinesearch_authoritative_road_identities
  where source_identity_key='OH:ODOT:NLF:MBELMR00093**C' and active;
  select count(distinct j.logical_junction_id) into v_count
  from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
  where m.identity_id=v_target and j.verification_status='verified';
  if v_count<>8 then raise exception '#97 Bellaire 44th expected 8 logical occurrences, found %',v_count; end if;
  for fixture in select * from (values
    ('OH:ODOT:NLF:MBELMR00756**C',-80.7432468::numeric,40.0262104::numeric,-80.7431284::numeric,40.0262140::numeric),
    ('OH:ODOT:NLF:CBELCR00034**C',-80.7428175::numeric,40.0261665::numeric,-80.7426731::numeric,40.0261443::numeric),
    ('OH:ODOT:NLF:MBELMR00747**C',-80.7423285::numeric,40.0261002::numeric,-80.7421970::numeric,40.0260850::numeric),
    ('OH:ODOT:NLF:MBELMR00104**C',-80.7418544::numeric,40.0260406::numeric,-80.7417414::numeric,40.0260262::numeric),
    ('OH:ODOT:NLF:MBELMR00744**C',-80.7413766::numeric,40.0259778::numeric,-80.7412543::numeric,40.0259617::numeric),
    ('OH:ODOT:NLF:MBELMR00760**C',-80.7404037::numeric,40.0258549::numeric,-80.7403245::numeric,40.0258430::numeric)
  ) x(identity_key,start_lng,start_lat,end_lng,end_lat)
  loop
    select id into strict v_right from public.brinesearch_authoritative_road_identities
    where source_identity_key=fixture.identity_key and active;
    select j.id into strict v_junction
    from public.brinesearch_road_junctions j
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    where j.junction_type='shared_segment' and j.verification_status='verified'
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_target)
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_right);
    if (select count(*) from public.brinesearch_road_junction_anchors where junction_id=v_junction)<>2
       or not exists(select 1 from public.brinesearch_road_junction_anchors a where a.junction_id=v_junction
         and extensions.st_dwithin(a.geom::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(fixture.start_lng::double precision,fixture.start_lat::double precision),4326)::extensions.geography,0.03))
       or not exists(select 1 from public.brinesearch_road_junction_anchors a where a.junction_id=v_junction
         and extensions.st_dwithin(a.geom::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(fixture.end_lng::double precision,fixture.end_lat::double precision),4326)::extensions.geography,0.03)) then
      raise exception '#97 Bellaire shared anchors failed for %',fixture.identity_key;
    end if;
  end loop;
  for fixture in select * from (values
    ('OH:ODOT:NLF:MBELMR01345**C',-80.7408324::numeric,40.0259094::numeric),
    ('OH:ODOT:NLF:CBELCR00532**C',-80.7398748::numeric,40.0257762::numeric)
  ) x(identity_key,lng,lat)
  loop
    select id into strict v_right from public.brinesearch_authoritative_road_identities
    where source_identity_key=fixture.identity_key and active;
    if not exists(select 1 from public.brinesearch_road_junctions j
      join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
      where j.junction_type<>'shared_segment' and j.verification_status='verified'
        and extensions.st_dwithin(j.geom::extensions.geography,
          extensions.st_setsrid(extensions.st_makepoint(fixture.lng::double precision,fixture.lat::double precision),4326)::extensions.geography,0.03)
        and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_target)
        and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_right)) then
      raise exception '#97 Bellaire point fixture failed for %',fixture.identity_key;
    end if;
  end loop;

  -- Leonard Ridge exact identities remain distinct and form one continuation.
  select id into strict v_left from public.brinesearch_authoritative_road_identities
  where source_identity_key='OH:ODOT:NLF:TNOBTR00003**C' and active;
  select id into strict v_right from public.brinesearch_authoritative_road_identities
  where source_identity_key='OH:ODOT:NLF:TNOBTR00054**C' and active;
  if not exists(select 1 from public.brinesearch_road_junctions j
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    where j.junction_type='continuation' and j.verification_status='verified'
      and extensions.st_dwithin(j.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(-81.6041605,39.7612587),4326)::extensions.geography,0.03)
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_left)
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_right)) then
    raise exception '#97 Leonard Ridge continuation failed';
  end if;

  -- Jefferson CR26: one exact three-member multiway plus four exact pair
  -- points. TR174 meets CR26 once; it is not a shared section. A separate
  -- single-road CR26 -> Lincoln Avenue name event is intentionally excluded.
  select id into strict v_target from public.brinesearch_authoritative_road_identities
  where source_identity_key='OH:ODOT:NLF:CJEFCR00026**C' and active;
  select count(distinct j.logical_junction_id) into v_count
  from public.brinesearch_road_junction_memberships m
  join public.brinesearch_road_junctions j on j.id=m.junction_id
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
  where m.identity_id=v_target and j.verification_status='verified'
    and exists(select 1 from public.brinesearch_road_junction_memberships other
      where other.junction_id=j.id and other.identity_id<>v_target);
  if v_count<>5 then raise exception '#97 CR26 expected 5 physical connected-road occurrences, found %',v_count; end if;
  select j.id into strict v_junction
  from public.brinesearch_road_junctions j
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    where j.junction_type='multiway' and j.verification_status='verified'
      and extensions.st_dwithin(j.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(-80.8147607,40.3410810),4326)::extensions.geography,0.03)
      and exists(select 1 from public.brinesearch_road_junction_memberships m
        where m.junction_id=j.id and m.identity_id=v_target);
  if (select array_agg(i.source_identity_key order by i.source_identity_key)
      from public.brinesearch_road_junction_memberships m
      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
      where m.junction_id=v_junction)
      <>array[
        'OH:ODOT:NLF:CJEFCR00023**C',
        'OH:ODOT:NLF:CJEFCR00026**C',
        'OH:ODOT:NLF:TJEFTR00139A*C'
      ]::text[] then
    raise exception '#97 CR26 multiway does not contain exactly CR23, CR26, and TR139A';
  end if;
  if not exists(select 1 from public.brinesearch_road_junction_memberships m
      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
      where m.junction_id=v_junction and i.source_identity_key='OH:ODOT:NLF:CJEFCR00023**C'
        and m.road_name_at_junction='CR 23' and 'CR 23'=any(m.aliases_at_junction)
        and not ('HIGH ST'=any(m.aliases_at_junction)))
     or not exists(select 1 from public.brinesearch_road_junction_memberships m
      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
      where m.junction_id=v_junction and i.source_identity_key='OH:ODOT:NLF:TJEFTR00139A*C'
        and m.road_name_at_junction='HUBER RD' and 'HUBER RD'=any(m.aliases_at_junction)) then
    raise exception '#97 CR26 multiway location-valid names/aliases failed';
  end if;

  for fixture in select * from (values
    ('OH:ODOT:NLF:CJEFCR00025**C',-80.7841678::numeric,40.3259072::numeric,'CR 25'::text),
    ('OH:ODOT:NLF:TJEFTR00184**C',-80.7426391::numeric,40.3214160::numeric,'DAWSON RD'::text),
    ('OH:ODOT:NLF:CJEFCR00033**C',-80.7113551::numeric,40.3402945::numeric,'FERNWOOD RD'::text),
    ('OH:ODOT:NLF:TJEFTR00174**C',-80.6855384::numeric,40.3487046::numeric,'CROSS CREEK RD'::text)
  ) x(identity_key,lng,lat,location_name)
  loop
    select id into strict v_right from public.brinesearch_authoritative_road_identities
    where source_identity_key=fixture.identity_key and active;
    select j.id into strict v_junction
    from public.brinesearch_road_junctions j
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    where j.junction_type='t_junction' and j.verification_status='verified'
      and extensions.st_dwithin(j.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(
          fixture.lng::double precision,fixture.lat::double precision
        ),4326)::extensions.geography,0.03)
      and exists(select 1 from public.brinesearch_road_junction_memberships m
        where m.junction_id=j.id and m.identity_id=v_target)
      and exists(select 1 from public.brinesearch_road_junction_memberships m
        where m.junction_id=j.id and m.identity_id=v_right);
    if (select count(*) from public.brinesearch_road_junction_memberships
        where junction_id=v_junction)<>2
       or (select count(*) from public.brinesearch_road_junction_anchors
        where junction_id=v_junction and anchor_role='point')<>1
       or not exists(select 1 from public.brinesearch_road_junction_memberships m
        where m.junction_id=v_junction and m.identity_id=v_right
          and m.road_name_at_junction=fixture.location_name
          and fixture.location_name=any(m.aliases_at_junction)) then
      raise exception '#97 CR26 point fixture failed for %',fixture.identity_key;
    end if;
    if fixture.identity_key='OH:ODOT:NLF:CJEFCR00033**C' then
      v_cr33_junction:=v_junction;
    elsif fixture.identity_key='OH:ODOT:NLF:TJEFTR00174**C' then
      v_tr174_junction:=v_junction;
    end if;
  end loop;
  if v_cr33_junction is null or v_tr174_junction is null
     or v_cr33_junction=v_tr174_junction then
    raise exception '#97 CR33 and TR174 Fernwood occurrences were collapsed';
  end if;
  if not exists(select 1 from public.brinesearch_authoritative_road_names n
      join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
      where i.source_identity_key='OH:ODOT:NLF:CJEFCR00023**C' and n.active and n.road_name='HIGH ST')
     or not exists(select 1 from public.brinesearch_authoritative_road_names n
      join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
      where i.source_identity_key='OH:ODOT:NLF:TJEFTR00184**C' and n.active and n.road_name='CHAPEL HILL RD')
     or not exists(select 1 from public.brinesearch_authoritative_road_names n
      join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
      where i.source_identity_key='OH:ODOT:NLF:TJEFTR00174**C' and n.active
        and n.road_name in ('CHASE RD','FERNWOOD RD')
      group by i.id having count(distinct n.road_name)=2) then
    raise exception '#97 CR26 connected identities lost required off-location aliases';
  end if;
  if exists(select 1 from public.brinesearch_road_junction_memberships m
      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
      where m.junction_id=v_cr33_junction and i.source_identity_key='OH:ODOT:NLF:CJEFCR00033**C'
        and m.road_name_at_junction<>'FERNWOOD RD')
     or exists(select 1 from public.brinesearch_road_junction_memberships m
      join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
      where m.junction_id=v_tr174_junction and i.source_identity_key='OH:ODOT:NLF:TJEFTR00174**C'
        and (m.road_name_at_junction<>'CROSS CREEK RD'
          or 'CHASE RD'=any(m.aliases_at_junction)
          or 'FERNWOOD RD'=any(m.aliases_at_junction))) then
    raise exception '#97 CR33/TR174 location-valid Fernwood/Cross Creek naming failed';
  end if;

  -- Washington County, PA: municipality-scoped Possom/Possum identities form
  -- one spelling-preserving continuation, while PennDOT internal 0844 remains
  -- distinct from the signed PA-844 designation at the state/local node.
  select id into strict v_left from public.brinesearch_authoritative_road_identities
  where source_identity_key='PA:PENNDOT:LOCAL:62:2049:110961:EJM9' and active;
  select id into strict v_right from public.brinesearch_authoritative_road_identities
  where source_identity_key='PA:PENNDOT:LOCAL:62:2061:107905:EHBS' and active;
  if v_left=v_right then raise exception '#97 Possom/Possum municipality identities were collapsed'; end if;
  select j.id into strict v_junction
  from public.brinesearch_road_junctions j
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    where j.junction_type='continuation' and j.verification_status='verified'
      and extensions.st_dwithin(j.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(-80.4327637,40.2412256),4326)::extensions.geography,0.03)
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_left)
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_right);
  if (select count(*) from public.brinesearch_road_junction_memberships where junction_id=v_junction)<>2
     or not exists(select 1 from public.brinesearch_road_junction_memberships m
      where m.junction_id=v_junction and m.identity_id=v_left
        and m.road_name_at_junction='POSSOM HOLLOW ROAD'
        and 'PA:PENNDOT:LOCAL:SEGMENT:379767'=any(m.source_segment_keys))
     or not exists(select 1 from public.brinesearch_road_junction_memberships m
      where m.junction_id=v_junction and m.identity_id=v_right
        and m.road_name_at_junction='POSSUM HOLLOW ROAD'
        and 'PA:PENNDOT:LOCAL:SEGMENT:386101'=any(m.source_segment_keys)) then
    raise exception '#97 Possom/Possum exact two-member continuation failed';
  end if;
  select id into strict v_target from public.brinesearch_authoritative_road_identities
  where source_identity_key='PA:PENNDOT:STATE:62:NLF:9888' and active;
  select j.id into strict v_junction from public.brinesearch_road_junctions j
  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
  where j.verification_status='verified' and j.source_method='penndot_at_grade_node_projection'
    and extensions.st_dwithin(j.geom::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(-80.4313813,40.2442117),4326)::extensions.geography,0.03)
    and j.source_provenance->'at_grade_node_keys' ? 'PA:PENNDOT:AT_GRADE:6201732'
    and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_left)
    and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_target);
  if (select count(*) from public.brinesearch_road_junction_memberships where junction_id=v_junction)<>2
     or (select count(*) from public.brinesearch_road_junction_anchors
       where junction_id=v_junction and anchor_role='point')<>1
     or (select count(*) from public.brinesearch_road_junctions j
       join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
       where j.verification_status='verified'
         and extensions.st_dwithin(j.geom::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(-80.4313813,40.2442117),4326)::extensions.geography,0.03)
         and exists(select 1 from public.brinesearch_road_junction_memberships m
           where m.junction_id=j.id and m.identity_id=v_left)
         and exists(select 1 from public.brinesearch_road_junction_memberships m
           where m.junction_id=j.id and m.identity_id=v_target))<>1 then
    raise exception '#97 PennDOT at-grade state/local fixture is missing or duplicated';
  end if;
  if not exists(select 1 from public.brinesearch_authoritative_road_names n
      where n.identity_id=v_target and n.active and n.name_type='internal' and n.road_name='0844')
     or not exists(select 1 from public.brinesearch_authoritative_road_names n
      where n.identity_id=v_target and n.active and n.name_type='signed' and n.road_name='PA-844') then
    raise exception '#97 PennDOT internal and signed designations were collapsed or mislabeled';
  end if;
  select from_measure,to_measure into strict v_from_measure,v_measure
  from public.brinesearch_authoritative_external_road_segments
  where source_segment_key='PA:PENNDOT:LOCAL:SEGMENT:379767' and identity_id=v_left and active;
  if v_from_measure<>0 or pg_catalog.abs(v_measure-(1267.0/5280.0))>0.0000001 then
    raise exception '#97 PennDOT local feet-to-miles conversion failed: %',v_measure;
  end if;

  if exists(
    select 1 from public.brinesearch_authoritative_road_identities i
    where i.state_code='OH' and i.active
      and i.attributes->>'jurisdiction_code'='P'
      and i.public_access_status<>'private'
  ) then
    raise exception '#97 an active ODOT private-jurisdiction identity was projected as non-private';
  end if;

  if exists(
    select 1
    from public.brinesearch_authoritative_road_segments s
    join public.brinesearch_odot_road_catalog c
      on s.source_segment_key='OH:ODOT:SEGMENT:'||c.roadway_inventory_id
    where c.source_active and c.jurisdiction_code='P'
      and s.public_access_status<>'private'
  ) then
    raise exception '#97 an active ODOT private-jurisdiction segment was projected as non-private';
  end if;

  if exists(select 1 from public.brinesearch_road_junction_memberships m
    join public.brinesearch_road_junctions j on j.id=m.junction_id
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    join public.brinesearch_road_source_datasets d on d.id=i.dataset_id
    where d.source_agency='' or d.source_dataset='' or d.source_layer=''
      or d.source_version='' or d.source_url!~'^https://'
      or i.source_record_ids='{}'::text[] or i.source_digest=''
      or pg_catalog.cardinality(m.source_segment_keys)=0
      or m.provenance->>'source_identity_key'<>i.source_identity_key
      or m.provenance->>'source_digest'<>i.source_digest
      or coalesce(m.provenance->>'aliases_are_location_valid','false')<>'true') then
    raise exception '#97 active membership provenance is incomplete';
  end if;
  if exists(select 1 from public.brinesearch_road_junction_memberships m
    join public.brinesearch_road_junctions j on j.id=m.junction_id
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    cross join lateral unnest(m.source_segment_keys) source_segment_key
    where not exists(select 1 from public.brinesearch_authoritative_road_segments s
      where s.source_segment_key=source_segment_key and s.identity_id=m.identity_id and s.active)) then
    raise exception '#97 an active membership source segment does not resolve to its exact identity';
  end if;
  if exists(select 1 from public.brinesearch_road_junctions j
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    left join public.brinesearch_road_junction_anchors a on a.junction_id=j.id
    group by j.id,j.junction_type
    having count(a.id)<>case when j.junction_type='shared_segment' then 2 else 1 end
      or pg_catalog.bool_or(a.anchor_digest<>pg_catalog.md5(extensions.st_asgeojson(a.geom,15)))) then
    raise exception '#97 active junction anchor cardinality/digest validation failed';
  end if;
end
$issue97_live$;

rollback;
