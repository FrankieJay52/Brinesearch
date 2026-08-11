-- GitHub #70 — distinguish source conflicts that remain unresolved from exact
-- official-source corrections that have been safely applied.

alter table private_verification.brinesearch_saved_alias_reconcile_issue70
  drop constraint if exists brinesearch_saved_alias_reconcile_issue70_decision_check;

alter table private_verification.brinesearch_saved_alias_reconcile_issue70
  add constraint brinesearch_saved_alias_reconcile_issue70_decision_check
  check (decision = any (array[
    'reuse_existing'::text,
    'upgrade_existing'::text,
    'create_from_official'::text,
    'source_conflict'::text,
    'corrected_source_conflict'::text,
    'held_multiple_existing'::text,
    'held_catalog_gap'::text,
    'held_official_ambiguous'::text,
    'held_geometry_incomplete'::text,
    'held_route_scope'::text,
    'held_revalidation'::text,
    'held_stale_step'::text
  ]));

comment on constraint brinesearch_saved_alias_reconcile_issue70_decision_check
  on private_verification.brinesearch_saved_alias_reconcile_issue70 is
  'Issue #70 durable reconciliation decision states. corrected_source_conflict means a formerly conflicting saved identity was resolved by exact authoritative source proof and applied.';
