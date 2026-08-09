alter table public.pad_verification_status
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists auto_reviewed_at timestamptz;

create or replace function public.refresh_pad_verification_evidence(p_pad_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare v_count integer := 0;
begin
  insert into public.pad_verification_status(pad_id)
  select p.id from public.pads p where p_pad_id is null or p.id=p_pad_id
  on conflict (pad_id) do nothing;

  with exact_road_pads as (
    select m.pad_id from public.brinesearch_odot_step_matches m group by m.pad_id
    having count(*)>0 and count(*) filter(where m.match_status<>'unique_exact')=0
  ), evidence_rows as (
    select p.id pad_id,
      (p.latitude is not null and p.longitude is not null and (coalesce(p.verification_status,'') ilike 'VERIFIED:%lat/long%' or coalesce(p.verification_status,'') ilike '%coordinates%verified%' or p.extra_data ? 'coordinate_geography' or p.extra_data ? 'field_address_confirmed')) gps_safe,
      (nullif(btrim(coalesce(p.directions_clear,'')),'') is not null and nullif(btrim(coalesce(p.directions_clear_method,'')),'') is not null and coalesce(p.extra_data->'direction_review_20260808'->>'status','')<>'unresolved') directions_safe,
      (coalesce(jsonb_array_length(coalesce(p.extra_data->'official_well_records','[]'::jsonb)),0)>0 and coalesce((p.extra_data->'api_verification_summary'->>'saved_api_count')::int,0)>0 and coalesce((p.extra_data->'api_verification_summary'->>'exact_odnr_matches')::int,0)>=coalesce((p.extra_data->'api_verification_summary'->>'saved_api_count')::int,0) and coalesce(jsonb_array_length(coalesce(p.extra_data->'api_verification_summary'->'unmatched_saved_apis','[]'::jsonb)),0)=0) wells_safe,
      (coalesce((p.extra_data->'api_verification_summary'->>'saved_api_count')::int,0)>0 and coalesce((p.extra_data->'api_verification_summary'->>'exact_odnr_matches')::int,0)>=coalesce((p.extra_data->'api_verification_summary'->>'saved_api_count')::int,0) and coalesce(jsonb_array_length(coalesce(p.extra_data->'api_verification_summary'->'unmatched_saved_apis','[]'::jsonb)),0)=0) api_safe,
      (nullif(btrim(coalesce(p.property_number,'')),'') is not null and (p.extra_data ? 'field_property_number_observation' or p.extra_data ? 'property_cleanup')) property_safe,
      (erp.pad_id is not null or coalesce(p.road_sequence_status,'') in ('owner_and_official_route_verified','Source-grounded manual correction')) roads_safe
    from public.pads p left join exact_road_pads erp on erp.pad_id=p.id
    where p_pad_id is null or p.id=p_pad_id
  )
  update public.pad_verification_status s set
    gps_verified=coalesce(s.gps_verified,false) or e.gps_safe,
    directions_verified=coalesce(s.directions_verified,false) or e.directions_safe,
    wells_verified=coalesce(s.wells_verified,false) or e.wells_safe,
    api_verified=coalesce(s.api_verified,false) or e.api_safe,
    property_verified=coalesce(s.property_verified,false) or e.property_safe,
    roads_verified=coalesce(s.roads_verified,false) or e.roads_safe,
    evidence=jsonb_build_object(
      'gps',jsonb_build_object('auto_reviewed',e.gps_safe,'basis',case when e.gps_safe then 'Saved driver coordinates have explicit coordinate/field verification evidence.' else 'Saved driver GPS still needs independent confirmation.' end),
      'directions',jsonb_build_object('auto_reviewed',e.directions_safe,'basis',case when e.directions_safe then 'Clear Directions exist with a recorded reviewed method and no unresolved direction-review block.' else 'Truck directions still need reviewed route evidence or field confirmation.' end),
      'wells',jsonb_build_object('auto_reviewed',e.wells_safe,'basis',case when e.wells_safe then 'Attached official well records cover every saved API number with no unmatched APIs.' else 'Well list does not yet have a complete exact official match.' end),
      'api',jsonb_build_object('auto_reviewed',e.api_safe,'basis',case when e.api_safe then 'Every saved API number has an exact attached official match.' else 'One or more saved API numbers are unmatched or not yet checked.' end),
      'property',jsonb_build_object('auto_reviewed',e.property_safe,'basis',case when e.property_safe then 'Property number was retained after a recorded cleanup/field observation.' else 'Property numbers are not treated as verified without field/company or recorded cleanup evidence.' end),
      'roads',jsonb_build_object('auto_reviewed',e.roads_safe,'basis',case when e.roads_safe then 'Road names have exact official road matches or an owner/source-grounded route review.' else 'Road names still need official/source or field confirmation.' end)
    ), auto_reviewed_at=now(), updated_at=now()
  from evidence_rows e where s.pad_id=e.pad_id;
  get diagnostics v_count=row_count; return v_count;
end;
$$;

revoke all on function public.refresh_pad_verification_evidence(uuid) from public, anon, authenticated;
grant execute on function public.refresh_pad_verification_evidence(uuid) to service_role;

create or replace function public.pad_verification_get(p_pad_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog','public'
as $$
declare caller uuid:=auth.uid(); s public.pad_verification_status; h jsonb; score integer;
begin
 if caller is null or not public.is_brinesearch_editor(caller) then raise exception 'Editor access required';end if;
 select * into s from public.pad_verification_status where pad_id=p_pad_id;
 if s.pad_id is null then s.pad_id:=p_pad_id;s.gps_verified:=false;s.directions_verified:=false;s.wells_verified:=false;s.api_verified:=false;s.property_verified:=false;s.roads_verified:=false;s.needs_field_check:=false;end if;
 score:=((coalesce(s.gps_verified,false)::int+coalesce(s.directions_verified,false)::int+coalesce(s.wells_verified,false)::int+coalesce(s.api_verified,false)::int+coalesce(s.property_verified,false)::int+coalesce(s.roads_verified,false)::int)*100/6);
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'action',x.action,'field_name',x.field_name,'old_value',x.old_value,'new_value',x.new_value,'note',x.note,'created_at',x.created_at,'actor_name',coalesce(nullif(btrim(e.display_name),''),'Editor')) order by x.created_at desc),'[]'::jsonb) into h from (select * from public.pad_verification_history where pad_id=p_pad_id order by created_at desc limit 30)x left join public.editor_accounts e on e.user_id=x.actor_id;
 return jsonb_build_object('pad_id',p_pad_id,'gps_verified',coalesce(s.gps_verified,false),'directions_verified',coalesce(s.directions_verified,false),'wells_verified',coalesce(s.wells_verified,false),'api_verified',coalesce(s.api_verified,false),'property_verified',coalesce(s.property_verified,false),'roads_verified',coalesce(s.roads_verified,false),'needs_field_check',coalesce(s.needs_field_check,false),'review_note',s.review_note,'verified_by',s.verified_by,'verified_at',s.verified_at,'updated_at',s.updated_at,'score',score,'history',h,'evidence',coalesce(s.evidence,'{}'::jsonb),'auto_reviewed_at',s.auto_reviewed_at);
