-- GitHub #70 — reuse already-verified Road Manager identities for remaining
-- Ohio route-prep no-match rows when the saved road text is an explicit alias.
--
-- This does not discover a new road, load geometry, or publish a route. It only
-- links a saved route-prep step to one existing verified Road Manager road when:
--   * the road has trusted existing geometry;
--   * state/county scope is compatible;
--   * exactly one Road Manager record qualifies; and
--   * the saved text exactly equals the canonical name, one stored alias, or one
--     slash-delimited component of a stored composite alias.
--
-- No normalized-core, fuzzy, name-similarity, nearest-pad, or spatial fallback is
-- used to create the alias relationship. Rows without this explicit evidence stay
-- held under #70.

create table if not exists private_verification.brinesearch_verified_alias_matches_issue70 (
  step_id uuid primary key references public.brinesearch_route_prep_steps(id) on delete cascade,
  pad_id uuid not null,
  company text,
  pad_name text,
  county text,
  raw_text text not null,
  road_id uuid not null references public.brinesearch_roads(id),
  road_canonical_name text not null,
  match_basis text not null,
  matched_alias text not null,
  road_geometry_digest text not null,
  road_source_agency text,
  road_source_dataset text,
  road_source_method text,
  road_source_record_id text,
  evidence jsonb not null default '{}'::jsonb,
  staged_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint brinesearch_verified_alias_issue70_basis_check check (
    match_basis in ('exact_canonical_name','exact_stored_alias','exact_slash_alias_component')
  )
);

create index if not exists brinesearch_verified_alias_issue70_road_idx
  on private_verification.brinesearch_verified_alias_matches_issue70(road_id);
create index if not exists brinesearch_verified_alias_issue70_applied_idx
  on private_verification.brinesearch_verified_alias_matches_issue70(applied_at)
  where applied_at is not null;

alter table private_verification.brinesearch_verified_alias_matches_issue70 enable row level security;
alter table private_verification.brinesearch_verified_alias_matches_issue70 force row level security;
revoke all on private_verification.brinesearch_verified_alias_matches_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_verified_alias_matches_issue70 to service_role;

