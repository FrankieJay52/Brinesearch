-- Cologie's complete 16-point Issue #97 manifest remains the route authority.
-- This migration adds a separate, receipt-bound mobile handoff containing only
-- three reviewed control points plus the exact saved pad destination. It does
-- not change the route, graph, Google manifest, global cutover, or pad data.
set lock_timeout='5s';
set statement_timeout='120s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(
    'brinesearch:v18:cologie-verified-mobile-google-handoff',18
  )
);

do $preflight$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_manifest jsonb;
  v_status jsonb;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Cologie mobile handoff requires global Issue #97 cutover to remain off';
  end if;
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_google_handoff_receipts'
     ) is not null
     or pg_catalog.to_regclass(
       'public.brinesearch_driver_google_handoffs_public'
     ) is not null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_google_handoff_current(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'
     ) is not null then
    raise exception 'Verified mobile Google handoff contract already exists';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_google_route_current(uuid)'::pg_catalog.regprocedure
     ))<>'a9c69f4757703025bd6d57b37521ccd8'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_v18_public_google_release_authorizes_receipt(uuid)'::pg_catalog.regprocedure
     ))<>'e1d7ce281253b92004a6ac6966c307ae'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_transition_google_dark_current(uuid)'::pg_catalog.regprocedure
     ))<>'bfa738f0c8865709f903d8d5bdb60fbd'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_v18_driver_pad_status(uuid)'::pg_catalog.regprocedure
     ))<>'568d9dc661706002e4f516399a1685d1' then
    raise exception 'Cologie route/public-currentness functions drifted';
  end if;
  if (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or public.brinesearch_issue97_google_route_current(v_cologie) is not true
     or private_verification.brinesearch_v18_public_google_release_authorizes_receipt(v_cologie)
          is not true
     or private_verification.brinesearch_issue97_transition_google_dark_current(v_cologie)
          is not true then
    raise exception 'Cologie exact public Google release is not uniquely current';
  end if;

  select r.manifest into strict v_manifest
  from public.brinesearch_driver_google_routes_public r
  where r.pad_id=v_cologie
    and r.route_revision=1
    and r.manifest->>'manifest_digest'='08ec28f968ef6425f10a8170ec9fa36c'
    and r.manifest->>'dependency_digest'='dba36e417e59b1746c2e3f09ae6d6980';

  if pg_catalog.jsonb_typeof(v_manifest->'points') is distinct from 'array'
     or coalesce(pg_catalog.jsonb_array_length(v_manifest->'points'),-1)<>16
     or v_manifest->>'route_prep_id' is distinct from 'dfb3f204-190c-4d65-85b3-16bcd1715825'
     or v_manifest->>'manifest_mode' is distinct from 'transition_geometry'
     or v_manifest->>'status' is distinct from 'ready'
     or coalesce((v_manifest->>'route_ready')::boolean,false) is not true
     or v_manifest#>>'{points,0,kind}' is distinct from 'shape'
     or v_manifest#>>'{points,0,shape_role}' is distinct from 'route_ingress'
     or v_manifest#>>'{points,0,sequence}' is distinct from '1'
     or v_manifest#>>'{points,12,kind}' is distinct from 'shared_exit'
     or v_manifest#>>'{points,12,sequence}' is distinct from '13'
     or v_manifest#>>'{points,14,kind}' is distinct from 'junction'
     or v_manifest#>>'{points,14,sequence}' is distinct from '15'
     or v_manifest#>>'{points,15,kind}' is distinct from 'pad_destination'
     or v_manifest#>>'{points,15,source_kind}' is distinct from 'saved_pad_gps'
     or v_manifest#>>'{points,15,pad_id}' is distinct from v_cologie::text
     or v_manifest#>>'{points,15,sequence}' is distinct from '16' then
    raise exception 'Cologie exact manifest controls drifted from the reviewed handoff proof';
  end if;
  if array(
       select value->>'display_name'
       from pg_catalog.jsonb_array_elements(v_manifest->'driver_road_sequence') item(value)
       where (value->>'occurrence_index')::integer between 2 and 6
       order by (value->>'occurrence_index')::integer
     )<>array[
       'FOXS BOTTOM RD','SPRINGDALE HILL RD','LAMBORN RD',
       'SPRINGDALE HILL RD','BLAIRMONT RD'
     ]::text[] then
    raise exception 'Cologie reviewed driver road sequence drifted';
  end if;

  v_status:=public.brinesearch_v18_driver_pad_status(v_cologie);
  if v_status#>>'{route,state}' is distinct from 'ready'
     or v_status#>>'{route,source}' is distinct from 'exact_graph'
     or v_status#>>'{graph,state}' is distinct from 'active_current'
     or v_status#>>'{google,publicState}' is distinct from 'ready'
     or pg_catalog.jsonb_typeof(v_status#>'{route,steps}') is distinct from 'array'
     or coalesce(pg_catalog.jsonb_array_length(v_status#>'{route,steps}'),-1)<>5
     or pg_catalog.jsonb_typeof(v_status#>'{route,geometry,features}') is distinct from 'array'
     or coalesce(pg_catalog.jsonb_array_length(v_status#>'{route,geometry,features}'),-1)<>5 then
    raise exception 'Cologie driver status is not exact-route ready';
  end if;
end
$preflight$;

create temporary table tmp_v18_cologie_handoff_baseline
on commit drop
as
select
  public.brinesearch_issue97_cutover_active() as cutover_active,
  (select count(*) from public.brinesearch_driver_google_routes_public) as public_google_count,
  (select to_jsonb(r) from public.brinesearch_driver_google_routes_public r
   where r.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid) as public_google_row,
  (select to_jsonb(p) from public.pads p
   where p.id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid) as pad_row,
  (select to_jsonb(r) from public.brinesearch_route_prep r
   where r.id='dfb3f204-190c-4d65-85b3-16bcd1715825'::uuid) as route_row,
  (
    public.brinesearch_v18_driver_pad_status(
      'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
    ) - array['checkedAt','statusRevision']::text[]
  ) as driver_status;

create table private_verification.brinesearch_v18_google_handoff_receipts(
  pad_id uuid primary key references public.pads(id) on delete restrict,
  route_revision bigint not null check(route_revision>0),
  source_manifest_digest text not null
    check(source_manifest_digest~'^[0-9a-f]{32}$'),
  source_dependency_digest text not null
    check(source_dependency_digest~'^[0-9a-f]{32}$'),
  handoff_version text not null
    check(handoff_version='v18-google-mobile-v1'),
  handoff jsonb not null check(pg_catalog.jsonb_typeof(handoff)='object'),
  handoff_digest text not null check(handoff_digest~'^[0-9a-f]{32}$'),
  evidence jsonb not null check(pg_catalog.jsonb_typeof(evidence)='object'),
  authorization_basis text not null check(length(btrim(authorization_basis))>0),
  verified_at timestamptz not null,
  revoked_at timestamptz,
  check(revoked_at is null or revoked_at>=verified_at),
  constraint brinesearch_v18_google_handoff_receipt_shape check(
    pg_catalog.jsonb_typeof(handoff)='object'
    and handoff ?& array[
      'handoff_version','pad_id','route_revision','source_manifest_digest',
      'source_dependency_digest','origin_mode','mobile_waypoint_limit',
      'waypoints','destination'
    ]::text[]
    and (handoff-array[
      'handoff_version','pad_id','route_revision','source_manifest_digest',
      'source_dependency_digest','origin_mode','mobile_waypoint_limit',
      'waypoints','destination'
    ]::text[])='{}'::jsonb
    and handoff->>'handoff_version' is not distinct from handoff_version
    and handoff->>'pad_id' is not distinct from pad_id::text
    and handoff->>'route_revision' is not distinct from route_revision::text
    and handoff->>'source_manifest_digest' is not distinct from source_manifest_digest
    and handoff->>'source_dependency_digest' is not distinct from source_dependency_digest
    and handoff->>'origin_mode' is not distinct from 'current_location_until_route_ingress'
    and handoff->>'mobile_waypoint_limit' is not distinct from '3'
    and pg_catalog.jsonb_typeof(handoff->'waypoints') is not distinct from 'array'
    and pg_catalog.jsonb_typeof(handoff->'destination') is not distinct from 'object'
    and handoff_digest=pg_catalog.md5(handoff::text)
  )
);

alter table private_verification.brinesearch_v18_google_handoff_receipts
enable row level security;
alter table private_verification.brinesearch_v18_google_handoff_receipts
force row level security;
revoke all on table
  private_verification.brinesearch_v18_google_handoff_receipts
from public,anon,authenticated,service_role;

comment on table
  private_verification.brinesearch_v18_google_handoff_receipts is
'Explicitly reviewed compact Google handoffs bound to unchanged full exact-route manifests. A changed route, dependency, package, or receipt fails closed.';

create table public.brinesearch_driver_google_handoffs_public(
  pad_id uuid primary key references public.pads(id) on delete restrict,
  route_revision bigint not null check(route_revision>0),
  source_manifest_digest text not null
    check(source_manifest_digest~'^[0-9a-f]{32}$'),
  source_dependency_digest text not null
    check(source_dependency_digest~'^[0-9a-f]{32}$'),
  handoff_version text not null
    check(handoff_version='v18-google-mobile-v1'),
  handoff jsonb not null check(pg_catalog.jsonb_typeof(handoff)='object'),
  handoff_digest text not null check(handoff_digest~'^[0-9a-f]{32}$'),
  published_at timestamptz not null,
  constraint brinesearch_driver_google_handoff_shape_v18 check(
    pg_catalog.jsonb_typeof(handoff)='object'
    and handoff ?& array[
      'handoff_version','pad_id','route_revision','source_manifest_digest',
      'source_dependency_digest','origin_mode','mobile_waypoint_limit',
      'waypoints','destination'
    ]::text[]
    and (handoff-array[
      'handoff_version','pad_id','route_revision','source_manifest_digest',
      'source_dependency_digest','origin_mode','mobile_waypoint_limit',
      'waypoints','destination'
    ]::text[])='{}'::jsonb
    and handoff->>'handoff_version' is not distinct from handoff_version
    and handoff->>'pad_id' is not distinct from pad_id::text
    and handoff->>'route_revision' is not distinct from route_revision::text
    and handoff->>'source_manifest_digest' is not distinct from source_manifest_digest
    and handoff->>'source_dependency_digest' is not distinct from source_dependency_digest
    and handoff->>'origin_mode' is not distinct from 'current_location_until_route_ingress'
    and handoff->>'mobile_waypoint_limit' is not distinct from '3'
    and pg_catalog.jsonb_typeof(handoff->'waypoints') is not distinct from 'array'
    and pg_catalog.jsonb_typeof(handoff->'destination') is not distinct from 'object'
    and handoff_digest=pg_catalog.md5(handoff::text)
  )
);

alter table public.brinesearch_driver_google_handoffs_public
enable row level security;
alter table public.brinesearch_driver_google_handoffs_public
force row level security;
revoke all on table public.brinesearch_driver_google_handoffs_public
from public,anon,authenticated,service_role;
grant select on table public.brinesearch_driver_google_handoffs_public
to anon,authenticated,service_role;

comment on table public.brinesearch_driver_google_handoffs_public is
'Coordinate-only reviewed mobile Google handoffs. The full exact route remains authoritative; RLS hides any handoff whose route, manifest, dependency, receipt, or projection is no longer current.';

create function
  private_verification.brinesearch_v18_google_handoff_receipt_current(
    p_pad_id uuid
  )
returns boolean
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='14s'
set lock_timeout='500ms'
as $function$
declare
  v_release private_verification.brinesearch_v18_google_handoff_receipts%rowtype;
  v_route public.brinesearch_driver_google_routes_public%rowtype;
  v_source private_verification.brinesearch_google_route_receipts_issue97%rowtype;
  v_points jsonb;
  v_waypoints jsonb;
  v_destination jsonb;
  v_waypoint jsonb;
  v_source_point jsonb;
  v_waypoint_count integer;
  v_sequence integer;
  v_previous_sequence integer:=0;
  v_position integer:=0;
  v_waypoint_sequences jsonb:='[]'::jsonb;
  v_handoff_keys constant text[]:=array[
    'handoff_version','pad_id','route_revision','source_manifest_digest',
    'source_dependency_digest','origin_mode','mobile_waypoint_limit',
    'waypoints','destination'
  ]::text[];
  v_evidence_keys constant text[]:=array[
    'verification_state','method','google_checked_at','source_origin',
    'waypoint_sequences','observed_distance_miles',
    'exact_manifest_known_route_miles','observed_road_sequence'
  ]::text[];
begin
  if private_verification.brinesearch_v18_public_google_release_authorizes_receipt(p_pad_id)
       is not true
     or private_verification.brinesearch_issue97_transition_google_dark_current(p_pad_id)
       is not true
     or public.brinesearch_issue97_google_route_current(p_pad_id) is not true then
    return false;
  end if;

  select * into strict v_release
  from private_verification.brinesearch_v18_google_handoff_receipts r
  where r.pad_id=p_pad_id and r.revoked_at is null;
  select * into strict v_route
  from public.brinesearch_driver_google_routes_public r
  where r.pad_id=p_pad_id;
  select * into strict v_source
  from private_verification.brinesearch_google_route_receipts_issue97 r
  where r.pad_id=p_pad_id and r.status='ready';

  if v_release.route_revision is distinct from v_route.route_revision
     or v_release.route_revision is distinct from v_source.route_revision
     or v_release.source_manifest_digest is distinct from v_source.manifest_digest
     or v_release.source_dependency_digest is distinct from v_source.dependency_digest
     or v_route.manifest is distinct from v_source.manifest
     or v_route.manifest->>'manifest_digest' is distinct from v_release.source_manifest_digest
     or v_route.manifest->>'dependency_digest' is distinct from v_release.source_dependency_digest
     or v_release.handoff_version is distinct from 'v18-google-mobile-v1'
     or v_release.handoff_digest is distinct from pg_catalog.md5(v_release.handoff::text)
     or pg_catalog.jsonb_typeof(v_release.handoff) is distinct from 'object'
     or not (v_release.handoff ?& v_handoff_keys)
     or (v_release.handoff-v_handoff_keys) is distinct from '{}'::jsonb
     or pg_catalog.jsonb_typeof(v_release.evidence) is distinct from 'object'
     or not (v_release.evidence ?& v_evidence_keys)
     or (v_release.evidence-v_evidence_keys) is distinct from '{}'::jsonb
     or v_release.evidence->>'verification_state' is distinct from 'reviewed'
     or v_release.evidence->>'method' is distinct from 'read_only_google_maps_directions_details'
     or v_release.evidence->>'source_origin' is distinct from 'exact_route_ingress'
     or (v_release.evidence->>'google_checked_at')::timestamptz
          is distinct from v_release.verified_at
     or pg_catalog.jsonb_typeof(v_release.evidence->'waypoint_sequences')
          is distinct from 'array'
     or pg_catalog.jsonb_typeof(v_release.evidence->'observed_distance_miles')
          is distinct from 'number'
     or (v_release.evidence->>'observed_distance_miles')::numeric<=0
     or pg_catalog.jsonb_typeof(v_release.evidence->'exact_manifest_known_route_miles')
          is distinct from 'number'
     or (v_release.evidence->>'exact_manifest_known_route_miles')::numeric<=0
     or pg_catalog.jsonb_typeof(v_release.evidence->'observed_road_sequence')
          is distinct from 'array'
     or coalesce(pg_catalog.jsonb_array_length(
          v_release.evidence->'observed_road_sequence'
        ),0)<1
     or exists(
          select 1
          from pg_catalog.jsonb_array_elements(
            v_release.evidence->'observed_road_sequence'
          ) road(value)
          where pg_catalog.jsonb_typeof(road.value) is distinct from 'string'
             or nullif(pg_catalog.btrim(road.value#>>'{}'),'') is null
        )
     or pg_catalog.jsonb_typeof(v_release.handoff->'handoff_version')
          is distinct from 'string'
     or v_release.handoff->>'handoff_version' is distinct from v_release.handoff_version
     or pg_catalog.jsonb_typeof(v_release.handoff->'pad_id') is distinct from 'string'
     or v_release.handoff->>'pad_id' is distinct from p_pad_id::text
     or pg_catalog.jsonb_typeof(v_release.handoff->'route_revision')
          is distinct from 'number'
     or v_release.handoff->>'route_revision' is distinct from v_release.route_revision::text
     or pg_catalog.jsonb_typeof(v_release.handoff->'source_manifest_digest')
          is distinct from 'string'
     or v_release.handoff->>'source_manifest_digest'
          is distinct from v_release.source_manifest_digest
     or pg_catalog.jsonb_typeof(v_release.handoff->'source_dependency_digest')
          is distinct from 'string'
     or v_release.handoff->>'source_dependency_digest'
          is distinct from v_release.source_dependency_digest
     or pg_catalog.jsonb_typeof(v_release.handoff->'origin_mode') is distinct from 'string'
     or v_release.handoff->>'origin_mode'
          is distinct from 'current_location_until_route_ingress'
     or pg_catalog.jsonb_typeof(v_release.handoff->'mobile_waypoint_limit')
          is distinct from 'number'
     or v_release.handoff->>'mobile_waypoint_limit' is distinct from '3' then
    return false;
  end if;

  v_points:=v_route.manifest->'points';
  v_waypoints:=v_release.handoff->'waypoints';
  v_destination:=v_release.handoff->'destination';
  if pg_catalog.jsonb_typeof(v_points) is distinct from 'array'
     or coalesce(pg_catalog.jsonb_array_length(v_points),0)<2
     or pg_catalog.jsonb_typeof(v_waypoints) is distinct from 'array'
     or pg_catalog.jsonb_typeof(v_destination) is distinct from 'object' then
    return false;
  end if;
  v_waypoint_count:=pg_catalog.jsonb_array_length(v_waypoints);
  if v_waypoint_count is null
     or v_waypoint_count<1
     or v_waypoint_count>3 then
    return false;
  end if;

  for v_waypoint in
    select value from pg_catalog.jsonb_array_elements(v_waypoints) item(value)
  loop
    v_position:=v_position+1;
    if pg_catalog.jsonb_typeof(v_waypoint) is distinct from 'object'
       or coalesce(v_waypoint->>'sequence','')!~'^[1-9][0-9]*$' then
      return false;
    end if;
    v_sequence:=(v_waypoint->>'sequence')::integer;
    if v_sequence<=v_previous_sequence
       or v_sequence>=pg_catalog.jsonb_array_length(v_points) then
      return false;
    end if;
    v_source_point:=v_points->(v_sequence-1);
    if pg_catalog.jsonb_typeof(v_source_point) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_source_point->'latitude') is distinct from 'number'
       or pg_catalog.jsonb_typeof(v_source_point->'longitude') is distinct from 'number'
       or (v_source_point->>'latitude')::numeric not between 36.5 and 43.5
       or (v_source_point->>'longitude')::numeric not between -84.5 and -73.5
       or v_waypoint is distinct from pg_catalog.jsonb_build_object(
         'sequence',(v_source_point->>'sequence')::integer,
         'latitude',v_source_point->'latitude',
         'longitude',v_source_point->'longitude'
       ) then
      return false;
    end if;
    if v_position=1 and (
          v_sequence<>1
          or v_source_point->>'kind' is distinct from 'shape'
          or v_source_point->>'shape_role' is distinct from 'route_ingress'
        ) then
      return false;
    end if;
    v_previous_sequence:=v_sequence;
    v_waypoint_sequences:=v_waypoint_sequences||
      pg_catalog.jsonb_build_array(v_sequence);
  end loop;

  if v_release.evidence->'waypoint_sequences'
       is distinct from v_waypoint_sequences then
    return false;
  end if;

  v_source_point:=v_points->(pg_catalog.jsonb_array_length(v_points)-1);
  if pg_catalog.jsonb_typeof(v_source_point) is distinct from 'object'
     or coalesce(v_destination->>'sequence','')!~'^[1-9][0-9]*$'
     or pg_catalog.jsonb_typeof(v_source_point->'latitude') is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_source_point->'longitude') is distinct from 'number'
     or (v_source_point->>'latitude')::numeric not between 36.5 and 43.5
     or (v_source_point->>'longitude')::numeric not between -84.5 and -73.5
     or v_destination is distinct from pg_catalog.jsonb_build_object(
       'sequence',(v_source_point->>'sequence')::integer,
       'latitude',v_source_point->'latitude',
       'longitude',v_source_point->'longitude',
       'pad_id',v_source_point->>'pad_id'
     )
     or v_source_point->>'kind' is distinct from 'pad_destination'
     or v_source_point->>'source_kind' is distinct from 'saved_pad_gps'
     or v_source_point->>'pad_id' is distinct from p_pad_id::text
     or (v_destination->>'sequence')::integer<=v_previous_sequence then
    return false;
  end if;
  return true;
exception when others then
  return false;
end
$function$;

revoke all on function
  private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_google_handoff_receipt_current(uuid) is
'Validates an explicitly reviewed compact handoff against the still-current full exact-route receipt. It never derives, guesses, or thins a route.';

create function public.brinesearch_v18_google_handoff_current(p_pad_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
set statement_timeout='14s'
set lock_timeout='500ms'
as $function$
declare
  v_release private_verification.brinesearch_v18_google_handoff_receipts%rowtype;
begin
  if private_verification.brinesearch_v18_google_handoff_receipt_current(p_pad_id)
       is not true then
    return false;
  end if;
  select * into strict v_release
  from private_verification.brinesearch_v18_google_handoff_receipts r
  where r.pad_id=p_pad_id and r.revoked_at is null;
  return exists(
    select 1
    from public.brinesearch_driver_google_handoffs_public p
    where p.pad_id=v_release.pad_id
      and p.route_revision=v_release.route_revision
      and p.source_manifest_digest=v_release.source_manifest_digest
      and p.source_dependency_digest=v_release.source_dependency_digest
      and p.handoff_version=v_release.handoff_version
      and p.handoff=v_release.handoff
      and p.handoff_digest=v_release.handoff_digest
      and p.published_at=v_release.verified_at
  );
exception when others then
  return false;
end
$function$;

revoke all on function public.brinesearch_v18_google_handoff_current(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_v18_google_handoff_current(uuid)
to anon,authenticated,service_role;

comment on function public.brinesearch_v18_google_handoff_current(uuid) is
'True only while the public coordinate-only handoff is byte-identical to its reviewed receipt and the underlying full exact route remains current.';

create policy brinesearch_driver_google_handoffs_public_read_v18
on public.brinesearch_driver_google_handoffs_public
for select
to anon,authenticated
using(public.brinesearch_v18_google_handoff_current(pad_id));

-- Return the sanitized status and both already-public Google projections from
-- one SQL-statement snapshot. SECURITY INVOKER preserves each table's FORCE-RLS
-- policy; the explicit current predicates also keep service_role fail-closed.
create function public.brinesearch_v18_driver_pad_status_with_google_handoff(
  p_pad_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
set statement_timeout='14s'
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
'Atomic V18 driver read envelope. It returns the existing sanitized status and explicit allowlists from already-public current Google projections; it never reads a private receipt directly.';

do $publish_cologie$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_manifest jsonb;
  v_handoff jsonb;
  v_handoff_digest text;
  v_verified_at constant timestamptz:='2026-08-25T22:10:00Z';
begin
  select r.manifest into strict v_manifest
  from public.brinesearch_driver_google_routes_public r
  where r.pad_id=v_cologie;

  v_handoff:=pg_catalog.jsonb_build_object(
    'handoff_version','v18-google-mobile-v1',
    'pad_id',v_cologie,
    'route_revision',1,
    'source_manifest_digest','08ec28f968ef6425f10a8170ec9fa36c',
    'source_dependency_digest','dba36e417e59b1746c2e3f09ae6d6980',
    'origin_mode','current_location_until_route_ingress',
    'mobile_waypoint_limit',3,
    'waypoints',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'sequence',1,
        'latitude',v_manifest#>'{points,0,latitude}',
        'longitude',v_manifest#>'{points,0,longitude}'
      ),
      pg_catalog.jsonb_build_object(
        'sequence',13,
        'latitude',v_manifest#>'{points,12,latitude}',
        'longitude',v_manifest#>'{points,12,longitude}'
      ),
      pg_catalog.jsonb_build_object(
        'sequence',15,
        'latitude',v_manifest#>'{points,14,latitude}',
        'longitude',v_manifest#>'{points,14,longitude}'
      )
    ),
    'destination',pg_catalog.jsonb_build_object(
      'sequence',16,
      'latitude',v_manifest#>'{points,15,latitude}',
      'longitude',v_manifest#>'{points,15,longitude}',
      'pad_id',v_cologie
    )
  );
  v_handoff_digest:=pg_catalog.md5(v_handoff::text);

  insert into private_verification.brinesearch_v18_google_handoff_receipts(
    pad_id,route_revision,source_manifest_digest,source_dependency_digest,
    handoff_version,handoff,handoff_digest,evidence,authorization_basis,
    verified_at
  ) values(
    v_cologie,1,'08ec28f968ef6425f10a8170ec9fa36c',
    'dba36e417e59b1746c2e3f09ae6d6980','v18-google-mobile-v1',
    v_handoff,v_handoff_digest,
    pg_catalog.jsonb_build_object(
      'verification_state','reviewed',
      'method','read_only_google_maps_directions_details',
      'google_checked_at',v_verified_at,
      'source_origin','exact_route_ingress',
      'waypoint_sequences',pg_catalog.jsonb_build_array(1,13,15),
      'observed_distance_miles',4.3,
      'exact_manifest_known_route_miles',4.282,
      'observed_road_sequence',pg_catalog.jsonb_build_array(
        'Foxes Bottom Rd','Springdale Hill Rd','Lamborn Rd',
        'Springdale Hill Rd','Blairmont Rd / Unionvale Kenwood Rd'
      )
    ),
    'Owner explicitly requested one Cologie Google link; compact controls were separately checked against the unchanged exact route on 2026-08-25',
    v_verified_at
  );

  insert into public.brinesearch_driver_google_handoffs_public(
    pad_id,route_revision,source_manifest_digest,source_dependency_digest,
    handoff_version,handoff,handoff_digest,published_at
  )
  select
    pad_id,route_revision,source_manifest_digest,source_dependency_digest,
    handoff_version,handoff,handoff_digest,verified_at
  from private_verification.brinesearch_v18_google_handoff_receipts
  where pad_id=v_cologie;
end
$publish_cologie$;

do $verify_install$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_verified_at constant timestamptz:='2026-08-25T22:10:00Z';
  v_baseline tmp_v18_cologie_handoff_baseline%rowtype;
  v_receipt private_verification.brinesearch_v18_google_handoff_receipts%rowtype;
  v_private_current pg_catalog.pg_proc%rowtype;
  v_public_current pg_catalog.pg_proc%rowtype;
  v_wrapper pg_catalog.pg_proc%rowtype;
  v_policy oid;
  v_wrapper_definition text;
  v_bundle jsonb;
  v_missing_bundle jsonb;
begin
  select * into strict v_baseline from tmp_v18_cologie_handoff_baseline;
  select * into strict v_receipt
  from private_verification.brinesearch_v18_google_handoff_receipts
  where pad_id=v_cologie;
  if private_verification.brinesearch_v18_google_handoff_receipt_current(v_cologie)
       is not true
     or public.brinesearch_v18_google_handoff_current(v_cologie) is not true
     or (select count(*) from private_verification.brinesearch_v18_google_handoff_receipts)<>1
     or (select count(*) from public.brinesearch_driver_google_handoffs_public)<>1 then
    raise exception 'Cologie compact handoff did not install as one current receipt/projection';
  end if;
  if v_receipt.evidence is distinct from pg_catalog.jsonb_build_object(
       'verification_state','reviewed',
       'method','read_only_google_maps_directions_details',
       'google_checked_at',v_verified_at,
       'source_origin','exact_route_ingress',
       'waypoint_sequences',pg_catalog.jsonb_build_array(1,13,15),
       'observed_distance_miles',4.3,
       'exact_manifest_known_route_miles',4.282,
       'observed_road_sequence',pg_catalog.jsonb_build_array(
         'Foxes Bottom Rd','Springdale Hill Rd','Lamborn Rd',
         'Springdale Hill Rd','Blairmont Rd / Unionvale Kenwood Rd'
       )
     ) then
    raise exception 'Cologie compact handoff evidence is not the exact reviewed proof';
  end if;
  if not pg_catalog.has_table_privilege(
       'anon','public.brinesearch_driver_google_handoffs_public','select'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated','public.brinesearch_driver_google_handoffs_public','select'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.brinesearch_driver_google_handoffs_public','select'
     )
     or pg_catalog.has_table_privilege(
       'public','public.brinesearch_driver_google_handoffs_public','select'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.brinesearch_driver_google_handoffs_public','insert'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.brinesearch_driver_google_handoffs_public','update'
     )
     or pg_catalog.has_table_privilege(
       'anon','public.brinesearch_driver_google_handoffs_public','delete'
     )
     or pg_catalog.has_table_privilege(
       'authenticated','public.brinesearch_driver_google_handoffs_public','insert,update,delete,truncate'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.brinesearch_driver_google_handoffs_public','insert,update,delete,truncate'
     )
     or pg_catalog.has_table_privilege(
       'anon','private_verification.brinesearch_v18_google_handoff_receipts',
       'select,insert,update,delete,truncate'
     )
     or pg_catalog.has_table_privilege(
       'authenticated','private_verification.brinesearch_v18_google_handoff_receipts',
       'select,insert,update,delete,truncate'
     )
     or pg_catalog.has_table_privilege(
       'service_role','private_verification.brinesearch_v18_google_handoff_receipts',
       'select,insert,update,delete,truncate'
     ) then
    raise exception 'Cologie compact handoff grants are not read-only';
  end if;
  if (select count(*)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where (n.nspname,c.relname) in (
        ('private_verification','brinesearch_v18_google_handoff_receipts'),
        ('public','brinesearch_driver_google_handoffs_public')
      )
        and c.relrowsecurity and c.relforcerowsecurity)<>2 then
    raise exception 'Cologie compact handoff tables are not both FORCE RLS';
  end if;
  select policy.oid into strict v_policy
  from pg_catalog.pg_policy policy
  where policy.polrelid=
    'public.brinesearch_driver_google_handoffs_public'::pg_catalog.regclass
    and policy.polname='brinesearch_driver_google_handoffs_public_read_v18';
  if (select count(*)
      from pg_catalog.pg_policy policy
      where policy.polrelid=
        'public.brinesearch_driver_google_handoffs_public'::pg_catalog.regclass
    )<>1
     or not exists(
       select 1
       from pg_catalog.pg_policy policy
       where policy.oid=v_policy
         and policy.polcmd='r'
         and policy.polpermissive
         and pg_catalog.array_length(policy.polroles,1)=2
         and policy.polroles @> array[
           'anon'::pg_catalog.regrole::oid,
           'authenticated'::pg_catalog.regrole::oid
         ]
     )
     or not exists(
       select 1
       from pg_catalog.pg_depend dependency
       where dependency.classid='pg_catalog.pg_policy'::pg_catalog.regclass
         and dependency.objid=v_policy
         and dependency.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
         and dependency.refobjid=
           'public.brinesearch_v18_google_handoff_current(uuid)'::
             pg_catalog.regprocedure
     ) then
    raise exception 'Cologie compact handoff public RLS policy drifted';
  end if;

  select proc.* into strict v_private_current
  from pg_catalog.pg_proc proc
  where proc.oid=
    'private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)'::
      pg_catalog.regprocedure;
  select proc.* into strict v_public_current
  from pg_catalog.pg_proc proc
  where proc.oid='public.brinesearch_v18_google_handoff_current(uuid)'::
    pg_catalog.regprocedure;
  if not v_private_current.prosecdef
     or v_private_current.provolatile<>'s'
     or (v_private_current.proconfig @> array[
          'search_path=""','statement_timeout=14s','lock_timeout=500ms'
        ]::text[]) is distinct from true
     or not v_public_current.prosecdef
     or v_public_current.provolatile<>'s'
     or (v_public_current.proconfig @> array[
          'search_path=""','statement_timeout=14s','lock_timeout=500ms'
        ]::text[]) is distinct from true
     or not exists(
          select 1
          from pg_catalog.pg_roles owner
          where owner.oid=v_private_current.proowner
            and owner.rolbypassrls
        )
     or not exists(
          select 1
          from pg_catalog.pg_roles owner
          where owner.oid=v_public_current.proowner
            and owner.rolbypassrls
        ) then
    raise exception 'Cologie handoff currentness functions are not safely hardened';
  end if;
  if pg_catalog.has_function_privilege(
       'public',
       'private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_google_handoff_receipt_current(uuid)',
       'execute'
     )
     or pg_catalog.has_function_privilege(
       'public','public.brinesearch_v18_google_handoff_current(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_v18_google_handoff_current(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_v18_google_handoff_current(uuid)','execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_v18_google_handoff_current(uuid)','execute'
     ) then
    raise exception 'Cologie handoff currentness function grants drifted';
  end if;

  select proc.* into strict v_wrapper
  from pg_catalog.pg_proc proc
  where proc.oid=
    'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)'::
      pg_catalog.regprocedure;
  v_wrapper_definition:=pg_catalog.lower(
    pg_catalog.pg_get_functiondef(v_wrapper.oid)
  );
  if v_wrapper.prosecdef
     or v_wrapper.provolatile<>'s'
     or v_wrapper.prolang is distinct from (
          select language.oid
          from pg_catalog.pg_language language
          where language.lanname='sql'
        )
     or (v_wrapper.proconfig @> array[
          'search_path=""','statement_timeout=14s','lock_timeout=500ms'
        ]::text[]) is distinct from true
     or pg_catalog.strpos(v_wrapper_definition,'private_verification.')<>0
     or pg_catalog.strpos(
          v_wrapper_definition,'public.brinesearch_v18_driver_pad_status('
        )=0
     or pg_catalog.strpos(
          v_wrapper_definition,'public.brinesearch_driver_google_routes_public'
        )=0
     or pg_catalog.strpos(
          v_wrapper_definition,'public.brinesearch_driver_google_handoffs_public'
        )=0 then
    raise exception 'Atomic V18 driver handoff RPC definition is not fail-closed';
  end if;
  if pg_catalog.has_function_privilege(
       'public',
       'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'anon',
       'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
       'execute'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.brinesearch_v18_driver_pad_status_with_google_handoff(uuid)',
       'execute'
     ) then
    raise exception 'Atomic V18 driver handoff RPC execute grants drifted';
  end if;

  v_bundle:=public.brinesearch_v18_driver_pad_status_with_google_handoff(v_cologie);
  if pg_catalog.jsonb_typeof(v_bundle) is distinct from 'object'
     or not (v_bundle ?& array[
          'status','publicGoogleRoute','publicGoogleHandoff'
        ]::text[])
     or (v_bundle-array[
          'status','publicGoogleRoute','publicGoogleHandoff'
        ]::text[]) is distinct from '{}'::jsonb
     or ((v_bundle->'status')-array['checkedAt','statusRevision']::text[])
          is distinct from v_baseline.driver_status
     or pg_catalog.jsonb_typeof(v_bundle->'publicGoogleRoute')
          is distinct from 'object'
     or not ((v_bundle->'publicGoogleRoute') ?& array[
          'pad_id','route_revision','manifest'
        ]::text[])
     or ((v_bundle->'publicGoogleRoute')-array[
          'pad_id','route_revision','manifest'
        ]::text[]) is distinct from '{}'::jsonb
     or v_bundle#>>'{publicGoogleRoute,pad_id}' is distinct from v_cologie::text
     or v_bundle#>>'{publicGoogleRoute,route_revision}' is distinct from '1'
     or v_bundle#>>'{publicGoogleRoute,manifest,manifest_digest}'
          is distinct from '08ec28f968ef6425f10a8170ec9fa36c'
     or v_bundle#>>'{publicGoogleRoute,manifest,dependency_digest}'
          is distinct from 'dba36e417e59b1746c2e3f09ae6d6980'
     or pg_catalog.jsonb_typeof(v_bundle->'publicGoogleHandoff')
          is distinct from 'object'
     or not ((v_bundle->'publicGoogleHandoff') ?& array[
          'pad_id','route_revision','source_manifest_digest',
          'source_dependency_digest','handoff_version','handoff',
          'handoff_digest','published_at'
        ]::text[])
     or ((v_bundle->'publicGoogleHandoff')-array[
          'pad_id','route_revision','source_manifest_digest',
          'source_dependency_digest','handoff_version','handoff',
          'handoff_digest','published_at'
        ]::text[]) is distinct from '{}'::jsonb
     or v_bundle#>>'{publicGoogleHandoff,pad_id}' is distinct from v_cologie::text
     or v_bundle#>>'{publicGoogleHandoff,handoff_digest}'
          is distinct from v_receipt.handoff_digest then
    raise exception 'Atomic V18 driver handoff RPC returned an unsafe Cologie envelope';
  end if;

  v_missing_bundle:=
    public.brinesearch_v18_driver_pad_status_with_google_handoff(
      '00000000-0000-0000-0000-000000000000'::uuid
    );
  if v_missing_bundle->'status' is distinct from 'null'::jsonb
     or v_missing_bundle->'publicGoogleRoute' is distinct from 'null'::jsonb
     or v_missing_bundle->'publicGoogleHandoff' is distinct from 'null'::jsonb then
    raise exception 'Atomic V18 driver handoff RPC did not fail closed for a missing pad';
  end if;

  if public.brinesearch_issue97_cutover_active()
       is distinct from v_baseline.cutover_active
     or (select count(*) from public.brinesearch_driver_google_routes_public)
          is distinct from v_baseline.public_google_count
     or (select to_jsonb(r) from public.brinesearch_driver_google_routes_public r
         where r.pad_id=v_cologie) is distinct from v_baseline.public_google_row
     or (select to_jsonb(p) from public.pads p where p.id=v_cologie)
          is distinct from v_baseline.pad_row
     or (select to_jsonb(r) from public.brinesearch_route_prep r
         where r.id='dfb3f204-190c-4d65-85b3-16bcd1715825'::uuid)
          is distinct from v_baseline.route_row
     or (public.brinesearch_v18_driver_pad_status(v_cologie)
         - array['checkedAt','statusRevision']::text[])
          is distinct from v_baseline.driver_status then
    raise exception 'Cologie handoff install changed an existing pad/route/graph/Google authority contract';
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
  if (select count(*) from public.brinesearch_driver_google_handoffs_public)<>1
     or public.brinesearch_v18_google_handoff_current(
       'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
     ) is not true
     or v_bundle#>>'{status,google,publicState}' is distinct from 'ready'
     or v_bundle#>>'{publicGoogleRoute,pad_id}'
          is distinct from 'e2b32e85-9e93-4388-8215-9d8167cbbeb8'
     or v_bundle#>>'{publicGoogleHandoff,pad_id}'
          is distinct from 'e2b32e85-9e93-4388-8215-9d8167cbbeb8' then
    raise exception 'Anonymous V18 client cannot read the atomic current Cologie handoff';
  end if;
end
$verify_anon$;
reset role;
