-- BrineSearch Road Manager Route Prep owner queue.
-- Strict policy: never infer a local/county/township road. A generic "Route N"
-- may be held only as a state-route candidate and can never publish until the
-- Owner explicitly reviews it and the road is later verified.

create or replace function public.brinesearch_road_match_key(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(btrim(coalesce(p_value,''))),
          '^(turn\s+(left|right)\s+(onto|on)|continue\s+(on|onto)|slight\s+(left|right)(\s+onto)?|veer\s+(left|right)(\s+onto)?|follow|take)\s+',
          '',
          'i'
        ),
        '\m(road|rd)\M', 'rd', 'g'
      ),
      '\m(street|st)\M', 'st', 'g'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

create or replace function public.road_manager_match_exact_route_steps()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  matched_count integer := 0;
  ambiguous_count integer := 0;
begin
  if caller is not null and not public.is_brinesearch_owner(caller) then
    raise exception 'Only the BrineSearch Owner may match Route Prep roads';
  end if;

  with candidates as (
    select s.id as step_id,array_agg(distinct r.id) as road_ids,count(distinct r.id) as match_count
    from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    join public.pads p on p.id=rp.pad_id
    join public.brinesearch_roads r
      on coalesce(r.state,'')=coalesce(public.brinesearch_state_code(rp.state),'')
     and (r.county is null or lower(r.county)=lower(coalesce(p.county,'')))
     and (r.township is null or lower(r.township)=lower(coalesce(p.township,'')))
     and r.source_method not in ('state_context_candidate_only','owner_approved_state_context_candidate')
     and (
       public.brinesearch_road_match_key(s.normalized_text)=public.brinesearch_road_match_key(r.canonical_name)
       or exists (select 1 from unnest(coalesce(r.aliases,'{}'::text[])) alias where public.brinesearch_road_match_key(alias)=public.brinesearch_road_match_key(s.normalized_text))
     )
    where s.active and s.road_id is null and s.step_kind in ('local_road','county_road','township_road') and s.owner_decision='pending'
    group by s.id
  ), unique_matches as (select step_id,road_ids[1] as road_id from candidates where match_count=1)
  update public.brinesearch_route_prep_steps s
  set road_id=u.road_id,match_status='exact_master',match_method='exact_road_manager_name_or_alias',match_confidence=1.0,
      source_details=coalesce(s.source_details,'{}'::jsonb)||jsonb_build_object('local_road_guessing',false,'matched_from','Road Manager exact canonical name or alias'),
      geometry_status=case when r.geometry_status<>'not_loaded' then 'ready' else 'not_started' end,updated_at=now()
  from unique_matches u join public.brinesearch_roads r on r.id=u.road_id
  where s.id=u.step_id;
  get diagnostics matched_count = row_count;

  with candidates as (
    select s.id as step_id,count(distinct r.id) as match_count
    from public.brinesearch_route_prep_steps s
    join public.brinesearch_route_prep rp on rp.id=s.route_prep_id and rp.active
    join public.pads p on p.id=rp.pad_id
    join public.brinesearch_roads r
      on coalesce(r.state,'')=coalesce(public.brinesearch_state_code(rp.state),'')
     and (r.county is null or lower(r.county)=lower(coalesce(p.county,'')))
     and (r.township is null or lower(r.township)=lower(coalesce(p.township,'')))
     and r.source_method not in ('state_context_candidate_only','owner_approved_state_context_candidate')
     and (
       public.brinesearch_road_match_key(s.normalized_text)=public.brinesearch_road_match_key(r.canonical_name)
       or exists (select 1 from unnest(coalesce(r.aliases,'{}'::text[])) alias where public.brinesearch_road_match_key(alias)=public.brinesearch_road_match_key(s.normalized_text))
     )
    where s.active and s.road_id is null and s.step_kind in ('local_road','county_road','township_road') and s.owner_decision='pending'
    group by s.id
  )
  update public.brinesearch_route_prep_steps s
  set match_status='needs_review',match_method='multiple_exact_road_manager_matches',
      source_details=coalesce(s.source_details,'{}'::jsonb)||jsonb_build_object('local_road_guessing',false,'ambiguous_exact_match_count',c.match_count),updated_at=now()
  from candidates c where c.match_count>1 and s.id=c.step_id;
  get diagnostics ambiguous_count = row_count;

  return jsonb_build_object('matched_steps',matched_count,'ambiguous_steps',ambiguous_count,'policy','Exact Road Manager canonical names or aliases only. No local-road guessing.');
