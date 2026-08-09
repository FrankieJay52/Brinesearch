-- Final production V17.3.12 road-sequence and Clear Directions cleanup.

create or replace function public.brinesearch_canonicalize_route_sequence_v17312(
  p_sequence text,p_state text,p_county text,p_source text default null
)
returns text
language plpgsql
stable
set search_path='public'
as $function$
declare
  token text;
  n text;
  suffix text;
  resolved text;
  out_parts text[]:='{}'::text[];
  state_code text:=case lower(coalesce(p_state,''))
    when 'ohio' then 'OH' when 'oh' then 'OH'
    when 'west virginia' then 'WV' when 'wv' then 'WV'
    when 'pennsylvania' then 'PA' when 'pa' then 'PA'
    else null end;
begin
  if nullif(btrim(p_sequence),'') is null then return p_sequence; end if;
  foreach token in array regexp_split_to_array(p_sequence,'[[:space:]]*→[[:space:]]*') loop
    token:=btrim(token);
    if token='' then continue; end if;
    if upper(token)='OR' then out_parts:=array_append(out_parts,'OR'); continue; end if;
    if token ~* '^Route[[:space:]-]*[0-9]{1,4}[A-Z]?' then
      n:=(regexp_match(token,'^Route[[:space:]-]*([0-9]{1,4}[A-Z]?)','i'))[1];
      suffix:=regexp_replace(token,'^Route[[:space:]-]*[0-9]{1,4}[A-Z]?','','i');
      resolved:=public.brinesearch_resolve_generic_highway_v17312(p_state,p_county,n,concat_ws(' ',p_source,token));
      if resolved is not null then token:=resolved||suffix; end if;
    elsif state_code is not null and token ~* '^(?:State[[:space:]]+Route|SR)[[:space:]-]*[0-9]{1,4}[A-Z]?' then
      n:=(regexp_match(token,'^(?:State[[:space:]]+Route|SR)[[:space:]-]*([0-9]{1,4}[A-Z]?)','i'))[1];
      suffix:=regexp_replace(token,'^(?:State[[:space:]]+Route|SR)[[:space:]-]*[0-9]{1,4}[A-Z]?','','i');
      token:=state_code||'-'||upper(n)||suffix;
    end if;
    out_parts:=array_append(out_parts,token);
  end loop;
  return array_to_string(out_parts,' → ');
end;
$function$;

create or replace function public.brinesearch_format_saved_direction_section(p_text text)
returns text
language plpgsql
immutable
set search_path='public'
as $function$
declare
  v text := coalesce(p_text,'');
  result text;
