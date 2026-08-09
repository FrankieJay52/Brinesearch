-- BrineSearch V17.3.20
-- Deep road / turn / mileage truth pass.
--
-- Goals:
--  * preserve fractional CR/TR/SR route identifiers when the saved instruction is
--    actually driving that route (not merely mentioning an upcoming intersection),
--  * keep explicit saved local-name + numbered-route pairs together,
--  * classify slight/fragmented turns correctly and stop pretending compound
--    left+right source rows are one maneuver,
--  * withdraw saved mileage from a *target* road when the source sentence says the
--    mileage was traveled BEFORE turning onto that road; the UI source parser owns
--    that split,
--  * remove weak single-source shared aliases unless the current saved step or the
--    official ODOT catalog independently proves the name,
--  * stop flagging pad-specific road-to-access mileage merely because another pad
--    enters the same road at a different point.
--
-- This migration does NOT overwrite pads.directions_clear, written_directions,
-- structured_road_sequence, GPS, wells, APIs, or property data.

create table if not exists private_verification.direction_step_intelligence_backup_v17320
as select * from public.brinesearch_direction_step_intelligence;

create or replace function public.brinesearch_route_equivalent_v17320(
  p_existing text,
  p_family text,
  p_body text,
  p_state text
)
returns boolean
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
declare
  ef text;
  eb text;
  cf text;
  cb text;
  sc text;
begin
  if nullif(btrim(coalesce(p_existing,'')),'') is null
     or nullif(btrim(coalesce(p_family,'')),'') is null
     or nullif(btrim(coalesce(p_body,'')),'') is null then
    return false;
  end if;
  ef:=upper(split_part(btrim(p_existing),'-',1));
  eb:=upper(regexp_replace(btrim(p_existing),'^[^-]+-','',''));
  cf:=upper(btrim(p_family));
  cb:=upper(regexp_replace(btrim(p_body),'[[:space:]]','','g'));
  if eb<>cb then return false; end if;
  if ef=cf then return true; end if;
  sc:=case lower(btrim(coalesce(p_state,'')))
    when 'ohio' then 'OH' when 'oh' then 'OH'
    when 'west virginia' then 'WV' when 'wv' then 'WV'
    when 'pennsylvania' then 'PA' when 'pa' then 'PA'
    else '' end;
  if cf='SR' and ef in ('SR',sc) then return true; end if;
  if ef='SR' and cf in ('SR',sc) then return true; end if;
  return false;
end
$$;

create or replace function public.brinesearch_target_fractional_route_v17320(p_instruction text)
returns text
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
declare m text[];
begin
  if nullif(btrim(coalesce(p_instruction,'')),'') is null then return null; end if;

  -- A maneuver explicitly targets the fractional route. Wildcard room is needed
  -- for forms such as "Turn left onto Stackpole Run / CR-13/3".
  m:=regexp_match(p_instruction,
    '(?:turn|take|head|continue|follow|stay|keep|bear|veer|slight|proceed|go|right|left)[^.;]{0,80}(?:on|onto|along|into)[^.;]{0,50}?(CR|TR|SR|WV|PA)[[:space:]-]*([0-9]{1,4}/[0-9]{1,3})',
    'i');
  if m is not null then return upper(m[1])||'-'||upper(m[2]); end if;

  -- Travel/continue/follow *on* a fractional route. Deliberately does not match
  -- "travel X miles TO the CR-7/3 intersection".
  m:=regexp_match(p_instruction,
    '(?:travel|continue|follow|go)[^.;]{0,40}(?:on|along)[[:space:]]*(CR|TR|SR|WV|PA)[[:space:]-]*([0-9]{1,4}/[0-9]{1,3})',
    'i');
  if m is not null then return upper(m[1])||'-'||upper(m[2]); end if;
  return null;
end
$$;

