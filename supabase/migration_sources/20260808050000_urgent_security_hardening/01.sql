declare
  r record;
  original_definition text;
  patched_definition text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and (
        pg_get_functiondef(p.oid) ilike '%is_brinesearch_owner%'
        or p.proname in (
          'brinesearch_apply_exact_spacing_aliases_for_ascent',
          'brinesearch_apply_safe_ascent_direction_work',
          'brinesearch_apply_strict_odot_context_resolutions',
          'brinesearch_mark_exact_spacing_aliases_for_ascent',
          'brinesearch_refresh_ascent_direction_work',
          'brinesearch_stage_strict_odot_context_resolutions',
          'refresh_brinesearch_route_prep',
          'road_manager_finalize_highway_references',
          'road_manager_match_exact_route_steps',
          'road_manager_normalize_highway_families',
          'road_manager_recalculate_route_readiness',
          'road_manager_reclassify_generic_route_references',
          'road_manager_resolve_verified_generic_highways',
          'road_manager_route_prep_detail',
          'road_manager_route_prep_list',
          'road_manager_route_prep_summary'
        )
      )
  loop
    original_definition := pg_get_functiondef(r.oid);
    patched_definition := original_definition;
    patched_definition := replace(
      patched_definition,
      'if caller is not null and not public.is_brinesearch_owner(caller) then',
      'if caller is null or not public.is_brinesearch_owner(caller) then'
    );
    patched_definition := replace(
      patched_definition,
      'if not public.is_brinesearch_owner(auth.uid()) then',
      'if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then'
    );
    patched_definition := replace(
      patched_definition,
      'if not public.is_brinesearch_owner(reviewer) then',
      'if reviewer is null or not public.is_brinesearch_owner(reviewer) then'
    );
    patched_definition := replace(
      patched_definition,
      'if not public.is_brinesearch_owner(caller) then',
      'if caller is null or not public.is_brinesearch_owner(caller) then'
    );
    if patched_definition is distinct from original_definition then
      execute patched_definition;
    end if;
  end loop;
end
$security_patch$;
do $geometry_auth$
declare
  original_definition text;
  patched_definition text;
begin
  original_definition := pg_get_functiondef(
    'public.brinesearch_load_odot_geometry_for_ambiguous_ascent(integer,integer)'::regprocedure
  );
  patched_definition := replace(
    original_definition,
    E'begin\n  loop',
    E'begin\n  if auth.uid() is null or not public.is_brinesearch_owner(auth.uid()) then\n    raise exception ''Owner access required'';\n  end if;\n  loop'
  );
  if patched_definition = original_definition then
    raise exception 'Could not inject the mandatory owner check into brinesearch_load_odot_geometry_for_ambiguous_ascent';
  end if;
  execute patched_definition;
end
$geometry_auth$;
do $role_patch$
declare
  r record;
  original_definition text;
  patched_definition text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.prosecdef
      and (
        pg_get_functiondef(p.oid) ilike '%is_brinesearch_editor%'
        or pg_get_functiondef(p.oid) ilike '%is_brinesearch_moderator%'
      )
  loop
    original_definition := pg_get_functiondef(r.oid);
    patched_definition := original_definition;
    patched_definition := replace(
      patched_definition,
      'if not public.is_brinesearch_editor(auth.uid()) then',
      'if auth.uid() is null or not public.is_brinesearch_editor(auth.uid()) then'
    );
    patched_definition := replace(
      patched_definition,
      'if not public.is_brinesearch_moderator(auth.uid()) then',
      'if auth.uid() is null or not public.is_brinesearch_moderator(auth.uid()) then'
    );
    if patched_definition is distinct from original_definition then
      execute patched_definition;
    end if;
  end loop;
end
$role_patch$;
create or replace function public.pad_verification_public_status(p_pad_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status public.pad_verification_status;
  v_score integer;
begin
  select * into v_status
  from public.pad_verification_status
  where pad_id=p_pad_id;
  if v_status.pad_id is null then
    v_status.pad_id:=p_pad_id;
    v_status.gps_verified:=false;
    v_status.directions_verified:=false;
    v_status.wells_verified:=false;
    v_status.api_verified:=false;
    v_status.property_verified:=false;
    v_status.roads_verified:=false;
    v_status.needs_field_check:=false;
  end if;
  v_score := (
    (
      coalesce(v_status.gps_verified,false)::int
      + coalesce(v_status.directions_verified,false)::int
      + coalesce(v_status.wells_verified,false)::int
      + coalesce(v_status.api_verified,false)::int
      + coalesce(v_status.property_verified,false)::int
      + coalesce(v_status.roads_verified,false)::int
    ) * 100 / 6
  );
  return jsonb_build_object(
    'pad_id',p_pad_id,
    'gps_verified',coalesce(v_status.gps_verified,false),
    'directions_verified',coalesce(v_status.directions_verified,false),
    'wells_verified',coalesce(v_status.wells_verified,false),
