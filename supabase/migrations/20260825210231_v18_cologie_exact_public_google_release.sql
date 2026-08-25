-- Cologie is the first owner-authorized per-pad Google release. The release is
-- bound to one already-reviewed private receipt; it does not enable the global
-- Issue #97 cutover and it cannot follow a later route/manifest automatically.
set lock_timeout='5s';
set statement_timeout='120s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('brinesearch:v18:cologie-public-google-release',18)
);

do $$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_status jsonb;
begin
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Cologie release requires global Issue #97 cutover to remain off';
  end if;
  if (select count(*) from public.brinesearch_driver_google_routes_public)<>0 then
    raise exception 'Expected zero pre-release public Google rows';
  end if;
  if pg_catalog.to_regclass(
       'private_verification.brinesearch_v18_public_google_route_releases'
     ) is not null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_public_google_release_authorizes_receipt(uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'private_verification.brinesearch_v18_public_google_release_managed(uuid)'
     ) is not null then
    raise exception 'Per-pad Google release authority already exists';
  end if;
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'public.brinesearch_issue97_google_route_current(uuid)'::pg_catalog.regprocedure
     ))<>'e51d7929093d0c477027c905ce5c6eb4'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_transition_google_current(uuid)'::pg_catalog.regprocedure
     ))<>'378510d95cc33e29a03155e45646eef2'
     or pg_catalog.md5(pg_catalog.pg_get_functiondef(
       'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)'::pg_catalog.regprocedure
     ))<>'9dc259b9e3637c36a1123166aabecb04' then
    raise exception 'Google publication functions drifted from the reviewed production definitions';
  end if;
  if not exists(
    select 1
    from public.pads p
    where p.id=v_cologie
      and p.legacy_id='ascent--cologie'
      and p.pad_name='COLOGIE'
      and p.company='Ascent'
      and p.state='Ohio'
      and p.county='Harrison'
      and not coalesce(p.list_only,false)
      and p.brinesearch_google_route_status_issue97='stale'
      and p.brinesearch_google_route_revision_issue97=0
  ) then
    raise exception 'Cologie pad identity/public marker drifted';
  end if;
  if not exists(
    select 1
    from private_verification.brinesearch_google_route_receipts_issue97 r
    where r.pad_id=v_cologie
      and r.status='ready'
      and r.route_revision=1
      and r.manifest_version='issue97-google-v1'
      and r.manifest_digest='08ec28f968ef6425f10a8170ec9fa36c'
      and r.dependency_digest='dba36e417e59b1746c2e3f09ae6d6980'
      and r.evidence->>'manifest_mode'='transition_geometry'
      and r.manifest->>'manifest_mode'='transition_geometry'
      and r.manifest->>'pad_id'=v_cologie::text
      and r.manifest->>'route_prep_id'='dfb3f204-190c-4d65-85b3-16bcd1715825'
      and r.manifest->>'manifest_digest'=r.manifest_digest
      and r.manifest->>'dependency_digest'=r.dependency_digest
      and pg_catalog.md5((r.manifest-'manifest_digest')::text)=r.manifest_digest
  ) then
    raise exception 'Cologie reviewed private Google receipt drifted';
  end if;
  if not private_verification.brinesearch_issue97_transition_google_dark_current(v_cologie) then
    raise exception 'Cologie private Google receipt is not independently current';
  end if;
  if public.brinesearch_issue97_google_route_current(v_cologie) then
    raise exception 'Cologie unexpectedly has a current public Google release';
  end if;
  v_status:=public.brinesearch_v18_driver_pad_status(v_cologie);
  if v_status#>>'{route,state}'<>'ready'
     or v_status#>>'{route,source}'<>'exact_graph'
     or v_status#>>'{graph,state}'<>'active_current'
     or v_status#>>'{google,publicState}'<>'not_published'
     or jsonb_array_length(coalesce(v_status#>'{route,steps}','[]'::jsonb))<1
     or coalesce(pg_catalog.jsonb_typeof(v_status#>'{route,geometry}'),'null')<>'object' then
    raise exception 'Cologie exact route/graph/public precondition failed';
  end if;
end
$$;

create temporary table tmp_v18_cologie_google_release_baseline
on commit drop
as
select
  (
    select to_jsonb(p)
      - array[
          'brinesearch_google_route_status_issue97',
          'brinesearch_google_route_revision_issue97',
          'updated_at',
          'updated_by',
          'last_updated_date',
          'last_updated_by'
        ]::text[]
    from public.pads p
    where p.id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  ) as pad_non_google,
  (
    select to_jsonb(r)
    from private_verification.brinesearch_google_route_receipts_issue97 r
    where r.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  ) as private_receipt,
  (
    public.brinesearch_v18_driver_pad_status(
      'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
    ) - array['google','statusRevision','checkedAt']::text[]
  ) as non_google_driver_status,
  (
    select pg_catalog.md5(coalesce(pg_catalog.string_agg(
      p.id::text||':'||coalesce(p.brinesearch_google_route_status_issue97,'')||':'||
      coalesce(p.brinesearch_google_route_revision_issue97,0)::text,
      '|' order by p.id
    ),''))
    from public.pads p
    where p.id<>'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  ) as other_pad_google_digest,
  (
    select p.brinesearch_google_route_status_issue97
    from public.pads p
    where p.id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  ) as cologie_pad_google_status,
  (
    select p.brinesearch_google_route_revision_issue97
    from public.pads p
    where p.id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  ) as cologie_pad_google_revision,
  (
    select count(*)
    from private_verification.brinesearch_google_route_refresh_queue_issue97 q
    where q.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  ) as cologie_refresh_queue_count,
  (
    select count(*)
    from public.brinesearch_directory_snapshots_v18 s
    where s.publication_state='current'
  ) as current_directory_snapshots,
  (
    select count(*)
    from public.brinesearch_company_road_overlay_snapshots_v18 s
    where s.publication_state='current'
  ) as current_company_road_overlays,
  (
    select count(*)
    from private_verification.brinesearch_v18_company_road_overlay_releases r
    where r.approval_state='approved'
  ) as approved_company_road_overlay_releases;

create table private_verification.brinesearch_v18_public_google_route_releases(
  pad_id uuid primary key references public.pads(id) on delete restrict,
  route_revision bigint not null check(route_revision>0),
  manifest_mode text not null check(manifest_mode='transition_geometry'),
  manifest_digest text not null check(manifest_digest~'^[0-9a-f]{32}$'),
  dependency_digest text not null check(dependency_digest~'^[0-9a-f]{32}$'),
  authorization_basis text not null check(length(btrim(authorization_basis))>0),
  authorized_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  check(revoked_at is null or revoked_at>=authorized_at)
);

alter table private_verification.brinesearch_v18_public_google_route_releases
enable row level security;
alter table private_verification.brinesearch_v18_public_google_route_releases
force row level security;
revoke all on table
  private_verification.brinesearch_v18_public_google_route_releases
from public,anon,authenticated,service_role;

comment on table
  private_verification.brinesearch_v18_public_google_route_releases is
'Explicit owner authorization for a receipt-bound per-pad public Google release. A changed receipt is not auto-authorized.';

create function
  private_verification.brinesearch_v18_public_google_release_managed(
    p_pad_id uuid
  )
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from private_verification.brinesearch_v18_public_google_route_releases rel
    where rel.pad_id=p_pad_id
  )
$$;

revoke all on function
  private_verification.brinesearch_v18_public_google_release_managed(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_public_google_release_managed(uuid) is
'Marks a pad as permanently receipt-managed. Global cutover cannot bypass a missing, revoked, or changed receipt authorization.';

create function
  private_verification.brinesearch_v18_public_google_release_authorizes_receipt(
    p_pad_id uuid
  )
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from private_verification.brinesearch_v18_public_google_route_releases rel
    join private_verification.brinesearch_google_route_receipts_issue97 receipt
      on receipt.pad_id=rel.pad_id
    where rel.pad_id=p_pad_id
      and rel.revoked_at is null
      and rel.manifest_mode='transition_geometry'
      and receipt.status='ready'
      and receipt.route_revision=rel.route_revision
      and receipt.manifest_digest=rel.manifest_digest
      and receipt.dependency_digest=rel.dependency_digest
      and receipt.evidence->>'manifest_mode'=rel.manifest_mode
      and receipt.manifest->>'manifest_mode'=rel.manifest_mode
      and receipt.manifest->>'pad_id'=rel.pad_id::text
      and receipt.manifest->>'manifest_digest'=rel.manifest_digest
      and receipt.manifest->>'dependency_digest'=rel.dependency_digest
      and pg_catalog.md5((receipt.manifest-'manifest_digest')::text)=rel.manifest_digest
  )
$$;

revoke all on function
  private_verification.brinesearch_v18_public_google_release_authorizes_receipt(uuid)
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_public_google_release_authorizes_receipt(uuid) is
'Checks only explicit release-to-receipt identity. Existing exact-route, graph, safety, and source currentness checks remain independent and mandatory.';

insert into private_verification.brinesearch_v18_public_google_route_releases(
  pad_id,route_revision,manifest_mode,manifest_digest,dependency_digest,
  authorization_basis
)
select
  r.pad_id,r.route_revision,'transition_geometry',r.manifest_digest,
  r.dependency_digest,
  'Owner explicitly authorized Cologie Google link on 2026-08-25; locked to this reviewed receipt'
from private_verification.brinesearch_google_route_receipts_issue97 r
where r.pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
  and r.status='ready'
  and r.route_revision=1
  and r.manifest_digest='08ec28f968ef6425f10a8170ec9fa36c'
  and r.dependency_digest='dba36e417e59b1746c2e3f09ae6d6980'
  and r.evidence->>'manifest_mode'='transition_geometry'
  and r.manifest->>'manifest_mode'='transition_geometry';

do $$
begin
  if (select count(*)
      from private_verification.brinesearch_v18_public_google_route_releases)<>1
     or not private_verification.brinesearch_v18_public_google_release_authorizes_receipt(
       'e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
     ) then
    raise exception 'Cologie release receipt was not installed exactly once';
  end if;
end
$$;

-- Preserve the global projector. The only new path is a receipt-bound per-pad
-- release. While global cutover remains off this path writes only the existing
-- narrow public manifest; it does not mutate pads, queues, routes, or graphs.
create or replace function private_verification.brinesearch_issue97_refresh_google_route_transition(
  p_pad_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_receipt record;
  v_route record;
  v_revision bigint:=0;
  v_reason text;
  v_cutover_active boolean:=public.brinesearch_issue97_cutover_active();
  v_release_managed boolean:=false;
  v_release_authorized boolean:=false;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:google-route:'||p_pad_id::text)
  );

  select * into v_pad from public.pads where id=p_pad_id for update;
  if not found then raise exception 'Pad not found' using errcode='P0002'; end if;
  select * into v_receipt
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  v_revision:=greatest(
    coalesce(v_receipt.route_revision,0),
    coalesce(v_pad.brinesearch_google_route_revision_issue97,0),0
  );
  v_release_managed:=
    private_verification.brinesearch_v18_public_google_release_managed(p_pad_id);
  v_release_authorized:=
    private_verification.brinesearch_v18_public_google_release_authorizes_receipt(p_pad_id);

  if not v_release_authorized
     and (not v_cutover_active or v_release_managed) then
    return pg_catalog.jsonb_build_object(
      'pad_id',p_pad_id,'route_revision',v_revision,'status','held',
      'hold_reason','issue97_cutover_or_explicit_release_not_active',
      'public_projected',false,
      'private_manifest_status',coalesce(v_receipt.status,'missing')
    );
  end if;

  if coalesce(v_pad.list_only,false)
     or not private_verification.brinesearch_issue97_transition_google_dark_current(p_pad_id) then
    v_reason:=case
      when coalesce(v_pad.list_only,false) then 'pad_not_in_current_route_scope'
      when v_receipt.pad_id is null then 'private_dark_google_manifest_missing'
      when v_receipt.status<>'ready' then coalesce(v_receipt.hold_reason,'private_dark_google_manifest_held')
      else 'private_dark_google_manifest_not_current'
    end;
    delete from public.brinesearch_driver_google_routes_public where pad_id=p_pad_id;
    if v_cutover_active then
      update public.pads set
        brinesearch_google_route_status_issue97='held',
        brinesearch_google_route_revision_issue97=v_revision
      where id=p_pad_id;
    end if;
    return pg_catalog.jsonb_build_object(
      'pad_id',p_pad_id,'route_revision',v_revision,'status','held',
      'hold_reason',v_reason,'public_projected',false,
      'private_manifest_status',coalesce(v_receipt.status,'missing')
    );
  end if;

  if coalesce(v_receipt.manifest->>'route_prep_id','') ~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select r.* into v_route
    from public.brinesearch_route_prep r
    where r.id=(v_receipt.manifest->>'route_prep_id')::uuid
      and r.pad_id=p_pad_id and r.active and r.route_group='primary';
  end if;
  if not found or v_route.id is null then
    delete from public.brinesearch_driver_google_routes_public where pad_id=p_pad_id;
    if v_cutover_active then
      update public.pads set
        brinesearch_google_route_status_issue97='held',
        brinesearch_google_route_revision_issue97=v_revision
      where id=p_pad_id;
    end if;
    return pg_catalog.jsonb_build_object(
      'pad_id',p_pad_id,'route_revision',v_revision,'status','held',
      'hold_reason','private_dark_google_manifest_route_not_current',
      'public_projected',false,'private_manifest_status',v_receipt.status
    );
  end if;

  insert into public.brinesearch_driver_google_routes_public(
    pad_id,legacy_id,route_revision,source_revision,manifest
  ) values(
    p_pad_id,v_pad.legacy_id,v_receipt.route_revision,v_route.updated_at,v_receipt.manifest
  )
  on conflict(pad_id) do update set
    legacy_id=excluded.legacy_id,route_revision=excluded.route_revision,
    source_revision=excluded.source_revision,manifest=excluded.manifest;

  if v_cutover_active then
    update public.pads set
      brinesearch_google_route_status_issue97='ready',
      brinesearch_google_route_revision_issue97=v_receipt.route_revision
    where id=p_pad_id;
    delete from private_verification.brinesearch_google_route_refresh_queue_issue97
    where pad_id=p_pad_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'pad_id',p_pad_id,'route_revision',v_receipt.route_revision,'status','ready',
    'manifest_mode','transition_geometry','public_projected',true,
    'release_mode',case when v_cutover_active then 'global_cutover' else 'explicit_pad' end,
    'manifest_digest',v_receipt.manifest_digest,
    'dependency_digest',v_receipt.dependency_digest
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_transition_google_current(
  p_pad_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_pad record;
  v_receipt record;
  v_cutover_active boolean:=public.brinesearch_issue97_cutover_active();
  v_release_managed boolean:=
    private_verification.brinesearch_v18_public_google_release_managed(p_pad_id);
  v_release_authorized boolean:=
    private_verification.brinesearch_v18_public_google_release_authorizes_receipt(p_pad_id);
begin
  if not v_release_authorized
     and (not v_cutover_active or v_release_managed) then return false; end if;
  if not private_verification.brinesearch_issue97_transition_google_dark_current(p_pad_id) then
    return false;
  end if;
  select * into v_pad from public.pads where id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return false; end if;
  if v_cutover_active
     and v_pad.brinesearch_google_route_status_issue97<>'ready' then return false; end if;
  select * into strict v_receipt
  from private_verification.brinesearch_google_route_receipts_issue97
  where pad_id=p_pad_id;
  if v_cutover_active
     and v_receipt.route_revision<>v_pad.brinesearch_google_route_revision_issue97 then
    return false;
  end if;
  return exists(
    select 1 from public.brinesearch_driver_google_routes_public pub
    where pub.pad_id=p_pad_id
      and pub.route_revision=v_receipt.route_revision
      and pub.manifest=v_receipt.manifest
      and coalesce(pub.manifest->>'manifest_digest','')=v_receipt.manifest_digest
      and pg_catalog.md5((pub.manifest-'manifest_digest')::text)=v_receipt.manifest_digest
      and coalesce(pub.manifest->>'manifest_mode','')='transition_geometry'
      and coalesce((pub.manifest->>'route_ready')::boolean,false)
      and coalesce(pub.manifest->>'dependency_digest','')=v_receipt.dependency_digest
  );
exception when others then
  return false;
end
$$;

revoke all on function private_verification.brinesearch_issue97_transition_google_current(uuid)
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_google_route_current(
  p_pad_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_mode text;
  v_pad record;
begin
  if not private_verification.brinesearch_v18_public_google_release_authorizes_receipt(p_pad_id)
     and (
       not public.brinesearch_issue97_cutover_active()
       or private_verification.brinesearch_v18_public_google_release_managed(p_pad_id)
     )
  then return false; end if;

  select * into v_pad from public.pads where id=p_pad_id;
  if not found or coalesce(v_pad.list_only,false) then return false; end if;

  select coalesce(r.evidence->>'manifest_mode','published_route')
  into v_mode
  from private_verification.brinesearch_google_route_receipts_issue97 r
  where r.pad_id=p_pad_id;

  if v_mode='transition_geometry' then
    return private_verification.brinesearch_issue97_transition_google_current(p_pad_id);
  end if;

  if v_mode is null or v_mode<>'published_route' then return false; end if;

  if not exists(
    select 1
    from public.brinesearch_pad_roads pr
    where pr.pad_id=p_pad_id
      and pr.route_group='primary'
      and pr.route_variant_index=0
      and pr.route_revision=v_pad.structured_route_revision
  ) then return false; end if;

  if exists(
    select 1
    from public.brinesearch_pad_roads pr
    where pr.pad_id=p_pad_id
      and pr.route_group='primary'
      and pr.route_variant_index=0
      and (
        pr.route_revision is distinct from v_pad.structured_route_revision
        or coalesce(pr.geometry_version,0)<1
        or pr.step_geometry is null
        or pr.geometry_source is distinct from 'road_manager_clip_issue69'
        or pr.geometry_status is distinct from 'snapped_intersections'
        or nullif(pr.road_geometry_digest,'') is null
      )
  ) then return false; end if;

  return public.brinesearch_issue97_google_route_current_published_core(p_pad_id);
end
$$;

revoke all on function public.brinesearch_issue97_google_route_current(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.brinesearch_issue97_google_route_current(uuid)
to anon,authenticated,service_role;

do $$
declare
  v_cologie constant uuid:='e2b32e85-9e93-4388-8215-9d8167cbbeb8';
  v_result jsonb;
  v_status jsonb;
  v_baseline record;
begin
  v_result:=private_verification.brinesearch_issue97_refresh_google_route_transition(v_cologie);
  if v_result->>'status'<>'ready'
     or coalesce((v_result->>'public_projected')::boolean,false) is not true
     or v_result->>'release_mode'<>'explicit_pad'
     or v_result->>'manifest_digest'<>'08ec28f968ef6425f10a8170ec9fa36c'
     or v_result->>'dependency_digest'<>'dba36e417e59b1746c2e3f09ae6d6980' then
    raise exception 'Cologie exact public projection failed: %',v_result;
  end if;
  if public.brinesearch_issue97_cutover_active() then
    raise exception 'Global Issue #97 cutover changed';
  end if;
  if (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or not exists(
       select 1
       from public.brinesearch_driver_google_routes_public pub
       join private_verification.brinesearch_google_route_receipts_issue97 receipt
         on receipt.pad_id=pub.pad_id
       where pub.pad_id=v_cologie
         and pub.route_revision=1
         and pub.manifest=receipt.manifest
         and pub.manifest->>'manifest_digest'='08ec28f968ef6425f10a8170ec9fa36c'
         and pub.manifest->>'dependency_digest'='dba36e417e59b1746c2e3f09ae6d6980'
     ) then
    raise exception 'Public Google projection is not exactly Cologie receipt revision 1';
  end if;
  if not public.brinesearch_issue97_google_route_current(v_cologie) then
    raise exception 'Cologie public Google route is not current';
  end if;
  if exists(
    select 1
    from public.brinesearch_driver_google_routes_public pub
    where pub.pad_id<>v_cologie
  ) then
    raise exception 'A non-Cologie public Google route was exposed';
  end if;

  v_status:=public.brinesearch_v18_driver_pad_status(v_cologie);
  if v_status#>>'{route,state}'<>'ready'
     or v_status#>>'{route,source}'<>'exact_graph'
     or v_status#>>'{graph,state}'<>'active_current'
     or v_status#>>'{google,publicState}'<>'ready' then
    raise exception 'Cologie V18 driver status did not become Google-ready: %',v_status;
  end if;

  select * into strict v_baseline
  from tmp_v18_cologie_google_release_baseline;
  if v_baseline.pad_non_google is distinct from (
       select to_jsonb(p)
         - array[
             'brinesearch_google_route_status_issue97',
             'brinesearch_google_route_revision_issue97',
             'updated_at',
             'updated_by',
             'last_updated_date',
             'last_updated_by'
           ]::text[]
       from public.pads p where p.id=v_cologie
     )
     or v_baseline.private_receipt is distinct from (
       select to_jsonb(r)
       from private_verification.brinesearch_google_route_receipts_issue97 r
       where r.pad_id=v_cologie
     )
     or v_baseline.non_google_driver_status is distinct from (
       public.brinesearch_v18_driver_pad_status(v_cologie)
         - array['google','statusRevision','checkedAt']::text[]
     )
     or v_baseline.other_pad_google_digest is distinct from (
       select pg_catalog.md5(coalesce(pg_catalog.string_agg(
         p.id::text||':'||coalesce(p.brinesearch_google_route_status_issue97,'')||':'||
         coalesce(p.brinesearch_google_route_revision_issue97,0)::text,
         '|' order by p.id
       ),''))
       from public.pads p where p.id<>v_cologie
     )
     or v_baseline.cologie_pad_google_status is distinct from (
       select p.brinesearch_google_route_status_issue97
       from public.pads p where p.id=v_cologie
     )
     or v_baseline.cologie_pad_google_revision is distinct from (
       select p.brinesearch_google_route_revision_issue97
       from public.pads p where p.id=v_cologie
     )
     or v_baseline.cologie_refresh_queue_count is distinct from (
       select count(*)
       from private_verification.brinesearch_google_route_refresh_queue_issue97 q
       where q.pad_id=v_cologie
     )
     or v_baseline.current_directory_snapshots is distinct from (
       select count(*) from public.brinesearch_directory_snapshots_v18 s
       where s.publication_state='current'
     )
     or v_baseline.current_company_road_overlays is distinct from (
       select count(*) from public.brinesearch_company_road_overlay_snapshots_v18 s
       where s.publication_state='current'
     )
     or v_baseline.approved_company_road_overlay_releases is distinct from (
       select count(*)
       from private_verification.brinesearch_v18_company_road_overlay_releases r
       where r.approval_state='approved'
     ) then
    raise exception 'Cologie release changed non-Google route, graph, pad, directory, or overlay authority';
  end if;
end
$$;

-- Prove that browser roles see Cologie only through the existing FORCE-RLS
-- public table. The private release receipt remains inaccessible.
set local role anon;
do $$
begin
  if (select count(*) from public.brinesearch_driver_google_routes_public)<>1
     or not exists(
       select 1 from public.brinesearch_driver_google_routes_public
       where pad_id='e2b32e85-9e93-4388-8215-9d8167cbbeb8'::uuid
     ) then
    raise exception 'Anon cannot read exactly the current Cologie public route';
  end if;
end
$$;
reset role;

do $$
begin
  if pg_catalog.has_table_privilege(
       'anon',
       'private_verification.brinesearch_v18_public_google_route_releases',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_public_google_route_releases',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'private_verification.brinesearch_v18_public_google_route_releases',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_public_google_release_authorizes_receipt(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_public_google_release_authorizes_receipt(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_public_google_release_authorizes_receipt(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'private_verification.brinesearch_v18_public_google_release_managed(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'private_verification.brinesearch_v18_public_google_release_managed(uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'private_verification.brinesearch_v18_public_google_release_managed(uuid)',
       'EXECUTE'
     ) then
    raise exception 'Private per-pad Google release authority leaked';
  end if;
  if not (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid=
      'private_verification.brinesearch_v18_public_google_route_releases'::pg_catalog.regclass
  ) then
    raise exception 'Private per-pad Google release table is not FORCE RLS';
  end if;
  if not pg_catalog.has_function_privilege(
       'anon','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role','public.brinesearch_issue97_google_route_current(uuid)','EXECUTE'
     ) then
    raise exception 'Public Google currentness dispatcher ACL changed';
  end if;
end
$$;
