-- Correct only the Cologie atomic V18 handoff read. The installed wrapper is
-- SECURITY INVOKER, so anonymous reads evaluate each FORCE-RLS currentness
-- policy in addition to the wrapper's explicit currentness predicates. The
-- duplicate proofs exceed the runtime budget. SECURITY DEFINER deliberately
-- bypasses those duplicate RLS evaluations while both explicit predicates,
-- the strict output allowlists, and all authority data remain unchanged.
set lock_timeout='5s';
set statement_timeout='120s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:v18:cologie-atomic-google-handoff-performance',18
  )
);

do $preflight$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_status jsonb;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Cologie handoff correction requires global cutover to remain off';
  end if;
  if not exists(
       select 1
       from supabase_migrations.schema_migrations migration
       where migration.version='20260825225341'
         and migration.name='v18_cologie_verified_mobile_google_handoff'
     ) then
    raise exception 'Installed Cologie handoff migration is missing or drifted';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
     ))<>'568d9dc661706002e4f516399a1685d1'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_google_route_current(uuid)'::pg_catalog.regprocedure
     ))<>'a9c69f4757703025bd6d57b37521ccd8'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)'::pg_catalog.regprocedure
     ))<>'62bbb8947ee3b15be27e246bcbb8a061'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_google_handoff_current(uuid)'::pg_catalog.regprocedure
     ))<>'f9a48b2b6f1dcfed0cf8929f046ac2fd'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::pg_catalog.regprocedure
     ))<>'9c6f7da20d9dc035348c55ade12a8864' then
    raise exception 'Cologie status/currentness/wrapper definitions drifted';
  end if;
  if (select pg_catalog.count(*)
      from public.brinesearch_driver_google_routes_public)<>1
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_google_handoffs_public)<>1
     or (select pg_catalog.count(*)
         from private_verification.brinesearch_v18_google_handoff_receipts)<>1 then
    raise exception 'Cologie public route or compact handoff cardinality drifted';
  end if;
  if not exists(
       select 1
       from public.brinesearch_driver_google_routes_public route
       where route.pad_id=v_cologie
         and route.route_revision=1
         and route.manifest->>'manifest_digest'=
           '08ec28f968ef6425f10a8170ec9fa36c'
         and route.manifest->>'dependency_digest'=
           'dba36e417e59b1746c2e3f09ae6d6980'
         and pg_catalog.jsonb_array_length(route.manifest->'points')=16
     )
     or not exists(
       select 1
       from public.brinesearch_driver_google_handoffs_public handoff
       where handoff.pad_id=v_cologie
         and handoff.route_revision=1
         and handoff.source_manifest_digest=
           '08ec28f968ef6425f10a8170ec9fa36c'
         and handoff.source_dependency_digest=
           'dba36e417e59b1746c2e3f09ae6d6980'
         and handoff.handoff_digest=
           '1901ff95730ac253f665d2c64a8be28a'
     ) then
    raise exception 'Cologie exact route or reviewed handoff content drifted';
  end if;
  v_status:=public.brinesearch_v18_driver_pad_status(v_cologie);
  if v_status#>>'{route,state}' is distinct from 'ready'
     or v_status#>>'{route,source}' is distinct from 'exact_graph'
     or v_status#>>'{graph,state}' is distinct from 'active_current'
     or v_status#>>'{google,publicState}' is distinct from 'ready'
     or coalesce(pg_catalog.jsonb_array_length(
          v_status#>'{route,steps}'
        ),-1)<>5
     or coalesce(pg_catalog.jsonb_array_length(
          v_status#>'{route,geometry,features}'
        ),-1)<>5 then
    raise exception 'Cologie status is no longer exact-route ready';
  end if;
end
$preflight$;

