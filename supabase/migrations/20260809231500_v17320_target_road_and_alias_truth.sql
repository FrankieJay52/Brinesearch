-- BrineSearch V17.3.20 follow-up
-- Fix source rows where an origin/intersection road was parsed as the road being
-- driven even though the same saved instruction explicitly says to turn/head/travel
-- onto a different route. Also capture exact local-name pairs with directional
-- suffixes (Rd NW, Rd NE, etc.) and Trail names.

create or replace function public.brinesearch_explicit_target_route_v17320(
  p_instruction text,
  p_state text
)
returns text
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
declare
  m text[];
  fam text;
  body text;
  state_code text;
begin
  if coalesce(p_instruction,'') !~* '^From' then return null; end if;

  -- Prefer a concrete action target after the origin: turn/head/travel/go/proceed
  -- ON/ONTO a numbered road. Intersections merely mentioned before that action do
  -- not qualify.
  m:=regexp_match(p_instruction,
    '(?:turn(?:[[:space:]]+(?:left|right|west|east|north|south))?|head(?:[[:space:]]+(?:northwest|northeast|southwest|southeast|north|south|east|west))?|travel(?:[[:space:]]+(?:northwest|northeast|southwest|southeast|north|south|east|west))?|go(?:[[:space:]]+(?:northwest|northeast|southwest|southeast|north|south|east|west))?|proceed(?:[[:space:]]+(?:northwest|northeast|southwest|southeast|north|south|east|west))?)[^.;]{0,80}(?:on|onto|along)[[:space:]]+(?:the[[:space:]]+)?(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:>:]]',
    'i');
  if m is null then return null; end if;

  fam:=upper(m[1]);
  body:=upper(regexp_replace(m[2],'[[:space:]]','','g'));
  state_code:=case lower(btrim(coalesce(p_state,'')))
    when 'ohio' then 'OH' when 'oh' then 'OH'
    when 'west virginia' then 'WV' when 'wv' then 'WV'
    when 'pennsylvania' then 'PA' when 'pa' then 'PA'
    else '' end;
  if fam='SR' and state_code<>'' then fam:=state_code; end if;
  return fam||'-'||body;
end
$$;

create or replace function public.brinesearch_directional_alias_v17320(
  p_instruction text,
  p_road_key text,
  p_state text
)
returns text
language plpgsql
stable
set search_path=pg_catalog,public
as $$
declare
  m text[];
  a text;
  suffix text := '(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way|Trail)';
  bearing text := '(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West|Northeast|Northwest|Southeast|Southwest)';
begin
  if nullif(btrim(coalesce(p_instruction,'')),'') is null
     or nullif(btrim(coalesce(p_road_key,'')),'') is null then return null; end if;

  -- Local road name, optionally followed by a directional suffix, then / route.
  m:=regexp_match(p_instruction,
    '([A-Za-z][A-Za-z0-9 .''-]{0,70}'||suffix||'(?:[[:space:]]+'||bearing||')?)[[:space:]]*/[[:space:]]*(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:>:]]',
    'i');
  if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[2],m[3],p_state) then a:=m[1]; end if;

  -- Route / local road name, optionally with directional suffix.
  if a is null then
    m:=regexp_match(p_instruction,
      '(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:>:]][[:space:]]*/[[:space:]]*([A-Za-z][A-Za-z0-9 .''-]{0,70}'||suffix||'(?:[[:space:]]+'||bearing||')?)',
      'i');
    if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[1],m[2],p_state) then a:=m[3]; end if;
  end if;

  -- Route immediately followed by its local name, e.g. CR 47 Putney Ridge Rd.
  -- This is constrained to the already-selected route key so a later destination
  -- route/name pair cannot leak backward onto the current road.
  if a is null then
    m:=regexp_match(p_instruction,
      '(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:>:]][[:space:]]+([A-Za-z][A-Za-z0-9 .''-]{0,70}'||suffix||'(?:[[:space:]]+'||bearing||')?)',
      'i');
    if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[1],m[2],p_state) then a:=m[3]; end if;
  end if;

  a:=public.brinesearch_clean_road_alias(a);
  if a is null then return null; end if;
  if a ~* '^(to|at|from|and|also|for|travel|intersection|junction|stop|exit|turn|left|right)([[:space:]]|$)' then return null; end if;
  return a;
end
$$;