begin
  v:=replace(replace(v,chr(13),chr(10)),chr(9),' ');
  v:=regexp_replace(v,'[-=]{5,}',chr(10),'g');
  v:=regexp_replace(v,'^Emergency[[:space:].]*Contact[[:space:]]*#[[:space:]]*[0-9-]+[[:space:].]*','','i');
  v:=regexp_replace(v,'^Zip[[:space:].]*Code[[:space:]]*[0-9-]+[[:space:].]*','','i');
  v:=regexp_replace(v,'(^|[^0-9])\.\.([0-9]+)([[:space:]]*(miles?|mi)\M)','\1 0.\2\3','gi');
  v:=regexp_replace(v,'(^|[^0-9])\.([0-9]+)([[:space:]]*(miles?|mi)\M)','\1 0.\2\3','gi');
  v:=regexp_replace(v,'\mTake[[:space:]]+the[[:space:]]+right[[:space:]]+([0-9]{1,4})\M','Take Route \1','gi');
  v:=regexp_replace(v,'\mFollow[[:space:]]+right[[:space:]]+([0-9]{1,4})\M','Follow Route \1','gi');
  v:=regexp_replace(v,'\mto[[:space:]]+the[[:space:]]+right[[:space:]]+([0-9]{1,4})[[:space:]]+JCT\M','to Route \1 JCT','gi');
  v:=regexp_replace(v,'\mStreet[[:space:]]+Clairsville\M','St. Clairsville','gi');
  v:=regexp_replace(v,'^(CONTROL ROOM ACCESS CODE:[^)]*\))[[:space:]]+(From\M)','\1'||chr(10)||'\2','i');
  v:=regexp_replace(v,'(^|[[:space:]])([1-9]|[12][0-9]|3[0-9])\.\)[[:space:]]*','\1'||chr(10)||'\2. ','g');
  v:=regexp_replace(v,'(^|[[:space:]])([1-9]|[12][0-9]|3[0-9])\.[[:space:]]*((Turn|Take|Head|Follow|Continue|Slight|Veer|Bear|Stay|Keep|Merge|Go|Travel|Proceed|From)\M)','\1'||chr(10)||'\2. \3','gi');
  v:=regexp_replace(v,'([A-Za-z0-9])\.([A-Za-z])','\1 \2','g');
  v:=regexp_replace(v,'([A-Za-z])\.[[:space:]]+([A-Za-z])','\1 \2','g');
  v:=regexp_replace(v,'\.[[:space:]]*([\(\[])',' \1','g');
  v:=regexp_replace(v,'((?:[0-9]+(?:[.][0-9]+)?|[0-9]+[[:space:]]*/[[:space:]]*[0-9]+)[[:space:]]*(?:miles?|mile|mi|feet|ft))[[:space:],;.)-]+((?:Turn[[:space:]]+(?:left|right)|Left[[:space:]]+turn|Right[[:space:]]+turn|Left[[:space:]]+onto|Right[[:space:]]+onto|Take|Follow|Continue|Slight|Veer|Bear|Stay|Keep|Merge|Head|Go|Travel|Proceed)\M)','\1'||chr(10)||'\2','gi');
  v:=regexp_replace(v,'((?:stop sign|intersection|junction|JCT))[[:space:],;.)-]+((?:Turn[[:space:]]+(?:left|right)|Left|Right|Take|Follow|Continue|Slight|Veer|Bear|Stay|Keep|Merge|Head|Go|Travel|Proceed)\M)','\1'||chr(10)||'\2','gi');
  v:=regexp_replace(v,'([A-Za-z0-9\)])([[:space:]]+)((Turn[[:space:]]+(?:left|right)|Take|Follow|Continue|Slight|Veer|Bear|Stay|Keep|Merge|Head|Go|Travel|Proceed|Left[[:space:]]+turn|Right[[:space:]]+turn|Left[[:space:]]+onto|Right[[:space:]]+onto)\M)','\1'||chr(10)||'\3','gi');
  v:=regexp_replace(v,'[;][[:space:]]*((Turn[[:space:]]+(?:left|right)|Take|Follow|Continue|Slight|Veer|Bear|Stay|Keep|Merge|Head|Go|Travel|Proceed|Left|Right)\M)',chr(10)||'\1','gi');
  v:=regexp_replace(v,'([A-Za-z0-9\)])([[:space:]]+)((Lease[[:space:]]+road|Access[[:space:]]+road|Pad|Site[[:space:]]+entrance|Well[[:space:]]+site[[:space:]]+entrance)\M)','\1'||chr(10)||'\3','gi');
  v:=regexp_replace(v,'\mC\.[[:space:]]*R\.[[:space:]]*([0-9]+)','CR-\1','gi');
  v:=regexp_replace(v,'\mT\.[[:space:]]*R\.[[:space:]]*([0-9]+)','TR-\1','gi');
  v:=regexp_replace(v,'[ ]{2,}',' ','g');
  v:=regexp_replace(v,chr(10)||'[ ]+',chr(10),'g');
  v:=regexp_replace(v,chr(10)||'{2,}',chr(10),'g');
  v:=btrim(v);
  with lines as (
    select ord,btrim(regexp_replace(line,'^[[:space:]]*[0-9]{1,2}[.)][[:space:]]*','','g')) line
    from regexp_split_to_table(v,chr(10)||'+') with ordinality t(line,ord)
  ), usable as (
    select row_number() over(order by ord) n,regexp_replace(line,'[[:space:]]+',' ','g') line
    from lines where nullif(btrim(line),'') is not null
  )
  select string_agg(n::text||'. '||line,chr(10) order by n) into result from usable;
  return nullif(btrim(result),'');
