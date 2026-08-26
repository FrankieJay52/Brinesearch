-- GitHub #97 — first Ascent immutable exact-road-core + saved-GPS batch.
--
-- SPROULL and HAMILTON share one reviewed eastbound OH-799 public-road core.
-- The released line begins at the exact OH-800/OH-799 junction and ends at
-- the exact OH-799/Kennedy Ridge junction on the current Harrison graph.
-- Each saved pad coordinate remains a separate destination-only final leg.
-- No Kennedy Ridge, lease, entrance, Google-public, graph, or cutover
-- authority is created by this migration.

set local statement_timeout='120s';
set local lock_timeout='3s';

create temporary table issue97_ascent_core_batch1_before on commit drop as
select
  (select pg_catalog.to_jsonb(r)
   from private_verification.brinesearch_v18_core_destination_releases r
   where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4') as lasso_private,
  (select pg_catalog.to_jsonb(r)
   from public.brinesearch_driver_core_destination_releases_public r
   where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4') as lasso_public,
  public.brinesearch_v18_driver_core_destination_release(
    '518659d9-bca2-47b0-b294-3141ba679fc4'
  ) as lasso_driver,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
      pg_catalog.pg_get_functiondef(p.oid),p.proacl::text,p.proconfig::text
    ))
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='brinesearch_v18_driver_core_destination_release'
     and p.proargtypes='2950'::pg_catalog.oidvector) as public_core_function_digest,
  (select pg_catalog.md5(pg_catalog.concat_ws('|',
      pg_catalog.pg_get_functiondef(p.oid),p.proacl::text,p.proconfig::text
    ))
   from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname='brinesearch_v18_driver_pad_status_with_google_handoff'
     and p.proargtypes='2950'::pg_catalog.oidvector) as public_status_function_digest,
  (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
   from public.brinesearch_driver_google_routes_public r) as google_routes,
  (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
   from public.brinesearch_driver_google_handoffs_public r) as google_handoffs,
  (select cutover_at
   from public.brinesearch_issue97_release_state
   where singleton) as cutover_at,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(b)::text,'|' order by b.id::text
    ))
   from public.brinesearch_road_graph_builds b
   where b.state_code='OH' and b.county_name='Harrison') as harrison_builds_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(rp)::text,'|' order by rp.id::text
    ))
   from public.brinesearch_route_prep rp
   where rp.id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as route_prep_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(o)::text,'|' order by o.route_prep_id::text,o.occurrence_index
    ))
   from private_verification.brinesearch_route_occurrence_receipts_issue97 o
   where o.route_prep_id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as occurrence_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(t)::text,'|' order by t.route_prep_id::text,t.boundary_index
    ))
   from private_verification.brinesearch_route_transition_receipts_issue97 t
   where t.route_prep_id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as transition_digest,
  (select pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.to_jsonb(g)::text,'|' order by g.route_prep_id::text,g.occurrence_index
    ))
   from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
   where g.route_prep_id in (
     'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
     '4a209eed-5f69-4cc7-b189-85196227c4fe'
   )) as geometry_receipt_digest;

do $preflight$
declare
  v_active_md5 text;
begin
  if (select count(*) from private_verification.brinesearch_v18_core_destination_releases)<>1
     or (select count(*) from public.brinesearch_driver_core_destination_releases_public)<>1
     or not private_verification.brinesearch_v18_core_destination_release_receipt_active(
       '518659d9-bca2-47b0-b294-3141ba679fc4'
     )
     or public.brinesearch_v18_driver_core_destination_release(
       '518659d9-bca2-47b0-b294-3141ba679fc4'
     ) is null
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
       'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
     )
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
       'd7898e8c-1bb6-48f8-b5e0-87bc1898420e'
     ) then
    raise exception 'Frozen LASSO v1 starting checkpoint diverged';
  end if;

  select pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
  into strict v_active_md5
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private_verification'
    and p.proname='brinesearch_v18_core_destination_release_receipt_active'
    and p.proargtypes='2950'::pg_catalog.oidvector;
  if v_active_md5<>'26025eda77187a68f2d943270e817646'
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_core_destination_release_receipt_active_v1_lasso(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_core_destination_release_receipt_active_v2(uuid)'
     ) is not null then
    raise exception 'Core-destination runtime function checkpoint diverged';
  end if;

  if (select pg_catalog.pg_get_constraintdef(c.oid,true)
      from pg_catalog.pg_constraint c
      where c.conrelid='private_verification.brinesearch_v18_core_destination_releases'::pg_catalog.regclass
        and c.conname='brinesearch_v18_core_destination_releases_release_version_check')
       <>$$CHECK (release_version = 'v18-core-destination-v1'::text)$$
     or
     (select pg_catalog.pg_get_constraintdef(c.oid,true)
      from pg_catalog.pg_constraint c
      where c.conrelid='public.brinesearch_driver_core_destination_releases_public'::pg_catalog.regclass
        and c.conname='brinesearch_driver_core_destination_relea_release_version_check')
       <>$$CHECK (release_version = 'v18-core-destination-v1'::text)$$ then
    raise exception 'Core-destination release-version constraints diverged';
  end if;

  if exists(
       select 1
       from private_verification.brinesearch_v18_core_destination_releases
       where pad_id in (
         'b9a8e55c-3583-4019-85fc-54a03d420ace',
         'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
       )
     )
     or exists(
       select 1
       from public.brinesearch_driver_core_destination_releases_public
       where pad_id in (
         'b9a8e55c-3583-4019-85fc-54a03d420ace',
         'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
       )
     ) then
    raise exception 'SPROULL/HAMILTON core release already exists';
  end if;

  if (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or (select count(*) from public.brinesearch_driver_google_handoffs_public)<>1
     or (select cutover_at from public.brinesearch_issue97_release_state where singleton)
          is not null
     or private_verification.brinesearch_issue97_graph_build_release_current(
       'f4e4d43f-e86c-499c-893f-73f2eef3dc29'
     ) is not true then
    raise exception 'Google/cutover/current Harrison graph checkpoint diverged';
  end if;
end
$preflight$;

alter table private_verification.brinesearch_v18_core_destination_releases
drop constraint brinesearch_v18_core_destination_releases_release_version_check;
alter table private_verification.brinesearch_v18_core_destination_releases
add constraint brinesearch_v18_core_destination_releases_release_version_check
check(release_version in ('v18-core-destination-v1','v18-core-destination-v2'));

alter table public.brinesearch_driver_core_destination_releases_public
drop constraint brinesearch_driver_core_destination_relea_release_version_check;
alter table public.brinesearch_driver_core_destination_releases_public
add constraint brinesearch_driver_core_destination_relea_release_version_check
check(release_version in ('v18-core-destination-v1','v18-core-destination-v2'));

alter function
  private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)
