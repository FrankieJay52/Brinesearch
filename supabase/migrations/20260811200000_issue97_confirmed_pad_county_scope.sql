-- GitHub #97 — correct the authoritative graph footprint to the confirmed
-- current BrineSearch pad-county research contract.
--
-- The initial WIP registry accidentally substituted Holmes/Licking (OH) for
-- Meigs/Vinton and Harrison (WV) for Lewis. Keep those historical registry
-- rows for auditability, but make them inactive and non-ingestible. Required
-- source scopes must match the same 39 active counties exactly.

-- Disable every source scope for counties that are not in the confirmed #97
-- footprint before deactivating the county registry rows.
update public.brinesearch_road_source_dataset_counties
set ingest_enabled=false,
    required_for_graph=false,
    active=false,
    provenance=coalesce(provenance,'{}'::jsonb) || pg_catalog.jsonb_build_object(
      'issue97_scope_correction','removed_from_confirmed_pad_footprint',
      'corrected_at',pg_catalog.now()
    ),
    updated_at=pg_catalog.now()
where (state_code='OH' and county_code in ('HOL','LIC'))
   or (state_code='WV' and county_code='HAR');

update public.brinesearch_road_graph_counties
set active=false
where (state_code='OH' and county_code in ('HOL','LIC'))
   or (state_code='WV' and county_code='HAR');

-- Add the three confirmed counties omitted from the WIP seed.
insert into public.brinesearch_road_graph_counties(
  state_code,county_code,county_name,county_geoid,
  source_county_code,source_county_code_kind,active
) values
  ('OH','MEG','Meigs','39105','MEG','ODOT COUNTY_CD',true),
  ('OH','VIN','Vinton','39163','VIN','ODOT COUNTY_CD',true),
  ('WV','LEW','Lewis','54041','21','WVDOT CO_CountyID / Route ID prefix',true)
on conflict(state_code,county_code) do update set
  county_name=excluded.county_name,
  county_geoid=excluded.county_geoid,
  source_county_code=excluded.source_county_code,
  source_county_code_kind=excluded.source_county_code_kind,
  active=true;

-- Required primary sources follow the corrected county registry. Ohio uses
-- ODOT TIMS. West Virginia uses the Publication LRS plus both official/local
-- name event layers required by the graph contract.
insert into public.brinesearch_road_source_dataset_counties(
  dataset_id,state_code,county_code,ingest_enabled,required_for_graph,active,provenance
)
select d.id,c.state_code,c.county_code,true,true,true,
  pg_catalog.jsonb_build_object(
    'scope_rule','confirmed issue-97 pad county',
    'issue97_scope_correction',true
  )
from public.brinesearch_road_graph_counties c
join public.brinesearch_road_source_datasets d on d.state_code=c.state_code
where c.active
  and (
    (c.state_code='OH' and c.county_code in ('MEG','VIN')
      and d.source_key='oh_odot_tims_road_inventory')
    or
    (c.state_code='WV' and c.county_code='LEW' and d.source_key in (
      'wv_wvdot_publication_lrs',
      'wv_wvdot_street_name_doh',
      'wv_wvdot_street_name_sams',
      'wv_wvdot_alternate_route_name'
    ))
  )
on conflict(dataset_id,state_code,county_code) do update set
  ingest_enabled=true,
  required_for_graph=true,
  active=true,
  provenance=excluded.provenance,
  updated_at=pg_catalog.now();

-- Supplemental sources remain registered but nonblocking/non-topological.
insert into public.brinesearch_road_source_dataset_counties(
  dataset_id,state_code,county_code,ingest_enabled,required_for_graph,active,provenance
)
select d.id,c.state_code,c.county_code,false,false,true,
  pg_catalog.jsonb_build_object(
    'scope_rule','confirmed issue-97 supplemental county coverage',
    'topology_authority',false,
    'issue97_scope_correction',true
  )
from public.brinesearch_road_graph_counties c
join public.brinesearch_road_source_datasets d on d.state_code=c.state_code
where c.active
  and (
    (c.state_code='OH' and c.county_code in ('MEG','VIN') and d.source_key in (
      'oh_ogrip_lbrs_centerlines','us_census_tiger_roads_qa_oh'
    ))
    or
    (c.state_code='WV' and c.county_code='LEW'
      and d.source_key='us_census_tiger_roads_qa_wv')
  )
on conflict(dataset_id,state_code,county_code) do update set
  ingest_enabled=false,
  required_for_graph=false,
  active=true,
  provenance=excluded.provenance,
  updated_at=pg_catalog.now();

-- Hard invariant: #97 is scoped to exactly the 39 confirmed pad counties.
do $$
declare
  v_actual text[];
  v_expected constant text[] := array[
    'OH:ATH','OH:BEL','OH:CAR','OH:COL','OH:COS','OH:GUE','OH:HAS','OH:JEF',
    'OH:MAH','OH:MEG','OH:MOE','OH:MUS','OH:NOB','OH:POR','OH:STA','OH:TRU',
    'OH:TUS','OH:VIN','OH:WAS',
    'PA:ALL','PA:ARM','PA:BEA','PA:BRA','PA:BUT','PA:FAY','PA:GRE','PA:IND',
    'PA:WAS','PA:WES',
    'WV:BRO','WV:DOD','WV:LEW','WV:MAR','WV:MON','WV:MSH','WV:OHI','WV:RIT',
    'WV:TYL','WV:WET'
  ];
begin
  select pg_catalog.array_agg(state_code||':'||county_code order by state_code,county_code)
  into v_actual
  from public.brinesearch_road_graph_counties
  where active;

  if v_actual is distinct from v_expected then
    raise exception 'Issue #97 active county scope mismatch. expected %, got %',v_expected,v_actual;
  end if;

  if exists(
    select 1
    from public.brinesearch_road_source_dataset_counties s
    join public.brinesearch_road_graph_counties c
      on c.state_code=s.state_code and c.county_code=s.county_code
    where s.active and (s.ingest_enabled or s.required_for_graph) and not c.active
  ) then
    raise exception 'Issue #97 active source scope references an inactive county';
  end if;

  if exists(
    with required_source(state_code,source_key) as (
      values
        ('OH','oh_odot_tims_road_inventory'),
        ('WV','wv_wvdot_publication_lrs'),
        ('WV','wv_wvdot_street_name_doh'),
        ('WV','wv_wvdot_street_name_sams'),
        ('WV','wv_wvdot_alternate_route_name'),
        ('PA','pa_penndot_state_roads'),
        ('PA','pa_penndot_local_roads'),
        ('PA','pa_penndot_at_grade_intersections')
    )
    select 1
    from public.brinesearch_road_graph_counties c
    join required_source r on r.state_code=c.state_code
    join public.brinesearch_road_source_datasets d
      on d.state_code=c.state_code and d.source_key=r.source_key and d.active
    left join public.brinesearch_road_source_dataset_counties s
      on s.dataset_id=d.id and s.state_code=c.state_code and s.county_code=c.county_code
      and s.active and s.ingest_enabled and s.required_for_graph
    where c.active and s.dataset_id is null
  ) then
    raise exception 'Issue #97 required authoritative source scope is missing for an active county';
  end if;
end
$$;
