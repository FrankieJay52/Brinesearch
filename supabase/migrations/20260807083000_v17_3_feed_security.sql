-- BrineSearch V17.3 — Field Feed write hardening and abuse controls.
-- Interface role checks remain UX only; these database rules are authoritative.

create or replace function public.field_feed_media_url_owned(p_url text, p_owner uuid)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_url is null
      or p_url like (
        'https://wvxzqtoiwhrgovzddtvz.supabase.co/storage/v1/object/public/field-feed-images/'
        || p_owner::text || '/%'
      );
$$;

create or replace function public.validate_field_profile_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  moderator boolean := public.is_brinesearch_moderator(caller);
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  if new.user_id <> caller and not moderator then
    raise exception 'Profiles may only be created or changed by their owner';
  end if;

  new.display_name := btrim(regexp_replace(coalesce(new.display_name, ''), '\s+', ' ', 'g'));
  new.real_name := nullif(btrim(regexp_replace(coalesce(new.real_name, ''), '\s+', ' ', 'g')), '');
  new.username := nullif(lower(btrim(coalesce(new.username, ''))), '');
  new.company := nullif(btrim(regexp_replace(coalesce(new.company, ''), '\s+', ' ', 'g')), '');
  new.job_role := nullif(btrim(regexp_replace(coalesce(new.job_role, ''), '\s+', ' ', 'g')), '');
  new.bio := nullif(btrim(coalesce(new.bio, '')), '');

  if char_length(new.display_name) not between 3 and 80 then
    raise exception 'Display name must be 3–80 characters';
  end if;
  if new.company is not null and char_length(new.company) > 100 then
    raise exception 'Company name is too long';
  end if;
  if new.job_role is not null and char_length(new.job_role) > 80 then
    raise exception 'Job role is too long';
  end if;
  if new.bio is not null and char_length(new.bio) > 500 then
    raise exception 'Profile bio is too long';
  end if;
  if tg_op = 'INSERT' then
    if new.avatar_url is not null
       and not public.field_feed_media_url_owned(new.avatar_url, new.user_id) then
      raise exception 'Profile photo must come from the signed-in user storage folder';
    end if;
  elsif new.avatar_url is distinct from old.avatar_url then
    if new.avatar_url is not null
       and not public.field_feed_media_url_owned(new.avatar_url, new.user_id) then
      raise exception 'Profile photo must come from the signed-in user storage folder';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    if not moderator then
      new.status := 'active';
      new.reputation := 0;
      new.verified_company_rep := false;
      new.contributor_override := false;
      new.rules_strikes := 0;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_field_profile_write on public.field_profiles;
create trigger trg_validate_field_profile_write
before insert or update on public.field_profiles
for each row execute function public.validate_field_profile_write();

create or replace function public.validate_field_post_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  moderator boolean := public.is_brinesearch_moderator(caller);
  media_url text;
  normalized_body text;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;

  if tg_op = 'INSERT' then
    if new.author_id <> caller then
      raise exception 'Post author must match the signed-in user';
    end if;
    new.created_at := now();
    if not moderator then
      new.status := 'published';
      new.moderation_note := null;
      new.deleted_at := null;
      new.deleted_by := null;
    end if;
  elsif new.author_id is distinct from old.author_id then
    raise exception 'Post ownership cannot be changed';
  end if;

  new.body := btrim(regexp_replace(coalesce(new.body, ''), '[\t ]+', ' ', 'g'));
  new.company_tag := nullif(btrim(regexp_replace(coalesce(new.company_tag, ''), '\s+', ' ', 'g')), '');
  new.road_name := nullif(btrim(regexp_replace(coalesce(new.road_name, ''), '\s+', ' ', 'g')), '');
  new.image_urls := coalesce(new.image_urls, '{}'::text[]);
  new.updated_at := now();

  if char_length(new.body) not between 2 and 1200 then
    raise exception 'Post must be 2–1,200 characters';
  end if;
  if new.company_tag is not null and char_length(new.company_tag) > 100 then
    raise exception 'Company tag is too long';
  end if;
  if new.road_name is not null and char_length(new.road_name) > 160 then
    raise exception 'Road name is too long';
  end if;
  if cardinality(new.image_urls) > 4 then
    raise exception 'A Field Feed post may contain no more than four images';
  end if;
  if tg_op = 'INSERT' then
    foreach media_url in array new.image_urls loop
      if not public.field_feed_media_url_owned(media_url, new.author_id) then
        raise exception 'Post images must come from the author storage folder';
      end if;
    end loop;
  elsif new.image_urls is distinct from old.image_urls then
    foreach media_url in array new.image_urls loop
      if not public.field_feed_media_url_owned(media_url, new.author_id) then
        raise exception 'Post images must come from the author storage folder';
      end if;
    end loop;
  end if;

  if (new.latitude is null) <> (new.longitude is null) then
    raise exception 'Latitude and longitude must be supplied together';
  end if;
  if new.latitude is not null and (new.latitude < -90 or new.latitude > 90) then
    raise exception 'Invalid latitude';
  end if;
  if new.longitude is not null and (new.longitude < -180 or new.longitude > 180) then
    raise exception 'Invalid longitude';
  end if;

  if new.category = 'field_alert' then
    if tg_op = 'INSERT' then
      if new.expires_at is null then new.expires_at := now() + interval '48 hours'; end if;
      if new.expires_at <= now() or new.expires_at > now() + interval '72 hours' then
        raise exception 'Field alerts must expire within 72 hours';
      end if;
    elsif new.category is distinct from old.category or new.expires_at is distinct from old.expires_at then
      if new.expires_at is null then new.expires_at := now() + interval '48 hours'; end if;
      if new.expires_at <= now() or new.expires_at > now() + interval '72 hours' then
        raise exception 'Field alerts must expire within 72 hours';
      end if;
    end if;
  else
    new.expires_at := null;
  end if;

  if tg_op = 'INSERT' and not moderator then
    normalized_body := lower(regexp_replace(new.body, '\s+', ' ', 'g'));
    if exists (
      select 1 from public.field_posts p
      where p.author_id = caller
        and p.created_at > now() - interval '90 seconds'
        and lower(regexp_replace(btrim(p.body), '\s+', ' ', 'g')) = normalized_body
        and p.category = new.category
        and p.pad_id is not distinct from new.pad_id
    ) then
      raise exception 'This update was already posted. Wait before posting it again.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_field_post_write on public.field_posts;
