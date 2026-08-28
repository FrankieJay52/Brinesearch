-- V18 Timberwolf owner-verified access release.
--
-- This is deliberately additive.  The public-road core remains bound to exact,
-- current ODOT graph evidence.  The final private feature is a separately
-- receipted owner field trace and is never represented as ODOT, a public road,
-- or an Issue #97 graph edge.  No graph is rebuilt, no global cutover changes,
-- and no row enters either public Google release table.

set local statement_timeout='5min';
set local lock_timeout='5s';
-- ODOT anchor coordinates are float8.  Preserve enough digits when they enter
-- JSONB for an exact float8 round trip even when the database default is 0.
-- This does not change the separately frozen public route/control coordinates.
set local extra_float_digits=3;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)
);
select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:owner-access-route-release',18)
);

-- A physical-tuple fingerprint is sufficient for this single transaction: any
-- insert, update, or delete changes count, xmin, or ctid.  Capture the compact
-- protected mutation surfaces before creating the additive owner-access
-- objects.  Multi-gigabyte authoritative identity/catalog/junction relations
-- are deliberately not scanned wholesale: the exact selected builds,
-- identities, junctions, anchors, and memberships are instead revalidated by
-- the public-core receipt and active-release gate below.
create temporary table tmp_v18_owner_access_unchanged_relations (
  relation_name text primary key,
  row_count bigint not null,
  tuple_fingerprint text not null
) on commit drop;

do $capture_unchanged_relations$
declare
  v_relation record;
  v_count bigint;
  v_fingerprint text;
begin
  for v_relation in
    select namespace.nspname as schema_name,relation.relname as table_name
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where relation.relkind in ('r','p')
      and namespace.nspname in ('public','private_verification')
      and (
        (namespace.nspname='public' and relation.relname in (
          'pads','pad_verification_status','public_pad_detail',
          'brinesearch_directory_snapshots_v18',
          'brinesearch_directory_snapshot_rows_v18',
          'brinesearch_company_road_overlay_snapshots_v18',
          'brinesearch_company_road_overlay_rows_v18',
          'brinesearch_route_prep','brinesearch_route_prep_steps',
          'brinesearch_roads',
          'brinesearch_road_identity_mappings',
          'brinesearch_road_graph_builds',
          'brinesearch_driver_google_routes_public',
          'brinesearch_driver_google_handoffs_public',
          'brinesearch_driver_core_destination_releases_public',
          'brinesearch_driver_named_approach_releases_public'
        ))
        or (namespace.nspname='private_verification' and relation.relname in (
          'brinesearch_v18_public_google_route_releases',
          'brinesearch_v18_google_handoff_receipts'
        ))
        or relation.relname like '%issue97%'
        or relation.relname like 'brinesearch_v18_core_destination%'
        or relation.relname like 'brinesearch_v18_named_approach%'
      )
    order by namespace.nspname,relation.relname
  loop
    execute pg_catalog.format(
      $sql$select count(*),pg_catalog.md5(coalesce(pg_catalog.string_agg(
        snapshot_row.xmin::text||':'||snapshot_row.ctid::text,'|'
        order by snapshot_row.ctid
      ),'')) from %I.%I snapshot_row$sql$,
      v_relation.schema_name,v_relation.table_name
    ) into v_count,v_fingerprint;
    insert into tmp_v18_owner_access_unchanged_relations(
      relation_name,row_count,tuple_fingerprint
    ) values (
      v_relation.schema_name||'.'||v_relation.table_name,
      v_count,v_fingerprint
    );
  end loop;
  if not exists(
    select 1 from tmp_v18_owner_access_unchanged_relations
    where relation_name='public.pads'
  ) or not exists(
    select 1 from tmp_v18_owner_access_unchanged_relations
    where relation_name='public.brinesearch_road_graph_builds'
  ) or not exists(
    select 1 from tmp_v18_owner_access_unchanged_relations
    where relation_name='public.brinesearch_directory_snapshot_rows_v18'
  ) then
    raise exception 'Protected relation fingerprint scope is incomplete';
  end if;
end
$capture_unchanged_relations$;

create temporary table tmp_v18_owner_access_wrapper_before
on commit drop as
select procedure.prosrc,procedure.prolang,procedure.provolatile,
  procedure.prosecdef,procedure.proisstrict,procedure.proconfig,
  procedure.proowner,procedure.proacl,
  pg_catalog.pg_get_functiondef(procedure.oid) as definition
from pg_catalog.pg_proc procedure
where procedure.oid=
  'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'::
    pg_catalog.regprocedure;

create temporary table tmp_v18_owner_access_bundles_before (
  pad_id uuid primary key,
  bundle jsonb
) on commit drop;

insert into tmp_v18_owner_access_bundles_before(pad_id,bundle)
select target.pad_id,
  public.brinesearch_v18_driver_pad_status_with_named_approaches(target.pad_id)
from (values
  ('2b4ed9cb-65a3-4fcf-af56-709c17faeb33'::uuid), -- TIMBERWOLF
  ('d7898e8c-1bb6-48f8-b5e0-87bc1898420e'::uuid), -- BAKOS
  ('e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid), -- COLOGIE
  ('518659d9-bca2-47b0-b294-3141ba679fc4'::uuid), -- LASSO
  ('b7526e45-0b33-4988-ae1c-0a4140971f8e'::uuid), -- BANJO
  ('59061829-1122-4aae-872d-cf5024310373'::uuid)  -- BILINOVICH
) target(pad_id);

do $base_snapshot_preflight$
begin
  if (select count(*) from tmp_v18_owner_access_wrapper_before)<>1
     or (select count(*) from tmp_v18_owner_access_bundles_before)<>6
     or exists(
       select 1 from tmp_v18_owner_access_bundles_before where bundle is null
     ) then
    raise exception 'Existing V18 atomic status snapshot is incomplete';
  end if;
end
$base_snapshot_preflight$;

do $contract_preflight$
begin
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_owner_access_geometry_receipts'
     ) is not null
     or pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_owner_access_route_releases'
     ) is not null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_owner_access_routes_public'
     ) is not null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_owner_access_route_receipt_active(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_owner_access_route(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_pad_status_with_owner_access(uuid)'
     ) is not null then
    raise exception 'V18 owner-access release contract already exists';
  end if;
  if pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'
     ) is null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_named_approach_has_navigation_link(jsonb)'
     ) is null then
    raise exception 'V18 named-approach dependency is missing';
  end if;
end
$contract_preflight$;

create function private_verification.brinesearch_v18_owner_access_waypoints_valid(
  p_waypoints jsonb
)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
declare
  v_waypoint jsonb;
  v_seen jsonb:='[]'::jsonb;
begin
  if pg_catalog.jsonb_typeof(p_waypoints)<>'array'
     or pg_catalog.jsonb_array_length(p_waypoints)<>4 then
    return false;
  end if;
  for v_waypoint in
    select item.value
    from pg_catalog.jsonb_array_elements(p_waypoints) item(value)
  loop
    if pg_catalog.jsonb_typeof(v_waypoint)<>'object'
       or not (v_waypoint ?& array['latitude','longitude'])
       or (v_waypoint-array['latitude','longitude']::text[])<>'{}'::jsonb
       or pg_catalog.jsonb_typeof(v_waypoint->'latitude')<>'number'
       or pg_catalog.jsonb_typeof(v_waypoint->'longitude')<>'number'
       or (v_waypoint->>'latitude')::numeric not between -90 and 90
       or (v_waypoint->>'longitude')::numeric not between -180 and 180
       or v_seen @> pg_catalog.jsonb_build_array(v_waypoint) then
      return false;
    end if;
    v_seen:=v_seen||pg_catalog.jsonb_build_array(v_waypoint);
  end loop;
  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_waypoints_valid(jsonb)
from public,anon,authenticated,service_role;

create table private_verification.brinesearch_v18_owner_access_geometry_receipts (
  receipt_id uuid primary key,
  pad_id uuid not null references public.pads(id)
    on update restrict on delete restrict,
  pad_record_revision text not null,
  source_kind text not null,
  line_geometry extensions.geometry(LineString,4326) not null,
  control_points jsonb not null,
  evidence jsonb not null,
  verified_at timestamptz not null,
  receipt_digest text not null,
  revoked_at timestamptz,
  constraint owner_access_geometry_version_check check(
    source_kind='owner_field_trace'
  ),
  constraint owner_access_geometry_revision_check check(
    pg_catalog.length(pg_catalog.btrim(pad_record_revision))>0
  ),
  constraint owner_access_geometry_shape_check check(
    extensions.geometrytype(line_geometry)='LINESTRING'
    and extensions.st_srid(line_geometry)=4326
    and extensions.st_isvalid(line_geometry)
    and extensions.st_issimple(line_geometry)
    and extensions.st_npoints(line_geometry)>=2
    and extensions.st_length(line_geometry::extensions.geography)>0
  ),
  constraint owner_access_geometry_json_check check(
    pg_catalog.jsonb_typeof(control_points)='array'
    and pg_catalog.jsonb_array_length(control_points)>=2
    and pg_catalog.jsonb_typeof(evidence)='object'
  ),
  constraint owner_access_geometry_digest_check check(
    receipt_digest~'^[0-9a-f]{64}$'
  ),
  constraint owner_access_geometry_revoke_check check(
    revoked_at is null or revoked_at>=verified_at
  )
);

create unique index brinesearch_v18_owner_access_geometry_active_pad_idx
on private_verification.brinesearch_v18_owner_access_geometry_receipts(pad_id)
where revoked_at is null;

alter table private_verification.brinesearch_v18_owner_access_geometry_receipts
  enable row level security;
alter table private_verification.brinesearch_v18_owner_access_geometry_receipts
  force row level security;
revoke all on table
  private_verification.brinesearch_v18_owner_access_geometry_receipts
from public,anon,authenticated,service_role;

create table private_verification.brinesearch_v18_owner_access_route_releases (
  release_id uuid primary key,
  pad_id uuid not null references public.pads(id)
    on update restrict on delete restrict,
  release_version text not null,
  route_revision bigint not null,
  source_sequence text not null,
  source_sequence_hash text not null,
  pad_record_revision text not null,
  base_status_revision text not null,
  status_revision text not null,
  public_core_step_count integer not null,
  steps jsonb not null,
  geometry jsonb not null,
  written_directions text not null,
  graph_dependencies jsonb not null,
  public_core_receipt jsonb not null,
  public_core_receipt_digest text not null,
  access_receipt_id uuid not null references
    private_verification.brinesearch_v18_owner_access_geometry_receipts(receipt_id)
    on update restrict on delete restrict,
  ingress jsonb not null,
  private_access_start jsonb not null,
  destination jsonb not null,
  final_leg_mode text not null,
  handoff jsonb not null,
  authorization_basis text not null,
  last_verified_at timestamptz not null,
  evidence jsonb not null,
  release_digest text not null,
  published_at timestamptz not null,
  revoked_at timestamptz,
  constraint owner_access_release_version_check check(
    release_version='v18-owner-access-route-v1'
  ),
  constraint owner_access_release_route_check check(
    route_revision>0 and public_core_step_count=6
    and pg_catalog.length(pg_catalog.btrim(source_sequence))>0
    and pg_catalog.length(pg_catalog.btrim(written_directions))>0
  ),
  constraint owner_access_release_hash_check check(
    source_sequence_hash~'^[0-9a-f]{32}$'
    and base_status_revision~'^[0-9a-f]{32}$'
    and status_revision~'^[0-9a-f]{32}$'
    and public_core_receipt_digest~'^[0-9a-f]{64}$'
    and release_digest~'^[0-9a-f]{64}$'
  ),
  constraint owner_access_release_json_check check(
    pg_catalog.jsonb_typeof(steps)='array'
    and pg_catalog.jsonb_array_length(steps)=7
    and pg_catalog.jsonb_typeof(geometry)='object'
    and geometry->>'type'='FeatureCollection'
    and pg_catalog.jsonb_typeof(geometry->'features')='array'
    and pg_catalog.jsonb_array_length(geometry->'features')=7
    and pg_catalog.jsonb_typeof(graph_dependencies)='array'
    and pg_catalog.jsonb_array_length(graph_dependencies)=2
    and pg_catalog.jsonb_typeof(public_core_receipt)='object'
    and pg_catalog.jsonb_typeof(ingress)='object'
    and pg_catalog.jsonb_typeof(private_access_start)='object'
    and pg_catalog.jsonb_typeof(destination)='object'
    and pg_catalog.jsonb_typeof(handoff)='object'
    and pg_catalog.jsonb_typeof(evidence)='object'
  ),
  constraint owner_access_release_point_check check(
    ingress ?& array['role','label','latitude','longitude']
    and (ingress-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and ingress->>'role'='exact_public_route_ingress'
    and private_access_start ?& array['role','label','latitude','longitude']
    and (private_access_start-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and private_access_start->>'role'='owner_verified_private_access_start'
    and destination ?& array['role','label','latitude','longitude']
    and (destination-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and destination->>'role'='saved_pad_destination'
  ),
  constraint owner_access_release_mode_check check(
    final_leg_mode='owner_verified_private_access_to_saved_pad'
    and handoff ?& array['originMode','handoffMode','waypoints']
    and (handoff-array['originMode','handoffMode','waypoints']::text[])='{}'::jsonb
    and handoff->>'originMode'='current_location_to_route_ingress'
    and handoff->>'handoffMode'='owner_verified_controls_v1'
    and private_verification.brinesearch_v18_owner_access_waypoints_valid(
          handoff->'waypoints'
        )
  ),
  constraint owner_access_release_no_link_check check(
    not private_verification.brinesearch_v18_named_approach_has_navigation_link(
      pg_catalog.jsonb_build_array(
        source_sequence,steps,geometry,written_directions,graph_dependencies,
        public_core_receipt,ingress,private_access_start,destination,handoff,
        authorization_basis,evidence
      )
    )
  ),
  constraint owner_access_release_revoke_check check(
    revoked_at is null or revoked_at>=published_at
  ),
  unique(pad_id,release_version,route_revision)
);

create unique index brinesearch_v18_owner_access_route_active_pad_idx
on private_verification.brinesearch_v18_owner_access_route_releases(pad_id)
where revoked_at is null;

alter table private_verification.brinesearch_v18_owner_access_route_releases
  enable row level security;
alter table private_verification.brinesearch_v18_owner_access_route_releases
  force row level security;
revoke all on table
  private_verification.brinesearch_v18_owner_access_route_releases
from public,anon,authenticated,service_role;

create table public.brinesearch_driver_owner_access_routes_public (
  release_id uuid primary key,
  pad_id uuid not null references public.pads(id)
    on update restrict on delete restrict,
  release_version text not null,
  route_revision bigint not null,
  public_core_step_count integer not null,
  steps jsonb not null,
  geometry jsonb not null,
  written_directions text not null,
  ingress jsonb not null,
  private_access_start jsonb not null,
  destination jsonb not null,
  final_leg_mode text not null,
  handoff jsonb not null,
  last_verified_at timestamptz not null,
  status_revision text not null,
  release_digest text not null,
  published_at timestamptz not null,
  constraint owner_access_public_version_check check(
    release_version='v18-owner-access-route-v1'
  ),
  constraint owner_access_public_shape_check check(
    route_revision>0 and public_core_step_count=6
    and pg_catalog.jsonb_typeof(steps)='array'
    and pg_catalog.jsonb_array_length(steps)=7
    and pg_catalog.length(pg_catalog.btrim(written_directions))>0
    and pg_catalog.jsonb_typeof(geometry)='object'
    and geometry->>'type'='FeatureCollection'
    and pg_catalog.jsonb_array_length(geometry->'features')=7
    and final_leg_mode='owner_verified_private_access_to_saved_pad'
    and status_revision~'^[0-9a-f]{32}$'
    and release_digest~'^[0-9a-f]{64}$'
  ),
  constraint owner_access_public_no_link_check check(
    not private_verification.brinesearch_v18_named_approach_has_navigation_link(
      pg_catalog.jsonb_build_array(
        steps,geometry,written_directions,ingress,private_access_start,
        destination,handoff
      )
    )
  ),
  unique(pad_id,release_version,route_revision)
);

create index brinesearch_driver_owner_access_route_pad_idx
on public.brinesearch_driver_owner_access_routes_public(pad_id);

alter table public.brinesearch_driver_owner_access_routes_public
  enable row level security;
alter table public.brinesearch_driver_owner_access_routes_public
  force row level security;
revoke all on table public.brinesearch_driver_owner_access_routes_public
from public,anon,authenticated,service_role;

create function private_verification.brinesearch_v18_owner_access_geometry_digest(
  p_receipt private_verification.brinesearch_v18_owner_access_geometry_receipts
)
returns text
language sql
stable
strict
security definer
set search_path=''
set timezone='UTC'
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
  select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'receiptId',(p_receipt).receipt_id,
      'padId',(p_receipt).pad_id,
      'padRecordRevision',(p_receipt).pad_record_revision,
      'sourceKind',(p_receipt).source_kind,
      'lineGeometry',extensions.st_asgeojson((p_receipt).line_geometry,7)::jsonb,
      'controlPoints',(p_receipt).control_points,
      'evidence',(p_receipt).evidence,
      'verifiedAt',(p_receipt).verified_at
    )::text,'UTF8'),'sha256'),'hex')
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_geometry_digest(
    private_verification.brinesearch_v18_owner_access_geometry_receipts
  )
