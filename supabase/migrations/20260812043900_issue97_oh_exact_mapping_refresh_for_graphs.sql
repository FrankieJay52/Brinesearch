-- GitHub #97 — keep Ohio graph rebuilds inside the Ohio-only work lane.
--
-- The existing county graph builder calls the global exact-mapping refresher.
-- That is correct for a full multi-state rollout, but it is too broad while the
-- current production work lane is intentionally Ohio-only. This migration adds
-- an Ohio-scoped equivalent and makes OH graph rebuilds use it. Non-Ohio graph
-- rebuild behavior remains unchanged.
--
-- The Ohio refresher preserves the same exact-evidence rules as the global
-- implementation: reviewed/manual mappings are never displaced, ambiguous exact
-- candidates remain held, source-record/designation equality is required, and no
-- name/fuzzy/nearest geometry selection is used.

create or replace function private_verification.brinesearch_issue97_refresh_exact_mappings_oh()
returns jsonb
language plpgsql
security definer
set search_path=''
as $issue97_refresh_exact_mappings_oh$
declare
  v_rows integer:=0;
  v_verified integer:=0;
  v_held integer:=0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  -- Retire only machine-owned exact mappings whose authoritative identity is OH.
  update public.brinesearch_road_identity_mappings m set
    mapping_status='retired',verified_at=null,updated_at=now(),
    evidence=m.evidence||pg_catalog.jsonb_build_object(
      'retired_by_refresh',true,'refresh_scope','OH'
    )
  where m.mapping_method in ('exact_source_record_id','exact_route_designation')
    and m.mapping_status in ('verified','candidate')
    and exists(
      select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=m.identity_id and i.state_code='OH'
    );

  with exact_designations as (
    select i.id as identity_id,i.source_identity_key,i.state_code,i.county_name,
      i.township,i.road_class,
      pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
        coalesce(i.route_number,'')||coalesce(i.route_suffix,'')||
        coalesce(i.route_fraction,'')||coalesce(i.route_extension,''),
        '[^0-9A-Z]','','g')),'^0+','') as route_token,
      pg_catalog.jsonb_build_object(
        'route_number',i.route_number,'route_suffix',i.route_suffix,
        'route_fraction',i.route_fraction,'route_extension',i.route_extension,
        'designation_source','identity_exact_components',
        'refresh_scope','OH'
      ) as component_evidence
    from public.brinesearch_authoritative_road_identities i
    where i.active and i.state_code='OH'
      and i.road_class in ('interstate','us_route','state_route','county','township')
  ), raw_candidates as (
    select i.id as identity_id,r.id as road_id,0 as priority,
      'exact_source_record_id'::text as method,
      pg_catalog.jsonb_build_object(
        'road_source_record_id',r.source_record_id,
        'source_identity_key',i.source_identity_key,
        'state_and_jurisdiction_checked',true,
        'no_name_matching',true,'refresh_scope','OH'
      ) as evidence
    from public.brinesearch_authoritative_road_identities i
    join public.brinesearch_roads r on (
      r.source_record_id=i.source_identity_key
      or (
        pg_catalog.split_part(coalesce(r.source_record_id,''),'|',1)
          =pg_catalog.split_part(
            pg_catalog.replace(i.source_identity_key,'OH:ODOT:NLF:',''),':',1
          )
        and (
          select count(*)
          from public.brinesearch_authoritative_road_identities sibling
          where sibling.active and sibling.state_code='OH'
            and sibling.source_identity_key like
              'OH:ODOT:NLF:'||pg_catalog.split_part(
                pg_catalog.replace(i.source_identity_key,'OH:ODOT:NLF:',''),':',1
              )||'%'
        )=1
      )
    )
    where i.active and i.state_code='OH'
      and r.verification_status='verified'
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
        'refresh_scope','OH'
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
    e.method,e.evidence||pg_catalog.jsonb_build_object(
      'exact_candidate_count',e.candidate_count,
      'ambiguity_held',e.candidate_count>1,
      'refresh_scope','OH'
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
  where i.state_code='OH'
    and m.mapping_method in ('exact_source_record_id','exact_route_designation')
    and m.mapping_status in ('verified','candidate');

  if exists(
    select 1
    from public.brinesearch_road_identity_mappings m
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    where m.evidence->>'refresh_scope'='OH' and i.state_code<>'OH'
  ) then
    raise exception 'Issue #97 Ohio exact mapping refresh touched a non-Ohio identity';
  end if;

  return pg_catalog.jsonb_build_object(
    'scope','OH','exact_mappings_touched',v_rows,
    'verified_exact_mappings',v_verified,
    'ambiguous_exact_candidates_held',v_held,
    'all_route_components_must_match',true,
    'name_matching_used',false,
    'fuzzy_matching_used',false,
    'nearest_road_used',false
  );
end
$issue97_refresh_exact_mappings_oh$;

revoke all on function private_verification.brinesearch_issue97_refresh_exact_mappings_oh()
from public,anon,authenticated,service_role;

-- Patch only the mapping-refresh dispatch inside the existing graph builder.
-- All source, topology, activation, and validation logic remains unchanged.
do $issue97_patch_oh_graph_mapping_refresh$
declare
  v_definition text;
  v_old text:=E'  if v_state=''OH'' then perform public.brinesearch_issue97_refresh_oh_identities(v_county); end if;\n  perform public.brinesearch_issue97_refresh_exact_mappings();';
  v_new text:=E'  if v_state=''OH'' then\n    perform public.brinesearch_issue97_refresh_oh_identities(v_county);\n    perform private_verification.brinesearch_issue97_refresh_exact_mappings_oh();\n  else\n    perform public.brinesearch_issue97_refresh_exact_mappings();\n  end if;';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,'')
  ))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 Ohio graph mapping refresh patch target changed: %',v_count;
  end if;
  v_definition:=pg_catalog.replace(v_definition,v_old,v_new);
  execute v_definition;
end
$issue97_patch_oh_graph_mapping_refresh$;

do $issue97_verify_oh_graph_mapping_refresh$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition not like '%if v_state=''OH'' then%'
     or v_definition not like '%brinesearch_issue97_refresh_exact_mappings_oh()%'
     or v_definition not like '%else%brinesearch_issue97_refresh_exact_mappings()%'
  then
    raise exception 'Issue #97 Ohio graph rebuild does not have the Ohio-only mapping refresh dispatch';
  end if;
end
$issue97_verify_oh_graph_mapping_refresh$;
