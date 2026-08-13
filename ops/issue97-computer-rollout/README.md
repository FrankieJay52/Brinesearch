# Issue #97 computer rollout kit

This kit is the controlled handoff for a computer with a genuine long-lived
PostgreSQL direct or Supavisor **session-mode** connection. It is not a detached
job system and it must not be run through the Supabase management connector,
SQL Editor, transaction-mode pooler, a phone browser, or an Edge Function.

It contains no credentials, database URI, arbitrary SQL input, automatic retry,
global cutover command, or automatic activation loop. Every county build stays a
single atomic transaction and calls the existing unchanged builder.

## One-time computer setup

1. Install the PostgreSQL client (`psql`).
2. Clone/fetch BrineSearch and check out
   `data/issue-97-authoritative-road-junction-graph`.
3. Wait for Work to confirm the exact PR #98 head is green and the pending
   migrations on that head are installed in production.
4. Configure a private libpq service using the official Supabase direct
   connection or Supavisor session endpoint. Keep the password in a local
   `.pgpass` file with mode `0600` or an OS keychain-backed helper. Never put a
   password, URI, PAT, token, or service profile in Git, ChatGPT, an Issue, or a
   shell argument.
5. Export only the non-secret service name, for example:

   ```sh
   export PGSERVICE=brinesearch_issue97_prod
   ```

The script rejects `PGPASSWORD`, rejects a dirty or unpushed checkout, and uses
SSL. Runtime logs are private local files under `.issue97-runs/`, which Git
ignores.

## Start-of-session checks

From the repository root:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh preflight
```

Preflight fails closed unless the connection is a real PostgreSQL session with
the required #97 functions, all 114 required source scopes are current, global
cutover is off, there is no staging build, BEL/JEF/NOB remain current, and the
public Google-route policy is bound to the final cutover-aware dispatcher.

## One county at a time

Build only in a quiet ingestion window:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh build WV OHI
```

The fixed build command executes exactly:

```sql
BEGIN;
SET LOCAL statement_timeout='15min';
SELECT public.brinesearch_issue97_rebuild_county_graph('WV','OHI');
COMMIT;
```

with the supplied scope validated against the active graph registry. It never
activates a build. If the connection returns an error or drops, the script
performs one read-only status inspection and **never retries**. A client timeout,
HTTP error, or disconnect is not proof of either rollback or success.

For OHI, immediately run the fixed dark-build regression:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh verify-ohi
```

Stop for the independent read-only audit. This kit intentionally contains no
activation command. After that audit is reconciled, Work must recover the exact
validated build ID from GitHub Issue #97, independently recheck production, and
perform the established county activation as a separate authorized checkpoint.

## Current Ohio queue

- Frozen/current: `BEL`, `JEF`, `NOB` — do not rebuild or activate.
- Active but stale; controlled rebuild required: `CAR`, `COL`, `GUE`, `HAS`,
  `MOE`.
- No graph yet: `ATH`, `COS`, `MAH`, `MEG`, `MUS`, `POR`, `STA`, `TRU`, `TUS`,
  `VIN`, `WAS`.

Do not turn this list into an unattended loop. For each county: preflight,
build, inspect exact topology/regressions and holds, checkpoint/audit, then hand
back to Work for separately authorized activation/postcheck/freeze. Washington County PA / Possum Hollow remains its own
special state-path regression. Global cutover stays off throughout.

## Dark directions preparation

Only after all 39 registered county graphs are active and source-current:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh directions-dark
```

This performs the full exact-or-held saved-road reconciliation, then the
identity/transition/authoritative-geometry/route-receipt pipeline. It does not
call Google publication, activate a graph, or activate global cutover. A final
read-only report separates integrity-complete accounting from rollout-ready
directions.

The following are explicit release gates, not tasks this kit guesses around:

- reconcile named fixtures Cooper, Noelle, Dale Yoder, and both distinct Rayle
  Coal records with exact proof or holds;
- add/verify the shared-corridor fingerprint and outlier QA contract using IDs,
  exact junction anchors, and exact traveled geometry—not names;
- finish automatic materialization of normal driver-facing direction output so
  the manual Route Mapper remains exception/review-only;
- independently audit the final route-ready ↔ manifest accounting;
- activate global cutover only through the separately reviewed release process.

There is intentionally no cutover command in this directory.
