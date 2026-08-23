-- BrineSearch V18 -- fail-closed public approved-company-road overlay.
--
-- This is a publication contract, not a live inference endpoint. A trusted
-- service-role publisher derives one immutable snapshot from the current V18
-- public directory and the exact Issue #97 route/graph receipt chain. Browser
-- roles can page only the already-approved public projection. The company
-- selector never supplies a road, route, graph, geometry, SQL fragment, or
-- approval decision.

create or replace function
  private_verification.brinesearch_v18_company_road_geometry_is_safe(
    p_geometry jsonb
  )
returns boolean
language plpgsql
immutable
parallel safe
security invoker
set search_path=''
as $$
declare
  v_geometry extensions.geometry;
begin
  if p_geometry is null
     or pg_catalog.jsonb_typeof(p_geometry)<>'object'
     or not (p_geometry ?& array['type','coordinates'])
     or (p_geometry-'type'-'coordinates')<>'{}'::jsonb
     or p_geometry->>'type' not in ('LineString','MultiLineString')
     or pg_catalog.jsonb_typeof(p_geometry->'coordinates')<>'array'
     or pg_catalog.pg_column_size(p_geometry)>2097152 then
    return false;
  end if;

  v_geometry:=extensions.st_setsrid(
    extensions.st_geomfromgeojson(p_geometry::text),4326
  );
  return v_geometry is not null
    and extensions.st_srid(v_geometry)=4326
    and extensions.st_ndims(v_geometry)=2
    and extensions.geometrytype(v_geometry) in ('LINESTRING','MULTILINESTRING')
    and extensions.st_dimension(v_geometry)=1
    and not extensions.st_isempty(v_geometry)
    and extensions.st_isvalid(v_geometry)
    and extensions.st_issimple(v_geometry)
    and extensions.st_npoints(v_geometry) between 2 and 20000
    and extensions.st_length(v_geometry::extensions.geography)>0
    and extensions.st_coveredby(
      v_geometry,
      extensions.st_makeenvelope(-84,37,-74,43,4326)
    );
exception when others then
  return false;
end;
$$;

create or replace function
  private_verification.brinesearch_v18_company_road_safe_labels(
    p_values text[],
    p_field text,
    p_max_items integer
  )
returns text[]
language sql
immutable
parallel safe
security invoker
set search_path=''
as $$
  select case
    when p_values is null
      or p_max_items is null
      or p_max_items<1
      or p_max_items>200
      or coalesce(pg_catalog.cardinality(p_values),0)>p_max_items
      or exists(
        select 1
        from pg_catalog.unnest(p_values) raw(value)
        where raw.value is null
          or case when p_field='state_code'
            then raw.value not in ('OH','PA','WV')
            else private_verification.brinesearch_v18_safe_directory_text(
              raw.value,p_field
            ) is distinct from raw.value
          end
      )
    then null
    else coalesce((
      select pg_catalog.array_agg(distinct raw.value order by raw.value)
      from pg_catalog.unnest(p_values) raw(value)
    ),'{}'::text[])
  end
$$;

-- `public.is_brinesearch_owner` is STABLE in the deployed baseline and therefore
-- cannot provide a new MVCC snapshot late in one long publisher statement.
-- This private VOLATILE check is used at approval, activation, and consumption
-- so an owner revocation committed during a build is observed before publish.
create or replace function
  private_verification.brinesearch_v18_owner_authority_current(p_actor uuid)
returns boolean
language sql
volatile
security definer
set search_path=''
as $$
  select p_actor is not null and exists(
    select 1
    from public.editor_accounts account
    join auth.users user_account on user_account.id=account.user_id
    where account.user_id=p_actor
      and user_account.email_confirmed_at is not null
      and (
        'owner'=any(coalesce(account.permissions,'{}'::text[]))
        or account.role='owner'
      )
  )
$$;

revoke all on function
  private_verification.brinesearch_v18_owner_authority_current(uuid)
from public,anon,authenticated,service_role;

-- Clone the tracked exact projection into a private bulk-only variant and
-- replace exactly one direct source-currentness predicate with the existing
-- indexed temp-cache predicate. The public single-pad projection is never
-- modified, so no browser-reachable path can opt into caller-forged temp state.
do $v18_company_road_clone_cached_exact_projection$
declare
  v_source_definition text;
  v_cached_definition text;
  v_old_name constant text:=
    'private_verification.brinesearch_v18_exact_route_projection(';
  v_new_name constant text:=
    'private_verification.brinesearch_v18_exact_route_projection_cached(';
  v_old_scope constant text:=
    'private_verification.brinesearch_issue97_dataset_scope_current(';
  v_new_scope constant text:=
    'private_verification.brinesearch_issue97_dataset_scope_current_cached(';
  v_old_name_count integer;
  v_new_name_count integer;
  v_old_scope_count integer;
  v_new_scope_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'::
      pg_catalog.regprocedure
  ) into strict v_source_definition;
  v_old_name_count:=(pg_catalog.length(v_source_definition)
    -pg_catalog.length(pg_catalog.replace(v_source_definition,v_old_name,'')))
    /pg_catalog.length(v_old_name);
  v_new_name_count:=(pg_catalog.length(v_source_definition)
    -pg_catalog.length(pg_catalog.replace(v_source_definition,v_new_name,'')))
    /pg_catalog.length(v_new_name);
  v_old_scope_count:=(pg_catalog.length(v_source_definition)
    -pg_catalog.length(pg_catalog.replace(v_source_definition,v_old_scope,'')))
    /pg_catalog.length(v_old_scope);
  v_new_scope_count:=(pg_catalog.length(v_source_definition)
    -pg_catalog.length(pg_catalog.replace(v_source_definition,v_new_scope,'')))
    /pg_catalog.length(v_new_scope);
  if v_old_name_count<>1 or v_new_name_count<>0
     or v_old_scope_count<>1 or v_new_scope_count<>0 then
    raise exception
      'V18 cached exact projection clone drifted: names %/%, scopes %/%',
      v_old_name_count,v_new_name_count,v_old_scope_count,v_new_scope_count;
  end if;

  v_cached_definition:=pg_catalog.replace(
    pg_catalog.replace(v_source_definition,v_old_name,v_new_name),
    v_old_scope,v_new_scope
  );
  execute v_cached_definition;

  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'::
      pg_catalog.regprocedure
  ) into strict v_cached_definition;
  v_old_name_count:=(pg_catalog.length(v_cached_definition)
    -pg_catalog.length(pg_catalog.replace(v_cached_definition,v_old_name,'')))
    /pg_catalog.length(v_old_name);
  v_new_name_count:=(pg_catalog.length(v_cached_definition)
    -pg_catalog.length(pg_catalog.replace(v_cached_definition,v_new_name,'')))
    /pg_catalog.length(v_new_name);
  v_old_scope_count:=(pg_catalog.length(v_cached_definition)
    -pg_catalog.length(pg_catalog.replace(v_cached_definition,v_old_scope,'')))
    /pg_catalog.length(v_old_scope);
  v_new_scope_count:=(pg_catalog.length(v_cached_definition)
    -pg_catalog.length(pg_catalog.replace(v_cached_definition,v_new_scope,'')))
    /pg_catalog.length(v_new_scope);
  if v_old_name_count<>0 or v_new_name_count<>1
     or v_old_scope_count<>0 or v_new_scope_count<>1 then
    raise exception
      'V18 cached exact projection verification failed: names %/%, scopes %/%',
      v_old_name_count,v_new_name_count,v_old_scope_count,v_new_scope_count;
  end if;
end;
$v18_company_road_clone_cached_exact_projection$;

create or replace function
  private_verification.brinesearch_v18_company_road_authority_definition_sha256()
returns text
language sql
volatile
security definer
set search_path=''
as $$
  with authority(signature) as (
    values
      ('private_verification.brinesearch_v18_safe_directory_text(text,text)'),
      ('private_verification.brinesearch_v18_company_road_geometry_is_safe(jsonb)'),
      ('private_verification.brinesearch_v18_company_road_safe_labels(text[],text,integer)'),
      ('private_verification.brinesearch_v18_owner_authority_current(uuid)'),
      ('public.is_brinesearch_owner(uuid)'),
      ('private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'),
      ('private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'),
      ('private_verification.brinesearch_issue97_prepare_scope_current_cache(text)'),
      ('private_verification.brinesearch_issue97_dataset_scope_current_cached(uuid,text,text)'),
      ('private_verification.brinesearch_issue97_prepare_graph_release_current_cache()'),
      ('private_verification.brinesearch_issue97_graph_build_release_current_cached(uuid)'),
      ('private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)'),
      ('private_verification.brinesearch_issue97_graph_build_release_current(uuid)'),
      ('private_verification.brinesearch_issue97_graph_build_sources_current(uuid)'),
      ('private_verification.brinesearch_issue97_graph_source_content_digest(uuid)'),
      ('private_verification.brinesearch_issue97_graph_name_input_digest(uuid)'),
      ('private_verification.brinesearch_issue97_graph_supplemental_input_digest(uuid)'),
      ('private_verification.brinesearch_issue97_graph_mapping_evidence(text,jsonb)'),
      ('private_verification.brinesearch_issue97_transition_google_dark_current(uuid)'),
      ('private_verification.brinesearch_issue97_transition_google_dependency(uuid)'),
      ('private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)'),
      ('private_verification.brinesearch_issue97_ingest_run_verified(uuid)'),
      ('private_verification.brinesearch_issue97_source_snapshot_fingerprint(jsonb)'),
      ('private_verification.brinesearch_issue97_pad_safety_facts(uuid)'),
      ('private_verification.brinesearch_issue97_route_data_blocked(uuid)'),
      ('private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(uuid)'),
      ('private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)'),
      ('private_verification.brinesearch_issue97_mapping_fingerprint(uuid)'),
      ('private_verification.brinesearch_issue97_identity_driver_name(uuid)'),
      ('private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)'),
      ('private_verification.brinesearch_issue97_explicit_occurrence_source_key(text,text,jsonb)'),
      ('private_verification.brinesearch_v18_valid_right_continuation(text,text,text,text,integer,jsonb,text,text,uuid)')
  )
  select pg_catalog.encode(extensions.digest(pg_catalog.string_agg(
    pg_catalog.pg_get_functiondef(
      authority.signature::pg_catalog.regprocedure
    ),E'\n' order by authority.signature
  ),'sha256'),'hex')
  from authority
