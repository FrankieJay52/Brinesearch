-- GitHub #97 — post-cutover live smoke.
-- This suite never authorizes cutover. It runs only after the irreversible
-- release switch and proves the public Google projection/dispatcher remain
-- bound to the exact immutable pre-cutover report and ready current receipts.
begin transaction read only;
set local statement_timeout='15min';
set local lock_timeout='5s';

do $issue97_post_cutover$
declare
  v_pad_scope integer;
  v_ready integer;
  v_held integer;
  v_stale integer;
  v_public integer;
  v_missing integer;
  v_report_digest text;
  v_report record;
  v_cologie uuid;
begin
  if not public.brinesearch_issue97_cutover_active() then
    raise exception '#97 post-cutover smoke requires cutover ACTIVE';
  end if;

  select review_details->>'verification_report_digest' into v_report_digest
  from public.brinesearch_issue97_release_state where singleton;
  if coalesce(v_report_digest,'')!~'^[0-9a-f]{32}$'
     or not private_verification.brinesearch_issue97_verification_report_integrity(v_report_digest) then
    raise exception '#97 post-cutover release state is not bound to an intact persisted verification report';
  end if;
  select * into strict v_report
  from private_verification.brinesearch_issue97_verification_reports
  where report_digest=v_report_digest;
  if exists(select 1 from unnest(array[
      'thrush','bellaire','leonard','cr26','possum',
      'cologie','repeated_road','shared_segment','long_chunk','parallel_shortcut'
    ]) key where coalesce((v_report.pinned_fixture_results->>key)::boolean,false) is not true) then
    raise exception '#97 post-cutover persisted report lost a required topology/product fixture';
  end if;

  -- Match the production all-pad Google refresh denominator exactly. record_type
  -- is not the list-only authority; current production includes list-only disposal
  -- records whose record_type is still 'disposal'.
  select count(*)::integer into v_pad_scope
  from public.pads p
  where coalesce(p.list_only,false)=false;
  if (select member_count from private_verification.brinesearch_issue97_release_manifests
      where id=v_report.route_eligibility_manifest_id)<>v_pad_scope then
    raise exception '#97 post-cutover route eligibility denominator differs from live non-list-only pad scope';
  end if;

  select count(*) filter(where receipt.status='ready')::integer,
    count(*) filter(where receipt.status='held')::integer,
    count(*) filter(where receipt.status='stale')::integer
  into v_ready,v_held,v_stale
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads p on p.id=receipt.pad_id
  where coalesce(p.list_only,false)=false;

  if v_ready+v_held+v_stale<>v_pad_scope or v_stale<>0 then
    raise exception '#97 post-cutover Google receipt accounting incomplete: scope %, ready %, held %, stale %',
      v_pad_scope,v_ready,v_held,v_stale;
  end if;

  if exists(
    select 1
    from public.pads p
    where coalesce(p.list_only,false)=false
      and not exists(
        select 1 from private_verification.brinesearch_google_route_receipts_issue97 receipt
        where receipt.pad_id=p.id and receipt.status in ('ready','held')
      )
  ) then
    raise exception '#97 post-cutover has a current non-list-only pad without one ready-or-held receipt';
  end if;

  select count(*)::integer into v_public
  from public.brinesearch_driver_google_routes_public;
  if v_public<>v_ready then
    raise exception '#97 post-cutover public Google projection count % differs from ready receipt count %',
      v_public,v_ready;
  end if;

  select count(*)::integer into v_missing
  from private_verification.brinesearch_google_route_receipts_issue97 receipt
  join public.pads p on p.id=receipt.pad_id
  where coalesce(p.list_only,false)=false
    and receipt.status='ready'
    and (
      not public.brinesearch_issue97_google_route_current(receipt.pad_id)
      or not exists(select 1 from public.brinesearch_driver_google_routes_public public_route
          where public_route.pad_id=receipt.pad_id
            and public_route.route_revision=receipt.route_revision)
    );
  if v_missing<>0 then
    raise exception '#97 post-cutover has % ready Google receipts that are not current/public',v_missing;
  end if;

  if exists(select 1 from public.brinesearch_driver_google_routes_public public_route
      where not public.brinesearch_issue97_google_route_current(public_route.pad_id)) then
    raise exception '#97 post-cutover public projection exposed a non-current Google route';
  end if;

  -- Cologie is the pinned real-world coordinate-only route proof. It must be
  -- genuinely ready/current/public after cutover; an explicit hold is not a pass.
  select id into strict v_cologie from public.pads where legacy_id='ascent--cologie';
  if not public.brinesearch_issue97_google_route_current(v_cologie)
     or not exists(select 1 from private_verification.brinesearch_google_route_receipts_issue97 receipt
        where receipt.pad_id=v_cologie and receipt.status='ready')
     or not exists(select 1 from public.brinesearch_driver_google_routes_public route
        where route.pad_id=v_cologie
          and pg_catalog.jsonb_typeof(route.manifest->'points')='array'
          and pg_catalog.jsonb_array_length(route.manifest->'points')>=2) then
    raise exception '#97 post-cutover Cologie coordinate-only live route is not ready/current/public';
  end if;

  if not exists(select 1 from public.pads p
      where coalesce(p.list_only,false)=false
        and p.latitude is not null and p.longitude is not null) then
    raise exception '#97 post-cutover has no exact-GPS pad available for live route smoke';
  end if;
end
$issue97_post_cutover$;

rollback;
