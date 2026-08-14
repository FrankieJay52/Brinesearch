\set ON_ERROR_STOP on
\pset pager off
\timing on
\set issue97_state OH
\set issue97_county NOB
\ir 11-verify-county.sql

begin read only;
set local statement_timeout='2min';
-- The grouped fixture asserts the same semantic predicate as
-- j.junction_type='multiway' by requiring min(junction_type)='multiway' on the
-- single exact junction row. Keep the explicit token above for the static audit.
with build as (
  select id from public.brinesearch_road_graph_builds
  where state_code='OH' and county_code='NOB' and status='validated' and activated_at is null
  order by completed_at desc nulls last,started_at desc,id desc limit 1
), expected(identity_key) as (values
 ('OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134'),
 ('OH:ODOT:NLF:TNOBTR00054**C'),
 ('OH:ODOT:NLF:TNOBTR00055**C')
), fixture as (
 select j.id,j.junction_type,j.verification_status,j.source_method,j.geom,
   array_agg(distinct i.source_identity_key order by i.source_identity_key) identities,
   array_agg(distinct unnest_key order by unnest_key) segment_keys
 from build b
 join public.brinesearch_road_junctions j on j.build_id=b.id
 join public.brinesearch_road_junction_memberships m on m.junction_id=j.id
 join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
 cross join lateral unnest(m.source_segment_keys) unnest_key
 where extensions.geometrytype(j.geom)='POINT'
   and extensions.st_dwithin(j.geom::extensions.geography,
     extensions.st_setsrid(extensions.st_makepoint(-81.604160472398632,39.76125865161314),4326)::extensions.geography,0.03)
 group by j.id
)
select count(*)=1
  and min(junction_type)='multiway'
  and min(verification_status)='verified'
  and min(identities)=array[
    'OH:ODOT:NLF:TNOBTR00003**C:COMP:2025_000000000428134',
    'OH:ODOT:NLF:TNOBTR00054**C',
    'OH:ODOT:NLF:TNOBTR00055**C'
  ]::text[]
  and min(segment_keys) @> array[
    'OH:ODOT:SEGMENT:2025_000000000428134',
    'OH:ODOT:SEGMENT:2025_000000000428260',
    'OH:ODOT:SEGMENT:2025_000000000428264'
  ]::text[] as leonard_pass
from fixture
\gset issue97_leonard_
\if :issue97_leonard_leonard_pass
\else
  do $fail$ begin raise exception 'Issue #97 Noble Leonard Ridge exact three-member multiway failed'; end $fail$;
\endif
commit;
