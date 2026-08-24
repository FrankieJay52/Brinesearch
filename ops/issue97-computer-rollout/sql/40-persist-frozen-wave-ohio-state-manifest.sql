\set ON_ERROR_STOP on
\pset pager off
\timing on

-- One-attempt permanent manifest transaction. On any pre-COMMIT error the
-- connection exits with the transaction aborted; a caller must not retry.
begin isolation level serializable;
set local statement_timeout='15min';
set local lock_timeout='2min';
set local brinesearch.issue97_frozen_wave_manifest_transaction=
  'issue97-ohio-r3-frozen-wave-manifest-v1';
\ir 38-frozen-wave-ohio-state-manifest-core.sql
commit;

\echo 'ISSUE97_FROZEN_WAVE_OHIO_MANIFEST_PERSIST|COMMITTED'
