# Issue #97 production migration lineage

This directory captures the read-only production migration ledger recovered on 2026-08-24 for Issue #97.

## Safety boundary

- This reconciliation performs no production database operation.
- It does not rebuild or activate a graph.
- It does not reconcile a route, edit pad or direction data, generate or publish Google output, or change the global cutover.
- It does not restore V17 deployment workflows, V17 runtime UI, or the old Netlify configuration from draft PR #98.

## Recovered production state

- Production contains 121 migration-ledger versions whose name contains `issue97`.
- The first version is `20260811233400`; the last is `20260823032513`.
- Current `main` previously contained zero Issue #97 migration files even though later V18 migrations depend on the installed Issue #97 schema.
- Draft PR #98 contained 125 Issue #97 migration source files, but most filenames used development timestamps that do not match the production ledger.

`production-migration-ledger-20260824.json` records the exact recovered version/name set and statement metadata. The filenames under `supabase/migrations` now have a one-to-one version match with those 121 production rows.

Two duplicate production ledger versions are represented by explicit no-op placeholders. Their substantive final sources remain at the later versions:

- `20260812025535` is the placeholder; `20260812025618` contains the final overlap-endpoint source.
- `20260812025631` is the placeholder; `20260812025732` contains the final supplemental-scope-index source.

Two migrations that existed only in the production ledger were recovered from the ledger statement text:

- `20260813013246_issue97_graph_name_change_endpoint_materialization_v2.sql`
- `20260823032513_issue97_geometry_digest_and_final_route_receipt.sql`

Eight draft-branch SQL sources had no matching production migration name. They are quarantined in `unapplied-migration-sources` so normal migration tooling cannot execute them. Quarantine is evidence preservation, not approval to install them.

## Verification

Run:

```powershell
node scripts/audit-issue97-production-lineage.mjs
```

The audit fails unless the checked-in production ledger has exactly one local Issue #97 migration file per production version, the two placeholder versions remain inert, the eight uninstalled sources remain outside `supabase/migrations`, and no unexpected version appears.