create or replace function public.brinesearch_explicit_road_alias_v17320(
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
begin
  if nullif(btrim(coalesce(p_instruction,'')),'') is null
     or nullif(btrim(coalesce(p_road_key,'')),'') is null then return null; end if;

  -- Local name / numbered route.
  m:=regexp_match(p_instruction,
    '([A-Za-z][A-Za-z0-9 .''-]{0,70}(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))[[:space:]]*/[[:space:]]*(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)',
    'i');
  if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[2],m[3],p_state) then a:=m[1]; end if;

  -- Numbered route / local name.
  if a is null then
    m:=regexp_match(p_instruction,
      '(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:space:]]*/[[:space:]]*([A-Za-z][A-Za-z0-9 .''-]{0,70}(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))',
      'i');
    if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[1],m[2],p_state) then a:=m[3]; end if;
  end if;

  -- Local name (numbered route).
  if a is null then
    m:=regexp_match(p_instruction,
      '([A-Za-z][A-Za-z0-9 .''-]{0,70}(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))[[:space:]]*\([[:space:]]*(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:space:]]*\)',
      'i');
    if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[2],m[3],p_state) then a:=m[1]; end if;
  end if;

  -- Numbered route (local name) or numbered route, (local name).
  if a is null then
    m:=regexp_match(p_instruction,
      '(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:space:],;]*\([[:space:]]*([A-Za-z][A-Za-z0-9 .''-]{0,70}(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))[[:space:]]*\)',
      'i');
    if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[1],m[2],p_state) then a:=m[3]; end if;
  end if;

  -- Numbered route, local name (without parentheses).
  if a is null then
    m:=regexp_match(p_instruction,
      '(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*([0-9]{1,4}(?:/[0-9]{1,3})?[A-Z]?)[[:space:]]*,[[:space:]]*([A-Za-z][A-Za-z0-9 .''-]{0,70}(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))',
      'i');
    if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[1],m[2],p_state) then a:=m[3]; end if;
  end if;

  -- Fractional route immediately followed by a road name, e.g.
  -- "CR 67/1 McCords Hill Road". Requiring a fraction avoids treating ordinary
  -- narrative after a base route as its alias.
  if a is null then
    m:=regexp_match(p_instruction,
      '(CR|TR|SR|WV|PA)[[:space:]-]*([0-9]{1,4}/[0-9]{1,3})[[:space:]]+([A-Za-z][A-Za-z0-9 .''-]{0,70}(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Dr|Drive|Pike|Hwy|Highway|Run|Ridge|Fork|Hollow|Creek|Crossing|Way))',
      'i');
    if m is not null and public.brinesearch_route_equivalent_v17320(p_road_key,m[1],m[2],p_state) then a:=m[3]; end if;
  end if;

  a:=public.brinesearch_clean_road_alias(a);
  if a is null then return null; end if;
  if a ~* '^(to|at|from|and|also|for|travel|intersection|junction|stop|exit|turn|left|right|north|south|east|west)([[:space:]]|$)' then return null; end if;
  if a ~* '^(I|US|OH|WV|PA|SR|CR|TR)[[:space:]-]*[0-9]' then return null; end if;
  return a;
end
$$;

create or replace function public.brinesearch_distance_precedes_next_maneuver_v17320(p_instruction text)
returns boolean
language sql
immutable
set search_path=pg_catalog,public
as $$
  select coalesce(p_instruction,'') ~*
    '^(follow|continue|travel|proceed|go).{0,240}[0-9]+([.][0-9]+)?([[:space:]]*[-–][[:space:]]*[0-9]+([.][0-9]+)?)?[[:space:]]*(miles?|mile|mi|feet|foot|ft).{0,240}(turn|stay|keep|veer|bear|slight)[[:space:]]+(left|right|straight)'
$$;

create or replace function public.brinesearch_apply_v17320_direction_truth()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  compound_rows integer:=0;
  slight_rows integer:=0;
  fragment_turn_rows integer:=0;
  fractional_rows integer:=0;
  exact_alias_rows integer:=0;
  weak_alias_rows integer:=0;
  official_alias_rows integer:=0;
  deferred_distance_rows integer:=0;
  access_distance_reviews integer:=0;
  neighbor_rows integer:=0;