create temporary table tmp_v18_cologie_atomic_handoff_baseline
on commit drop
as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select pg_catalog.count(*)
   from public.brinesearch_driver_google_routes_public) as public_google_count,
  (select pg_catalog.count(*)
   from public.brinesearch_driver_google_handoffs_public) as public_handoff_count,
  (select pg_catalog.count(*)
   from private_verification.brinesearch_v18_google_handoff_receipts)
    as private_handoff_count,
  (select pg_catalog.to_jsonb(route)
   from public.brinesearch_driver_google_routes_public route
   where route.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid)
    as public_google_row,
  (select route.xmin::text
   from public.brinesearch_driver_google_routes_public route
   where route.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid)
    as public_google_xmin,
  (select pg_catalog.to_jsonb(handoff)
   from public.brinesearch_driver_google_handoffs_public handoff
   where handoff.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid)
    as public_handoff_row,
  (select handoff.xmin::text
   from public.brinesearch_driver_google_handoffs_public handoff
   where handoff.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid)
    as public_handoff_xmin,
  (select pg_catalog.to_jsonb(receipt)
   from private_verification.brinesearch_v18_google_handoff_receipts receipt
   where receipt.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid)
    as private_handoff_row,
  (select receipt.xmin::text
   from private_verification.brinesearch_v18_google_handoff_receipts receipt
   where receipt.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid)
    as private_handoff_xmin,
  (select pg_catalog.to_jsonb(pad)
   from public.pads pad
   where pad.id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid)
    as pad_row,
  (select pg_catalog.to_jsonb(route)
   from public.brinesearch_route_prep route
   where route.id='dfb3f204-190c-4d65-85b3-16bcd1715825'::uuid)
    as route_row,
  (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
     build.id::text||':'||build.status||':'||coalesce(build.graph_digest,'')||':'||
       coalesce(build.source_revision_digest,''),
     '|' order by build.id
   ),''))
   from public.brinesearch_road_graph_builds build) as graph_digest,
  (
    public.brinesearch_v18_driver_pad_status(
      'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
    )-array['checkedAt','statusRevision']::text[]
  ) as driver_status;