create or replace function public.brinesearch_stage_verified_alias_matches_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_staged integer:=0;
  v_canonical integer:=0;
  v_alias integer:=0;
  v_slash integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may stage #70 verified alias matches';
  end if;

  delete from private_verification.brinesearch_verified_alias_matches_issue70
  where applied_at is null;

  with no_match as (
    select
      m.step_id,m.pad_id,m.company,m.pad_name,m.county,m.raw_text,
      pg_catalog.lower(pg_catalog.btrim(m.raw_text)) as raw_exact
    from private_verification.brinesearch_oh_road_matches_issue70 m
    join public.brinesearch_route_prep_steps s on s.id=m.step_id
    where m.match_status='no_match'
      and m.applied_at is null
      and s.active
      and s.road_id is null
  ), road_aliases as (
    select
      r.id as road_id,r.canonical_name,r.aliases,r.state,r.county,
      r.source_agency,r.source_dataset,r.source_method,r.source_record_id,
      r.centerline_geojson,r.geometry_status,r.verification_status,r.candidate_only,
      r.canonical_name as matched_alias,
      'exact_canonical_name'::text as match_basis,
      pg_catalog.lower(pg_catalog.btrim(r.canonical_name)) as alias_exact
    from public.brinesearch_roads r
    where r.centerline_geojson is not null
      and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
      and r.verification_status='verified'
      and not coalesce(r.candidate_only,false)

    union all

    select
      r.id,r.canonical_name,r.aliases,r.state,r.county,
      r.source_agency,r.source_dataset,r.source_method,r.source_record_id,
      r.centerline_geojson,r.geometry_status,r.verification_status,r.candidate_only,
      a as matched_alias,
      'exact_stored_alias'::text as match_basis,
      pg_catalog.lower(pg_catalog.btrim(a)) as alias_exact
    from public.brinesearch_roads r
    cross join lateral pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])) a
    where r.centerline_geojson is not null
      and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
      and r.verification_status='verified'
      and not coalesce(r.candidate_only,false)
      and pg_catalog.strpos(a,'/')=0

    union all

    select
      r.id,r.canonical_name,r.aliases,r.state,r.county,
      r.source_agency,r.source_dataset,r.source_method,r.source_record_id,
      r.centerline_geojson,r.geometry_status,r.verification_status,r.candidate_only,
      part as matched_alias,
      'exact_slash_alias_component'::text as match_basis,
      pg_catalog.lower(pg_catalog.btrim(part)) as alias_exact
    from public.brinesearch_roads r
    cross join lateral pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])) a
    cross join lateral pg_catalog.regexp_split_to_table(a,'/') part
    where r.centerline_geojson is not null
      and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
      and r.verification_status='verified'
      and not coalesce(r.candidate_only,false)
      and pg_catalog.strpos(a,'/')>0
      and nullif(pg_catalog.btrim(part),'') is not null
  ), candidates as (
    select
      n.step_id,n.pad_id,n.company,n.pad_name,n.county,n.raw_text,
      a.road_id,a.canonical_name,a.matched_alias,a.match_basis,
      a.source_agency,a.source_dataset,a.source_method,a.source_record_id,
      a.centerline_geojson,
      row_number() over(
        partition by n.step_id,a.road_id
        order by case a.match_basis
          when 'exact_canonical_name' then 1
          when 'exact_stored_alias' then 2
          else 3
        end,a.matched_alias
      ) as per_road_rank
    from no_match n
    join road_aliases a
      on a.alias_exact=n.raw_exact
     and (a.state is null or upper(a.state)='OH')
     and (a.county is null or pg_catalog.lower(a.county)=pg_catalog.lower(n.county))
  ), one_per_road as (
    select * from candidates where per_road_rank=1
  ), unique_steps as (
    select step_id
    from one_per_road
    group by step_id
    having count(*)=1
  )
  insert into private_verification.brinesearch_verified_alias_matches_issue70 (
    step_id,pad_id,company,pad_name,county,raw_text,
    road_id,road_canonical_name,match_basis,matched_alias,
    road_geometry_digest,road_source_agency,road_source_dataset,
    road_source_method,road_source_record_id,evidence,staged_at
  )
  select
    c.step_id,c.pad_id,c.company,c.pad_name,c.county,c.raw_text,
    c.road_id,c.canonical_name,c.match_basis,c.matched_alias,
    pg_catalog.md5(c.centerline_geojson::text),
    c.source_agency,c.source_dataset,c.source_method,c.source_record_id,
    pg_catalog.jsonb_build_object(
      'issue',70,
      'match_basis',c.match_basis,
      'saved_text',c.raw_text,
      'explicit_matched_text',c.matched_alias,
      'road_canonical_name',c.canonical_name,
      'candidate_count',1,
      'existing_verified_road_manager',true,
      'new_road_discovery',false,
      'fuzzy_matching',false,
      'normalized_core_decision',false,
      'name_similarity_decision',false,
      'spatial_fallback',false
    ),now()
  from one_per_road c
  join unique_steps u on u.step_id=c.step_id;

  get diagnostics v_staged=row_count;
  select
    count(*) filter(where match_basis='exact_canonical_name'),
    count(*) filter(where match_basis='exact_stored_alias'),
    count(*) filter(where match_basis='exact_slash_alias_component')
  into v_canonical,v_alias,v_slash
  from private_verification.brinesearch_verified_alias_matches_issue70
  where applied_at is null;

  return pg_catalog.jsonb_build_object(
    'verified_alias_matches_staged',v_staged,
    'exact_canonical_name',v_canonical,
    'exact_stored_alias',v_alias,
    'exact_slash_alias_component',v_slash,
    'policy','One existing verified Road Manager road with trusted geometry and an explicit exact saved-text alias only.'
  );
end;
$$;

revoke all on function public.brinesearch_stage_verified_alias_matches_issue70() from public,anon;
grant execute on function public.brinesearch_stage_verified_alias_matches_issue70() to authenticated;