begin
  -- A source row containing both left and right is not one truthful maneuver.
  update public.brinesearch_direction_step_intelligence d
  set maneuver_class='compound',
      evidence=d.evidence||jsonb_build_object('maneuver_review_v17320','compound left/right source row; display splitter owns individual turns')
  where coalesce(d.evidence->>'instruction','') ~* 'turn[[:space:]]+left'
    and coalesce(d.evidence->>'instruction','') ~* 'turn[[:space:]]+right';
  get diagnostics compound_rows=row_count;

  -- Imported fragments sometimes begin "right onto" / "left onto" after a split.
  update public.brinesearch_direction_step_intelligence d
  set maneuver_class=case when lower(btrim(d.evidence->>'instruction')) ~ '^right[[:space:]]+(on|onto)' then 'turn_right' else 'turn_left' end,
      evidence=d.evidence||jsonb_build_object('maneuver_review_v17320','leading turn fragment normalized')
  where d.maneuver_class<>'compound'
    and (lower(btrim(coalesce(d.evidence->>'instruction',''))) ~ '^right[[:space:]]+(on|onto)'
      or lower(btrim(coalesce(d.evidence->>'instruction',''))) ~ '^left[[:space:]]+(on|onto)');
  get diagnostics fragment_turn_rows=row_count;

  -- "Slight" was missing from the database maneuver classifier.
  update public.brinesearch_direction_step_intelligence d
  set maneuver_class=case
        when lower(btrim(d.evidence->>'instruction')) ~ '^(take[[:space:]]+(a[[:space:]]+)?)?slight(ly)?[[:space:]]+right' then 'stay_right'
        when lower(btrim(d.evidence->>'instruction')) ~ '^bear[[:space:]]+slightly[[:space:]]+right' then 'stay_right'
        else 'stay_left' end,
      evidence=d.evidence||jsonb_build_object('maneuver_review_v17320','slight/bear turn normalized')
  where d.maneuver_class<>'compound'
    and (
      lower(btrim(coalesce(d.evidence->>'instruction',''))) ~ '^(take[[:space:]]+(a[[:space:]]+)?)?slight(ly)?[[:space:]]+(left|right)'
      or lower(btrim(coalesce(d.evidence->>'instruction',''))) ~ '^bear[[:space:]]+slightly[[:space:]]+(left|right)'
    );
  get diagnostics slight_rows=row_count;

  -- Preserve the full fractional route only when that fractional route is the
  -- road being driven. Existing base route must agree with the fractional base.
  with c as (
    select d.pad_id,d.step_order,d.road_key,p.state,
      public.brinesearch_target_fractional_route_v17320(d.evidence->>'instruction') target
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
  ), eligible as (
    select *,split_part(target,'-',1) tf,
      regexp_replace(target,'^[^-]+-','','') tb
    from c where target is not null
  )
  update public.brinesearch_direction_step_intelligence d
  set road_key=e.target,
      primary_road=e.target,
      display_road=case when d.local_road_name is not null then e.target||' / '||d.local_road_name else e.target end,
      evidence=d.evidence||jsonb_build_object('fractional_route_preserved_v17320',e.target)
  from eligible e
  where d.pad_id=e.pad_id and d.step_order=e.step_order
    and (
      d.road_key is null
      or public.brinesearch_route_equivalent_v17320(d.road_key,e.tf,split_part(e.tb,'/',1),e.state)
    );
  get diagnostics fractional_rows=row_count;

  -- Three approach rows were demonstrably mis-keyed to I-470 even though the
  -- saved sentence says the 0.45/0.46 mile road leg is CR-91/1.
  update public.brinesearch_direction_step_intelligence d
  set road_key='CR-91/1',primary_road='CR-91/1',display_road='CR-91/1',
      evidence=d.evidence||jsonb_build_object('fractional_route_preserved_v17320','CR-91/1','road_identity_reason_v17320','saved step explicitly travels/turns onto CR-91/1 after I-470 Exit 2')
  where (d.legacy_id,d.step_order) in (
      ('expand--betty-schafer',1),('expand--craig-strope',1),('expand--serafin-ortiz',2)
    )
    and coalesce(d.evidence->>'instruction','') ~* 'CR[[:space:]-]*91/1';

  neighbor_rows:=public.brinesearch_rebuild_direction_road_neighbors_v17318();

  -- Exact local-name / route pairs written in this same saved step outrank all
  -- shared aliases. Works for I/US/state/county/township and fractional routes.
  with a as (
    select d.pad_id,d.step_order,
      public.brinesearch_explicit_road_alias_v17320(d.evidence->>'instruction',d.road_key,p.state) alias
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where d.road_key is not null
  )
  update public.brinesearch_direction_step_intelligence d
  set local_road_name=a.alias,
      display_road=d.primary_road||' / '||a.alias,
      evidence=(d.evidence-'dual_name_support')||jsonb_build_object('dual_name_source','saved_direction_explicit_pair_v17320')
  from a
  where d.pad_id=a.pad_id and d.step_order=a.step_order and a.alias is not null;
  get diagnostics exact_alias_rows=row_count;

  -- A single other pad is not enough to add a local name to a route-only card.
  -- Clearing first lets the existing unique ODOT-name pass independently restore
  -- names such as CR-23 / High St and CR-402 / Rochester Rd.
  update public.brinesearch_direction_step_intelligence d
  set local_road_name=null,
      display_road=d.primary_road,
      evidence=(d.evidence-'dual_name_source'-'dual_name_support')||jsonb_build_object('weak_shared_alias_removed_v17320',true)
  where d.evidence->>'dual_name_source'='shared_saved_directions'
    and coalesce((d.evidence->>'dual_name_support')::integer,0)<2;
  get diagnostics weak_alias_rows=row_count;

  official_alias_rows:=public.brinesearch_apply_official_road_aliases();

  -- The distance in these sentences describes the road traveled BEFORE the next
  -- turn. Remove it from the target-road intelligence row so it cannot be shown on
  -- the wrong road. The V17.3.20 UI source splitter places it on the prior leg.
  update public.brinesearch_direction_step_intelligence d
  set evidence=d.evidence||jsonb_build_object(
        'deferred_saved_distance_v17320',jsonb_build_object(
          'miles',d.distance_miles,'label',d.distance_label,'source',d.distance_source,
          'reason','saved distance occurs before the next maneuver and belongs to the road being traveled before that maneuver'
        )
      ),
      distance_miles=null,distance_label=null,distance_source=null,distance_confidence=null,
      suspicious_distance=false,shared_support_count=0
  where d.distance_source='saved_direction'
    and d.distance_miles is not null
    and public.brinesearch_distance_precedes_next_maneuver_v17320(d.evidence->>'instruction');
  get diagnostics deferred_distance_rows=row_count;

  -- A road-to-access/entrance distance is inherently pad specific. Do not compare
  -- different pad entrances on the same road as if they were the same segment.
  with n as (
    select d.pad_id,d.step_order,nx.evidence->>'instruction' next_instruction
    from public.brinesearch_direction_step_intelligence d
    left join public.brinesearch_direction_step_intelligence nx
      on nx.pad_id=d.pad_id and nx.step_order=d.step_order+1
    where d.suspicious_distance and d.distance_source='saved_direction'
  )
  update public.brinesearch_direction_step_intelligence d
  set suspicious_distance=false,
      evidence=(d.evidence-'shared_road_median'-'shared_road_support')||jsonb_build_object(
        'distance_review_v17320','pad-specific distance terminates at this pad access/entrance; shared-road median is not comparable'
      )
  from n
  where d.pad_id=n.pad_id and d.step_order=n.step_order
    and (
      coalesce(d.evidence->>'instruction','') ~* '(access road|lease road|pad entrance|well access|entrance)'
      or coalesce(n.next_instruction,'') ~* '^[[:space:]]*(access road|lease road|pad|well|entrance|future access)'
    );
  get diagnostics access_distance_reviews=row_count;

  -- Rebuild neighbors once more after every route-key correction, and refresh
  -- same-road continuation using the corrected maneuver class.
  neighbor_rows:=public.brinesearch_rebuild_direction_road_neighbors_v17318();

  return jsonb_build_object(
    'compound_turn_rows',compound_rows,
    'leading_turn_fragments',fragment_turn_rows,
    'slight_turn_rows',slight_rows,
    'fractional_routes_preserved',fractional_rows,
    'exact_saved_double_names',exact_alias_rows,
    'weak_shared_aliases_removed',weak_alias_rows,
    'official_aliases_reapplied',official_alias_rows,
    'saved_distances_deferred_to_prior_leg',deferred_distance_rows,
    'pad_access_distance_false_flags_cleared',access_distance_reviews,
    'neighbor_rows_rebuilt',neighbor_rows
  );
