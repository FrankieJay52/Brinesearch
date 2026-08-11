-- GitHub #70 — all-operator Ohio exact Road Manager coverage.
--
-- The #69 exact-route runtime intentionally fails closed when a saved route step
-- has no stable Road Manager identity or complete trusted centerline.  The older
-- ODOT match pipeline only populated Ascent comprehensively.  This migration
-- adds a repeatable, Owner-gated, all-operator Ohio pipeline that:
--   1. stages only exact county-scoped ODOT street / CR / TR identities;
--   2. rejects generic names, suffix conflicts, fuzzy matching, and ambiguity;
--   3. loads only the exact ODOT feature object IDs required by staged identities;
--   4. creates/reuses Road Manager roads with official ODOT provenance;
--   5. upgrades a single legacy explicit/partial-OSM Road Manager record only
--      after an exact official identity has been established;
--   6. updates route-prep steps to stable road IDs without publishing any route.
--
-- Ambiguous/no-match rows stay held for later #70 context review.  Nothing in
-- this migration re-enables the external-map guessing path retired by #69.

create table if not exists private_verification.brinesearch_oh_road_matches_issue70 (
  step_id uuid primary key references public.brinesearch_route_prep_steps(id) on delete cascade,
  route_prep_id uuid not null,
  pad_id uuid not null,
  pad_name text,
  company text,
  county text,
  county_code text,
  raw_text text not null,
  normalized_text text,
  step_kind text not null,
  step_key text,
  saved_suffix text,
  route_type_hint text,
  route_number_hint text,
  candidate_nlf_ids text[] not null default '{}'::text[],
  candidate_count integer not null default 0,
  selected_nlf_id text,
  selected_street_key text,
  selected_route_type text,
  selected_route_number text,
  official_name text,
  official_suffix text,
  match_method text not null,
  match_status text not null,
  geometry_status text not null default 'unknown',
  source_snapshot jsonb not null default '{}'::jsonb,
  staged_at timestamptz not null default now(),
  applied_road_id uuid references public.brinesearch_roads(id),
  applied_at timestamptz,
  constraint brinesearch_oh_road_matches_issue70_status_check check (
    match_status in ('unique_exact','ambiguous','conflict','no_match','rejected_generic','rejected_suffix','held','applied')
  ),
  constraint brinesearch_oh_road_matches_issue70_geometry_check check (
    geometry_status in ('unknown','needs_geometry','complete','held','applied')
  )
);

create index if not exists brinesearch_oh_road_matches_issue70_status_idx
  on private_verification.brinesearch_oh_road_matches_issue70(match_status,geometry_status);
create index if not exists brinesearch_oh_road_matches_issue70_nlf_idx
  on private_verification.brinesearch_oh_road_matches_issue70(selected_nlf_id)
  where selected_nlf_id is not null;

alter table private_verification.brinesearch_oh_road_matches_issue70 enable row level security;
alter table private_verification.brinesearch_oh_road_matches_issue70 force row level security;
revoke all on private_verification.brinesearch_oh_road_matches_issue70 from public,anon,authenticated;
grant select,insert,update,delete on private_verification.brinesearch_oh_road_matches_issue70 to service_role;

comment on table private_verification.brinesearch_oh_road_matches_issue70 is
  'Issue #70 private exact-match staging. No fuzzy road identity or external-map guessing is allowed.';