-- Expand the fractional-route target grammar to include direct forms such as
-- "Travel CR-41/3" and "Follow CR 67/1" while still excluding "travel X miles TO
-- the CR-7/3 intersection".
create or replace function public.brinesearch_target_fractional_route_v17320(p_instruction text)
returns text
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
declare m text[];
begin
  if nullif(btrim(coalesce(p_instruction,'')),'') is null then return null; end if;
  m:=regexp_match(p_instruction,
    '(?:turn|take|head|stay|keep|bear|veer|slight)[^.;]{0,100}(?:on|onto|along|into|to)[^.;]{0,40}?(CR|TR|SR|WV|PA)[[:space:]-]*([0-9]{1,4}/[0-9]{1,3})[[:>:]]',
    'i');
  if m is not null then return upper(m[1])||'-'||upper(m[2]); end if;
  m:=regexp_match(p_instruction,
    '(?:travel|continue|follow|go)[[:space:]]+(?:on[[:space:]]+|along[[:space:]]+)?(CR|TR|SR|WV|PA)[[:space:]-]*([0-9]{1,4}/[0-9]{1,3})[[:>:]]',
    'i');
  if m is not null then return upper(m[1])||'-'||upper(m[2]); end if;
  return null;
end
$$;

create or replace function public.brinesearch_apply_v17320_target_road_truth()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  target_rows integer:=0;
  fractional_rows integer:=0;
  alias_rows integer:=0;
  compound_rows integer:=0;
  neighbor_rows integer:=0;