from public,anon,authenticated,service_role;

create function private_verification.brinesearch_v18_owner_access_release_digest(
  p_release private_verification.brinesearch_v18_owner_access_route_releases
)
returns text
language sql
stable
strict
security definer
set search_path=''
set timezone='UTC'
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
  select pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'releaseId',(p_release).release_id,
      'padId',(p_release).pad_id,
      'releaseVersion',(p_release).release_version,
      'routeRevision',(p_release).route_revision,
      'sourceSequence',(p_release).source_sequence,
      'sourceSequenceHash',(p_release).source_sequence_hash,
      'padRecordRevision',(p_release).pad_record_revision,
      'baseStatusRevision',(p_release).base_status_revision,
      'statusRevision',(p_release).status_revision,
      'publicCoreStepCount',(p_release).public_core_step_count,
      'steps',(p_release).steps,
      'geometry',(p_release).geometry,
      'writtenDirections',(p_release).written_directions,
      'graphDependencies',(p_release).graph_dependencies,
      'publicCoreReceipt',(p_release).public_core_receipt,
      'publicCoreReceiptDigest',(p_release).public_core_receipt_digest,
      'accessReceiptId',(p_release).access_receipt_id,
      'ingress',(p_release).ingress,
      'privateAccessStart',(p_release).private_access_start,
      'destination',(p_release).destination,
      'finalLegMode',(p_release).final_leg_mode,
      'handoff',(p_release).handoff,
      'authorizationBasis',(p_release).authorization_basis,
      'lastVerifiedAt',(p_release).last_verified_at,
      'evidence',(p_release).evidence,
      'publishedAt',(p_release).published_at
    )::text,'UTF8'),'sha256'),'hex')
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_release_digest(
    private_verification.brinesearch_v18_owner_access_route_releases
  )
from public,anon,authenticated,service_role;

create function private_verification.brinesearch_v18_owner_access_immutable()
returns trigger
language plpgsql
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
begin
  if tg_op='DELETE' then
    raise exception 'Owner-access receipt/release cannot be deleted';
  end if;
  if old.revoked_at is null and new.revoked_at is not null
     and (pg_catalog.to_jsonb(new)-'revoked_at')=
         (pg_catalog.to_jsonb(old)-'revoked_at') then
    return new;
  end if;
  raise exception 'Owner-access receipt/release permits one-way revocation only';
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_immutable()
from public,anon,authenticated,service_role;

create trigger brinesearch_v18_owner_access_geometry_immutable
before update or delete
on private_verification.brinesearch_v18_owner_access_geometry_receipts
for each row execute function
  private_verification.brinesearch_v18_owner_access_immutable();

create trigger brinesearch_v18_owner_access_release_immutable
before update or delete
on private_verification.brinesearch_v18_owner_access_route_releases
for each row execute function
  private_verification.brinesearch_v18_owner_access_immutable();

create function private_verification.brinesearch_v18_owner_access_public_immutable()
returns trigger
language plpgsql
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
begin
  raise exception 'Published owner-access route cannot be changed or deleted';
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_public_immutable()
from public,anon,authenticated,service_role;

create trigger brinesearch_v18_owner_access_public_immutable
before update or delete
on public.brinesearch_driver_owner_access_routes_public
for each row execute function
  private_verification.brinesearch_v18_owner_access_public_immutable();

create function private_verification.brinesearch_v18_owner_access_route_shape_valid(
  p_steps jsonb,
  p_geometry jsonb
)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
declare
  v_index integer;
  v_step jsonb;
  v_designation jsonb;
  v_designations_seen jsonb;
  v_feature jsonb;
  v_properties jsonb;
  v_line extensions.geometry;
  v_prior_end extensions.geometry;
  v_expected_authority text;
begin
  if pg_catalog.jsonb_typeof(p_steps)<>'array'
     or pg_catalog.jsonb_array_length(p_steps)<>7
     or pg_catalog.jsonb_typeof(p_geometry)<>'object'
     or (p_geometry-array['type','features']::text[])<>'{}'::jsonb
     or p_geometry->>'type'<>'FeatureCollection'
     or pg_catalog.jsonb_typeof(p_geometry->'features')<>'array'
     or pg_catalog.jsonb_array_length(p_geometry->'features')<>7 then
    return false;
  end if;

  for v_index in 0..6 loop
    v_step:=p_steps->v_index;
    v_feature:=p_geometry->'features'->v_index;
    if pg_catalog.jsonb_typeof(v_step)<>'object'
       or not (v_step ?& array[
         'order','kind','displayName','verifiedDesignations','instruction',
         'distanceMiles'
       ])
       or (v_step-array[
         'order','kind','displayName','verifiedDesignations','instruction',
         'distanceMiles'
       ]::text[])<>'{}'::jsonb
       or pg_catalog.jsonb_typeof(v_step->'order')<>'number'
       or (v_step->>'order')::integer<>v_index+1
       or v_step->>'kind' not in (
         'turn','continue','name_change','shared_begin','shared_end'
       )
       or pg_catalog.jsonb_typeof(v_step->'displayName')<>'string'
       or pg_catalog.length(pg_catalog.btrim(v_step->>'displayName')) not between 1 and 100
       or pg_catalog.jsonb_typeof(v_step->'instruction')<>'string'
       or pg_catalog.length(pg_catalog.btrim(v_step->>'instruction')) not between 1 and 100
       or pg_catalog.jsonb_typeof(v_step->'verifiedDesignations')<>'array'
       or pg_catalog.jsonb_typeof(v_step->'distanceMiles') not in ('number','null')
       or (
         pg_catalog.jsonb_typeof(v_step->'distanceMiles')='number'
         and (v_step->>'distanceMiles')::numeric<0
       ) then
      return false;
    end if;

    v_designations_seen:='[]'::jsonb;
    for v_designation in
      select designation.value
      from pg_catalog.jsonb_array_elements(
        v_step->'verifiedDesignations'
      ) designation(value)
    loop
      if pg_catalog.jsonb_typeof(v_designation)<>'string'
         or pg_catalog.length(pg_catalog.btrim(
           v_designation#>>array[]::text[]
         )) not between 1 and 100
         or v_designations_seen @> pg_catalog.jsonb_build_array(v_designation) then
        return false;
      end if;
      v_designations_seen:=v_designations_seen||
        pg_catalog.jsonb_build_array(v_designation);
    end loop;

    if pg_catalog.jsonb_typeof(v_feature)<>'object'
       or not (v_feature ?& array['type','properties','geometry'])
       or (v_feature-array['type','properties','geometry']::text[])<>'{}'::jsonb
       or v_feature->>'type'<>'Feature'
       or pg_catalog.jsonb_typeof(v_feature->'properties')<>'object'
       or pg_catalog.jsonb_typeof(v_feature->'geometry')<>'object' then
      return false;
    end if;
    v_properties:=v_feature->'properties';
    v_expected_authority:=case when v_index<6
      then 'exact_graph' else 'owner_verified_access' end;
    if not (v_properties ?& array['stepOrder','authority','label'])
       or (v_properties-array['stepOrder','authority','label']::text[])<>'{}'::jsonb
       or pg_catalog.jsonb_typeof(v_properties->'stepOrder')<>'number'
       or (v_properties->>'stepOrder')::integer<>v_index+1
       or v_properties->>'authority'<>v_expected_authority
       or pg_catalog.jsonb_typeof(v_properties->'label')<>'string'
       or pg_catalog.length(pg_catalog.btrim(v_properties->>'label')) not between 1 and 100
       or (
         v_index<6 and
         v_properties->>'label'<>v_step->>'displayName'
       )
       or (
         v_index=6 and v_properties->>'label'<>
           'Owner-verified lease access — not ODOT road geometry'
       ) then
      return false;
    end if;

    v_line:=extensions.st_setsrid(extensions.st_force2d(
      extensions.st_geomfromgeojson((v_feature->'geometry')::text)
    ),4326);
    if extensions.geometrytype(v_line)<>'LINESTRING'
       or extensions.st_isempty(v_line)
       or not extensions.st_isvalid(v_line)
       or not extensions.st_issimple(v_line)
       or extensions.st_npoints(v_line)<2
       or extensions.st_length(v_line::extensions.geography)<=0
       or not extensions.st_coveredby(
         v_line,extensions.st_makeenvelope(-180,-90,180,90,4326)
       ) then
      return false;
    end if;
    if v_prior_end is not null and (
      extensions.st_x(v_prior_end)<>extensions.st_x(extensions.st_startpoint(v_line))
      or extensions.st_y(v_prior_end)<>extensions.st_y(extensions.st_startpoint(v_line))
    ) then
      return false;
    end if;
    v_prior_end:=extensions.st_endpoint(v_line);
  end loop;
  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_route_shape_valid(jsonb,jsonb)
from public,anon,authenticated,service_role;

create function private_verification.brinesearch_v18_owner_access_contract_valid(
  p_steps jsonb,
  p_geometry jsonb,
  p_ingress jsonb,
  p_private_access_start jsonb,
  p_destination jsonb,
  p_handoff jsonb
)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
declare
  v_first extensions.geometry;
  v_public_end extensions.geometry;
  v_private extensions.geometry;
  v_waypoint jsonb;
