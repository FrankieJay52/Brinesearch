  null::text as research_notes,
  p.number_of_road_steps,
  '[]'::jsonb as source_workbook_rows,
  '[]'::jsonb as alternate_locations,
  null::text as last_updated_by,
  null::timestamptz as last_updated_date,
  null::text as audit_source,
  null::boolean as audit_verified,
  jsonb_strip_nulls(jsonb_build_object(
    '_public_summary',false,
    'official_pad_record',p.extra_data->'official_pad_record',
    'official_well_records',p.extra_data->'official_well_records',
    'api_verification_summary',p.extra_data->'api_verification_summary',
    'official_operator',p.extra_data->'official_operator',
    'official_status',p.extra_data->'official_status',
    'turn_by_turn_route',p.extra_data->'turn_by_turn_route',
    'field_address_confirmed',p.extra_data->'field_address_confirmed',
    'field_pad_alias',p.extra_data->'field_pad_alias',
    'field_property_number_observation',p.extra_data->'field_property_number_observation',
    'field_sign_api_as_displayed',p.extra_data->'field_sign_api_as_displayed',
    'field_sign_section',p.extra_data->'field_sign_section',
    'field_sign_township',p.extra_data->'field_sign_township',
    'field_well_sign_observation',p.extra_data->'field_well_sign_observation',
    'section',p.extra_data->'section',
    'site_operator_sign',p.extra_data->'site_operator_sign',
    'spill_contact',p.extra_data->'spill_contact'
  )) as extra_data,
  null::uuid as created_by,
  null::uuid as updated_by,
  p.created_at,
  p.updated_at,
  p.directions_clear,
  null::text as directions_clear_method,
  p.directions_clear_updated_at,
  null::uuid as directions_clear_updated_by,
  p.well_entries
from public.pads p;
comment on view public.public_pad_directory_summary is
  'Safe public search/list projection. Internal audit, source workbook, owner and candidate metadata are excluded.';
comment on view public.public_pad_detail is
  'Safe public selected-pad projection. Internal audit, source workbook, owner, candidate and editor attribution metadata are excluded.';
revoke all privileges on public.pads from public,anon,authenticated;
grant select,insert,update,delete on public.pads to authenticated;
drop policy if exists "Public can read pads" on public.pads;
drop policy if exists "Approved editors can read full pads" on public.pads;
create policy "Approved editors can read full pads"
on public.pads for select to authenticated
using (public.is_brinesearch_editor(auth.uid()));
revoke all privileges on public.public_pad_directory_summary from public,anon,authenticated;
revoke all privileges on public.public_pad_detail from public,anon,authenticated;
grant select on public.public_pad_directory_summary to anon,authenticated;
grant select on public.public_pad_detail to anon,authenticated;
revoke all privileges on public.brinesearch_roads from public,anon,authenticated;
grant select,insert,update,delete on public.brinesearch_roads to authenticated;
drop policy if exists roads_public_read on public.brinesearch_roads;
drop policy if exists roads_owner_read on public.brinesearch_roads;
create policy roads_owner_read on public.brinesearch_roads
for select to authenticated
using (public.is_brinesearch_owner(auth.uid()));
revoke all privileges on public.brinesearch_pad_roads from public,anon,authenticated;
grant select,insert,update,delete on public.brinesearch_pad_roads to authenticated;
drop policy if exists pad_roads_public_read on public.brinesearch_pad_roads;
drop policy if exists pad_roads_editor_read on public.brinesearch_pad_roads;
create policy pad_roads_editor_read on public.brinesearch_pad_roads
for select to authenticated
using (public.is_brinesearch_editor(auth.uid()));
revoke all privileges on
  public.brinesearch_route_prep,
  public.brinesearch_route_prep_steps,
  public.brinesearch_route_reviews,
  public.brinesearch_route_review_segments
from public,anon,authenticated;
grant select,insert,update,delete on
  public.brinesearch_route_prep,
  public.brinesearch_route_prep_steps,
  public.brinesearch_route_reviews,
  public.brinesearch_route_review_segments