create or replace function public.brinesearch_refresh_oh_road_matches_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_rows integer:=0;
  v_unique integer:=0;
  v_ambiguous integer:=0;
  v_conflict integer:=0;
  v_no_match integer:=0;
  v_generic integer:=0;
  v_suffix integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may refresh #70 Ohio road matches';
  end if;

  -- Preserve applied history, but discard stale unresolved rows that are no
  -- longer active/unmatched Ohio road steps.
  delete from private_verification.brinesearch_oh_road_matches_issue70 m
  where m.applied_at is null
    and not exists (
      select 1
      from public.brinesearch_route_prep_steps s
      join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
      join public.pads p on p.id=rp.pad_id
      where s.id=m.step_id
        and s.active
        and s.road_id is null
        and upper(coalesce(p.state,'')) in ('OH','OHIO')
        and s.step_kind in ('local_road','county_road','township_road')
    );

  with base as materialized (
    select
      s.id as step_id,
      s.route_prep_id,
      rp.pad_id,
      rp.pad_name,
      rp.company,
      p.county,
      public.brinesearch_oh_county_code(p.county) as county_code,
      s.raw_text,
      s.normalized_text,
      s.step_kind,
      public.brinesearch_road_name_core(coalesce(s.normalized_text,s.raw_text)) as step_key,
      public.brinesearch_road_suffix_class(coalesce(s.normalized_text,s.raw_text)) as saved_suffix,
      case
        when coalesce(s.normalized_text,s.raw_text) ~* '\m(CR|C\.?R\.?|COUNTY\s+(ROAD|ROUTE))\s*[-#]?\s*[0-9]+' then 'CR'
        when coalesce(s.normalized_text,s.raw_text) ~* '\m(TR|T\.?R\.?|TOWNSHIP\s+(ROAD|ROUTE))\s*[-#]?\s*[0-9]+' then 'TR'
        else null
      end as route_type_hint,
      nullif((pg_catalog.regexp_match(
        coalesce(s.normalized_text,s.raw_text),
        '(?i)\m(?:CR|C\.?R\.?|COUNTY\s+(?:ROAD|ROUTE)|TR|T\.?R\.?|TOWNSHIP\s+(?:ROAD|ROUTE))\s*[-#]?\s*0*([0-9]+[A-Z]?)'
      ))[1],'') as route_number_hint
    from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    join public.pads p on p.id=rp.pad_id
    where s.active
      and s.road_id is null
      and upper(coalesce(p.state,'')) in ('OH','OHIO')
      and s.step_kind in ('local_road','county_road','township_road')
      and public.brinesearch_oh_county_code(p.county) is not null
  ), name_candidates as materialized (
    select
      b.step_id,
      pg_catalog.array_agg(distinct c.nlf_id order by c.nlf_id) as ids,
      count(distinct c.nlf_id)::integer as n
    from base b
    join public.brinesearch_odot_road_catalog c
      on c.county_code=b.county_code
     and c.street_match_key=b.step_key
     and c.street_match_key<>''
    group by b.step_id
  ), number_candidates as materialized (
    select
      b.step_id,
      pg_catalog.array_agg(distinct c.nlf_id order by c.nlf_id) as ids,
      count(distinct c.nlf_id)::integer as n
    from base b
    join public.brinesearch_odot_road_catalog c
      on c.county_code=b.county_code
     and c.route_type=b.route_type_hint
     and c.route_number_normalized=b.route_number_hint
    where b.route_type_hint is not null and b.route_number_hint is not null
    group by b.step_id
  ), resolved as (
    select b.*,
      coalesce(nc.ids,'{}'::text[]) as name_ids,
      coalesce(nc.n,0) as name_count,
      coalesce(rc.ids,'{}'::text[]) as route_ids,
      coalesce(rc.n,0) as route_count,
      case
        when b.route_type_hint is not null and coalesce(rc.n,0)=1
          and coalesce(nc.n,0)=1 and rc.ids[1]<>nc.ids[1] then null
        when b.route_type_hint is not null and coalesce(rc.n,0)=1 then rc.ids[1]
        when b.route_type_hint is null and coalesce(nc.n,0)=1 then nc.ids[1]
        else null
      end as selected_nlf_id,
      case
        when b.route_type_hint is not null and coalesce(rc.n,0)=1
          and coalesce(nc.n,0)=1 and rc.ids[1]<>nc.ids[1] then 'conflict'
        when b.route_type_hint is not null and coalesce(rc.n,0)=1 then 'unique_exact'
        when b.route_type_hint is null and coalesce(nc.n,0)=1 then 'unique_exact'
        when coalesce(rc.n,0)>1 or coalesce(nc.n,0)>1 then 'ambiguous'
        else 'no_match'
      end as initial_status,
      case
        when b.route_type_hint is not null and coalesce(rc.n,0)=1
          and coalesce(nc.n,0)=1 and rc.ids[1]=nc.ids[1]
          then 'exact_odot_route_number_and_name'
        when b.route_type_hint is not null and coalesce(rc.n,0)=1
          then 'exact_odot_route_number'
        when b.route_type_hint is null and coalesce(nc.n,0)=1
          then 'exact_odot_street_name'
        when b.route_type_hint is not null and coalesce(rc.n,0)=1
          and coalesce(nc.n,0)=1 and rc.ids[1]<>nc.ids[1]
          then 'conflicting_exact_odot_matches'
        when coalesce(rc.n,0)>1 or coalesce(nc.n,0)>1
          then 'multiple_exact_odot_matches'
        else 'no_exact_odot_match'
      end as initial_method,
      (
        select pg_catalog.array_agg(distinct x order by x)
        from pg_catalog.unnest(coalesce(nc.ids,'{}'::text[])||coalesce(rc.ids,'{}'::text[])) x
      ) as all_ids
    from base b
    left join name_candidates nc on nc.step_id=b.step_id
    left join number_candidates rc on rc.step_id=b.step_id
  ), enriched as (
    select r.*,
      off.official_name,
      off.route_type as official_route_type,
      off.route_number_normalized as official_route_number,
      off.street_match_key as selected_street_key,
      public.brinesearch_road_suffix_class(off.official_name) as official_suffix,
      case
        when r.initial_status<>'unique_exact' then r.initial_status
        when r.initial_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
          and (
            length(coalesce(r.step_key,''))<3
            or r.step_key in ('co','county','township','road','route','lane','access','lease','pad','no-sign-and')
            or r.raw_text ~* '^\s*[A-Z]\s*(RD|ROAD)?\s*$'
          ) then 'rejected_generic'
        when r.initial_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
          and r.saved_suffix is not null
          and public.brinesearch_road_suffix_class(off.official_name) is not null
          and r.saved_suffix<>public.brinesearch_road_suffix_class(off.official_name)
          then 'rejected_suffix'
        else 'unique_exact'
      end as final_status,
      case
        when r.initial_status<>'unique_exact' then r.initial_method
        when r.initial_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
          and (
            length(coalesce(r.step_key,''))<3
            or r.step_key in ('co','county','township','road','route','lane','access','lease','pad','no-sign-and')
            or r.raw_text ~* '^\s*[A-Z]\s*(RD|ROAD)?\s*$'
          ) then 'rejected_generic_exact_name'
        when r.initial_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
          and r.saved_suffix is not null
          and public.brinesearch_road_suffix_class(off.official_name) is not null
          and r.saved_suffix<>public.brinesearch_road_suffix_class(off.official_name)
          then 'rejected_suffix_mismatch'
        else r.initial_method
      end as final_method,
      coalesce(g.expected_rows,0) as expected_geometry_rows,
      coalesce(g.loaded_rows,0) as loaded_geometry_rows
    from resolved r
    left join lateral (
      select c.official_name,c.route_type,c.route_number_normalized,c.street_match_key
      from public.brinesearch_odot_road_catalog c
      where c.nlf_id=r.selected_nlf_id
        and (
          (r.initial_method='exact_odot_route_number'
            and c.route_type=r.route_type_hint
            and c.route_number_normalized=r.route_number_hint)
          or (r.initial_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
            and r.step_key<>'' and c.street_match_key=r.step_key)
        )
      order by
        case when r.step_key<>'' and c.street_match_key=r.step_key then 0 else 1 end,
        c.objectid
      limit 1
    ) off on true
    left join lateral (
      select count(*)::integer as expected_rows,count(c.geom)::integer as loaded_rows
      from public.brinesearch_odot_road_catalog c
      where c.nlf_id=r.selected_nlf_id
        and (
          (r.initial_method='exact_odot_route_number'
            and c.route_type=r.route_type_hint
            and c.route_number_normalized=r.route_number_hint)
          or (r.initial_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
            and r.step_key<>'' and c.street_match_key=r.step_key)
        )
    ) g on true
  )
  insert into private_verification.brinesearch_oh_road_matches_issue70 as tgt (
    step_id,route_prep_id,pad_id,pad_name,company,county,county_code,
    raw_text,normalized_text,step_kind,step_key,saved_suffix,
    route_type_hint,route_number_hint,candidate_nlf_ids,candidate_count,
    selected_nlf_id,selected_street_key,selected_route_type,selected_route_number,
    official_name,official_suffix,match_method,match_status,geometry_status,
    source_snapshot,staged_at
  )
  select
    e.step_id,e.route_prep_id,e.pad_id,e.pad_name,e.company,e.county,e.county_code,
    e.raw_text,e.normalized_text,e.step_kind,e.step_key,e.saved_suffix,
    e.route_type_hint,e.route_number_hint,coalesce(e.all_ids,'{}'::text[]),coalesce(cardinality(e.all_ids),0),
    e.selected_nlf_id,e.selected_street_key,e.official_route_type,e.official_route_number,
    e.official_name,e.official_suffix,e.final_method,e.final_status,
    case
      when e.final_status<>'unique_exact' then 'held'
      when e.expected_geometry_rows>0 and e.loaded_geometry_rows=e.expected_geometry_rows then 'complete'
      else 'needs_geometry'
    end,
    pg_catalog.jsonb_build_object(
      'issue',70,
      'source_agency','Ohio Department of Transportation',
      'source_dataset','Road Inventory',
      'source_url','https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
      'candidate_nlf_ids',coalesce(e.all_ids,'{}'::text[]),
      'name_candidate_count',e.name_count,
      'route_candidate_count',e.route_count,
      'expected_geometry_rows',e.expected_geometry_rows,
      'loaded_geometry_rows',e.loaded_geometry_rows,
      'matched_from_saved_text',e.raw_text,
      'local_road_guessing',false,
      'fuzzy_matching',false
    ),
    now()
  from enriched e
  on conflict(step_id) do update set
    route_prep_id=excluded.route_prep_id,
    pad_id=excluded.pad_id,
    pad_name=excluded.pad_name,
    company=excluded.company,
    county=excluded.county,
    county_code=excluded.county_code,
    raw_text=excluded.raw_text,
    normalized_text=excluded.normalized_text,
    step_kind=excluded.step_kind,
    step_key=excluded.step_key,
    saved_suffix=excluded.saved_suffix,
    route_type_hint=excluded.route_type_hint,
    route_number_hint=excluded.route_number_hint,
    candidate_nlf_ids=excluded.candidate_nlf_ids,
    candidate_count=excluded.candidate_count,
    selected_nlf_id=excluded.selected_nlf_id,
    selected_street_key=excluded.selected_street_key,
    selected_route_type=excluded.selected_route_type,
    selected_route_number=excluded.selected_route_number,
    official_name=excluded.official_name,
    official_suffix=excluded.official_suffix,
    match_method=excluded.match_method,
    match_status=excluded.match_status,
    geometry_status=excluded.geometry_status,
    source_snapshot=excluded.source_snapshot,
    staged_at=now()
  where tgt.applied_at is null;

  get diagnostics v_rows=row_count;

  select
    count(*) filter(where match_status='unique_exact' and applied_at is null),
    count(*) filter(where match_status='ambiguous' and applied_at is null),
    count(*) filter(where match_status='conflict' and applied_at is null),
    count(*) filter(where match_status='no_match' and applied_at is null),
    count(*) filter(where match_status='rejected_generic' and applied_at is null),
    count(*) filter(where match_status='rejected_suffix' and applied_at is null)
  into v_unique,v_ambiguous,v_conflict,v_no_match,v_generic,v_suffix
  from private_verification.brinesearch_oh_road_matches_issue70;

  return pg_catalog.jsonb_build_object(
    'steps_refreshed',v_rows,
    'unique_exact',v_unique,
    'ambiguous',v_ambiguous,
    'conflict',v_conflict,
    'no_match',v_no_match,
    'generic_rejected',v_generic,
    'suffix_rejected',v_suffix,
    'policy','All Ohio operators; unique exact county-scoped ODOT identity only. No fuzzy/local-road guessing.'
  );