$$;

revoke all on function
  private_verification.brinesearch_v18_company_road_geometry_is_safe(jsonb)
from public,anon,authenticated,service_role;
revoke all on function
  private_verification.brinesearch_v18_company_road_safe_labels(text[],text,integer)
from public,anon,authenticated,service_role;
revoke all on function
  private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)
from public,anon,authenticated,service_role;
revoke all on function
  private_verification.brinesearch_v18_company_road_authority_definition_sha256()
from public,anon,authenticated,service_role;

create table public.brinesearch_company_road_overlay_snapshots_v18 (
  snapshot_id uuid primary key default pg_catalog.gen_random_uuid(),
  directory_snapshot_id uuid not null references
    public.brinesearch_directory_snapshots_v18(snapshot_id) on delete restrict,
  schema_version smallint not null default 1,
  source_revision bigint not null,
  generated_at timestamptz not null,
  published_at timestamptz not null,
  publication_state text not null,
  retained_until timestamptz,
  row_count integer not null,
  all_row_count integer not null,
  company_row_count integer not null,
  company_count integer not null,
  available_companies text[] not null,
  authority_definition_sha256 text not null,
  content_sha256 text not null,
  constraint brinesearch_company_road_overlay_snapshot_schema_v18_check
    check(schema_version=1),
  constraint brinesearch_company_road_overlay_snapshot_revision_v18_check
    check(source_revision>=1),
  constraint brinesearch_company_road_overlay_snapshot_state_v18_check
    check(publication_state in ('current','retained','withdrawn')),
  constraint brinesearch_company_road_overlay_snapshot_retention_v18_check check(
    (
      publication_state='retained'
      and retained_until is not null
      and retained_until>published_at
    ) or (
      publication_state in ('current','withdrawn')
      and retained_until is null
    )
  ),
  constraint brinesearch_company_road_overlay_snapshot_counts_v18_check check(
    row_count>=2 and row_count<=40000
    and all_row_count>=1 and company_row_count>=1
    and row_count=all_row_count+company_row_count
    and company_count>=1 and company_count<=200
    and pg_catalog.cardinality(available_companies)=company_count
    and private_verification.brinesearch_v18_company_road_safe_labels(
      available_companies,'company',200
    )=available_companies
  ),
  constraint brinesearch_company_road_overlay_snapshot_hashes_v18_check check(
    authority_definition_sha256~'^[0-9a-f]{64}$'
    and content_sha256~'^[0-9a-f]{64}$'
  )
);

create unique index brinesearch_company_road_overlay_one_current_v18_idx
on public.brinesearch_company_road_overlay_snapshots_v18((publication_state))
where publication_state='current';
create index brinesearch_company_road_overlay_retention_v18_idx
on public.brinesearch_company_road_overlay_snapshots_v18(
  retained_until,snapshot_id
)
where publication_state='retained';

create table public.brinesearch_company_road_overlay_rows_v18 (
  snapshot_id uuid not null references
    public.brinesearch_company_road_overlay_snapshots_v18(snapshot_id)
    on delete cascade,
  selection_kind text not null,
  selection_key text not null,
  ordinal integer not null,
  display_names text[] not null,
  verified_designations text[] not null default '{}'::text[],
  company_labels text[] not null,
  state_codes text[] not null,
  county_names text[] not null,
  geometry jsonb not null,
  length_miles numeric(12,6) not null,
  primary key(snapshot_id,selection_kind,selection_key,ordinal),
  constraint brinesearch_company_road_overlay_row_selection_v18_check check(
    (selection_kind='all' and selection_key='')
    or (
      selection_kind='company'
      and private_verification.brinesearch_v18_safe_directory_text(
        selection_key,'company'
      )=selection_key
    )
  ),
  constraint brinesearch_company_road_overlay_row_ordinal_v18_check
    check(ordinal>=1 and ordinal<=10000),
  constraint brinesearch_company_road_overlay_row_labels_v18_check check(
    pg_catalog.cardinality(display_names) between 1 and 64
    and private_verification.brinesearch_v18_company_road_safe_labels(
      display_names,'safe_road_term',64
    )=display_names
    and pg_catalog.cardinality(verified_designations) between 0 and 64
    and private_verification.brinesearch_v18_company_road_safe_labels(
      verified_designations,'safe_road_term',64
    )=verified_designations
    and pg_catalog.cardinality(company_labels) between 1 and 200
    and private_verification.brinesearch_v18_company_road_safe_labels(
      company_labels,'company',200
    )=company_labels
    and pg_catalog.cardinality(county_names) between 1 and 64
    and private_verification.brinesearch_v18_company_road_safe_labels(
      county_names,'county',64
    )=county_names
    and pg_catalog.cardinality(state_codes) between 1 and 3
    and state_codes<@array['OH','PA','WV']::text[]
    and private_verification.brinesearch_v18_company_road_safe_labels(
      state_codes,'state_code',3
    )=state_codes
    and (
      selection_kind='all'
      or company_labels=array[selection_key]::text[]
    )
  ),
  constraint brinesearch_company_road_overlay_row_geometry_v18_check check(
    private_verification.brinesearch_v18_company_road_geometry_is_safe(geometry)
  ),
  constraint brinesearch_company_road_overlay_row_length_v18_check
    check(length_miles>0 and length_miles<=2000)
);

create index brinesearch_company_road_overlay_page_v18_idx
on public.brinesearch_company_road_overlay_rows_v18(
  snapshot_id,selection_kind,selection_key,ordinal
);

-- A service credential is only the publication mechanism. It is not release
-- authority. This private, one-shot receipt must first be created by an
-- authenticated BrineSearch owner for the exact current directory snapshot and
-- exact definition hash. The migration deliberately creates no receipt.
create table private_verification.brinesearch_v18_company_road_overlay_releases (
  release_id uuid primary key,
  directory_snapshot_id uuid not null references
    public.brinesearch_directory_snapshots_v18(snapshot_id) on delete restrict,
  authority_definition_sha256 text not null,
  approval_state text not null,
  approved_by uuid not null,
  approved_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  withdrawn_at timestamptz,
  overlay_snapshot_id uuid references
    public.brinesearch_company_road_overlay_snapshots_v18(snapshot_id)
    on delete restrict,
  approval_receipt_sha256 text not null,
  constraint brinesearch_v18_company_road_overlay_release_hashes_check check(
    authority_definition_sha256~'^[0-9a-f]{64}$'
    and approval_receipt_sha256~'^[0-9a-f]{64}$'
  ),
  constraint brinesearch_v18_company_road_overlay_release_expiry_check check(
    expires_at>approved_at
    and expires_at<=approved_at+interval '15 minutes'
  ),
  constraint brinesearch_v18_company_road_overlay_release_state_check check(
    (
      approval_state='approved'
      and consumed_at is null and withdrawn_at is null
      and overlay_snapshot_id is null
    ) or (
      approval_state='consumed'
      and consumed_at is not null and withdrawn_at is null
      and consumed_at>=approved_at and consumed_at<expires_at
      and overlay_snapshot_id is not null
    ) or (
      approval_state='withdrawn'
      and consumed_at is null and withdrawn_at is not null
      and withdrawn_at>=approved_at
      and overlay_snapshot_id is null
    )
  )
);

create unique index brinesearch_v18_company_road_overlay_one_approved_release_idx
on private_verification.brinesearch_v18_company_road_overlay_releases(
  (approval_state)
)
where approval_state='approved';
create index brinesearch_v18_company_road_overlay_release_expiry_idx
on private_verification.brinesearch_v18_company_road_overlay_releases(
  expires_at,release_id
)
where approval_state='approved';

alter table public.brinesearch_company_road_overlay_snapshots_v18
  enable row level security;
alter table public.brinesearch_company_road_overlay_snapshots_v18
  force row level security;
alter table public.brinesearch_company_road_overlay_rows_v18
  enable row level security;
alter table public.brinesearch_company_road_overlay_rows_v18
  force row level security;
alter table private_verification.brinesearch_v18_company_road_overlay_releases
  enable row level security;
alter table private_verification.brinesearch_v18_company_road_overlay_releases
  force row level security;

-- The tables are not a browser API. The SECURITY DEFINER page RPC below is the
-- only public projection and has a fixed allow-listed output shape.
revoke all on public.brinesearch_company_road_overlay_snapshots_v18
from public,anon,authenticated,service_role;
revoke all on public.brinesearch_company_road_overlay_rows_v18
from public,anon,authenticated,service_role;
revoke all on private_verification.brinesearch_v18_company_road_overlay_releases
from public,anon,authenticated,service_role;

create or replace function
  public.brinesearch_v18_authorize_company_road_overlay_release()
returns jsonb
language plpgsql
security definer
set search_path=''
set statement_timeout='10s'
set lock_timeout='2s'
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_directory public.brinesearch_directory_snapshots_v18%rowtype;
  v_release_id uuid:=pg_catalog.gen_random_uuid();
  v_approved_at timestamptz;
  v_expires_at timestamptz;
  v_authority_hash text;
  v_receipt_hash text;