to authenticated;
revoke all privileges on public.brinesearch_route_prep_summary from public,anon,authenticated;
revoke all privileges on
  public.brinesearch_ascent_direction_work,
  public.brinesearch_odot_context_resolutions,
  public.brinesearch_odot_road_catalog,
  public.brinesearch_odot_step_matches,
  public.pad_submissions,
  public.v17_3_source_provenance_patch_transfer
from public,anon,authenticated;
revoke all privileges on public.editor_accounts from public,anon,authenticated;
grant select,update on public.editor_accounts to authenticated;
revoke all privileges on public.editor_activity_log from public,anon,authenticated;
grant select on public.editor_activity_log to authenticated;
revoke all privileges on public.pad_edit_history from public,anon,authenticated;
grant select on public.pad_edit_history to authenticated;
revoke all privileges on public.pad_verification_status,public.pad_verification_history
from public,anon,authenticated;
grant select on public.pad_verification_status,public.pad_verification_history to authenticated;
drop policy if exists "Public can read pad verification" on public.pad_verification_status;
drop policy if exists "Public can read pad verification history" on public.pad_verification_history;
drop policy if exists "Editors can read pad verification" on public.pad_verification_status;
drop policy if exists "Editors can read pad verification history" on public.pad_verification_history;
create policy "Editors can read pad verification"
on public.pad_verification_status for select to authenticated
using (public.is_brinesearch_editor(auth.uid()));
create policy "Editors can read pad verification history"
on public.pad_verification_history for select to authenticated
using (public.is_brinesearch_editor(auth.uid()));
revoke all privileges on
  public.field_comments,
  public.field_moderation_actions,
  public.field_notifications,
  public.field_pad_follows,
  public.field_post_votes,
  public.field_posts,
  public.field_profiles,
  public.field_reports,
  public.field_terms_acceptance
from public,anon,authenticated;
grant select,insert,update on public.field_profiles to authenticated;
grant select,insert,update on public.field_posts to authenticated;
grant select,insert,update on public.field_comments to authenticated;
grant select,insert,update,delete on public.field_post_votes to authenticated;
grant select,insert,update on public.field_reports to authenticated;
grant select,insert on public.field_terms_acceptance to authenticated;
grant select,insert,update on public.field_notifications to authenticated;
grant select,insert on public.field_moderation_actions to authenticated;
grant select,insert,update,delete on public.field_pad_follows to authenticated;
drop policy if exists "Public reads published field comments" on public.field_comments;
create policy "Authenticated reads published field comments"
on public.field_comments for select to authenticated
using (status='published' or author_id=auth.uid() or public.is_brinesearch_moderator(auth.uid()));
drop policy if exists "Public reads field votes" on public.field_post_votes;
create policy "Authenticated reads field votes"
on public.field_post_votes for select to authenticated
using (true);
drop policy if exists "Public reads published field posts" on public.field_posts;
create policy "Authenticated reads published field posts"
on public.field_posts for select to authenticated
using (status='published' or author_id=auth.uid() or public.is_brinesearch_moderator(auth.uid()));
drop policy if exists "Public reads active field profiles" on public.field_profiles;
create policy "Authenticated reads active field profiles"
on public.field_profiles for select to authenticated
using (status='active' or user_id=auth.uid() or public.is_brinesearch_moderator(auth.uid()));
drop policy if exists "Public read temporary V17.3 source provenance patch"
on public.v17_3_source_provenance_patch_transfer;
revoke all privileges on all sequences in schema public from public,anon;
revoke all privileges on
  public.brinesearch_route_review_segments_id_seq,
  public.editor_activity_log_id_seq,
  public.pad_edit_history_id_seq
from authenticated;
grant usage,select on public.field_moderation_actions_id_seq to authenticated;
create or replace function public.field_feed_storage_within_quota()
returns boolean
language sql
stable