rename to brinesearch_v18_core_destination_release_receipt_active_v1_lasso;

comment on function
  private_verification.brinesearch_v18_core_destination_release_receipt_active_v1_lasso(uuid) is
'Unchanged frozen LASSO v1 receipt gate, preserved by rename for byte-identical regression behavior.';

create function private_verification.brinesearch_v18_core_destination_release_receipt_active_v2(
  p_pad_id uuid
)
returns boolean
language plpgsql
stable
strict
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
declare
  v_receipt private_verification.brinesearch_v18_core_destination_releases%rowtype;
  v_projection public.brinesearch_driver_core_destination_releases_public%rowtype;
  v_release_digest text;
  v_route_id uuid;
  v_destination_latitude double precision;
  v_destination_longitude double precision;
begin
  if p_pad_id='b9a8e55c-3583-4019-85fc-54a03d420ace' then
    v_route_id:='e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a';
    v_destination_latitude:=40.225052;
    v_destination_longitude:=-81.177456;
  elsif p_pad_id='f5a82acf-d7c0-4ce3-ad4e-0de810551450' then
    v_route_id:='4a209eed-5f69-4cc7-b189-85196227c4fe';
    v_destination_latitude:=40.22914;
    v_destination_longitude:=-81.151012;
  else
    return false;
  end if;

  select * into strict v_receipt
  from private_verification.brinesearch_v18_core_destination_releases receipt
  where receipt.pad_id=p_pad_id and receipt.revoked_at is null;
  select * into strict v_projection
  from public.brinesearch_driver_core_destination_releases_public projection
  where projection.pad_id=p_pad_id;

  if v_receipt.record_revision is distinct from v_projection.record_revision
     or v_receipt.route_revision is distinct from v_projection.route_revision
     or v_receipt.release_version is distinct from v_projection.release_version
     or v_receipt.route_steps is distinct from v_projection.route_steps
     or v_receipt.route_geometry is distinct from v_projection.route_geometry
     or v_receipt.graph_county is distinct from v_projection.graph_county
     or v_receipt.graph_last_verified_at is distinct from v_projection.graph_last_verified_at
     or v_receipt.destination_latitude is distinct from v_projection.destination_latitude
     or v_receipt.destination_longitude is distinct from v_projection.destination_longitude
     or v_receipt.handoff is distinct from v_projection.handoff
     or v_receipt.dependency_digest is distinct from v_projection.dependency_digest
     or v_receipt.release_digest is distinct from v_projection.release_digest
     or v_receipt.verified_at is distinct from v_projection.published_at then
    return false;
  end if;

  v_release_digest:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_projection.record_revision,v_projection.route_revision::text,
    v_projection.release_version,v_projection.route_steps::text,
    v_projection.route_geometry::text,v_projection.graph_county,
    (extract(epoch from v_projection.graph_last_verified_at))::text,
    v_projection.destination_latitude::text,
    v_projection.destination_longitude::text,v_projection.handoff::text,
    v_projection.dependency_digest
  ));

  if v_release_digest is distinct from v_projection.release_digest
     or v_receipt.route_prep_id is distinct from v_route_id
     or v_projection.record_revision is distinct from '1786258360881449'
     or v_projection.route_revision is distinct from 1
     or v_projection.release_version is distinct from 'v18-core-destination-v2'
     or v_projection.graph_county is distinct from 'Harrison'
     or v_projection.graph_last_verified_at is distinct from
          '2026-08-24T23:53:01.785257Z'::timestamptz
     or v_projection.destination_latitude is distinct from v_destination_latitude
     or v_projection.destination_longitude is distinct from v_destination_longitude then
    return false;
  end if;

  if v_projection.route_steps is distinct from pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'order',1,'kind','turn','displayName','OH-799',
      'instruction','Take a sharp left onto OH-799 east',
      'distanceMiles',2.755169::numeric,
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-799','Route 799','SR 799','SR-799','CLENDENING LAKE RD'
      )
    )
  ) then
    return false;
  end if;

  if v_projection.route_geometry->>'type' is distinct from 'FeatureCollection'
     or pg_catalog.jsonb_typeof(v_projection.route_geometry->'features')
          is distinct from 'array'
     or pg_catalog.jsonb_array_length(v_projection.route_geometry->'features')
          is distinct from 1
     or v_projection.route_geometry#>'{features,0,properties}'
          is distinct from '{"stepOrder":1}'::jsonb
     or pg_catalog.md5(v_projection.route_geometry::text)
          is distinct from 'dff2e04cfcb292adde25f47a0d218fa7' then
    return false;
  end if;

  if v_projection.handoff is distinct from pg_catalog.jsonb_build_object(
    'handoff_version','v18-core-destination-v2',
    'pad_id',p_pad_id,
    'route_revision',1,
    'source_dependency_digest',v_projection.dependency_digest,
    'origin_mode','current_location_until_route_ingress',
    'waypoints',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'sequence',1,'latitude',40.2273687::double precision,
        'longitude',-81.2472549::double precision
      ),
      pg_catalog.jsonb_build_object(
        'sequence',2,'latitude',40.2310665::double precision,
        'longitude',-81.2016988::double precision
      )
    ),
    'core_end',pg_catalog.jsonb_build_object(
      'sequence',2,'role','exact_public_road_handoff',
      'latitude',40.2310665::double precision,
      'longitude',-81.2016988::double precision
    ),
    'destination',pg_catalog.jsonb_build_object(
      'sequence',3,'pad_id',p_pad_id,'role','saved_pad_destination',
      'latitude',v_destination_latitude,
      'longitude',v_destination_longitude
    ),
    'final_leg_mode','google_to_saved_gps_unapproved'
  ) then
    return false;
  end if;

  if v_receipt.evidence->>'contract' is distinct from
       'exact_public_road_core_plus_saved_gps_destination'
     or v_receipt.evidence->>'current_graph_build_id' is distinct from
       'f4e4d43f-e86c-499c-893f-73f2eef3dc29'
     or v_receipt.evidence->>'core_identity_id' is distinct from
       'bd4624be-178e-328d-9f9e-462d6066532e'
     or v_receipt.evidence->>'core_road_id' is distinct from
       'd7a42c92-9a77-49e0-8792-cd634242272e'
     or v_receipt.evidence->>'core_line_md5' is distinct from
       '4e7b00d3a709f44268c28a66bb503550'
     or v_receipt.evidence->>'destination_role' is distinct from
       'saved_pad_destination'
     or coalesce((v_receipt.evidence->>'gps_selected_road')::boolean,true)
     or coalesce((v_receipt.evidence->>'approved_geometry_reaches_destination')::boolean,true)
     or coalesce((v_receipt.evidence->>'private_access_geometry_created')::boolean,true) then
    return false;
  end if;

  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_core_destination_release_receipt_active_v2(uuid)
