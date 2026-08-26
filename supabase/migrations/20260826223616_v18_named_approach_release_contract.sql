-- Issue #97 infrastructure only: immutable named approaches per pad.
--
-- This migration deliberately publishes no approach.  A later pad-scoped
-- release must prove each complete ordered ingress, approved geometry, and
-- destination before it may insert one matching private/public receipt pair.
-- Driver reads receive only the sanitized immutable projection.  They never
-- receive evidence, graph/receipt internals, or a prebuilt navigation URL.

set local statement_timeout='5min';
set local lock_timeout='5s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:v18:named-approach-release-contract',18
  )
);

create temporary table tmp_v18_named_approach_before on commit drop as
select
  wrapper.prosrc as wrapper_prosrc,
  wrapper.prolang as wrapper_prolang,
  wrapper.provolatile as wrapper_provolatile,
  wrapper.prosecdef as wrapper_prosecdef,
  wrapper.proisstrict as wrapper_proisstrict,
  wrapper.proconfig as wrapper_proconfig,
  wrapper.proowner as wrapper_proowner,
  wrapper.proacl as wrapper_proacl,
  public.brinesearch_v18_driver_pad_status_with_google_handoff(
    '518659d9-bca2-47b0-b294-3141ba679fc4'
  ) as lasso_bundle,
  public.brinesearch_v18_driver_pad_status_with_google_handoff(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
  ) as cologie_bundle,
  public.brinesearch_v18_driver_pad_status_with_google_handoff(
    'b9a8e55c-3583-4019-85fc-54a03d420ace'
  ) as hamilton_bundle,
  public.brinesearch_v18_driver_pad_status_with_google_handoff(
    'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
  ) as sproull_bundle,
  (select pg_catalog.jsonb_agg(
     pg_catalog.to_jsonb(receipt) order by receipt.pad_id
   )
   from private_verification.brinesearch_v18_core_destination_releases receipt)
    as core_private,
  (select pg_catalog.jsonb_agg(
     pg_catalog.to_jsonb(projection) order by projection.pad_id
   )
   from public.brinesearch_driver_core_destination_releases_public projection)
    as core_public,
  (select pg_catalog.jsonb_agg(
     pg_catalog.to_jsonb(route) order by route.pad_id
   )
   from public.brinesearch_driver_google_routes_public route)
    as google_routes,
  (select pg_catalog.jsonb_agg(
     pg_catalog.to_jsonb(handoff) order by handoff.pad_id
   )
   from public.brinesearch_driver_google_handoffs_public handoff)
    as google_handoffs,
  (select pg_catalog.to_jsonb(release_state)
   from public.brinesearch_issue97_release_state release_state
   where release_state.singleton) as cutover_state,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(build)::text,'|' order by build.id
   ),''))
   from public.brinesearch_road_graph_builds build) as graph_digest,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     pg_catalog.to_jsonb(route)::text,'|' order by route.id
   ),''))
   from public.brinesearch_route_prep route) as route_digest
from pg_catalog.pg_proc wrapper
where wrapper.oid=
  'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
    pg_catalog.regprocedure;

do $preflight$
declare
  v_lasso jsonb;
  v_cologie jsonb;
  v_hamilton jsonb;
  v_sproull jsonb;