begin
  if not private_verification.brinesearch_v18_owner_authority_current(v_actor) then
    raise exception 'Owner access required' using errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
  );
  if not private_verification.brinesearch_v18_owner_authority_current(v_actor) then
    raise exception 'Owner access changed while awaiting publication lock'
      using errcode='42501';
  end if;
  -- Approval time begins only after both publication locks are held. A lock
  -- wait can never spend part or all of a receipt's bounded lifetime.
  v_approved_at:=pg_catalog.clock_timestamp();
  v_expires_at:=v_approved_at+interval '15 minutes';
  select snapshot.* into strict v_directory
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';
  if v_directory.row_count<1 or v_directory.row_count>10000
     or v_directory.retained_until is not null then
    raise exception 'V18 company-road release requires one bounded current directory snapshot';
  end if;
  v_authority_hash:=
    private_verification.brinesearch_v18_company_road_authority_definition_sha256();
  if v_authority_hash!~'^[0-9a-f]{64}$' then
    raise exception 'V18 company-road release authority hash is unavailable';
  end if;
  v_receipt_hash:=pg_catalog.encode(extensions.digest(pg_catalog.concat_ws('|',
    'brinesearch-v18-company-road-overlay-release-v1',v_release_id::text,
    v_directory.snapshot_id::text,v_authority_hash,v_actor::text,
    pg_catalog.to_char(v_approved_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US'),
    pg_catalog.to_char(v_expires_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US')
  ),'sha256'),'hex');

  update private_verification.brinesearch_v18_company_road_overlay_releases
  set approval_state='withdrawn',withdrawn_at=v_approved_at
  where approval_state='approved';
  insert into private_verification.brinesearch_v18_company_road_overlay_releases(
    release_id,directory_snapshot_id,authority_definition_sha256,
    approval_state,approved_by,approved_at,expires_at,
    consumed_at,withdrawn_at,overlay_snapshot_id,approval_receipt_sha256
  ) values(
    v_release_id,v_directory.snapshot_id,v_authority_hash,
    'approved',v_actor,v_approved_at,v_expires_at,
    null,null,null,v_receipt_hash
  );

  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'approvalState','approved',
    'directorySnapshotId',v_directory.snapshot_id,
    'approvedAt',v_approved_at,
    'expiresAt',v_expires_at
  );
end;
$$;

revoke all on function
  public.brinesearch_v18_authorize_company_road_overlay_release()
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_authorize_company_road_overlay_release()
to authenticated;

create or replace function
  private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
set statement_timeout='14min'
set lock_timeout='30s'
as $$
declare
  v_directory public.brinesearch_directory_snapshots_v18%rowtype;
  v_final_directory public.brinesearch_directory_snapshots_v18%rowtype;
  v_release private_verification.brinesearch_v18_company_road_overlay_releases%rowtype;
  v_snapshot_id uuid:=pg_catalog.gen_random_uuid();
  v_generated_at timestamptz;
  v_publish_at timestamptz;
  v_consume_at timestamptz;
  v_source_revision bigint;
  v_candidate_route_count integer:=0;
  v_prequalified_route_count integer:=0;
  v_eligible_route_count integer:=0;
  v_expected_occurrence_count integer:=0;
  v_observed_occurrence_count integer:=0;
  v_part_count integer:=0;
  v_all_row_count integer:=0;
  v_company_row_count integer:=0;
  v_company_count integer:=0;
  v_max_selection_row_count integer:=0;
  v_max_selection_point_count bigint:=0;
  v_source_scope_count integer:=0;
  v_scope_cache_count integer:=0;
  v_graph_cache_input_count integer:=0;
  v_release_consumed_count integer:=0;
  v_available_companies text[]:='{}'::text[];
  v_authority_hash text;
  v_final_authority_hash text;
  v_content_hash text;
begin
  -- Directory first, overlay second: the directory publisher obtains locks in
  -- this same order when its statement trigger withdraws an overlay snapshot.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
  );
  v_generated_at:=pg_catalog.clock_timestamp();

  select snapshot.* into strict v_directory
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.publication_state='current';
  if v_directory.row_count<1 or v_directory.row_count>10000
     or v_directory.retained_until is not null then
    raise exception 'V18 company-road overlay requires one bounded current directory snapshot';
  end if;

  select coalesce(pg_catalog.max(snapshot.source_revision),0)+1
  into v_source_revision
  from public.brinesearch_company_road_overlay_snapshots_v18 snapshot;
  v_authority_hash:=
    private_verification.brinesearch_v18_company_road_authority_definition_sha256();
  if v_authority_hash!~'^[0-9a-f]{64}$' then
    raise exception 'V18 company-road authority definition hash is unavailable';
  end if;
  select release.* into strict v_release
  from private_verification.brinesearch_v18_company_road_overlay_releases release
  where release.approval_state='approved'
    and release.directory_snapshot_id=v_directory.snapshot_id
    and release.authority_definition_sha256=v_authority_hash
    and release.approved_at<=pg_catalog.clock_timestamp()
    and release.expires_at>pg_catalog.clock_timestamp()
  for update;
  if not private_verification.brinesearch_v18_owner_authority_current(
       v_release.approved_by
     )
     or v_release.approval_receipt_sha256 is distinct from
       pg_catalog.encode(extensions.digest(pg_catalog.concat_ws('|',
         'brinesearch-v18-company-road-overlay-release-v1',
         v_release.release_id::text,v_release.directory_snapshot_id::text,
         v_release.authority_definition_sha256,v_release.approved_by::text,
         pg_catalog.to_char(v_release.approved_at at time zone 'UTC',
           'YYYY-MM-DD"T"HH24:MI:SS.US'),
         pg_catalog.to_char(v_release.expires_at at time zone 'UTC',
           'YYYY-MM-DD"T"HH24:MI:SS.US')
       ),'sha256'),'hex') then
    raise exception 'V18 company-road owner release receipt is invalid';
  end if;

  -- Bound the public-directory candidate population before invoking any
  -- currentness/projection function. The later projection CTE is MATERIALIZED,
  -- so its exact call count is the prequalified row count recorded below.
  select count(*)::integer into v_candidate_route_count
  from public.brinesearch_directory_snapshot_rows_v18 row
  where row.snapshot_id=v_directory.snapshot_id
    and row.company is not null
    and exists(
      select 1 from public.brinesearch_route_prep route
      where route.pad_id=row.pad_id and route.active
        and route.route_group='primary'
    );
  if v_candidate_route_count>5000 then
    raise exception 'V18 company-road unbounded directory route scope: %',
      v_candidate_route_count;
  end if;

  create temporary table tmp_v18_company_road_candidates(
    company_label text not null,
    pad_id uuid not null,
    route_prep_id uuid not null,
    expected_occurrences integer not null,
    primary key(company_label,pad_id),
    unique(route_prep_id)
  ) on commit drop;

  insert into tmp_v18_company_road_candidates(
    company_label,pad_id,route_prep_id,expected_occurrences
  )
  select row.company,row.pad_id,route.id,receipt.road_occurrence_count
  from public.brinesearch_directory_snapshot_rows_v18 row
  join public.brinesearch_route_prep route
    on route.pad_id=row.pad_id and route.active
    and route.route_group='primary' and route.variant_index=1
  join private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt
    on receipt.route_prep_id=route.id and receipt.pad_id=row.pad_id
  join public.pads pad on pad.id=row.pad_id
  join public.pad_verification_status verification
    on verification.pad_id=row.pad_id and verification.gps_verified
  join private_verification.brinesearch_google_route_receipts_issue97 google
    on google.pad_id=row.pad_id
  where row.snapshot_id=v_directory.snapshot_id
    and row.company is not null
    and row.company=private_verification.brinesearch_v18_safe_directory_text(
      row.company,'company'
    )
    and row.record_type in ('pad','disposal')
    and row.coordinate_state='verified'
    and row.driver_latitude is not distinct from pad.latitude
    and row.driver_longitude is not distinct from pad.longitude
    and not coalesce(pad.list_only,false)
    and route.readiness_status='ready_for_road_matching'
    and receipt.route_status='route_ready' and receipt.stage='ready'
    and receipt.route_group='primary' and receipt.variant_index=1
    and receipt.source_sequence_hash=route.source_sequence_hash
    and pg_catalog.cardinality(receipt.exception_reasons)=0
    and receipt.road_occurrence_count between 2 and 256
    and receipt.resolved_occurrence_count=receipt.road_occurrence_count
    and receipt.held_occurrence_count=0
    and receipt.canonical_mapping_count=receipt.road_occurrence_count
    and receipt.exact_geometry_count=receipt.road_occurrence_count
    and google.status='ready' and google.hold_reason is null
    and google.manifest_version='issue97-google-v1'
    and google.evidence->>'manifest_mode'='transition_geometry'
    and google.evidence->>'publication_mode'='private_dark'
    and coalesce(
      (google.evidence->>'public_projected')::boolean,true
    )=false
    and coalesce((google.evidence->>'no_guess')::boolean,false)
    and google.manifest->>'manifest_mode'='transition_geometry'
    and google.manifest->>'publication_mode'='private_dark'
    and coalesce(
      (google.manifest->>'public_projected')::boolean,true
    )=false
    and google.manifest->>'status'='ready'
    and coalesce((google.manifest->>'route_ready')::boolean,false)
    and 1=(
      select count(*)
      from public.brinesearch_route_prep exact_route
      where exact_route.pad_id=row.pad_id and exact_route.active
        and exact_route.route_group='primary'
    );

  select count(*)::integer,coalesce(pg_catalog.sum(
    candidate.expected_occurrences-1
  ),0)::integer
  into v_prequalified_route_count,v_expected_occurrence_count
  from tmp_v18_company_road_candidates candidate;
  if v_prequalified_route_count<1 or v_prequalified_route_count>1000
     or v_expected_occurrence_count<1 or v_expected_occurrence_count>40000 then
    raise exception
      'V18 company-road pre-projection bound failed: routes %, occurrences %',
      v_prequalified_route_count,v_expected_occurrence_count;
  end if;

  select count(*)::integer into v_source_scope_count
  from public.brinesearch_road_source_dataset_counties scope
  join public.brinesearch_road_source_datasets dataset
    on dataset.id=scope.dataset_id and dataset.active
  where scope.active and scope.ingest_enabled
    and scope.state_code in ('OH','PA','WV');
  select count(*)::integer into v_graph_cache_input_count
  from public.brinesearch_road_graph_builds build
  where build.status in ('active','validated');
  if v_source_scope_count<1 or v_source_scope_count>200
     or v_graph_cache_input_count<1 or v_graph_cache_input_count>200 then
    raise exception 'V18 company-road cache input bound failed: scopes %, builds %',
      v_source_scope_count,v_graph_cache_input_count;
  end if;
  -- Never trust a same-session temp table supplied by the service caller.
  -- Rebuild the scope cache inside this locked SECURITY DEFINER publication.
  drop table if exists pg_temp.tmp_issue97_scope_current_cache;
  perform private_verification.brinesearch_issue97_prepare_scope_current_cache('OH');
  perform private_verification.brinesearch_issue97_prepare_scope_current_cache('PA');
  perform private_verification.brinesearch_issue97_prepare_scope_current_cache('WV');
  select count(*)::integer into v_scope_cache_count
  from pg_temp.tmp_issue97_scope_current_cache;
  if v_scope_cache_count<>v_source_scope_count
     or exists(
       select scope.dataset_id,scope.state_code,scope.county_code
       from public.brinesearch_road_source_dataset_counties scope
       join public.brinesearch_road_source_datasets dataset
         on dataset.id=scope.dataset_id and dataset.active
       where scope.active and scope.ingest_enabled
         and scope.state_code in ('OH','PA','WV')
       except
       select cache.dataset_id,cache.state_code,cache.county_code
       from pg_temp.tmp_issue97_scope_current_cache cache
     )
     or exists(
       select cache.dataset_id,cache.state_code,cache.county_code
       from pg_temp.tmp_issue97_scope_current_cache cache
       except
       select scope.dataset_id,scope.state_code,scope.county_code
       from public.brinesearch_road_source_dataset_counties scope
       join public.brinesearch_road_source_datasets dataset
         on dataset.id=scope.dataset_id and dataset.active
       where scope.active and scope.ingest_enabled
         and scope.state_code in ('OH','PA','WV')
     ) then
    raise exception 'V18 company-road source-currentness cache is incomplete';
  end if;
  perform private_verification.brinesearch_issue97_prepare_graph_release_current_cache();
  if (select count(*) from pg_temp.tmp_issue97_graph_release_current_cache)
       <>v_graph_cache_input_count then
    raise exception 'V18 company-road release-current cache is incomplete';
  end if;

  create temporary table tmp_v18_company_road_prequalified_routes(
    company_label text not null,
    pad_id uuid not null,
    route_prep_id uuid primary key,
    expected_occurrences integer not null
  ) on commit drop;
  insert into tmp_v18_company_road_prequalified_routes(
    company_label,pad_id,route_prep_id,expected_occurrences
  )
  select candidate.company_label,candidate.pad_id,candidate.route_prep_id,
    candidate.expected_occurrences
  from tmp_v18_company_road_candidates candidate
  join private_verification.brinesearch_route_transition_receipts_issue97 transition
    on transition.route_prep_id=candidate.route_prep_id
  join public.brinesearch_road_graph_builds build
    on build.id=transition.graph_build_id
  join pg_temp.tmp_issue97_graph_release_current_cache graph_cache
    on graph_cache.build_id=build.id
  group by candidate.company_label,candidate.pad_id,candidate.route_prep_id,
    candidate.expected_occurrences
  having count(*)=candidate.expected_occurrences-1
    and min(transition.boundary_index)=1
    and max(transition.boundary_index)=candidate.expected_occurrences-1
    and pg_catalog.bool_and(coalesce(
      transition.pad_id=candidate.pad_id
      and transition.route_group='primary' and transition.variant_index=1
      and transition.status='resolved' and transition.hold_reason is null
      and build.status='active'
      and build.source_revision_digest=transition.source_revision_digest
      and graph_cache.current,false
    ));
  select count(*)::integer into v_prequalified_route_count
  from tmp_v18_company_road_prequalified_routes;
  if v_prequalified_route_count<1 or v_prequalified_route_count>1000 then
    raise exception 'V18 company-road bounded projection call count failed: %',
      v_prequalified_route_count;
  end if;

  create temporary table tmp_v18_company_road_routes(
    company_label text not null,
    pad_id uuid not null,
    route_prep_id uuid not null,
    expected_occurrences integer not null,
    route_projection jsonb not null,
    primary key(company_label,pad_id),
    unique(route_prep_id)
  ) on commit drop;
  with projection as materialized (
    select candidate.*,
      private_verification.brinesearch_v18_exact_route_projection_cached(
        candidate.route_prep_id,candidate.expected_occurrences
      ) as route_projection
    from tmp_v18_company_road_prequalified_routes candidate
  )
  insert into tmp_v18_company_road_routes(
    company_label,pad_id,route_prep_id,expected_occurrences,route_projection
  )
  select projection.company_label,projection.pad_id,projection.route_prep_id,
    projection.expected_occurrences,projection.route_projection
  from projection
  where projection.route_projection is not null
    and pg_catalog.jsonb_typeof(projection.route_projection->'steps')='array'
    and pg_catalog.jsonb_typeof(
      projection.route_projection#>'{geometry,features}'
    )='array'
    and pg_catalog.jsonb_array_length(projection.route_projection->'steps')=
      projection.expected_occurrences-1
    and pg_catalog.jsonb_array_length(
      projection.route_projection#>'{geometry,features}'
    )=projection.expected_occurrences-1;

  select count(*)::integer into v_eligible_route_count
  from tmp_v18_company_road_routes;
  if v_eligible_route_count<1
     or v_eligible_route_count<>v_prequalified_route_count then
    raise exception
      'V18 company-road exact projection failed: projected %, calls %',
      v_eligible_route_count,v_prequalified_route_count;
  end if;

  create temporary table tmp_v18_company_road_occurrences(
    occurrence_row_id bigint generated always as identity primary key,
    company_label text not null,
    pad_id uuid not null,
    route_prep_id uuid not null,
    occurrence_index integer not null,
    display_name text not null,
    verified_designations text[] not null,
    state_code text not null,
    county_name text not null,
    step_geometry extensions.geometry(LineString,4326) not null,
    unique(company_label,pad_id,route_prep_id,occurrence_index)
  ) on commit drop;

  insert into tmp_v18_company_road_occurrences(
    company_label,pad_id,route_prep_id,occurrence_index,display_name,
    verified_designations,state_code,county_name,step_geometry
  )
  select eligible.company_label,eligible.pad_id,eligible.route_prep_id,
    occurrence.occurrence_index,occurrence.driver_road_name,
    occurrence.valid_aliases,identity.state_code,identity.county_name,
    geometry.step_geometry
  from tmp_v18_company_road_routes eligible
  join private_verification.brinesearch_route_occurrence_receipts_issue97 occurrence
    on occurrence.route_prep_id=eligible.route_prep_id
    and occurrence.pad_id=eligible.pad_id
    and occurrence.occurrence_index>1
  join private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 geometry
    on geometry.route_prep_id=occurrence.route_prep_id
    and geometry.route_prep_step_id=occurrence.route_prep_step_id
    and geometry.occurrence_index=occurrence.occurrence_index
  join public.brinesearch_authoritative_road_identities identity
    on identity.id=occurrence.identity_id and identity.active
  join public.brinesearch_road_identity_mappings mapping
    on mapping.identity_id=occurrence.identity_id
    and mapping.road_id=occurrence.canonical_road_id
    and mapping.mapping_status='verified'
  join public.brinesearch_roads road
    on road.id=occurrence.canonical_road_id
  cross join lateral (
    select
      eligible.route_projection->'steps'->(
        occurrence.occurrence_index-2
      ) as public_step,
      eligible.route_projection#>'{geometry,features}'->(
        occurrence.occurrence_index-2
      ) as public_feature
  ) projected
  where occurrence.route_group='primary' and occurrence.variant_index=1
    and occurrence.resolution_status='resolved'
    and occurrence.hold_reason is null
    and occurrence.identity_id is not null
    and occurrence.canonical_road_id is not null
    and occurrence.source_digest=identity.source_digest
    and occurrence.mapping_fingerprint=
      private_verification.brinesearch_issue97_mapping_fingerprint(
        occurrence.identity_id
      )
    and occurrence.driver_road_name=
      private_verification.brinesearch_v18_safe_directory_text(
        occurrence.driver_road_name,'safe_road_term'
      )
    and occurrence.valid_aliases=
      private_verification.brinesearch_v18_company_road_safe_labels(
        occurrence.valid_aliases,'safe_road_term',64
      )
    and identity.public_access_status='public'
    and identity.drivable_status='drivable'
    and private_verification.brinesearch_issue97_dataset_scope_current_cached(
      identity.dataset_id,identity.state_code,identity.county_code
    )
    and road.verification_status='verified'
    and not coalesce(road.candidate_only,false)
    and coalesce(road.approved_by_default,false)
    and geometry.status='resolved' and geometry.hold_reason is null
    and geometry.occurrence_role='traveled'
    and geometry.identity_id=occurrence.identity_id
    and geometry.road_id=occurrence.canonical_road_id
    and geometry.road_geometry_digest=
      private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(
        occurrence.identity_id
      )
    and extensions.geometrytype(geometry.step_geometry)='LINESTRING'
    and extensions.st_srid(geometry.step_geometry)=4326
    and extensions.st_isvalid(geometry.step_geometry)
    and extensions.st_issimple(geometry.step_geometry)
    and not extensions.st_isempty(geometry.step_geometry)
    and extensions.st_npoints(geometry.step_geometry) between 2 and 20000
    and extensions.st_length(geometry.step_geometry::extensions.geography)>0
    and extensions.st_coveredby(
      geometry.step_geometry,
      extensions.st_makeenvelope(-84,37,-74,43,4326)
    )
    and projected.public_step->>'order'=(occurrence.occurrence_index-1)::text
    and projected.public_step->>'displayName'=occurrence.driver_road_name
    and projected.public_step->'verifiedDesignations'=
      pg_catalog.to_jsonb(occurrence.valid_aliases)
    and projected.public_feature#>>'{properties,stepOrder}'=
      (occurrence.occurrence_index-1)::text
    and projected.public_feature->'geometry'=
      extensions.st_asgeojson(geometry.step_geometry,9,0)::jsonb
    and private_verification.brinesearch_v18_company_road_geometry_is_safe(
      projected.public_feature->'geometry'
    )
    and not exists(
      select 1
      from private_verification.brinesearch_route_transition_receipts_issue97 transition
      left join public.brinesearch_road_graph_builds build
        on build.id=transition.graph_build_id
      where transition.route_prep_id=eligible.route_prep_id
        and (
          transition.status is distinct from 'resolved'
          or transition.hold_reason is not null
          or build.id is null or build.status is distinct from 'active'
          or private_verification.brinesearch_issue97_graph_build_release_current_cached(
            build.id
          ) is distinct from true
        )
    );

  select coalesce(pg_catalog.sum(
    eligible.expected_occurrences-1
  ),0)::integer into v_expected_occurrence_count
  from tmp_v18_company_road_routes eligible;
  select count(*)::integer into v_observed_occurrence_count
  from tmp_v18_company_road_occurrences;
  if v_observed_occurrence_count<>v_expected_occurrence_count
     or exists(
       select 1
       from tmp_v18_company_road_routes eligible
       left join tmp_v18_company_road_occurrences occurrence
         on occurrence.route_prep_id=eligible.route_prep_id
         and occurrence.pad_id=eligible.pad_id
         and occurrence.company_label=eligible.company_label
       group by eligible.company_label,eligible.pad_id,
         eligible.route_prep_id,eligible.expected_occurrences
       having count(occurrence.occurrence_row_id)<>
         eligible.expected_occurrences-1
     ) then
    raise exception
      'V18 company-road exact occurrence projection failed: expected %, observed %',
      v_expected_occurrence_count,v_observed_occurrence_count;
  end if;

  create index tmp_v18_company_road_occurrences_geometry_idx
  on tmp_v18_company_road_occurrences using gist(step_geometry);

  create temporary table tmp_v18_company_road_scoped_occurrences(
    scoped_occurrence_id bigint generated always as identity primary key,
    selection_kind text not null,
    selection_key text not null,
    company_label text not null,
    display_name text not null,
    verified_designations text[] not null,
    state_code text not null,
    county_name text not null,
    step_geometry extensions.geometry(LineString,4326) not null
  ) on commit drop;

  insert into tmp_v18_company_road_scoped_occurrences(
    selection_kind,selection_key,company_label,display_name,
    verified_designations,state_code,county_name,step_geometry
  )
  select 'all','',occurrence.company_label,occurrence.display_name,
    occurrence.verified_designations,occurrence.state_code,
    occurrence.county_name,occurrence.step_geometry
  from tmp_v18_company_road_occurrences occurrence
  union all
  select 'company',occurrence.company_label,occurrence.company_label,
    occurrence.display_name,occurrence.verified_designations,
    occurrence.state_code,occurrence.county_name,occurrence.step_geometry
  from tmp_v18_company_road_occurrences occurrence;

  create index tmp_v18_company_road_scoped_geometry_idx
  on tmp_v18_company_road_scoped_occurrences using gist(step_geometry);
  create index tmp_v18_company_road_scoped_selection_idx
  on tmp_v18_company_road_scoped_occurrences(selection_kind,selection_key);
  analyze tmp_v18_company_road_scoped_occurrences;

  create temporary table tmp_v18_company_road_scope_unions(
    selection_kind text not null,
    selection_key text not null,
    union_geometry extensions.geometry not null,
    primary key(selection_kind,selection_key)
  ) on commit drop;
  insert into tmp_v18_company_road_scope_unions(
    selection_kind,selection_key,union_geometry
  )
  select scoped.selection_kind,scoped.selection_key,
    extensions.st_unaryunion(extensions.st_collect(scoped.step_geometry))
  from tmp_v18_company_road_scoped_occurrences scoped
  group by scoped.selection_kind,scoped.selection_key;

  if exists(
    select 1 from tmp_v18_company_road_scope_unions scope
    where scope.union_geometry is null
      or extensions.st_isempty(scope.union_geometry)
      or extensions.st_dimension(scope.union_geometry)<>1
      or not extensions.st_isvalid(scope.union_geometry)
      or not extensions.st_coveredby(
        scope.union_geometry,
        extensions.st_makeenvelope(-84,37,-74,43,4326)
      )
  ) then
    raise exception 'V18 company-road exact union geometry is invalid';
  end if;

  create temporary table tmp_v18_company_road_parts(
    part_id bigint generated always as identity primary key,
    selection_kind text not null,
    selection_key text not null,
    part_geometry extensions.geometry(LineString,4326) not null
  ) on commit drop;
  insert into tmp_v18_company_road_parts(
    selection_kind,selection_key,part_geometry
  )
  select scope.selection_kind,scope.selection_key,
    extensions.st_force2d((dumped).geom)::extensions.geometry(LineString,4326)
  from tmp_v18_company_road_scope_unions scope
  cross join lateral extensions.st_subdivide(
    scope.union_geometry,256
  ) subdivided(part_geometry)
  cross join lateral extensions.st_dump(
    extensions.st_collectionextract(subdivided.part_geometry,2)
  ) dumped
  where extensions.geometrytype((dumped).geom)='LINESTRING'
    and not extensions.st_isempty((dumped).geom)
    and extensions.st_length((dumped).geom::extensions.geography)>0;

  select count(*)::integer into v_part_count
  from tmp_v18_company_road_parts;
  if v_part_count<2 or v_part_count>40000
     or exists(
       select 1 from tmp_v18_company_road_parts part
       where extensions.st_npoints(part.part_geometry)>256
         or not extensions.st_isvalid(part.part_geometry)
         or not extensions.st_issimple(part.part_geometry)
         or not extensions.st_coveredby(
           part.part_geometry,
           extensions.st_makeenvelope(-84,37,-74,43,4326)
         )
     ) then
    raise exception 'V18 company-road bounded part contract failed: %',v_part_count;
  end if;

  create index tmp_v18_company_road_parts_geometry_idx
  on tmp_v18_company_road_parts using gist(part_geometry);
  create index tmp_v18_company_road_parts_selection_idx
  on tmp_v18_company_road_parts(selection_kind,selection_key);
  analyze tmp_v18_company_road_parts;

  create temporary table tmp_v18_company_road_part_links(
    part_id bigint not null,
    scoped_occurrence_id bigint not null,
    primary key(part_id,scoped_occurrence_id)
  ) on commit drop;
  insert into tmp_v18_company_road_part_links(part_id,scoped_occurrence_id)
  select part.part_id,occurrence.scoped_occurrence_id
  from tmp_v18_company_road_parts part
  join tmp_v18_company_road_scoped_occurrences occurrence
    on occurrence.selection_kind=part.selection_kind
    and occurrence.selection_key=part.selection_key
    and occurrence.step_geometry&&part.part_geometry
  cross join lateral (
    select extensions.st_intersection(
      occurrence.step_geometry,part.part_geometry
    ) as overlap_geometry
  ) overlap
  where not extensions.st_isempty(overlap.overlap_geometry)
    and extensions.st_dimension(overlap.overlap_geometry)=1
    and extensions.st_length(overlap.overlap_geometry)>0;

  if exists(
    select 1 from tmp_v18_company_road_parts part
    where not exists(
      select 1 from tmp_v18_company_road_part_links link
      where link.part_id=part.part_id
    )
  ) then
    raise exception 'V18 company-road union part has no exact source occurrence';
  end if;

  create temporary table tmp_v18_company_road_public_rows(
    public_row_id bigint generated always as identity primary key,
    selection_kind text not null,
    selection_key text not null,
    ordinal integer,
    display_names text[] not null,
    verified_designations text[] not null,
    company_labels text[] not null,
    state_codes text[] not null,
    county_names text[] not null,
    geometry jsonb not null,
    length_miles numeric(12,6) not null,
    part_geometry extensions.geometry(LineString,4326) not null
  ) on commit drop;

  insert into tmp_v18_company_road_public_rows(
    selection_kind,selection_key,display_names,verified_designations,
    company_labels,state_codes,county_names,geometry,length_miles,part_geometry
  )
  select part.selection_kind,part.selection_key,
    pg_catalog.array_agg(distinct occurrence.display_name
      order by occurrence.display_name),
    coalesce((
      select pg_catalog.array_agg(distinct designation order by designation)
      from tmp_v18_company_road_part_links designation_link
      join tmp_v18_company_road_scoped_occurrences designation_occurrence
        on designation_occurrence.scoped_occurrence_id=
          designation_link.scoped_occurrence_id
      cross join lateral pg_catalog.unnest(
        designation_occurrence.verified_designations
      ) designation
      where designation_link.part_id=part.part_id
    ),'{}'::text[]),
    pg_catalog.array_agg(distinct occurrence.company_label
      order by occurrence.company_label),
    pg_catalog.array_agg(distinct occurrence.state_code
      order by occurrence.state_code),
    pg_catalog.array_agg(distinct occurrence.county_name
      order by occurrence.county_name),
    extensions.st_asgeojson(part.part_geometry,9,0)::jsonb,
    pg_catalog.round((extensions.st_length(
      part.part_geometry::extensions.geography
    )/1609.344)::numeric,6),
    part.part_geometry
  from tmp_v18_company_road_parts part
  join tmp_v18_company_road_part_links link on link.part_id=part.part_id
  join tmp_v18_company_road_scoped_occurrences occurrence
    on occurrence.scoped_occurrence_id=link.scoped_occurrence_id
  group by part.part_id,part.selection_kind,part.selection_key,
    part.part_geometry;

  if exists(
    select 1 from tmp_v18_company_road_public_rows row
    where pg_catalog.cardinality(row.display_names) not between 1 and 64
      or row.display_names is distinct from
        private_verification.brinesearch_v18_company_road_safe_labels(
          row.display_names,'safe_road_term',64
        )
      or pg_catalog.cardinality(row.verified_designations)>64
      or row.verified_designations is distinct from
        private_verification.brinesearch_v18_company_road_safe_labels(
          row.verified_designations,'safe_road_term',64
        )
      or pg_catalog.cardinality(row.company_labels) not between 1 and 200
      or row.company_labels is distinct from
        private_verification.brinesearch_v18_company_road_safe_labels(
          row.company_labels,'company',200
        )
      or pg_catalog.cardinality(row.county_names) not between 1 and 64
      or row.county_names is distinct from
        private_verification.brinesearch_v18_company_road_safe_labels(
          row.county_names,'county',64
        )
      or pg_catalog.cardinality(row.state_codes) not between 1 and 3
      or not row.state_codes<@array['OH','PA','WV']::text[]
      or not private_verification.brinesearch_v18_company_road_geometry_is_safe(
        row.geometry
      )
      or row.length_miles<=0
      or (
        row.selection_kind='company'
        and row.company_labels<>array[row.selection_key]::text[]
      )
  ) then
    raise exception 'V18 company-road public row allow-list failed';
  end if;

  -- Unary union is the approval-preserving dedupe operation. Prove that no two
  -- rows in one selector still cover the same positive-length pavement.
  if exists(
    select 1
    from tmp_v18_company_road_public_rows left_row
    join tmp_v18_company_road_public_rows right_row
      on right_row.selection_kind=left_row.selection_kind
      and right_row.selection_key=left_row.selection_key
      and right_row.public_row_id>left_row.public_row_id
      and right_row.part_geometry&&left_row.part_geometry
    cross join lateral (
      select extensions.st_intersection(
        left_row.part_geometry,right_row.part_geometry
      ) as overlap_geometry
    ) overlap
    where not extensions.st_isempty(overlap.overlap_geometry)
      and extensions.st_dimension(overlap.overlap_geometry)=1
      and extensions.st_length(overlap.overlap_geometry)>0
  ) then
    raise exception 'V18 company-road dedupe left overlapping public geometry';
  end if;

  with ranked as (
    select row.public_row_id,pg_catalog.row_number() over(
      partition by row.selection_kind,row.selection_key
      order by row.display_names,row.verified_designations,row.company_labels,
        row.state_codes,row.county_names,row.geometry::text
    )::integer as ordinal
    from tmp_v18_company_road_public_rows row
  )
  update tmp_v18_company_road_public_rows row
  set ordinal=ranked.ordinal
  from ranked where row.public_row_id=ranked.public_row_id;

  select count(*) filter(where row.selection_kind='all')::integer,
    count(*) filter(where row.selection_kind='company')::integer,
    count(distinct row.selection_key) filter(
      where row.selection_kind='company'
    )::integer
  into v_all_row_count,v_company_row_count,v_company_count
  from tmp_v18_company_road_public_rows row;
  if v_all_row_count<1 or v_company_row_count<1
     or v_company_count<1 or v_company_count>200
     or v_all_row_count+v_company_row_count<>v_part_count then
    raise exception 'V18 company-road selector counts are inconsistent';
  end if;

  select coalesce(pg_catalog.max(bounds.selection_row_count),0),
    coalesce(pg_catalog.max(bounds.selection_point_count),0)
  into v_max_selection_row_count,v_max_selection_point_count
  from (
    select row.selection_kind,row.selection_key,
      count(*)::integer as selection_row_count,
      pg_catalog.sum(extensions.st_npoints(row.part_geometry))::bigint
        as selection_point_count
    from tmp_v18_company_road_public_rows row
    group by row.selection_kind,row.selection_key
  ) bounds;
  if v_max_selection_row_count>10000
     or v_max_selection_point_count>250000 then
    raise exception
      'V18 company-road device bound failed: max rows %, max points %',
      v_max_selection_row_count,v_max_selection_point_count;
  end if;
  select pg_catalog.array_agg(
    distinct row.selection_key order by row.selection_key
  ) into v_available_companies
  from tmp_v18_company_road_public_rows row
  where row.selection_kind='company';
  if pg_catalog.cardinality(v_available_companies)<>v_company_count
     or v_available_companies is distinct from
       private_verification.brinesearch_v18_company_road_safe_labels(
         v_available_companies,'company',200
       ) then
    raise exception 'V18 company-road company option set is invalid';
  end if;

  select pg_catalog.encode(extensions.digest(coalesce(
    pg_catalog.string_agg(pg_catalog.jsonb_build_object(
      'selectionKind',row.selection_kind,
      'selectionKey',row.selection_key,
      'ordinal',row.ordinal,
      'displayNames',pg_catalog.to_jsonb(row.display_names),
      'verifiedDesignations',pg_catalog.to_jsonb(row.verified_designations),
      'companies',pg_catalog.to_jsonb(row.company_labels),
      'states',pg_catalog.to_jsonb(row.state_codes),
      'counties',pg_catalog.to_jsonb(row.county_names),
      'geometry',row.geometry,
      'lengthMiles',row.length_miles
    )::text,E'\n' order by row.selection_kind,row.selection_key,row.ordinal
    ),''),'sha256'),'hex')
  into v_content_hash
  from tmp_v18_company_road_public_rows row;
  if v_content_hash!~'^[0-9a-f]{64}$' then
    raise exception 'V18 company-road content hash generation failed';
  end if;

  -- Stage the immutable rows in a withdrawn, non-public generation. No build
  -- or row-insert delay is allowed between the final authority check and the
  -- current-state transition below.
  insert into public.brinesearch_company_road_overlay_snapshots_v18(
    snapshot_id,directory_snapshot_id,schema_version,source_revision,
    generated_at,published_at,publication_state,retained_until,row_count,
    all_row_count,company_row_count,company_count,available_companies,
    authority_definition_sha256,content_sha256
  ) values(
    v_snapshot_id,v_directory.snapshot_id,1,v_source_revision,
    v_generated_at,v_generated_at,'withdrawn',null,v_part_count,
    v_all_row_count,v_company_row_count,v_company_count,v_available_companies,
    v_authority_hash,v_content_hash
  );

  insert into public.brinesearch_company_road_overlay_rows_v18(
    snapshot_id,selection_kind,selection_key,ordinal,display_names,
    verified_designations,company_labels,state_codes,county_names,
    geometry,length_miles
  )
  select v_snapshot_id,row.selection_kind,row.selection_key,row.ordinal,
    row.display_names,row.verified_designations,row.company_labels,
    row.state_codes,row.county_names,row.geometry,row.length_miles
  from tmp_v18_company_road_public_rows row
  order by row.selection_kind,row.selection_key,row.ordinal;

  -- Revalidate every authorization input at the actual activation instant.
  -- statement_timestamp() is deliberately not used: lock/build delay cannot
  -- extend a receipt, preserve a revoked owner, or approve changed code.
  select snapshot.* into strict v_final_directory
  from public.brinesearch_directory_snapshots_v18 snapshot
  where snapshot.snapshot_id=v_directory.snapshot_id
    and snapshot.publication_state='current'
    and snapshot.retained_until is null;
  if v_final_directory.source_revision<>v_directory.source_revision
     or v_final_directory.content_sha256 is distinct from
       v_directory.content_sha256 then
    raise exception 'V18 company-road directory authority changed during build';
  end if;
  v_final_authority_hash:=
    private_verification.brinesearch_v18_company_road_authority_definition_sha256();
  if v_final_authority_hash is distinct from v_authority_hash then
    raise exception 'V18 company-road authority definition changed during build';
  end if;
  v_publish_at:=pg_catalog.clock_timestamp();
  if v_release.approval_state<>'approved'
     or v_release.directory_snapshot_id<>v_final_directory.snapshot_id
     or v_release.authority_definition_sha256<>v_final_authority_hash
     or v_release.approved_at>v_publish_at
     or v_release.expires_at<=v_publish_at
     or not private_verification.brinesearch_v18_owner_authority_current(
       v_release.approved_by
     ) then
    raise exception 'V18 company-road owner release expired or changed during build';
  end if;

  update public.brinesearch_company_road_overlay_snapshots_v18
  set publication_state='withdrawn',retained_until=null
  where publication_state='retained'
    and retained_until<=v_publish_at
    and snapshot_id<>v_snapshot_id;
  update public.brinesearch_company_road_overlay_snapshots_v18
  set publication_state='retained',
    retained_until=v_publish_at+interval '15 minutes'
  where publication_state='current';
  update public.brinesearch_company_road_overlay_snapshots_v18
  set publication_state='current',retained_until=null,
    published_at=v_publish_at,
    authority_definition_sha256=v_final_authority_hash
  where snapshot_id=v_snapshot_id;
  v_consume_at:=pg_catalog.clock_timestamp();
  update private_verification.brinesearch_v18_company_road_overlay_releases
  set approval_state='consumed',consumed_at=v_consume_at,
    overlay_snapshot_id=v_snapshot_id
  where release_id=v_release.release_id and approval_state='approved'
    and directory_snapshot_id=v_directory.snapshot_id
    and authority_definition_sha256=v_final_authority_hash
    and approved_by=v_release.approved_by
    and approved_at<=v_consume_at
    and expires_at>v_consume_at
    and private_verification.brinesearch_v18_owner_authority_current(approved_by);
  get diagnostics v_release_consumed_count=row_count;
  if v_release_consumed_count<>1 then
    raise exception 'V18 company-road owner release was not consumed exactly once';
  end if;

  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'snapshotId',v_snapshot_id,
    'sourceRevision',v_source_revision::text,
    'directorySnapshotId',v_directory.snapshot_id,
    'publicationState','current',
    'rowCount',v_part_count,
    'allRowCount',v_all_row_count,
    'companyRowCount',v_company_row_count,
    'companyCount',v_company_count,
    'candidateRouteCount',v_candidate_route_count,
    'boundedProjectionCallCount',v_prequalified_route_count,
    'eligibleRouteCount',v_eligible_route_count,
    'ownerReleaseConsumed',true,
    'approvedOccurrenceCount',v_observed_occurrence_count,
    'contentSha256',v_content_hash,
    'retainedUntil',null
  );