end
$$;

revoke all on function public.brinesearch_route_equivalent_v17320(text,text,text,text) from public,anon,authenticated;
revoke all on function public.brinesearch_target_fractional_route_v17320(text) from public,anon,authenticated;
revoke all on function public.brinesearch_explicit_road_alias_v17320(text,text,text) from public,anon,authenticated;
revoke all on function public.brinesearch_distance_precedes_next_maneuver_v17320(text) from public,anon,authenticated;
revoke all on function public.brinesearch_apply_v17320_direction_truth() from public,anon,authenticated;

-- Preserve the V17.3.19 refresh chain, then make the V17.3.20 truth pass the final
-- post-processing step for every future rebuild.
create or replace function public.brinesearch_refresh_all_direction_intelligence_v17319_base()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  result jsonb;
  exact_rows integer;
  neighbor_rows integer;
  official_rows integer;
  measured_rows integer:=0;
  r record;
begin
  result:=public.brinesearch_refresh_all_direction_intelligence_v17318_base();
  exact_rows:=public.brinesearch_apply_exact_saved_step_road_identities();
  neighbor_rows:=public.brinesearch_rebuild_direction_road_neighbors_v17318();
  official_rows:=public.brinesearch_apply_official_road_aliases();
  for r in
    select distinct d.pad_id
    from public.brinesearch_direction_step_intelligence d
    join public.pads p on p.id=d.pad_id
    where p.state='Ohio' and d.road_key is not null
      and (d.distance_miles is null or d.distance_miles<=0)
  loop
    begin measured_rows:=measured_rows+public.brinesearch_measure_safe_oh_road_legs(r.pad_id);
    exception when others then null;
    end;
  end loop;
  return result||jsonb_build_object(
    'v17318_exact_saved_step_road_identities',exact_rows,
    'v17318_neighbor_rows_rebuilt',neighbor_rows,
    'v17318_official_alias_rows_after_exact_identity',official_rows,
    'v17318_safe_oh_road_leg_measurements',measured_rows
  );
end
$$;
revoke all on function public.brinesearch_refresh_all_direction_intelligence_v17319_base() from public,anon,authenticated;

create or replace function public.brinesearch_refresh_all_direction_intelligence()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare base_result jsonb; truth_result jsonb;
begin
  base_result:=public.brinesearch_refresh_all_direction_intelligence_v17319_base();
  truth_result:=public.brinesearch_apply_v17320_direction_truth();
  return base_result||jsonb_build_object('v17320_road_turn_mileage_truth',truth_result);
end
$$;
revoke all on function public.brinesearch_refresh_all_direction_intelligence() from public,anon,authenticated;

-- Apply only the lightweight post-processing pass to the current live snapshot.
-- Do NOT perform a full-directory refresh here.
select public.brinesearch_apply_v17320_direction_truth();
