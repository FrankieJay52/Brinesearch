    'api_verified',coalesce(v_status.api_verified,false),
    'property_verified',coalesce(v_status.property_verified,false),
    'roads_verified',coalesce(v_status.roads_verified,false),
    'needs_field_check',coalesce(v_status.needs_field_check,false),
    'review_note',case when coalesce(v_status.needs_field_check,false)
                       then 'Field confirmation needed'
                       else null end,
    'verified_at',v_status.verified_at,
    'updated_at',v_status.updated_at,
    'score',v_score
  );
end;
$function$;
create or replace function public.pad_verification_get(p_pad_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  caller uuid := auth.uid();
  v_status public.pad_verification_status;
  v_history jsonb;
  v_score integer;
begin
  if caller is null or not public.is_brinesearch_editor(caller) then
    raise exception 'Editor access required';
  end if;
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
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',h.id,
        'action',h.action,
        'field_name',h.field_name,
        'old_value',h.old_value,
        'new_value',h.new_value,
        'note',h.note,
        'created_at',h.created_at,
        'actor_name',coalesce(nullif(btrim(e.display_name),''),'Editor')
      )
      order by h.created_at desc
    ),
    '[]'::jsonb
  )
  into v_history
  from (
    select *
    from public.pad_verification_history
    where pad_id=p_pad_id
    order by created_at desc
    limit 30
  ) h
  left join public.editor_accounts e on e.user_id=h.actor_id;
  return jsonb_build_object(
    'pad_id',p_pad_id,
    'gps_verified',coalesce(v_status.gps_verified,false),
    'directions_verified',coalesce(v_status.directions_verified,false),
    'wells_verified',coalesce(v_status.wells_verified,false),
    'api_verified',coalesce(v_status.api_verified,false),
    'property_verified',coalesce(v_status.property_verified,false),
    'roads_verified',coalesce(v_status.roads_verified,false),
    'needs_field_check',coalesce(v_status.needs_field_check,false),
    'review_note',v_status.review_note,
    'verified_by',v_status.verified_by,
    'verified_at',v_status.verified_at,
    'updated_at',v_status.updated_at,
    'score',v_score,
    'history',v_history
  );
end;
$function$;
create or replace function public.field_set_profile_active(p_active boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  caller uuid := auth.uid();
  old_status text;
  requested_status text := case when coalesce(p_active,false) then 'active' else 'removed' end;
  moderator boolean;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  moderator := public.is_brinesearch_moderator(caller);
  select status into old_status
  from public.field_profiles
  where user_id=caller
  for update;
  if old_status is null then
    raise exception 'Field Feed profile not found';
  end if;
  if old_status='suspended' and not moderator then
    raise exception 'A suspended profile may only be restored by a moderator';
  end if;
  if not moderator
     and requested_status is distinct from old_status
     and not (
       (old_status='active' and requested_status='removed')
       or (old_status='removed' and requested_status='active')
     ) then
    raise exception 'Profile status change is not allowed';
  end if;
  update public.field_profiles
  set status=requested_status,
      updated_at=now()
  where user_id=caller;
  return true;
end;
$function$;
create or replace function public.protect_field_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  caller uuid := auth.uid();
  moderator boolean;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  moderator := public.is_brinesearch_moderator(caller);
  if not moderator then
    if new.user_id is distinct from old.user_id
       or new.reputation is distinct from old.reputation
       or new.verified_company_rep is distinct from old.verified_company_rep
       or new.contributor_override is distinct from old.contributor_override
       or new.rules_strikes is distinct from old.rules_strikes
