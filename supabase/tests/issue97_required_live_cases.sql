-- GitHub #97 post-ingest/live regression plus rollback-only route fixture.
-- Run only after all 114 county/dataset scopes are complete and active graphs exist.
begin;

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
	  -- Release scope is exact: 39 counties and 114 run-bound receipts (89
	  -- core/name/node plus 19 OGRIP LBRS and six available PA county/NG911).
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
	  if exists(
	    with expected(state_code,county_code,county_name,county_geoid,source_county_code) as (values
	      ('OH','ATH','Athens','39009','ATH'),('OH','BEL','Belmont','39013','BEL'),
	      ('OH','CAR','Carroll','39019','CAR'),('OH','COL','Columbiana','39029','COL'),
	      ('OH','COS','Coshocton','39031','COS'),('OH','GUE','Guernsey','39059','GUE'),
	      ('OH','HAS','Harrison','39067','HAS'),('OH','HOL','Holmes','39075','HOL'),
	      ('OH','JEF','Jefferson','39081','JEF'),('OH','LIC','Licking','39089','LIC'),
	      ('OH','MAH','Mahoning','39099','MAH'),('OH','MOE','Monroe','39111','MOE'),
	      ('OH','MUS','Muskingum','39119','MUS'),('OH','NOB','Noble','39121','NOB'),
	      ('OH','POR','Portage','39133','POR'),('OH','STA','Stark','39151','STA'),
	      ('OH','TRU','Trumbull','39155','TRU'),('OH','TUS','Tuscarawas','39157','TUS'),
	      ('OH','WAS','Washington','39167','WAS'),
	      ('WV','BRO','Brooke','54009','05'),('WV','DOD','Doddridge','54017','09'),
	      ('WV','HAR','Harrison','54033','17'),('WV','MAR','Marion','54049','25'),
	      ('WV','MSH','Marshall','54051','26'),('WV','MON','Monongalia','54061','31'),
	      ('WV','OHI','Ohio','54069','35'),('WV','RIT','Ritchie','54085','43'),
	      ('WV','TYL','Tyler','54095','48'),('WV','WET','Wetzel','54103','52'),
	      ('PA','ALL','Allegheny','42003','02'),('PA','ARM','Armstrong','42005','03'),
	      ('PA','BEA','Beaver','42007','04'),('PA','BRA','Bradford','42015','08'),
	      ('PA','BUT','Butler','42019','10'),('PA','FAY','Fayette','42051','26'),
	      ('PA','GRE','Greene','42059','30'),('PA','IND','Indiana','42063','32'),
	      ('PA','WAS','Washington','42125','62'),('PA','WES','Westmoreland','42129','64')
	    ), actual as (
	      select state_code,county_code,county_name,county_geoid,source_county_code
	      from public.brinesearch_road_graph_counties where active
	    )
	    select 1 from expected e full join actual a using(
	      state_code,county_code,county_name,county_geoid,source_county_code
	    ) where e.state_code is null or a.state_code is null
	  ) then raise exception '#97 exact 39-county code/GEOID/source-code manifest changed'; end if;

  select count(*) into v_count
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id and d.active
  where scope.active and scope.required_for_graph;
	  if v_count<>114 then raise exception '#97 expected 114 required county/dataset scopes, found %',v_count; end if;
  for fixture in select * from (values
	    ('oh_odot_tims_road_inventory',19),('oh_ogrip_lbrs_centerlines',19),
    ('wv_wvdot_publication_lrs',10),('wv_wvdot_street_name_doh',10),
    ('wv_wvdot_street_name_sams',10),('wv_wvdot_alternate_route_name',10),
    ('pa_penndot_state_roads',10),('pa_penndot_local_roads',10),
	    ('pa_penndot_at_grade_intersections',10),
	    ('pa_allegheny_ng911_centerlines',1),('pa_bradford_ng911_centerlines',1),
	    ('pa_butler_centerlines',1),('pa_fayette_ng911_centerlines',1),
	    ('pa_indiana_ng911_centerlines',1),('pa_washington_ng911_centerlines',1)
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
    with expected(source_key,county_code) as (values
      ('pa_allegheny_ng911_centerlines','ALL'),
      ('pa_bradford_ng911_centerlines','BRA'),
      ('pa_butler_centerlines','BUT'),
      ('pa_fayette_ng911_centerlines','FAY'),
      ('pa_indiana_ng911_centerlines','IND'),
      ('pa_washington_ng911_centerlines','WAS')
    ), actual as (
      select d.source_key,scope.county_code
      from public.brinesearch_road_source_dataset_counties scope
      join public.brinesearch_road_source_datasets d on d.id=scope.dataset_id
      where d.source_key in (
        'pa_allegheny_ng911_centerlines','pa_bradford_ng911_centerlines',
        'pa_butler_centerlines','pa_fayette_ng911_centerlines',
        'pa_indiana_ng911_centerlines','pa_washington_ng911_centerlines'
      ) and d.active and scope.active and scope.ingest_enabled and scope.required_for_graph
    )
    select 1 from expected e full join actual a using(source_key,county_code)
    where e.source_key is null or a.source_key is null
  ) then raise exception '#97 PA county/NG911 source-to-county scope mapping changed'; end if;
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
	  if exists(
	    select 1
	    from public.brinesearch_authoritative_supplemental_centerlines c
	    join public.brinesearch_road_source_datasets d on d.id=c.dataset_id
	    where c.active and d.source_key in (
	      'oh_ogrip_lbrs_centerlines','pa_allegheny_ng911_centerlines',
	      'pa_bradford_ng911_centerlines','pa_butler_centerlines',
	      'pa_fayette_ng911_centerlines','pa_indiana_ng911_centerlines',
	      'pa_washington_ng911_centerlines'
	    ) and (
	      not private_verification.brinesearch_issue97_dataset_scope_current(
	        c.dataset_id,c.state_code,c.county_code
	      )
	      or not exists(select 1
	        from public.brinesearch_supplemental_centerline_dispositions disposition
	        where disposition.centerline_id=c.id and disposition.active
	          and disposition.ingest_run_id=c.last_ingest_run_id
	          and disposition.disposition in ('verified','ambiguous','unmatched_held'))
	    )
	  ) then raise exception '#97 a supplemental occurrence lacks a current mapped-or-held disposition'; end if;

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
	  if (select count(*) from public.brinesearch_authoritative_road_nodes n
	      join public.brinesearch_road_source_datasets d on d.id=n.dataset_id
	      where d.source_key='pa_penndot_at_grade_intersections' and n.active
	        and n.attributes->>'NODE_ID'='0209097')<2
	    or (select count(distinct pg_catalog.concat_ws(':',n.attributes->>'T_RT_NO',n.attributes->>'SEG_NO',
	        n.attributes->>'ST_RT_IXN',n.attributes->>'SEG_IXN'))
	      from public.brinesearch_authoritative_road_nodes n
	      join public.brinesearch_road_source_datasets d on d.id=n.dataset_id
	      where d.source_key='pa_penndot_at_grade_intersections' and n.active
	        and n.attributes->>'NODE_ID'='0209097')<2 then
	    raise exception '#97 repeated/reversed PennDOT NODE_ID tuple occurrences were overwritten';
	  end if;
	  if (select count(distinct n.county_code)
	      from public.brinesearch_authoritative_road_nodes n
	      join public.brinesearch_road_source_datasets d on d.id=n.dataset_id
	      where d.source_key='pa_penndot_at_grade_intersections' and n.active
	        and n.attributes->>'NODE_ID'='0201636')<2 then
	    raise exception '#97 cross-county PennDOT NODE_ID scope occurrences were collapsed';
	  end if;

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
	    ('OH:ODOT:NLF:MBELMR00756**C:COMP:2025_000000000068198','OH:ODOT:SEGMENT:2025_000000000068199',-80.7432468::numeric,40.0262104::numeric,-80.7431284::numeric,40.0262140::numeric),
	    ('OH:ODOT:NLF:CBELCR00034**C:COMP:2025_000000000003599','OH:ODOT:SEGMENT:2025_000000000003601',-80.7428175::numeric,40.0261665::numeric,-80.7426731::numeric,40.0261443::numeric),
    ('OH:ODOT:NLF:MBELMR00747**C',null::text,-80.7423285::numeric,40.0261002::numeric,-80.7421970::numeric,40.0260850::numeric),
	    ('OH:ODOT:NLF:MBELMR00104**C:COMP:2025_000000000067362','OH:ODOT:SEGMENT:2025_000000000067365',-80.7418544::numeric,40.0260406::numeric,-80.7417414::numeric,40.0260262::numeric),
	    ('OH:ODOT:NLF:MBELMR00744**C:COMP:2025_000000000068177','OH:ODOT:SEGMENT:2025_000000000068178',-80.7413766::numeric,40.0259778::numeric,-80.7412543::numeric,40.0259617::numeric),
	    ('OH:ODOT:NLF:MBELMR00760**C:COMP:2025_000000000068203','OH:ODOT:SEGMENT:2025_000000000068204',-80.7404037::numeric,40.0258549::numeric,-80.7403245::numeric,40.0258430::numeric)
  ) x(identity_key,source_segment_key,start_lng,start_lat,end_lng,end_lat)
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
    if fixture.source_segment_key is not null and not exists(
      select 1 from public.brinesearch_road_junction_memberships m
      where m.junction_id=v_junction and m.identity_id=v_right
        and fixture.source_segment_key=any(m.source_segment_keys)
    ) then raise exception '#97 Bellaire shared provenance failed for %',fixture.identity_key; end if;
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
	  if exists(
	    select 1 from public.brinesearch_authoritative_road_names n
	    where n.source_record_id='2025_000000000067340'
	      and (n.name_type='official' or n.road_name='MBELMR00093**C')
	  ) then raise exception '#97 blank 44th source row fabricated an official NLF name event'; end if;

	  -- Leonard Ridge: the reused TR3 NLF is three disconnected source
	  -- components. Only Brookfield Leonard continues to TR54; TR54 then has an
	  -- exact Leonard -> Teeters source-name event.
	  if exists(select 1 from public.brinesearch_authoritative_road_identities
	    where source_identity_key='OH:ODOT:NLF:TNOBTR00003**C' and active) then
	    raise exception '#97 disconnected TNOB TR3 components were collapsed into the base NLF identity';
	  end if;
	  if (select count(*) from public.brinesearch_authoritative_road_identities
	      where active and source_identity_key in (
	        'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428128',
	        'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428131',
	        'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134'
	      ))<>3 then
	    raise exception '#97 Leonard/Brownrigg/Olive Green TR3 components are incomplete';
	  end if;
	  for fixture in select * from (values
	    ('OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428128','BROWNRIGG RD'),
	    ('OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428131','OLIVE GREEN RD'),
	    ('OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134','LEONARD RIDGE RD')
	  ) x(identity_key,exact_name)
	  loop
	    select id into strict v_target from public.brinesearch_authoritative_road_identities
	    where source_identity_key=fixture.identity_key and active;
	    if (select array_agg(distinct n.road_name order by n.road_name)
	        from public.brinesearch_authoritative_road_names n
	        where n.identity_id=v_target and n.active and n.name_type='official')
	       <>array[fixture.exact_name]::text[] then
	      raise exception '#97 TR3 component % lost or gained an official name',fixture.identity_key;
	    end if;
	  end loop;
  select id into strict v_left from public.brinesearch_authoritative_road_identities
	  where source_identity_key='OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134' and active;
  select id into strict v_right from public.brinesearch_authoritative_road_identities
  where source_identity_key='OH:ODOT:NLF:TNOBTR00054**C' and active;
  select j.id into strict v_junction from public.brinesearch_road_junctions j
    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
    where j.junction_type='continuation' and j.verification_status='verified'
      and extensions.st_dwithin(j.geom::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(-81.604160472398632,39.76125865161314),4326)::extensions.geography,0.03)
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_left)
      and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_right);
  if not exists(select 1 from public.brinesearch_road_junction_memberships m
      where m.junction_id=v_junction and m.identity_id=v_left
        and 'OH:ODOT:SEGMENT:2025_000000000428134'=any(m.source_segment_keys))
     or not exists(select 1 from public.brinesearch_road_junction_memberships m
      where m.junction_id=v_junction and m.identity_id=v_right
        and 'OH:ODOT:SEGMENT:2025_000000000428260'=any(m.source_segment_keys)) then
    raise exception '#97 Leonard Ridge continuation source provenance failed';
  end if;
	  if exists(select 1 from public.brinesearch_road_junctions j
	    join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
	    join public.brinesearch_road_junction_memberships m on m.junction_id=j.id
	    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
	    where j.verification_status='verified' and i.source_identity_key in (
	      'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428128',
	      'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428131',
	      'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134'
	    ) group by j.id having count(distinct i.id)>1) then
	    raise exception '#97 a disconnected TR3 component was given a fake continuation';
	  end if;
	  select j.id into strict v_junction
	  from public.brinesearch_road_junctions j
	  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
	  where j.junction_type='name_change' and j.verification_status='verified'
	    and extensions.st_dwithin(j.geom::extensions.geography,
	      extensions.st_setsrid(extensions.st_makepoint(-81.601767291311489,39.760952582138785),4326)::extensions.geography,0.03)
	    and exists(select 1 from public.brinesearch_road_junction_memberships m
	      where m.junction_id=j.id and m.identity_id=v_right);
	  if (select count(*) from public.brinesearch_road_junction_memberships
	      where junction_id=v_junction)<>1
	    or not exists(select 1 from public.brinesearch_road_junction_memberships m
	      where m.junction_id=v_junction and m.identity_id=v_right
	        and m.source_segment_keys @> array[
	          'OH:ODOT:SEGMENT:2025_000000000428260',
	          'OH:ODOT:SEGMENT:2025_000000000428261'
	        ]::text[] and pg_catalog.cardinality(m.source_segment_keys)=2
	        and m.aliases_at_junction @> array['LEONARD RIDGE RD','TEETERS RIDGE RD']::text[]
	        and pg_catalog.cardinality(m.aliases_at_junction)=2) then
	    raise exception '#97 TR54 Leonard/Teeters exact name-change provenance failed';
	  end if;

	  -- Jefferson CR26: one exact three-member multiway, three exact point
	  -- junctions and one exact TR174 shared section. A separate single-road
	  -- CR26 -> Lincoln Avenue name event is intentionally excluded.
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
    ('OH:ODOT:NLF:CJEFCR00025**C',-80.78416779052846::numeric,40.32590722281886::numeric,'CR 25'::text,null::text),
	    ('OH:ODOT:NLF:TJEFTR00184**C:COMP:2025_000000000402167',-80.74263911152484::numeric,40.32141602526554::numeric,'DAWSON RD'::text,'OH:ODOT:SEGMENT:2025_000000000402167'::text),
	    ('OH:ODOT:NLF:CJEFCR00033**C',-80.71135513712662::numeric,40.34029447699557::numeric,'FERNWOOD RD'::text,null::text)
  ) x(identity_key,lng,lat,location_name,source_segment_key)
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
          and fixture.location_name=any(m.aliases_at_junction)
          and (fixture.source_segment_key is null
            or fixture.source_segment_key=any(m.source_segment_keys))) then
      raise exception '#97 CR26 point fixture failed for %',fixture.identity_key;
    end if;
    if fixture.identity_key='OH:ODOT:NLF:CJEFCR00033**C' then
      v_cr33_junction:=v_junction;
    end if;
  end loop;
	  select id into strict v_right from public.brinesearch_authoritative_road_identities
	  where source_identity_key='OH:ODOT:NLF:TJEFTR00174**C' and active;
	  select j.id into strict v_tr174_junction
	  from public.brinesearch_road_junctions j
	  join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
	  where j.junction_type='shared_segment' and j.verification_status='verified'
	    and exists(select 1 from public.brinesearch_road_junction_memberships m
	      where m.junction_id=j.id and m.identity_id=v_target)
	    and exists(select 1 from public.brinesearch_road_junction_memberships m
	      where m.junction_id=j.id and m.identity_id=v_right);
	  if (select count(*) from public.brinesearch_road_junction_memberships
	      where junction_id=v_tr174_junction)<>2
	    or (select count(*) from public.brinesearch_road_junction_anchors
	      where junction_id=v_tr174_junction)<>2
	    or not exists(select 1 from public.brinesearch_road_junction_anchors a
	      where a.junction_id=v_tr174_junction and extensions.st_dwithin(
	        a.geom::extensions.geography,
	        extensions.st_setsrid(extensions.st_makepoint(-80.685538406565598,40.348704610676769),4326)::extensions.geography,0.03))
	    or not exists(select 1 from public.brinesearch_road_junction_anchors a
	      where a.junction_id=v_tr174_junction and extensions.st_dwithin(
	        a.geom::extensions.geography,
	        extensions.st_setsrid(extensions.st_makepoint(-80.684639152542005,40.348646016552649),4326)::extensions.geography,0.03)) then
	    raise exception '#97 CR26/TR174 shared section or exact anchors failed';
	  end if;
  if v_cr33_junction is null or v_tr174_junction is null
     or v_cr33_junction=v_tr174_junction then
    raise exception '#97 CR33 and TR174 Fernwood occurrences were collapsed';
  end if;
  if not exists(select 1 from public.brinesearch_authoritative_road_names n
      join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
      where i.source_identity_key='OH:ODOT:NLF:CJEFCR00023**C' and n.active and n.road_name='HIGH ST')
	     or not exists(select 1 from public.brinesearch_authoritative_road_names n
      join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
	      where i.source_identity_key='OH:ODOT:NLF:TJEFTR00184**C:COMP:2025_000000000402170'
	        and n.active and n.road_name='CHAPEL HILL RD')
	     or exists(select 1 from public.brinesearch_authoritative_road_names n
	      join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
	      where i.source_identity_key='OH:ODOT:NLF:TJEFTR00184**C:COMP:2025_000000000402167'
	        and n.active and n.road_name='CHAPEL HILL RD')
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
	        extensions.st_setsrid(extensions.st_makepoint(-80.432763686707645,40.241225572779733),4326)::extensions.geography,0.03)
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
	      extensions.st_setsrid(extensions.st_makepoint(-80.431381349266971,40.244211706382188),4326)::extensions.geography,0.03)
	    and j.source_provenance->>'authoritative_physical_node_key'='PA:PENNDOT:AT_GRADE:6201732'
	    and j.source_provenance->'at_grade_node_keys'
	      ? 'PA:PENNDOT:AT_GRADE:OCCURRENCE:146521:SCOPE:PA:WAS'
    and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_left)
    and exists(select 1 from public.brinesearch_road_junction_memberships m where m.junction_id=j.id and m.identity_id=v_target);
  if (select count(*) from public.brinesearch_road_junction_memberships where junction_id=v_junction)<>2
     or (select count(*) from public.brinesearch_road_junction_anchors
       where junction_id=v_junction and anchor_role='point')<>1
     or (select count(*) from public.brinesearch_road_junctions j
       join public.brinesearch_road_graph_builds b on b.id=j.build_id and b.status='active'
       where extensions.st_dwithin(j.geom::extensions.geography,
	           extensions.st_setsrid(extensions.st_makepoint(-80.431381349266971,40.244211706382188),4326)::extensions.geography,0.03)
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

	  -- Washington County Public Safety is alias/provenance authority only.
	  -- It enriches both municipal identities without replacing PennDOT GPS.
	  for fixture in select * from (values
	    ('pa_washington_ng911_centerlines:NGUID:RCL22649@co.washington.pa.us:SCOPE:PA:WAS',
	      '4200','PA:PENNDOT:LOCAL:62:2049:110961:EJM9','PA:PENNDOT:LOCAL:SEGMENT:379767','WEST MIDDLETOWN BOROUGH'),
	    ('pa_washington_ng911_centerlines:NGUID:RCL39851@co.washington.pa.us:SCOPE:PA:WAS',
	      '5106','PA:PENNDOT:LOCAL:62:2061:107905:EHBS','PA:PENNDOT:LOCAL:SEGMENT:386101','HOPEWELL TOWNSHIP')
	  ) x(feature_key,source_record_id,identity_key,segment_key,municipality_name)
	  loop
	    select id into strict v_right from public.brinesearch_authoritative_road_identities
	    where source_identity_key=fixture.identity_key and active;
	    if not exists(
	      select 1
	      from public.brinesearch_authoritative_supplemental_centerlines c
	      join public.brinesearch_road_source_datasets d on d.id=c.dataset_id
	      join public.brinesearch_supplemental_centerline_identity_mappings m
	        on m.centerline_id=c.id and m.active and m.mapping_status='verified'
	      join public.brinesearch_supplemental_centerline_dispositions disposition
	        on disposition.centerline_id=c.id and disposition.active
	          and disposition.ingest_run_id=c.last_ingest_run_id
	      where d.source_key='pa_washington_ng911_centerlines'
	        and c.source_feature_key=fixture.feature_key
	        and c.source_record_id=fixture.source_record_id
	        and fixture.municipality_name in (c.municipality_left,c.municipality_right)
	        and c.name_events @> '[{"type":"911","name":"POSSUM HOLLOW Road"}]'::jsonb
	        and c.name_events @> '[{"type":"legacy","name":"POSSUM HOLLOW RD"}]'::jsonb
	        and m.identity_id=v_right and fixture.segment_key=any(m.source_segment_keys)
	        and m.mapping_method='exact_geometry_coverage'
	        and m.ingest_run_id=c.last_ingest_run_id
	        and m.evidence->>'name_used_for_mapping'='false'
	        and m.evidence->>'source_endpoint_snapping_forbidden'='true'
	        and disposition.disposition='verified'
	    ) then raise exception '#97 Washington NG911 Possum mapping/provenance failed for %',fixture.feature_key; end if;
	    if not exists(select 1 from public.brinesearch_authoritative_road_names n
	      where n.identity_id=v_right and n.active and n.source_record_id like fixture.feature_key||':%'
	        and n.name_type='911' and n.road_name='POSSUM HOLLOW Road'
	        and n.provenance->>'topology_authority'='false'
	        and n.provenance->>'source_endpoint_snapping_forbidden'='true')
	      or not exists(select 1 from public.brinesearch_authoritative_road_names n
	      where n.identity_id=v_right and n.active and n.source_record_id like fixture.feature_key||':%'
	        and n.name_type='legacy' and n.road_name='POSSUM HOLLOW RD'
	        and n.provenance->>'topology_authority'='false'
	        and n.provenance->>'source_endpoint_snapping_forbidden'='true') then
	      raise exception '#97 Washington NG911 Possum aliases were not materialized with no-snap provenance';
	    end if;
	  end loop;
	  if not exists(select 1 from public.brinesearch_authoritative_supplemental_centerlines c
	    join public.brinesearch_road_source_datasets d on d.id=c.dataset_id
	    where d.source_key='pa_washington_ng911_centerlines'
	      and c.source_feature_key like '%RCL22649@co.washington.pa.us%'
	      and extensions.st_dwithin(extensions.st_endpoint(extensions.st_linemerge(c.geom))::extensions.geography,
	        extensions.st_setsrid(extensions.st_makepoint(-80.43276458452749,40.241297490440836),4326)::extensions.geography,0.03)
	      and not extensions.st_dwithin(extensions.st_endpoint(extensions.st_linemerge(c.geom))::extensions.geography,
	        extensions.st_setsrid(extensions.st_makepoint(-80.432763686707645,40.241225572779733),4326)::extensions.geography,1)) then
	    raise exception '#97 Washington NG911 coordinate was snapped to PennDOT topology';
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

-- Clone one already-current, multi-road production route into a rollback-only
-- pad. This preserves the exact saved road sequence, clipped occurrences,
-- graph anchors, source identities and saved GPS while giving the invalidation
-- assertions an isolated pad/occurrence receipt to mutate.
create temporary table issue97_google_live_fixture_state(
  pad_id uuid primary key,
  source_pad_id uuid not null,
  route_revision bigint not null,
  manifest_digest text not null
) on commit drop;

do $issue97_google_fixture_setup$
declare
  v_source_pad uuid;
  v_fixture_pad uuid:=private_verification.brinesearch_issue97_uuid(
    'ISSUE97:LIVE:GOOGLE:ROUTE:FIXTURE'
  );
  v_route_revision bigint;
  v_step_count integer;
  v_road_count integer;
  v_result jsonb;
  v_manifest jsonb;
begin
  if not exists(
    select 1 from public.brinesearch_issue97_release_state state
    where state.singleton and state.cutover_at is not null
  ) then
    raise exception '#97 Google fixture requires the fail-closed issue-97 cutover to be active';
  end if;

  select pad.id into v_source_pad
  from public.pads pad
  cross join lateral (
    select count(*)::integer as step_count,
      count(distinct step.road_id)::integer as road_count
    from public.brinesearch_pad_roads step
    where step.pad_id=pad.id and step.route_group='primary'
      and step.route_variant_index=0
  ) route
  where route.step_count>=2 and route.road_count>=2
    and public.brinesearch_issue97_google_route_current(pad.id)
  order by route.step_count,pad.id
  limit 1;
  if v_source_pad is null then
    raise exception '#97 requires one current multi-road route for the isolated Google fixture';
  end if;

  insert into public.pads(
    id,legacy_id,company,state,pad_name,record_type,latitude,longitude,county,
    structured_road_sequence,road_sequence_status,structured_route_revision
  )
  select v_fixture_pad,'issue97--google-live-route-fixture',
    coalesce(pad.company,'Issue 97'),pad.state,'GOOGLE ROUTE LIVE FIXTURE','pad',
    pad.latitude,pad.longitude,pad.county,pad.structured_road_sequence,
    'owner_verified',pad.structured_route_revision
  from public.pads pad where pad.id=v_source_pad
  returning structured_route_revision into v_route_revision;

  insert into public.brinesearch_pad_roads(
    id,pad_id,road_id,route_group,step_order,instruction,distance_miles,
    route_variant_index,turn_direction,distance_source,distance_status,
    source_details,match_confidence,route_step_id,step_geometry,step_aliases,
    geometry_source,geometry_source_record_id,geometry_status,geometry_version,
    inbound_turn,route_revision,road_geometry_digest,road_geometry_checked_at,
    road_source_method,entry_junction_id,entry_junction_anchor_id,
    junction_build_id,junction_digest
  )
  select
    private_verification.brinesearch_issue97_uuid(
      'ISSUE97:LIVE:GOOGLE:ROW:'||source_step.id::text
    ),
    v_fixture_pad,source_step.road_id,'primary',source_step.step_order,
    source_step.instruction,source_step.distance_miles,0,
    source_step.turn_direction,source_step.distance_source,
    source_step.distance_status,source_step.source_details,
    source_step.match_confidence,
    private_verification.brinesearch_issue97_uuid(
      'ISSUE97:LIVE:GOOGLE:OCCURRENCE:'||source_step.route_step_id::text
    ),
    source_step.step_geometry,source_step.step_aliases,
    source_step.geometry_source,source_step.geometry_source_record_id,
    source_step.geometry_status,source_step.geometry_version,
    source_step.inbound_turn,v_route_revision,source_step.road_geometry_digest,
    source_step.road_geometry_checked_at,source_step.road_source_method,
    source_step.entry_junction_id,source_step.entry_junction_anchor_id,
    source_step.junction_build_id,source_step.junction_digest
  from public.brinesearch_pad_roads source_step
  where source_step.pad_id=v_source_pad and source_step.route_group='primary'
    and source_step.route_variant_index=0
  order by source_step.step_order;

  select count(*)::integer,count(distinct road_id)::integer
  into v_step_count,v_road_count
  from public.brinesearch_pad_roads
  where pad_id=v_fixture_pad and route_group='primary' and route_variant_index=0;
  if v_step_count<2 or v_road_count<2 then
    raise exception '#97 isolated Google fixture is not multi-road';
  end if;

  v_result:=private_verification.brinesearch_issue97_refresh_google_route(v_fixture_pad);
  if coalesce((v_result->>'route_ready')::boolean,false) is not true
     or v_result->>'status' is distinct from 'ready' then
    raise exception '#97 isolated exact route did not refresh ready: %',v_result;
  end if;
  if not exists(
    select 1 from public.pads pad
    where pad.id=v_fixture_pad
      and pad.brinesearch_google_route_status_issue97='ready'
      and pad.brinesearch_google_route_revision_issue97=v_route_revision
  ) or not exists(
    select 1
    from private_verification.brinesearch_google_route_receipts_issue97 receipt
    where receipt.pad_id=v_fixture_pad and receipt.route_revision=v_route_revision
      and receipt.status='ready' and receipt.hold_reason is null
      and receipt.manifest_digest~'^[0-9a-f]{32}$'
      and receipt.dependency_digest~'^[0-9a-f]{32}$'
  ) or not public.brinesearch_issue97_google_route_current(v_fixture_pad) then
    raise exception '#97 ready Google status/receipt is not current after refresh';
  end if;

  select route.manifest into strict v_manifest
  from public.brinesearch_driver_google_routes_public route
  where route.pad_id=v_fixture_pad and route.route_revision=v_route_revision;
  if v_manifest->>'manifest_version' is distinct from 'issue97-google-v1'
     or v_manifest->>'route_ready' is distinct from 'true'
     or v_manifest->>'status' is distinct from 'ready'
     or v_manifest->'generator'->>'coordinate_only' is distinct from 'true'
     or (v_manifest->>'occurrence_count')::integer<>v_step_count
     or v_manifest ?| array['url','urls','road_name','address','instruction','note']
     or (v_manifest->'points'->0)->>'kind' is distinct from 'shape'
     or (v_manifest->'points'->0)->>'shape_role' is distinct from 'route_ingress'
     or (v_manifest->'points'->-1)->>'kind' is distinct from 'pad_destination'
     or not exists(
       select 1 from pg_catalog.jsonb_array_elements(v_manifest->'points') point(value)
       where value->>'kind' in ('junction','shared_entry','shared_exit')
         and value->>'source_kind'='authoritative_junction_anchor'
     ) or exists(
       select 1
       from pg_catalog.jsonb_array_elements(v_manifest->'points')
         with ordinality point(value,ordinality)
       where pg_catalog.jsonb_typeof(value->'latitude') is distinct from 'number'
          or pg_catalog.jsonb_typeof(value->'longitude') is distinct from 'number'
          or case
            when pg_catalog.jsonb_typeof(value->'latitude')='number'
             and pg_catalog.jsonb_typeof(value->'longitude')='number'
            then (value->>'latitude')::double precision not between -90 and 90
              or (value->>'longitude')::double precision not between -180 and 180
            else true
          end
          or coalesce(value->>'sequence','')!~'^[0-9]+$'
          or case when coalesce(value->>'sequence','')~'^[0-9]+$'
            then (value->>'sequence')::bigint<>ordinality else true end
          or value ?| array[
            'url','road_name','road_label','road_number','address','place',
            'instruction','note','query','waypoint'
          ]
          or coalesce(value->>'kind','') not in (
            'shape','junction','shared_entry','shared_exit','pad_destination'
          )
          or (value->>'kind'='shape' and (
            value->>'source_kind' is distinct from 'authoritative_clipped_geometry'
            or coalesce(value->>'identity_id','')=''
            or pg_catalog.jsonb_typeof(value->'source_segment_keys') is distinct from 'array'
            or case
              when pg_catalog.jsonb_typeof(value->'source_segment_keys')='array'
                then pg_catalog.jsonb_array_length(value->'source_segment_keys')=0
              else true
            end
            or coalesce(value->>'source_digest','')!~'^[0-9a-f]{32}$'
            or coalesce(value->>'identity_source_digest','')!~'^[0-9a-f]{32}$'
            or coalesce(value->>'mapping_fingerprint','')!~'^[0-9a-f]{32}$'
            or coalesce(value->>'source_run_id','')=''
            or coalesce(value->>'source_page_set_digest','')!~'^[0-9a-f]{32}$'
          ))
          or (value->>'kind' in ('junction','shared_entry','shared_exit') and (
            value->>'source_kind' is distinct from 'authoritative_junction_anchor'
            or coalesce(value->>'anchor_id','')=''
            or coalesce(value->>'junction_id','')=''
            or coalesce(value->>'graph_build_id','')=''
            or coalesce(value->>'graph_digest','')!~'^[0-9a-f]{32}$'
            or coalesce(value->>'anchor_digest','')!~'^[0-9a-f]{32}$'
          ))
          or (value->>'kind'='pad_destination' and (
            value->>'source_kind' is distinct from 'saved_pad_gps'
            or value->>'pad_id' is distinct from v_fixture_pad::text
          ))
     ) or exists(
       select 1
       from public.brinesearch_pad_roads step
       where step.pad_id=v_fixture_pad and step.route_group='primary'
         and step.route_variant_index=0 and not exists(
           select 1 from pg_catalog.jsonb_array_elements(v_manifest->'points') point(value)
           where value->>'kind'='shape'
             and value->>'occurrence_id'=step.route_step_id::text
             and value->>'road_id'=step.road_id::text
             and value->>'source_kind'='authoritative_clipped_geometry'
         )
     ) then
    raise exception '#97 ready multi-road controls are not coordinate-only and source-proven: %',v_manifest;
  end if;

  insert into issue97_google_live_fixture_state(
    pad_id,source_pad_id,route_revision,manifest_digest
  ) values (
    v_fixture_pad,v_source_pad,v_route_revision,v_manifest->>'manifest_digest'
  );
end
$issue97_google_fixture_setup$;

-- Drain the setup inserts, then defer the same constraint again so the
-- dependency mutation below must create and recover through its own queue row.
set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;
set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;

-- The route occurrence is a live dependency. A bad receipt must synchronously
-- stale the private status, remove the public projection, and remain queued.
-- Restoring the dependency alone must not bypass that fail-closed state.
do $issue97_google_fixture_stale$
declare
  v_fixture_pad uuid:=private_verification.brinesearch_issue97_uuid(
    'ISSUE97:LIVE:GOOGLE:ROUTE:FIXTURE'
  );
  v_changed integer;
begin
  if not public.brinesearch_issue97_google_route_current(v_fixture_pad)
     or exists(
       select 1
       from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
       where queue.pad_id=v_fixture_pad
     ) then
    raise exception '#97 setup queue did not drain to a current ready Google route';
  end if;

  update public.brinesearch_pad_roads step
  set road_geometry_digest=pg_catalog.md5(
    coalesce(step.road_geometry_digest,'')||':issue97-stale-fixture'
  )
  where step.pad_id=v_fixture_pad and step.route_group='primary'
    and step.route_variant_index=0 and step.step_order=1;
  get diagnostics v_changed=row_count;
  if v_changed<>1 then
    raise exception '#97 Google dependency mutation did not target one occurrence';
  end if;

  if exists(
    select 1 from public.brinesearch_driver_google_routes_public route
    where route.pad_id=v_fixture_pad
  ) or public.brinesearch_issue97_google_route_current(v_fixture_pad)
     or not exists(
       select 1 from public.pads pad
       where pad.id=v_fixture_pad
         and pad.brinesearch_google_route_status_issue97='stale'
     ) or not exists(
       select 1
       from private_verification.brinesearch_google_route_receipts_issue97 receipt
       where receipt.pad_id=v_fixture_pad and receipt.status='stale'
         and receipt.hold_reason='published_route_occurrence_changed'
     ) or not exists(
       select 1
       from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
       where queue.pad_id=v_fixture_pad
     ) then
    raise exception '#97 dependency mutation did not stale, hide and queue the Google route';
  end if;

  update public.brinesearch_pad_roads step
  set road_geometry_digest=pg_catalog.md5(road.centerline_geojson::text)
  from public.brinesearch_roads road
  where step.pad_id=v_fixture_pad and step.route_group='primary'
    and step.route_variant_index=0 and step.step_order=1
    and road.id=step.road_id;
  get diagnostics v_changed=row_count;
  if v_changed<>1
     or public.brinesearch_issue97_google_route_current(v_fixture_pad)
     or exists(
       select 1 from public.brinesearch_driver_google_routes_public route
       where route.pad_id=v_fixture_pad
     ) or not exists(
       select 1
       from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
       where queue.pad_id=v_fixture_pad
     ) then
    raise exception '#97 restored dependency bypassed explicit deferred-queue recovery';
  end if;
end
$issue97_google_fixture_stale$;

set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;

do $issue97_google_fixture_recovered$
declare
  v_fixture_pad uuid:=private_verification.brinesearch_issue97_uuid(
    'ISSUE97:LIVE:GOOGLE:ROUTE:FIXTURE'
  );
begin
  if exists(
    select 1
    from private_verification.brinesearch_google_route_refresh_queue_issue97 queue
    where queue.pad_id=v_fixture_pad
  ) or not public.brinesearch_issue97_google_route_current(v_fixture_pad)
     or not exists(
       select 1 from public.pads pad
       join issue97_google_live_fixture_state fixture on fixture.pad_id=pad.id
       where pad.id=v_fixture_pad
         and pad.brinesearch_google_route_status_issue97='ready'
         and pad.brinesearch_google_route_revision_issue97=fixture.route_revision
     ) or not exists(
       select 1
       from private_verification.brinesearch_google_route_receipts_issue97 receipt
       join issue97_google_live_fixture_state fixture using(pad_id)
       where receipt.pad_id=v_fixture_pad and receipt.status='ready'
         and receipt.hold_reason is null
         and receipt.route_revision=fixture.route_revision
         and receipt.manifest_digest=fixture.manifest_digest
         and receipt.manifest->>'dependency_digest'=receipt.dependency_digest
     ) or not exists(
       select 1 from public.brinesearch_driver_google_routes_public route
       join issue97_google_live_fixture_state fixture using(pad_id)
       where route.pad_id=v_fixture_pad and route.route_revision=fixture.route_revision
         and route.manifest->>'manifest_digest'=fixture.manifest_digest
     ) then
    raise exception '#97 deferred queue did not restore the current ready Google route';
  end if;
end
$issue97_google_fixture_recovered$;

rollback;
