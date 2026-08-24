-- GitHub #97 — make Ohio graph mapping refresh county-scoped.
--
-- The first Ohio-only mapping refresher correctly avoided cross-state writes but
-- still refreshed every Ohio identity for every county rebuild. Guernsey proved
-- that this can exceed the normal statement limit before topology work starts.
-- Ohio identity refresh is already county-scoped, so exact mapping refresh must
-- follow the same dependency boundary.
--
-- This forward migration adds a county-scoped overload and switches OH graph
-- rebuilds to it. Exact evidence/no-guess semantics are unchanged.

create or replace function private_verification.brinesearch_issue97_refresh_exact_mappings_oh(
  p_county_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $issue97_refresh_exact_mappings_oh_county$
declare
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_rows integer:=0;
  v_verified integer:=0;
  v_held integer:=0;
begin
  if not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code='OH' and c.county_code=v_county and c.active
  ) then
    raise exception 'Issue #97 Ohio mapping refresh county is outside the active graph footprint: %',v_county;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  -- Retire only machine-owned exact mappings for the one Ohio county whose
  -- authoritative identities were just refreshed.
  update public.brinesearch_road_identity_mappings m set
    mapping_status='retired',verified_at=null,updated_at=now(),
    evidence=m.evidence||pg_catalog.jsonb_build_object(
      'retired_by_refresh',true,'refresh_scope','OH:'||v_county
    )
  where m.mapping_method in ('exact_source_record_id','exact_route_designation')
    and m.mapping_status in ('verified','candidate')
    and exists(
      select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=m.identity_id and i.state_code='OH' and i.county_code=v_county
    );

  with scope_identities as (
    select i.*,
      pg_catalog.split_part(
        pg_catalog.replace(i.source_identity_key,'OH:ODOT:NLF:',''),':',1
      ) as nlf_base
    from public.brinesearch_authoritative_road_identities i
    where i.active and i.state_code='OH' and i.county_code=v_county
  ), nlf_base_counts as (
    select pg_catalog.split_part(
        pg_catalog.replace(i.source_identity_key,'OH:ODOT:NLF:',''),':',1
      ) as nlf_base,
      count(*)::integer as identity_count
    from public.brinesearch_authoritative_road_identities i
    where i.active and i.state_code='OH'
    group by 1
  ), exact_designations as (
    select i.id as identity_id,i.source_identity_key,i.state_code,i.county_name,
      i.township,i.road_class,i.nlf_base,
      pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
        coalesce(i.route_number,'')||coalesce(i.route_suffix,'')||
        coalesce(i.route_fraction,'')||coalesce(i.route_extension,''),
        '[^0-9A-Z]','','g')),'^0+','') as route_token,
      pg_catalog.jsonb_build_object(
        'route_number',i.route_number,'route_suffix',i.route_suffix,
        'route_fraction',i.route_fraction,'route_extension',i.route_extension,
        'designation_source','identity_exact_components',
        'refresh_scope','OH:'||v_county
      ) as component_evidence
    from scope_identities i
    where i.road_class in ('interstate','us_route','state_route','county','township')
  ), raw_candidates as (
    select i.id as identity_id,r.id as road_id,0 as priority,
      'exact_source_record_id'::text as method,
      pg_catalog.jsonb_build_object(
        'road_source_record_id',r.source_record_id,
        'source_identity_key',i.source_identity_key,
        'state_and_jurisdiction_checked',true,
        'no_name_matching',true,'refresh_scope','OH:'||v_county
      ) as evidence
    from scope_identities i
    left join nlf_base_counts base on base.nlf_base=i.nlf_base
    join public.brinesearch_roads r on (
      r.source_record_id=i.source_identity_key
      or (
        pg_catalog.split_part(coalesce(r.source_record_id,''),'|',1)=i.nlf_base
        and base.identity_count=1
      )
    )
    where r.verification_status='verified'
      and (r.state='OH' or (r.state is null and r.road_type in ('interstate','us_route')))
      and (
        r.road_type in ('interstate','us_route','state_route')
        or pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(i.county_name)
      )

    union all

    select d.identity_id,r.id,1,'exact_route_designation',
      pg_catalog.jsonb_build_object(
        'route_class',d.road_class,'route_token',d.route_token,
        'state_code','OH','county_name',d.county_name,'township',d.township,
        'source_identity_key',d.source_identity_key,
        'designation_not_name',true,'no_fuzzy_or_spatial_matching',true,
        'refresh_scope','OH:'||v_county
      )||d.component_evidence
    from exact_designations d
    join public.brinesearch_roads r on r.road_type=d.road_class
      and pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.regexp_replace(
          coalesce(r.route_number,''),'[^0-9A-Z]','','g'
        )),'^0+',''
      )=d.route_token
      and (
        d.road_class in ('interstate','us_route')
        or (r.state='OH' and d.road_class='state_route')
        or (r.state='OH' and d.road_class='county'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(d.county_name))
        or (r.state='OH' and d.road_class='township'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(d.county_name)
          and nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(d.township,''))),'') is not null
          and pg_catalog.lower(pg_catalog.btrim(coalesce(r.township,'')))
            =pg_catalog.lower(pg_catalog.btrim(d.township)))
      )
    where r.verification_status='verified' and d.route_token<>''
  ), deduplicated as (
    select distinct on(identity_id,road_id)
      identity_id,road_id,method,evidence,priority
    from raw_candidates
    order by identity_id,road_id,priority,method
  ), eligible as (
    select d.*,count(*) over(partition by d.identity_id) as candidate_count
    from deduplicated d
    where not exists(
      select 1 from public.brinesearch_road_identity_mappings manual
      where manual.identity_id=d.identity_id and manual.mapping_status<>'retired'
        and manual.mapping_method not in ('exact_source_record_id','exact_route_designation')
    )
  )
  insert into public.brinesearch_road_identity_mappings(
    id,identity_id,road_id,mapping_status,mapping_method,evidence,verified_at
  )
  select
    private_verification.brinesearch_issue97_uuid(
      'map:'||e.identity_id::text||':'||e.road_id::text
    ),
    e.identity_id,e.road_id,
    case when e.candidate_count=1 then 'verified' else 'candidate' end,
    e.method,
    e.evidence||pg_catalog.jsonb_build_object(
      'exact_candidate_count',e.candidate_count,
      'ambiguity_held',e.candidate_count>1,
      'refresh_scope','OH:'||v_county
    ),
    case when e.candidate_count=1 then now() else null end
  from eligible e
  on conflict(identity_id,road_id) do update set
    mapping_status=excluded.mapping_status,
    mapping_method=excluded.mapping_method,
    evidence=excluded.evidence,
    verified_at=excluded.verified_at,
    updated_at=now()
  where public.brinesearch_road_identity_mappings.mapping_method
    in ('exact_source_record_id','exact_route_designation');
  get diagnostics v_rows=row_count;

  select count(*) filter(where m.mapping_status='verified'),
    count(*) filter(where m.mapping_status='candidate')
  into v_verified,v_held
  from public.brinesearch_road_identity_mappings m
  join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
  where i.state_code='OH' and i.county_code=v_county
    and m.mapping_method in ('exact_source_record_id','exact_route_designation')
    and m.mapping_status in ('verified','candidate');

  if exists(
    select 1
    from public.brinesearch_road_identity_mappings m
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    where m.evidence->>'refresh_scope'='OH:'||v_county
      and (i.state_code<>'OH' or i.county_code<>v_county)
  ) then
    raise exception 'Issue #97 Ohio county mapping refresh escaped scope %',v_county;
  end if;

  return pg_catalog.jsonb_build_object(
    'scope','OH:'||v_county,
    'exact_mappings_touched',v_rows,
    'verified_exact_mappings',v_verified,
    'ambiguous_exact_candidates_held',v_held,
    'all_route_components_must_match',true,
    'name_matching_used',false,
    'fuzzy_matching_used',false,
    'nearest_road_used',false
  );
