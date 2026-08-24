-- GitHub #97 — automatic all-route reconciliation receipts and exception queue.
--
-- This is deliberately a reconciliation layer, not a name matcher. Exact names,
-- saved canonical road IDs and route numbers are candidate-generation evidence
-- only. An occurrence is resolved only by an explicit authoritative source
-- receipt or by one unique physical identity path through the active #97 graph.
-- Raw source identities are never bulk-promoted into brinesearch_roads here.

create schema if not exists private_verification;

create or replace function private_verification.brinesearch_issue97_route_state_code(p_state text)
returns text
language sql
immutable
strict
set search_path=''
as $$
  select case pg_catalog.upper(pg_catalog.btrim(p_state))
    when 'OH' then 'OH' when 'OHIO' then 'OH'
    when 'WV' then 'WV' when 'WEST VIRGINIA' then 'WV'
    when 'PA' then 'PA' when 'PENNSYLVANIA' then 'PA'
    else null end
$$;

create or replace function private_verification.brinesearch_issue97_normalize_route_token(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.lower(coalesce(p_value,'')),'[^a-z0-9]+',' ','g'
  ))
$$;

create or replace function private_verification.brinesearch_issue97_explicit_occurrence_source_key(
  p_state text,
  p_match_method text,
  p_source_details jsonb
)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_state text:=private_verification.brinesearch_issue97_route_state_code(coalesce(p_state,''));
  v_explicit text:=nullif(pg_catalog.btrim(coalesce(
    p_source_details->>'source_identity_key',
    p_source_details->>'authoritative_identity_key',
    ''
  )), '');
  v_record text:=nullif(pg_catalog.btrim(coalesce(p_source_details->>'source_record_id','')), '');
  v_proven boolean:=pg_catalog.lower(coalesce(p_source_details->>'authoritative_identity_proof','')) in ('true','t','1','yes')
    or coalesce(p_source_details->>'method','')='official centerline measurement; no route guessing';
begin
  if v_explicit is not null and v_proven then return v_explicit; end if;
  if not v_proven then return null; end if;
  if v_state='OH' and v_record is not null then
    return 'OH:ODOT:NLF:'||pg_catalog.split_part(v_record,'|',1);
  end if;
  if v_state='WV' and nullif(p_source_details->>'wvdot_route_id','') is not null then
    return 'WV:WVDOT:ROUTE_ID:'||(p_source_details->>'wvdot_route_id');
  end if;
  return null;
end
$$;

revoke all on function private_verification.brinesearch_issue97_route_state_code(text)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_normalize_route_token(text)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_explicit_occurrence_source_key(text,text,jsonb)
from public,anon,authenticated,service_role;

create table private_verification.brinesearch_route_occurrence_candidates_issue97 (
  route_prep_step_id uuid not null references public.brinesearch_route_prep_steps(id) on delete cascade,
  identity_id uuid not null references public.brinesearch_authoritative_road_identities(id) on delete cascade,
  canonical_road_id uuid references public.brinesearch_roads(id) on delete set null,
  candidate_basis text not null,
  strong_proof boolean not null default false,
  source_identity_key text not null,
  source_digest text not null,
  mapping_fingerprint text,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(route_prep_step_id,identity_id,candidate_basis),
  constraint brinesearch_route_occurrence_candidates_basis_issue97_check check(
    candidate_basis in (
      'explicit_authoritative_source_receipt',
      'saved_canonical_road_mapping_candidate',
      'exact_authoritative_name_candidate',
      'exact_authoritative_designation_candidate'
    )
  )
);

create index brinesearch_route_occurrence_candidates_identity_issue97_idx
on private_verification.brinesearch_route_occurrence_candidates_issue97(identity_id,route_prep_step_id);

create table private_verification.brinesearch_route_occurrence_receipts_issue97 (
  route_prep_step_id uuid primary key references public.brinesearch_route_prep_steps(id) on delete cascade,
  route_prep_id uuid not null references public.brinesearch_route_prep(id) on delete cascade,
  pad_id uuid not null references public.pads(id) on delete cascade,
  route_group text not null,
  variant_index integer not null,
  source_step_order integer not null,
  occurrence_index integer not null,
  raw_text text not null,
  normalized_text text not null,
  step_kind text not null,
  input_road_id uuid references public.brinesearch_roads(id) on delete set null,
  input_digest text not null,
  resolution_status text not null,
  resolution_method text,
  hold_reason text,
  identity_id uuid references public.brinesearch_authoritative_road_identities(id) on delete restrict,
  canonical_road_id uuid references public.brinesearch_roads(id) on delete restrict,
  source_identity_key text,
  driver_road_name text,
  valid_aliases text[] not null default '{}'::text[],
  source_digest text,
  mapping_fingerprint text,
  candidate_count integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  receipt_digest text not null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint brinesearch_route_occurrence_receipts_status_issue97_check
    check(resolution_status in ('resolved','held','stale')),
  constraint brinesearch_route_occurrence_receipts_no_guess_issue97_check
    check(coalesce(resolution_method,'') not in ('name_only','fuzzy_name','nearest_road','route_number_only')),
  constraint brinesearch_route_occurrence_receipts_resolved_issue97_check check(
    resolution_status<>'resolved' or (
      identity_id is not null and source_identity_key is not null
      and driver_road_name is not null and source_digest is not null
      and hold_reason is null and resolved_at is not null
    )
  ),
  constraint brinesearch_route_occurrence_receipts_held_issue97_check check(
    resolution_status<>'held' or nullif(hold_reason,'') is not null
  ),
  constraint brinesearch_route_occurrence_receipts_digest_issue97_check
    check(receipt_digest~'^[0-9a-f]{32}$')
);

create unique index brinesearch_route_occurrence_receipts_route_order_issue97_idx
on private_verification.brinesearch_route_occurrence_receipts_issue97(route_prep_id,occurrence_index);
create index brinesearch_route_occurrence_receipts_status_issue97_idx
on private_verification.brinesearch_route_occurrence_receipts_issue97(resolution_status,hold_reason);

create table private_verification.brinesearch_route_occurrence_receipt_history_issue97 (
  id bigint generated always as identity primary key,
  route_prep_step_id uuid not null,
  route_prep_id uuid not null,
  pad_id uuid not null,
  route_group text not null,
  variant_index integer not null,
  source_step_order integer not null,
  occurrence_index integer not null,
  resolution_status text not null,
  resolution_method text,
  hold_reason text,
  identity_id uuid,
  canonical_road_id uuid,
  source_identity_key text,
  driver_road_name text,
  valid_aliases text[] not null,
  input_digest text not null,
  source_digest text,
  mapping_fingerprint text,
  candidate_count integer not null,
  evidence jsonb not null,
  receipt_digest text not null,
  recorded_at timestamptz not null default now(),
  unique(route_prep_step_id,receipt_digest),
  constraint brinesearch_route_occurrence_history_status_issue97_check
    check(resolution_status in ('resolved','held','stale')),
  constraint brinesearch_route_occurrence_history_digest_issue97_check
    check(receipt_digest~'^[0-9a-f]{32}$')
);