begin
  if not private_verification.brinesearch_v18_owner_access_route_shape_valid(
       p_steps,p_geometry
     )
     or not (p_ingress ?& array['role','label','latitude','longitude'])
     or (p_ingress-array['role','label','latitude','longitude']::text[])<>'{}'::jsonb
     or p_ingress->>'role'<>'exact_public_route_ingress'
     or not (p_private_access_start ?& array[
       'role','label','latitude','longitude'
     ])
     or (p_private_access_start-array[
       'role','label','latitude','longitude'
     ]::text[])<>'{}'::jsonb
     or p_private_access_start->>'role'<>
       'owner_verified_private_access_start'
     or not (p_destination ?& array['role','label','latitude','longitude'])
     or (p_destination-array['role','label','latitude','longitude']::text[])<>'{}'::jsonb
     or p_destination->>'role'<>'saved_pad_destination'
     or not (p_handoff ?& array['originMode','handoffMode','waypoints'])
     or (p_handoff-array['originMode','handoffMode','waypoints']::text[])<>'{}'::jsonb
     or p_handoff->>'originMode'<>'current_location_to_route_ingress'
     or p_handoff->>'handoffMode'<>'owner_verified_controls_v1'
     or not private_verification.brinesearch_v18_owner_access_waypoints_valid(
       p_handoff->'waypoints'
     ) then
    return false;
  end if;

  v_first:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (p_geometry->'features'->0->'geometry')::text
    )
  ),4326);
  v_public_end:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (p_geometry->'features'->5->'geometry')::text
    )
  ),4326);
  v_private:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (p_geometry->'features'->6->'geometry')::text
    )
  ),4326);
  if extensions.st_x(extensions.st_startpoint(v_first))<>
       (p_ingress->>'longitude')::double precision
     or extensions.st_y(extensions.st_startpoint(v_first))<>
       (p_ingress->>'latitude')::double precision
     or extensions.st_x(extensions.st_endpoint(v_public_end))<>
       (p_private_access_start->>'longitude')::double precision
     or extensions.st_y(extensions.st_endpoint(v_public_end))<>
       (p_private_access_start->>'latitude')::double precision
     or extensions.st_x(extensions.st_startpoint(v_private))<>
       (p_private_access_start->>'longitude')::double precision
     or extensions.st_y(extensions.st_startpoint(v_private))<>
       (p_private_access_start->>'latitude')::double precision
     or extensions.st_x(extensions.st_endpoint(v_private))<>
       (p_destination->>'longitude')::double precision
     or extensions.st_y(extensions.st_endpoint(v_private))<>
       (p_destination->>'latitude')::double precision then
    return false;
  end if;

  v_waypoint:=p_handoff->'waypoints'->0;
  if (v_waypoint->>'latitude')::double precision<>
       (p_ingress->>'latitude')::double precision
     or (v_waypoint->>'longitude')::double precision<>
       (p_ingress->>'longitude')::double precision then
    return false;
  end if;
  v_waypoint:=p_handoff->'waypoints'->3;
  if (v_waypoint->>'latitude')::double precision<>
       (p_private_access_start->>'latitude')::double precision
     or (v_waypoint->>'longitude')::double precision<>
       (p_private_access_start->>'longitude')::double precision
     or p_handoff->'waypoints' @> pg_catalog.jsonb_build_array(
       pg_catalog.jsonb_build_object(
         'latitude',p_destination->'latitude',
         'longitude',p_destination->'longitude'
       )
     ) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_contract_valid(
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public,anon,authenticated,service_role;

alter table private_verification.brinesearch_v18_owner_access_route_releases
  add constraint owner_access_release_exact_contract_check check(
    private_verification.brinesearch_v18_owner_access_contract_valid(
      steps,geometry,ingress,private_access_start,destination,handoff
    )
  );

alter table public.brinesearch_driver_owner_access_routes_public
  add constraint owner_access_public_exact_contract_check check(
    private_verification.brinesearch_v18_owner_access_contract_valid(
      steps,geometry,ingress,private_access_start,destination,handoff
    )
  );

create function private_verification.brinesearch_v18_owner_access_clip_identity(
  p_source_identity_key text,
  p_start extensions.geometry,
  p_end extensions.geometry
)
returns extensions.geometry
language plpgsql
stable
strict
security definer
set search_path=''
set statement_timeout='5s'
set lock_timeout='500ms'
as $function$
declare
  v_identity public.brinesearch_authoritative_road_identities%rowtype;
  v_identity_count integer;
  v_master extensions.geometry;
  v_line extensions.geometry;
  v_start_snap extensions.geometry;
  v_end_snap extensions.geometry;
  v_start_fraction double precision;
  v_end_fraction double precision;
  v_clip extensions.geometry;
  v_component_count integer;
begin
  if extensions.geometrytype(p_start)<>'POINT'
     or extensions.geometrytype(p_end)<>'POINT'
     or extensions.st_srid(p_start)<>4326
     or extensions.st_srid(p_end)<>4326 then
    raise exception 'Exact owner-access clip boundaries must be EPSG:4326 points';
  end if;
  select count(*)::integer into v_identity_count
  from public.brinesearch_authoritative_road_identities identity
  where identity.source_identity_key=p_source_identity_key and identity.active;
  if v_identity_count<>1 then
    raise exception 'Expected one active exact source identity %, found %',
      p_source_identity_key,v_identity_count;
  end if;
  select * into strict v_identity
  from public.brinesearch_authoritative_road_identities identity
  where identity.source_identity_key=p_source_identity_key and identity.active;
  if v_identity.state_code<>'OH'
     or v_identity.public_access_status<>'public'
     or v_identity.drivable_status<>'drivable'
     or not private_verification.brinesearch_issue97_dataset_scope_current(
       v_identity.dataset_id,v_identity.state_code,v_identity.county_code
     ) then
    raise exception 'Exact source identity % is not current public ODOT authority',
      p_source_identity_key;
  end if;
  v_master:=private_verification.brinesearch_issue97_authoritative_identity_geometry(
    v_identity.id
  );
  if v_master is null
     or nullif(
       private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
         v_identity.id
       ),''
     ) is null then
    raise exception 'Exact source identity % has no current authoritative geometry',
      p_source_identity_key;
  end if;

  select count(*)::integer into v_component_count
  from (
    select (dumped).geom
    from (select extensions.st_dump(extensions.st_linemerge(v_master)) dumped) q
  ) component
  where extensions.geometrytype(component.geom)='LINESTRING'
    and extensions.st_isvalid(component.geom)
    and extensions.st_issimple(component.geom)
    and extensions.st_dwithin(
      component.geom::extensions.geography,p_start::extensions.geography,1
    )
    and extensions.st_dwithin(
      component.geom::extensions.geography,p_end::extensions.geography,1
    );
  if v_component_count<>1 then
    raise exception 'Exact source identity % resolved % clip components',
      p_source_identity_key,v_component_count;
  end if;
  select component.geom into strict v_line
  from (
    select (dumped).geom
    from (select extensions.st_dump(extensions.st_linemerge(v_master)) dumped) q
  ) component
  where extensions.geometrytype(component.geom)='LINESTRING'
    and extensions.st_isvalid(component.geom)
    and extensions.st_issimple(component.geom)
    and extensions.st_dwithin(
      component.geom::extensions.geography,p_start::extensions.geography,1
    )
    and extensions.st_dwithin(
      component.geom::extensions.geography,p_end::extensions.geography,1
    );

  v_start_snap:=extensions.st_closestpoint(v_line,p_start);
  v_end_snap:=extensions.st_closestpoint(v_line,p_end);
  if extensions.st_distance(
       v_start_snap::extensions.geography,p_start::extensions.geography
     )>=1
     or extensions.st_distance(
       v_end_snap::extensions.geography,p_end::extensions.geography
     )>=1 then
    raise exception 'Exact source identity % left a frozen boundary',
      p_source_identity_key;
  end if;
  v_start_fraction:=extensions.st_linelocatepoint(v_line,v_start_snap);
  v_end_fraction:=extensions.st_linelocatepoint(v_line,v_end_snap);
  if pg_catalog.abs(v_start_fraction-v_end_fraction)<1e-12 then
    raise exception 'Exact source identity % produced a zero-length clip',
      p_source_identity_key;
  end if;
  v_clip:=case when v_start_fraction<v_end_fraction
    then extensions.st_linesubstring(v_line,v_start_fraction,v_end_fraction)
    else extensions.st_reverse(
      extensions.st_linesubstring(v_line,v_end_fraction,v_start_fraction)
    ) end;
  v_clip:=extensions.st_setpoint(v_clip,0,p_start);
  v_clip:=extensions.st_setpoint(
    v_clip,extensions.st_npoints(v_clip)-1,p_end
  );
  v_clip:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    extensions.st_asgeojson(v_clip,15)
  ),4326);
  if extensions.geometrytype(v_clip)<>'LINESTRING'
     or not extensions.st_isvalid(v_clip)
     or not extensions.st_issimple(v_clip)
     or extensions.st_length(v_clip::extensions.geography)<=0
     or extensions.st_x(extensions.st_startpoint(v_clip))<>
       extensions.st_x(p_start)
     or extensions.st_y(extensions.st_startpoint(v_clip))<>
       extensions.st_y(p_start)
     or extensions.st_x(extensions.st_endpoint(v_clip))<>
       extensions.st_x(p_end)
     or extensions.st_y(extensions.st_endpoint(v_clip))<>
       extensions.st_y(p_end) then
    raise exception 'Exact source identity % clip failed geometry proof',
      p_source_identity_key;
  end if;
  return v_clip;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_clip_identity(
    text,extensions.geometry,extensions.geometry
  )
from public,anon,authenticated,service_role;

create function private_verification.brinesearch_v18_owner_access_core_receipt_current(
  p_receipt jsonb
)
returns boolean
language plpgsql
stable
strict
security definer
set search_path=''
set statement_timeout='10s'
set lock_timeout='500ms'
as $function$
declare
  v_dependency jsonb;
  v_boundary jsonb;
  v_index integer;
