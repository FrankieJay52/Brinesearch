-- GitHub #97 canonical ODOT provenance regression. Disposable PostGIS database only.
-- Exact Belmont authoritative fixture:
--   2025_000000000270433 PRIMARY_OVERLAP_ID -> 2025_000000000269543.
-- Direct 1e-7 source-to-source snap has distance zero but zero line overlap. The
-- temporary secondary is therefore bound to the authoritative primary topology,
-- after which exact canonical coverage IDs/keys (not geometry guessing) prove it.
begin;

create temporary table tmp_issue97_fixture_segments(
  id uuid primary key,
  identity_id uuid not null,
  source_segment_key text not null,
  source_record_id text not null,
  attributes jsonb not null,
  geom extensions.geometry(LineString,4326) not null
) on commit drop;
create temporary table tmp_issue97_fixture_pairs(
  secondary_segment_id uuid not null,
  secondary_identity_id uuid not null,
  secondary_segment_key text not null,
  secondary_source_record_id text not null,
  primary_segment_id uuid not null,
  primary_identity_id uuid not null,
  primary_segment_key text not null,
  primary_source_record_id text not null,
  overlap_inverse_ind text not null,
  topology_geom extensions.geometry(LineString,4326) not null
) on commit drop;
create temporary table tmp_issue97_fixture_working_segments
  on commit drop as
select * from tmp_issue97_fixture_segments with no data;
create temporary table tmp_issue97_fixture_shared(
  geom_key text not null,
  identity_ids uuid[] not null,
  geom extensions.geometry(LineString,4326) not null
) on commit drop;
create temporary table tmp_issue97_fixture_coverage(
  geom_key text not null,
  identity_ids uuid[] not null,
  identity_id uuid not null,
  source_segment_id uuid not null,
  source_segment_key text not null,
  overlap_geom extensions.geometry(LineString,4326) not null
) on commit drop;

insert into tmp_issue97_fixture_segments values
  ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'OH:ODOT:SEGMENT:2025_000000000270433','2025_000000000270433',
   pg_catalog.jsonb_build_object(
     'OVERLAP_INDICATOR','S','PRIMARY_IND','N','OVERLAP_INVERSE_IND','N',
     'PRIMARY_OVERLAP_ID','2025_000000000269543'
   ),
   extensions.st_geomfromtext('LINESTRING(-80.70100004 40.10000004,-80.70000004 40.10000004)',4326)),
  ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',
   'OH:ODOT:SEGMENT:2025_000000000269543','2025_000000000269543',
   pg_catalog.jsonb_build_object('OVERLAP_INDICATOR','P','PRIMARY_IND','Y'),
   extensions.st_geomfromtext('LINESTRING(-80.70000004 40.10000004,-80.69900004 40.10000004)',4326));

insert into tmp_issue97_fixture_pairs
select secondary.id,secondary.identity_id,secondary.source_segment_key,secondary.source_record_id,
  primary_segment.id,primary_segment.identity_id,primary_segment.source_segment_key,
  primary_segment.source_record_id,secondary.attributes->>'OVERLAP_INVERSE_IND',
  case when secondary.attributes->>'OVERLAP_INVERSE_IND'='Y'
    then extensions.st_reverse(primary_segment.geom) else primary_segment.geom end
from tmp_issue97_fixture_segments secondary
join tmp_issue97_fixture_segments primary_segment
  on primary_segment.source_record_id=secondary.attributes->>'PRIMARY_OVERLAP_ID'
 and primary_segment.attributes->>'OVERLAP_INDICATOR'='P'
 and primary_segment.attributes->>'PRIMARY_IND'='Y'
where secondary.source_record_id='2025_000000000270433'
  and secondary.attributes->>'OVERLAP_INDICATOR'='S'
  and secondary.attributes->>'PRIMARY_IND'='N';

insert into tmp_issue97_fixture_working_segments
select * from tmp_issue97_fixture_segments;
update tmp_issue97_fixture_working_segments secondary
set geom=pair.topology_geom
from tmp_issue97_fixture_pairs pair
where secondary.id=pair.secondary_segment_id;

insert into tmp_issue97_fixture_shared
select 'fixture-card',array[pair.secondary_identity_id,pair.primary_identity_id]::uuid[],
  extensions.st_snaptogrid(pair.topology_geom,0.0000001)
from tmp_issue97_fixture_pairs pair;

insert into tmp_issue97_fixture_coverage
select shared.geom_key,shared.identity_ids,segment.identity_id,segment.id,
  segment.source_segment_key,
  extensions.st_collectionextract(extensions.st_intersection(
    extensions.st_snaptogrid(segment.geom,0.0000001),shared.geom
  ),2)