end;
$$;

revoke all on function
  private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()
from public,anon,authenticated,service_role;
grant usage on schema private_verification to service_role;
grant execute on function
  private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()
to service_role;

create or replace function
  private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()
returns trigger
language plpgsql
security definer
set search_path=''
set statement_timeout='30s'
set lock_timeout='5s'
as $$
begin
  -- Source relations shared with the directory contract may fire this trigger
  -- before the directory trigger (trigger names sort lexically). Always acquire
  -- the directory lock first so source DML and both publishers use one order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:directory-snapshot',18)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('brinesearch:v18:company-road-overlay',18)
  );
  -- Source mutation revokes every public generation immediately. Retention is
  -- granted only by an ordinary successful publisher transition.
  update public.brinesearch_company_road_overlay_snapshots_v18
  set publication_state='withdrawn',retained_until=null
  where publication_state in ('current','retained');
  update private_verification.brinesearch_v18_company_road_overlay_releases
  set approval_state='withdrawn',
    withdrawn_at=pg_catalog.clock_timestamp()
  where approval_state='approved';
  return null;
end;
$$;

revoke all on function
  private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()
from public,anon,authenticated,service_role;

-- Every mutable relation read directly or transitively by the exact public
-- route/graph approval chain withdraws the current overlay at statement scope.
-- Retained snapshots remain readable only for their already-started bounded
-- paging window; expired retained rows are withdrawn in the same transaction.
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.pads;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.pads for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.public_pad_detail;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.public_pad_detail for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.pad_verification_status;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.pad_verification_status for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_directory_snapshots_v18;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_directory_snapshots_v18 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_directory_snapshot_rows_v18;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_directory_snapshot_rows_v18 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_route_prep;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_route_prep for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_route_prep_steps;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_route_prep_steps for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_roads;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_roads for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_identity_mappings;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_identity_mappings for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_authoritative_road_identities;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_authoritative_road_identities for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_authoritative_road_names;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_authoritative_road_names for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_authoritative_external_road_segments;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_authoritative_external_road_segments for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_authoritative_segment_identity_assignments;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_authoritative_segment_identity_assignments for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_odot_road_catalog;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_odot_road_catalog for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_graph_counties;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_graph_counties for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_source_datasets;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_source_datasets for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_source_dataset_counties;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_source_dataset_counties for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_source_ingest_runs;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_source_ingest_runs for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_source_ingest_pages;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_source_ingest_pages for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_authoritative_supplemental_centerlines;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_authoritative_supplemental_centerlines for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_supplemental_centerline_identity_mappings;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_supplemental_centerline_identity_mappings for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_supplemental_centerline_dispositions;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_supplemental_centerline_dispositions for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_graph_builds;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_graph_builds for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_junctions;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_junctions for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_junction_anchors;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_junction_anchors for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on public.brinesearch_road_junction_memberships;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on public.brinesearch_road_junction_memberships for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_route_reconciliation_receipts_issue97;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_route_reconciliation_receipts_issue97 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_route_occurrence_receipts_issue97;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_route_occurrence_receipts_issue97 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_route_occurrence_geometry_receipts_issue97;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_route_occurrence_geometry_receipts_issue97 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_route_transition_receipts_issue97;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_route_transition_receipts_issue97 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_google_route_receipts_issue97;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_google_route_receipts_issue97 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_driver_safety_facts_issue69;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_driver_safety_facts_issue69 for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_issue97_graph_release_generations;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_issue97_graph_release_generations for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();
drop trigger if exists brinesearch_v18_company_road_overlay_invalidate on private_verification.brinesearch_issue97_graph_release_qualifications;
create trigger brinesearch_v18_company_road_overlay_invalidate after insert or update or delete or truncate on private_verification.brinesearch_issue97_graph_release_qualifications for each statement execute function private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change();

