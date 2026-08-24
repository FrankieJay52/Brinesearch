-- GitHub #97 — failed retry must not poison an unchanged verified source scope.
--
-- A timed-out/failed source refresh can leave a durable failed receipt after the
-- source-page transaction rolls back. The original scope-current predicate looked
-- only at the newest attempt, so an unchanged failed retry made previously verified
-- source data appear stale. Preserve fail-closed behavior for loading attempts and
-- genuinely changed source snapshots, but allow the newest verified complete run to
-- remain current when every newer attempt is failed and carries the exact same
-- immutable source fingerprint. Supplemental dependencies use the same rule.

create or replace function private_verification.brinesearch_issue97_source_snapshot_fingerprint(
  p_details jsonb
)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when pg_catalog.jsonb_typeof(coalesce(p_details#>'{source_snapshot}','null'::jsonb))<>'object'
      or nullif(p_details#>>'{source_snapshot,source_revision_token}','') is null
      or nullif(p_details#>>'{source_snapshot,expected_source_rows}','') is null
    then null
    else pg_catalog.md5(pg_catalog.jsonb_build_object(
      'source_key',p_details#>>'{source_snapshot,source_key}',
      'state_code',p_details#>>'{source_snapshot,state_code}',
      'county_code',p_details#>>'{source_snapshot,county_code}',
      'source_county_code',p_details#>>'{source_snapshot,source_county_code}',
      'source_version',p_details#>>'{source_snapshot,source_version}',
      'service_item_id',p_details#>>'{source_snapshot,service_item_id}',
      'source_revision_token',p_details#>>'{source_snapshot,source_revision_token}',
      'object_id_set_digest',p_details#>>'{source_snapshot,object_id_set_digest}',
      'expected_source_rows',p_details#>>'{source_snapshot,expected_source_rows}',
      'service_last_edit_ms',p_details#>>'{source_snapshot,service_last_edit_ms}'
    )::text)
  end
$$;

create or replace function private_verification.brinesearch_issue97_dataset_scope_current(
  p_dataset_id uuid,
  p_state_code text,
  p_county_code text
)
returns boolean
language sql
stable
set search_path=''
as $$
  with scope_runs as (
    select r.*,
      private_verification.brinesearch_issue97_source_snapshot_fingerprint(r.details) as snapshot_fingerprint
    from public.brinesearch_road_source_ingest_runs r
    where r.dataset_id=p_dataset_id
      and r.state_code=p_state_code
      and r.county_code=p_county_code
  ), latest_attempt as (
    select r.* from scope_runs r
    order by r.started_at desc,r.id desc limit 1
  ), latest_verified as (
    select r.* from scope_runs r
    where private_verification.brinesearch_issue97_ingest_run_verified(r.id)
    order by r.started_at desc,r.id desc limit 1
  ), base_current as (
    select v.*,
      case
        when a.id=v.id then true
        when a.status='failed'
          and a.snapshot_fingerprint is not null
          and a.snapshot_fingerprint=v.snapshot_fingerprint then true
        else false
      end as latest_attempt_compatible
    from latest_verified v
    join latest_attempt a on true
  )
  select coalesce((
    select b.latest_attempt_compatible
      and not exists(
        select 1
        from pg_catalog.jsonb_array_elements(coalesce(
          b.details#>'{supplemental_materialization,target_primary_runs}','[]'::jsonb
        )) dependency
        where not exists(
          select 1
          from public.brinesearch_road_source_ingest_runs target
          where target.id=(dependency->>'run_id')::uuid
            and private_verification.brinesearch_issue97_ingest_run_verified(target.id)
            and exists(
              select 1
              from public.brinesearch_road_source_ingest_runs latest_target
              where latest_target.id=(
                select lr.id
                from public.brinesearch_road_source_ingest_runs lr
                where lr.dataset_id=(dependency->>'dataset_id')::uuid
                  and lr.state_code=dependency->>'state_code'
                  and lr.county_code=dependency->>'county_code'
                order by lr.started_at desc,lr.id desc limit 1
              )
              and (
                latest_target.id=target.id
                or (
                  latest_target.status='failed'
                  and private_verification.brinesearch_issue97_source_snapshot_fingerprint(latest_target.details) is not null
                  and private_verification.brinesearch_issue97_source_snapshot_fingerprint(latest_target.details)
                    =private_verification.brinesearch_issue97_source_snapshot_fingerprint(target.details)
                )
              )
            )
        )
      )
    from base_current b
  ),false)
$$;

revoke all on function private_verification.brinesearch_issue97_source_snapshot_fingerprint(jsonb)
from public,anon,authenticated,service_role;
revoke all on function private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)
from public,anon,authenticated,service_role;

comment on function private_verification.brinesearch_issue97_source_snapshot_fingerprint(jsonb) is
  'Issue #97 internal immutable source-snapshot fingerprint. Excludes check time but includes source revision/object-ID digest/row count and source identity; missing revision evidence returns null and therefore fails closed.';
comment on function private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text) is
  'Issue #97 source-scope currentness. Uses the newest verified complete run; a newer failed retry is ignored only when its immutable official-source fingerprint is identical. Loading attempts or changed/missing fingerprints remain fail-closed. Supplemental primary-source dependencies obey the same rule.';
