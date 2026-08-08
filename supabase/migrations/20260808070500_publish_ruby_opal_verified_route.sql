-- Publish Ruby-Opal only after the owner confirmed the entrance is on the
-- left and the public-road sequence was checked against official ODOT road
-- identities/intersections and route geometry. ABLE and DURR remain blocked.

do $ruby_opal_precondition$
begin
  if (select count(*) from public.pads where legacy_id='ascent--ruby-opal')<>1 then
    raise exception 'Ruby-Opal pad record is missing or duplicated';
  end if;
  if not exists(
    select 1 from public.pads
    where legacy_id='ascent--able'
      and nullif(btrim(directions_clear),'') is null
  ) then
    raise exception 'ABLE must remain unpublished until field directions are verified';
  end if;
  if not exists(
    select 1 from public.pads
    where legacy_id='ascent--durr'
      and nullif(btrim(directions_clear),'') is null
  ) then
    raise exception 'DURR must remain unpublished until its Sidwell conflict is resolved';
  end if;
end
$ruby_opal_precondition$;

update public.pads
set
  structured_road_sequence='I-77 S → Exit 28 / OH-821 / Belle Valley → OH-821 S → OH-215 E / Wolf Run Rd → OH-285 / Sarahsville Rd → OH-146 → OH-146 / Zep Rd → Roberta Cleary Ln / TR-226 → Ruby-Opal entrance',
  written_directions='From I-77 South, take Exit 28 for OH-821 / Belle Valley. Follow OH-821 South approximately 0.5 mile. Turn left onto OH-215 East / Wolf Run Road and continue approximately 4.6 miles. Continue onto OH-285 / Sarahsville Road for approximately 0.3 mile. Continue onto OH-146 for approximately 1.0 mile. Turn right to stay on OH-146 / Zep Road and continue approximately 3.7 miles. Turn left onto Roberta Cleary Lane / TR-226 and continue approximately 0.6 mile. The Ruby-Opal pad entrance is on the left.',
  directions_clear='Road sequence reference:
I-77 S → Exit 28 / OH-821 / Belle Valley → OH-821 S (approximately 0.5 mile) → OH-215 E / Wolf Run Rd (approximately 4.6 miles) → OH-285 / Sarahsville Rd (approximately 0.3 mile) → OH-146 (approximately 1.0 mile) → right to stay on OH-146 / Zep Rd (approximately 3.7 miles) → Roberta Cleary Ln / TR-226 (approximately 0.6 mile) → Ruby-Opal entrance