end;
$$;

revoke all on function public.brinesearch_refresh_oh_road_matches_issue70() from public,anon;
grant execute on function public.brinesearch_refresh_oh_road_matches_issue70() to authenticated;

create or replace function public.brinesearch_load_oh_road_geometry_issue70(p_batch_size integer default 150)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_batch integer:=greatest(10,least(coalesce(p_batch_size,150),250));
  v_object_ids bigint[];
  v_response jsonb;
  v_features jsonb;
  v_rows integer:=0;
  v_loaded integer:=0;
  v_batches integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may load #70 Ohio road geometry';
  end if;

  perform public.brinesearch_refresh_oh_road_matches_issue70();

  loop
    with needed as (
      select distinct c.objectid
      from private_verification.brinesearch_oh_road_matches_issue70 m
      join public.brinesearch_odot_road_catalog c
        on c.nlf_id=m.selected_nlf_id
       and (
         (m.match_method='exact_odot_route_number'
           and c.route_type=m.route_type_hint
           and c.route_number_normalized=m.route_number_hint)
         or (m.match_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
           and m.step_key<>'' and c.street_match_key=m.step_key)
       )
      where m.match_status='unique_exact'
        and m.applied_at is null
        and c.objectid is not null
        and c.geom is null

      union

      select distinct c.objectid
      from public.brinesearch_roads r
      join public.brinesearch_odot_road_catalog c
        on c.nlf_id=pg_catalog.split_part(r.source_record_id,'|',1)
       and (
         pg_catalog.position('|street:' in r.source_record_id)=0
         or c.street_match_key=pg_catalog.split_part(r.source_record_id,'|street:',2)
       )
      where r.source_agency='Ohio Department of Transportation'
        and r.centerline_geojson is null
        and r.source_record_id is not null
        and c.objectid is not null
        and c.geom is null
    )
    select pg_catalog.array_agg(objectid order by objectid)
    into v_object_ids
    from (
      select objectid from needed order by objectid limit v_batch
    ) q;

    exit when coalesce(cardinality(v_object_ids),0)=0;

    select content::jsonb into v_response
    from extensions.http_get(
      'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0/query',
      pg_catalog.jsonb_build_object(
        'f','geojson',
        'objectIds',pg_catalog.array_to_string(v_object_ids,','),
        'outFields','OBJECTID,ROADWAY_INVENTORY_ID,NLF_ID,STREET_NAME',
        'returnGeometry','true',
        'outSR','4326'
      )
    );

    if v_response ? 'error' then
      raise exception 'ODOT geometry query failed: %',v_response->'error';
    end if;

    v_features:=coalesce(v_response->'features','[]'::jsonb);
    if pg_catalog.jsonb_array_length(v_features)=0 then
      raise exception 'ODOT geometry query returned no features for requested #70 object IDs';
    end if;

    with parsed as (
      select
        (f->'properties'->>'OBJECTID')::bigint as objectid,
        extensions.st_setsrid(extensions.st_geomfromgeojson((f->'geometry')::text),4326) as geom
      from pg_catalog.jsonb_array_elements(v_features) f
      where f->'geometry' is not null
    )
    update public.brinesearch_odot_road_catalog c
    set geom=p.geom,geometry_loaded_at=now(),fetched_at=now()
    from parsed p
    where c.objectid=p.objectid;
    get diagnostics v_rows=row_count;

    if v_rows=0 then
      raise exception 'ODOT #70 geometry batch produced no catalog updates';
    end if;

    v_loaded:=v_loaded+v_rows;
    v_batches:=v_batches+1;
  end loop;

  perform public.brinesearch_refresh_oh_road_matches_issue70();

  return pg_catalog.jsonb_build_object(
    'geometry_batches',v_batches,
    'catalog_segments_loaded',v_loaded,
    'source','Ohio Department of Transportation Road Inventory',
    'policy','Only object IDs belonging to exact #70 staged identities or already-exact ODOT Road Manager identities were requested.'
  );