end;
$function$;

update public.pads p
set structured_road_sequence=public.brinesearch_canonicalize_route_sequence_v17312(
      p.structured_road_sequence,p.state,p.county,p.written_directions),updated_at=now()
where nullif(btrim(p.structured_road_sequence),'') is not null
  and public.brinesearch_canonicalize_route_sequence_v17312(
      p.structured_road_sequence,p.state,p.county,p.written_directions) is distinct from p.structured_road_sequence;

update public.pads p
set directions_clear=concat_ws(chr(10)||chr(10),
      case when nullif(btrim(p.structured_road_sequence),'') is not null
        then 'Road sequence reference:'||chr(10)||btrim(p.structured_road_sequence) end,
      case when public.brinesearch_format_saved_direction_section(public.brinesearch_primary_saved_direction_section(p.written_directions)) is not null
        then 'Step-by-step directions:'||chr(10)||public.brinesearch_format_saved_direction_section(public.brinesearch_primary_saved_direction_section(p.written_directions)) end),
    directions_clear_method='saved_route_rebuilt_v17312',directions_clear_updated_at=now()
where p.directions_clear_method in ('saved_route_structured_all_operators_20260808','saved_route_rebuilt_v17312')
  and nullif(btrim(p.written_directions),'') is not null;

-- High-confidence source/official road-family corrections from the production audit.
update public.pads set
 structured_road_sequence='I-70 → OH-513 → OH-265 → OH-147 → Tuckahoe Rd → Winstead Rd → Lease Road',
 directions_clear='Road sequence reference:'||chr(10)||'I-70 → OH-513 S → OH-265 → OH-147 → Tuckahoe Rd → Winstead Rd → Lease Road'||chr(10)||chr(10)||'Step-by-step directions:'||chr(10)||
 '1. From I-70, take OH-513 south to OH-265.'||chr(10)||'2. Turn left onto OH-265 and continue to OH-147.'||chr(10)||'3. Follow OH-147 for 2.2 miles.'||chr(10)||'4. Turn right onto Tuckahoe Rd and continue 0.8 mile.'||chr(10)||'5. Turn left onto Winstead Rd and continue 0.4 mile.'||chr(10)||'6. Lease road is on the left. No portajohn.',
 directions_clear_method='v17312_manual_source_audit',directions_clear_updated_at=now(),updated_at=now()
where legacy_id='antero--capstone';

update public.pads set
 structured_road_sequence='I-70 → OH-513 → OH-265 → OH-147 → Tuckahoe Rd → Winstead Rd → Lease Road',
 directions_clear='Road sequence reference:'||chr(10)||'I-70 → OH-513 S → OH-265 → OH-147 → Tuckahoe Rd → Winstead Rd → Lease Road'||chr(10)||chr(10)||'Step-by-step directions:'||chr(10)||
 '1. From I-70, take OH-513 south to OH-265.'||chr(10)||'2. Turn left onto OH-265 and continue to OH-147.'||chr(10)||'3. Follow OH-147 for 2.2 miles.'||chr(10)||'4. Turn right onto Tuckahoe Rd and continue 0.8 mile.'||chr(10)||'5. Turn left onto Winstead Rd and continue 1 mile.'||chr(10)||'6. Lease road is on the left.',
 directions_clear_method='v17312_manual_source_audit',directions_clear_updated_at=now(),updated_at=now()
where legacy_id='antero--alpha';