begin
  if pg_catalog.jsonb_typeof(p_receipt)<>'object'
     or not (p_receipt ?& array[
       'authority','graphDependencies','identityDependencies',
       'boundaryDependencies','featureReceipts','selectionPolicy'
     ])
     or (p_receipt-array[
       'authority','graphDependencies','identityDependencies',
       'boundaryDependencies','featureReceipts','selectionPolicy'
     ]::text[])<>'{}'::jsonb
     or p_receipt->>'authority'<>'exact_active_issue97_graph'
     or pg_catalog.jsonb_typeof(p_receipt->'graphDependencies')<>'array'
     or pg_catalog.jsonb_array_length(p_receipt->'graphDependencies')<>2
     or pg_catalog.jsonb_typeof(p_receipt->'identityDependencies')<>'array'
     or pg_catalog.jsonb_array_length(p_receipt->'identityDependencies')<>8
     or pg_catalog.jsonb_typeof(p_receipt->'boundaryDependencies')<>'array'
     or pg_catalog.jsonb_array_length(p_receipt->'boundaryDependencies')<>7
     or pg_catalog.jsonb_typeof(p_receipt->'featureReceipts')<>'array'
     or pg_catalog.jsonb_array_length(p_receipt->'featureReceipts')<>6
     or p_receipt#>>'{selectionPolicy,identitySelection}'<>
       'exact_source_identity_key'
     or p_receipt#>>'{selectionPolicy,boundarySelection}'<>
       'verified_graph_anchor'
     or coalesce(
       (p_receipt#>>'{selectionPolicy,roadManagerMappingRequired}')::boolean,
       true
     )
     or coalesce((p_receipt#>>'{selectionPolicy,nameMatchingUsed}')::boolean,true)
     or coalesce((p_receipt#>>'{selectionPolicy,fuzzyMatchingUsed}')::boolean,true)
     or coalesce((p_receipt#>>'{selectionPolicy,nearestRoadUsed}')::boolean,true)
     or coalesce((p_receipt#>>'{selectionPolicy,routeNumberOnlyUsed}')::boolean,true)
     or coalesce((p_receipt#>>'{selectionPolicy,privateGeometryAsOdot}')::boolean,true)
     or coalesce((p_receipt#>>'{selectionPolicy,issue97Mutation}')::boolean,true) then
    return false;
  end if;

  for v_dependency in
    select dependency.value
    from pg_catalog.jsonb_array_elements(
      p_receipt->'graphDependencies'
    ) dependency(value)
  loop
    if pg_catalog.jsonb_typeof(v_dependency)<>'object'
       or not (v_dependency ?& array[
         'buildId','stateCode','countyCode','countyName','algorithmVersion',
         'sourceRevisionDigest','graphDigest'
       ])
       or (v_dependency-array[
         'buildId','stateCode','countyCode','countyName','algorithmVersion',
         'sourceRevisionDigest','graphDigest'
       ]::text[])<>'{}'::jsonb
       or not exists(
         select 1
         from public.brinesearch_road_graph_builds build
         where build.id=(v_dependency->>'buildId')::uuid
           and build.state_code=v_dependency->>'stateCode'
           and build.county_code=v_dependency->>'countyCode'
           and build.county_name=v_dependency->>'countyName'
           and build.algorithm_version=v_dependency->>'algorithmVersion'
           and build.source_revision_digest=
             v_dependency->>'sourceRevisionDigest'
           and build.graph_digest=v_dependency->>'graphDigest'
           and build.status='active'
           and private_verification.
             brinesearch_issue97_graph_build_release_current_contextual(build.id)
       ) then
      return false;
    end if;
  end loop;

  for v_dependency in
    select dependency.value
    from pg_catalog.jsonb_array_elements(
      p_receipt->'identityDependencies'
    ) dependency(value)
  loop
    if pg_catalog.jsonb_typeof(v_dependency)<>'object'
       or not (v_dependency ?& array[
         'identityId','sourceIdentityKey','datasetId','stateCode','countyCode',
         'sourceDigest','geometryDigest'
       ])
       or (v_dependency-array[
         'identityId','sourceIdentityKey','datasetId','stateCode','countyCode',
         'sourceDigest','geometryDigest'
       ]::text[])<>'{}'::jsonb
       or not exists(
         select 1
         from public.brinesearch_authoritative_road_identities identity
         where identity.id=(v_dependency->>'identityId')::uuid
           and identity.source_identity_key=
             v_dependency->>'sourceIdentityKey'
           and identity.dataset_id=(v_dependency->>'datasetId')::uuid
           and identity.state_code=v_dependency->>'stateCode'
           and identity.county_code=v_dependency->>'countyCode'
           and identity.source_digest=v_dependency->>'sourceDigest'
           and identity.active
           and identity.public_access_status='public'
           and identity.drivable_status='drivable'
           and private_verification.brinesearch_issue97_dataset_scope_current(
             identity.dataset_id,identity.state_code,identity.county_code
           )
           and private_verification.
             brinesearch_issue97_authoritative_identity_geometry_digest(
               identity.id
             )=v_dependency->>'geometryDigest'
       ) then
      return false;
    end if;
  end loop;

  v_index:=0;
  for v_boundary in
    select boundary.value
    from pg_catalog.jsonb_array_elements(
      p_receipt->'boundaryDependencies'
    ) boundary(value)
  loop
    v_index:=v_index+1;
    if pg_catalog.jsonb_typeof(v_boundary)<>'object'
       or not (v_boundary ?& array[
         'boundaryOrder','buildId','junctionId','anchorId','anchorRole',
         'junctionType','stableJunctionKey','junctionGraphDigest',
         'anchorDigest','longitude','latitude','leftIdentityKey',
         'rightIdentityKey'
       ])
       or (v_boundary-array[
         'boundaryOrder','buildId','junctionId','anchorId','anchorRole',
         'junctionType','stableJunctionKey','junctionGraphDigest',
         'anchorDigest','longitude','latitude','leftIdentityKey',
         'rightIdentityKey'
       ]::text[])<>'{}'::jsonb
       or (v_boundary->>'boundaryOrder')::integer<>v_index
       or not exists(
         select 1
         from public.brinesearch_road_junctions junction
         join public.brinesearch_road_junction_anchors anchor
           on anchor.junction_id=junction.id
         join public.brinesearch_road_graph_builds build
           on build.id=junction.build_id
         where junction.id=(v_boundary->>'junctionId')::uuid
           and junction.build_id=(v_boundary->>'buildId')::uuid
           and junction.stable_junction_key=
             v_boundary->>'stableJunctionKey'
           and junction.junction_type=v_boundary->>'junctionType'
           and junction.graph_digest=v_boundary->>'junctionGraphDigest'
           and junction.verification_status='verified'
           and junction.confidence in (
             'authoritative','authoritative_at_grade'
           )
           and anchor.id=(v_boundary->>'anchorId')::uuid
           and anchor.anchor_role=v_boundary->>'anchorRole'
           and anchor.anchor_digest=v_boundary->>'anchorDigest'
           and extensions.st_x(anchor.geom)=
             (v_boundary->>'longitude')::double precision
           and extensions.st_y(anchor.geom)=
             (v_boundary->>'latitude')::double precision
           and build.status='active'
           and exists(
             select 1
             from public.brinesearch_road_junction_memberships membership
             join public.brinesearch_authoritative_road_identities identity
               on identity.id=membership.identity_id
             where membership.junction_id=junction.id
               and identity.source_identity_key=
                 v_boundary->>'leftIdentityKey'
           )
           and exists(
             select 1
             from public.brinesearch_road_junction_memberships membership
             join public.brinesearch_authoritative_road_identities identity
               on identity.id=membership.identity_id
             where membership.junction_id=junction.id
               and identity.source_identity_key=
                 v_boundary->>'rightIdentityKey'
           )
       ) then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_core_receipt_current(jsonb)
from public,anon,authenticated,service_role;

create function
  private_verification.brinesearch_v18_owner_access_geometry_receipt_active(
    p_receipt_id uuid
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
  v_receipt
    private_verification.brinesearch_v18_owner_access_geometry_receipts%rowtype;
begin
  select * into v_receipt
  from private_verification.brinesearch_v18_owner_access_geometry_receipts receipt
  where receipt.receipt_id=p_receipt_id;
  if not found or v_receipt.revoked_at is not null
     or v_receipt.source_kind<>'owner_field_trace'
     or private_verification.brinesearch_v18_owner_access_geometry_digest(
       v_receipt
     ) is distinct from v_receipt.receipt_digest
     or extensions.geometrytype(v_receipt.line_geometry)<>'LINESTRING'
     or not extensions.st_isvalid(v_receipt.line_geometry)
     or not extensions.st_issimple(v_receipt.line_geometry)
     or extensions.st_npoints(v_receipt.line_geometry)<>38
     or extensions.st_length(v_receipt.line_geometry::extensions.geography)
       not between 900 and 1100
     or v_receipt.evidence->>'authority'<>
       'owner_verified_private_access'
     or coalesce((v_receipt.evidence->>'publicRoad')::boolean,true)
     or coalesce((v_receipt.evidence->>'odotGeometry')::boolean,true)
     or coalesce((v_receipt.evidence->>'issue97Authority')::boolean,true)
     or v_receipt.evidence->>'imagerySource'<>'Esri World Imagery'
     or v_receipt.evidence#>>'{imageryReceipts,north,sha256}'<>
       '4743D94DD1D2DF12EC30BCF1D687070CE1C4B7C5EF3178886A7C8640F5A6E063'
     or v_receipt.evidence#>>'{imageryReceipts,south,sha256}'<>
       'A09F350D7ED38F39D0BC32A648B3CB8BF1301966823D8769866314ADABCC3421'
     or extensions.st_x(extensions.st_startpoint(v_receipt.line_geometry))<>
       -81.1482753::double precision
     or extensions.st_y(extensions.st_startpoint(v_receipt.line_geometry))<>
       40.6980889::double precision
     or extensions.st_x(extensions.st_endpoint(v_receipt.line_geometry))<>
       -81.146851::double precision
     or extensions.st_y(extensions.st_endpoint(v_receipt.line_geometry))<>
       40.692699::double precision then
    return false;
  end if;
  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_geometry_receipt_active(uuid)
from public,anon,authenticated,service_role;

create function
  private_verification.brinesearch_v18_owner_access_route_receipt_active(
    p_release_id uuid
  )
returns boolean
language plpgsql
stable
strict
security definer
set search_path=''
set statement_timeout='20s'
set lock_timeout='500ms'
as $function$
declare
  v_private
    private_verification.brinesearch_v18_owner_access_route_releases%rowtype;
  v_public public.brinesearch_driver_owner_access_routes_public%rowtype;
  v_access
    private_verification.brinesearch_v18_owner_access_geometry_receipts%rowtype;
  v_base jsonb;
  v_feature_receipt jsonb;
  v_line extensions.geometry;
  v_index integer;
begin
  select * into v_private
  from private_verification.brinesearch_v18_owner_access_route_releases release
  where release.release_id=p_release_id;
  if not found or v_private.revoked_at is not null
     or private_verification.brinesearch_v18_owner_access_release_digest(
       v_private
     ) is distinct from v_private.release_digest
     or not private_verification.brinesearch_v18_owner_access_contract_valid(
       v_private.steps,v_private.geometry,v_private.ingress,
       v_private.private_access_start,v_private.destination,v_private.handoff
     )
     or not private_verification.brinesearch_v18_owner_access_core_receipt_current(
       v_private.public_core_receipt
     )
     or v_private.graph_dependencies is distinct from
       v_private.public_core_receipt->'graphDependencies'
     or pg_catalog.encode(extensions.digest(
       pg_catalog.convert_to(v_private.public_core_receipt::text,'UTF8'),
       'sha256'
     ),'hex') is distinct from v_private.public_core_receipt_digest
     or private_verification.brinesearch_v18_named_approach_has_navigation_link(
       pg_catalog.jsonb_build_array(
         v_private.steps,v_private.geometry,v_private.written_directions,
         v_private.graph_dependencies,v_private.public_core_receipt,
         v_private.ingress,v_private.private_access_start,
         v_private.destination,v_private.handoff,v_private.evidence
       )
     ) then
    return false;
  end if;

  select * into v_access
  from private_verification.brinesearch_v18_owner_access_geometry_receipts receipt
  where receipt.receipt_id=v_private.access_receipt_id;
  if not found
     or not private_verification.
       brinesearch_v18_owner_access_geometry_receipt_active(
         v_private.access_receipt_id
       )
     or v_access.pad_id is distinct from v_private.pad_id
     or v_access.pad_record_revision is distinct from
       v_private.pad_record_revision then
    return false;
  end if;

  v_base:=public.brinesearch_v18_driver_pad_status_with_named_approaches(
    v_private.pad_id
  );
  if v_base is null
     or v_base#>>'{status,padId}' is distinct from v_private.pad_id::text
     or v_base#>>'{status,recordRevision}' is distinct from
       v_private.pad_record_revision
     or v_base#>>'{status,statusRevision}' is distinct from
       v_private.base_status_revision then
    return false;
  end if;

  for v_index in 0..5 loop
    v_feature_receipt:=
      v_private.public_core_receipt->'featureReceipts'->v_index;
    if (v_feature_receipt->>'stepOrder')::integer<>v_index+1 then
      return false;
    end if;
    v_line:=extensions.st_setsrid(extensions.st_force2d(
      extensions.st_geomfromgeojson(
        (v_private.geometry->'features'->v_index->'geometry')::text
      )
    ),4326);
    if pg_catalog.md5(extensions.st_asgeojson(v_line,7)) is distinct from
         v_feature_receipt->>'geometryDigest'
       or extensions.st_npoints(v_line)<>
         (v_feature_receipt->>'pointCount')::integer
       or pg_catalog.abs(
         extensions.st_length(v_line::extensions.geography)-
           (v_feature_receipt->>'lengthMeters')::double precision
       )>0.001 then
      return false;
    end if;
  end loop;
  v_line:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (v_private.geometry->'features'->6->'geometry')::text
    )
  ),4326);
  if extensions.st_asgeojson(v_line,7)::jsonb is distinct from
       extensions.st_asgeojson(v_access.line_geometry,7)::jsonb then
    return false;
  end if;

  select * into v_public
  from public.brinesearch_driver_owner_access_routes_public projection
  where projection.release_id=p_release_id;
  if not found
     or v_public.pad_id is distinct from v_private.pad_id
     or v_public.release_version is distinct from v_private.release_version
     or v_public.route_revision is distinct from v_private.route_revision
     or v_public.public_core_step_count is distinct from
       v_private.public_core_step_count
     or v_public.steps is distinct from v_private.steps
     or v_public.geometry is distinct from v_private.geometry
     or v_public.written_directions is distinct from
       v_private.written_directions
     or v_public.ingress is distinct from v_private.ingress
     or v_public.private_access_start is distinct from
       v_private.private_access_start
     or v_public.destination is distinct from v_private.destination
     or v_public.final_leg_mode is distinct from v_private.final_leg_mode
     or v_public.handoff is distinct from v_private.handoff
     or v_public.last_verified_at is distinct from v_private.last_verified_at
     or v_public.status_revision is distinct from v_private.status_revision
     or v_public.release_digest is distinct from v_private.release_digest
     or v_public.published_at is distinct from v_private.published_at then
    return false;
  end if;
  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_route_receipt_active(uuid)
from public,anon,authenticated,service_role;

create temporary table tmp_v18_timberwolf_graph_seed (
  dependency_order integer primary key,
  county_code text unique not null,
  expected_build_id uuid not null,
  expected_source_revision_digest text not null,
  expected_graph_digest text not null
) on commit drop;

insert into tmp_v18_timberwolf_graph_seed values
  (1,'HAS','f4e4d43f-e86c-499c-893f-73f2eef3dc29',
    'ccbfb928a7c7ae96e72aebfc18037165',
    '71cb3479ac57b6f5dc26d0985a056d06'),
  (2,'CAR','8e565c14-33a4-4862-9bf8-be9b5557b293',
    '8405344f91e795398ab261a51f2a03bf',
    '2943504592861b83abce581f29a1cacb');

create temporary table tmp_v18_timberwolf_identity_seed (
  dependency_order integer primary key,
  source_identity_key text unique not null,
  expected_identity_id uuid not null,
  expected_source_digest text not null,
  expected_geometry_digest text not null
) on commit drop;

insert into tmp_v18_timberwolf_identity_seed values
  (1,'OH:ODOT:NLF:SHASUS00250**C',
    'f61bbbe4-353e-4968-e1dd-986d8889c11c',
    'b05fef13177ef8424d32166f38a63fc8',
    'ae8d10e7ae3c41394a1dc2aaaf65fb00'),
  (2,'OH:ODOT:NLF:SHASSR00646**C',
    '99898ae8-b80a-06d3-71c3-7d3901867bcd',
    'd1c7fe6571d0a3e799c4b46355797d5f',
    'b19046ddf8209b278c448c4c77dbbc40'),
  (3,'OH:ODOT:NLF:SHASSR00151**C',
    'c19bbcb8-b198-89f0-a759-87716b08dc9a',
    '545e571b4335db7fc7fc89415f42cb3a',
    'a72f6e901040d4b093d99d19bc88e03b'),
  (4,'OH:ODOT:NLF:SHASSR00332**C',
    '6a726504-2f18-7366-9c33-642676763dfe',
    'f3e07036d63678f76dd762240d995e3b',
    '4241887a7213613dc5264b4ab08f6107'),
  (5,'OH:ODOT:NLF:SCARSR00332**C',
    '911fa41e-30a2-35ae-da0d-6f22e7e1a0b3',
    'f5a8478a5ddcfc66102e5beed7c91c41',
    'c3a66ea1bb5612edfffbc10e462a7400'),
  (6,'OH:ODOT:NLF:SCARSR00043**C',
    'ee6f164d-e982-9c00-f1c6-7075efb14072',
    '9af86017147005ec1ab528f113a131c1',
    'aba04a0332a9c7fc592a3ad5f730c738'),
  (7,'OH:ODOT:NLF:SCARSR00183**C:COMP:2025_000000000274422',
    'e7c400aa-a78d-c9a4-909e-052d2a9adf68',
    'f731faf8bc840621d9f08fc6eae3ba4b',
    '394b26e196219c36636191e635263874'),
  (8,'OH:ODOT:NLF:TCARTR00225A*C',
    '8233bfa3-e4c3-3dda-2fb2-aae01ece3b74',
    'c452b16c2fdf7d51b8fc882a45889091',
    '6118c0d86eee13abc553d357a33dd4f2');

create temporary table tmp_v18_timberwolf_boundary_seed (
  boundary_order integer primary key,
  build_county_code text not null,
  anchor_role text not null,
  longitude double precision not null,
  latitude double precision not null,
  left_identity_key text not null,
  right_identity_key text not null,
  expected_junction_id uuid not null,
  expected_anchor_id uuid not null,
  expected_junction_digest text not null,
  expected_anchor_digest text not null
) on commit drop;

insert into tmp_v18_timberwolf_boundary_seed values
  (1,'HAS','point',-81.1447655,40.3244839,
    'OH:ODOT:NLF:SHASUS00250**C','OH:ODOT:NLF:SHASSR00646**C',
    '28a37aa0-8ef8-ff45-21a6-1fd4e20c0b17',
    '6cac884f-16e8-9fc5-e51c-2be122dcb60b',
    'fd3327f9cc4b064bee412e25a84ba15a',
    '9418721ea3b812a55a8344a26e79c610'),
  (2,'HAS','shared_start',-81.0841459,40.3945120,
    'OH:ODOT:NLF:SHASSR00646**C','OH:ODOT:NLF:SHASSR00151**C',
    '2231ec62-1436-33c1-756e-c87f176229ae',
    'aca9cb50-a773-76dc-fb2f-498cd1c68a94',
    '587de49951984095b604dd0a57d574cd',
    'caa2555a8661f8e297813126bba89fe4'),
  (3,'HAS','point',-81.1030915,40.4080276,
    'OH:ODOT:NLF:SHASSR00151**C','OH:ODOT:NLF:SHASSR00332**C',
    '1918a766-3b18-09b0-69a8-ff77e783cb99',
    'a0c065b3-1e87-654d-ed17-a5a7005f551a',
    'c47fc389bfe438c1dda967aced386c43',
    '859e95ee64a6304184e8ea713ddf551f'),
  (4,'CAR','point',-81.0862374,40.4284288,
    'OH:ODOT:NLF:SHASSR00332**C','OH:ODOT:NLF:SCARSR00332**C',
    'cfaa4de8-4bd8-f91b-a323-7268a8246f8f',
    'b01a2b4c-d10f-9690-728e-2352b437c112',
    '8b0336189f65f262b3632b88aa820d12',
    'efe7c0b655f63d55ba13d28cb02d0a24'),
  (5,'CAR','point',-81.0859991,40.5727358,
    'OH:ODOT:NLF:SCARSR00332**C','OH:ODOT:NLF:SCARSR00043**C',
    '6a6f14f2-9b52-11aa-63a3-50fcfd087bc5',
    'b4fa30cb-8394-2132-ae7a-a5f7c921e4cf',
    '75f569bb40705118c7450312ac3c6512',
    '9cead67f5a9dac468e8be7d2850770f4'),
  (6,'CAR','shared_end',-81.1622541,40.6897462,
    'OH:ODOT:NLF:SCARSR00043**C',
    'OH:ODOT:NLF:SCARSR00183**C:COMP:2025_000000000274422',
    '94bd1056-5d47-fac5-d26f-f57d5d802161',
    'b42b3097-debb-8975-0057-4688da44bae5',
    '9eab31f091d70254e5c3b7a4c4421e50',
    '8680f3cde7dd510be473a18b737d5e20'),
  (7,'CAR','point',-81.1490346,40.6987115,
    'OH:ODOT:NLF:SCARSR00183**C:COMP:2025_000000000274422',
    'OH:ODOT:NLF:TCARTR00225A*C',
    '727bf846-3567-a6da-82e6-bc016b735da6',
    '4df2cc99-17ca-39c7-e1c0-02064f20b155',
    '9060ff8c2c32a958f0c0192b871d11d8',
    '88422a3bd59f7126deae9ce846685064');

create temporary table tmp_v18_timberwolf_boundary_resolved
on commit drop as
select seed.*,
  build.id as build_id,build.source_revision_digest,
  build.graph_digest as build_graph_digest,
  junction.id as junction_id,junction.stable_junction_key,
  junction.junction_type,junction.graph_digest as junction_graph_digest,
  anchor.id as anchor_id,anchor.anchor_digest,
  extensions.st_x(anchor.geom) as anchor_longitude,
  extensions.st_y(anchor.geom) as anchor_latitude
from tmp_v18_timberwolf_boundary_seed seed
join public.brinesearch_road_graph_builds build
  on build.state_code='OH' and build.county_code=seed.build_county_code
 and build.status='active'
join public.brinesearch_road_junctions junction
  on junction.id=seed.expected_junction_id
 and junction.build_id=build.id and junction.verification_status='verified'
join public.brinesearch_road_junction_anchors anchor
  on anchor.id=seed.expected_anchor_id
 and anchor.junction_id=junction.id and anchor.anchor_role=seed.anchor_role
 and pg_catalog.abs(extensions.st_x(anchor.geom)-seed.longitude)<1e-12
 and pg_catalog.abs(extensions.st_y(anchor.geom)-seed.latitude)<1e-12
where exists(
  select 1
  from public.brinesearch_road_junction_memberships membership
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=membership.identity_id
  where membership.junction_id=junction.id
    and identity.source_identity_key=seed.left_identity_key
)
and exists(
  select 1
  from public.brinesearch_road_junction_memberships membership
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=membership.identity_id
  where membership.junction_id=junction.id
    and identity.source_identity_key=seed.right_identity_key
);

do $release_timberwolf_owner_access$
declare
  v_pad_id uuid;
  v_base jsonb;
  v_graph_dependencies jsonb;
  v_identity_dependencies jsonb;
  v_boundary_dependencies jsonb;
  v_feature_receipts jsonb;
  v_public_core_receipt jsonb;
  v_public_core_receipt_digest text;
  v_access
    private_verification.brinesearch_v18_owner_access_geometry_receipts%rowtype;
  v_release
    private_verification.brinesearch_v18_owner_access_route_releases%rowtype;
  v_ingress jsonb;
  v_private_access_start jsonb;
  v_destination jsonb;
  v_handoff jsonb;
  v_steps jsonb;
  v_geometry jsonb;
  v_written_directions text;
  v_point_a extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.1447655,40.3244839),4326
  );
  v_point_646_151 extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.0841459,40.3945120),4326
  );
  v_point_151_332 extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.1030915,40.4080276),4326
  );
  v_point_332_county extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.0862374,40.4284288),4326
  );
  v_point_332_43 extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.0859991,40.5727358),4326
  );
  v_point_b extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.1622541,40.6897462),4326
  );
  v_point_c extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.1490346,40.6987115),4326
  );
  v_point_d extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.1482753,40.6980889),4326
  );
  v_pad_destination extensions.geometry:=extensions.st_setsrid(
    extensions.st_makepoint(-81.146851,40.692699),4326
  );
  v_646 extensions.geometry;
  v_151 extensions.geometry;
  v_332_harrison extensions.geometry;
  v_332_carroll extensions.geometry;
  v_332 extensions.geometry;
  v_43 extensions.geometry;
  v_183 extensions.geometry;
  v_licking extensions.geometry;
  v_646_released extensions.geometry;
  v_151_released extensions.geometry;
  v_332_released extensions.geometry;
  v_43_released extensions.geometry;
  v_183_released extensions.geometry;
  v_licking_released extensions.geometry;
  v_access_line extensions.geometry;
  v_published_at timestamptz:=pg_catalog.transaction_timestamp();
