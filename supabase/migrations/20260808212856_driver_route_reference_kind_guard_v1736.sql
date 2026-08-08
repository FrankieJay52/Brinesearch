-- V17.3.6 follow-up: normalize public route-reference road-type labels.
-- This is display metadata only. It does not change anchor names, mileage,
-- directions, roads, pad data, or route evidence.

create or replace function private_verification.driver_route_reference_kind_v1736(
  p_anchor_name text,
  p_fallback_kind text
)
returns text
language plpgsql
immutable
set search_path=pg_catalog
as $function$
declare
  name_text text:=coalesce(p_anchor_name,'');
  has_i boolean:=name_text ~* '(^|[^A-Z0-9])I[- ]?[0-9]{1,3}([^0-9]|$)|INTERSTATE';
  has_us boolean:=name_text ~* '(^|[^A-Z0-9])US[- ]?[0-9]{1,3}([^0-9]|$)';
  has_state boolean:=name_text ~* '(^|[^A-Z0-9])(OH|WV|PA)[- ]?[0-9]{1,4}([^0-9]|$)|(^|[^A-Z0-9])SR[- ]?[0-9]{1,4}([^0-9]|$)';
  has_cr boolean:=name_text ~* '(^|[^A-Z0-9])CR[- /]?[0-9]|COUNTY (ROAD|RD|ROUTE|HWY|HIGHWAY)';
  has_tr boolean:=name_text ~* '(^|[^A-Z0-9])TR[- /]?[0-9]|TOWNSHIP (ROAD|RD|HWY|HIGHWAY)|(^|[^A-Z0-9])TWP[- /]?[0-9]';
  family_count integer;
begin
  if nullif(btrim(name_text),'') is null then
    return nullif(btrim(p_fallback_kind),'');
  end if;

  family_count:=has_i::int+has_us::int+has_state::int+has_cr::int+has_tr::int;

  if family_count>1 then return 'route_reference'; end if;
  if has_cr then return 'county_road'; end if;
  if has_tr then return 'township_road'; end if;
  if has_i then return 'interstate'; end if;
  if has_us then return 'us_route'; end if;
  if has_state then return 'state_route'; end if;
  return nullif(btrim(p_fallback_kind),'');
end
$function$;

revoke all on function private_verification.driver_route_reference_kind_v1736(text,text)
  from public,anon,authenticated;
grant execute on function private_verification.driver_route_reference_kind_v1736(text,text)
  to service_role;

create or replace function private_verification.normalize_driver_route_reference_kind_v1736()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,private_verification
as $function$
begin
  if new.anchor_name is not null then
    new.anchor_kind:=private_verification.driver_route_reference_kind_v1736(new.anchor_name,new.anchor_kind);
  end if;
  return new;
end
$function$;

revoke all on function private_verification.normalize_driver_route_reference_kind_v1736()
  from public,anon,authenticated;
grant execute on function private_verification.normalize_driver_route_reference_kind_v1736()
  to service_role;

drop trigger if exists brinesearch_driver_route_reference_kind_guard_v1736
  on public.brinesearch_driver_route_reference;
create trigger brinesearch_driver_route_reference_kind_guard_v1736
before insert or update of anchor_name,anchor_kind
on public.brinesearch_driver_route_reference
for each row
execute function private_verification.normalize_driver_route_reference_kind_v1736();

update public.brinesearch_driver_route_reference
set anchor_kind=private_verification.driver_route_reference_kind_v1736(anchor_name,anchor_kind)
where anchor_name is not null;

do $assertions$
declare
  bad_count integer;
  mixed_count integer;
begin
  select count(*) into bad_count
  from public.brinesearch_driver_route_reference
  where anchor_name is not null and (
    ((anchor_name ~* '(^|[^A-Z0-9])CR[- /]?[0-9]|COUNTY (ROAD|RD|ROUTE|HWY|HIGHWAY)')
       and not (anchor_name ~* '(^|[^A-Z0-9])TR[- /]?[0-9]|TOWNSHIP (ROAD|RD|HWY|HIGHWAY)|(^|[^A-Z0-9])TWP[- /]?[0-9]')
       and not (anchor_name ~* '(^|[^A-Z0-9])(I|US|OH|WV|PA|SR)[- ]?[0-9]')
       and anchor_kind<>'county_road')
    or
    ((anchor_name ~* '(^|[^A-Z0-9])TR[- /]?[0-9]|TOWNSHIP (ROAD|RD|HWY|HIGHWAY)|(^|[^A-Z0-9])TWP[- /]?[0-9]')
       and not (anchor_name ~* '(^|[^A-Z0-9])CR[- /]?[0-9]|COUNTY (ROAD|RD|ROUTE|HWY|HIGHWAY)')
       and not (anchor_name ~* '(^|[^A-Z0-9])(I|US|OH|WV|PA|SR)[- ]?[0-9]')
       and anchor_kind<>'township_road')
  );
  if bad_count<>0 then raise exception 'Single-family CR/TR route labels remain misclassified: %',bad_count; end if;

  select count(*) into mixed_count
  from public.brinesearch_driver_route_reference
  where anchor_kind='route_reference';
  if mixed_count<>4 then raise exception 'Expected 4 mixed-family route references, found %',mixed_count; end if;

  if exists(
    select 1 from public.brinesearch_driver_route_reference
    where status in ('research_only','no_route_evidence','blocked_conflict')
      and (anchor_name is not null or distance_miles is not null or reference_point is not null)
  ) then raise exception 'Non-driving route details leaked while normalizing road types'; end if;

  if (select count(*) from public.brinesearch_driver_route_reference where distance_miles is not null)<>678 then
    raise exception 'Numeric driver-distance count changed during road-type normalization';
  end if;
end
$assertions$;