end;
$$;

revoke all on function public.brinesearch_load_oh_road_geometry_issue70(integer) from public,anon;
grant execute on function public.brinesearch_load_oh_road_geometry_issue70(integer) to authenticated;

create or replace function public.brinesearch_apply_oh_road_matches_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  rec record;
  v_road_id uuid;
  v_existing_count integer;
  v_road_type text;
  v_route_number text;
  v_state text;
  v_county text;
  v_canonical text;
  v_normalized text;
  v_identity text;
  v_aliases text[];
  v_geom extensions.geometry;
  v_official_name text;
  v_official_route_type text;
  v_official_route_number text;
  v_expected integer;
  v_loaded integer;
  v_created integer:=0;
  v_reused integer:=0;
  v_steps integer:=0;
  v_existing_geometry integer:=0;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may apply #70 Ohio road matches';
  end if;

  perform public.brinesearch_refresh_oh_road_matches_issue70();

  -- First finish geometry for Road Manager identities that were already tied to
  -- exact ODOT source records before #70.  Never derive identity from a name here.
  with exact_roads as (
    select
      r.id,
      pg_catalog.split_part(r.source_record_id,'|',1) as nlf_id,
      case when pg_catalog.position('|street:' in r.source_record_id)>0
        then pg_catalog.split_part(r.source_record_id,'|street:',2)
      end as street_key
    from public.brinesearch_roads r
    where r.source_agency='Ohio Department of Transportation'
      and r.source_record_id is not null
      and r.centerline_geojson is null
  ), aggregated as (
    select e.id,
      extensions.st_unaryunion(extensions.st_collect(c.geom)) as geom,
      count(*)::integer as expected_rows,
      count(c.geom)::integer as loaded_rows
    from exact_roads e
    join public.brinesearch_odot_road_catalog c
      on c.nlf_id=e.nlf_id
     and (e.street_key is null or c.street_match_key=e.street_key)
    group by e.id
    having count(*)>0 and count(*)=count(c.geom)
  )
  update public.brinesearch_roads r
  set centerline_geojson=extensions.st_asgeojson(a.geom,7)::jsonb,
      geometry_status='official_centerline_loaded',
      geometry_checked_at=now(),
      updated_at=now(),
      notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 completed exact ODOT Road Inventory centerline.')
  from aggregated a
  where r.id=a.id;
  get diagnostics v_existing_geometry=row_count;

  for rec in
    select *
    from private_verification.brinesearch_oh_road_matches_issue70
    where match_status='unique_exact'
      and geometry_status='complete'
      and applied_at is null
    order by company,pad_name,route_prep_id,step_id
  loop
    select
      min(c.official_name),min(c.route_type),min(c.route_number_normalized),
      extensions.st_unaryunion(extensions.st_collect(c.geom)),
      count(*)::integer,count(c.geom)::integer
    into v_official_name,v_official_route_type,v_official_route_number,v_geom,v_expected,v_loaded
    from public.brinesearch_odot_road_catalog c
    where c.nlf_id=rec.selected_nlf_id
      and (
        (rec.match_method='exact_odot_route_number'
          and c.route_type=rec.route_type_hint
          and c.route_number_normalized=rec.route_number_hint)
        or (rec.match_method in ('exact_odot_street_name','exact_odot_route_number_and_name')
          and rec.step_key<>'' and c.street_match_key=rec.step_key)
      );

    if v_geom is null or v_expected=0 or v_loaded<>v_expected then
      update private_verification.brinesearch_oh_road_matches_issue70
      set geometry_status='needs_geometry',
          source_snapshot=source_snapshot||pg_catalog.jsonb_build_object('held_reason','official_geometry_incomplete_after_refresh')
      where step_id=rec.step_id;
      continue;
    end if;

    v_road_type:=case v_official_route_type
      when 'IR' then 'interstate'
      when 'US' then 'us_route'
      when 'SR' then 'state_route'
      when 'CR' then 'county'
      when 'TR' then 'township'
      else 'local'
    end;
    v_route_number:=case when v_official_route_type in ('IR','US','SR','CR','TR')
      then v_official_route_number else null end;
    v_state:=case when v_road_type in ('interstate','us_route') then null else 'OH' end;
    v_county:=case when v_road_type in ('interstate','us_route','state_route') then null else rec.county end;
    v_canonical:=case v_road_type
      when 'interstate' then 'I-'||coalesce(v_route_number,'')
      when 'us_route' then 'US-'||coalesce(v_route_number,'')
      when 'state_route' then 'OH-'||coalesce(v_route_number,'')
      else coalesce(nullif(pg_catalog.initcap(pg_catalog.lower(pg_catalog.replace(coalesce(v_official_name,''),'-',' '))),''),rec.raw_text)
    end;
    v_normalized:=public.brinesearch_road_match_key(v_canonical);
    v_identity:=case
      when v_road_type in ('interstate','us_route','state_route') then rec.selected_nlf_id
      when rec.match_method in ('exact_odot_street_name','exact_odot_route_number_and_name') and rec.step_key<>''
        then rec.selected_nlf_id||'|street:'||rec.step_key
      else rec.selected_nlf_id||'|route:'||coalesce(v_official_route_type,'')||':'||coalesce(v_official_route_number,'')
    end;

    select pg_catalog.array_agg(distinct x order by x)
    into v_aliases
    from pg_catalog.unnest(pg_catalog.array_remove(array[
      rec.raw_text,
      v_official_name,
      case v_official_route_type
        when 'IR' then 'I-'||v_official_route_number
        when 'US' then 'US-'||v_official_route_number
        when 'SR' then 'OH-'||v_official_route_number
        when 'CR' then 'CR-'||v_official_route_number
        when 'TR' then 'TR-'||v_official_route_number
        else null
      end
    ],null)) x
    where nullif(pg_catalog.btrim(x),'') is not null
      and pg_catalog.lower(pg_catalog.btrim(x))<>pg_catalog.lower(pg_catalog.btrim(v_canonical));

    v_road_id:=null;
    v_existing_count:=0;

    if v_road_type in ('interstate','us_route','state_route') then
      select count(*),min(r.id)
      into v_existing_count,v_road_id
      from public.brinesearch_roads r
      where r.road_type=v_road_type
        and r.route_number=v_route_number
        and (v_state is null or r.state=v_state);
    else
      select count(*),min(r.id)
      into v_existing_count,v_road_id
      from public.brinesearch_roads r
      where r.source_agency='Ohio Department of Transportation'
        and r.source_dataset='Road Inventory'
        and r.source_record_id=v_identity;

      if v_existing_count=0 then
        select count(*),min(r.id)
        into v_existing_count,v_road_id
        from public.brinesearch_roads r
        where r.state='OH'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(coalesce(v_county,''))
          and (
            (rec.step_key<>'' and public.brinesearch_road_name_core(r.canonical_name)=rec.step_key)
            or (rec.step_key='' and r.road_type=v_road_type and r.route_number=v_route_number)
          )
          and (
            r.source_agency is null
            or r.source_method='explicit_in_saved_directions'
            or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
          );
      end if;
    end if;

    if v_existing_count>1 then
      update private_verification.brinesearch_oh_road_matches_issue70
      set match_status='held',geometry_status='held',
          source_snapshot=source_snapshot||pg_catalog.jsonb_build_object(
            'held_reason','multiple_existing_road_manager_records_for_exact_identity',
            'existing_record_count',v_existing_count
          )
      where step_id=rec.step_id;
      continue;
    end if;

    if v_road_id is null then
      insert into public.brinesearch_roads(
        canonical_name,normalized_name,road_type,state,county,township,aliases,
        truck_route,verification_status,verified_at,route_number,
        source_agency,source_dataset,source_method,source_url,source_record_id,
        centerline_geojson,geometry_status,geometry_checked_at,
        candidate_only,approved_by_default,notes
      ) values (
        v_canonical,v_normalized,v_road_type,v_state,v_county,null,coalesce(v_aliases,'{}'::text[]),
        null,'verified',now(),v_route_number,
        'Ohio Department of Transportation','Road Inventory','official_odot_issue70_unique_exact',
        'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0',
        v_identity,extensions.st_asgeojson(v_geom,7)::jsonb,'official_centerline_loaded',now(),
        false,case when v_road_type='state_route' then true else false end,
        'Issue #70 all-operator unique exact ODOT identity. No fuzzy/local-road guessing.'
      ) returning id into v_road_id;
      v_created:=v_created+1;
    else
      update public.brinesearch_roads r
      set aliases=(
            select pg_catalog.array_agg(distinct x order by x)
            from pg_catalog.unnest(coalesce(r.aliases,'{}'::text[])||coalesce(v_aliases,'{}'::text[])) x
            where nullif(pg_catalog.btrim(x),'') is not null
          ),
          verification_status='verified',
          verified_at=coalesce(r.verified_at,now()),
          route_number=coalesce(r.route_number,v_route_number),
          source_agency=case when v_road_type in ('interstate','us_route','state_route') and r.source_agency is not null
            then r.source_agency else 'Ohio Department of Transportation' end,
          source_dataset=case when v_road_type in ('interstate','us_route','state_route') and r.source_dataset is not null
            then r.source_dataset else 'Road Inventory' end,
          source_method=case when v_road_type in ('interstate','us_route','state_route') and r.source_method is not null
            then r.source_method else 'official_odot_issue70_unique_exact' end,
          source_url=coalesce(r.source_url,'https://tims.dot.state.oh.us/ags/rest/services/Roadway_Information/Road_Inventory/FeatureServer/0'),
          source_record_id=case when v_road_type in ('interstate','us_route','state_route') and r.source_record_id is not null
            then r.source_record_id else v_identity end,
          centerline_geojson=case
            when r.centerline_geojson is null
              or r.source_agency is null
              or r.source_method='explicit_in_saved_directions'
              or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
            then extensions.st_asgeojson(v_geom,7)::jsonb
            else r.centerline_geojson
          end,
          geometry_status=case
            when r.centerline_geojson is null
              or r.source_agency is null
              or r.source_method='explicit_in_saved_directions'
              or (r.source_agency='OpenStreetMap' and r.source_method='owner_map_tap_v17328')
            then 'official_centerline_loaded'
            else r.geometry_status
          end,
          geometry_checked_at=now(),
          candidate_only=false,
          approved_by_default=case when v_road_type='state_route' then true else r.approved_by_default end,
          updated_at=now(),
          notes=pg_catalog.btrim(coalesce(r.notes,'')||' #70 exact ODOT identity/geometry verified.')
      where r.id=v_road_id;
      v_reused:=v_reused+1;
    end if;

    update public.brinesearch_route_prep_steps s
    set road_id=v_road_id,
        step_kind=case v_road_type
          when 'interstate' then 'interstate'
          when 'us_route' then 'us_route'
          when 'state_route' then 'state_route'
          when 'county' then 'county_road'
          when 'township' then 'township_road'
          else 'local_road'
        end,
        match_status='exact_master',
        match_method='official_odot_issue70_unique_exact',
        match_confidence=1.0,
        source_details=coalesce(s.source_details,'{}'::jsonb)||rec.source_snapshot||pg_catalog.jsonb_build_object(
          'source_record_id',v_identity,
          'road_id',v_road_id,
          'official_street_name',v_official_name,
          'official_route_type',v_official_route_type,
          'official_route_number',v_official_route_number,
          'local_road_guessing',false,
          'fuzzy_matching',false,
          'match_basis','unique exact county-scoped ODOT identity'
        ),
        geometry_status='ready',
        updated_at=now()
    where s.id=rec.step_id and s.road_id is null;

    if found then
      v_steps:=v_steps+1;
      update private_verification.brinesearch_oh_road_matches_issue70
      set match_status='applied',geometry_status='applied',applied_road_id=v_road_id,applied_at=now(),
          source_snapshot=source_snapshot||pg_catalog.jsonb_build_object('applied_road_id',v_road_id,'road_identity_key',v_identity)
      where step_id=rec.step_id;
    end if;
  end loop;

  perform public.road_manager_recalculate_route_readiness();

  return pg_catalog.jsonb_build_object(
    'existing_exact_odot_roads_geometry_completed',v_existing_geometry,
    'road_manager_records_created',v_created,
    'existing_road_manager_records_reused',v_reused,
    'route_steps_exactly_matched',v_steps,
    'policy','All applied rows are unique exact county-scoped ODOT identities with complete official geometry. Ambiguous/no-match rows remain held.'
  );