create table private_verification.brinesearch_route_reconciliation_receipts_issue97 (
  route_prep_id uuid primary key references public.brinesearch_route_prep(id) on delete cascade,
  pad_id uuid not null references public.pads(id) on delete cascade,
  route_group text not null,
  variant_index integer not null,
  source_sequence_hash text not null,
  route_status text not null,
  stage text not null,
  road_occurrence_count integer not null,
  resolved_occurrence_count integer not null,
  held_occurrence_count integer not null,
  canonical_mapping_count integer not null,
  exact_geometry_count integer not null,
  google_manifest_status text,
  exception_reasons text[] not null default '{}'::text[],
  dependency_digest text not null,
  evidence jsonb not null default '{}'::jsonb,
  receipt_digest text not null,
  updated_at timestamptz not null default now(),
  constraint brinesearch_route_reconciliation_status_issue97_check
    check(route_status in ('route_ready','needs_review','stale')),
  constraint brinesearch_route_reconciliation_stage_issue97_check check(stage in (
    'identity_reconciliation','canonical_mapping','exact_geometry','google_manifest','ready'
  )),
  constraint brinesearch_route_reconciliation_counts_issue97_check check(
    road_occurrence_count>=0 and resolved_occurrence_count>=0 and held_occurrence_count>=0
    and canonical_mapping_count>=0 and exact_geometry_count>=0
    and resolved_occurrence_count+held_occurrence_count<=road_occurrence_count
  ),
  constraint brinesearch_route_reconciliation_digest_issue97_check
    check(receipt_digest~'^[0-9a-f]{32}$')
);

create index brinesearch_route_reconciliation_status_issue97_idx
on private_verification.brinesearch_route_reconciliation_receipts_issue97(route_status,stage);

create table private_verification.brinesearch_route_reconciliation_history_issue97 (
  id bigint generated always as identity primary key,
  route_prep_id uuid not null,
  pad_id uuid not null,
  route_group text not null,
  variant_index integer not null,
  route_status text not null,
  stage text not null,
  road_occurrence_count integer not null,
  resolved_occurrence_count integer not null,
  held_occurrence_count integer not null,
  canonical_mapping_count integer not null,
  exact_geometry_count integer not null,
  google_manifest_status text,
  exception_reasons text[] not null,
  dependency_digest text not null,
  evidence jsonb not null,
  receipt_digest text not null,
  recorded_at timestamptz not null default now(),
  unique(route_prep_id,receipt_digest)
);

do $issue97_batch_rls$
declare v_table text;
begin
  foreach v_table in array array[
    'brinesearch_route_occurrence_candidates_issue97',
    'brinesearch_route_occurrence_receipts_issue97',
    'brinesearch_route_occurrence_receipt_history_issue97',
    'brinesearch_route_reconciliation_receipts_issue97',
    'brinesearch_route_reconciliation_history_issue97'
  ] loop
    execute pg_catalog.format('alter table private_verification.%I enable row level security',v_table);
    execute pg_catalog.format('alter table private_verification.%I force row level security',v_table);
    execute pg_catalog.format('revoke all on private_verification.%I from public,anon,authenticated,service_role',v_table);
  end loop;
end
$issue97_batch_rls$;

create or replace function private_verification.brinesearch_issue97_identity_driver_name(p_identity_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select n.road_name
    from public.brinesearch_authoritative_road_names n
    where n.identity_id=i.id and n.active
      and (n.valid_from is null or n.valid_from<=now())
      and (n.valid_to is null or n.valid_to>now())
      and private_verification.brinesearch_issue97_dataset_scope_current(
        n.source_dataset_id,i.state_code,i.county_code
      )
    order by case n.name_type
      when 'official' then 1 when 'signed' then 2 when 'local' then 3
      when '911' then 4 when 'alternate' then 5 when 'legacy' then 6 else 7 end,
      n.road_name
    limit 1
  ),i.display_name)
  from public.brinesearch_authoritative_road_identities i
  where i.id=p_identity_id and i.active
$$;

create or replace function private_verification.brinesearch_issue97_identity_aliases(
  p_identity_id uuid,
  p_road_id uuid default null
)
returns text[]
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(array(
    select distinct value
    from (
      select i.display_name as value
      from public.brinesearch_authoritative_road_identities i where i.id=p_identity_id
      union all
      select pg_catalog.btrim(pg_catalog.concat_ws(' ',i.route_system,i.route_number,
        nullif(i.route_suffix,''),nullif(i.route_fraction,''),nullif(i.route_extension,'')))
      from public.brinesearch_authoritative_road_identities i where i.id=p_identity_id
      union all
      select n.road_name
      from public.brinesearch_authoritative_road_names n
      join public.brinesearch_authoritative_road_identities i on i.id=n.identity_id
      where n.identity_id=p_identity_id and n.active
        and (n.valid_from is null or n.valid_from<=now())
        and (n.valid_to is null or n.valid_to>now())
        and private_verification.brinesearch_issue97_dataset_scope_current(
          n.source_dataset_id,i.state_code,i.county_code
        )
      union all
      select r.canonical_name from public.brinesearch_roads r where r.id=p_road_id
      union all
      select unnest(coalesce(r.aliases,'{}'::text[])) from public.brinesearch_roads r where r.id=p_road_id
    ) names
    where nullif(pg_catalog.btrim(coalesce(value,'')),'') is not null
    order by value
  ),'{}'::text[])
$$;