end;
$$;

create or replace function public.road_manager_route_prep_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare caller uuid := auth.uid();
begin
  if caller is not null and not public.is_brinesearch_owner(caller) then raise exception 'Only the BrineSearch Owner may open Route Prep'; end if;
  return jsonb_build_object(
    'policy','Never guess a local, county, township, lease, or access road. Generic Route numbers remain non-publishable state-route candidates until Owner review.',
    'distinct_pads',(select count(distinct pad_id) from public.brinesearch_route_prep where active),
    'route_variants',(select count(*) from public.brinesearch_route_prep where active),
    'alternate_variants',(select count(*) from public.brinesearch_route_prep where active and variant_index>1),
    'active_steps',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where rp.active and s.active),
    'matched_steps',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where rp.active and s.active and s.match_status='exact_master'),
    'unmatched_local_steps',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where rp.active and s.active and s.step_kind in ('local_road','county_road','township_road') and s.match_status<>'exact_master'),
    'state_route_candidate_steps',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where rp.active and s.active and s.step_kind='state_route_candidate'),
    'private_segments',(select count(*) from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where rp.active and s.active and s.step_kind='private_segment'),
    'readiness',coalesce((select jsonb_object_agg(readiness_status,route_count) from (select readiness_status,count(*)::integer route_count from public.brinesearch_route_prep where active group by readiness_status) q),'{}'::jsonb),
    'step_status',coalesce((select jsonb_object_agg(match_status,step_count) from (select s.match_status,count(*)::integer step_count from public.brinesearch_route_prep_steps s join public.brinesearch_route_prep rp on rp.id=s.route_prep_id where rp.active and s.active group by s.match_status) q),'{}'::jsonb),
    'refreshed_at',now()
  );
end;
$$;

create or replace function public.road_manager_route_prep_list(p_search text default null,p_status text default null,p_state text default null,p_company text default null,p_limit integer default 40,p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is not null and not public.is_brinesearch_owner(caller) then raise exception 'Only the BrineSearch Owner may open Route Prep'; end if;
  with filtered as (
    select rp.*,p.legacy_id,p.latitude,p.longitude,p.county,p.township,
      (select count(*) from public.brinesearch_route_prep_steps s where s.route_prep_id=rp.id and s.active) step_total,
      (select count(*) from public.brinesearch_route_prep_steps s where s.route_prep_id=rp.id and s.active and s.match_status='exact_master') step_matched,
      (select count(*) from public.brinesearch_route_prep_steps s where s.route_prep_id=rp.id and s.active and s.step_kind='state_route_candidate') step_candidates,
      (select count(*) from public.brinesearch_route_prep_steps s where s.route_prep_id=rp.id and s.active and s.step_kind in ('local_road','county_road','township_road') and s.match_status<>'exact_master') step_unmatched_local,
      (select count(*) from public.brinesearch_route_prep_steps s where s.route_prep_id=rp.id and s.active and s.step_kind='private_segment') step_private
    from public.brinesearch_route_prep rp join public.pads p on p.id=rp.pad_id
    where rp.active
      and (nullif(btrim(p_status),'') is null or rp.readiness_status=p_status)
      and (nullif(btrim(p_state),'') is null or lower(rp.state)=lower(p_state))
      and (nullif(btrim(p_company),'') is null or lower(rp.company)=lower(p_company))
      and (nullif(btrim(p_search),'') is null or rp.pad_name ilike '%'||btrim(p_search)||'%' or rp.company ilike '%'||btrim(p_search)||'%' or rp.source_sequence ilike '%'||btrim(p_search)||'%' or rp.normalized_sequence ilike '%'||btrim(p_search)||'%' or coalesce(rp.highway_anchor_text,'') ilike '%'||btrim(p_search)||'%' or coalesce(rp.candidate_state_route,'') ilike '%'||btrim(p_search)||'%')
  ), page as (
    select * from filtered order by
      case readiness_status when 'field_check' then 0 when 'needs_state_route_candidate_review' then 1 when 'needs_highway_anchor' then 2 when 'needs_sequence_reorder' then 3 when 'needs_sequence_rebuild' then 4 when 'needs_sequence_cleanup' then 5 when 'needs_gps_review' then 6 when 'ready_for_road_matching' then 7 when 'ready_for_geometry' then 8 when 'geometry_measured' then 9 when 'approved' then 10 else 11 end,
      state,company,pad_name,variant_index
    limit greatest(1,least(coalesce(p_limit,40),100)) offset greatest(coalesce(p_offset,0),0)
  )
  select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'pad_id',pad_id,'legacy_id',legacy_id,'pad_name',pad_name,'company',company,'state',state,'county',county,'township',township,'latitude',latitude,'longitude',longitude,
    'route_group',route_group,'variant_index',variant_index,'source_sequence',source_sequence,'normalized_sequence',normalized_sequence,'readiness_status',readiness_status,'issue_codes',issue_codes,
    'highway_anchor_text',highway_anchor_text,'highway_anchor_kind',highway_anchor_kind,'highway_anchor_status',highway_anchor_status,'candidate_state_route',candidate_state_route,'no_guess_policy',no_guess_policy,
    'step_total',step_total,'step_matched',step_matched,'step_candidates',step_candidates,'step_unmatched_local',step_unmatched_local,'step_private',step_private,'owner_notes',owner_notes,'analyzed_at',analyzed_at,'reviewed_at',reviewed_at
  )) from page),'[]'::jsonb)) into result;
  return result;