begin
  -- Triplett is a two-action instruction and should never be represented as just
  -- one left or right maneuver in intelligence.
  update public.brinesearch_direction_step_intelligence
  set maneuver_class='compound',
      evidence=evidence||jsonb_build_object('maneuver_review_v17320','stay-right then turn-left source row; display splitter owns both actions')
  where legacy_id='ascent--triplett' and step_order=4
    and coalesce(evidence->>'instruction','') ~* '^Stay right.*turn left';
  get diagnostics compound_rows=row_count;

  -- Any row that starts with a stay/keep/bear/veer/slight action in one direction
  -- and later explicitly turns the other way is compound as well.
  update public.brinesearch_direction_step_intelligence
  set maneuver_class='compound',
      evidence=evidence||jsonb_build_object('maneuver_review_v17320','multiple directional maneuvers in one saved source row')
  where maneuver_class<>'compound'
    and (
      coalesce(evidence->>'instruction','') ~* '^(Stay|Keep|Bear|Veer|Slight)[[:space:]]+right.*turn[[:space:]]+left'
      or coalesce(evidence->>'instruction','') ~* '^(Stay|Keep|Bear|Veer|Slight)[[:space:]]+left.*turn[[:space:]]+right'
    );
  get diagnostics compound_rows=compound_rows+row_count;

  -- Correct origin-vs-target route parsing for source rows whose action explicitly
  -- names a different numbered road.
  with c as (
    select d.pad_id,d.step_order,d.road_key,p.state,
      public.brinesearch_explicit_target_route_v17320(d.evidence->>'instruction',p.state) target
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
  )
  update public.brinesearch_direction_step_intelligence d
  set road_key=c.target,primary_road=c.target,local_road_name=null,display_road=c.target,
      evidence=(d.evidence-'dual_name_source'-'dual_name_support')||jsonb_build_object(
        'road_identity_source','explicit saved driving action target v17.3.20',
        'road_identity_previous_key',d.road_key
      )
  from c
  where d.pad_id=c.pad_id and d.step_order=c.step_order
    and c.target is not null
    and not public.brinesearch_route_equivalent_v17320(d.road_key,split_part(c.target,'-',1),regexp_replace(c.target,'^[^-]+-',''),c.state);
  get diagnostics target_rows=row_count;

  -- Re-run the stricter actionable fractional route resolver after target-road
  -- correction. Mark rows with multiple route-changing actions as compound instead
  -- of forcing one fractional route.
  with c as (
    select d.pad_id,d.step_order,d.road_key,p.state,
      public.brinesearch_target_fractional_route_v17320(d.evidence->>'instruction') target,
      (select count(*) from regexp_matches(coalesce(d.evidence->>'instruction',''),'(turn|stay|keep|bear|veer|slight)[[:space:]]+(left|right)','gi')) action_count
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
  )
  update public.brinesearch_direction_step_intelligence d
  set road_key=c.target,primary_road=c.target,local_road_name=null,display_road=c.target,
      evidence=(d.evidence-'dual_name_source'-'dual_name_support')||jsonb_build_object('fractional_route_preserved_v17320',c.target)
  from c
  where d.pad_id=c.pad_id and d.step_order=c.step_order
    and c.target is not null and c.action_count<=1
    and (
      d.road_key is null
      or public.brinesearch_route_equivalent_v17320(d.road_key,split_part(c.target,'-',1),split_part(regexp_replace(c.target,'^[^-]+-',''),'/ ',1),c.state)
      or split_part(regexp_replace(d.road_key,'^[^-]+-',''),'/ ',1)=split_part(regexp_replace(c.target,'^[^-]+-',''),'/ ',1)
    );
  get diagnostics fractional_rows=row_count;

  -- Known compressed source rows with two different route-changing actions are
  -- compound; do not collapse them to one route simply because one target appears
  -- later in the string.
  update public.brinesearch_direction_step_intelligence
  set maneuver_class='compound',
      evidence=evidence||jsonb_build_object('maneuver_review_v17320','multiple route-changing actions in compressed source row')
  where (legacy_id,step_order) in (
    ('expand--mark-edison',1),('expand--shawn-harlan',3)
  );

  neighbor_rows:=public.brinesearch_rebuild_direction_road_neighbors_v17318();

  -- Reapply exact aliases after route-key corrections. Directional suffixes and
  -- Trail are supported here in addition to the earlier exact-pair grammar.
  with a as (
    select d.pad_id,d.step_order,
      coalesce(
        public.brinesearch_directional_alias_v17320(d.evidence->>'instruction',d.road_key,p.state),
        public.brinesearch_explicit_road_alias_v17320(d.evidence->>'instruction',d.road_key,p.state)
      ) alias
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where d.road_key is not null
  )
  update public.brinesearch_direction_step_intelligence d
  set local_road_name=a.alias,display_road=d.primary_road||' / '||a.alias,
      evidence=(d.evidence-'dual_name_support')||jsonb_build_object('dual_name_source','saved_direction_explicit_pair_v17320')
  from a
  where d.pad_id=a.pad_id and d.step_order=a.step_order and a.alias is not null;
  get diagnostics alias_rows=row_count;

  -- The phrase "travel straight across CR-41/1 to Gantzer Ridge Rd" is crossing
  -- context, not a CR-41 local-road alias or a leg on CR-41/1.
  update public.brinesearch_direction_step_intelligence
  set road_key=null,primary_road=null,local_road_name=null,display_road=null,
      evidence=(evidence-'dual_name_source'-'dual_name_support')||jsonb_build_object('navigation_context_only_v17320',true)
  where legacy_id='expand--george-gantzer' and step_order=3
    and coalesce(evidence->>'instruction','') ~* 'travel straight across CR-41/1 to Gantzer Ridge';

  neighbor_rows:=public.brinesearch_rebuild_direction_road_neighbors_v17318();

  return jsonb_build_object(
    'explicit_action_target_roads_corrected',target_rows,
    'additional_fractional_routes_preserved',fractional_rows,
    'exact_directional_trail_aliases_applied',alias_rows,
    'additional_compound_rows',compound_rows,
    'neighbor_rows_rebuilt',neighbor_rows
  );
end
$$;

revoke all on function public.brinesearch_explicit_target_route_v17320(text,text) from public,anon,authenticated;
revoke all on function public.brinesearch_directional_alias_v17320(text,text,text) from public,anon,authenticated;
revoke all on function public.brinesearch_apply_v17320_target_road_truth() from public,anon,authenticated;

-- Extend the refresh wrapper: base rebuild -> V17.3.20 core truth -> target/alias truth.
create or replace function public.brinesearch_refresh_all_direction_intelligence()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare base_result jsonb; truth_result jsonb; target_result jsonb;
begin
  base_result:=public.brinesearch_refresh_all_direction_intelligence_v17319_base();
  truth_result:=public.brinesearch_apply_v17320_direction_truth();
  target_result:=public.brinesearch_apply_v17320_target_road_truth();
  return base_result
    ||jsonb_build_object('v17320_road_turn_mileage_truth',truth_result)
    ||jsonb_build_object('v17320_target_road_alias_truth',target_result);
end
$$;
revoke all on function public.brinesearch_refresh_all_direction_intelligence() from public,anon,authenticated;

select public.brinesearch_apply_v17320_target_road_truth();
