-- GitHub Issue #101 — Owner-only, privacy-safe visitor analytics.
--
-- Privacy contract:
-- * no raw IP addresses, full user-agent strings, full referrer URLs, query strings,
--   account/user IDs, names, email addresses, GPS coordinates, or browser fingerprints;
-- * a server-only Edge Function reduces the trusted gateway address to an IPv4 /24
--   or IPv6 /48 prefix, HMACs that network prefix with a dedicated secret, and sends
--   only pseudonymous/coarse fields to this RPC;
-- * raw pseudonymous events are bounded to 90 days by opportunistic pruning on both
--   recording and Owner reads;
-- * the private table is never directly readable/writable by browser or service roles.

create table private_verification.owner_visitor_events_issue101 (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default statement_timestamp(),
  bucket_start timestamptz not null,
  session_id uuid not null,
  network_hmac text not null,
  network_prefix text not null,
  visitor_code text not null,
  route text not null,
  referrer_host text,
  country_code text,
  device_family text not null,
  browser_family text not null,
  os_family text not null,
  constraint owner_visitor_events_issue101_hmac_check
    check (network_hmac ~ '^[0-9a-f]{64}$'),
  constraint owner_visitor_events_issue101_prefix_check
    check (
      (
        network_prefix ~ '^[0-9]{1,3}(\.[0-9]{1,3}){2}\.0/24$'
        and char_length(network_prefix) <= 18
        and family(network_prefix::cidr) = 4
        and masklen(network_prefix::cidr) = 24
      )
      or
      (
        network_prefix ~ '^[0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f]{1,4}::/48$'
        and char_length(network_prefix) <= 43
        and family(network_prefix::cidr) = 6
        and masklen(network_prefix::cidr) = 48
      )
    ),
  constraint owner_visitor_events_issue101_code_check
    check (visitor_code ~ '^V-[0-9A-F]{10}$'),
  constraint owner_visitor_events_issue101_route_check
    check (char_length(route) between 1 and 180 and route ~ '^/[A-Za-z0-9_./:-]*$'),
  constraint owner_visitor_events_issue101_referrer_check
    check (referrer_host is null or (char_length(referrer_host) between 1 and 253 and referrer_host ~ '^[a-z0-9.-]+$')),
  constraint owner_visitor_events_issue101_country_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint owner_visitor_events_issue101_device_check
    check (device_family in ('mobile','tablet','desktop','other')),
  constraint owner_visitor_events_issue101_browser_check
    check (browser_family in ('Safari','Chrome','Edge','Firefox','Samsung Internet','Bot','Other')),
  constraint owner_visitor_events_issue101_os_check
    check (os_family in ('iOS','Android','Windows','macOS','ChromeOS','Linux','Other')),
  constraint owner_visitor_events_issue101_bucket_check
    check (bucket_start <= occurred_at and bucket_start > occurred_at - interval '6 minutes'),
  constraint owner_visitor_events_issue101_dedupe
    unique (session_id, network_hmac, route, bucket_start)
);

alter table private_verification.owner_visitor_events_issue101 enable row level security;
alter table private_verification.owner_visitor_events_issue101 force row level security;

-- No RLS policies are intentional. Only SECURITY DEFINER RPCs owned by postgres may
-- access the table. The UUID primary key deliberately avoids an associated sequence.
revoke all on table private_verification.owner_visitor_events_issue101
  from public, anon, authenticated, service_role;

create index owner_visitor_events_issue101_time_idx
  on private_verification.owner_visitor_events_issue101 (occurred_at desc);
create index owner_visitor_events_issue101_route_time_idx
  on private_verification.owner_visitor_events_issue101 (route, occurred_at desc);
create index owner_visitor_events_issue101_network_time_idx
  on private_verification.owner_visitor_events_issue101 (network_hmac, occurred_at desc);
create index owner_visitor_events_issue101_session_time_idx
  on private_verification.owner_visitor_events_issue101 (session_id, occurred_at desc);