create or replace function public.brinesearch_v18_company_road_overlay_page(
  p_snapshot_id uuid default null,
  p_company text default null,
  p_after_ordinal integer default 0,
  p_limit integer default 250
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
set statement_timeout='2500ms'
set lock_timeout='500ms'
as $$
declare
  v_snapshot public.brinesearch_company_road_overlay_snapshots_v18%rowtype;
  v_selection_kind text:=case when p_company is null then 'all' else 'company' end;
  v_selection_key text:=coalesce(p_company,'');
  v_available_companies text[]:='{}'::text[];
  v_rows jsonb:='[]'::jsonb;
  v_selection_count integer:=0;
  v_page_count integer:=0;
  v_next_ordinal integer:=p_after_ordinal;
begin
  if p_after_ordinal is null or p_after_ordinal<0 then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','invalid_cursor'
    );
  end if;
  if p_limit is null or p_limit<1 or p_limit>500 then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','invalid_limit','maximumLimit',500
    );
  end if;
  if p_company is not null and (
    p_company<>pg_catalog.btrim(p_company)
    or p_company='' or private_verification.brinesearch_v18_safe_directory_text(
      p_company,'company'
    ) is distinct from p_company
  ) then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','invalid_company'
    );
  end if;

  if p_snapshot_id is null then
    select snapshot.* into v_snapshot
    from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
    where snapshot.publication_state='current'
    order by snapshot.source_revision desc
    limit 1;
  else
    select snapshot.* into v_snapshot
    from public.brinesearch_company_road_overlay_snapshots_v18 snapshot
    where snapshot.snapshot_id=p_snapshot_id
      and (
        snapshot.publication_state='current'
        or (
          snapshot.publication_state='retained'
          and snapshot.retained_until>pg_catalog.statement_timestamp()
        )
      );
  end if;

  if not found
     or v_snapshot.authority_definition_sha256 is distinct from
       private_verification.brinesearch_v18_company_road_authority_definition_sha256()
  then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,
      'error',case when p_snapshot_id is null
        then 'overlay_unavailable' else 'snapshot_expired' end,
      'requestedSnapshotId',p_snapshot_id
    );
  end if;

  v_available_companies:=v_snapshot.available_companies;
  if pg_catalog.cardinality(v_available_companies)<>v_snapshot.company_count
     or pg_catalog.cardinality(v_available_companies)>200
     or v_available_companies is distinct from
       private_verification.brinesearch_v18_company_road_safe_labels(
         v_available_companies,'company',200
       ) then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','overlay_unavailable'
    );
  end if;
  if p_company is not null and not p_company=any(v_available_companies) then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','invalid_company',
      'availableCompanies',pg_catalog.to_jsonb(v_available_companies)
    );
  end if;

  v_selection_count:=case when v_selection_kind='all'
    then v_snapshot.all_row_count
    else (
      select count(*)::integer
      from public.brinesearch_company_road_overlay_rows_v18 row
      where row.snapshot_id=v_snapshot.snapshot_id
        and row.selection_kind='company'
        and row.selection_key=v_selection_key
    ) end;
  if p_after_ordinal>v_selection_count then
    return pg_catalog.jsonb_build_object(
      'schemaVersion',1,'error','invalid_cursor'
    );
  end if;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'ordinal',page.ordinal,
      'companyLabel',case when page.selection_kind='company'
        then page.selection_key else null end,
      'companies',pg_catalog.to_jsonb(page.company_labels),
      'displayNames',pg_catalog.to_jsonb(page.display_names),
      'verifiedDesignations',pg_catalog.to_jsonb(page.verified_designations),
      'states',pg_catalog.to_jsonb(page.state_codes),
      'counties',pg_catalog.to_jsonb(page.county_names),
      'geometry',page.geometry,
      'lengthMiles',page.length_miles
    ) order by page.ordinal
  ),'[]'::jsonb),count(*)::integer,
    coalesce(pg_catalog.max(page.ordinal),p_after_ordinal)
  into v_rows,v_page_count,v_next_ordinal
  from (
    select row.*
    from public.brinesearch_company_road_overlay_rows_v18 row
    where row.snapshot_id=v_snapshot.snapshot_id
      and row.selection_kind=v_selection_kind
      and row.selection_key=v_selection_key
      and row.ordinal>p_after_ordinal
    order by row.ordinal
    limit p_limit
  ) page;

  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'selection',pg_catalog.jsonb_build_object(
      'kind',v_selection_kind,
      'company',p_company
    ),
    'availableCompanies',pg_catalog.to_jsonb(v_available_companies),
    'snapshot',pg_catalog.jsonb_build_object(
      'snapshotId',v_snapshot.snapshot_id,
      'directorySnapshotId',v_snapshot.directory_snapshot_id,
      'sourceRevision',v_snapshot.source_revision::text,
      'generatedAt',v_snapshot.generated_at,
      'publishedAt',v_snapshot.published_at,
      'publicationState',v_snapshot.publication_state,
      'retainedUntil',v_snapshot.retained_until,
      'rowCount',v_selection_count,
      'companyCount',v_snapshot.company_count
    ),
    'page',pg_catalog.jsonb_build_object(
      'afterOrdinal',p_after_ordinal,
      'nextAfterOrdinal',v_next_ordinal,
      'rowCount',v_page_count,
      'complete',v_next_ordinal>=v_selection_count
    ),
    'rows',v_rows
  );