from public,anon,authenticated,service_role;

create function private_verification.brinesearch_v18_core_destination_release_receipt_active(
  p_pad_id uuid
)
returns boolean
language plpgsql
stable
strict
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
begin
  if p_pad_id='518659d9-bca2-47b0-b294-3141ba679fc4' then
    return private_verification.brinesearch_v18_core_destination_release_receipt_active_v1_lasso(
      p_pad_id
    );
  end if;
  if p_pad_id in (
    'b9a8e55c-3583-4019-85fc-54a03d420ace',
    'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
  ) then
    return private_verification.brinesearch_v18_core_destination_release_receipt_active_v2(
      p_pad_id
    );
  end if;
  return false;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid) is
'Dispatches only to the immutable LASSO v1 or SPROULL/HAMILTON v2 receipt gates. It does not recompute graph currentness on driver reads.';

do $release_batch$
declare
  v_target record;
  v_pad public.pads%rowtype;
  v_route public.brinesearch_route_prep%rowtype;
  v_road public.brinesearch_roads%rowtype;
  v_graph public.brinesearch_road_graph_builds%rowtype;
  v_snapshot_id uuid;
  v_record_revision text;
  v_direction_revision timestamptz;
  v_direction_text text;
  v_direction_md5 text;
  v_structured_md5 text;
  v_expected_direction_md5 text;
  v_expected_structured_md5 text;
  v_anchor_start extensions.geometry;
  v_anchor_end extensions.geometry;
  v_master extensions.geometry;
  v_core extensions.geometry;
  v_fraction_start double precision;
  v_fraction_end double precision;
  v_route_steps jsonb;
  v_route_geometry jsonb;
  v_handoff jsonb;
  v_safety jsonb;
  v_dependency text;
  v_release text;
  v_reference jsonb;
  v_verified_at constant timestamptz:='2026-08-26T21:00:00Z';
