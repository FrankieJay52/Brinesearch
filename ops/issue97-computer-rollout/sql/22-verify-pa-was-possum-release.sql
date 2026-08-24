\set ON_ERROR_STOP on
\pset pager off
\timing on
\set issue97_state PA
\set issue97_county WAS
\ir 11-verify-county.sql

begin read only;
set local statement_timeout='2min';
with build as (
  select id from public.brinesearch_road_graph_builds
  where state_code='PA' and county_code='WAS' and status='validated' and activated_at is null
  order by completed_at desc nulls last,started_at desc,id desc limit 1
), ids as (
 select id,source_identity_key from public.brinesearch_authoritative_road_identities
 where source_identity_key in (
  'PA:PENNDOT:LOCAL:62:2049:110961:EJM9',
  'PA:PENNDOT:LOCAL:62:2061:107905:EHBS'
 ) and active
), junction as (
 select j.id,j.junction_type,j.verification_status,j.source_method,j.geom,
  array_agg(distinct i.source_identity_key order by i.source_identity_key) identities
 from build b join public.brinesearch_road_junctions j on j.build_id=b.id
 join public.brinesearch_road_junction_memberships m on m.junction_id=j.id
 join ids i on i.id=m.identity_id
 where extensions.geometrytype(j.geom)='POINT'
  and extensions.st_dwithin(j.geom::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(-80.4327636867076,40.2412255727797),4326)::extensions.geography,0.03)
 group by j.id
 having count(distinct i.id)=2
), mappings as (
 select count(*)::integer fixture_count
 from (values
  ('pa_washington_ng911_centerlines:NGUID:RCL22649@co.washington.pa.us:SCOPE:PA:WAS','PA:PENNDOT:LOCAL:62:2049:110961:EJM9','PA:PENNDOT:LOCAL:SEGMENT:379767'),
  ('pa_washington_ng911_centerlines:NGUID:RCL39851@co.washington.pa.us:SCOPE:PA:WAS','PA:PENNDOT:LOCAL:62:2061:107905:EHBS','PA:PENNDOT:LOCAL:SEGMENT:386101')
 ) e(feature_key,identity_key,segment_key)
 join public.brinesearch_authoritative_supplemental_centerlines c on c.source_feature_key=e.feature_key and c.active
 join public.brinesearch_authoritative_road_identities i on i.source_identity_key=e.identity_key and i.active
 join public.brinesearch_supplemental_centerline_identity_mappings m on m.centerline_id=c.id and m.identity_id=i.id and m.active and m.ingest_run_id=c.last_ingest_run_id
  and m.mapping_status='verified' and m.mapping_method='exact_source_subsegment_boundary_pair' and m.source_segment_keys=array[e.segment_key]
 where exists(select 1 from public.brinesearch_authoritative_road_names n where n.identity_id=i.id and n.active and n.source_segment_key=e.segment_key and n.name_type='911' and n.source_record_id like c.source_feature_key||':%')
   and exists(select 1 from public.brinesearch_authoritative_road_names n where n.identity_id=i.id and n.active and n.source_segment_key=e.segment_key and n.name_type='legacy' and n.source_record_id like c.source_feature_key||':%')
)
select (select fixture_count from mappings)=2
 and (select count(*) from junction)=1
 and (select min(verification_status) from junction)='verified'
 and (select min(identities) from junction)=array[
   'PA:PENNDOT:LOCAL:62:2049:110961:EJM9',
   'PA:PENNDOT:LOCAL:62:2061:107905:EHBS'
 ]::text[] as possum_pass
\gset issue97_possum_
\if :issue97_possum_possum_pass
\else
  do $fail$ begin raise exception 'Issue #97 PA/WAS Possum reviewed mapping or exact boundary junction failed'; end $fail$;
\endif
commit;