exception when others then
  return pg_catalog.jsonb_build_object(
    'schemaVersion',1,'error','overlay_unavailable'
  );
end;
$$;

revoke all on function
  public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)
from public,anon,authenticated,service_role;
grant execute on function
  public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)
to anon,authenticated,service_role;

-- Replace the bootstrap digest only after every executable publication path,
-- output relation, policy, constraint, and invalidation trigger exists. The
-- function intentionally hashes its own final definition: changing this
-- canonical allow-list is itself an authority change.
create or replace function
  private_verification.brinesearch_v18_company_road_authority_definition_sha256()
returns text
language sql
volatile
security definer
set search_path=''
as $$
  with function_authority(signature) as (
    values
      ('private_verification.brinesearch_v18_safe_directory_text(text,text)'),
      ('private_verification.brinesearch_v18_company_road_geometry_is_safe(jsonb)'),
      ('private_verification.brinesearch_v18_company_road_safe_labels(text[],text,integer)'),
      ('private_verification.brinesearch_v18_owner_authority_current(uuid)'),
      ('private_verification.brinesearch_v18_company_road_authority_definition_sha256()'),
      ('public.brinesearch_v18_authorize_company_road_overlay_release()'),
      ('private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()'),
      ('private_verification.brinesearch_v18_withdraw_company_road_overlay_on_source_change()'),
      ('public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)'),
      ('public.is_brinesearch_owner(uuid)'),
      ('private_verification.brinesearch_v18_exact_route_projection(uuid,integer)'),
      ('private_verification.brinesearch_v18_exact_route_projection_cached(uuid,integer)'),
      ('private_verification.brinesearch_issue97_prepare_scope_current_cache(text)'),
      ('private_verification.brinesearch_issue97_dataset_scope_current_cached(uuid,text,text)'),
      ('private_verification.brinesearch_issue97_prepare_graph_release_current_cache()'),
      ('private_verification.brinesearch_issue97_graph_build_release_current_cached(uuid)'),
      ('private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)'),
      ('private_verification.brinesearch_issue97_graph_build_release_current(uuid)'),
      ('private_verification.brinesearch_issue97_graph_build_sources_current(uuid)'),
      ('private_verification.brinesearch_issue97_graph_source_content_digest(uuid)'),
      ('private_verification.brinesearch_issue97_graph_name_input_digest(uuid)'),
      ('private_verification.brinesearch_issue97_graph_supplemental_input_digest(uuid)'),
      ('private_verification.brinesearch_issue97_graph_mapping_evidence(text,jsonb)'),
      ('private_verification.brinesearch_issue97_transition_google_dark_current(uuid)'),
      ('private_verification.brinesearch_issue97_transition_google_dependency(uuid)'),
      ('private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)'),
      ('private_verification.brinesearch_issue97_ingest_run_verified(uuid)'),
      ('private_verification.brinesearch_issue97_source_snapshot_fingerprint(jsonb)'),
      ('private_verification.brinesearch_issue97_pad_safety_facts(uuid)'),
      ('private_verification.brinesearch_issue97_route_data_blocked(uuid)'),
      ('private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(uuid)'),
      ('private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)'),
      ('private_verification.brinesearch_issue97_mapping_fingerprint(uuid)'),
      ('private_verification.brinesearch_issue97_identity_driver_name(uuid)'),
      ('private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)'),
      ('private_verification.brinesearch_issue97_explicit_occurrence_source_key(text,text,jsonb)'),
      ('private_verification.brinesearch_v18_valid_right_continuation(text,text,text,text,integer,jsonb,text,text,uuid)')
  ), relation_authority(signature) as (
    values
      ('auth.users'),
      ('private_verification.brinesearch_driver_safety_facts_issue69'),
      ('private_verification.brinesearch_google_route_receipts_issue97'),
      ('private_verification.brinesearch_issue97_authoritative_road_segments_internal'),
      ('private_verification.brinesearch_issue97_graph_release_generations'),
      ('private_verification.brinesearch_issue97_graph_release_qualifications'),
      ('private_verification.brinesearch_route_occurrence_geometry_receipts_issue97'),
      ('private_verification.brinesearch_route_occurrence_receipts_issue97'),
      ('private_verification.brinesearch_route_reconciliation_receipts_issue97'),
      ('private_verification.brinesearch_route_transition_receipts_issue97'),
      ('private_verification.brinesearch_v18_company_road_overlay_releases'),
      ('public.brinesearch_authoritative_external_road_segments'),
      ('public.brinesearch_authoritative_road_identities'),
      ('public.brinesearch_authoritative_road_names'),
      ('public.brinesearch_authoritative_segment_identity_assignments'),
      ('public.brinesearch_authoritative_supplemental_centerlines'),
      ('public.brinesearch_company_road_overlay_rows_v18'),
      ('public.brinesearch_company_road_overlay_snapshots_v18'),
      ('public.brinesearch_directory_snapshot_rows_v18'),
      ('public.brinesearch_directory_snapshots_v18'),
      ('public.editor_accounts'),
      ('public.brinesearch_odot_road_catalog'),
      ('public.brinesearch_road_graph_builds'),
      ('public.brinesearch_road_graph_counties'),
      ('public.brinesearch_road_identity_mappings'),
      ('public.brinesearch_road_junction_anchors'),
      ('public.brinesearch_road_junction_memberships'),
      ('public.brinesearch_road_junctions'),
      ('public.brinesearch_road_source_dataset_counties'),
      ('public.brinesearch_road_source_datasets'),
      ('public.brinesearch_road_source_ingest_pages'),
      ('public.brinesearch_road_source_ingest_runs'),
      ('public.brinesearch_roads'),
      ('public.brinesearch_route_prep'),
      ('public.brinesearch_route_prep_steps'),
      ('public.brinesearch_supplemental_centerline_dispositions'),
      ('public.brinesearch_supplemental_centerline_identity_mappings'),
      ('public.pad_verification_status'),
      ('public.pads'),
      ('public.public_pad_detail')
  ), function_definition as (
    select 'function'::text as kind,authority.signature::text as identity,
      pg_catalog.concat_ws(E'\n',
        pg_catalog.pg_get_functiondef(procedure.oid),
        'owner='||pg_catalog.pg_get_userbyid(procedure.proowner),
        'acl='||coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f',procedure.proowner)
        )::text
      ) as definition
    from function_authority authority
    join pg_catalog.pg_proc procedure
      on procedure.oid=authority.signature::pg_catalog.regprocedure
  ), relation_definition as (
    select 'relation'::text,authority.signature::text,
      pg_catalog.concat_ws('|',relation.relkind::text,
        relation.relrowsecurity::text,relation.relforcerowsecurity::text,
        pg_catalog.pg_get_userbyid(relation.relowner),
        coalesce(relation.reloptions::text,''),
        coalesce(
          relation.relacl,pg_catalog.acldefault('r',relation.relowner)
        )::text
      )
    from relation_authority authority
    join pg_catalog.pg_class relation
      on relation.oid=authority.signature::pg_catalog.regclass
  ), constraint_definition as (
    select 'constraint'::text,
      constraint_row.conrelid::pg_catalog.regclass::text||'.'||
        constraint_row.conname,
      pg_catalog.pg_get_constraintdef(constraint_row.oid,true)
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid in (
      select authority.signature::pg_catalog.regclass
      from relation_authority authority
    )
  ), policy_definition as (
    select 'policy'::text,
      policy.polrelid::pg_catalog.regclass::text||'.'||policy.polname,
      pg_catalog.concat_ws('|',policy.polpermissive::text,policy.polcmd::text,
        policy.polroles::text,
        coalesce(pg_catalog.pg_get_expr(
          policy.polqual,policy.polrelid
        ),''),
        coalesce(pg_catalog.pg_get_expr(
          policy.polwithcheck,policy.polrelid
        ),'')
      )
    from pg_catalog.pg_policy policy
    where policy.polrelid in (
      select authority.signature::pg_catalog.regclass
      from relation_authority authority
    )
  ), trigger_definition as (
    select 'trigger'::text,
      trigger_row.tgrelid::pg_catalog.regclass::text||'.'||trigger_row.tgname,
      pg_catalog.concat_ws('|',trigger_row.tgenabled::text,
        pg_catalog.pg_get_triggerdef(trigger_row.oid,true)
      )
    from pg_catalog.pg_trigger trigger_row
    where not trigger_row.tgisinternal
      and trigger_row.tgrelid in (
        select authority.signature::pg_catalog.regclass
        from relation_authority authority
      )
  ), view_definition as (
    select 'view'::text,authority.signature::text,
      pg_catalog.pg_get_viewdef(authority.signature::pg_catalog.regclass,true)
    from relation_authority authority
    join pg_catalog.pg_class relation
      on relation.oid=authority.signature::pg_catalog.regclass
    where relation.relkind in ('v','m')
  ), authority(kind,identity,definition) as (
    select * from function_definition
    union all select * from relation_definition
    union all select * from constraint_definition
    union all select * from policy_definition
    union all select * from trigger_definition
    union all select * from view_definition
  )
  select pg_catalog.encode(extensions.digest(pg_catalog.string_agg(
    pg_catalog.concat_ws('|',authority.kind,authority.identity,
      authority.definition),E'\n'
    order by authority.kind,authority.identity
  ),'sha256'),'hex')
  from authority