end;
$$;

create or replace function public.road_manager_route_prep_detail(p_route_prep_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is not null and not public.is_brinesearch_owner(caller) then raise exception 'Only the BrineSearch Owner may open Route Prep'; end if;
  select jsonb_build_object(
    'route',jsonb_build_object('id',rp.id,'pad_id',rp.pad_id,'legacy_id',p.legacy_id,'pad_name',rp.pad_name,'company',rp.company,'state',rp.state,'county',p.county,'township',p.township,'latitude',p.latitude,'longitude',p.longitude,'route_group',rp.route_group,'variant_index',rp.variant_index,'source_sequence',rp.source_sequence,'normalized_sequence',rp.normalized_sequence,'normalized_steps',rp.normalized_steps,'readiness_status',rp.readiness_status,'issue_codes',rp.issue_codes,'highway_anchor_text',rp.highway_anchor_text,'highway_anchor_kind',rp.highway_anchor_kind,'highway_anchor_status',rp.highway_anchor_status,'candidate_state_route',rp.candidate_state_route,'candidate_state_route_source',rp.candidate_state_route_source,'no_guess_policy',rp.no_guess_policy,'owner_notes',rp.owner_notes,'analyzed_at',rp.analyzed_at,'reviewed_at',rp.reviewed_at,'structured_road_sequence',p.structured_road_sequence,'written_directions',p.written_directions,'directions_clear',p.directions_clear),
    'steps',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'step_order',s.step_order,'raw_text',s.raw_text,'normalized_text',s.normalized_text,'step_kind',s.step_kind,'road_id',s.road_id,'match_status',s.match_status,'match_method',s.match_method,'match_confidence',s.match_confidence,'source_details',s.source_details,'owner_decision',s.owner_decision,'distance_miles',s.distance_miles,'turn_direction',s.turn_direction,'geometry_status',s.geometry_status,'owner_notes',s.owner_notes,'road',case when r.id is null then null else jsonb_build_object('id',r.id,'canonical_name',r.canonical_name,'road_type',r.road_type,'state',r.state,'county',r.county,'township',r.township,'route_number',r.route_number,'verification_status',r.verification_status,'source_agency',r.source_agency,'source_dataset',r.source_dataset,'source_method',r.source_method,'source_record_id',r.source_record_id,'geometry_status',r.geometry_status,'approved_by_default',r.approved_by_default) end) order by s.step_order) from public.brinesearch_route_prep_steps s left join public.brinesearch_roads r on r.id=s.road_id where s.route_prep_id=rp.id and s.active),'[]'::jsonb)
  ) into result from public.brinesearch_route_prep rp join public.pads p on p.id=rp.pad_id where rp.id=p_route_prep_id and rp.active;
  if result is null then raise exception 'Route Prep record not found'; end if;
  return result;
end;
$$;

