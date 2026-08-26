-- V18 released Google handoff snapshot.
--
-- A reviewed mobile handoff is a versioned release artifact. Reading it must
-- not recompute the road graph on every pad open. It remains available until
-- its private release receipt is explicitly revoked or its byte-identical
-- public projection is removed/replaced.

do $preflight$
begin
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_google_handoff_receipts'
     ) is null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_google_handoffs_public'
     ) is null then
    raise exception 'Reviewed Google handoff release tables are missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_google_handoff_release(uuid)'
     ) is not null then
    raise exception 'Released Google handoff RPC already exists';
  end if;
end
$preflight$;

create function public.brinesearch_v18_driver_google_handoff_release(
  p_pad_id uuid
)
returns jsonb
language sql
stable
strict
security definer
set search_path=''
set statement_timeout='1s'
set lock_timeout='500ms'
as $function$
  select pg_catalog.jsonb_build_object(
    'padId',projection.pad_id,
    'routeRevision',projection.route_revision,
    'sourceManifestDigest',projection.source_manifest_digest,
    'sourceDependencyDigest',projection.source_dependency_digest,
    'handoffVersion',projection.handoff_version,
    'handoff',projection.handoff,
    'handoffDigest',projection.handoff_digest,
    'publishedAt',projection.published_at
  )
  from public.brinesearch_driver_google_handoffs_public projection
  join private_verification.brinesearch_v18_google_handoff_receipts receipt
    on receipt.pad_id=projection.pad_id
   and receipt.route_revision=projection.route_revision
   and receipt.source_manifest_digest=projection.source_manifest_digest
   and receipt.source_dependency_digest=projection.source_dependency_digest
   and receipt.handoff_version=projection.handoff_version
   and receipt.handoff=projection.handoff
   and receipt.handoff_digest=projection.handoff_digest
   and receipt.verified_at=projection.published_at
   and receipt.revoked_at is null
  where projection.pad_id=p_pad_id
$function$;

revoke all on function
  public.brinesearch_v18_driver_google_handoff_release(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_driver_google_handoff_release(uuid)
to anon,authenticated,service_role;

comment on function
  public.brinesearch_v18_driver_google_handoff_release(uuid) is
'Returns only a byte-identical, explicitly reviewed V18 mobile handoff release. The release persists until explicit receipt revocation; it never derives a route, reads private evidence, or recomputes graph authority.';

do $verify_install$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_bannock constant uuid:='333598ca-37b3-4b44-9411-a490cc3da672';
  v_function pg_catalog.pg_proc%rowtype;
  v_owner_bypasses_rls boolean;
  v_definition text;
  v_release jsonb;
begin
  select proc.* into strict v_function
  from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_v18_driver_google_handoff_release(uuid)'::
      pg_catalog.regprocedure;

  select role.rolbypassrls into strict v_owner_bypasses_rls
  from pg_catalog.pg_roles role
  where role.oid=v_function.proowner;

  v_definition:=pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_function.oid)
  );
  if not v_function.prosecdef
     or not v_owner_bypasses_rls
     or v_function.provolatile<>'s'
     or not v_function.proisstrict
     or v_function.proconfig is distinct from
       array['search_path=""','statement_timeout=1s','lock_timeout=500ms']::text[]
     or pg_catalog.strpos(
       v_definition,
       'private_verification.brinesearch_v18_google_handoff_receipts'
     )=0
     or pg_catalog.strpos(
       v_definition,
       'public.brinesearch_driver_google_handoffs_public'
     )=0
     or pg_catalog.strpos(v_definition,'receipt.revoked_at is null')=0
     or pg_catalog.strpos(v_definition,'brinesearch_v18_google_handoff_current')>0
     or pg_catalog.strpos(v_definition,'brinesearch_issue97_google_route_current')>0 then
    raise exception 'Released Google handoff RPC definition drifted';
  end if;

  if pg_catalog.has_function_privilege(
       'public',
       'public.brinesearch_v18_driver_google_handoff_release(uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon',
       'public.brinesearch_v18_driver_google_handoff_release(uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.brinesearch_v18_driver_google_handoff_release(uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.brinesearch_v18_driver_google_handoff_release(uuid)',
       'execute'
     ) then
    raise exception 'Released Google handoff RPC grants drifted';
  end if;

  v_release:=public.brinesearch_v18_driver_google_handoff_release(v_cologie);
  if v_release is null
     or v_release->>'padId' is distinct from v_cologie::text
     or v_release->>'routeRevision' is distinct from '1'
     or v_release->>'sourceManifestDigest' is distinct from
       '08ec28f968ef6425f10a8170ec9fa36c'
     or v_release->>'sourceDependencyDigest' is distinct from
       'dba36e417e59b1746c2e3f09ae6d6980'
     or v_release->>'handoffVersion' is distinct from 'v18-google-mobile-v1'
     or v_release->>'handoffDigest' is distinct from
       '1901ff95730ac253f665d2c64a8be28a'
     or v_release->'handoff' is distinct from
       $cologie_handoff$
       {
         "pad_id":"e2b32e85-9e93-4388-8215-9d8167cbbeb8",
         "waypoints":[
           {"latitude":40.2376830710089,"sequence":1,"longitude":-80.9648236007351},
           {"latitude":40.2435207,"sequence":13,"longitude":-80.912831},
           {"latitude":40.250514,"sequence":15,"longitude":-80.9106604}
         ],
         "destination":{
           "pad_id":"e2b32e85-9e93-4388-8215-9d8167cbbeb8",
           "latitude":40.25403,
           "sequence":16,
           "longitude":-80.913577
         },
         "origin_mode":"current_location_until_route_ingress",
         "route_revision":1,
         "handoff_version":"v18-google-mobile-v1",
         "mobile_waypoint_limit":3,
         "source_manifest_digest":"08ec28f968ef6425f10a8170ec9fa36c",
         "source_dependency_digest":"dba36e417e59b1746c2e3f09ae6d6980"
       }
       $cologie_handoff$::jsonb then
    raise exception 'Cologie released Google handoff contract failed';
  end if;

  if public.brinesearch_v18_driver_google_handoff_release(v_bannock)
       is not null then
    raise exception 'Unreleased Bannock Google handoff became visible';
  end if;
end
$verify_install$;