$$;

revoke all on function
  private_verification.brinesearch_v18_company_road_authority_definition_sha256()
from public,anon,authenticated,service_role;

comment on function
  private_verification.brinesearch_v18_refresh_company_road_overlay_snapshot()
is 'Service-only V18 company-road publisher gated by one unexpired, one-shot authenticated-owner release receipt. Only exact/current route geometry on active/current graphs, public/drivable authoritative identities, verified mappings, and explicitly approved non-candidate roads can enter the immutable public overlay.';
comment on function
  public.brinesearch_v18_authorize_company_road_overlay_release()
is 'Authenticated owner-only, no-input authorization for one exact current-directory company-road overlay publication. The receipt expires within 15 minutes and can be consumed once.';
comment on function
  public.brinesearch_v18_company_road_overlay_page(uuid,text,integer,integer)
is 'Bounded immutable V18 approved-road overlay page. NULL company means All; any non-NULL company must exactly match a server-published company option. No route, road, graph, pad, receipt, digest, hold reason, or private Google identifier is returned.';

-- Deliberately no automatic authorization or refresh. Installing this contract
-- leaves the private release table empty and cannot publish or change an
-- overlay. A separate authenticated-owner authorization and then one
-- service-role publisher call are both required after exact graph/route state
-- is known to be ready.