create or replace function public.record_visitor_event_issue101(
  p_session_id uuid,
  p_network_hmac text,
  p_network_prefix text,
  p_visitor_code text,
  p_route text,
  p_referrer_host text default null,
  p_country_code text default null,
  p_device_family text default 'other',
  p_browser_family text default 'Other',
  p_os_family text default 'Other'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_jwt_role text;
  v_now timestamptz := statement_timestamp();
  v_bucket_start timestamptz;
  v_inserted integer := 0;
begin
  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  if v_jwt_role is distinct from 'service_role' then
    return jsonb_build_object('accepted', false);
  end if;

  if p_session_id is null
    or p_network_hmac is null or p_network_hmac !~ '^[0-9a-f]{64}$'
    or p_network_prefix is null or char_length(p_network_prefix) > 43
    or not (
      p_network_prefix ~ '^[0-9]{1,3}(\.[0-9]{1,3}){2}\.0/24$'
      or p_network_prefix ~ '^[0-9a-f]{1,4}:[0-9a-f]{1,4}:[0-9a-f]{1,4}::/48$'
    )
    or p_visitor_code is null or p_visitor_code !~ '^V-[0-9A-F]{10}$'
    or p_route is null or char_length(p_route) not between 1 and 180 or p_route !~ '^/[A-Za-z0-9_./:-]*$'
    or (p_referrer_host is not null and (char_length(p_referrer_host) not between 1 and 253 or p_referrer_host !~ '^[a-z0-9.-]+$'))
    or (p_country_code is not null and p_country_code !~ '^[A-Z]{2}$')
    or p_device_family is null or p_device_family not in ('mobile','tablet','desktop','other')
    or p_browser_family is null or p_browser_family not in ('Safari','Chrome','Edge','Firefox','Samsung Internet','Bot','Other')
    or p_os_family is null or p_os_family not in ('iOS','Android','Windows','macOS','ChromeOS','Linux','Other') then
    return jsonb_build_object('accepted', false);
  end if;

  -- Regexes bound the shape; cidr parsing verifies actual address ranges and masks.
  -- Invalid casts are caught by the generic rejection handler below.
  if not (
    (family(p_network_prefix::cidr) = 4 and masklen(p_network_prefix::cidr) = 24)
    or
    (family(p_network_prefix::cidr) = 6 and masklen(p_network_prefix::cidr) = 48)
  ) then
    return jsonb_build_object('accepted', false);
  end if;

  -- Serialize writers for one pseudonymous network. This makes both the rate limit
  -- and the unique bucket constraint race-safe without retaining any raw address.
  perform pg_advisory_xact_lock(hashtextextended(p_network_hmac, 101));

  -- Bounded opportunistic retention cleanup. At most 500 expired rows are removed
  -- in any beacon transaction, so cleanup cannot turn a public request into a large
  -- unbounded delete.
  with expired as (
    select ctid
    from private_verification.owner_visitor_events_issue101
    where occurred_at < v_now - interval '90 days'
    order by occurred_at
    limit 500
  )
  delete from private_verification.owner_visitor_events_issue101 e
  using expired x
  where e.ctid = x.ctid;

  -- Conservative abuse ceiling. Normal navigation is additionally deduplicated to
  -- one identical session/network/route event per five-minute server bucket.
  if (
    select count(*)
    from private_verification.owner_visitor_events_issue101
    where network_hmac = p_network_hmac
      and occurred_at >= v_now - interval '1 hour'
  ) >= 300
  or (
    select count(*)
    from private_verification.owner_visitor_events_issue101
    where network_hmac = p_network_hmac
      and occurred_at >= v_now - interval '24 hours'
  ) >= 2000 then
    return jsonb_build_object('accepted', false);
  end if;

  v_bucket_start := date_bin(
    interval '5 minutes',
    v_now,
    timestamptz '2001-01-01 00:00:00+00'
  );

  insert into private_verification.owner_visitor_events_issue101 (
    occurred_at,
    bucket_start,
    session_id,
    network_hmac,
    network_prefix,
    visitor_code,
    route,
    referrer_host,
    country_code,
    device_family,
    browser_family,
    os_family
  ) values (
    v_now,
    v_bucket_start,
    p_session_id,
    p_network_hmac,
    p_network_prefix,
    p_visitor_code,
    p_route,
    p_referrer_host,
    p_country_code,
    p_device_family,
    p_browser_family,
    p_os_family
  )
  on conflict on constraint owner_visitor_events_issue101_dedupe do nothing;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object('accepted', v_inserted = 1);
exception
  when others then
    -- Fixed-purpose beacon callers never need database details. Internal failures
    -- are collapsed to the same rejected shape and are not allowed to expose data.
    return jsonb_build_object('accepted', false);
end;
$function$;

revoke all on function public.record_visitor_event_issue101(
  uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.record_visitor_event_issue101(
  uuid, text, text, text, text, text, text, text, text, text
) to service_role;

create or replace function public.owner_visitor_analytics_issue101(
  p_start_date date default null,
  p_end_date date default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid;
  v_today date;
  v_start_date date;
  v_end_date date;
  v_start_ts timestamptz;
  v_end_exclusive timestamptz;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
  v_7d_start timestamptz;
  v_30d_start timestamptz;
  v_limit integer;
  v_offset integer;
  v_summary jsonb;
  v_daily jsonb;
  v_routes jsonb;
  v_referrers jsonb;
  v_devices jsonb;
  v_browsers jsonb;
  v_systems jsonb;
  v_countries jsonb;
  v_recent jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null or public.is_brinesearch_owner(v_uid) is false then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  v_today := (statement_timestamp() at time zone 'America/New_York')::date;
  v_end_date := least(coalesce(p_end_date, v_today), v_today);
  v_start_date := coalesce(p_start_date, v_end_date - 6);
  if v_start_date > v_end_date then
    v_start_date := v_end_date;
  end if;
  v_start_date := greatest(v_start_date, v_end_date - 89);
  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset := greatest(0, least(coalesce(p_offset, 0), 5000));

  v_start_ts := v_start_date::timestamp at time zone 'America/New_York';
  v_end_exclusive := (v_end_date + 1)::timestamp at time zone 'America/New_York';
  v_today_start := v_today::timestamp at time zone 'America/New_York';
  v_tomorrow_start := (v_today + 1)::timestamp at time zone 'America/New_York';
  v_7d_start := (v_today - 6)::timestamp at time zone 'America/New_York';
  v_30d_start := (v_today - 29)::timestamp at time zone 'America/New_York';

  -- A dashboard read also performs one bounded cleanup batch. The 90-day cutoff is
  -- repeated in all reporting filters so expired rows can never appear in results.
  with expired as (
    select ctid
    from private_verification.owner_visitor_events_issue101
    where occurred_at < statement_timestamp() - interval '90 days'
    order by occurred_at
    limit 500
  )
  delete from private_verification.owner_visitor_events_issue101 e
  using expired x
  where e.ctid = x.ctid;

  with retained as (
    select *
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= statement_timestamp() - interval '90 days'
  ), selected_sessions as (
    select network_hmac, session_id, min(occurred_at) as session_start
    from retained
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
    group by network_hmac, session_id
  ), classified_sessions as (
    select s.*,
      not exists (
        select 1
        from retained prior
        where prior.network_hmac = s.network_hmac
          and prior.occurred_at < s.session_start
      ) as is_new
    from selected_sessions s
  ), counts as (
    select
      count(*) filter (where occurred_at >= v_today_start and occurred_at < v_tomorrow_start) as visits_today,
      count(*) filter (where occurred_at >= v_7d_start and occurred_at < v_tomorrow_start) as visits_7d,
      count(*) filter (where occurred_at >= v_30d_start and occurred_at < v_tomorrow_start) as visits_30d,
      count(*) filter (where occurred_at >= v_start_ts and occurred_at < v_end_exclusive) as selected_visits,
      count(distinct network_hmac) filter (where occurred_at >= v_start_ts and occurred_at < v_end_exclusive) as estimated_unique_networks
    from retained
  ), session_counts as (
    select
      count(*) as sessions,
      count(*) filter (where is_new) as new_sessions,
      count(*) filter (where not is_new) as returning_sessions
    from classified_sessions
  )
  select jsonb_build_object(
    'start_date', v_start_date,
    'end_date', v_end_date,
    'visits_today', coalesce(c.visits_today, 0),
    'visits_7d', coalesce(c.visits_7d, 0),
    'visits_30d', coalesce(c.visits_30d, 0),
    'selected_visits', coalesce(c.selected_visits, 0),
    'estimated_unique_networks', coalesce(c.estimated_unique_networks, 0),
    'sessions', coalesce(s.sessions, 0),
    'new_sessions', coalesce(s.new_sessions, 0),
    'returning_sessions', coalesce(s.returning_sessions, 0),
    'recent_total', (
      select count(*)
      from retained
      where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
    )
  ) into v_summary
  from counts c cross join session_counts s;

  with days as (
    select generate_series(v_start_date, v_end_date, interval '1 day')::date as day
  ), events as (
    select (occurred_at at time zone 'America/New_York')::date as day,
           count(*) as visits,
           count(distinct network_hmac) as estimated_unique_networks,
           count(distinct (network_hmac, session_id)) as sessions
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts
      and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'visits', coalesce(e.visits, 0),
    'estimated_unique_networks', coalesce(e.estimated_unique_networks, 0),
    'sessions', coalesce(e.sessions, 0)
  ) order by d.day), '[]'::jsonb)
  into v_daily
  from days d left join events e using (day);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc, x.route), '[]'::jsonb)
  into v_routes
  from (
    select route, count(*) as visits, count(distinct network_hmac) as estimated_unique_networks
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    group by route
    order by visits desc, route
    limit 20
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc, x.referrer), '[]'::jsonb)
  into v_referrers
  from (
    select coalesce(referrer_host, 'Direct / unavailable') as referrer,
           count(*) as visits,
           count(distinct network_hmac) as estimated_unique_networks
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    group by coalesce(referrer_host, 'Direct / unavailable')
    order by visits desc, referrer
    limit 20
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc, x.device_family), '[]'::jsonb)
  into v_devices
  from (
    select device_family, count(*) as visits
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    group by device_family
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc, x.browser_family), '[]'::jsonb)
  into v_browsers
  from (
    select browser_family, count(*) as visits
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    group by browser_family
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc, x.os_family), '[]'::jsonb)
  into v_systems
  from (
    select os_family, count(*) as visits
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    group by os_family
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc, x.country), '[]'::jsonb)
  into v_countries
  from (
    select coalesce(country_code, 'Unknown') as country, count(*) as visits
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    group by coalesce(country_code, 'Unknown')
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'occurred_at', x.occurred_at,
    'route', x.route,
    'network_prefix', x.network_prefix,
    'visitor_code', x.visitor_code,
    'country_code', x.country_code,
    'device_family', x.device_family,
    'browser_family', x.browser_family,
    'os_family', x.os_family,
    'referrer_host', x.referrer_host
  ) order by x.occurred_at desc, x.id), '[]'::jsonb)
  into v_recent
  from (
    select id, occurred_at, route, network_prefix, visitor_code, country_code,
           device_family, browser_family, os_family, referrer_host
    from private_verification.owner_visitor_events_issue101
    where occurred_at >= v_start_ts and occurred_at < v_end_exclusive
      and occurred_at >= statement_timestamp() - interval '90 days'
    order by occurred_at desc, id
    limit v_limit offset v_offset
  ) x;

  return jsonb_build_object(
    'summary', v_summary,
    'daily', v_daily,
    'top_routes', v_routes,
    'top_referrers', v_referrers,
    'devices', v_devices,
    'browsers', v_browsers,
    'operating_systems', v_systems,
    'countries', v_countries,
    'recent', v_recent,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

revoke all on function public.owner_visitor_analytics_issue101(date, date, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.owner_visitor_analytics_issue101(date, date, integer, integer)
  to authenticated;

comment on table private_verification.owner_visitor_events_issue101 is
  'Issue #101 pseudonymous visitor events: no raw IP, full user agent, full referrer URL, account identity, or GPS; 90-day bounded retention.';
comment on function public.record_visitor_event_issue101(uuid, text, text, text, text, text, text, text, text, text) is
  'Issue #101 service-role-only fixed-purpose visitor event recorder. Direct table access remains revoked.';
comment on function public.owner_visitor_analytics_issue101(date, date, integer, integer) is
  'Issue #101 authenticated Owner dashboard. Database Owner check is authoritative; full network HMAC values are never returned.';