create or replace function private_verification.brinesearch_issue97_identities_connected(
  p_left_identity uuid,
  p_right_identity uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select p_left_identity=p_right_identity or exists(
    select 1
    from public.brinesearch_road_junction_memberships l
    join public.brinesearch_road_junctions j on j.id=l.junction_id
    join public.brinesearch_road_junction_memberships r
      on r.junction_id=j.id and r.identity_id=p_right_identity
    join public.brinesearch_road_graph_builds b
      on b.id=j.build_id and b.status='active'
    where l.identity_id=p_left_identity
      and j.verification_status='verified'
      and private_verification.brinesearch_issue97_graph_build_sources_current(b.id)
  )
$$;

revoke all on function private_verification.brinesearch_issue97_identity_driver_name(uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_identities_connected(uuid,uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_write_occurrence_history(
  p_step_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into private_verification.brinesearch_route_occurrence_receipt_history_issue97(
    route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,
    source_step_order,occurrence_index,resolution_status,resolution_method,hold_reason,
    identity_id,canonical_road_id,source_identity_key,driver_road_name,valid_aliases,
    input_digest,source_digest,mapping_fingerprint,candidate_count,evidence,receipt_digest
  )
  select route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,
    source_step_order,occurrence_index,resolution_status,resolution_method,hold_reason,
    identity_id,canonical_road_id,source_identity_key,driver_road_name,valid_aliases,
    input_digest,source_digest,mapping_fingerprint,candidate_count,evidence,receipt_digest
  from private_verification.brinesearch_route_occurrence_receipts_issue97
  where route_prep_step_id=p_step_id
  on conflict(route_prep_step_id,receipt_digest) do nothing;
end
$$;

revoke all on function private_verification.brinesearch_issue97_write_occurrence_history(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_refresh_occurrence_candidate(
  p_step_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_step record;
  v_state text;
  v_token text;
  v_source_key text;
  v_occurrence_index integer;
  v_input_digest text;
  v_candidate_count integer:=0;
  v_strong_count integer:=0;
  v_identity uuid;
  v_road uuid;
  v_driver text;
  v_aliases text[];
  v_source_digest text;
  v_mapping_fingerprint text;
  v_status text:='held';
  v_method text;
  v_reason text;
  v_evidence jsonb:='{}'::jsonb;
begin
  select s.*,p.pad_id,p.route_group,p.variant_index,p.source_sequence_hash,p.state as route_state,
    p.active as route_active,r.source_record_id as input_road_source_record_id
  into strict v_step
  from public.brinesearch_route_prep_steps s
  join public.brinesearch_route_prep p on p.id=s.route_prep_id
  left join public.brinesearch_roads r on r.id=s.road_id
  where s.id=p_step_id;

  if not v_step.active or not v_step.route_active or v_step.step_kind not in (
    'interstate','us_route','state_route','county_road','township_road','local_road','private_segment'
  ) then
    delete from private_verification.brinesearch_route_occurrence_candidates_issue97
    where route_prep_step_id=p_step_id;
    delete from private_verification.brinesearch_route_occurrence_receipts_issue97
    where route_prep_step_id=p_step_id;
    return pg_catalog.jsonb_build_object('status','not_active_road_occurrence');
  end if;

  select count(*) into v_occurrence_index
  from public.brinesearch_route_prep_steps prior
  where prior.route_prep_id=v_step.route_prep_id and prior.active
    and prior.step_kind in ('interstate','us_route','state_route','county_road','township_road','local_road','private_segment')
    and (prior.step_order<v_step.step_order or (prior.step_order=v_step.step_order and prior.id<=v_step.id));

  v_state:=private_verification.brinesearch_issue97_route_state_code(v_step.route_state);
  v_token:=private_verification.brinesearch_issue97_normalize_route_token(v_step.normalized_text);
  v_source_key:=private_verification.brinesearch_issue97_explicit_occurrence_source_key(
    v_step.route_state,v_step.match_method,coalesce(v_step.source_details,'{}'::jsonb)
  );
  v_input_digest:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_step.route_prep_id::text,v_step.source_sequence_hash,v_step.step_order::text,
    v_step.raw_text,v_step.normalized_text,v_step.step_kind,coalesce(v_step.road_id::text,''),
    coalesce(v_step.match_status,''),coalesce(v_step.match_method,''),
    coalesce(v_step.source_details::text,'{}'),coalesce(v_source_key,'')
  ));

  delete from private_verification.brinesearch_route_occurrence_candidates_issue97
  where route_prep_step_id=p_step_id;

  if v_source_key is not null then
    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
      route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
      source_identity_key,source_digest,mapping_fingerprint,evidence
    )
    select p_step_id,i.id,m.road_id,'explicit_authoritative_source_receipt',true,
      i.source_identity_key,i.source_digest,
      private_verification.brinesearch_issue97_mapping_fingerprint(i.id),
      pg_catalog.jsonb_build_object('source_key',v_source_key,'proof','route-prep source receipt')
    from public.brinesearch_authoritative_road_identities i
    left join public.brinesearch_road_identity_mappings m
      on m.identity_id=i.id and m.mapping_status='verified'
    where i.source_identity_key=v_source_key and i.active
      and private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
      and i.drivable_status='drivable'
      and (v_step.step_kind='private_segment'
        or i.public_access_status='public'
        or i.public_access_status='access');
  end if;

  if v_step.road_id is not null then
    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
      route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
      source_identity_key,source_digest,mapping_fingerprint,evidence
    )
    select p_step_id,i.id,m.road_id,'saved_canonical_road_mapping_candidate',false,
      i.source_identity_key,i.source_digest,
      private_verification.brinesearch_issue97_mapping_fingerprint(i.id),
      pg_catalog.jsonb_build_object(
        'saved_road_id',v_step.road_id,'warning','candidate evidence only; not occurrence proof'
      )
    from public.brinesearch_road_identity_mappings m
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id and i.active
    where m.road_id=v_step.road_id and m.mapping_status='verified'
      and private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
      and i.drivable_status='drivable'
      and (v_step.step_kind='private_segment'
        or i.public_access_status='public'
        or i.public_access_status='access')
    on conflict(route_prep_step_id,identity_id,candidate_basis) do update set
      canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,
      mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();
  end if;

  if v_state is not null and v_token<>'' then
    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
      route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
      source_identity_key,source_digest,mapping_fingerprint,evidence
    )
    select distinct p_step_id,i.id,m.road_id,'exact_authoritative_name_candidate',false,
      i.source_identity_key,i.source_digest,
      private_verification.brinesearch_issue97_mapping_fingerprint(i.id),
      pg_catalog.jsonb_build_object(
        'token',v_token,'warning','exact name equality is candidate evidence only'
      )
    from public.brinesearch_authoritative_road_identities i
    left join public.brinesearch_road_identity_mappings m
      on m.identity_id=i.id and m.mapping_status='verified'
    where i.state_code=v_state and i.active
      and private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
      and i.drivable_status='drivable'
      and (v_step.step_kind='private_segment'
        or i.public_access_status='public'
        or i.public_access_status='access')
      and (
        private_verification.brinesearch_issue97_normalize_route_token(i.display_name)=v_token
        or exists(
          select 1 from public.brinesearch_authoritative_road_names n
          where n.identity_id=i.id and n.active
            and (n.valid_from is null or n.valid_from<=now())
            and (n.valid_to is null or n.valid_to>now())
            and private_verification.brinesearch_issue97_normalize_route_token(n.road_name)=v_token
            and private_verification.brinesearch_issue97_dataset_scope_current(
              n.source_dataset_id,i.state_code,i.county_code
            )
        )
      )
    on conflict(route_prep_step_id,identity_id,candidate_basis) do update set
      canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,
      mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();

    insert into private_verification.brinesearch_route_occurrence_candidates_issue97(
      route_prep_step_id,identity_id,canonical_road_id,candidate_basis,strong_proof,
      source_identity_key,source_digest,mapping_fingerprint,evidence
    )
    select distinct p_step_id,i.id,m.road_id,'exact_authoritative_designation_candidate',false,
      i.source_identity_key,i.source_digest,
      private_verification.brinesearch_issue97_mapping_fingerprint(i.id),
      pg_catalog.jsonb_build_object(
        'token',v_token,'route_system',i.route_system,'route_number',i.route_number,
        'warning','route designation is candidate evidence only'
      )
    from public.brinesearch_authoritative_road_identities i
    left join public.brinesearch_road_identity_mappings m
      on m.identity_id=i.id and m.mapping_status='verified'
    where i.state_code=v_state and i.active and nullif(i.route_number,'') is not null
      and private_verification.brinesearch_issue97_dataset_scope_current(i.dataset_id,i.state_code,i.county_code)
      and i.drivable_status='drivable'
      and (v_step.step_kind='private_segment'
        or i.public_access_status='public'
        or i.public_access_status='access')
      and v_token=any(array[
        private_verification.brinesearch_issue97_normalize_route_token(pg_catalog.concat_ws(' ',i.route_system,i.route_number)),
        private_verification.brinesearch_issue97_normalize_route_token(case i.road_class
          when 'interstate' then 'I-'||i.route_number
          when 'us_route' then 'US-'||i.route_number
          when 'state_route' then 'SR-'||i.route_number
          when 'county' then 'CR-'||i.route_number
          when 'township' then 'TR-'||i.route_number
          else null end),
        private_verification.brinesearch_issue97_normalize_route_token(case i.road_class
          when 'state_route' then 'Route '||i.route_number
          when 'county' then 'County Road '||i.route_number
          when 'township' then 'Township Road '||i.route_number
          else null end),
        private_verification.brinesearch_issue97_normalize_route_token(case
          when i.road_class='state_route' then i.state_code||'-'||i.route_number else null end)
      ])
    on conflict(route_prep_step_id,identity_id,candidate_basis) do update set
      canonical_road_id=excluded.canonical_road_id,source_digest=excluded.source_digest,
      mapping_fingerprint=excluded.mapping_fingerprint,evidence=excluded.evidence,updated_at=now();
  end if;

  select count(distinct identity_id),count(distinct identity_id) filter(where strong_proof)
  into v_candidate_count,v_strong_count
  from private_verification.brinesearch_route_occurrence_candidates_issue97
  where route_prep_step_id=p_step_id;

  if v_source_key is not null then
    if v_strong_count=1 then
      select c.identity_id,c.canonical_road_id,i.source_identity_key,i.source_digest,
        c.mapping_fingerprint
      into v_identity,v_road,v_source_key,v_source_digest,v_mapping_fingerprint
      from private_verification.brinesearch_route_occurrence_candidates_issue97 c
      join public.brinesearch_authoritative_road_identities i on i.id=c.identity_id
      where c.route_prep_step_id=p_step_id and c.strong_proof limit 1;
      v_driver:=private_verification.brinesearch_issue97_identity_driver_name(v_identity);
      v_aliases:=private_verification.brinesearch_issue97_identity_aliases(v_identity,v_road);
      v_status:='resolved';
      v_method:='explicit_authoritative_source_receipt';
      v_reason:=null;
      v_evidence:=pg_catalog.jsonb_build_object(
        'proof','explicit authoritative source receipt','candidate_count',v_candidate_count,
        'canonical_mapping_present',v_road is not null
      );
    elsif v_strong_count=0 then
      v_reason:='explicit_authoritative_source_receipt_not_current_or_not_found';
      v_evidence:=pg_catalog.jsonb_build_object('source_key',v_source_key,'candidate_count',v_candidate_count);
    else
      v_reason:='explicit_authoritative_source_receipt_not_unique';
      v_evidence:=pg_catalog.jsonb_build_object('source_key',v_source_key,'strong_candidate_count',v_strong_count);
    end if;
  elsif v_candidate_count=0 then
    v_reason:=case when v_step.step_kind='private_segment'
      then 'no_authoritative_private_or_access_identity_candidate'
      else 'no_authoritative_identity_candidate' end;
    v_evidence:=pg_catalog.jsonb_build_object('candidate_count',0,'token',v_token);
  elsif v_candidate_count>50 then
    v_reason:='authoritative_candidate_set_too_broad_for_safe_topology_resolution';
    v_evidence:=pg_catalog.jsonb_build_object('candidate_count',v_candidate_count,'token',v_token);
  else
    v_reason:='requires_unique_authoritative_route_graph_path';
    select pg_catalog.jsonb_build_object(
      'candidate_count',v_candidate_count,
      'candidates',coalesce(pg_catalog.jsonb_agg(row_data order by row_data->>'source_identity_key'),'[]'::jsonb)
    ) into v_evidence
    from (
      select pg_catalog.jsonb_build_object(
        'identity_id',i.id,'source_identity_key',i.source_identity_key,
        'display_name',i.display_name,'county_code',i.county_code,'road_class',i.road_class,
        'canonical_road_id',max(c.canonical_road_id::text),
        'candidate_basis',pg_catalog.jsonb_agg(distinct c.candidate_basis)
      ) as row_data
      from private_verification.brinesearch_route_occurrence_candidates_issue97 c
      join public.brinesearch_authoritative_road_identities i on i.id=c.identity_id
      where c.route_prep_step_id=p_step_id
      group by i.id,i.source_identity_key,i.display_name,i.county_code,i.road_class
      order by i.source_identity_key limit 25
    ) bounded;
  end if;

  insert into private_verification.brinesearch_route_occurrence_receipts_issue97(
    route_prep_step_id,route_prep_id,pad_id,route_group,variant_index,
    source_step_order,occurrence_index,raw_text,normalized_text,step_kind,input_road_id,input_digest,
    resolution_status,resolution_method,hold_reason,identity_id,canonical_road_id,
    source_identity_key,driver_road_name,valid_aliases,source_digest,mapping_fingerprint,
    candidate_count,evidence,receipt_digest,resolved_at,updated_at
  ) values (
    p_step_id,v_step.route_prep_id,v_step.pad_id,v_step.route_group,v_step.variant_index,
    v_step.step_order,v_occurrence_index,v_step.raw_text,v_step.normalized_text,v_step.step_kind,
    v_step.road_id,v_input_digest,v_status,v_method,v_reason,v_identity,v_road,
    case when v_identity is null then null else v_source_key end,v_driver,coalesce(v_aliases,'{}'::text[]),
    v_source_digest,v_mapping_fingerprint,v_candidate_count,v_evidence,
    pg_catalog.md5(pg_catalog.concat_ws('|',v_input_digest,v_status,coalesce(v_method,''),
      coalesce(v_reason,''),coalesce(v_identity::text,''),coalesce(v_road::text,''),
      coalesce(v_source_digest,''),coalesce(v_mapping_fingerprint,''),coalesce(v_evidence::text,'{}'))),
    case when v_status='resolved' then now() else null end,now()
  )
  on conflict(route_prep_step_id) do update set
    route_prep_id=excluded.route_prep_id,pad_id=excluded.pad_id,route_group=excluded.route_group,
    variant_index=excluded.variant_index,source_step_order=excluded.source_step_order,
    occurrence_index=excluded.occurrence_index,raw_text=excluded.raw_text,
    normalized_text=excluded.normalized_text,step_kind=excluded.step_kind,
    input_road_id=excluded.input_road_id,input_digest=excluded.input_digest,
    resolution_status=excluded.resolution_status,resolution_method=excluded.resolution_method,
    hold_reason=excluded.hold_reason,identity_id=excluded.identity_id,
    canonical_road_id=excluded.canonical_road_id,source_identity_key=excluded.source_identity_key,
    driver_road_name=excluded.driver_road_name,valid_aliases=excluded.valid_aliases,
    source_digest=excluded.source_digest,mapping_fingerprint=excluded.mapping_fingerprint,
    candidate_count=excluded.candidate_count,evidence=excluded.evidence,
    receipt_digest=excluded.receipt_digest,resolved_at=excluded.resolved_at,updated_at=now();

  perform private_verification.brinesearch_issue97_write_occurrence_history(p_step_id);
  return pg_catalog.jsonb_build_object(
    'route_prep_step_id',p_step_id,'status',v_status,'method',v_method,
    'hold_reason',v_reason,'candidate_count',v_candidate_count,'identity_id',v_identity
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_resolve_route_identity_path(
  p_route_prep_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_occurrences integer:=0;
  v_zero integer:=0;
  v_broad integer:=0;
  v_path_count integer:=0;
  v_path jsonb;
  v_choice record;
  v_identity uuid;
  v_road uuid;
  v_source_key text;
  v_source_digest text;
  v_mapping_fingerprint text;
  v_driver text;
  v_aliases text[];
  v_input_digest text;
  v_evidence jsonb;
  v_receipt_digest text;
begin
  select count(*),count(*) filter(where candidate_count=0),count(*) filter(where candidate_count>50)
  into v_occurrences,v_zero,v_broad
  from private_verification.brinesearch_route_occurrence_receipts_issue97
  where route_prep_id=p_route_prep_id;

  if v_occurrences=0 then return pg_catalog.jsonb_build_object('status','no_road_occurrences'); end if;
  if v_occurrences=1 then
    if exists(select 1 from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id=p_route_prep_id and resolution_status='resolved') then
      return pg_catalog.jsonb_build_object('status','resolved_by_explicit_receipt','path_count',1);
    end if;
    update private_verification.brinesearch_route_occurrence_receipts_issue97 set
      resolution_status='held',resolution_method=null,
      hold_reason='single_occurrence_requires_explicit_geographic_proof',
      identity_id=null,canonical_road_id=null,source_identity_key=null,driver_road_name=null,
      valid_aliases='{}'::text[],source_digest=null,mapping_fingerprint=null,resolved_at=null,
      evidence=coalesce(evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','route_graph_unique_identity_path','full_route_occurrences',1
      ),
      receipt_digest=pg_catalog.md5(input_digest||'|held|single_occurrence_requires_explicit_geographic_proof'),
      updated_at=now()
    where route_prep_id=p_route_prep_id and resolution_status<>'resolved';
    perform private_verification.brinesearch_issue97_write_occurrence_history(route_prep_step_id)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id=p_route_prep_id;
    return pg_catalog.jsonb_build_object('status','held','reason','single_occurrence_requires_explicit_geographic_proof');
  end if;

  if v_zero>0 or v_broad>0 then
    return pg_catalog.jsonb_build_object(
      'status','held','zero_candidate_occurrences',v_zero,'broad_candidate_occurrences',v_broad
    );
  end if;

  with recursive ordered as (
    select r.route_prep_step_id,r.occurrence_index,r.resolution_status,r.identity_id as resolved_identity,
      max(r.occurrence_index) over() as max_occurrence
    from private_verification.brinesearch_route_occurrence_receipts_issue97 r
    where r.route_prep_id=p_route_prep_id
  ), admissible as (
    select distinct o.route_prep_step_id,o.occurrence_index,o.max_occurrence,c.identity_id
    from ordered o
    join private_verification.brinesearch_route_occurrence_candidates_issue97 c
      on c.route_prep_step_id=o.route_prep_step_id
    where o.resolution_status<>'resolved' or c.identity_id=o.resolved_identity
  ), paths as (
    select a.occurrence_index,a.max_occurrence,a.identity_id,
      pg_catalog.jsonb_build_array(a.identity_id::text) as identity_path
    from admissible a where a.occurrence_index=1
    union all
    select n.occurrence_index,n.max_occurrence,n.identity_id,
      p.identity_path||pg_catalog.to_jsonb(n.identity_id::text)
    from paths p
    join admissible n on n.occurrence_index=p.occurrence_index+1
    where private_verification.brinesearch_issue97_identities_connected(p.identity_id,n.identity_id)
  )
  select count(*),(pg_catalog.array_agg(identity_path))[1] into v_path_count,v_path
  from (select identity_path from paths where occurrence_index=max_occurrence limit 2) complete;

  if v_path_count=1 then
    for v_choice in
      select (value #>> '{}')::uuid as identity_id,ordinality::integer as occurrence_index
      from pg_catalog.jsonb_array_elements(v_path) with ordinality
    loop
      select i.id,m.road_id,i.source_identity_key,i.source_digest,
        private_verification.brinesearch_issue97_mapping_fingerprint(i.id)
      into strict v_identity,v_road,v_source_key,v_source_digest,v_mapping_fingerprint
      from public.brinesearch_authoritative_road_identities i
      left join public.brinesearch_road_identity_mappings m
        on m.identity_id=i.id and m.mapping_status='verified'
      where i.id=v_choice.identity_id and i.active;
      v_driver:=private_verification.brinesearch_issue97_identity_driver_name(v_identity);
      v_aliases:=private_verification.brinesearch_issue97_identity_aliases(v_identity,v_road);
      select input_digest,evidence into strict v_input_digest,v_evidence
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id=p_route_prep_id and occurrence_index=v_choice.occurrence_index;
      v_evidence:=coalesce(v_evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','unique full-sequence authoritative graph path',
        'selection_uses_name_similarity',false,
        'selection_uses_nearest_road',false,
        'selection_uses_route_number_alone',false,
        'canonical_mapping_present',v_road is not null
      );
      v_receipt_digest:=pg_catalog.md5(pg_catalog.concat_ws('|',
        v_input_digest,'resolved','route_graph_unique_identity_path',v_identity::text,
        coalesce(v_road::text,''),v_source_digest,coalesce(v_mapping_fingerprint,''),v_evidence::text
      ));
      update private_verification.brinesearch_route_occurrence_receipts_issue97 set
        resolution_status='resolved',
        resolution_method=case when resolution_method='explicit_authoritative_source_receipt'
          then resolution_method else 'route_graph_unique_identity_path' end,
        hold_reason=null,identity_id=v_identity,canonical_road_id=v_road,
        source_identity_key=v_source_key,driver_road_name=v_driver,
        valid_aliases=coalesce(v_aliases,'{}'::text[]),source_digest=v_source_digest,
        mapping_fingerprint=v_mapping_fingerprint,evidence=v_evidence,
        receipt_digest=v_receipt_digest,resolved_at=coalesce(resolved_at,now()),updated_at=now()
      where route_prep_id=p_route_prep_id and occurrence_index=v_choice.occurrence_index;
      perform private_verification.brinesearch_issue97_write_occurrence_history(
        (select route_prep_step_id from private_verification.brinesearch_route_occurrence_receipts_issue97
         where route_prep_id=p_route_prep_id and occurrence_index=v_choice.occurrence_index)
      );
    end loop;
    return pg_catalog.jsonb_build_object('status','resolved','path_count',1,'occurrences',v_occurrences);
  end if;

  if v_path_count=0 then
    update private_verification.brinesearch_route_occurrence_receipts_issue97 set
      resolution_status='held',resolution_method=null,
      hold_reason='saved_sequence_has_no_exact_authoritative_graph_path',
      identity_id=null,canonical_road_id=null,source_identity_key=null,driver_road_name=null,
      valid_aliases='{}'::text[],source_digest=null,mapping_fingerprint=null,resolved_at=null,
      evidence=coalesce(evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','route_graph_unique_identity_path','full_path_count',0
      ),
      receipt_digest=pg_catalog.md5(input_digest||'|held|saved_sequence_has_no_exact_authoritative_graph_path'),
      updated_at=now()
    where route_prep_id=p_route_prep_id and resolution_status<>'resolved';
  else
    update private_verification.brinesearch_route_occurrence_receipts_issue97 set
      resolution_status='held',resolution_method=null,
      hold_reason='authoritative_route_identity_path_ambiguous',
      identity_id=null,canonical_road_id=null,source_identity_key=null,driver_road_name=null,
      valid_aliases='{}'::text[],source_digest=null,mapping_fingerprint=null,resolved_at=null,
      evidence=coalesce(evidence,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'solver','route_graph_unique_identity_path','full_path_count_lower_bound',v_path_count
      ),
      receipt_digest=pg_catalog.md5(input_digest||'|held|authoritative_route_identity_path_ambiguous'),
      updated_at=now()
    where route_prep_id=p_route_prep_id and resolution_status<>'resolved';
  end if;

  perform private_verification.brinesearch_issue97_write_occurrence_history(route_prep_step_id)
    from private_verification.brinesearch_route_occurrence_receipts_issue97
    where route_prep_id=p_route_prep_id;
  return pg_catalog.jsonb_build_object(
    'status','held','path_count_lower_bound',v_path_count,
    'reason',case when v_path_count=0 then 'saved_sequence_has_no_exact_authoritative_graph_path'
      else 'authoritative_route_identity_path_ambiguous' end
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_refresh_route_receipt(
  p_route_prep_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_route record;
  v_occurrences integer:=0;
  v_resolved integer:=0;
  v_held integer:=0;
  v_canonical integer:=0;
  v_geometry integer:=0;
  v_manifest text:=null;
  v_reasons text[]:='{}'::text[];
  v_stage text:='identity_reconciliation';
  v_status text:='needs_review';
  v_dependency text;
  v_receipt text;
  v_evidence jsonb;
begin
  select p.*,pad.structured_route_revision,pad.road_sequence_status
  into strict v_route
  from public.brinesearch_route_prep p
  join public.pads pad on pad.id=p.pad_id
  where p.id=p_route_prep_id;

  select count(*),count(*) filter(where resolution_status='resolved'),
    count(*) filter(where resolution_status='held'),
    count(*) filter(where resolution_status='resolved' and canonical_road_id is not null)
  into v_occurrences,v_resolved,v_held,v_canonical
  from private_verification.brinesearch_route_occurrence_receipts_issue97
  where route_prep_id=p_route_prep_id;

  if v_route.route_group='primary' and v_route.variant_index=1 then
    select count(*) into v_geometry
    from private_verification.brinesearch_route_occurrence_receipts_issue97 rr
    join public.brinesearch_pad_roads pr
      on pr.pad_id=v_route.pad_id and pr.route_group='primary' and pr.route_variant_index=0
      and pr.step_order=rr.occurrence_index and pr.road_id=rr.canonical_road_id
    join public.brinesearch_roads road on road.id=pr.road_id
    where rr.route_prep_id=p_route_prep_id and rr.resolution_status='resolved'
      and pr.route_revision=v_route.structured_route_revision
      and pr.start_point is not null and pr.end_point is not null and pr.step_geometry is not null
      and pr.geometry_source='road_manager_clip_issue69' and pr.geometry_status='snapped_intersections'
      and pr.road_geometry_digest=pg_catalog.md5(road.centerline_geojson::text)
      and road.centerline_geojson is not null;

    select g.status into v_manifest
    from private_verification.brinesearch_google_route_receipts_issue97 g
    where g.pad_id=v_route.pad_id;
  end if;

  if not v_route.active then
    v_status:='stale';v_stage:='identity_reconciliation';v_reasons:=array['route_prep_inactive'];
  else
    if v_route.readiness_status<>'ready_for_road_matching' then
      v_reasons:=array_append(v_reasons,'route_prep_'||coalesce(v_route.readiness_status,'unknown'));
    end if;
    if v_occurrences=0 then v_reasons:=array_append(v_reasons,'no_saved_road_occurrences'); end if;
    if v_held>0 or v_resolved<>v_occurrences then
      v_reasons:=array_append(v_reasons,'authoritative_occurrence_identity_incomplete');
      v_stage:='identity_reconciliation';
    elsif v_canonical<>v_occurrences then
      v_reasons:=array_append(v_reasons,'canonical_road_mapping_missing_for_resolved_identity');
      v_stage:='canonical_mapping';
    elsif not (v_route.route_group='primary' and v_route.variant_index=1) then
      v_reasons:=array_append(v_reasons,'route_variant_structured_publication_not_generated');
      v_stage:='exact_geometry';
    elsif v_geometry<>v_occurrences then
      v_reasons:=array_append(v_reasons,'exact_occurrence_geometry_incomplete');
      v_stage:='exact_geometry';
    elsif coalesce(v_manifest,'')<>'ready' then
      v_reasons:=array_append(v_reasons,'google_route_manifest_not_ready');
      v_stage:='google_manifest';
    else
      v_status:='route_ready';v_stage:='ready';v_reasons:='{}'::text[];
    end if;
  end if;

  v_dependency:=pg_catalog.md5(pg_catalog.concat_ws('|',
    v_route.id::text,v_route.pad_id::text,v_route.source_sequence_hash,
    v_route.route_group,v_route.variant_index::text,coalesce(v_route.readiness_status,''),
    coalesce(v_route.structured_route_revision::text,''),coalesce(v_route.road_sequence_status,''),
    coalesce((select pg_catalog.string_agg(receipt_digest,',' order by occurrence_index)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where route_prep_id=p_route_prep_id),''),coalesce(v_manifest,'')
  ));
  v_evidence:=pg_catalog.jsonb_build_object(
    'source_sequence',v_route.source_sequence,'readiness_status',v_route.readiness_status,
    'road_occurrences',v_occurrences,'resolved_occurrences',v_resolved,
    'held_occurrences',v_held,'canonical_mappings',v_canonical,
    'exact_geometry_occurrences',v_geometry,'google_manifest_status',v_manifest,
    'manual_map_editor_role','review_exception_qa_only'
  );
  v_receipt:=pg_catalog.md5(pg_catalog.concat_ws('|',v_dependency,v_status,v_stage,
    pg_catalog.array_to_string(v_reasons,','),v_evidence::text));

  insert into private_verification.brinesearch_route_reconciliation_receipts_issue97(
    route_prep_id,pad_id,route_group,variant_index,source_sequence_hash,route_status,stage,
    road_occurrence_count,resolved_occurrence_count,held_occurrence_count,
    canonical_mapping_count,exact_geometry_count,google_manifest_status,exception_reasons,
    dependency_digest,evidence,receipt_digest,updated_at
  ) values (
    v_route.id,v_route.pad_id,v_route.route_group,v_route.variant_index,v_route.source_sequence_hash,
    v_status,v_stage,v_occurrences,v_resolved,v_held,v_canonical,v_geometry,v_manifest,
    v_reasons,v_dependency,v_evidence,v_receipt,now()
  )
  on conflict(route_prep_id) do update set
    pad_id=excluded.pad_id,route_group=excluded.route_group,variant_index=excluded.variant_index,
    source_sequence_hash=excluded.source_sequence_hash,route_status=excluded.route_status,
    stage=excluded.stage,road_occurrence_count=excluded.road_occurrence_count,
    resolved_occurrence_count=excluded.resolved_occurrence_count,
    held_occurrence_count=excluded.held_occurrence_count,
    canonical_mapping_count=excluded.canonical_mapping_count,exact_geometry_count=excluded.exact_geometry_count,
    google_manifest_status=excluded.google_manifest_status,exception_reasons=excluded.exception_reasons,
    dependency_digest=excluded.dependency_digest,evidence=excluded.evidence,
    receipt_digest=excluded.receipt_digest,updated_at=now();

  insert into private_verification.brinesearch_route_reconciliation_history_issue97(
    route_prep_id,pad_id,route_group,variant_index,route_status,stage,
    road_occurrence_count,resolved_occurrence_count,held_occurrence_count,
    canonical_mapping_count,exact_geometry_count,google_manifest_status,exception_reasons,
    dependency_digest,evidence,receipt_digest
  ) values (
    v_route.id,v_route.pad_id,v_route.route_group,v_route.variant_index,v_status,v_stage,
    v_occurrences,v_resolved,v_held,v_canonical,v_geometry,v_manifest,v_reasons,
    v_dependency,v_evidence,v_receipt
  ) on conflict(route_prep_id,receipt_digest) do nothing;

  return pg_catalog.jsonb_build_object(
    'route_prep_id',p_route_prep_id,'route_status',v_status,'stage',v_stage,
    'road_occurrences',v_occurrences,'resolved',v_resolved,'held',v_held,
    'canonical_mappings',v_canonical,'exact_geometry',v_geometry,
    'google_manifest_status',v_manifest,'exception_reasons',to_jsonb(v_reasons)
  );
end
$$;

revoke all on function private_verification.brinesearch_issue97_refresh_route_receipt(uuid)
from public,anon,authenticated,service_role;

create or replace function private_verification.brinesearch_issue97_route_corpus_metrics_json()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select pg_catalog.jsonb_build_object(
    'active_routes',(select count(*) from public.brinesearch_route_prep where active),
    'active_pads',(select count(distinct pad_id) from public.brinesearch_route_prep where active),
    'road_occurrences',(select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97 r
      join public.brinesearch_route_prep p on p.id=r.route_prep_id where p.active),
    'resolved_occurrences',(select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97 r
      join public.brinesearch_route_prep p on p.id=r.route_prep_id where p.active and r.resolution_status='resolved'),
    'held_occurrences',(select count(*) from private_verification.brinesearch_route_occurrence_receipts_issue97 r
      join public.brinesearch_route_prep p on p.id=r.route_prep_id where p.active and r.resolution_status='held'),
    'route_ready',(select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 r
      join public.brinesearch_route_prep p on p.id=r.route_prep_id where p.active and r.route_status='route_ready'),
    'needs_review',(select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 r
      join public.brinesearch_route_prep p on p.id=r.route_prep_id where p.active and r.route_status='needs_review'),
    'stale',(select count(*) from private_verification.brinesearch_route_reconciliation_receipts_issue97 where route_status='stale'),
    'holds_by_reason',coalesce((
      select pg_catalog.jsonb_object_agg(reason,cnt order by reason)
      from (
        select hold_reason as reason,count(*) as cnt
        from private_verification.brinesearch_route_occurrence_receipts_issue97 r
        join public.brinesearch_route_prep p on p.id=r.route_prep_id
        where p.active and r.resolution_status='held'
        group by hold_reason
      ) grouped
    ),'{}'::jsonb),
    'zero_forbidden_resolutions',(select count(*)
      from private_verification.brinesearch_route_occurrence_receipts_issue97
      where resolution_method in ('name_only','fuzzy_name','nearest_road','route_number_only'))
  )
$$;

revoke all on function private_verification.brinesearch_issue97_route_corpus_metrics_json()
from public,anon,authenticated,service_role;

create or replace function public.brinesearch_issue97_reconcile_route_corpus(
  p_pad_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_step record;v_route record;v_step_count integer:=0;v_route_count integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97));

  update private_verification.brinesearch_route_occurrence_receipts_issue97 rr set
    resolution_status='stale',hold_reason='source_route_occurrence_inactive',resolved_at=null,updated_at=now(),
    receipt_digest=pg_catalog.md5(rr.input_digest||'|stale|source_route_occurrence_inactive')
  where (p_pad_id is null or rr.pad_id=p_pad_id) and not exists(
    select 1 from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep p on p.id=s.route_prep_id
    where s.id=rr.route_prep_step_id and s.active and p.active
      and s.step_kind in ('interstate','us_route','state_route','county_road','township_road','local_road','private_segment')
  );

  for v_step in
    select s.id
    from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep p on p.id=s.route_prep_id
    where s.active and p.active
      and s.step_kind in ('interstate','us_route','state_route','county_road','township_road','local_road','private_segment')
      and (p_pad_id is null or p.pad_id=p_pad_id)
    order by p.pad_id,p.route_group,p.variant_index,s.step_order,s.id
  loop
    perform private_verification.brinesearch_issue97_refresh_occurrence_candidate(v_step.id);
    v_step_count:=v_step_count+1;
  end loop;

  for v_route in
    select p.id from public.brinesearch_route_prep p
    where p.active and (p_pad_id is null or p.pad_id=p_pad_id)
    order by p.pad_id,p.route_group,p.variant_index,p.id
  loop
    perform private_verification.brinesearch_issue97_resolve_route_identity_path(v_route.id);
    perform private_verification.brinesearch_issue97_refresh_route_receipt(v_route.id);
    v_route_count:=v_route_count+1;
  end loop;

  return private_verification.brinesearch_issue97_route_corpus_metrics_json()
    ||pg_catalog.jsonb_build_object('processed_road_occurrences',v_step_count,'processed_routes',v_route_count);
end
$$;

revoke all on function public.brinesearch_issue97_reconcile_route_corpus(uuid)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_reconcile_route_corpus(uuid) to service_role;

create or replace function public.brinesearch_issue97_route_corpus_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required';
  end if;
  return private_verification.brinesearch_issue97_route_corpus_metrics_json();
end
$$;

revoke all on function public.brinesearch_issue97_route_corpus_metrics()
from public,anon;
grant execute on function public.brinesearch_issue97_route_corpus_metrics() to authenticated;

create or replace function public.brinesearch_issue97_route_exception_queue(
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,200),500));v_rows jsonb;v_routes jsonb;
begin
  if not public.is_brinesearch_editor(auth.uid()) then
    raise exception 'Road Manager editor access is required';
  end if;

  select coalesce(pg_catalog.jsonb_agg(item order by item->>'company',item->>'pad_name',
    (item->>'variant_index')::integer,(item->>'occurrence_index')::integer),'[]'::jsonb)
  into v_rows
  from (
    select pg_catalog.jsonb_build_object(
      'route_prep_step_id',r.route_prep_step_id,'route_prep_id',r.route_prep_id,
      'pad_id',r.pad_id,'pad_name',p.pad_name,'company',p.company,'state',p.state,
      'route_group',r.route_group,'variant_index',r.variant_index,
      'source_step_order',r.source_step_order,'occurrence_index',r.occurrence_index,
      'raw_text',r.raw_text,'normalized_text',r.normalized_text,'step_kind',r.step_kind,
      'hold_reason',r.hold_reason,'candidate_count',r.candidate_count,
      'candidate_evidence',r.evidence
    ) as item
    from private_verification.brinesearch_route_occurrence_receipts_issue97 r
    join public.pads p on p.id=r.pad_id
    join public.brinesearch_route_prep rp on rp.id=r.route_prep_id and rp.active
    where r.resolution_status='held'
    order by p.company,p.pad_name,r.variant_index,r.occurrence_index
    limit v_limit
  ) bounded;

  select coalesce(pg_catalog.jsonb_agg(item order by item->>'company',item->>'pad_name',
    (item->>'variant_index')::integer),'[]'::jsonb)
  into v_routes
  from (
    select pg_catalog.jsonb_build_object(
      'route_prep_id',r.route_prep_id,'pad_id',r.pad_id,'pad_name',p.pad_name,
      'company',p.company,'state',p.state,'route_group',r.route_group,
      'variant_index',r.variant_index,'route_status',r.route_status,'stage',r.stage,
      'road_occurrence_count',r.road_occurrence_count,'resolved_occurrence_count',r.resolved_occurrence_count,
      'held_occurrence_count',r.held_occurrence_count,'canonical_mapping_count',r.canonical_mapping_count,
      'exact_geometry_count',r.exact_geometry_count,'google_manifest_status',r.google_manifest_status,
      'exception_reasons',to_jsonb(r.exception_reasons)
    ) as item
    from private_verification.brinesearch_route_reconciliation_receipts_issue97 r
    join public.pads p on p.id=r.pad_id
    join public.brinesearch_route_prep rp on rp.id=r.route_prep_id and rp.active
    where r.route_status<>'route_ready'
    order by p.company,p.pad_name,r.variant_index
    limit v_limit
  ) bounded;

  return pg_catalog.jsonb_build_object(
    'metrics',private_verification.brinesearch_issue97_route_corpus_metrics_json(),
    'occurrence_exceptions',v_rows,'route_exceptions',v_routes,
    'manual_map_editor_role','review_exception_qa_only'
  );
end
$$;

revoke all on function public.brinesearch_issue97_route_exception_queue(integer)
from public,anon;
grant execute on function public.brinesearch_issue97_route_exception_queue(integer) to authenticated;

comment on function public.brinesearch_issue97_reconcile_route_corpus(uuid) is
  'Issue #97 automatic all-route reconciliation. Exact names/route numbers/canonical IDs generate candidates only; resolution requires an explicit authoritative source receipt or one unique full physical graph path. No raw source-road bulk promotion occurs.';
comment on function public.brinesearch_issue97_route_exception_queue(integer) is
  'Issue #97 owner/editor exception queue. Humans review only held occurrences/routes; normal route construction is automatic.';