begin
  select * into strict v_graph
  from public.brinesearch_road_graph_builds
  where id='f4e4d43f-e86c-499c-893f-73f2eef3dc29';
  if v_graph.status<>'active'
     or v_graph.graph_digest<>'71cb3479ac57b6f5dc26d0985a056d06'
     or v_graph.source_revision_digest<>'ccbfb928a7c7ae96e72aebfc18037165'
     or v_graph.activated_at is distinct from
       '2026-08-24T23:53:01.785257Z'::timestamptz
     or private_verification.brinesearch_issue97_graph_build_release_current(v_graph.id)
          is not true then
    raise exception 'Current Harrison graph proof failed';
  end if;

  select snapshot.snapshot_id into strict v_snapshot_id
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';

  select anchor.geom into strict v_anchor_start
  from public.brinesearch_road_junction_anchors anchor
  join public.brinesearch_road_junctions junction
    on junction.id=anchor.junction_id
  where anchor.id='a6595489-16d9-00f4-aa17-d07dcdb24103'
    and anchor.anchor_digest='b1efdca9922ef16edf2771e65b700028'
    and junction.id='178a32b5-c32b-9b6a-8d7c-7445a5a2475f'
    and junction.build_id=v_graph.id
    and junction.logical_junction_id='73f61776-737c-db0f-33fe-3c15cd6ee452'
    and junction.graph_digest='5edeaba19c1a23b92fe65c15bccd7664';
  select anchor.geom into strict v_anchor_end
  from public.brinesearch_road_junction_anchors anchor
  join public.brinesearch_road_junctions junction
    on junction.id=anchor.junction_id
  where anchor.id='219707e4-cc71-d90d-3368-0f29f8f72b9d'
    and anchor.anchor_digest='d1c9e40f2a684eb45e819a8060ef9925'
    and junction.id='7f55c4cf-3b80-8b4c-d514-e909c68afff8'
    and junction.build_id=v_graph.id
    and junction.logical_junction_id='aae02773-2673-ac23-106b-3cc8381a0d33'
    and junction.graph_digest='e6e8e3bd426b494a5b9a2afa7e638d53';

  if not extensions.st_equals(
       v_anchor_start,
       extensions.st_setsrid(extensions.st_makepoint(-81.2472549,40.2273687),4326)
     )
     or not extensions.st_equals(
       v_anchor_end,
       extensions.st_setsrid(extensions.st_makepoint(-81.2016988,40.2310665),4326)
     )
     or (select count(*)
         from public.brinesearch_road_junction_memberships membership
         where membership.junction_id='178a32b5-c32b-9b6a-8d7c-7445a5a2475f')<>2
     or not exists(
       select 1 from public.brinesearch_road_junction_memberships membership
       where membership.junction_id='178a32b5-c32b-9b6a-8d7c-7445a5a2475f'
         and membership.identity_id='bd4624be-178e-328d-9f9e-462d6066532e'
         and membership.road_id='d7a42c92-9a77-49e0-8792-cd634242272e'
         and membership.provenance->>'source_identity_key'=
             'OH:ODOT:NLF:SHASSR00799**C'
         and membership.provenance->>'source_digest'=
             '3f0c74e3a3019f5ce019ab0720f6e8d6'
     )
     or (select count(*)
         from public.brinesearch_road_junction_memberships membership
         where membership.junction_id='7f55c4cf-3b80-8b4c-d514-e909c68afff8')<>2
     or not exists(
       select 1 from public.brinesearch_road_junction_memberships membership
       where membership.junction_id='7f55c4cf-3b80-8b4c-d514-e909c68afff8'
         and membership.identity_id='bd4624be-178e-328d-9f9e-462d6066532e'
         and membership.road_id='d7a42c92-9a77-49e0-8792-cd634242272e'
         and membership.provenance->>'source_identity_key'=
             'OH:ODOT:NLF:SHASSR00799**C'
         and membership.provenance->>'source_digest'=
             '3f0c74e3a3019f5ce019ab0720f6e8d6'
     ) then
    raise exception 'Current OH-799 graph junction/membership proof failed';
  end if;

  select * into strict v_road
  from public.brinesearch_roads
  where id='d7a42c92-9a77-49e0-8792-cd634242272e';
  v_master:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    'bd4624be-178e-328d-9f9e-462d6066532e'
  );
  if v_road.canonical_name<>'OH-799'
     or v_road.verification_status<>'verified'
     or v_road.geometry_status<>'official_centerline_loaded'
     or coalesce(v_road.candidate_only,false)
     or not coalesce(v_road.approved_by_default,false)
     or private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
          'bd4624be-178e-328d-9f9e-462d6066532e'
        )<>'2448e5ba3c6fff940b02d40121186cfa'
     or extensions.geometrytype(v_master)<>'LINESTRING'
     or not extensions.st_coveredby(
       extensions.st_setsrid(
         extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326
       ),
       extensions.st_buffer(v_master::extensions.geography,0.20)::extensions.geometry
     )
     or not extensions.st_coveredby(
       v_master,
       extensions.st_buffer(
         extensions.st_setsrid(
           extensions.st_geomfromgeojson(v_road.centerline_geojson::text),4326
         )::extensions.geography,0.20
       )::extensions.geometry
     ) then
    raise exception 'Current authoritative OH-799 identity/road proof failed';
  end if;

  if extensions.st_distance(
       v_master::extensions.geography,v_anchor_start::extensions.geography
     )>0.01
     or extensions.st_distance(
       v_master::extensions.geography,v_anchor_end::extensions.geography
     )>0.01 then
    raise exception 'Current OH-799 anchors moved off the exact identity';
  end if;
  v_fraction_start:=extensions.st_linelocatepoint(v_master,v_anchor_start);
  v_fraction_end:=extensions.st_linelocatepoint(v_master,v_anchor_end);
  if v_fraction_start>=v_fraction_end then
    raise exception 'Reviewed eastbound OH-799 direction is not preserved';
  end if;
  v_core:=extensions.st_linesubstring(v_master,v_fraction_start,v_fraction_end);
  v_core:=extensions.st_setpoint(v_core,0,v_anchor_start);
  v_core:=extensions.st_setpoint(
    v_core,extensions.st_npoints(v_core)-1,v_anchor_end
  );
  v_core:=extensions.st_setsrid(
    extensions.st_geomfromgeojson(extensions.st_asgeojson(v_core,15)),4326
  );
  if pg_catalog.md5(extensions.st_asgeojson(v_core,7))
       <>'4e7b00d3a709f44268c28a66bb503550'
     or pg_catalog.round(
       (extensions.st_length(v_core::extensions.geography)/1609.344)::numeric,6
     )<>2.755169::numeric then
    raise exception 'Current exact eastbound OH-799 clip drifted';
  end if;

  v_route_steps:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'order',1,'kind','turn','displayName','OH-799',
      'instruction','Take a sharp left onto OH-799 east',
      'distanceMiles',2.755169::numeric,
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-799','Route 799','SR 799','SR-799','CLENDENING LAKE RD'
      )
    )
  );
  v_route_geometry:=pg_catalog.jsonb_build_object(
    'type','FeatureCollection',
    'features',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object('stepOrder',1),
        'geometry',extensions.st_asgeojson(v_core,7)::jsonb
      )
    )
  );
  if pg_catalog.md5(v_route_geometry::text)
       <>'dff2e04cfcb292adde25f47a0d218fa7' then
    raise exception 'Frozen v2 public geometry digest drifted';
  end if;

  for v_target in
    select *
    from (values
      (
        'b9a8e55c-3583-4019-85fc-54a03d420ace'::uuid,
        'HAMILTON'::text,
         'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a'::uuid,
         '11e01d74aa30bf1951ccb5528cdd3bd9'::text,
         '5da5e2ca286a48447874440f602a1476'::text,
         '5867273debfa12b8743117a80a46aa87'::text,
         40.225052::double precision,-81.177456::double precision
      ),
      (
        'f5a82acf-d7c0-4ce3-ad4e-0de810551450'::uuid,
        'SPROULL'::text,
         '4a209eed-5f69-4cc7-b189-85196227c4fe'::uuid,
         '6e4ea7cb818585c12186b68df91db39f'::text,
         '56c8728f2143a91a1943e154f66db581'::text,
         '4fedea2558a7967fe8d4902b3a71a5c8'::text,
         40.22914::double precision,-81.151012::double precision
      )
    ) target(
      pad_id,pad_name,route_id,directions_md5,structured_md5,
      oh799_receipt_digest,
      destination_latitude,destination_longitude
    )
  loop
    select * into strict v_pad from public.pads where id=v_target.pad_id;
    select * into strict v_route
    from public.brinesearch_route_prep
    where id=v_target.route_id and pad_id=v_target.pad_id and active
      and route_group='primary' and variant_index=1;
    select row.record_revision::text into strict v_record_revision
    from public.brinesearch_directory_snapshot_rows_v18 row
    where row.snapshot_id=v_snapshot_id and row.pad_id=v_target.pad_id;
    select directions.directions_clear,directions.source_revision
    into strict v_direction_text,v_direction_revision
    from public.brinesearch_driver_directions_public directions
    where directions.pad_id=v_target.pad_id;

    v_direction_md5:=pg_catalog.md5(coalesce(v_direction_text,''));
    v_structured_md5:=pg_catalog.md5(coalesce(v_pad.structured_road_sequence,''));
    v_expected_direction_md5:=v_target.directions_md5;
    v_expected_structured_md5:=v_target.structured_md5;
    if v_pad.pad_name<>v_target.pad_name
       or v_pad.company<>'Ascent' or v_pad.county<>'Harrison'
       or v_pad.state<>'Ohio'
       or v_pad.latitude is distinct from v_target.destination_latitude
       or v_pad.longitude is distinct from v_target.destination_longitude
       or v_record_revision<>'1786258360881449'
       or v_route.source_sequence_hash<>'b67e577f9c1c5954f850e5322b571880'
       or v_route.source_sequence<>'OH-800 → OH-799 → Kennedy Ridge Rd'
       or v_direction_md5<>v_expected_direction_md5
       or v_structured_md5<>v_expected_structured_md5 then
      raise exception '% reviewed pad/route/direction checkpoint diverged',
        v_target.pad_name;
    end if;

    if (select count(*)
        from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
        where receipt.route_prep_id=v_target.route_id
          and receipt.resolution_status='resolved')<>3
       or not exists(
         select 1
         from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
         where geometry.route_prep_id=v_target.route_id
           and geometry.occurrence_index=3
           and geometry.status='held'
           and geometry.hold_reason=
              'verified_pad_gps_not_on_final_authoritative_geometry'
       )
       or not exists(
         select 1
         from private_verification.brinesearch_route_occurrence_receipts_issue97 receipt
         where receipt.route_prep_id=v_target.route_id
           and receipt.occurrence_index=2
           and receipt.resolution_status='resolved'
           and receipt.identity_id='bd4624be-178e-328d-9f9e-462d6066532e'
           and receipt.canonical_road_id='d7a42c92-9a77-49e0-8792-cd634242272e'
           and receipt.source_identity_key='OH:ODOT:NLF:SHASSR00799**C'
           and receipt.source_digest='3f0c74e3a3019f5ce019ab0720f6e8d6'
           and receipt.receipt_digest=v_target.oh799_receipt_digest
       ) then
      raise exception '% exact identity/final-GPS hold checkpoint diverged',
        v_target.pad_name;
    end if;

    v_safety:=private_verification.brinesearch_issue97_pad_safety_facts(
      v_target.pad_id
    );
    if coalesce((v_safety->>'has_hold')::boolean,false) then
      raise exception '% has a current route safety hold',v_target.pad_name;
    end if;

    select reference into strict v_reference
    from pg_catalog.jsonb_array_elements(
      public.brinesearch_v18_pad_reference_coordinates(v_snapshot_id)->'rows'
    ) reference
    where reference->>'padId'=v_target.pad_id::text;
    if v_reference->>'referenceKind'<>'saved_pad_reference'
       or (v_reference->>'latitude')::double precision is distinct from
            v_target.destination_latitude
       or (v_reference->>'longitude')::double precision is distinct from
            v_target.destination_longitude then
      raise exception '% destination is not the exact saved pad reference',
        v_target.pad_name;
    end if;

    v_dependency:=pg_catalog.md5(pg_catalog.concat_ws('|',
      v_target.pad_id::text,v_record_revision,v_target.route_id::text,
      pg_catalog.to_jsonb(v_route)::text,
      (select pg_catalog.string_agg(pg_catalog.to_jsonb(step)::text,'|'
         order by step.step_order)
       from public.brinesearch_route_prep_steps step
       where step.route_prep_id=v_target.route_id and step.active),
      v_direction_md5,v_direction_revision::text,
      v_graph.id::text,v_graph.graph_digest,v_graph.source_revision_digest,
      v_graph.activated_at::text,
      '178a32b5-c32b-9b6a-8d7c-7445a5a2475f',
      'a6595489-16d9-00f4-aa17-d07dcdb24103',
      'b1efdca9922ef16edf2771e65b700028',
      '7f55c4cf-3b80-8b4c-d514-e909c68afff8',
      '219707e4-cc71-d90d-3368-0f29f8f72b9d',
      'd1c9e40f2a684eb45e819a8060ef9925',
      'bd4624be-178e-328d-9f9e-462d6066532e',
      '2448e5ba3c6fff940b02d40121186cfa',
      pg_catalog.md5(v_route_geometry::text),
      v_target.destination_latitude::text,
      v_target.destination_longitude::text,
      v_safety::text,
      'v18-core-destination-v2',
      'owner-authorized-ascent-batch-2026-08-26'
    ));

    v_handoff:=pg_catalog.jsonb_build_object(
      'handoff_version','v18-core-destination-v2',
      'pad_id',v_target.pad_id,
      'route_revision',1,
      'source_dependency_digest',v_dependency,
      'origin_mode','current_location_until_route_ingress',
      'waypoints',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'sequence',1,'latitude',40.2273687::double precision,
          'longitude',-81.2472549::double precision
        ),
        pg_catalog.jsonb_build_object(
          'sequence',2,'latitude',40.2310665::double precision,
          'longitude',-81.2016988::double precision
        )
      ),
      'core_end',pg_catalog.jsonb_build_object(
        'sequence',2,'role','exact_public_road_handoff',
        'latitude',40.2310665::double precision,
        'longitude',-81.2016988::double precision
      ),
      'destination',pg_catalog.jsonb_build_object(
        'sequence',3,'pad_id',v_target.pad_id,
        'role','saved_pad_destination',
        'latitude',v_target.destination_latitude,
        'longitude',v_target.destination_longitude
      ),
      'final_leg_mode','google_to_saved_gps_unapproved'
    );
    v_release:=pg_catalog.md5(pg_catalog.concat_ws('|',
      v_record_revision,'1','v18-core-destination-v2',v_route_steps::text,
      v_route_geometry::text,'Harrison',
      (extract(epoch from v_graph.activated_at))::text,
      v_target.destination_latitude::text,
      v_target.destination_longitude::text,v_handoff::text,v_dependency
    ));

    insert into private_verification.brinesearch_v18_core_destination_releases(
      pad_id,record_revision,route_prep_id,route_revision,release_version,
      route_steps,route_geometry,graph_county,graph_last_verified_at,
      destination_latitude,destination_longitude,handoff,dependency_digest,
      release_digest,evidence,authorization_basis,verified_at
    ) values(
      v_target.pad_id,v_record_revision,v_target.route_id,1,
      'v18-core-destination-v2',v_route_steps,v_route_geometry,'Harrison',
      v_graph.activated_at,v_target.destination_latitude,
      v_target.destination_longitude,v_handoff,v_dependency,v_release,
      pg_catalog.jsonb_build_object(
        'issue',97,
        'contract','exact_public_road_core_plus_saved_gps_destination',
        'current_graph_build_id',v_graph.id,
        'current_graph_digest',v_graph.graph_digest,
        'core_identity_id','bd4624be-178e-328d-9f9e-462d6066532e',
        'core_road_id','d7a42c92-9a77-49e0-8792-cd634242272e',
        'core_source_identity_key','OH:ODOT:NLF:SHASSR00799**C',
        'core_start_anchor_id','a6595489-16d9-00f4-aa17-d07dcdb24103',
        'core_end_anchor_id','219707e4-cc71-d90d-3368-0f29f8f72b9d',
        'core_line_md5','4e7b00d3a709f44268c28a66bb503550',
        'destination_role','saved_pad_destination',
        'reviewed_directions_md5',v_direction_md5,
        'gps_selected_road',false,
        'nearest_road_matching',false,
        'fuzzy_matching',false,
        'name_only_matching',false,
        'private_access_geometry_created',false,
        'approved_geometry_reaches_destination',false,
        'kennedy_ridge_geometry_approved',false,
        'stale_transition_receipts_used',false
      ),
      'PC authorized the Ascent approved-core plus GPS-destination plan. This immutable release approves only the exact current-graph OH-799 core; Kennedy Ridge and the saved GPS final leg remain unapproved geometry.',
      v_verified_at
    );

    insert into public.brinesearch_driver_core_destination_releases_public(
      pad_id,record_revision,route_revision,release_version,route_steps,
      route_geometry,graph_county,graph_last_verified_at,destination_latitude,
      destination_longitude,handoff,dependency_digest,release_digest,published_at
    ) values(
      v_target.pad_id,v_record_revision,1,'v18-core-destination-v2',
      v_route_steps,v_route_geometry,'Harrison',v_graph.activated_at,
      v_target.destination_latitude,v_target.destination_longitude,
      v_handoff,v_dependency,v_release,v_verified_at
    );
  end loop;