begin
  select pad.id into strict v_pad_id
  from public.pads pad
  where pad.legacy_id='eog--timberwolf'
    and pad.pad_name='TIMBERWOLF'
    and pad.company='Eog'
    and pad.state='Ohio'
    and pad.county='Carroll';
  if v_pad_id<>'2b4ed9cb-65a3-4fcf-af56-709c17faeb33'::uuid then
    raise exception 'TIMBERWOLF natural-key UUID checkpoint diverged';
  end if;
  select bundle into strict v_base
  from tmp_v18_owner_access_bundles_before where pad_id=v_pad_id;
  if v_base#>>'{status,padId}' is distinct from v_pad_id::text
     or v_base#>>'{status,recordRevision}' is distinct from '1787459253071652'
     or v_base#>>'{status,statusRevision}' is distinct from
       'd9afd4144cebb54a03b12283eebea53c'
     or v_base#>>'{status,route,state}' is distinct from 'written_only'
     or v_base#>>'{status,route,source}' is distinct from 'legacy_written'
     or v_base#>'{status,route,geometry}' is distinct from 'null'::jsonb
     or v_base#>'{status,route,steps}' is distinct from '[]'::jsonb
     or v_base#>>'{status,destination,available}' is distinct from 'false'
     or v_base#>>'{status,google,publicState}' is distinct from 'unavailable'
     or v_base->'namedApproaches' is distinct from '[]'::jsonb
     or v_base->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_base->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'TIMBERWOLF immutable base envelope diverged';
  end if;
  if (select cutover_at from public.brinesearch_issue97_release_state
      where singleton) is not null then
    raise exception 'Issue #97 cutover must remain OFF';
  end if;
  if exists(
       select 1 from private_verification.brinesearch_google_route_receipts_issue97
       where pad_id=v_pad_id
     ) or exists(
       select 1 from public.brinesearch_driver_google_routes_public
       where pad_id=v_pad_id
     ) or exists(
       select 1 from private_verification.brinesearch_v18_public_google_route_releases
       where pad_id=v_pad_id
     ) or exists(
       select 1 from private_verification.brinesearch_v18_google_handoff_receipts
       where pad_id=v_pad_id
     ) or exists(
       select 1 from public.brinesearch_driver_google_handoffs_public
       where pad_id=v_pad_id
     ) then
    raise exception 'TIMBERWOLF already has an incompatible stored Google release';
  end if;

  if (select count(*) from tmp_v18_timberwolf_graph_seed)<>2
     or exists(
       select 1
       from tmp_v18_timberwolf_graph_seed seed
       left join public.brinesearch_road_graph_builds build
         on build.state_code='OH' and build.county_code=seed.county_code
        and build.status='active'
       where build.id is null
          or build.id is distinct from seed.expected_build_id
          or build.source_revision_digest is distinct from
            seed.expected_source_revision_digest
          or build.graph_digest is distinct from seed.expected_graph_digest
          or build.algorithm_version<>'issue97-authoritative-topology-v2'
          or not private_verification.
            brinesearch_issue97_graph_build_release_current_contextual(build.id)
     ) then
    raise exception 'TIMBERWOLF active Harrison/Carroll graph checkpoint diverged';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'buildId',build.id,
    'stateCode',build.state_code,
    'countyCode',build.county_code,
    'countyName',build.county_name,
    'algorithmVersion',build.algorithm_version,
    'sourceRevisionDigest',build.source_revision_digest,
    'graphDigest',build.graph_digest
  ) order by seed.dependency_order)
  into strict v_graph_dependencies
  from tmp_v18_timberwolf_graph_seed seed
  join public.brinesearch_road_graph_builds build
    on build.state_code='OH' and build.county_code=seed.county_code
   and build.status='active';

  if (select count(*) from tmp_v18_timberwolf_identity_seed)<>8
     or exists(
       select 1
       from tmp_v18_timberwolf_identity_seed seed
       left join public.brinesearch_authoritative_road_identities identity
         on identity.source_identity_key=seed.source_identity_key
        and identity.active
       where identity.id is null
          or identity.id is distinct from seed.expected_identity_id
          or identity.source_digest is distinct from seed.expected_source_digest
          or identity.public_access_status<>'public'
          or identity.drivable_status<>'drivable'
          or not private_verification.brinesearch_issue97_dataset_scope_current(
            identity.dataset_id,identity.state_code,identity.county_code
          )
          or private_verification.
            brinesearch_issue97_authoritative_identity_geometry_digest(
              identity.id
            ) is distinct from seed.expected_geometry_digest
     ) then
    raise exception 'TIMBERWOLF exact ODOT identity checkpoint diverged';
  end if;
  if exists(
    select 1
    from public.brinesearch_road_identity_mappings mapping
    where mapping.identity_id in (
      (select expected_identity_id from tmp_v18_timberwolf_identity_seed
       where dependency_order=7),
      (select expected_identity_id from tmp_v18_timberwolf_identity_seed
       where dependency_order=8)
    ) and mapping.mapping_status='verified'
  ) then
    raise exception 'OH-183/Licking Road mapping state changed; graph rebuild is forbidden here';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'identityId',identity.id,
    'sourceIdentityKey',identity.source_identity_key,
    'datasetId',identity.dataset_id,
    'stateCode',identity.state_code,
    'countyCode',identity.county_code,
    'sourceDigest',identity.source_digest,
    'geometryDigest',private_verification.
      brinesearch_issue97_authoritative_identity_geometry_digest(identity.id)
  ) order by seed.dependency_order)
  into strict v_identity_dependencies
  from tmp_v18_timberwolf_identity_seed seed
  join public.brinesearch_authoritative_road_identities identity
    on identity.source_identity_key=seed.source_identity_key and identity.active;

  if (select count(*) from tmp_v18_timberwolf_boundary_resolved)<>7
     or exists(
       select 1 from tmp_v18_timberwolf_boundary_resolved boundary
       join tmp_v18_timberwolf_graph_seed graph_seed
         on graph_seed.county_code=boundary.build_county_code
       where boundary.build_id is distinct from graph_seed.expected_build_id
          or boundary.junction_id is distinct from boundary.expected_junction_id
          or boundary.anchor_id is distinct from boundary.expected_anchor_id
          or boundary.junction_graph_digest is distinct from
            boundary.expected_junction_digest
          or boundary.anchor_digest is distinct from
            boundary.expected_anchor_digest
          or pg_catalog.abs(
            boundary.anchor_longitude-boundary.longitude
          )>=1e-12
          or pg_catalog.abs(
            boundary.anchor_latitude-boundary.latitude
          )>=1e-12
     ) then
    raise exception 'TIMBERWOLF exact graph-boundary checkpoint diverged';
  end if;
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'boundaryOrder',boundary.boundary_order,
    'buildId',boundary.build_id,
    'junctionId',boundary.junction_id,
    'anchorId',boundary.anchor_id,
    'anchorRole',boundary.anchor_role,
    'junctionType',boundary.junction_type,
    'stableJunctionKey',boundary.stable_junction_key,
    'junctionGraphDigest',boundary.junction_graph_digest,
    'anchorDigest',boundary.anchor_digest,
    'longitude',boundary.anchor_longitude,
    'latitude',boundary.anchor_latitude,
    'leftIdentityKey',boundary.left_identity_key,
    'rightIdentityKey',boundary.right_identity_key
  ) order by boundary.boundary_order)
  into strict v_boundary_dependencies
  from tmp_v18_timberwolf_boundary_resolved boundary;

  v_646:=private_verification.brinesearch_v18_owner_access_clip_identity(
    'OH:ODOT:NLF:SHASSR00646**C',v_point_a,v_point_646_151
  );
  v_151:=private_verification.brinesearch_v18_owner_access_clip_identity(
    'OH:ODOT:NLF:SHASSR00151**C',v_point_646_151,v_point_151_332
  );
  v_332_harrison:=
    private_verification.brinesearch_v18_owner_access_clip_identity(
      'OH:ODOT:NLF:SHASSR00332**C',v_point_151_332,v_point_332_county
    );
  v_332_carroll:=
    private_verification.brinesearch_v18_owner_access_clip_identity(
      'OH:ODOT:NLF:SCARSR00332**C',v_point_332_county,v_point_332_43
    );
  v_332:=extensions.st_linemerge(extensions.st_unaryunion(
    extensions.st_collect(v_332_harrison,v_332_carroll)
  ));
  if extensions.geometrytype(v_332)<>'LINESTRING' then
    raise exception 'OH-332 exact county continuation did not merge uniquely';
  end if;
  if extensions.st_distance(
       extensions.st_startpoint(v_332)::extensions.geography,
       v_point_151_332::extensions.geography
     )>extensions.st_distance(
       extensions.st_endpoint(v_332)::extensions.geography,
       v_point_151_332::extensions.geography
     ) then
    v_332:=extensions.st_reverse(v_332);
  end if;
  v_332:=extensions.st_setpoint(v_332,0,v_point_151_332);
  v_332:=extensions.st_setpoint(
    v_332,extensions.st_npoints(v_332)-1,v_point_332_43
  );
  v_332:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    extensions.st_asgeojson(v_332,15)
  ),4326);
  v_43:=private_verification.brinesearch_v18_owner_access_clip_identity(
    'OH:ODOT:NLF:SCARSR00043**C',v_point_332_43,v_point_b
  );
  v_183:=private_verification.brinesearch_v18_owner_access_clip_identity(
    'OH:ODOT:NLF:SCARSR00183**C:COMP:2025_000000000274422',
    v_point_b,v_point_c
  );
  v_licking:=private_verification.brinesearch_v18_owner_access_clip_identity(
    'OH:ODOT:NLF:TCARTR00225A*C',v_point_c,v_point_d
  );

  if extensions.st_npoints(v_646)<>381
     or pg_catalog.md5(extensions.st_asgeojson(v_646,7))<>
       '01e7ad0282ee41e9b0ff8321ad3a1c6a'
     or extensions.st_npoints(v_151)<>116
     or pg_catalog.md5(extensions.st_asgeojson(v_151,7))<>
       'f0c8a04619ca61ddd4057a1ea72d8450'
     or extensions.st_npoints(v_332)<>540
     or pg_catalog.md5(extensions.st_asgeojson(v_332,7))<>
       'e4330cb09f7d0b01c911860e956f4bd3'
     or extensions.st_npoints(v_43)<>326
     or pg_catalog.md5(extensions.st_asgeojson(v_43,7))<>
       '73e540b58ce0d5407535375f0f892572'
     or extensions.st_npoints(v_183)<>25
     or pg_catalog.md5(extensions.st_asgeojson(v_183,7))<>
       'c1332f19b71013508b6031045b1169cb'
     or extensions.st_npoints(v_licking)<>4
     or pg_catalog.md5(extensions.st_asgeojson(v_licking,7))<>
       'b590158363b8fcdf85af8dd560810a90' then
    raise exception 'TIMBERWOLF frozen exact public clips drifted';
  end if;

  v_access_line:=extensions.st_geomfromtext(
    'LINESTRING(-81.1482753 40.6980889,-81.1482826 40.6980109,-81.1482962 40.6979733,-81.1483202 40.6979426,-81.1483851 40.6979084,-81.1484671 40.6978879,-81.1488771 40.6976761,-81.1491333 40.6975121,-81.1493896 40.6973242,-81.1495604 40.6971773,-81.1497312 40.6970713,-81.1499533 40.6969073,-81.1500046 40.6968424,-81.1500832 40.6967775,-81.1501481 40.6967092,-81.1501788 40.6966408,-81.1501993 40.6965725,-81.1502164 40.6963333,-81.1502173 40.695625,-81.1502344 40.6950571,-81.1502476 40.6939214,-81.1502211 40.6935429,-81.1501643 40.692975,-81.1501359 40.6925207,-81.1500337 40.692392,-81.1499542 40.6923314,-81.1498482 40.692286,-81.1497157 40.6922671,-81.1489964 40.6922481,-81.1488071 40.6922368,-81.1486179 40.6922444,-81.1482393 40.6922406,-81.1479364 40.6922671,-81.1478418 40.6923011,-81.1476904 40.6923693,-81.1474254 40.6925094,-81.1471414 40.6926154,-81.146851 40.692699)',
    4326
  );
  if extensions.geometrytype(v_access_line)<>'LINESTRING'
     or not extensions.st_isvalid(v_access_line)
     or not extensions.st_issimple(v_access_line)
     or extensions.st_npoints(v_access_line)<>38
     or extensions.st_length(v_access_line::extensions.geography)
       not between 900 and 1100
     or extensions.st_x(extensions.st_startpoint(v_access_line))<>
       extensions.st_x(v_point_d)
     or extensions.st_y(extensions.st_startpoint(v_access_line))<>
       extensions.st_y(v_point_d)
     or extensions.st_x(extensions.st_endpoint(v_access_line))<>
       extensions.st_x(v_pad_destination)
     or extensions.st_y(extensions.st_endpoint(v_access_line))<>
       extensions.st_y(v_pad_destination) then
    raise exception 'TIMBERWOLF owner field trace failed exact geometry proof';
  end if;

  v_ingress:=pg_catalog.jsonb_build_object(
    'role','exact_public_route_ingress',
    'label','US-250 / OH-646',
    'latitude',40.3244839,
    'longitude',-81.1447655
  );
  v_private_access_start:=pg_catalog.jsonb_build_object(
    'role','owner_verified_private_access_start',
    'label','Licking Road NW / verified lease road',
    'latitude',40.6980889,
    'longitude',-81.1482753
  );
  v_destination:=pg_catalog.jsonb_build_object(
    'role','saved_pad_destination',
    'label','Timberwolf pad',
    'latitude',40.692699,
    'longitude',-81.146851
  );
  v_handoff:=pg_catalog.jsonb_build_object(
    'originMode','current_location_to_route_ingress',
    'handoffMode','owner_verified_controls_v1',
    'waypoints',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'latitude',40.3244839,'longitude',-81.1447655
      ),
      pg_catalog.jsonb_build_object(
        'latitude',40.6897462,'longitude',-81.1622541
      ),
      pg_catalog.jsonb_build_object(
        'latitude',40.6987115,'longitude',-81.1490346
      ),
      pg_catalog.jsonb_build_object(
        'latitude',40.6980889,'longitude',-81.1482753
      )
    )
  );

  v_steps:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'order',1,'kind','turn','displayName','OH-646',
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-646','SR-646','Tappan Scio Road'
      ),
      'instruction','From US-250 / OH-646, take OH-646 north toward Scio.',
      'distanceMiles',6.586224::numeric
    ),
    pg_catalog.jsonb_build_object(
      'order',2,'kind','continue',
      'displayName','OH-151 / Scio-Bowerston Road',
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-151','SR-151','Scio-Bowerston Road'
      ),
      'instruction','Continue onto OH-151 / Scio-Bowerston Road.',
      'distanceMiles',1.546425::numeric
    ),
    pg_catalog.jsonb_build_object(
      'order',3,'kind','turn',
      'displayName','OH-332 / Scio-Carrollton Road',
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-332','SR-332','Scio-Carrollton Road'
      ),
      'instruction','Turn right onto OH-332 / Scio-Carrollton Road.',
      'distanceMiles',12.833431::numeric
    ),
    pg_catalog.jsonb_build_object(
      'order',4,'kind','turn',
      'displayName','OH-43 N / Canton Road NW',
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-43','SR-43','Canton Road NW'
      ),
      'instruction','In Carrollton, turn left onto East Main Street, then continue right on OH-43 north / Canton Road NW.',
      'distanceMiles',9.716450::numeric
    ),
    pg_catalog.jsonb_build_object(
      'order',5,'kind','turn',
      'displayName','OH-183 E / Alliance Road NW',
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'OH-183','SR-183','Alliance Road NW'
      ),
      'instruction','Turn right onto OH-183 east / Alliance Road NW.',
      'distanceMiles',0.931875::numeric
    ),
    pg_catalog.jsonb_build_object(
      'order',6,'kind','turn','displayName','Licking Road NW',
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'Licking Road NW','TR-225'
      ),
      'instruction','Turn right onto Licking Road NW.',
      'distanceMiles',0.058617::numeric
    ),
    pg_catalog.jsonb_build_object(
      'order',7,'kind','turn','displayName','Verified lease road',
      'verifiedDesignations',pg_catalog.jsonb_build_array(
        'Private lease access'
      ),
      'instruction','Turn right onto the verified private lease road and follow it to the Timberwolf pad.',
      'distanceMiles',pg_catalog.round(
        (extensions.st_length(v_access_line::extensions.geography)/1609.344)::numeric,
        6
      )
    )
  );

  v_geometry:=pg_catalog.jsonb_build_object(
    'type','FeatureCollection',
    'features',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',1,'authority','exact_graph','label','OH-646'
        ),
        'geometry',extensions.st_asgeojson(v_646,7)::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',2,'authority','exact_graph',
          'label','OH-151 / Scio-Bowerston Road'
        ),
        'geometry',extensions.st_asgeojson(v_151,7)::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',3,'authority','exact_graph',
          'label','OH-332 / Scio-Carrollton Road'
        ),
        'geometry',extensions.st_asgeojson(v_332,7)::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',4,'authority','exact_graph',
          'label','OH-43 N / Canton Road NW'
        ),
        'geometry',extensions.st_asgeojson(v_43,7)::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',5,'authority','exact_graph',
          'label','OH-183 E / Alliance Road NW'
        ),
        'geometry',extensions.st_asgeojson(v_183,7)::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',6,'authority','exact_graph','label','Licking Road NW'
        ),
        'geometry',extensions.st_asgeojson(v_licking,7)::jsonb
      ),
      pg_catalog.jsonb_build_object(
        'type','Feature',
        'properties',pg_catalog.jsonb_build_object(
          'stepOrder',7,'authority','owner_verified_access',
          'label','Owner-verified lease access — not ODOT road geometry'
        ),
        'geometry',extensions.st_asgeojson(v_access_line,7)::jsonb
      )
    )
  );
  if not private_verification.brinesearch_v18_owner_access_contract_valid(
       v_steps,v_geometry,v_ingress,v_private_access_start,
       v_destination,v_handoff
     ) then
    raise exception 'TIMBERWOLF mixed-authority public contract is invalid';
  end if;

  -- Feature receipts bind to the exact 7-decimal GeoJSON artifacts that are
  -- released, not to their higher-precision pre-serialization clip sources.
  -- This keeps the strict millimetre currentness check meaningful.
  v_646_released:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (v_geometry->'features'->0->'geometry')::text
    )
  ),4326);
  v_151_released:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (v_geometry->'features'->1->'geometry')::text
    )
  ),4326);
  v_332_released:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (v_geometry->'features'->2->'geometry')::text
    )
  ),4326);
  v_43_released:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (v_geometry->'features'->3->'geometry')::text
    )
  ),4326);
  v_183_released:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (v_geometry->'features'->4->'geometry')::text
    )
  ),4326);
  v_licking_released:=extensions.st_setsrid(extensions.st_force2d(
    extensions.st_geomfromgeojson(
      (v_geometry->'features'->5->'geometry')::text
    )
  ),4326);

  v_written_directions:=pg_catalog.concat_ws(E'\n',
    '1. From US-250 / OH-646, take OH-646 north toward Scio.',
    '2. Continue onto OH-151 / Scio-Bowerston Road.',
    '3. Turn right onto OH-332 / Scio-Carrollton Road.',
    '4. In Carrollton, turn left onto East Main Street, then continue right on OH-43 north / Canton Road NW.',
    '5. Turn right onto OH-183 east / Alliance Road NW.',
    '6. Turn right onto Licking Road NW.',
    '7. Turn right onto the verified private lease road and follow it to the Timberwolf pad.'
  );
  v_feature_receipts:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'stepOrder',1,
      'sourceIdentityKeys',pg_catalog.jsonb_build_array(
        'OH:ODOT:NLF:SHASSR00646**C'
      ),
      'geometryDigest',pg_catalog.md5(
        extensions.st_asgeojson(v_646_released,7)
      ),
      'pointCount',extensions.st_npoints(v_646_released),
      'lengthMeters',pg_catalog.round(
        extensions.st_length(
          v_646_released::extensions.geography
        )::numeric,3
      )
    ),
    pg_catalog.jsonb_build_object(
      'stepOrder',2,
      'sourceIdentityKeys',pg_catalog.jsonb_build_array(
        'OH:ODOT:NLF:SHASSR00151**C'
      ),
      'geometryDigest',pg_catalog.md5(
        extensions.st_asgeojson(v_151_released,7)
      ),
      'pointCount',extensions.st_npoints(v_151_released),
      'lengthMeters',pg_catalog.round(
        extensions.st_length(
          v_151_released::extensions.geography
        )::numeric,3
      )
    ),
    pg_catalog.jsonb_build_object(
      'stepOrder',3,
      'sourceIdentityKeys',pg_catalog.jsonb_build_array(
        'OH:ODOT:NLF:SHASSR00332**C','OH:ODOT:NLF:SCARSR00332**C'
      ),
      'geometryDigest',pg_catalog.md5(
        extensions.st_asgeojson(v_332_released,7)
      ),
      'pointCount',extensions.st_npoints(v_332_released),
      'lengthMeters',pg_catalog.round(
        extensions.st_length(
          v_332_released::extensions.geography
        )::numeric,3
      )
    ),
    pg_catalog.jsonb_build_object(
      'stepOrder',4,
      'sourceIdentityKeys',pg_catalog.jsonb_build_array(
        'OH:ODOT:NLF:SCARSR00043**C'
      ),
      'geometryDigest',pg_catalog.md5(
        extensions.st_asgeojson(v_43_released,7)
      ),
      'pointCount',extensions.st_npoints(v_43_released),
      'lengthMeters',pg_catalog.round(
        extensions.st_length(
          v_43_released::extensions.geography
        )::numeric,3
      )
    ),
    pg_catalog.jsonb_build_object(
      'stepOrder',5,
      'sourceIdentityKeys',pg_catalog.jsonb_build_array(
        'OH:ODOT:NLF:SCARSR00183**C:COMP:2025_000000000274422'
      ),
      'geometryDigest',pg_catalog.md5(
        extensions.st_asgeojson(v_183_released,7)
      ),
      'pointCount',extensions.st_npoints(v_183_released),
      'lengthMeters',pg_catalog.round(
        extensions.st_length(
          v_183_released::extensions.geography
        )::numeric,3
      )
    ),
    pg_catalog.jsonb_build_object(
      'stepOrder',6,
      'sourceIdentityKeys',pg_catalog.jsonb_build_array(
        'OH:ODOT:NLF:TCARTR00225A*C'
      ),
      'geometryDigest',pg_catalog.md5(
        extensions.st_asgeojson(v_licking_released,7)
      ),
      'pointCount',extensions.st_npoints(v_licking_released),
      'lengthMeters',pg_catalog.round(
        extensions.st_length(
          v_licking_released::extensions.geography
        )::numeric,3
      )
    )
  );
  v_public_core_receipt:=pg_catalog.jsonb_build_object(
    'authority','exact_active_issue97_graph',
    'graphDependencies',v_graph_dependencies,
    'identityDependencies',v_identity_dependencies,
    'boundaryDependencies',v_boundary_dependencies,
    'featureReceipts',v_feature_receipts,
    'selectionPolicy',pg_catalog.jsonb_build_object(
      'identitySelection','exact_source_identity_key',
      'boundarySelection','verified_graph_anchor',
      'roadManagerMappingRequired',false,
      'nameMatchingUsed',false,
      'fuzzyMatchingUsed',false,
      'nearestRoadUsed',false,
      'routeNumberOnlyUsed',false,
      'privateGeometryAsOdot',false,
      'issue97Mutation',false
    )
  );
  v_public_core_receipt_digest:=pg_catalog.encode(extensions.digest(
    pg_catalog.convert_to(v_public_core_receipt::text,'UTF8'),'sha256'
  ),'hex');
  if not private_verification.brinesearch_v18_owner_access_core_receipt_current(
       v_public_core_receipt
     ) then
    raise exception 'TIMBERWOLF exact public-core receipt is not current';
  end if;

  v_access.receipt_id:=pg_catalog.gen_random_uuid();
  v_access.pad_id:=v_pad_id;
  v_access.pad_record_revision:='1787459253071652';
  v_access.source_kind:='owner_field_trace';
  v_access.line_geometry:=v_access_line;
  v_access.control_points:=pg_catalog.jsonb_build_array(
    v_private_access_start,v_destination
  );
  v_access.evidence:=pg_catalog.jsonb_build_object(
    'authority','owner_verified_private_access',
    'imagerySource','Esri World Imagery',
    'publicRoad',false,
    'odotGeometry',false,
    'issue97Authority',false,
    'traceMethod','owner_field_trace',
    'userVerifiedRoute',true,
    'traceNotes',pg_catalog.jsonb_build_array(
      'Follows the visible southern tree-line gravel driveway.',
      'Avoids the west equipment row.',
      'Imagery shadows required conservative interpolation.',
      'Final segment is the visible on-pad approach.'
    ),
    'imageryReceipts',pg_catalog.jsonb_build_object(
      'north',pg_catalog.jsonb_build_object(
        'requestedBbox',pg_catalog.jsonb_build_array(
          -81.1505,40.6963,-81.1464,40.6991
        ),
        'actualExtent',pg_catalog.jsonb_build_array(
          -81.1505,40.6961625,-81.1464,40.6992375
        ),
        'size',pg_catalog.jsonb_build_array(1200,900),
        'sha256','4743D94DD1D2DF12EC30BCF1D687070CE1C4B7C5EF3178886A7C8640F5A6E063'
      ),
      'south',pg_catalog.jsonb_build_object(
        'requestedBbox',pg_catalog.jsonb_build_array(
          -81.1507,40.6913,-81.1454,40.6973
        ),
        'size',pg_catalog.jsonb_build_array(1400,1600),
        'sha256','A09F350D7ED38F39D0BC32A648B3CB8BF1301966823D8769866314ADABCC3421'
      )
    )
  );
  v_access.verified_at:='2026-08-28T22:03:18Z'::timestamptz;
  v_access.receipt_digest:=pg_catalog.repeat('0',64);
  v_access.revoked_at:=null;
  v_access.receipt_digest:=
    private_verification.brinesearch_v18_owner_access_geometry_digest(v_access);
  insert into private_verification.brinesearch_v18_owner_access_geometry_receipts(
    receipt_id,pad_id,pad_record_revision,source_kind,line_geometry,
    control_points,evidence,verified_at,receipt_digest,revoked_at
  ) values (
    v_access.receipt_id,v_access.pad_id,v_access.pad_record_revision,
    v_access.source_kind,v_access.line_geometry,v_access.control_points,
    v_access.evidence,v_access.verified_at,v_access.receipt_digest,
    v_access.revoked_at
  );

  v_release.release_id:=pg_catalog.gen_random_uuid();
  v_release.pad_id:=v_pad_id;
  v_release.release_version:='v18-owner-access-route-v1';
  v_release.route_revision:=1;
  v_release.source_sequence:=
    'US-250 / OH-646 → OH-646 → OH-151 → OH-332 → OH-43 → OH-183 → Licking Road NW → verified private access → Timberwolf pad';
  v_release.source_sequence_hash:=pg_catalog.md5(v_release.source_sequence);
  v_release.pad_record_revision:='1787459253071652';
  v_release.base_status_revision:='d9afd4144cebb54a03b12283eebea53c';
  v_release.status_revision:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_release.base_status_revision,v_release.release_version,
    v_public_core_receipt_digest,v_access.receipt_digest
  ));
  v_release.public_core_step_count:=6;
  v_release.steps:=v_steps;
  v_release.geometry:=v_geometry;
  v_release.written_directions:=v_written_directions;
  v_release.graph_dependencies:=v_graph_dependencies;
  v_release.public_core_receipt:=v_public_core_receipt;
  v_release.public_core_receipt_digest:=v_public_core_receipt_digest;
  v_release.access_receipt_id:=v_access.receipt_id;
  v_release.ingress:=v_ingress;
  v_release.private_access_start:=v_private_access_start;
  v_release.destination:=v_destination;
  v_release.final_leg_mode:='owner_verified_private_access_to_saved_pad';
  v_release.handoff:=v_handoff;
  v_release.authorization_basis:='user_verified_route_2026-08-28';
  v_release.last_verified_at:='2026-08-28T22:03:18Z'::timestamptz;
  v_release.evidence:=pg_catalog.jsonb_build_object(
    'routeAuthority','user_verified',
    'publicCoreAuthority','exact_current_odot_graph',
    'privateAccessAuthority','owner_field_trace',
    'baseRecordRevision','1787459253071652',
    'baseStatusRevision','d9afd4144cebb54a03b12283eebea53c',
    'storedNavigationArtifact',false,
    'issue97Mutation',false,
    'graphRebuild',false,
    'padMutation',false,
    'directoryMutation',false,
    'overlayMutation',false
  );
  v_release.release_digest:=pg_catalog.repeat('0',64);
  v_release.published_at:=v_published_at;
  v_release.revoked_at:=null;
  v_release.release_digest:=
    private_verification.brinesearch_v18_owner_access_release_digest(v_release);

  insert into private_verification.brinesearch_v18_owner_access_route_releases(
    release_id,pad_id,release_version,route_revision,source_sequence,
    source_sequence_hash,pad_record_revision,base_status_revision,
    status_revision,public_core_step_count,steps,geometry,written_directions,
    graph_dependencies,public_core_receipt,public_core_receipt_digest,
    access_receipt_id,ingress,private_access_start,destination,final_leg_mode,
    handoff,authorization_basis,last_verified_at,evidence,release_digest,
    published_at,revoked_at
  ) values (
    v_release.release_id,v_release.pad_id,v_release.release_version,
    v_release.route_revision,v_release.source_sequence,
    v_release.source_sequence_hash,v_release.pad_record_revision,
    v_release.base_status_revision,v_release.status_revision,
    v_release.public_core_step_count,v_release.steps,v_release.geometry,
    v_release.written_directions,v_release.graph_dependencies,
    v_release.public_core_receipt,v_release.public_core_receipt_digest,
    v_release.access_receipt_id,v_release.ingress,
    v_release.private_access_start,v_release.destination,
    v_release.final_leg_mode,v_release.handoff,
    v_release.authorization_basis,v_release.last_verified_at,
    v_release.evidence,v_release.release_digest,v_release.published_at,
    v_release.revoked_at
  );
  insert into public.brinesearch_driver_owner_access_routes_public(
    release_id,pad_id,release_version,route_revision,public_core_step_count,
    steps,geometry,written_directions,ingress,private_access_start,destination,
    final_leg_mode,handoff,last_verified_at,status_revision,release_digest,
    published_at
  ) values (
    v_release.release_id,v_release.pad_id,v_release.release_version,
    v_release.route_revision,v_release.public_core_step_count,v_release.steps,
    v_release.geometry,v_release.written_directions,v_release.ingress,
    v_release.private_access_start,v_release.destination,
    v_release.final_leg_mode,v_release.handoff,v_release.last_verified_at,
    v_release.status_revision,v_release.release_digest,v_release.published_at
  );
  if not private_verification.brinesearch_v18_owner_access_route_receipt_active(
       v_release.release_id
     ) then
    raise exception 'TIMBERWOLF owner-access release failed its immutable gate';
  end if;