from tmp_issue97_fixture_shared shared
join tmp_issue97_fixture_working_segments segment
  on segment.identity_id=any(shared.identity_ids)
 and extensions.st_intersects(
   extensions.st_snaptogrid(segment.geom,0.0000001),shared.geom
 )
 and extensions.st_length(extensions.st_collectionextract(extensions.st_intersection(
   extensions.st_snaptogrid(segment.geom,0.0000001),shared.geom
 ),2)::extensions.geography)>0.02;

do $issue97_odot_canonical_fixture$
declare
  v_secondary_before extensions.geometry;
  v_attached integer;
  v_missing integer;
  v_extra integer;
  v_direct_distance_m double precision;
  v_direct_overlap_m double precision;
begin
  select geom into strict v_secondary_before
  from tmp_issue97_fixture_segments
  where source_record_id='2025_000000000270433';

  select extensions.st_distance(
      extensions.st_snaptogrid(secondary.geom,0.0000001)::extensions.geography,
      extensions.st_snaptogrid(primary_segment.geom,0.0000001)::extensions.geography
    ),
    extensions.st_length(extensions.st_collectionextract(extensions.st_intersection(
      extensions.st_snaptogrid(secondary.geom,0.0000001),
      extensions.st_snaptogrid(primary_segment.geom,0.0000001)
    ),2)::extensions.geography)
  into v_direct_distance_m,v_direct_overlap_m
  from tmp_issue97_fixture_segments secondary
  join tmp_issue97_fixture_segments primary_segment
    on primary_segment.source_record_id=secondary.attributes->>'PRIMARY_OVERLAP_ID'
  where secondary.source_record_id='2025_000000000270433';
  if v_direct_distance_m is distinct from 0::double precision
     or v_direct_overlap_m is distinct from 0::double precision then
    raise exception '#97 exact Belmont offset pair no longer proves direct snapped distance 0 / line overlap 0: % / %',
      v_direct_distance_m,v_direct_overlap_m;
  end if;

  if exists(
    select 1 from tmp_issue97_fixture_pairs pair
    cross join tmp_issue97_fixture_shared shared
    where extensions.st_intersects(pair.topology_geom,shared.geom)
  ) then
    raise exception '#97 off-grid fixture no longer reproduces the raw/card mismatch';
  end if;
  if not exists(
    select 1 from tmp_issue97_fixture_pairs pair
    cross join tmp_issue97_fixture_shared shared
    where extensions.st_intersects(
      extensions.st_snaptogrid(pair.topology_geom,0.0000001),shared.geom
    )
  ) then
    raise exception '#97 off-grid fixture canonical topology does not intersect';
  end if;

  with expected as (
    select pair.secondary_source_record_id,pair.primary_source_record_id,
      pair.secondary_segment_key,pair.primary_segment_key,pair.overlap_inverse_ind
    from tmp_issue97_fixture_pairs pair
  ), observed as (
    select pair.secondary_source_record_id,pair.primary_source_record_id,
      pair.secondary_segment_key,pair.primary_segment_key,pair.overlap_inverse_ind
    from tmp_issue97_fixture_pairs pair
    cross join tmp_issue97_fixture_shared shared
    where pair.secondary_identity_id=any(shared.identity_ids)
      and pair.primary_identity_id=any(shared.identity_ids)
      and exists(
        select 1 from tmp_issue97_fixture_coverage coverage
        where coverage.geom_key=shared.geom_key
          and coverage.identity_ids=shared.identity_ids
          and coverage.identity_id=pair.secondary_identity_id
          and coverage.source_segment_id=pair.secondary_segment_id
          and coverage.source_segment_key=pair.secondary_segment_key
      )
      and exists(
        select 1 from tmp_issue97_fixture_coverage coverage
        where coverage.geom_key=shared.geom_key
          and coverage.identity_ids=shared.identity_ids
          and coverage.identity_id=pair.primary_identity_id
          and coverage.source_segment_id=pair.primary_segment_id
          and coverage.source_segment_key=pair.primary_segment_key
      )
  ), missing as (
    select * from expected except select * from observed
  ), extra as (
    select * from observed except select * from expected
  )
  select (select count(*) from observed)::integer,
    (select count(*) from missing)::integer,(select count(*) from extra)::integer
  into v_attached,v_missing,v_extra;
  if v_attached<>1 or v_missing<>0 or v_extra<>0 then
    raise exception '#97 exact canonical source coverage pair set changed: attached %, missing %, extra %',
      v_attached,v_missing,v_extra;
  end if;
  if (select geom from tmp_issue97_fixture_segments
      where source_record_id='2025_000000000270433')
      is distinct from v_secondary_before then
    raise exception '#97 canonical provenance fixture rewrote persistent secondary geometry';
  end if;
end
$issue97_odot_canonical_fixture$;

rollback;