end
$release_batch$;

do $postflight$
declare
  v_before issue97_ascent_core_batch1_before%rowtype;
  v_bundle jsonb;
  v_pad_id uuid;
begin
  select * into strict v_before from issue97_ascent_core_batch1_before;

  if not private_verification.brinesearch_v18_core_destination_release_receipt_active(
       '518659d9-bca2-47b0-b294-3141ba679fc4'
     )
     or (select pg_catalog.to_jsonb(r)
         from private_verification.brinesearch_v18_core_destination_releases r
         where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4')
          is distinct from v_before.lasso_private
     or (select pg_catalog.to_jsonb(r)
         from public.brinesearch_driver_core_destination_releases_public r
         where r.pad_id='518659d9-bca2-47b0-b294-3141ba679fc4')
          is distinct from v_before.lasso_public
     or public.brinesearch_v18_driver_core_destination_release(
          '518659d9-bca2-47b0-b294-3141ba679fc4'
        ) is distinct from v_before.lasso_driver then
    raise exception 'Frozen LASSO v1 regression failed';
  end if;

  foreach v_pad_id in array array[
    'b9a8e55c-3583-4019-85fc-54a03d420ace'::uuid,
    'f5a82acf-d7c0-4ce3-ad4e-0de810551450'::uuid
  ]
  loop
    if private_verification.brinesearch_v18_core_destination_release_receipt_active(
         v_pad_id
       ) is not true
       or public.brinesearch_v18_driver_core_destination_release(v_pad_id)
            is null then
      raise exception 'V2 immutable receipt is not active for %',v_pad_id;
    end if;
    v_bundle:=public.brinesearch_v18_driver_pad_status_with_google_handoff(
      v_pad_id
    );
    if v_bundle#>>'{status,route,source}'<>'exact_graph_handoff'
       or v_bundle#>>'{status,route,state}'<>'ready'
       or v_bundle#>>'{status,destination,role}'<>'saved_pad_destination'
       or v_bundle#>>'{coreDestinationRelease,releaseVersion}'
            <>'v18-core-destination-v2'
       or pg_catalog.jsonb_array_length(
            v_bundle#>'{status,route,steps}'
          )<>1
       or pg_catalog.jsonb_array_length(
            v_bundle#>'{status,route,geometry,features}'
          )<>1
       or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
       or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
      raise exception 'V2 driver contract failed closed for %',v_pad_id;
    end if;
  end loop;

  if (select count(*) from private_verification.brinesearch_v18_core_destination_releases)<>3
     or (select count(*) from public.brinesearch_driver_core_destination_releases_public)<>3
     or (select count(*) from private_verification.brinesearch_v18_core_destination_releases
         where release_version='v18-core-destination-v1')<>1
     or (select count(*) from private_verification.brinesearch_v18_core_destination_releases
         where release_version='v18-core-destination-v2')<>2 then
    raise exception 'Core-destination release counts are not exact';
  end if;

  if (select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private_verification'
        and p.proname in (
          'brinesearch_v18_core_destination_release_receipt_active_v1_lasso',
          'brinesearch_v18_core_destination_release_receipt_active_v2',
          'brinesearch_v18_core_destination_release_receipt_active'
        )
        and p.proargtypes='2950'::pg_catalog.oidvector
        and p.prosecdef
        and p.provolatile='s'
        and p.proisstrict
        and p.proconfig=array[
          'search_path=""','statement_timeout=2s','lock_timeout=500ms'
        ]::text[]
        and p.proacl::text='{postgres=X/postgres}')<>3
     or pg_catalog.has_function_privilege(
          'anon',
          'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'authenticated',
          'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)',
          'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',
          'private_verification.brinesearch_v18_core_destination_release_receipt_active(uuid)',
          'execute'
        )
     or (select pg_catalog.pg_get_constraintdef(c.oid,true)
         from pg_catalog.pg_constraint c
         where c.conrelid='private_verification.brinesearch_v18_core_destination_releases'::pg_catalog.regclass
           and c.conname='brinesearch_v18_core_destination_releases_release_version_check')
          <>$$CHECK (release_version = ANY (ARRAY['v18-core-destination-v1'::text, 'v18-core-destination-v2'::text]))$$
     or (select pg_catalog.pg_get_constraintdef(c.oid,true)
         from pg_catalog.pg_constraint c
         where c.conrelid='public.brinesearch_driver_core_destination_releases_public'::pg_catalog.regclass
           and c.conname='brinesearch_driver_core_destination_relea_release_version_check')
          <>$$CHECK (release_version = ANY (ARRAY['v18-core-destination-v1'::text, 'v18-core-destination-v2'::text]))$$ then
    raise exception 'V2 function security/grant/constraint contract diverged';
  end if;

  if (select pg_catalog.md5(pg_catalog.concat_ws('|',
        pg_catalog.pg_get_functiondef(p.oid),p.proacl::text,p.proconfig::text
      ))
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname='brinesearch_v18_driver_core_destination_release'
        and p.proargtypes='2950'::pg_catalog.oidvector)
       is distinct from v_before.public_core_function_digest
     or (select pg_catalog.md5(pg_catalog.concat_ws('|',
        pg_catalog.pg_get_functiondef(p.oid),p.proacl::text,p.proconfig::text
      ))
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname='brinesearch_v18_driver_pad_status_with_google_handoff'
        and p.proargtypes='2950'::pg_catalog.oidvector)
       is distinct from v_before.public_status_function_digest then
    raise exception 'Public function definition/grant/runtime settings changed';
  end if;

  if private_verification.brinesearch_v18_core_destination_release_receipt_active(
       'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
     )
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
       'd7898e8c-1bb6-48f8-b5e0-87bc1898420e'
     )
     or (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
         from public.brinesearch_driver_google_routes_public r)
          is distinct from v_before.google_routes
     or (select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.pad_id)
         from public.brinesearch_driver_google_handoffs_public r)
          is distinct from v_before.google_handoffs
     or (select cutover_at
         from public.brinesearch_issue97_release_state where singleton)
          is distinct from v_before.cutover_at then
    raise exception 'Cologie/BAKOS dispatch, Google, or cutover regression failed';
  end if;

  if (select pg_catalog.md5(pg_catalog.string_agg(
        pg_catalog.to_jsonb(b)::text,'|' order by b.id::text
      ))
      from public.brinesearch_road_graph_builds b
      where b.state_code='OH' and b.county_name='Harrison')
       is distinct from v_before.harrison_builds_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(rp)::text,'|' order by rp.id::text
        ))
        from public.brinesearch_route_prep rp
        where rp.id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.route_prep_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(o)::text,'|' order by o.route_prep_id::text,o.occurrence_index
        ))
        from private_verification.brinesearch_route_occurrence_receipts_issue97 o
        where o.route_prep_id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.occurrence_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(t)::text,'|' order by t.route_prep_id::text,t.boundary_index
        ))
        from private_verification.brinesearch_route_transition_receipts_issue97 t
        where t.route_prep_id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.transition_digest
     or (select pg_catalog.md5(pg_catalog.string_agg(
          pg_catalog.to_jsonb(g)::text,'|' order by g.route_prep_id::text,g.occurrence_index
        ))
        from private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 g
        where g.route_prep_id in (
          'e8d6efa8-7bf5-4ac6-8a42-0f5858fd526a',
          '4a209eed-5f69-4cc7-b189-85196227c4fe'
        )) is distinct from v_before.geometry_receipt_digest then
    raise exception 'Graph/route/reconciliation state changed unexpectedly';
  end if;
end
$postflight$;