begin
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_named_approach_releases'
     ) is not null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_named_approach_releases_public'
     ) is not null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_named_approach_release_receipt_active(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
        'public.brinesearch_v18_driver_named_approaches(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'
     ) is not null then
    raise exception 'Named-approach contract already exists';
  end if;

  if not exists(
    select 1
    from pg_catalog.pg_proc proc
    join pg_catalog.pg_language language on language.oid=proc.prolang
    join pg_catalog.pg_roles owner_role on owner_role.oid=proc.proowner
    where proc.oid=
      'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
        pg_catalog.regprocedure
      and language.lanname='sql'
      and proc.provolatile='s'
      and proc.prosecdef
      and not proc.proisstrict
      and owner_role.rolbypassrls
      and proc.proconfig @> array[
        'search_path=""','statement_timeout=20s','lock_timeout=500ms'
      ]::text[]
      and not pg_catalog.has_function_privilege(
        'public',proc.oid,'execute'
      )
      and pg_catalog.has_function_privilege('anon',proc.oid,'execute')
      and pg_catalog.has_function_privilege(
        'authenticated',proc.oid,'execute'
      )
      and pg_catalog.has_function_privilege(
        'service_role',proc.oid,'execute'
      )
  ) then
    raise exception 'Atomic driver wrapper starting metadata diverged';
  end if;

  if (select count(*)
      from private_verification.brinesearch_v18_core_destination_releases)<>3
     or (select count(*)
         from private_verification.brinesearch_v18_core_destination_releases
         where revoked_at is null)<>1
     or (select count(*)
         from private_verification.brinesearch_v18_core_destination_releases
         where pad_id in (
           'b9a8e55c-3583-4019-85fc-54a03d420ace',
           'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
         ) and release_version='v18-core-destination-v2'
           and revoked_at='2026-08-26T21:45:00Z'::timestamptz)<>2
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
          '518659d9-bca2-47b0-b294-3141ba679fc4'
        ) is not true
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
          'b9a8e55c-3583-4019-85fc-54a03d420ace'
        ) is distinct from false
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
          'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
        ) is distinct from false then
    raise exception 'LASSO or revoked Harrison core-release checkpoint diverged';
  end if;

  select lasso_bundle,cologie_bundle,hamilton_bundle,sproull_bundle
  into strict v_lasso,v_cologie,v_hamilton,v_sproull
  from tmp_v18_named_approach_before;

  if v_lasso#>>'{status,route,source}' is distinct from 'exact_graph_handoff'
     or v_lasso#>>'{coreDestinationRelease,releaseVersion}' is distinct from
          'v18-core-destination-v1'
     or coalesce(v_cologie#>>'{status,route,state}','')<>'ready'
     or coalesce(v_cologie#>>'{status,route,source}','')<>'exact_graph'
     or coalesce(v_cologie#>>'{status,graph,state}','')<>'active_current'
     or coalesce(v_cologie->'publicGoogleRoute','null'::jsonb)='null'::jsonb
     or coalesce(v_cologie->'publicGoogleHandoff','null'::jsonb)='null'::jsonb
     or v_hamilton#>>'{status,route,source}' is not distinct from
          'exact_graph_handoff'
     or coalesce(v_hamilton->'coreDestinationRelease','null'::jsonb)<>
          'null'::jsonb
     or v_sproull#>>'{status,route,source}' is not distinct from
          'exact_graph_handoff'
     or coalesce(v_sproull->'coreDestinationRelease','null'::jsonb)<>
          'null'::jsonb then
    raise exception 'LASSO, Cologie, or revoked Harrison driver checkpoint diverged';
  end if;
end
$preflight$;

create function
  private_verification.brinesearch_v18_named_approach_has_navigation_link(
    p_value jsonb
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
  v_key text;
  v_child jsonb;
  v_text text;
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'object' then
      for v_key,v_child in
        select item.key,item.value
        from pg_catalog.jsonb_each(p_value) item(key,value)
      loop
        if v_key~*'(url|uri|link)' then
          return true;
        end if;
        if private_verification.brinesearch_v18_named_approach_has_navigation_link(
             v_child
           ) then
          return true;
        end if;
      end loop;
    when 'array' then
      for v_child in
        select item.value
        from pg_catalog.jsonb_array_elements(p_value) item(value)
      loop
        if private_verification.brinesearch_v18_named_approach_has_navigation_link(
             v_child
           ) then
          return true;
        end if;
      end loop;
    when 'string' then
      v_text:=p_value#>>array[]::text[];
      if v_text~*'([a-z][a-z0-9+.-]*://|geo:|google[.]navigation:|maps[.]google[.]|google[.]com/maps|maps[.]app[.]goo[.]gl|www[.])' then
        return true;
      end if;
    else
      null;
  end case;
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_named_approach_has_navigation_link(jsonb)
from public,anon,authenticated,service_role;

create function
  private_verification.brinesearch_v18_named_approach_waypoints_valid(
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
     or pg_catalog.jsonb_array_length(p_waypoints) not between 1 and 3 then
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
       or (v_waypoint->>'longitude')::numeric not between -180 and 180 then
      return false;
    end if;
    if v_seen @> pg_catalog.jsonb_build_array(v_waypoint) then
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
  private_verification.brinesearch_v18_named_approach_waypoints_valid(jsonb)
from public,anon,authenticated,service_role;

create table private_verification.brinesearch_v18_named_approach_releases (
  release_id uuid primary key,
  pad_id uuid not null references public.pads(id) on update restrict on delete restrict,
  approach_key text not null,
  approach_label text not null,
  route_group text not null,
  variant_index integer not null,
  release_version text not null,
  route_prep_id uuid not null
    references public.brinesearch_route_prep(id) on update restrict on delete restrict,
  source_sequence text not null,
  source_sequence_hash text not null,
  route_revision bigint not null,
  route_receipt_digest text not null,
  graph_build_id uuid not null
    references public.brinesearch_road_graph_builds(id)
    on update restrict on delete restrict,
  graph_digest text not null,
  steps jsonb not null,
  geometry jsonb not null,
  ingress jsonb not null,
  core_end jsonb not null,
  destination jsonb not null,
  final_leg_mode text not null,
  handoff jsonb not null,
  last_verified_at timestamptz not null,
  status_revision text not null,
  evidence jsonb not null,
  release_digest text not null,
  published_at timestamptz not null,
  revoked_at timestamptz,
  constraint named_approach_private_key_check check(
    approach_key~'^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint named_approach_private_label_check check(
    approach_label=pg_catalog.btrim(approach_label)
    and pg_catalog.length(approach_label) between 1 and 120
  ),
  constraint named_approach_private_route_check check(
    route_group in ('primary','alternate') and variant_index>0
    and route_revision>0
  ),
  constraint named_approach_private_version_check check(
    release_version='v18-named-approach-v1'
  ),
  constraint named_approach_private_hash_check check(
    source_sequence_hash~'^[0-9a-f]{32}$'
    and pg_catalog.length(route_receipt_digest) in (32,64)
    and route_receipt_digest~'^[0-9a-f]+$'
    and pg_catalog.length(graph_digest) in (32,64)
    and graph_digest~'^[0-9a-f]+$'
    and status_revision~'^[0-9a-f]{32,64}$'
    and release_digest~'^[0-9a-f]{64}$'
  ),
  constraint named_approach_private_json_check check(
    pg_catalog.jsonb_typeof(steps)='array'
    and pg_catalog.jsonb_array_length(steps)>0
    and pg_catalog.jsonb_typeof(geometry)='object'
    and pg_catalog.jsonb_typeof(ingress)='object'
    and ingress ?& array['role','label','latitude','longitude']
    and (ingress-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(ingress->'role')='string'
    and ingress->>'role' is not distinct from 'exact_approved_ingress'
    and pg_catalog.jsonb_typeof(ingress->'label')='string'
    and pg_catalog.jsonb_typeof(ingress->'latitude')='number'
    and pg_catalog.jsonb_typeof(ingress->'longitude')='number'
    and (ingress->>'latitude')::numeric between -90 and 90
    and (ingress->>'longitude')::numeric between -180 and 180
    and pg_catalog.jsonb_typeof(core_end)='object'
    and core_end ?& array['role','label','latitude','longitude']
    and (core_end-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(core_end->'role')='string'
    and core_end->>'role' is not distinct from 'exact_approved_handoff'
    and pg_catalog.jsonb_typeof(core_end->'label')='string'
    and pg_catalog.jsonb_typeof(core_end->'latitude')='number'
    and pg_catalog.jsonb_typeof(core_end->'longitude')='number'
    and (core_end->>'latitude')::numeric between -90 and 90
    and (core_end->>'longitude')::numeric between -180 and 180
    and pg_catalog.jsonb_typeof(destination)='object'
    and destination ?& array['role','label','latitude','longitude']
    and (destination-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(destination->'role')='string'
    and destination->>'role' in ('driver_entrance','saved_pad_destination')
    and pg_catalog.jsonb_typeof(destination->'label')='string'
    and pg_catalog.jsonb_typeof(destination->'latitude')='number'
    and pg_catalog.jsonb_typeof(destination->'longitude')='number'
    and (destination->>'latitude')::numeric between -90 and 90
    and (destination->>'longitude')::numeric between -180 and 180
    and pg_catalog.jsonb_typeof(handoff)='object'
    and handoff ?& array['originMode','handoffMode','waypoints']
    and (handoff-array['originMode','handoffMode','waypoints']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(handoff->'originMode')='string'
    and handoff->>'originMode' is not distinct from
      'current_location_to_named_ingress'
    and pg_catalog.jsonb_typeof(handoff->'handoffMode')='string'
    and handoff->>'handoffMode' in ('full_geometry_endpoints','verified_compact')
    and private_verification.brinesearch_v18_named_approach_waypoints_valid(
          handoff->'waypoints'
        )
    and pg_catalog.jsonb_typeof(evidence)='object'
  ),
  constraint named_approach_private_mode_check check(
    (final_leg_mode is not distinct from 'full_approved_route'
      and destination->>'role' is not distinct from 'driver_entrance'
      and handoff->>'handoffMode' is not distinct from 'full_geometry_endpoints')
    or
    (final_leg_mode is not distinct from 'google_to_saved_gps_unapproved'
      and destination->>'role' is not distinct from 'saved_pad_destination'
      and handoff->>'handoffMode' is not distinct from 'verified_compact')
  ),
  constraint named_approach_private_link_check check(
    not private_verification.brinesearch_v18_named_approach_has_navigation_link(
      pg_catalog.jsonb_build_array(
        approach_key,approach_label,route_group,release_version,
        source_sequence,steps,geometry,ingress,core_end,destination,handoff,
        evidence
      )
    )
  ),
  constraint named_approach_private_revoke_check check(
    revoked_at is null or revoked_at>=published_at
  ),
  unique(pad_id,approach_key,release_version,route_revision)
);

create unique index brinesearch_v18_named_approach_active_pad_idx
on private_verification.brinesearch_v18_named_approach_releases(
  pad_id,approach_key,release_version
) where revoked_at is null;

alter table private_verification.brinesearch_v18_named_approach_releases
  enable row level security;
alter table private_verification.brinesearch_v18_named_approach_releases
  force row level security;
revoke all on table
  private_verification.brinesearch_v18_named_approach_releases
from public,anon,authenticated,service_role;

create table public.brinesearch_driver_named_approach_releases_public (
  release_id uuid primary key,
  pad_id uuid not null references public.pads(id) on update restrict on delete restrict,
  approach_key text not null,
  approach_label text not null,
  route_group text not null,
  variant_index integer not null,
  release_version text not null,
  route_revision bigint not null,
  steps jsonb not null,
  geometry jsonb not null,
  ingress jsonb not null,
  core_end jsonb not null,
  destination jsonb not null,
  final_leg_mode text not null,
  handoff jsonb not null,
  last_verified_at timestamptz not null,
  status_revision text not null,
  release_digest text not null,
  published_at timestamptz not null,
  constraint named_approach_public_key_check check(
    approach_key~'^[a-z0-9][a-z0-9_-]{0,63}$'
  ),
  constraint named_approach_public_label_check check(
    approach_label=pg_catalog.btrim(approach_label)
    and pg_catalog.length(approach_label) between 1 and 120
  ),
  constraint named_approach_public_route_check check(
    route_group in ('primary','alternate') and variant_index>0
    and route_revision>0
  ),
  constraint named_approach_public_version_check check(
    release_version='v18-named-approach-v1'
  ),
  constraint named_approach_public_hash_check check(
    status_revision~'^[0-9a-f]{32,64}$'
    and release_digest~'^[0-9a-f]{64}$'
  ),
  constraint named_approach_public_json_check check(
    pg_catalog.jsonb_typeof(steps)='array'
    and pg_catalog.jsonb_array_length(steps)>0
    and pg_catalog.jsonb_typeof(geometry)='object'
    and pg_catalog.jsonb_typeof(ingress)='object'
    and ingress ?& array['role','label','latitude','longitude']
    and (ingress-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(ingress->'role')='string'
    and ingress->>'role' is not distinct from 'exact_approved_ingress'
    and pg_catalog.jsonb_typeof(ingress->'label')='string'
    and pg_catalog.jsonb_typeof(ingress->'latitude')='number'
    and pg_catalog.jsonb_typeof(ingress->'longitude')='number'
    and (ingress->>'latitude')::numeric between -90 and 90
    and (ingress->>'longitude')::numeric between -180 and 180
    and pg_catalog.jsonb_typeof(core_end)='object'
    and core_end ?& array['role','label','latitude','longitude']
    and (core_end-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(core_end->'role')='string'
    and core_end->>'role' is not distinct from 'exact_approved_handoff'
    and pg_catalog.jsonb_typeof(core_end->'label')='string'
    and pg_catalog.jsonb_typeof(core_end->'latitude')='number'
    and pg_catalog.jsonb_typeof(core_end->'longitude')='number'
    and (core_end->>'latitude')::numeric between -90 and 90
    and (core_end->>'longitude')::numeric between -180 and 180
    and pg_catalog.jsonb_typeof(destination)='object'
    and destination ?& array['role','label','latitude','longitude']
    and (destination-array['role','label','latitude','longitude']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(destination->'role')='string'
    and destination->>'role' in ('driver_entrance','saved_pad_destination')
    and pg_catalog.jsonb_typeof(destination->'label')='string'
    and pg_catalog.jsonb_typeof(destination->'latitude')='number'
    and pg_catalog.jsonb_typeof(destination->'longitude')='number'
    and (destination->>'latitude')::numeric between -90 and 90
    and (destination->>'longitude')::numeric between -180 and 180
    and pg_catalog.jsonb_typeof(handoff)='object'
    and handoff ?& array['originMode','handoffMode','waypoints']
    and (handoff-array['originMode','handoffMode','waypoints']::text[])='{}'::jsonb
    and pg_catalog.jsonb_typeof(handoff->'originMode')='string'
    and handoff->>'originMode' is not distinct from
      'current_location_to_named_ingress'
    and pg_catalog.jsonb_typeof(handoff->'handoffMode')='string'
    and handoff->>'handoffMode' in ('full_geometry_endpoints','verified_compact')
    and private_verification.brinesearch_v18_named_approach_waypoints_valid(
          handoff->'waypoints'
        )
  ),
  constraint named_approach_public_mode_check check(
    (final_leg_mode is not distinct from 'full_approved_route'
      and destination->>'role' is not distinct from 'driver_entrance'
      and handoff->>'handoffMode' is not distinct from 'full_geometry_endpoints')
    or
    (final_leg_mode is not distinct from 'google_to_saved_gps_unapproved'
      and destination->>'role' is not distinct from 'saved_pad_destination'
      and handoff->>'handoffMode' is not distinct from 'verified_compact')
  ),
  constraint named_approach_public_link_check check(
    not private_verification.brinesearch_v18_named_approach_has_navigation_link(
      pg_catalog.jsonb_build_array(
        approach_key,approach_label,route_group,release_version,
        steps,geometry,ingress,core_end,destination,handoff
      )
    )
  ),
  unique(pad_id,approach_key,release_version,route_revision)
);

create index brinesearch_driver_named_approach_pad_idx
on public.brinesearch_driver_named_approach_releases_public(
  pad_id,approach_key
);

alter table public.brinesearch_driver_named_approach_releases_public
  enable row level security;
alter table public.brinesearch_driver_named_approach_releases_public
  force row level security;
revoke all on table public.brinesearch_driver_named_approach_releases_public
from public,anon,authenticated,service_role;

create function
  private_verification.brinesearch_v18_named_approach_private_immutable()
returns trigger
language plpgsql
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
begin
  if tg_op='DELETE' then
    raise exception 'Immutable named-approach release cannot be deleted';
  end if;
  if old.revoked_at is null
     and new.revoked_at is not null
     and (pg_catalog.to_jsonb(new)-'revoked_at')=
         (pg_catalog.to_jsonb(old)-'revoked_at') then
    return new;
  end if;
  raise exception 'Immutable named-approach release permits one-way revocation only';
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_named_approach_private_immutable()
from public,anon,authenticated,service_role;

create trigger brinesearch_v18_named_approach_private_immutable
before update or delete
on private_verification.brinesearch_v18_named_approach_releases
for each row execute function
  private_verification.brinesearch_v18_named_approach_private_immutable();

create function
  private_verification.brinesearch_v18_named_approach_public_immutable()
returns trigger
language plpgsql
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
begin
  raise exception 'Published named-approach release cannot be changed or deleted';
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_named_approach_public_immutable()
from public,anon,authenticated,service_role;

create trigger brinesearch_v18_named_approach_public_immutable
before update or delete
on public.brinesearch_driver_named_approach_releases_public
for each row execute function
  private_verification.brinesearch_v18_named_approach_public_immutable();

create function
  private_verification.brinesearch_v18_named_approach_release_digest(
    p_release private_verification.brinesearch_v18_named_approach_releases
  )
returns text
language sql
immutable
strict
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'releaseId',(p_release).release_id,
          'padId',(p_release).pad_id,
          'approachKey',(p_release).approach_key,
          'approachLabel',(p_release).approach_label,
          'routeGroup',(p_release).route_group,
          'variantIndex',(p_release).variant_index,
          'releaseVersion',(p_release).release_version,
          'routePrepId',(p_release).route_prep_id,
          'sourceSequence',(p_release).source_sequence,
          'sourceSequenceHash',(p_release).source_sequence_hash,
          'routeRevision',(p_release).route_revision,
          'routeReceiptDigest',(p_release).route_receipt_digest,
          'graphBuildId',(p_release).graph_build_id,
          'graphDigest',(p_release).graph_digest,
          'steps',(p_release).steps,
          'geometry',(p_release).geometry,
          'ingress',(p_release).ingress,
          'coreEnd',(p_release).core_end,
          'destination',(p_release).destination,
          'finalLegMode',(p_release).final_leg_mode,
          'handoff',(p_release).handoff,
          'lastVerifiedAt',(p_release).last_verified_at,
          'statusRevision',(p_release).status_revision,
          'evidence',(p_release).evidence,
          'publishedAt',(p_release).published_at
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$function$;

revoke all on function
  private_verification.brinesearch_v18_named_approach_release_digest(
    private_verification.brinesearch_v18_named_approach_releases
  )
from public,anon,authenticated,service_role;

create function
  private_verification.brinesearch_v18_named_approach_release_receipt_active(
    p_release_id uuid
  )
returns boolean
language plpgsql
stable
strict
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
declare
  v_private private_verification.brinesearch_v18_named_approach_releases%rowtype;
  v_public public.brinesearch_driver_named_approach_releases_public%rowtype;
begin
  select * into v_private
  from private_verification.brinesearch_v18_named_approach_releases receipt
  where receipt.release_id=p_release_id;
  if not found or v_private.revoked_at is not null then
    return false;
  end if;
  if private_verification.brinesearch_v18_named_approach_release_digest(
       v_private
     ) is distinct from v_private.release_digest
     or private_verification.brinesearch_v18_named_approach_has_navigation_link(
          pg_catalog.jsonb_build_array(
            v_private.steps,v_private.geometry,v_private.ingress,
            v_private.core_end,v_private.destination,v_private.handoff
          )
        ) then
    return false;
  end if;

  if not exists(
       select 1
       from public.brinesearch_road_graph_builds build
       where build.id=v_private.graph_build_id
         and build.status='active'
         and build.graph_digest is not distinct from v_private.graph_digest
     )
     or not exists(
       select 1
       from public.brinesearch_route_prep route
       where route.id=v_private.route_prep_id
         and route.active
         and route.pad_id is not distinct from v_private.pad_id
         and route.source_sequence is not distinct from v_private.source_sequence
         and route.source_sequence_hash is not distinct from
           v_private.source_sequence_hash
     ) then
    return false;
  end if;

  select * into v_public
  from public.brinesearch_driver_named_approach_releases_public projection
  where projection.release_id=p_release_id;
  if not found
     or v_public.pad_id is distinct from v_private.pad_id
     or v_public.approach_key is distinct from v_private.approach_key
     or v_public.approach_label is distinct from v_private.approach_label
     or v_public.route_group is distinct from v_private.route_group
     or v_public.variant_index is distinct from v_private.variant_index
     or v_public.release_version is distinct from v_private.release_version
     or v_public.route_revision is distinct from v_private.route_revision
     or v_public.steps is distinct from v_private.steps
     or v_public.geometry is distinct from v_private.geometry
     or v_public.ingress is distinct from v_private.ingress
     or v_public.core_end is distinct from v_private.core_end
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
  private_verification.brinesearch_v18_named_approach_release_receipt_active(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_named_approach_release_receipt_active(uuid) is
'Immutable private/public receipt gate. Its live dependency portion is exactly two primary-key lookups: the pinned graph remains active with the pinned digest, and the pinned route row remains active and byte-matched. It does not rebuild a graph, reconcile a route, recompute graph currentness, or create a navigation link on driver reads.';

create function public.brinesearch_v18_driver_named_approaches(p_pad_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
set statement_timeout='2s'
set lock_timeout='500ms'
as $function$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'approachKey',projection.approach_key,
        'approachLabel',projection.approach_label,
        'routeGroup',projection.route_group,
        'variantIndex',projection.variant_index,
        'releaseVersion',projection.release_version,
        'routeRevision',projection.route_revision,
        'steps',projection.steps,
        'geometry',projection.geometry,
        'ingress',pg_catalog.jsonb_build_object(
          'role','exact_approved_ingress',
          'label',projection.ingress->>'label',
          'latitude',projection.ingress->'latitude',
          'longitude',projection.ingress->'longitude'
        ),
        'coreEnd',pg_catalog.jsonb_build_object(
          'role','exact_approved_handoff',
          'label',projection.core_end->>'label',
          'latitude',projection.core_end->'latitude',
          'longitude',projection.core_end->'longitude'
        ),
        'destination',pg_catalog.jsonb_build_object(
          'role',projection.destination->>'role',
          'label',projection.destination->>'label',
          'latitude',projection.destination->'latitude',
          'longitude',projection.destination->'longitude'
        ),
        'finalLegMode',projection.final_leg_mode,
        'handoff',pg_catalog.jsonb_build_object(
          'originMode','current_location_to_named_ingress',
          'handoffMode',projection.handoff->>'handoffMode',
          'waypoints',(
            select coalesce(
              pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'latitude',waypoint.value->'latitude',
                  'longitude',waypoint.value->'longitude'
                ) order by waypoint.ordinality
              ),
              '[]'::jsonb
            )
            from pg_catalog.jsonb_array_elements(
              projection.handoff->'waypoints'
            ) with ordinality as waypoint(value,ordinality)
          )
        ),
        'lastVerifiedAt',projection.last_verified_at,
        'statusRevision',projection.status_revision,
        'releaseDigest',projection.release_digest,
        'publishedAt',projection.published_at
      ) order by projection.approach_key,projection.variant_index
    ),
    '[]'::jsonb
  )
  from public.brinesearch_driver_named_approach_releases_public projection
  where projection.pad_id=p_pad_id
    and private_verification.brinesearch_v18_named_approach_release_receipt_active(
          projection.release_id
        )
$function$;

revoke all on function public.brinesearch_v18_driver_named_approaches(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_driver_named_approaches(uuid)
to service_role;

comment on function public.brinesearch_v18_driver_named_approaches(uuid) is
'Service-role diagnostic projection of sanitized immutable named approaches for one pad. Returns no private evidence or stored navigation link. Driver clients receive revision-bound rows only through the atomic status wrapper.';

create function
  public.brinesearch_v18_driver_pad_status_with_named_approaches(p_pad_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
set statement_timeout='20s'
set lock_timeout='500ms'
as $function$
  with base as materialized (
    select public.brinesearch_v18_driver_pad_status_with_google_handoff(p_pad_id)
      as value
  ), approaches as materialized (
    select public.brinesearch_v18_driver_named_approaches(p_pad_id) as value
  )
  select case
    when base.value is null then null
    else pg_catalog.jsonb_set(
      base.value,
      '{namedApproaches}',
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            approach.value order by approach.ordinality
          )
          from pg_catalog.jsonb_array_elements(approaches.value)
            with ordinality as approach(value,ordinality)
          where approach.value->>'statusRevision'=
            base.value#>>'{status,statusRevision}'
        ),
        '[]'::jsonb
      ),
      true
    )
  end
  from base cross join approaches
$function$;

revoke all on function
  public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)
to anon,authenticated,service_role;

comment on function
  public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid) is
'Additive atomic V18 driver envelope plus sanitized immutable namedApproaches. The existing status/Google wrapper remains byte-identical and independently callable.';

do $postflight$
declare
  v_before tmp_v18_named_approach_before%rowtype;
  v_wrapper pg_catalog.pg_proc%rowtype;
  v_rpc pg_catalog.pg_proc%rowtype;
  v_gate pg_catalog.pg_proc%rowtype;
  v_existing pg_catalog.pg_proc%rowtype;
  v_definition text;
  v_compact_definition text;
  v_pad_id uuid;
  v_before_bundle jsonb;
  v_after_bundle jsonb;
begin
  select * into strict v_before from tmp_v18_named_approach_before;

  if (select count(*)
      from private_verification.brinesearch_v18_named_approach_releases)<>0
     or (select count(*)
         from public.brinesearch_driver_named_approach_releases_public)<>0 then
    raise exception 'Infrastructure migration unexpectedly published an approach';
  end if;

  select * into strict v_wrapper from pg_catalog.pg_proc
  where oid=
    'public.brinesearch_v18_driver_pad_status_with_named_approaches(uuid)'::
      pg_catalog.regprocedure;
  select * into strict v_rpc from pg_catalog.pg_proc
  where oid='public.brinesearch_v18_driver_named_approaches(uuid)'::
    pg_catalog.regprocedure;
  select * into strict v_gate from pg_catalog.pg_proc
  where oid=
    'private_verification.brinesearch_v18_named_approach_release_receipt_active(uuid)'::
      pg_catalog.regprocedure;
  select * into strict v_existing from pg_catalog.pg_proc
  where oid=
    'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
      pg_catalog.regprocedure;

  if not v_wrapper.prosecdef or v_wrapper.provolatile<>'s'
     or not v_rpc.prosecdef or v_rpc.provolatile<>'s'
     or not v_gate.prosecdef or v_gate.provolatile<>'s'
     or v_wrapper.proisstrict or v_rpc.proisstrict or not v_gate.proisstrict
     or (select language.lanname from pg_catalog.pg_language language
         where language.oid=v_wrapper.prolang)<>'sql'
     or (select language.lanname from pg_catalog.pg_language language
         where language.oid=v_rpc.prolang)<>'sql'
     or (select language.lanname from pg_catalog.pg_language language
         where language.oid=v_gate.prolang)<>'plpgsql'
     or not exists(
          select 1 from pg_catalog.pg_roles owner_role
          where owner_role.oid=v_wrapper.proowner and owner_role.rolbypassrls
        )
     or not exists(
          select 1 from pg_catalog.pg_roles owner_role
          where owner_role.oid=v_rpc.proowner and owner_role.rolbypassrls
        )
     or not exists(
          select 1 from pg_catalog.pg_roles owner_role
          where owner_role.oid=v_gate.proowner and owner_role.rolbypassrls
        )
     or not (v_wrapper.proconfig @> array[
          'search_path=""','statement_timeout=20s','lock_timeout=500ms'
        ]::text[])
     or not (v_rpc.proconfig @> array[
          'search_path=""','statement_timeout=2s','lock_timeout=500ms'
        ]::text[])
     or not (v_gate.proconfig @> array[
          'search_path=""','statement_timeout=1s','lock_timeout=500ms'
        ]::text[])
     or pg_catalog.has_function_privilege('public',v_wrapper.oid,'execute')
     or not pg_catalog.has_function_privilege('anon',v_wrapper.oid,'execute')
     or not pg_catalog.has_function_privilege(
          'authenticated',v_wrapper.oid,'execute'
        )
     or not pg_catalog.has_function_privilege(
          'service_role',v_wrapper.oid,'execute'
        )
     or pg_catalog.has_function_privilege('public',v_rpc.oid,'execute')
     or pg_catalog.has_function_privilege('anon',v_rpc.oid,'execute')
     or pg_catalog.has_function_privilege(
          'authenticated',v_rpc.oid,'execute'
        )
     or not pg_catalog.has_function_privilege(
          'service_role',v_rpc.oid,'execute'
        )
     or pg_catalog.has_function_privilege('public',v_gate.oid,'execute')
     or pg_catalog.has_function_privilege('anon',v_gate.oid,'execute')
     or pg_catalog.has_function_privilege(
          'authenticated',v_gate.oid,'execute'
        )
     or pg_catalog.has_function_privilege(
          'service_role',v_gate.oid,'execute'
        ) then
    raise exception 'Named-approach function hardening or grants diverged';
  end if;

  if v_existing.prosrc is distinct from v_before.wrapper_prosrc
     or v_existing.prolang is distinct from v_before.wrapper_prolang
     or v_existing.provolatile is distinct from v_before.wrapper_provolatile
     or v_existing.prosecdef is distinct from v_before.wrapper_prosecdef
     or v_existing.proisstrict is distinct from v_before.wrapper_proisstrict
     or v_existing.proconfig is distinct from v_before.wrapper_proconfig
     or v_existing.proowner is distinct from v_before.wrapper_proowner
     or v_existing.proacl is distinct from v_before.wrapper_proacl then
    raise exception 'Existing atomic driver wrapper changed';
  end if;

  v_definition:=pg_catalog.lower(pg_catalog.pg_get_functiondef(v_wrapper.oid));
  v_compact_definition:=pg_catalog.regexp_replace(v_definition,'\s+','','g');
  if pg_catalog.strpos(
       v_definition,
       'brinesearch_v18_driver_pad_status_with_google_handoff'
     )=0
     or pg_catalog.strpos(
          v_definition,
          'brinesearch_v18_driver_named_approaches'
        )=0
     or pg_catalog.strpos(v_definition,'''{namedapproaches}''')=0
     or pg_catalog.strpos(
          v_compact_definition,
          'approach.value->>''statusrevision''=base.value#>>''{status,statusrevision}'''
        )=0 then
    raise exception 'Additive named-approach wrapper shape diverged';
  end if;

  v_definition:=pg_catalog.lower(pg_catalog.pg_get_functiondef(v_rpc.oid));
  if pg_catalog.strpos(v_definition,'''approachkey''')=0
     or pg_catalog.strpos(v_definition,'''approachlabel''')=0
     or pg_catalog.strpos(v_definition,'''releaseversion''')=0
     or pg_catalog.strpos(v_definition,'''routesteps''')<>0
     or pg_catalog.strpos(v_definition,'''url''')<>0
     or pg_catalog.strpos(v_definition,'http://')<>0
     or pg_catalog.strpos(v_definition,'https://')<>0
     or pg_catalog.strpos(v_definition,'brinesearch_driver_google_routes_public')<>0
     or pg_catalog.strpos(v_definition,'brinesearch_issue97_release_state')<>0 then
    raise exception 'Sanitized public named-approach RPC shape diverged';
  end if;

  if not exists(
       select 1 from pg_catalog.pg_class relation
       where relation.oid=
         'private_verification.brinesearch_v18_named_approach_releases'::
           pg_catalog.regclass
         and relation.relrowsecurity and relation.relforcerowsecurity
     )
     or not exists(
       select 1 from pg_catalog.pg_class relation
       where relation.oid=
         'public.brinesearch_driver_named_approach_releases_public'::
           pg_catalog.regclass
         and relation.relrowsecurity and relation.relforcerowsecurity
     )
     or exists(
       select 1
       from (values
         ('public'),('anon'),('authenticated'),('service_role')
       ) role_name(name)
       cross join (values
         ('private_verification.brinesearch_v18_named_approach_releases'),
         ('public.brinesearch_driver_named_approach_releases_public')
       ) relation_name(name)
       cross join (values
         ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
         ('REFERENCES'),('TRIGGER')
       ) privilege_name(name)
       where pg_catalog.has_table_privilege(
         role_name.name,relation_name.name,privilege_name.name
       )
     ) then
    raise exception 'Named-approach table RLS or grants diverged';
  end if;

  foreach v_pad_id in array array[
    '518659d9-bca2-47b0-b294-3141ba679fc4'::uuid,
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid,
    'b9a8e55c-3583-4019-85fc-54a03d420ace'::uuid,
    'f5a82acf-d7c0-4ce3-ad4e-0de810551450'::uuid
  ] loop
    v_before_bundle:=case v_pad_id
      when '518659d9-bca2-47b0-b294-3141ba679fc4'::uuid then v_before.lasso_bundle
      when 'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid then v_before.cologie_bundle
      when 'b9a8e55c-3583-4019-85fc-54a03d420ace'::uuid then v_before.hamilton_bundle
      else v_before.sproull_bundle
    end;
    v_after_bundle:=
      public.brinesearch_v18_driver_pad_status_with_named_approaches(v_pad_id);
    if v_after_bundle->'namedApproaches' is distinct from '[]'::jsonb
       or (v_after_bundle-'namedApproaches') is distinct from v_before_bundle
       or public.brinesearch_v18_driver_pad_status_with_google_handoff(v_pad_id)
            is distinct from v_before_bundle
       or public.brinesearch_v18_driver_named_approaches(v_pad_id)
            is distinct from '[]'::jsonb then
      raise exception 'Existing driver envelope changed for %',v_pad_id;
    end if;
  end loop;

  if private_verification.brinesearch_v18_core_destination_release_receipt_active(
       '518659d9-bca2-47b0-b294-3141ba679fc4'
     ) is not true
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
          'b9a8e55c-3583-4019-85fc-54a03d420ace'
        ) is distinct from false
     or private_verification.brinesearch_v18_core_destination_release_receipt_active(
          'f5a82acf-d7c0-4ce3-ad4e-0de810551450'
        ) is distinct from false
     or (select pg_catalog.jsonb_agg(
           pg_catalog.to_jsonb(receipt) order by receipt.pad_id
         )
         from private_verification.brinesearch_v18_core_destination_releases receipt)
          is distinct from v_before.core_private
     or (select pg_catalog.jsonb_agg(
           pg_catalog.to_jsonb(projection) order by projection.pad_id
         )
         from public.brinesearch_driver_core_destination_releases_public projection)
          is distinct from v_before.core_public then
    raise exception 'LASSO or revoked HAMILTON/SPROULL releases changed';
  end if;

  if (select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(route) order by route.pad_id
      ) from public.brinesearch_driver_google_routes_public route)
       is distinct from v_before.google_routes
     or (select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(handoff) order by handoff.pad_id
        ) from public.brinesearch_driver_google_handoffs_public handoff)
       is distinct from v_before.google_handoffs
     or (select pg_catalog.to_jsonb(release_state)
         from public.brinesearch_issue97_release_state release_state
         where release_state.singleton) is distinct from v_before.cutover_state
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(build)::text,'|' order by build.id
        ),'')) from public.brinesearch_road_graph_builds build)
       is distinct from v_before.graph_digest
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          pg_catalog.to_jsonb(route)::text,'|' order by route.id
        ),'')) from public.brinesearch_route_prep route)
       is distinct from v_before.route_digest then
    raise exception 'Google, cutover, graph, or route authority changed';
  end if;
end
$postflight$;
