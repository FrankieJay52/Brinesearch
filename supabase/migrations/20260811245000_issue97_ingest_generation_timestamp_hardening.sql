-- GitHub #97 — source-ingest generation timestamp hardening.
--
-- Production Athens rehearsal exposed a PostgreSQL transaction-clock mismatch:
-- source rows use now()/transaction_timestamp() while ingest_runs.started_at used
-- clock_timestamp(). Inside one long source-scope transaction that made every
-- freshly ingested row look older than the run and finalization immediately
-- retired the same rows it had just loaded.
--
-- Treat started_at as the generation cutoff timestamp, so it must use the same
-- transaction timestamp as all current OH/WV/PA source writes. Preserve the true
-- wall-clock start separately in details for audit/debugging. Terminal run time
-- is wall clock and a CHECK prevents impossible completed_at < started_at rows.

create or replace function public.brinesearch_issue97_begin_ingest(
  p_source_key text,
  p_county_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_source_key,'')));
  v_county text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_county_code,'')));
  v_dataset record;
  v_run_id uuid;
  v_started_at timestamptz:=pg_catalog.transaction_timestamp();
  v_wall_started_at timestamptz:=pg_catalog.clock_timestamp();
begin
  select id,state_code,topology_role into v_dataset
  from public.brinesearch_road_source_datasets
  where source_key=v_source and active;
  if not found then
    raise exception 'Unknown or inactive authoritative source' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.brinesearch_road_graph_counties c
    where c.state_code=v_dataset.state_code and c.county_code=v_county and c.active
  ) then
    raise exception 'County is outside the source footprint' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.brinesearch_road_source_dataset_counties scope
    where scope.dataset_id=v_dataset.id and scope.state_code=v_dataset.state_code
      and scope.county_code=v_county and scope.active and scope.ingest_enabled
  ) then
    raise exception 'Authoritative source is not enabled for this county' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('brinesearch:issue97:ingest:'||v_dataset.id::text||':'||v_county)
  );
  update public.brinesearch_road_source_ingest_runs
  set status='superseded',completed_at=pg_catalog.clock_timestamp(),
      details=details||pg_catalog.jsonb_build_object(
        'superseded_by_new_run',true,
        'terminal_clock','clock_timestamp'
      )
  where dataset_id=v_dataset.id and state_code=v_dataset.state_code
    and county_code=v_county and status='loading';

  insert into public.brinesearch_road_source_ingest_runs(
    dataset_id,state_code,county_code,status,started_at,details
  ) values (
    v_dataset.id,v_dataset.state_code,v_county,'loading',v_started_at,
    pg_catalog.jsonb_build_object(
      'source_key',v_source,
      'topology_role',v_dataset.topology_role,
      'coverage_contract','all deterministic OBJECTID pages must complete before finalization',
      'generation_cutoff_clock','transaction_timestamp',
      'wall_started_at',v_wall_started_at
    )
  ) returning id into v_run_id;

  return pg_catalog.jsonb_build_object(
    'run_id',v_run_id,'source_key',v_source,'state_code',v_dataset.state_code,
    'county_code',v_county,'started_at',v_started_at,'wall_started_at',v_wall_started_at,
    'generation_cutoff_clock','transaction_timestamp','status','loading'
  );
end
$$;

revoke all on function public.brinesearch_issue97_begin_ingest(text,text)
from public,anon,authenticated;
grant execute on function public.brinesearch_issue97_begin_ingest(text,text)
to service_role;

create or replace function private_verification.brinesearch_issue97_terminal_run_clock()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status='loading' then
    new.completed_at:=null;
  elsif old.status is distinct from new.status
     or new.completed_at is null
     or new.completed_at<new.started_at then
    new.completed_at:=pg_catalog.clock_timestamp();
  end if;
  return new;
end
$$;

revoke all on function private_verification.brinesearch_issue97_terminal_run_clock()
from public,anon,authenticated,service_role;

drop trigger if exists brinesearch_issue97_terminal_run_clock
on public.brinesearch_road_source_ingest_runs;
create trigger brinesearch_issue97_terminal_run_clock
before update of status,completed_at
on public.brinesearch_road_source_ingest_runs
for each row
execute function private_verification.brinesearch_issue97_terminal_run_clock();

-- Repair already-written impossible lifecycle timestamps before enforcing the
-- invariant. This changes only audit timing metadata, never source data status.
update public.brinesearch_road_source_ingest_runs
set completed_at=started_at,
    details=details||pg_catalog.jsonb_build_object(
      'issue97_lifecycle_timestamp_repaired',true,
      'repair_reason','legacy clock_timestamp started_at with transaction_timestamp completed_at'
    )
where completed_at is not null and completed_at<started_at;

alter table public.brinesearch_road_source_ingest_runs
  drop constraint if exists brinesearch_issue97_run_time_order_check;
alter table public.brinesearch_road_source_ingest_runs
  add constraint brinesearch_issue97_run_time_order_check
  check(completed_at is null or completed_at>=started_at);

comment on function public.brinesearch_issue97_begin_ingest(text,text) is
  'Issue #97 controlled ingest generation start. started_at is the transaction-timestamp freshness cutoff matching source row writes; wall_started_at records true wall-clock start.';
comment on function private_verification.brinesearch_issue97_terminal_run_clock() is
  'Issue #97 ingest lifecycle guard. Terminal statuses receive a wall-clock completion timestamp and cannot precede the generation cutoff.';