update public.pads set
 structured_road_sequence='US-22 → OH-519 / Stumptown Rd → US-250 → Pad',
 directions_clear='Road sequence reference:'||chr(10)||'US-22 E → OH-519 / Stumptown Rd E → US-250 E → Packer pad'||chr(10)||chr(10)||'Step-by-step directions:'||chr(10)||
 '1. Take US-22 east.'||chr(10)||'2. Take OH-519 / Stumptown Rd east toward New Athens.'||chr(10)||'3. Take US-250 east toward Harrisville.'||chr(10)||'4. The Packer pad is on the left before County Road 71.',
 directions_clear_method='v17312_official_route_family_audit',directions_clear_updated_at=now(),updated_at=now()
where legacy_id='ascent--packer';

update public.pads set
 structured_road_sequence='I-70 → OH-9 → OH-147 → Shepherd Hill Rd → Pad',
 directions_clear='Road sequence reference:'||chr(10)||'I-70 → OH-9 S → OH-147 E → Shepherd Hill Rd → Pad'||chr(10)||chr(10)||'Step-by-step directions:'||chr(10)||
 '1. From I-70, take the OH-9 exit toward St. Clairsville.'||chr(10)||'2. Follow OH-9 south to the OH-147 junction in Centerville.'||chr(10)||'3. Follow OH-147 east out of Centerville.'||chr(10)||'4. Turn right onto Shepherd Hill Rd.'||chr(10)||'5. The pad is on the left.',
 directions_clear_method='v17312_manual_source_audit_landmark_free',directions_clear_updated_at=now(),updated_at=now()
where legacy_id='eqt--dominator';

update public.pads set
 structured_road_sequence='OH-147 → Shepherd Hill Rd → Back Rd → Pad',
 directions_clear='Road sequence reference:'||chr(10)||'OH-147 E → Shepherd Hill Rd → Back Rd → Pad'||chr(10)||chr(10)||'Step-by-step directions:'||chr(10)||
 '1. From Centerville, follow OH-147 east approximately 2 miles to Shepherd Hill Rd.'||chr(10)||'2. Note: CONTROL ROOM ACCESS CODE: 2429 (followed by checkmark button).'||chr(10)||'3. Turn right onto Shepherd Hill Rd.'||chr(10)||'4. Continue approximately 1 mile on Back Rd.'||chr(10)||'5. The pad is on the right.',
 directions_clear_method='v17312_manual_source_audit',directions_clear_updated_at=now(),updated_at=now()
where legacy_id='gulfport--fankhauser';

select public.brinesearch_refresh_all_direction_intelligence();

with resolved as (
  select d.pad_id,d.step_order,
    public.brinesearch_resolve_generic_highway_v17312(p.state,p.county,regexp_replace(d.road_key,'^ROUTE-',''),d.evidence->>'instruction') canonical
  from public.brinesearch_direction_step_intelligence d join public.pads p on p.id=d.pad_id
  where d.road_key like 'ROUTE-%'
)
update public.brinesearch_direction_step_intelligence d
set road_key=r.canonical,primary_road=r.canonical,
    display_road=case when d.local_road_name is not null then r.canonical||' / '||d.local_road_name else r.canonical end,
    evidence=d.evidence||jsonb_build_object('generic_route_resolution','v17.3.12 evidence-backed highway family')
from resolved r
where d.pad_id=r.pad_id and d.step_order=r.step_order and r.canonical is not null;

with w as (
  select pad_id,step_order,lag(road_key) over(partition by pad_id order by step_order) prev_road_key,
         lead(road_key) over(partition by pad_id order by step_order) next_road_key
  from public.brinesearch_direction_step_intelligence
)
update public.brinesearch_direction_step_intelligence d
set prev_road_key=w.prev_road_key,next_road_key=w.next_road_key,
    same_road_continuation=coalesce(d.road_key is not null and d.road_key=w.prev_road_key and d.maneuver_class in('turn_left','turn_right','stay_left','stay_right'),false),
    refreshed_at=now()
from w where d.pad_id=w.pad_id and d.step_order=w.step_order;
