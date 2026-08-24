\set ON_ERROR_STOP on
\pset pager off
\timing on

-- Rollback-only production rehearsal. The core owns no transaction ending.
begin isolation level serializable;
set local statement_timeout='15min';
set local lock_timeout='2min';
set local brinesearch.issue97_frozen_wave_manifest_transaction=
  'issue97-ohio-r3-frozen-wave-manifest-v1';
\ir 38-frozen-wave-ohio-state-manifest-core.sql
rollback;

-- Prove the rollback removed the successor header and every child row.
begin isolation level repeatable read read only;
set local statement_timeout='2min';
set local lock_timeout='2min';
select
  (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests)=1
  and (select count(*) from private_verification.brinesearch_issue97_state_candidate_manifests
    where id='c41f5320-1273-470c-a316-28b42211d697'::uuid
      and manifest_key='issue97-ohio-r2-final-candidate'
      and manifest_digest='9763dc5bb626da71881b7381ed28a436'
      and member_count=19)=1
  and not exists(
    select 1 from private_verification.brinesearch_issue97_state_candidate_manifests
    where manifest_key='issue97-ohio-r3-frozen-wave-candidate'
       or manifest_digest='77cb00cf83ad8bab4a45c9b552626f76'
  ) as rehearsal_rolled_back_exactly
\gset issue97_frozen_manifest_rehearsal_
\if :issue97_frozen_manifest_rehearsal_rehearsal_rolled_back_exactly
\else
  do $fail$ begin
    raise exception 'Issue #97 successor manifest rehearsal did not roll back exactly';
  end $fail$;
\endif
rollback;

\echo 'ISSUE97_FROZEN_WAVE_OHIO_MANIFEST_REHEARSAL|PASS|ROLLBACK_ONLY'