end
$release_timberwolf_owner_access$;

create function private_verification.brinesearch_v18_owner_access_public_object(
  p_projection jsonb
)
returns jsonb
language sql
immutable
strict
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
  select pg_catalog.jsonb_build_object(
    'releaseId',p_projection->'release_id',
    'releaseVersion',p_projection->'release_version',
    'routeRevision',p_projection->'route_revision',
    'publicCoreStepCount',p_projection->'public_core_step_count',
    'steps',p_projection->'steps',
    'geometry',p_projection->'geometry',
    'ingress',p_projection->'ingress',
    'privateAccessStart',p_projection->'private_access_start',
    'destination',p_projection->'destination',
    'finalLegMode',p_projection->'final_leg_mode',
    'handoff',p_projection->'handoff',
    'lastVerifiedAt',p_projection->'last_verified_at',
    'statusRevision',p_projection->'status_revision',
    'releaseDigest',p_projection->'release_digest',
    'publishedAt',p_projection->'published_at'
  )
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_public_object(jsonb)
from public,anon,authenticated,service_role;

create function
  private_verification.brinesearch_v18_owner_access_promote_envelope(
    p_base jsonb,
    p_projection jsonb
  )
returns jsonb
language plpgsql
immutable
strict
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
declare
  v_status jsonb:=p_base->'status';
  v_result jsonb:=p_base;
