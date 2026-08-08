do $trigger_acl$
declare
  r record;
begin
  for r in
    select distinct p.oid
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace n on n.oid=p.pronamespace
    where not t.tgisinternal
      and n.nspname='public'
  loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    execute format('grant execute on function %s to service_role',r.oid::regprocedure);
  end loop;
end
$trigger_acl$;
alter function public.brinesearch_slug(text)
  set search_path = pg_catalog;
alter function private_verification.norm_text(text)
  set search_path = pg_catalog;
alter function private_verification.miles_between(double precision,double precision,double precision,double precision)
  set search_path = pg_catalog;
alter function private_verification.norm_name_core(text)
  set search_path = pg_catalog;
alter function private_verification.format_api_display(text)
  set search_path = pg_catalog;
alter function private_verification.operator_match(text,text)
  set search_path = pg_catalog, private_verification, extensions;
alter function public.verification_review_analysis(uuid)
  set search_path = pg_catalog, public, private_verification, auth, extensions;
alter extension pg_trgm set schema extensions;
do $security_assertions$
declare
  unsafe_count integer;
begin
  select count(*) into unsafe_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prokind='f'
    and pg_get_functiondef(p.oid) ilike '%caller is not null and not public.is_brinesearch_owner(caller)%';
  if unsafe_count<>0 then
    raise exception 'Unsafe nullable owner checks remain';
  end if;
  if has_function_privilege(
    'anon',
    'public.road_manager_route_prep_summary()'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Anonymous Route Prep summary execution remains';
  end if;
  if has_function_privilege(
    'anon',
    'public.brinesearch_load_odot_geometry_for_ambiguous_ascent(integer,integer)'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.brinesearch_load_odot_geometry_for_ambiguous_ascent(integer,integer)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'ODOT geometry loader is still exposed';
  end if;
  if has_function_privilege(
    'anon',
    'public.submit_pad(text,text,text,text,text,double precision,double precision,text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Direct anonymous submit_pad execution remains';
  end if;
  if not has_function_privilege(
    'anon',
    'public.pad_verification_public_status(uuid)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Safe public verification RPC is unavailable';
  end if;
  if has_function_privilege(
    'anon',
    'public.pad_verification_get(uuid)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Verification history remains anonymously executable';
  end if;
  if has_table_privilege('anon','public.pads','SELECT') then
    raise exception 'Anonymous direct pads-table reads remain';
  end if;
  if not has_table_privilege('anon','public.public_pad_directory_summary','SELECT')
     or not has_table_privilege('anon','public.public_pad_detail','SELECT') then
    raise exception 'Safe public pad views are unavailable';
  end if;
  if has_table_privilege('anon','public.brinesearch_route_prep','SELECT')
     or has_table_privilege('anon','public.brinesearch_route_prep_steps','SELECT')
     or has_table_privilege('anon','public.brinesearch_roads','SELECT') then
    raise exception 'Private Road Manager tables remain anonymously readable';
  end if;
end
$security_assertions$;