end;$$;

create or replace function public.pad_verification_invalidate_on_pad_change()
returns trigger language plpgsql security definer set search_path='pg_catalog','public'
as $$
begin
 if not exists(select 1 from public.pad_verification_status where pad_id=new.id) then return new;end if;
 update public.pad_verification_status s set
  gps_verified=case when old.latitude is distinct from new.latitude or old.longitude is distinct from new.longitude then false else s.gps_verified end,
  directions_verified=case when old.directions_clear is distinct from new.directions_clear or old.structured_road_sequence is distinct from new.structured_road_sequence or old.written_directions is distinct from new.written_directions then false else s.directions_verified end,
  roads_verified=case when old.structured_road_sequence is distinct from new.structured_road_sequence or old.written_directions is distinct from new.written_directions then false else s.roads_verified end,
  wells_verified=case when old.well_name is distinct from new.well_name or old.well_entries is distinct from new.well_entries then false else s.wells_verified end,
  api_verified=case when old.api is distinct from new.api or old.well_entries is distinct from new.well_entries then false else s.api_verified end,
  property_verified=case when old.property_number is distinct from new.property_number or old.well_entries is distinct from new.well_entries then false else s.property_verified end,
  updated_at=now() where s.pad_id=new.id;
 return new;
end;$$;

drop trigger if exists trg_pad_verification_invalidate on public.pads;
create trigger trg_pad_verification_invalidate after update on public.pads for each row execute function public.pad_verification_invalidate_on_pad_change();

select public.refresh_pad_verification_evidence(null);