create trigger trg_validate_field_post_write
before insert or update on public.field_posts
for each row execute function public.validate_field_post_write();

create or replace function public.validate_field_comment_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
  moderator boolean := public.is_brinesearch_moderator(caller);
  normalized_body text;
begin
  if caller is null then raise exception 'Authentication required'; end if;

  if tg_op = 'INSERT' then
    if new.author_id <> caller then raise exception 'Comment author must match the signed-in user'; end if;
    new.created_at := now();
    if not moderator then
      new.status := 'published';
      new.moderation_note := null;
    end if;
  elsif new.author_id is distinct from old.author_id or new.post_id is distinct from old.post_id then
    raise exception 'Comment ownership and post cannot be changed';
  end if;

  new.body := btrim(regexp_replace(coalesce(new.body, ''), '[\t ]+', ' ', 'g'));
  new.updated_at := now();
  if char_length(new.body) not between 1 and 600 then
    raise exception 'Comment must be 1–600 characters';
  end if;

  if tg_op = 'INSERT' and not moderator then
    normalized_body := lower(regexp_replace(new.body, '\s+', ' ', 'g'));
    if exists (
      select 1 from public.field_comments c
      where c.author_id = caller
        and c.post_id = new.post_id
        and c.created_at > now() - interval '30 seconds'
        and lower(regexp_replace(btrim(c.body), '\s+', ' ', 'g')) = normalized_body
    ) then
      raise exception 'This reply was already posted.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_field_comment_write on public.field_comments;
create trigger trg_validate_field_comment_write
before insert or update on public.field_comments
for each row execute function public.validate_field_comment_write();

create or replace function public.validate_field_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if new.reporter_id <> caller then raise exception 'Report owner must match the signed-in user'; end if;
  new.reason := lower(btrim(new.reason));
  new.details := nullif(btrim(coalesce(new.details, '')), '');
  if new.details is not null and char_length(new.details) > 2000 then
    raise exception 'Report details are too long';
  end if;
  new.status := 'open';
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_field_report_insert on public.field_reports;
create trigger trg_validate_field_report_insert
before insert on public.field_reports
for each row execute function public.validate_field_report_insert();

create unique index if not exists field_reports_one_open_post_per_user
on public.field_reports(reporter_id, post_id)
where post_id is not null and status = 'open';

create unique index if not exists field_reports_one_open_comment_per_user
on public.field_reports(reporter_id, comment_id)
where comment_id is not null and status = 'open';

create index if not exists field_posts_public_feed_idx
on public.field_posts(status, created_at desc)
where deleted_at is null;

create index if not exists field_posts_pad_feed_idx
on public.field_posts(pad_id, created_at desc)
where pad_id is not null and deleted_at is null;

create index if not exists field_comments_post_feed_idx
on public.field_comments(post_id, status, created_at);