create or replace function public.road_manager_route_prep_set_review(p_route_prep_id uuid,p_readiness_status text,p_owner_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare caller uuid := auth.uid(); allowed text[] := array['ready_for_road_matching','needs_gps_review','needs_sequence_rebuild','needs_sequence_cleanup','needs_highway_anchor','needs_state_route_candidate_review','needs_sequence_reorder','ready_for_geometry','geometry_measured','field_check','approved','blocked']; row_data public.brinesearch_route_prep;
begin
  if caller is null or not public.is_brinesearch_owner(caller) then raise exception 'Only the BrineSearch Owner may review Route Prep'; end if;
  if not (p_readiness_status=any(allowed)) then raise exception 'Invalid Route Prep status'; end if;
  if p_readiness_status='approved' and exists (select 1 from public.brinesearch_route_prep_steps s where s.route_prep_id=p_route_prep_id and s.active and s.step_kind not in ('private_segment','exit_note') and (s.match_status<>'exact_master' or s.road_id is null or s.geometry_status<>'measured')) then raise exception 'This route cannot be approved until every public road is exactly matched and measured'; end if;
  update public.brinesearch_route_prep set readiness_status=p_readiness_status,owner_notes=nullif(btrim(coalesce(p_owner_notes,'')),''),reviewed_at=now(),reviewed_by=caller,updated_at=now() where id=p_route_prep_id and active returning * into row_data;
  if row_data.id is null then raise exception 'Route Prep record not found'; end if;
  return to_jsonb(row_data);
end;
$$;

create or replace function public.road_manager_route_prep_step_decision(p_step_id uuid,p_decision text,p_owner_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare caller uuid := auth.uid(); s public.brinesearch_route_prep_steps; rp public.brinesearch_route_prep; candidate text; state_code text; candidate_road_id uuid;
begin
  if caller is null or not public.is_brinesearch_owner(caller) then raise exception 'Only the BrineSearch Owner may decide Route Prep candidates'; end if;
  select * into s from public.brinesearch_route_prep_steps where id=p_step_id and active for update;
  if s.id is null then raise exception 'Route Prep step not found'; end if;
  select * into rp from public.brinesearch_route_prep where id=s.route_prep_id and active;
  if rp.id is null then raise exception 'Route Prep route not found'; end if;

  if p_decision='approve_state_route_candidate' then
    if s.step_kind<>'state_route_candidate' then raise exception 'Only a state-route candidate may use this approval'; end if;
    candidate := public.brinesearch_state_route_candidate(s.raw_text,rp.state); state_code := public.brinesearch_state_code(rp.state);
    if candidate is null then raise exception 'The saved step is not a valid state-route candidate'; end if;
    insert into public.brinesearch_roads(canonical_name,normalized_name,road_type,state,aliases,truck_route,verification_status,route_number,source_method,geometry_status,approved_by_default,notes,updated_at)
    values(candidate,public.brinesearch_road_match_key(candidate),'state_route',state_code,array[s.raw_text],true,'needs_review',split_part(candidate,'-',2),'owner_approved_state_context_candidate','not_loaded',true,'Owner-approved educated state-route candidate. It may not publish to a pad route until official verification.',now())
    on conflict (road_scope_key) do update set aliases=(select array(select distinct x from unnest(public.brinesearch_roads.aliases||excluded.aliases) x where nullif(btrim(x),'') is not null)),notes=case when public.brinesearch_roads.source_method='owner_approved_state_context_candidate' then excluded.notes else public.brinesearch_roads.notes end,updated_at=now()
    returning id into candidate_road_id;
    if candidate_road_id is null then select id into candidate_road_id from public.brinesearch_roads where road_scope_key=state_code||'|'||public.brinesearch_road_match_key(candidate)||'||'; end if;
    update public.brinesearch_route_prep_steps set road_id=candidate_road_id,match_status='state_route_candidate',match_method='owner_approved_state_context_candidate',match_confidence=0.60,source_details=coalesce(source_details,'{}'::jsonb)||jsonb_build_object('candidate_only',true,'may_publish',false,'local_road_guessing',false,'owner_approved_at',now(),'candidate',candidate),owner_decision='approved',owner_notes=nullif(btrim(coalesce(p_owner_notes,'')),''),geometry_status='not_started',updated_at=now() where id=p_step_id;
    update public.brinesearch_route_prep set readiness_status='ready_for_road_matching',reviewed_at=now(),reviewed_by=caller,updated_at=now() where id=rp.id and not exists (select 1 from public.brinesearch_route_prep_steps x where x.route_prep_id=rp.id and x.active and x.step_kind='state_route_candidate' and x.id<>p_step_id and x.owner_decision='pending');
  elsif p_decision='reject_state_route_candidate' then
    if s.step_kind<>'state_route_candidate' then raise exception 'Only a state-route candidate may use this rejection'; end if;
    update public.brinesearch_route_prep_steps set road_id=null,match_status='rejected',match_method='owner_rejected_state_route_candidate',match_confidence=null,owner_decision='rejected',owner_notes=nullif(btrim(coalesce(p_owner_notes,'')),''),geometry_status='blocked',updated_at=now() where id=p_step_id;
    update public.brinesearch_route_prep set readiness_status='blocked',reviewed_at=now(),reviewed_by=caller,updated_at=now() where id=rp.id;
  elsif p_decision='field_check' then
    update public.brinesearch_route_prep_steps set owner_decision='field_check',owner_notes=nullif(btrim(coalesce(p_owner_notes,'')),''),updated_at=now() where id=p_step_id;
    update public.brinesearch_route_prep set readiness_status='field_check',reviewed_at=now(),reviewed_by=caller,updated_at=now() where id=rp.id;
  elsif p_decision='reset_pending' then
    update public.brinesearch_route_prep_steps set road_id=case when step_kind='state_route_candidate' then null else road_id end,match_status=case when step_kind='state_route_candidate' then 'state_route_candidate' else match_status end,match_method=case when step_kind='state_route_candidate' then 'state_context_candidate_only' else match_method end,match_confidence=case when step_kind='state_route_candidate' then 0.55 else match_confidence end,owner_decision='pending',owner_notes=null,geometry_status='not_started',updated_at=now() where id=p_step_id;
  else raise exception 'Unsupported Route Prep step decision'; end if;
  return public.road_manager_route_prep_detail(rp.id);
end;
$$;

create or replace function public.road_manager_refresh_route_prep()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare caller uuid := auth.uid(); refreshed jsonb; matched jsonb;
begin
  if caller is null or not public.is_brinesearch_owner(caller) then raise exception 'Only the BrineSearch Owner may refresh Route Prep'; end if;
  refreshed := public.refresh_brinesearch_route_prep(); matched := public.road_manager_match_exact_route_steps();
  return refreshed||jsonb_build_object('exact_matching',matched);
end;
$$;

create or replace function public.enforce_brinesearch_route_prep_no_guess()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.step_kind in ('local_road','county_road','township_road','private_segment','generic','unknown') and (coalesce(new.match_method,'') ~* '(guess|candidate)' or coalesce(new.source_details->>'candidate_only','false')='true') then raise exception 'Local, county, township, private, access, and generic roads may never be guessed'; end if;
  if new.step_kind='state_route_candidate' and coalesce(new.source_details->>'may_publish','false')='true' then raise exception 'A state-route candidate may not publish until official verification'; end if;
  return new;
end;
$$;
drop trigger if exists trg_enforce_brinesearch_route_prep_no_guess on public.brinesearch_route_prep_steps;
create trigger trg_enforce_brinesearch_route_prep_no_guess before insert or update on public.brinesearch_route_prep_steps for each row execute function public.enforce_brinesearch_route_prep_no_guess();

create or replace function public.prevent_candidate_road_publication()
returns trigger
language plpgsql
set search_path = public
as $$
declare method text;
begin
  select source_method into method from public.brinesearch_roads where id=new.road_id;
  if method in ('state_context_candidate_only','owner_approved_state_context_candidate') then raise exception 'A state-route candidate cannot be linked to a live pad route until officially verified'; end if;
  return new;
end;
$$;
drop trigger if exists trg_prevent_candidate_road_publication on public.brinesearch_pad_roads;
create trigger trg_prevent_candidate_road_publication before insert or update of road_id on public.brinesearch_pad_roads for each row execute function public.prevent_candidate_road_publication();

revoke all on function public.road_manager_route_prep_summary() from public;
revoke all on function public.road_manager_route_prep_list(text,text,text,text,integer,integer) from public;
revoke all on function public.road_manager_route_prep_detail(uuid) from public;
revoke all on function public.road_manager_route_prep_set_review(uuid,text,text) from public;
revoke all on function public.road_manager_route_prep_step_decision(uuid,text,text) from public;
revoke all on function public.road_manager_refresh_route_prep() from public;
revoke all on function public.road_manager_match_exact_route_steps() from public;
grant execute on function public.road_manager_route_prep_summary() to authenticated;
grant execute on function public.road_manager_route_prep_list(text,text,text,text,integer,integer) to authenticated;
grant execute on function public.road_manager_route_prep_detail(uuid) to authenticated;
grant execute on function public.road_manager_route_prep_set_review(uuid,text,text) to authenticated;
grant execute on function public.road_manager_route_prep_step_decision(uuid,text,text) to authenticated;
grant execute on function public.road_manager_refresh_route_prep() to authenticated;
grant execute on function public.road_manager_match_exact_route_steps() to authenticated;

select public.road_manager_match_exact_route_steps();
