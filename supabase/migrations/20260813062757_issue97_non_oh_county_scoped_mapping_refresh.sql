-- GitHub #97 — WV/PA graph builds must not refresh every machine mapping.
--
-- The effective non-OH builder still calls the legacy global exact-mapping
-- refresher. A dark WV build would retire/re-upsert unrelated Ohio and
-- Pennsylvania rows before topology work. This private helper preserves the
-- proven exact-only rules while constraining both retirement and candidate
-- generation to one explicit WV/PA state+county identity scope.

create or replace function private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh(
  p_state_code text,
  p_county_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $issue97_refresh_exact_mappings_non_oh$
declare
  v_state text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_state_code,'')));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_scope text:=v_state||':'||v_county;
  v_retired integer:=0;
  v_rows integer:=0;
  v_verified integer:=0;
  v_held integer:=0;
begin
  if v_state not in ('WV','PA') or not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code=v_state and c.county_code=v_county and c.active
  ) then
    raise exception 'Issue #97 non-OH mapping refresh scope is outside the active WV/PA graph footprint: %',v_scope;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')
  );

  update public.brinesearch_road_identity_mappings m set
    mapping_status='retired',verified_at=null,updated_at=now(),
    evidence=m.evidence||pg_catalog.jsonb_build_object(
      'retired_by_refresh',true,'refresh_scope',v_scope
    )
  where m.mapping_method in ('exact_source_record_id','exact_route_designation')
    and m.mapping_status in ('verified','candidate')
    and exists(
      select 1 from public.brinesearch_authoritative_road_identities i
      where i.id=m.identity_id and i.state_code=v_state and i.county_code=v_county
    );
  get diagnostics v_retired=row_count;

  with scope_identities as materialized (
    select i.*
    from public.brinesearch_authoritative_road_identities i
    where i.active and i.state_code=v_state and i.county_code=v_county
  ), exact_designations as (
    select i.id as identity_id,i.source_identity_key,i.state_code,i.county_name,
      i.township,i.road_class,
      pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
        coalesce(i.route_number,'')||coalesce(i.route_suffix,'')||
        coalesce(i.route_fraction,'')||coalesce(i.route_extension,''),
        '[^0-9A-Z]','','g')),'^0+','') as route_token,
      pg_catalog.jsonb_build_object(
        'route_number',i.route_number,'route_suffix',i.route_suffix,
        'route_fraction',i.route_fraction,'route_extension',i.route_extension,
        'designation_source','identity_exact_components','refresh_scope',v_scope
      ) as component_evidence
    from scope_identities i
    where v_state='WV'
      and i.road_class in ('interstate','us_route','state_route','county','township')

    union all

    select i.id,i.source_identity_key,i.state_code,i.county_name,i.township,
      case
        when pg_catalog.upper(n.road_name) ~ '^I[- ]' then 'interstate'
        when pg_catalog.upper(n.road_name) ~ '^US[- ]' then 'us_route'
        when pg_catalog.upper(n.road_name) ~ '^PA[- ]' then 'state_route'
      end,
      pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(n.road_name,'^[A-Za-z]+[- ]*','','g'),
        '[^0-9A-Z]','','g')),'^0+',''),
      pg_catalog.jsonb_build_object(
        'designation_source','explicit_penndot_signed_event',
        'name_event_id',n.id,'source_record_id',n.source_record_id,
        'signed_name',n.road_name,'refresh_scope',v_scope
      )
    from scope_identities i
    join public.brinesearch_authoritative_road_names n
      on n.identity_id=i.id and n.active and n.name_type='signed'
      and (n.valid_from is null or n.valid_from<=now())
      and (n.valid_to is null or n.valid_to>now())
    where v_state='PA'
      and pg_catalog.upper(n.road_name) ~ '^(I|US|PA)[- ][0-9]'
  ), raw_candidates as (
    select i.id as identity_id,r.id as road_id,0 as priority,
      'exact_source_record_id'::text as method,
      pg_catalog.jsonb_build_object(
        'road_source_record_id',r.source_record_id,
        'source_identity_key',i.source_identity_key,
        'state_and_jurisdiction_checked',true,'no_name_matching',true,
        'refresh_scope',v_scope
      ) as evidence
    from scope_identities i
    join public.brinesearch_roads r on (
      r.source_record_id=i.source_identity_key
      or (v_state='WV'
        and i.source_identity_key like 'WV:WVDOT:ROUTE_ID:%'
        and nullif(pg_catalog.replace(
          i.source_identity_key,'WV:WVDOT:ROUTE_ID:',''
        ),'') is not null
        and pg_catalog.split_part(coalesce(r.source_record_id,''),'|',1)
          =pg_catalog.replace(i.source_identity_key,'WV:WVDOT:ROUTE_ID:',''))
    )
    where r.verification_status='verified'
      and (r.state=i.state_code or (r.state is null and r.road_type in ('interstate','us_route')))
      and (r.road_type in ('interstate','us_route','state_route')
        or pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(i.county_name))

    union all

    select d.identity_id,r.id,1,'exact_route_designation',
      pg_catalog.jsonb_build_object(
        'route_class',d.road_class,'route_token',d.route_token,
        'state_code',d.state_code,'county_name',d.county_name,'township',d.township,
        'source_identity_key',d.source_identity_key,
        'designation_not_name',true,'no_fuzzy_or_spatial_matching',true,
        'refresh_scope',v_scope
      )||d.component_evidence
    from exact_designations d
    join public.brinesearch_roads r on r.road_type=d.road_class
      and pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.regexp_replace(coalesce(r.route_number,''),'[^0-9A-Z]','','g')),
        '^0+',''
      )=d.route_token
      and (d.road_class in ('interstate','us_route')
        or (r.state=d.state_code and d.road_class='state_route')
        or (r.state=d.state_code and d.road_class='county'
          and pg_catalog.lower(coalesce(r.county,''))=pg_catalog.lower(d.county_name))
        or (r.state=d.state_code and d.road_class='township'
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
      'refresh_scope',v_scope
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
  where i.state_code=v_state and i.county_code=v_county
    and m.mapping_method in ('exact_source_record_id','exact_route_designation')
    and m.mapping_status in ('verified','candidate');

  if exists(
    select 1
    from public.brinesearch_road_identity_mappings m
    join public.brinesearch_authoritative_road_identities i on i.id=m.identity_id
    where m.evidence->>'refresh_scope'=v_scope
      and (i.state_code<>v_state or i.county_code<>v_county)
  ) then
    raise exception 'Issue #97 non-OH mapping refresh escaped scope %',v_scope;
  end if;

  return pg_catalog.jsonb_build_object(
    'scope',v_scope,
    'retired_exact_mappings',v_retired,
    'exact_mappings_touched',v_rows,
    'verified_exact_mappings',v_verified,
    'ambiguous_exact_candidates_held',v_held,
    'pa_internal_route_auto_mapping_forbidden',true,
    'all_route_components_must_match',true,
    'name_matching_used',false,
    'fuzzy_matching_used',false,
    'nearest_road_used',false
  );
end
$issue97_refresh_exact_mappings_non_oh$;

revoke all on function private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh(text,text)
from public,anon,authenticated,service_role;

do $issue97_patch_non_oh_county_mapping_refresh$
declare
  v_definition text;
  v_old text:='perform public.brinesearch_issue97_refresh_exact_mappings();';
  v_new text:=
    'perform private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh(v_state,v_county);';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  v_count:=(pg_catalog.length(v_definition)-pg_catalog.length(
    pg_catalog.replace(v_definition,v_old,'')
  ))/pg_catalog.length(v_old);
  if v_count<>1 then
    raise exception 'Issue #97 non-OH global mapping refresh target changed: %',v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_old,v_new);
end
$issue97_patch_non_oh_county_mapping_refresh$;

do $issue97_verify_non_oh_county_mapping_refresh$
declare
  v_builder text;
  v_helper text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.brinesearch_issue97_rebuild_county_graph(text,text)'::pg_catalog.regprocedure
  ) into v_builder;
  select pg_catalog.pg_get_functiondef(
    'private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh(text,text)'::pg_catalog.regprocedure
  ) into v_helper;

  if v_builder not like '%if v_state=''OH'' then%'
     or v_builder not like '%brinesearch_issue97_refresh_exact_mappings_oh(v_county)%'
     or v_builder not like '%brinesearch_issue97_refresh_exact_mappings_non_oh(v_state,v_county)%'
     or v_builder like '%perform public.brinesearch_issue97_refresh_exact_mappings();%'
     or v_helper not like '%i.state_code=v_state and i.county_code=v_county%'
     or v_helper not like '%n.name_type=''signed''%'
     or v_helper not like '%^(I|US|PA)[- ][0-9]%'
     or v_helper like '%similarity(%'
     or v_helper like '%mapping_method=''name_only''%'
     or v_helper like '%<->%'
     or v_helper like '%st_dwithin%'
     or v_helper like '%update public.brinesearch_roads%'
  then
    raise exception 'Issue #97 non-OH county mapping refresh contract did not install cleanly';
  end if;
end
$issue97_verify_non_oh_county_mapping_refresh$;

comment on function private_verification.brinesearch_issue97_refresh_exact_mappings_non_oh(text,text) is
  'Issue #97 private WV/PA state+county exact mapping refresh. No fuzzy, name-only, nearest-road, spatial, or PA internal-route inference.';