create index if not exists field_reports_open_queue_idx
on public.field_reports(status, created_at)
where status = 'open';

create or replace function public.enforce_field_feed_insert_rate_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  daily_count integer;
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required'; end if;

  if tg_table_name = 'field_posts' then
    select count(*) into recent_count from public.field_posts where author_id=caller and created_at>now()-interval '10 minutes';
    select count(*) into daily_count from public.field_posts where author_id=caller and created_at>now()-interval '24 hours';
    if recent_count >= 4 or daily_count >= 20 then raise exception 'Post limit reached. Try again later.'; end if;
  elsif tg_table_name = 'field_comments' then
    select count(*) into recent_count from public.field_comments where author_id=caller and created_at>now()-interval '10 minutes';
    select count(*) into daily_count from public.field_comments where author_id=caller and created_at>now()-interval '24 hours';
    if recent_count >= 15 or daily_count >= 80 then raise exception 'Comment limit reached. Try again later.'; end if;
  elsif tg_table_name = 'field_reports' then
    select count(*) into recent_count from public.field_reports where reporter_id=caller and created_at>now()-interval '1 hour';
    select count(*) into daily_count from public.field_reports where reporter_id=caller and created_at>now()-interval '24 hours';
    if recent_count >= 5 or daily_count >= 15 then raise exception 'Report limit reached. Try again later.'; end if;
  elsif tg_table_name = 'field_post_votes' then
    select count(*) into recent_count from public.field_post_votes where user_id=caller and created_at>now()-interval '10 minutes';
    select count(*) into daily_count from public.field_post_votes where user_id=caller and created_at>now()-interval '24 hours';
    if recent_count >= 50 or daily_count >= 300 then raise exception 'Vote limit reached. Try again later.'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_field_post_reply()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  recipient uuid;
  actor_name text;
  post_excerpt text;
begin
  select p.author_id, left(regexp_replace(btrim(p.body), '\s+', ' ', 'g'), 120)
    into recipient, post_excerpt
  from public.field_posts p
  where p.id = new.post_id and p.deleted_at is null;

  if recipient is null or recipient = new.author_id then return new; end if;

  select coalesce(nullif(btrim(fp.display_name), ''), 'Someone')
    into actor_name
  from public.field_profiles fp
  where fp.user_id = new.author_id;

  insert into public.field_notifications(user_id, actor_id, kind, title, body, post_id, comment_id)
  values (
    recipient,
    new.author_id,
    'reply',
    'New reply on your Field Feed post',
    coalesce(actor_name, 'Someone') || ' replied to “' || coalesce(post_excerpt, 'your post') || '”.',
    new.post_id,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_field_post_reply on public.field_comments;
create trigger trg_notify_field_post_reply
after insert on public.field_comments
for each row when (new.status = 'published')
execute function public.notify_field_post_reply();

create or replace function public.notify_editor_access_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  title_text text;
  body_text text;
begin
  if new.role is not distinct from old.role
     and new.permissions is not distinct from old.permissions then
    return new;
  end if;

  title_text := 'BrineSearch access updated';
  body_text := case
    when new.role = 'suspended' then 'Your BrineSearch editing access has been suspended.'
    when new.role = 'pending' then 'Your BrineSearch editing access is pending review.'
    else 'Your BrineSearch access is now ' || initcap(replace(new.role, '_', ' ')) || '.'
  end;

  insert into public.field_notifications(user_id, actor_id, kind, title, body)
  values (new.user_id, auth.uid(), 'access', title_text, body_text);
  return new;
end;
$$;

drop trigger if exists trg_notify_editor_access_change on public.editor_accounts;
create trigger trg_notify_editor_access_change
after update of role, permissions on public.editor_accounts
for each row execute function public.notify_editor_access_change();

create index if not exists field_notifications_user_unread_idx
on public.field_notifications(user_id, created_at desc)
where read_at is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.field_notifications'::regclass
      and conname = 'field_notifications_title_length_check'
  ) then
    alter table public.field_notifications
      add constraint field_notifications_title_length_check
      check (char_length(btrim(title)) between 1 and 120);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.field_notifications'::regclass
      and conname = 'field_notifications_body_length_check'
  ) then
    alter table public.field_notifications
      add constraint field_notifications_body_length_check
      check (body is null or char_length(body) <= 500);
  end if;
end;
$$;

drop policy if exists "System creates field notifications" on public.field_notifications;
drop policy if exists "Moderators create field notifications" on public.field_notifications;
create policy "Moderators create field notifications"
on public.field_notifications for insert to authenticated
with check (public.is_brinesearch_moderator(auth.uid()));
