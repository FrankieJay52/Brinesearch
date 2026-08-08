security definer
set search_path = pg_catalog, storage, public
as $function$
  select auth.uid() is not null
     and public.brinesearch_user_email_verified(auth.uid())
     and (
       select count(*) < 100
          and coalesce(sum(coalesce((o.metadata->>'size')::bigint,0)),0) < 52428800
       from storage.objects o
       where o.bucket_id='field-feed-images'
         and (storage.foldername(o.name))[1]=auth.uid()::text
     );
$function$;
drop policy if exists "Users upload own field feed images" on storage.objects;
create policy "Users upload own field feed images"
on storage.objects for insert to authenticated
with check (
  bucket_id='field-feed-images'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.field_feed_storage_within_quota()
  and lower(coalesce(metadata->>'mimetype','')) in ('image/jpeg','image/png','image/webp','image/gif')
  and coalesce((metadata->>'size')::bigint,0) between 1 and 6291456
);
create or replace function public.cleanup_orphan_field_feed_images(
  p_older_than interval default interval '24 hours',
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, storage
as $function$
declare
  deleted_count integer;
begin
  with doomed as (
    select o.id
    from storage.objects o
    where o.bucket_id='field-feed-images'
      and o.created_at < now()-greatest(p_older_than,interval '1 hour')
      and not exists (
        select 1
        from public.field_profiles fp
        where fp.avatar_url like '%'||o.name
      )
      and not exists (
        select 1
        from public.field_posts p,
             lateral unnest(coalesce(p.image_urls,'{}'::text[])) image_url
        where image_url like '%'||o.name
      )
    order by o.created_at
    limit greatest(1,least(coalesce(p_limit,500),5000))
  )
  delete from storage.objects o
  using doomed d
  where o.id=d.id;
  get diagnostics deleted_count=row_count;
  return deleted_count;
end;
$function$;
do $function_acl$
declare
  r record;
  internal_names text[] := array[
    'brinesearch_apply_exact_spacing_aliases_for_ascent',
    'brinesearch_apply_safe_ascent_direction_work',
    'brinesearch_apply_strict_odot_context_resolutions',
    'brinesearch_apply_unique_ascent_odot_matches',
    'brinesearch_load_odot_geometry_for_ambiguous_ascent',
    'brinesearch_load_odot_geometry_for_applied_ascent',
    'brinesearch_load_odot_road_catalog',
    'brinesearch_mark_exact_spacing_aliases_for_ascent',
    'brinesearch_refine_ascent_odot_step_matches',
    'brinesearch_refresh_ascent_direction_work',
    'brinesearch_refresh_ascent_odot_step_matches',
    'brinesearch_stage_strict_odot_context_resolutions',
    'refresh_brinesearch_route_prep',
    'road_manager_finalize_highway_references',
    'road_manager_match_exact_route_steps',
    'road_manager_normalize_highway_families',
    'road_manager_recalculate_route_readiness',
    'road_manager_reclassify_generic_route_references',
    'road_manager_resolve_verified_generic_highways',
    'import_pads_compact',
    'brinesearch_clean_route_step',
    'brinesearch_context_highway_name',
    'brinesearch_direction_contains_road',
    'brinesearch_explicit_highway_name',
    'brinesearch_format_saved_direction_section',
    'brinesearch_highway_base_name',
    'brinesearch_highway_travel_direction',
    'brinesearch_numbered_route_base',
    'brinesearch_numbered_route_direction',
    'brinesearch_oh_county_code',
    'brinesearch_primary_saved_direction_section',
    'brinesearch_road_match_key',
    'brinesearch_road_name_core',
    'brinesearch_road_suffix_class',
    'brinesearch_route_step_kind',
    'brinesearch_slug',
    'brinesearch_state_code',
    'brinesearch_state_route_candidate',
    'cleanup_orphan_field_feed_images',
    'submit_pad',
    'submit_pad_server'
  ];
  owner_names text[] := array[
    'brinesearch_route_review_dashboard',
    'brinesearch_route_review_mark',
    'owner_editor_dashboard',
    'review_pad_submission',
    'road_manager_refresh_route_prep',
    'road_manager_route_prep_detail',
    'road_manager_route_prep_list',
    'road_manager_route_prep_set_review',
    'road_manager_route_prep_step_decision',
    'road_manager_route_prep_summary',
    'set_editor_role',
    'set_user_permissions',
    'verification_review_analysis',
    'verification_review_decide',
    'verification_review_detail',
    'verification_review_queue',
    'verification_review_summary'
  ];
  editor_names text[] := array[
    'editor_add_pad',
    'log_editor_client_error',
    'my_editor_dashboard',
    'pad_verification_get',
    'pad_verification_set'
  ];
  moderator_names text[] := array[
    'field_moderate_content',
    'field_moderation_queue',
    'moderate_field_content'
  ];
  authenticated_names text[] := array[
    'accept_field_terms',
    'claim_first_owner',
    'create_field_comment',
    'create_field_post',
    'ensure_field_profile',
    'field_delete_own_post',
    'field_feed_media_url_owned',
    'field_profile_can_post',
    'field_restore_own_post',
    'field_set_profile_active',
    'is_brinesearch_editor',
    'is_brinesearch_moderator',
    'is_brinesearch_owner',
    'brinesearch_user_email_verified',
    'field_feed_storage_within_quota',
    'my_editor_status',
    'register_editor_profile',
    'report_field_content',
    'vote_field_post'
  ];
  public_names text[] := array[
    'field_badge_for_user',
    'field_comments_list',
    'field_feed_list',
    'field_public_profile',
    'field_public_profile_posts',
    'pad_verification_public_status'
  ];
begin
  for r in
    select p.oid,p.proname
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and (
        p.proname=any(internal_names)
        or p.proname=any(owner_names)
        or p.proname=any(editor_names)
        or p.proname=any(moderator_names)
        or p.proname=any(authenticated_names)
        or p.proname=any(public_names)
      )
  loop
    execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);
    if r.proname=any(public_names) then
      execute format('grant execute on function %s to anon,authenticated,service_role',r.oid::regprocedure);
    elsif r.proname=any(owner_names)
       or r.proname=any(editor_names)
       or r.proname=any(moderator_names)
       or r.proname=any(authenticated_names) then
      execute format('grant execute on function %s to authenticated,service_role',r.oid::regprocedure);
    else
      execute format('grant execute on function %s to service_role',r.oid::regprocedure);
    end if;
  end loop;
end
$function_acl$;