create or replace function public.brinesearch_apply_verified_alias_matches_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  rec record;
  v_applied integer:=0;
  v_held integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may apply #70 verified alias matches';
  end if;

  perform public.brinesearch_stage_verified_alias_matches_issue70();

  for rec in
    select * from private_verification.brinesearch_verified_alias_matches_issue70
    where applied_at is null
    order by step_id
  loop
    -- Revalidate the exact Road Manager record, trusted geometry and digest.
    if not exists (
      select 1
      from public.brinesearch_roads r
      where r.id=rec.road_id
        and r.centerline_geojson is not null
        and r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline')
        and r.verification_status='verified'
        and not coalesce(r.candidate_only,false)
        and pg_catalog.md5(r.centerline_geojson::text)=rec.road_geometry_digest
        and (r.state is null or upper(r.state)='OH')
        and (r.county is null or pg_catalog.lower(r.county)=pg_catalog.lower(rec.county))
    ) then
      v_held:=v_held+1;
      continue;
    end if;

    -- Revalidate that the explicit alias relationship still exists exactly.
    if not exists (
      select 1 from public.brinesearch_roads r
      where r.id=rec.road_id and (
        (rec.match_basis='exact_canonical_name'
          and pg_catalog.lower(pg_catalog.btrim(r.canonical_name))=pg_catalog.lower(pg_catalog.btrim(rec.raw_text)))
        or (rec.match_basis='exact_stored_alias' and exists(
          select 1 from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])) a
          where pg_catalog.strpos(a,'/')=0
            and pg_catalog.lower(pg_catalog.btrim(a))=pg_catalog.lower(pg_catalog.btrim(rec.raw_text))
        ))
        or (rec.match_basis='exact_slash_alias_component' and exists(
          select 1
          from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])) a
          cross join lateral pg_catalog.regexp_split_to_table(a,'/') part
          where pg_catalog.strpos(a,'/')>0
            and pg_catalog.lower(pg_catalog.btrim(part))=pg_catalog.lower(pg_catalog.btrim(rec.raw_text))
        ))
      )
    ) then
      v_held:=v_held+1;
      continue;
    end if;

    update public.brinesearch_route_prep_steps s
    set road_id=rec.road_id,
        match_status='exact_master',
        match_method='verified_road_manager_explicit_alias_issue70',
        match_confidence=1.0,
        geometry_status='ready',
        source_details=coalesce(s.source_details,'{}'::jsonb)||rec.evidence||pg_catalog.jsonb_build_object(
          'road_id',rec.road_id,
          'road_source_agency',rec.road_source_agency,
          'road_source_dataset',rec.road_source_dataset,
          'road_source_method',rec.road_source_method,
          'road_source_record_id',rec.road_source_record_id,
          'match_basis','existing verified Road Manager explicit alias'
        ),
        updated_at=now()
    where s.id=rec.step_id and s.active and s.road_id is null;

    if not found then
      v_held:=v_held+1;
      continue;
    end if;

    update private_verification.brinesearch_oh_road_matches_issue70
    set match_method='verified_road_manager_explicit_alias_issue70',
        match_status='applied',geometry_status='applied',
        official_name=rec.road_canonical_name,
        source_snapshot=source_snapshot||rec.evidence||pg_catalog.jsonb_build_object(
          'applied_road_id',rec.road_id,
          'existing_verified_road_manager',true
        ),
        applied_road_id=rec.road_id,applied_at=now()
    where step_id=rec.step_id and match_status='no_match' and applied_at is null;

    update private_verification.brinesearch_verified_alias_matches_issue70
    set applied_at=now()
    where step_id=rec.step_id;
    v_applied:=v_applied+1;
  end loop;

  perform public.road_manager_recalculate_route_readiness();

  return pg_catalog.jsonb_build_object(
    'verified_alias_steps_applied',v_applied,
    'held_after_revalidation',v_held,
    'policy','Existing verified Road Manager explicit alias only; no new road/geometry and no fuzzy/spatial fallback.'
  );
end;
$$;

revoke all on function public.brinesearch_apply_verified_alias_matches_issue70() from public,anon;
grant execute on function public.brinesearch_apply_verified_alias_matches_issue70() to authenticated;

comment on function public.brinesearch_stage_verified_alias_matches_issue70() is
  'Issue #70: stages only one-candidate exact saved-text aliases on existing verified Road Manager roads with trusted geometry.';
comment on function public.brinesearch_apply_verified_alias_matches_issue70() is
  'Issue #70: links route-prep steps only after exact explicit alias + Road Manager geometry revalidation; no road discovery or route publication.';