end
$issue97_refresh_exact_mappings_oh_county$;

revoke all on function private_verification.brinesearch_issue97_refresh_exact_mappings_oh(text)
from public,anon,authenticated,service_role;

-- Switch the OH graph builder from the broad OH refresher to the county-scoped
-- overload. This patch is convergent if another coordinated writer installed it.
do $issue97_patch_oh_county_mapping_refresh$
declare
  v_definition text;
  v_old text:='perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh();';
  v_new text:='perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh(v_county);';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;

  if v_definition like '%perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh(v_county);%' then
    null;
  else
    v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
      pg_catalog.replace(v_definition,v_old,'')
    ))/pg_catalog.length(v_old);
    if v_count<>1 then
      raise exception 'Issue #97 Ohio county mapping refresh patch target changed: %',v_count;
    end if;
    execute pg_catalog.replace(v_definition,v_old,v_new);
  end if;
end
$issue97_patch_oh_county_mapping_refresh$;

do $issue97_verify_oh_county_mapping_refresh$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not like '%if v_state=''OH'' then%'
     or v_definition not like '%brinesearch_issue97_refresh_exact_mappings_oh(v_county)%'
     or v_definition like '%perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh();%'
     or v_definition not like '%else%brinesearch_issue97_refresh_exact_mappings()%'
  then
    raise exception 'Issue #97 Ohio graph rebuild is not using the county-scoped mapping refresh';
  end if;
end
$issue97_verify_oh_county_mapping_refresh$;