end;
$$;

revoke all on function public.brinesearch_apply_oh_road_matches_issue70() from public,anon;
grant execute on function public.brinesearch_apply_oh_road_matches_issue70() to authenticated;

create or replace function public.brinesearch_oh_road_coverage_issue70()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_caller uuid:=auth.uid();
  v_result jsonb;
begin
  if v_caller is null or not public.is_brinesearch_owner(v_caller) then
    raise exception 'Only the BrineSearch Owner may view #70 road coverage diagnostics';
  end if;

  select pg_catalog.jsonb_build_object(
    'road_manager_total',(select count(*) from public.brinesearch_roads),
    'road_manager_with_geometry',(select count(*) from public.brinesearch_roads where centerline_geojson is not null),
    'road_manager_missing_geometry',(select count(*) from public.brinesearch_roads where centerline_geojson is null),
    'active_route_steps',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where s.active and rp.active),
    'active_route_steps_with_road_id',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where s.active and rp.active and s.road_id is not null),
    'active_route_steps_without_road_id',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where s.active and rp.active and s.road_id is null),
    'oh_unique_exact_waiting',(select count(*) from private_verification.brinesearch_oh_road_matches_issue70 where match_status='unique_exact' and applied_at is null),
    'oh_ambiguous_waiting',(select count(*) from private_verification.brinesearch_oh_road_matches_issue70 where match_status='ambiguous' and applied_at is null),
    'oh_applied_issue70',(select count(*) from private_verification.brinesearch_oh_road_matches_issue70 where applied_at is not null)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.brinesearch_oh_road_coverage_issue70() from public,anon;
grant execute on function public.brinesearch_oh_road_coverage_issue70() to authenticated;

comment on function public.brinesearch_refresh_oh_road_matches_issue70() is
  'Issue #70: all-operator Ohio exact ODOT staging. Never fuzzy-match or guess a local road.';
comment on function public.brinesearch_load_oh_road_geometry_issue70(integer) is
  'Issue #70: loads ODOT geometry only for exact staged/existing official identities.';
comment on function public.brinesearch_apply_oh_road_matches_issue70() is
  'Issue #70: applies only unique exact ODOT identities with complete official geometry.';
comment on function public.brinesearch_oh_road_coverage_issue70() is
  'Issue #70 Owner diagnostics for Road Manager and route-step coverage.';