begin
  if pg_catalog.jsonb_typeof(v_status)<>'object' then
    return null;
  end if;
  v_status:=pg_catalog.jsonb_set(
    v_status,'{route}',pg_catalog.jsonb_build_object(
      'state','ready',
      'steps',p_projection->'steps',
      'source','owner_verified_access',
      'geometry',p_projection->'geometry',
      'safeReason',
        'Public-road core is exact ODOT graph geometry; final dashed leg is owner-verified private lease access.',
      'lastVerifiedAt',p_projection->'last_verified_at',
      'writtenDirections',p_projection->'written_directions'
    ),true
  );
  v_status:=pg_catalog.jsonb_set(
    v_status,'{graph}',pg_catalog.jsonb_build_object(
      'state','verified_release',
      'county','Carroll',
      'counties',pg_catalog.jsonb_build_array('Harrison','Carroll'),
      'graphCount',2,
      'publicSource','Exact active ODOT graph plus owner-verified private access',
      'lastVerifiedAt',p_projection->'last_verified_at'
    ),true
  );
  v_status:=pg_catalog.jsonb_set(
    v_status,'{google}',pg_catalog.jsonb_build_object(
      'publicState','ready',
      'safeReason',
        'Current-location navigation uses all four frozen controls before the saved pad destination.'
    ),true
  );
  v_status:=pg_catalog.jsonb_set(
    v_status,'{destination}',pg_catalog.jsonb_build_object(
      'available',true,
      'role','saved_pad_destination',
      'label',p_projection#>>'{destination,label}',
      'latitude',p_projection#>'{destination,latitude}',
      'longitude',p_projection#>'{destination,longitude}'
    ),true
  );
  v_status:=pg_catalog.jsonb_set(
    v_status,'{statusRevision}',p_projection->'status_revision',true
  );
  v_result:=pg_catalog.jsonb_set(v_result,'{status}',v_status,true);
  v_result:=pg_catalog.jsonb_set(
    v_result,'{ownerVerifiedAccessRoute}',
    private_verification.brinesearch_v18_owner_access_public_object(
      p_projection
    ),true
  );
  return v_result;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_owner_access_promote_envelope(jsonb,jsonb)
from public,anon,authenticated,service_role;