create or replace function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(p_pad_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
set statement_timeout='20s'
set lock_timeout='500ms'
as $function$
  with driver as materialized (
    select public.brinesearch_v18_driver_pad_status(p_pad_id) as status
  ),
  gated as materialized (
    select
      driver.status,
      coalesce(driver.status#>>'{route,state}','')='ready'
        and coalesce(driver.status#>>'{route,source}','')='exact_graph'
        and coalesce(driver.status#>>'{graph,state}','')='active_current'
        and coalesce(driver.status#>>'{google,publicState}','')='ready'
        as release_ready
    from driver
  ),
  public_route as materialized (
    select pg_catalog.jsonb_build_object(
      'pad_id',route.pad_id,
      'route_revision',route.route_revision,
      'manifest',route.manifest
    ) as value
    from gated
    join public.brinesearch_driver_google_routes_public route
      on gated.release_ready
     and route.pad_id=p_pad_id
    where public.brinesearch_issue97_google_route_current(route.pad_id)
  ),
  public_handoff as materialized (
    select pg_catalog.jsonb_build_object(
      'pad_id',handoff.pad_id,
      'route_revision',handoff.route_revision,
      'source_manifest_digest',handoff.source_manifest_digest,
      'source_dependency_digest',handoff.source_dependency_digest,
      'handoff_version',handoff.handoff_version,
      'handoff',handoff.handoff,
      'handoff_digest',handoff.handoff_digest,
      'published_at',handoff.published_at
    ) as value
    from gated
    join public.brinesearch_driver_google_handoffs_public handoff
      on gated.release_ready
     and handoff.pad_id=p_pad_id
    where public.brinesearch_v18_google_handoff_current(handoff.pad_id)
  )
  select pg_catalog.jsonb_build_object(
    'status',gated.status,
    'publicGoogleRoute',(select value from public_route),
    'publicGoogleHandoff',(select value from public_handoff)
  )
  from gated
$function$;

revoke all on function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)
to anon,authenticated,service_role;

comment on function
  public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid) is
'Atomic V18 driver envelope. SECURITY DEFINER removes duplicate FORCE-RLS evaluation while both explicit currentness predicates and strict public allowlists remain unchanged.';

do $verify_install$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_bannock constant uuid:='333598ca-37b3-4b44-9411-a490cc3da672';
  v_baseline record;
  v_wrapper pg_catalog.pg_proc%rowtype;
  v_wrapper_definition text;
  v_bundle jsonb;
  v_held_bundle jsonb;
  v_missing_bundle jsonb;
begin
  select * into strict v_baseline
  from tmp_v18_cologie_atomic_handoff_baseline;
  select proc.* into strict v_wrapper
  from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
      pg_catalog.regprocedure;
  v_wrapper_definition:=pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_wrapper.oid)
  );

  if not v_wrapper.prosecdef
     or v_wrapper.provolatile<>'s'
     or v_wrapper.prolang is distinct from (
       select language.oid
       from pg_catalog.pg_language language
       where language.lanname='sql'
     )
     or (v_wrapper.proconfig @> array[
          'search_path=""','statement_timeout=20s','lock_timeout=500ms'
        ]::text[]) is distinct from true
     or pg_catalog.strpos(v_wrapper_definition,'private_verification.')<>0
     or pg_catalog.strpos(v_wrapper_definition,'execute ')<>0
     or pg_catalog.strpos(
          v_wrapper_definition,
          'public.brinesearch_v18_driver_pad_status('
        )=0
     or pg_catalog.strpos(
          v_wrapper_definition,
          'public.brinesearch_issue97_google_route_current('
        )=0
     or pg_catalog.strpos(
          v_wrapper_definition,
          'public.brinesearch_v18_google_handoff_current('
        )=0
     or pg_catalog.strpos(
          v_wrapper_definition,
          'public.brinesearch_driver_google_routes_public'
        )=0
     or pg_catalog.strpos(
          v_wrapper_definition,
          'public.brinesearch_driver_google_handoffs_public'
        )=0
     or not exists(
       select 1
       from pg_catalog.pg_roles owner
       where owner.oid=v_wrapper.proowner and owner.rolbypassrls
     ) then
    raise exception 'Corrected atomic handoff wrapper is not hardened';
  end if;
  if pg_catalog.has_function_privilege('public',v_wrapper.oid,'execute')
     or not pg_catalog.has_function_privilege('anon',v_wrapper.oid,'execute')
     or not pg_catalog.has_function_privilege(
          'authenticated',v_wrapper.oid,'execute'
        )
     or not pg_catalog.has_function_privilege(
          'service_role',v_wrapper.oid,'execute'
        ) then
    raise exception 'Corrected atomic handoff wrapper grants drifted';
  end if;

  v_bundle:=public.brinesearch_v18_driver_pad_status_with_google_handoff(
    v_cologie
  );
  if pg_catalog.jsonb_typeof(v_bundle) is distinct from 'object'
     or not (v_bundle ?& array[
          'status','publicGoogleRoute','publicGoogleHandoff'
        ]::text[])
     or (v_bundle-array[
          'status','publicGoogleRoute','publicGoogleHandoff'
        ]::text[]) is distinct from '{}'::jsonb
     or ((v_bundle->'status')-array[
          'checkedAt','statusRevision'
        ]::text[]) is distinct from v_baseline.driver_status
     or v_bundle#>>'{status,route,state}' is distinct from 'ready'
     or v_bundle#>>'{status,route,source}' is distinct from 'exact_graph'
     or v_bundle#>>'{status,graph,state}' is distinct from 'active_current'
     or v_bundle#>>'{status,google,publicState}' is distinct from 'ready'
     or v_bundle#>>'{publicGoogleRoute,pad_id}' is distinct from v_cologie::text
     or v_bundle#>>'{publicGoogleRoute,route_revision}' is distinct from '1'
     or v_bundle#>>'{publicGoogleRoute,manifest,manifest_digest}'
          is distinct from '08ec28f968ef6425f10a8170ec9fa36c'
     or v_bundle#>>'{publicGoogleRoute,manifest,dependency_digest}'
          is distinct from 'dba36e417e59b1746c2e3f09ae6d6980'
     or coalesce(pg_catalog.jsonb_array_length(
          v_bundle#>'{publicGoogleRoute,manifest,points}'
        ),-1)<>16
     or v_bundle#>>'{publicGoogleHandoff,pad_id}' is distinct from v_cologie::text
     or v_bundle#>>'{publicGoogleHandoff,handoff_digest}'
          is distinct from '1901ff95730ac253f665d2c64a8be28a'
     or v_bundle#>>'{publicGoogleHandoff,handoff,waypoints,0,sequence}'
          is distinct from '1'
     or v_bundle#>>'{publicGoogleHandoff,handoff,waypoints,1,sequence}'
          is distinct from '13'
     or v_bundle#>>'{publicGoogleHandoff,handoff,waypoints,2,sequence}'
          is distinct from '15'
     or v_bundle#>>'{publicGoogleHandoff,handoff,destination,sequence}'
          is distinct from '16'
     or v_bundle#>>'{publicGoogleHandoff,handoff,destination,pad_id}'
          is distinct from v_cologie::text then
    raise exception 'Corrected atomic Cologie handoff envelope is unsafe';
  end if;

  v_held_bundle:=
    public.brinesearch_v18_driver_pad_status_with_google_handoff(v_bannock);
  if pg_catalog.jsonb_typeof(v_held_bundle->'status') is distinct from 'object'
     or v_held_bundle#>>'{status,route,state}'='ready'
     or v_held_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_held_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'Corrected atomic handoff wrapper did not fail closed for held Bannock';
  end if;

  v_missing_bundle:=
    public.brinesearch_v18_driver_pad_status_with_google_handoff(
      '00000000-0000-0000-0000-000000000000'::uuid
    );
  if v_missing_bundle->'status' is distinct from 'null'::jsonb
     or v_missing_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_missing_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'Corrected atomic handoff wrapper did not fail closed for a missing pad';
  end if;

  if public.brinesearch_issue97_cutover_active()
       is distinct from v_baseline.cutover_active
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_google_routes_public)
          is distinct from v_baseline.public_google_count
     or (select pg_catalog.count(*)
         from public.brinesearch_driver_google_handoffs_public)
          is distinct from v_baseline.public_handoff_count
     or (select pg_catalog.count(*)
         from private_verification.brinesearch_v18_google_handoff_receipts)
          is distinct from v_baseline.private_handoff_count
     or (select pg_catalog.to_jsonb(route)
         from public.brinesearch_driver_google_routes_public route
         where route.pad_id=v_cologie)
          is distinct from v_baseline.public_google_row
     or (select route.xmin::text
         from public.brinesearch_driver_google_routes_public route
         where route.pad_id=v_cologie)
          is distinct from v_baseline.public_google_xmin
     or (select pg_catalog.to_jsonb(handoff)
         from public.brinesearch_driver_google_handoffs_public handoff
         where handoff.pad_id=v_cologie)
          is distinct from v_baseline.public_handoff_row
     or (select handoff.xmin::text
         from public.brinesearch_driver_google_handoffs_public handoff
         where handoff.pad_id=v_cologie)
          is distinct from v_baseline.public_handoff_xmin
     or (select pg_catalog.to_jsonb(receipt)
         from private_verification.brinesearch_v18_google_handoff_receipts receipt
         where receipt.pad_id=v_cologie)
          is distinct from v_baseline.private_handoff_row
     or (select receipt.xmin::text
         from private_verification.brinesearch_v18_google_handoff_receipts receipt
         where receipt.pad_id=v_cologie)
          is distinct from v_baseline.private_handoff_xmin
     or (select pg_catalog.to_jsonb(pad)
         from public.pads pad where pad.id=v_cologie)
          is distinct from v_baseline.pad_row
     or (select pg_catalog.to_jsonb(route)
         from public.brinesearch_route_prep route
         where route.id='dfb3f204-190c-4d65-85b3-16bcd1715825'::uuid)
          is distinct from v_baseline.route_row
     or (select pg_catalog.md5(coalesce(pg_catalog.string_agg(
          build.id::text||':'||build.status||':'||coalesce(build.graph_digest,'')||':'||
            coalesce(build.source_revision_digest,''),
          '|' order by build.id
        ),''))
        from public.brinesearch_road_graph_builds build)
          is distinct from v_baseline.graph_digest then
    raise exception 'Atomic handoff correction changed protected authority data';
  end if;
  if exists(
       select 1
       from pg_catalog.pg_stat_xact_user_tables stats
       where stats.schemaname in ('public','private_verification')
         and stats.n_tup_ins+stats.n_tup_upd+stats.n_tup_del>0
     ) then
    raise exception 'Atomic handoff correction performed production user-table DML';
  end if;
end
$verify_install$;

set local role anon;
do $verify_anon$
declare
  v_bundle jsonb;
begin
  v_bundle:=public.brinesearch_v18_driver_pad_status_with_google_handoff(
    'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  );
  if v_bundle#>>'{status,route,state}' is distinct from 'ready'
     or v_bundle#>>'{status,route,source}' is distinct from 'exact_graph'
     or v_bundle#>>'{status,graph,state}' is distinct from 'active_current'
     or v_bundle#>>'{status,google,publicState}' is distinct from 'ready'
     or v_bundle#>>'{publicGoogleRoute,pad_id}'
          is distinct from 'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
     or v_bundle#>>'{publicGoogleHandoff,pad_id}'
          is distinct from 'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
     or v_bundle#>>'{publicGoogleHandoff,handoff_digest}'
          is distinct from '1901ff95730ac253f665d2c64a8be28a' then
    raise exception 'Anonymous V18 client cannot read the corrected atomic Cologie handoff';
  end if;
end
$verify_anon$;
reset role;