Step-by-step directions:
1. Take I-77 south to Exit 28 for OH-821 / Belle Valley.
2. Follow OH-821 south approximately 0.5 mile.
3. Turn left onto OH-215 east / Wolf Run Rd. Continue approximately 4.6 miles.
4. Continue onto OH-285 / Sarahsville Rd. Continue approximately 0.3 mile.
5. Continue onto OH-146. Continue approximately 1.0 mile.
6. Turn right to stay on OH-146 / Zep Rd. Continue approximately 3.7 miles.
7. Turn left onto Roberta Cleary Ln / TR-226. Continue approximately 0.6 mile.
8. The Ruby-Opal pad entrance is on the left.',
  directions_clear_method='Ruby-Opal owner-confirmed field route: left-side entrance confirmed; Exit 28, OH-821, OH-215, OH-285, OH-146, and TR-226 identities/intersections cross-checked against the official ODOT Road Inventory; public-road mileage rounded from route geometry; no private-road fact invented.',
  directions_clear_updated_at=now(),
  road_sequence_status='owner_and_official_route_verified',
  road_sequence_reviewed_date=current_date,
  road_sequence_final_cleanup_date=current_date,
  number_of_road_steps=8,
  research_date=current_date,
  research_method='Owner field confirmation plus official ODOT Road Inventory and route-geometry cross-check',
  research_sources=coalesce(research_sources,'[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'type','official_road_inventory',
      'agency','Ohio Department of Transportation',
      'service','Road Inventory',
      'checked',current_date,
      'route_ids',jsonb_build_array('OH-821','OH-215','OH-285','OH-146','TR-226')
    ),
    jsonb_build_object(
      'type','owner_field_confirmation',
      'checked',current_date,
      'confirmed_fact','Ruby-Opal pad entrance is on the left after turning onto Roberta Cleary Lane / TR-226'
    )
  ),
  last_updated_by='BrineSearch Ruby-Opal owner route confirmation',
  last_updated_date=now(),
  extra_data=extra_data || jsonb_build_object(
    'ruby_opal_field_route_confirmation_20260808',jsonb_build_object(
      'status','complete_owner_and_official_route_confirmation',
      'confirmed_at',now(),
      'confirmed_by_owner',true,
      'confirmed_facts',jsonb_build_array(
        'Approach on I-77 south',
        'Use Exit 28 for OH-821 / Belle Valley',
        'Follow OH-821 south to OH-215 east',
        'Continue from OH-215 onto OH-285 and OH-146',
        'Turn right to stay on OH-146 / Zep Road',
        'Turn left onto Roberta Cleary Lane / TR-226',
        'Ruby-Opal pad entrance is on the left'
      ),
      'official_road_validation',jsonb_build_object(
        'agency','Ohio Department of Transportation',
        'dataset','Road Inventory',
        'checked_at',now(),
        'route_identities',jsonb_build_array('OH-821','OH-215','OH-285','OH-146','TR-226'),
        'tr_226_official_name','ROBERTA CLEARY LN',
        'tr_226_intersects','OH-146'
      ),
      'route_geometry_validation',jsonb_build_object(
        'checked_at',now(),
        'rounded_public_distances_miles',jsonb_build_object(
          'OH-821',0.5,
          'OH-215',4.6,
          'OH-285',0.3,
          'OH-146_before_right_turn',1.0,
          'OH-146_Zep_Road',3.7,
          'TR-226_to_entrance',0.6
        )
      ),
      'publication_policy','Published only after the owner confirmed the entrance side and official road identities/intersections were checked.'
    ),
    'ascent_direction_completion_20260808',jsonb_build_object(
      'status','published_verified_route',
      'reviewed_at',now(),
      'owner_confirmed_entrance_side','left',
      'public_road_source','Official ODOT Road Inventory',
      'no_guess_policy','No unnamed local or private road was invented.'
    ),
    'turn_by_turn_route',jsonb_build_object(
      'version','ruby_opal_20260808',
      'step_count',8,
      'entrance_side','left',
      'route_sequence',jsonb_build_array(
        'I-77 S',
        'Exit 28 / OH-821 / Belle Valley',
        'OH-821 S',
        'OH-215 E / Wolf Run Rd',
        'OH-285 / Sarahsville Rd',
        'OH-146',
        'OH-146 / Zep Rd',
        'Roberta Cleary Ln / TR-226',
        'Ruby-Opal entrance'
      )
    )
  )
where legacy_id='ascent--ruby-opal';

do $ruby_opal_assertions$
declare
  ruby public.pads%rowtype;
  ascent_total integer;
  ascent_clear integer;
begin
  select * into ruby
  from public.pads
  where legacy_id='ascent--ruby-opal';

  if ruby.directions_clear is null
     or ruby.directions_clear not like '%The Ruby-Opal pad entrance is on the left.%'
     or ruby.number_of_road_steps<>8
     or ruby.road_sequence_status<>'owner_and_official_route_verified' then
    raise exception 'Ruby-Opal publication did not pass its final route assertions';
  end if;

  if exists(
    select 1 from public.pads
    where legacy_id in ('ascent--able','ascent--durr')
      and nullif(btrim(directions_clear),'') is not null
  ) then
    raise exception 'A blocked Ascent pad received public Clear Directions';
  end if;

  select count(*),count(*) filter(where nullif(btrim(directions_clear),'') is not null)
    into ascent_total,ascent_clear
  from public.pads
  where lower(company)='ascent';

  if ascent_total<>252 or ascent_clear<>250 then
    raise exception 'Unexpected Ascent publication totals: % total / % clear',ascent_total,ascent_clear;
  end if;

  if exists(
    select 1
    from public.pads
    where lower(company)='ascent'
      and nullif(btrim(directions_clear),'') is not null
      and directions_clear not like '%Step-by-step directions:%'
  ) then
    raise exception 'An Ascent Clear Directions record is not in the standard step format';
  end if;

  if exists(
    select 1
    from public.pads
    where lower(company)='ascent'
      and directions_clear ~* E'(^|\\n)[0-9]+[.]\\s*(continue|go|follow|proceed)\\s+(approximately\\s+|about\\s+)?[0-9./½¼¾]+\\s*(miles?|mi|feet|ft)[.]?\\s*($|\\n)'
  ) then
    raise exception 'A separate distance-only direction card remains';
  end if;

  if exists(
    select 1
    from public.pads
    where lower(company)='ascent'
      and directions_clear ~* E'(^|\\n)[0-9]+[.]\\s*(gate code|warning|landmark|note|access warning|truck restriction)'
  ) then
    raise exception 'A note-only direction card remains';
  end if;
end
$ruby_opal_assertions$;