create function public.brinesearch_v18_driver_owner_access_route(p_pad_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
set statement_timeout='20s'
set lock_timeout='500ms'
as $function$
  with eligible as materialized (
    select pg_catalog.to_jsonb(projection) as value
    from public.brinesearch_driver_owner_access_routes_public projection
    where projection.pad_id=p_pad_id
      and private_verification.
        brinesearch_v18_owner_access_route_receipt_active(
          projection.release_id
        )
  ), selected as (
    select case when count(*)=1
      then (pg_catalog.jsonb_agg(eligible.value)->0)
      else null end as value
    from eligible
  )
  select case when selected.value is null then null
    else private_verification.brinesearch_v18_owner_access_public_object(
      selected.value
    ) end
  from selected
$function$;

revoke all on function public.brinesearch_v18_driver_owner_access_route(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_driver_owner_access_route(uuid)
to service_role;

comment on function public.brinesearch_v18_driver_owner_access_route(uuid) is
'Service-role diagnostic projection of one immutable, receipt-gated owner-access release. It exposes the exact mixed-authority geometry and four coordinate controls, but stores and returns no navigation artifact.';

create function
  public.brinesearch_v18_driver_pad_status_with_owner_access(p_pad_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
set statement_timeout='20s'
set lock_timeout='500ms'
as $function$
  with base as materialized (
    select public.brinesearch_v18_driver_pad_status_with_named_approaches(
      p_pad_id
    ) as value
  ), eligible as materialized (
    select pg_catalog.to_jsonb(projection) as value
    from public.brinesearch_driver_owner_access_routes_public projection
    where projection.pad_id=p_pad_id
      and private_verification.
        brinesearch_v18_owner_access_route_receipt_active(
          projection.release_id
        )
  ), selected as (
    select case when count(*)=1
      then (pg_catalog.jsonb_agg(eligible.value)->0)
      else null end as value
    from eligible
  )
  select case
    when base.value is null then null
    when selected.value is null then pg_catalog.jsonb_set(
      base.value,'{ownerVerifiedAccessRoute}','null'::jsonb,true
    )
    else private_verification.brinesearch_v18_owner_access_promote_envelope(
      base.value,selected.value
    )
  end
  from base cross join selected
$function$;

revoke all on function
  public.brinesearch_v18_driver_pad_status_with_owner_access(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_driver_pad_status_with_owner_access(uuid)
to anon,authenticated,service_role;

comment on function
  public.brinesearch_v18_driver_pad_status_with_owner_access(uuid) is
'Additive atomic V18 driver envelope. A current owner-access receipt promotes only this response while preserving the pad record revision; every older wrapper remains independently callable and unchanged.';

do $postflight$
declare
  v_pad_id constant uuid:='2b4ed9cb-65a3-4fcf-af56-709c17faeb33';
  v_release
    private_verification.brinesearch_v18_owner_access_route_releases%rowtype;
  v_access
    private_verification.brinesearch_v18_owner_access_geometry_receipts%rowtype;
  v_base jsonb;
  v_bundle jsonb;
  v_owner jsonb;
  v_protected record;
  v_before_wrapper tmp_v18_owner_access_wrapper_before%rowtype;
  v_after_wrapper pg_catalog.pg_proc%rowtype;
  v_function pg_catalog.pg_proc%rowtype;
  v_relation record;
  v_count bigint;
  v_fingerprint text;
  v_line extensions.geometry;
begin
  select * into strict v_release
  from private_verification.brinesearch_v18_owner_access_route_releases
  where pad_id=v_pad_id and revoked_at is null;
  select * into strict v_access
  from private_verification.brinesearch_v18_owner_access_geometry_receipts
  where receipt_id=v_release.access_receipt_id;
  if (select count(*)
      from private_verification.brinesearch_v18_owner_access_route_releases)<>1
     or (select count(*)
         from private_verification.brinesearch_v18_owner_access_geometry_receipts)<>1
     or (select count(*)
         from public.brinesearch_driver_owner_access_routes_public)<>1
     or not private_verification.brinesearch_v18_owner_access_route_receipt_active(
       v_release.release_id
     )
     or not private_verification.
       brinesearch_v18_owner_access_geometry_receipt_active(v_access.receipt_id) then
    raise exception 'TIMBERWOLF immutable owner-access release is not uniquely active';
  end if;

  select bundle into strict v_base
  from tmp_v18_owner_access_bundles_before where pad_id=v_pad_id;
  if public.brinesearch_v18_driver_pad_status_with_named_approaches(v_pad_id)
       is distinct from v_base then
    raise exception 'TIMBERWOLF legacy atomic envelope changed';
  end if;
  v_bundle:=
    public.brinesearch_v18_driver_pad_status_with_owner_access(v_pad_id);
  v_owner:=v_bundle->'ownerVerifiedAccessRoute';
  if v_bundle is null or v_owner is null
     or pg_catalog.jsonb_typeof(v_owner)<>'object'
     or not (v_owner ?& array[
       'releaseId','releaseVersion','routeRevision','publicCoreStepCount',
       'steps','geometry','ingress','privateAccessStart','destination',
       'finalLegMode','handoff','lastVerifiedAt','statusRevision',
       'releaseDigest','publishedAt'
     ])
     or (v_owner-array[
       'releaseId','releaseVersion','routeRevision','publicCoreStepCount',
       'steps','geometry','ingress','privateAccessStart','destination',
       'finalLegMode','handoff','lastVerifiedAt','statusRevision',
       'releaseDigest','publishedAt'
     ]::text[])<>'{}'::jsonb
     or v_owner->>'releaseId'<>v_release.release_id::text
     or v_owner->>'releaseVersion'<>'v18-owner-access-route-v1'
     or (v_owner->>'routeRevision')::bigint<>1
     or (v_owner->>'publicCoreStepCount')::integer<>6
     or v_owner->>'finalLegMode'<>
       'owner_verified_private_access_to_saved_pad'
     or v_owner->>'statusRevision'<>v_release.status_revision
     or v_owner->>'releaseDigest'<>v_release.release_digest
     or v_owner->'steps' is distinct from v_release.steps
     or v_owner->'geometry' is distinct from v_release.geometry
     or v_owner->'ingress' is distinct from pg_catalog.jsonb_build_object(
       'role','exact_public_route_ingress','label','US-250 / OH-646',
       'latitude',40.3244839,'longitude',-81.1447655
     )
     or v_owner->'privateAccessStart' is distinct from
       pg_catalog.jsonb_build_object(
         'role','owner_verified_private_access_start',
         'label','Licking Road NW / verified lease road',
         'latitude',40.6980889,'longitude',-81.1482753
       )
     or v_owner->'destination' is distinct from pg_catalog.jsonb_build_object(
       'role','saved_pad_destination','label','Timberwolf pad',
       'latitude',40.692699,'longitude',-81.146851
     )
     or v_owner->'handoff' is distinct from pg_catalog.jsonb_build_object(
       'originMode','current_location_to_route_ingress',
       'handoffMode','owner_verified_controls_v1',
       'waypoints',pg_catalog.jsonb_build_array(
         pg_catalog.jsonb_build_object(
           'latitude',40.3244839,'longitude',-81.1447655
         ),
         pg_catalog.jsonb_build_object(
           'latitude',40.6897462,'longitude',-81.1622541
         ),
         pg_catalog.jsonb_build_object(
           'latitude',40.6987115,'longitude',-81.1490346
         ),
         pg_catalog.jsonb_build_object(
           'latitude',40.6980889,'longitude',-81.1482753
         )
       )
     ) then
    raise exception 'TIMBERWOLF ownerVerifiedAccessRoute contract diverged';
  end if;
  if public.brinesearch_v18_driver_owner_access_route(v_pad_id)
       is distinct from v_owner then
    raise exception 'TIMBERWOLF diagnostic owner-access projection diverged';
  end if;

  if v_bundle#>>'{status,recordRevision}' is distinct from '1787459253071652'
     or v_bundle#>>'{status,statusRevision}' is distinct from
       v_release.status_revision
     or v_bundle#>>'{status,route,state}' is distinct from 'ready'
     or v_bundle#>>'{status,route,source}' is distinct from
       'owner_verified_access'
     or v_bundle#>>'{status,route,safeReason}' is distinct from
       'Public-road core is exact ODOT graph geometry; final dashed leg is owner-verified private lease access.'
     or v_bundle#>'{status,route,steps}' is distinct from v_release.steps
     or v_bundle#>'{status,route,geometry}' is distinct from v_release.geometry
     or v_bundle#>>'{status,route,writtenDirections}' is distinct from
       v_release.written_directions
     or v_bundle#>>'{status,graph,state}' is distinct from 'verified_release'
     or (v_bundle#>>'{status,graph,graphCount}')::integer<>2
     or v_bundle#>>'{status,google,publicState}' is distinct from 'ready'
     or (v_bundle#>'{status,google}') ? 'routeUrl'
     or v_bundle#>>'{status,destination,available}' is distinct from 'true'
     or v_bundle#>>'{status,destination,role}' is distinct from
       'saved_pad_destination'
     or (v_bundle#>>'{status,destination,latitude}')::numeric<>
       40.692699::numeric
     or (v_bundle#>>'{status,destination,longitude}')::numeric<>
       -81.146851::numeric
     or v_bundle->'namedApproaches' is distinct from '[]'::jsonb
     or v_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'TIMBERWOLF promoted atomic status diverged';
  end if;
  if private_verification.brinesearch_v18_named_approach_has_navigation_link(
       pg_catalog.jsonb_build_array(
         v_owner,v_bundle#>'{status,route}',v_bundle#>'{status,google}'
       )
     ) then
    raise exception 'TIMBERWOLF release stored or exposed a navigation artifact';
  end if;
  if v_release.steps->0->>'kind'<>'turn'
     or v_release.steps->0->>'instruction'<>
       'From US-250 / OH-646, take OH-646 north toward Scio.'
     or (v_release.steps->0->>'distanceMiles')::numeric<>6.586224
     or v_release.steps->1->>'kind'<>'continue'
     or v_release.steps->3->>'instruction'<>
       'In Carrollton, turn left onto East Main Street, then continue right on OH-43 north / Canton Road NW.'
     or v_release.steps->6->>'displayName'<>'Verified lease road'
     or v_release.steps->6->'verifiedDesignations' is distinct from
       pg_catalog.jsonb_build_array('Private lease access')
     or (v_release.steps->6->>'distanceMiles')::numeric is distinct from
       pg_catalog.round(
         (extensions.st_length(v_access.line_geometry::extensions.geography)/
           1609.344)::numeric,6
       ) then
    raise exception 'TIMBERWOLF seven frozen step cards diverged';
  end if;
  if not private_verification.brinesearch_v18_owner_access_contract_valid(
       v_release.steps,v_release.geometry,v_release.ingress,
       v_release.private_access_start,v_release.destination,v_release.handoff
     )
     or v_release.geometry->'features'->6->'properties' is distinct from
       pg_catalog.jsonb_build_object(
         'stepOrder',7,'authority','owner_verified_access',
         'label','Owner-verified lease access — not ODOT road geometry'
       ) then
    raise exception 'TIMBERWOLF exact mixed-authority feature contract diverged';
  end if;
  v_line:=extensions.st_setsrid(extensions.st_geomfromgeojson(
    (v_release.geometry->'features'->6->'geometry')::text
  ),4326);
  if extensions.st_npoints(v_line)<>38
     or not extensions.st_isvalid(v_line)
     or not extensions.st_issimple(v_line)
     or extensions.st_length(v_line::extensions.geography) not between 900 and 1100
     or extensions.st_x(extensions.st_startpoint(v_line))<>-81.1482753
     or extensions.st_y(extensions.st_startpoint(v_line))<>40.6980889
     or extensions.st_x(extensions.st_endpoint(v_line))<>-81.146851
     or extensions.st_y(extensions.st_endpoint(v_line))<>40.692699 then
    raise exception 'TIMBERWOLF private-access line proof diverged';
  end if;

  for v_protected in
    select before.pad_id,before.bundle
    from tmp_v18_owner_access_bundles_before before
    where before.pad_id<>v_pad_id
  loop
    if public.brinesearch_v18_driver_pad_status_with_named_approaches(
         v_protected.pad_id
       ) is distinct from v_protected.bundle
       or public.brinesearch_v18_driver_pad_status_with_owner_access(
            v_protected.pad_id
          )-'ownerVerifiedAccessRoute' is distinct from v_protected.bundle
       or public.brinesearch_v18_driver_pad_status_with_owner_access(
            v_protected.pad_id
          )->'ownerVerifiedAccessRoute' is distinct from 'null'::jsonb then
      raise exception 'Protected pad envelope changed for %',v_protected.pad_id;
    end if;
  end loop;

  select * into strict v_before_wrapper
  from tmp_v18_owner_access_wrapper_before;
  select * into strict v_after_wrapper
  from pg_catalog.pg_proc procedure
  where procedure.oid=
    'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'::
      pg_catalog.regprocedure;
  if v_after_wrapper.prosrc is distinct from v_before_wrapper.prosrc
     or v_after_wrapper.prolang is distinct from v_before_wrapper.prolang
     or v_after_wrapper.provolatile is distinct from v_before_wrapper.provolatile
     or v_after_wrapper.prosecdef is distinct from v_before_wrapper.prosecdef
     or v_after_wrapper.proisstrict is distinct from v_before_wrapper.proisstrict
     or v_after_wrapper.proconfig is distinct from v_before_wrapper.proconfig
     or v_after_wrapper.proowner is distinct from v_before_wrapper.proowner
     or v_after_wrapper.proacl is distinct from v_before_wrapper.proacl
     or pg_catalog.pg_get_functiondef(v_after_wrapper.oid) is distinct from
       v_before_wrapper.definition then
    raise exception 'Existing named-approach atomic wrapper changed';
  end if;

  select * into strict v_function from pg_catalog.pg_proc
  where oid=
    'public.brinesearch_v18_driver_pad_status_with_owner_access(uuid)'::
      pg_catalog.regprocedure;
  if not v_function.prosecdef or v_function.provolatile<>'s'
     or v_function.proisstrict
     or not (v_function.proconfig @> array[
       'search_path=""','statement_timeout=20s','lock_timeout=500ms'
     ]::text[])
     or pg_catalog.has_function_privilege('public',v_function.oid,'execute')
     or not pg_catalog.has_function_privilege('anon',v_function.oid,'execute')
     or not pg_catalog.has_function_privilege(
       'authenticated',v_function.oid,'execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',v_function.oid,'execute'
     ) then
    raise exception 'Owner-access atomic wrapper hardening diverged';
  end if;
  if exists(
    select 1
    from (values ('public'),('anon'),('authenticated'),('service_role')) role_name(name)
    cross join (values
      ('private_verification.brinesearch_v18_owner_access_geometry_receipts'),
      ('private_verification.brinesearch_v18_owner_access_route_releases'),
      ('public.brinesearch_driver_owner_access_routes_public')
    ) relation_name(name)
    cross join (values
      ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
      ('REFERENCES'),('TRIGGER')
    ) privilege_name(name)
    where pg_catalog.has_table_privilege(
      role_name.name,relation_name.name,privilege_name.name
    )
  ) or exists(
    select 1
    from (values
      ('private_verification.brinesearch_v18_owner_access_geometry_receipts'),
      ('private_verification.brinesearch_v18_owner_access_route_releases'),
      ('public.brinesearch_driver_owner_access_routes_public')
    ) relation_name(name)
    join pg_catalog.pg_class relation
      on relation.oid=relation_name.name::pg_catalog.regclass
    where not relation.relrowsecurity or not relation.relforcerowsecurity
  ) then
    raise exception 'Owner-access release table RLS or grants diverged';
  end if;

  if exists(
       select 1 from private_verification.brinesearch_google_route_receipts_issue97
       where pad_id=v_pad_id
     ) or exists(
       select 1 from public.brinesearch_driver_google_routes_public
       where pad_id=v_pad_id
     ) or exists(
       select 1 from private_verification.brinesearch_v18_public_google_route_releases
       where pad_id=v_pad_id
     ) or exists(
       select 1 from private_verification.brinesearch_v18_google_handoff_receipts
       where pad_id=v_pad_id
     ) or exists(
       select 1 from public.brinesearch_driver_google_handoffs_public
       where pad_id=v_pad_id
     ) or (select cutover_at from public.brinesearch_issue97_release_state
            where singleton) is not null then
    raise exception 'TIMBERWOLF wrote a Google release or changed cutover';
  end if;

  for v_relation in
    select * from tmp_v18_owner_access_unchanged_relations
    order by relation_name
  loop
    execute pg_catalog.format(
      $sql$select count(*),pg_catalog.md5(coalesce(pg_catalog.string_agg(
        snapshot_row.xmin::text||':'||snapshot_row.ctid::text,'|'
        order by snapshot_row.ctid
      ),'')) from %s snapshot_row$sql$,
      v_relation.relation_name::pg_catalog.regclass
    ) into v_count,v_fingerprint;
    if v_count is distinct from v_relation.row_count
       or v_fingerprint is distinct from v_relation.tuple_fingerprint then
      raise exception 'Protected relation % changed',v_relation.relation_name;
    end if;
  end loop;
end
$postflight$;
