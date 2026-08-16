# Issue #97 computer rollout kit

This kit is the controlled handoff for a computer with a genuine long-lived
PostgreSQL direct or Supavisor **session-mode** connection. It is not a detached
job system and it must not be run through the Supabase management connector,
SQL Editor, transaction-mode pooler, a phone browser, or an Edge Function.

It contains no credentials, database URI, arbitrary SQL input, automatic retry,
global cutover command, or graph activation command. Every county build remains
one atomic transaction and calls the existing unchanged builder.

## One-time computer setup

1. Install the PostgreSQL client (`psql`).
2. Clone/fetch BrineSearch and check out
   `data/issue-97-authoritative-road-junction-graph`.
3. Wait for the coordinator to confirm the exact PR #98 head is green and all
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

## VIN endpoint-index prerequisite (independent review required)

The first `OH/VIN` r2 attempt reached the unchanged
`tmp_issue97_point_corroboration` statement and rolled back at the finite
90-minute builder timeout. Bounded production profiling showed that PostgreSQL
did not select the Ohio-wide endpoint expression indexes for VIN's exact
county-scoped start/end predicate. It repeatedly scanned all active VIN OGRIP
centerlines in both the main join and the conflicting-extra-identity anti-join.

Migration `20260816090000_issue97_vin_endpoint_index_performance.sql` adds only
two VIN-scoped partial GiST expression indexes for those existing start/end
predicates. It does not replace the builder, change the exact 0.03 m contract,
alter topology or ODOT pair equality, restamp a build, or build a county. The
production builder MD5 remains `06705f5b35a6d37151bb2c0dc5ade9bd`.

Run the exact-one rollback rehearsal only from the reviewed, clean, pushed PR
head and the private long-lived `PGSERVICE=brinesearch_issue97_prod` lane:

```sh
./ops/issue97-computer-rollout/issue97-vin-endpoint-index-rehearsal.sh
```

After that checkpoint receives the required independent audit and explicit
installation authorization, the reviewed exact-one installer is:

```sh
./ops/issue97-computer-rollout/issue97-vin-endpoint-index-install.sh
```

Neither script accepts arguments, builder input, arbitrary SQL, credentials, or
retries. The rehearsal explicitly rolls back and proves a fresh before/after
snapshot match. The installer is present for review but must not be run merely
because it exists on a branch.

CAR remains deliberately fail-closed. Its r2 build captured mapping digest
`00c7ac96038083e8765439bcf1c034b2`; later exact COL/HAS/JEF mapping refreshes
produced current digest `a2a49ac4f11baa703f05a493cf331c35` without changing
CAR membership source digests or mapped road IDs. That is real mapping-evidence
drift under the existing graph-mapping-v2 contract, not an excuse to normalize
or restamp the candidate. The controlled dark plan therefore keeps CAR pending
for a clean rebuild after this checkpoint is independently approved.

## Start-of-session checks

From the repository root:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh preflight
```

Preflight fails closed unless the connection is a real PostgreSQL session with
the required #97 functions, all 114 required source scopes are current, global
cutover is off, there is no staging build, BEL/JEF/NOB remain current, and the
public Google-route policy is bound to the final cutover-aware dispatcher.

## Preferred dark-build batch

The human/operator does **not** need to start and approve each remaining county
one at a time. The database work itself still stays county-scoped and serial so
one bad county cannot contaminate another.

Preview the exact pending queue:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh plan-dark
```

Then run the controlled batch:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh build-pending-dark
```

The batch:

- computes the queue from the current 39-county registry and current graph/source
  receipts; it does not use a hand-maintained county list;
- puts Washington County PA first while it remains pending, preserving the
  Possum Hollow milestone;
- permanently excludes frozen Ohio `BEL`, `JEF`, and `NOB`;
- automatically skips any county that already has a source/mapping-current
  active or validated graph;
- runs **serially**, never in parallel;
- executes the existing `10-build-county.sql` once per pending county;
- keeps each build in its own `BEGIN` transaction with a finite **90-minute
  maximum for the single builder statement** and a 2-minute lock timeout;
- runs a bounded lightweight post-build check of persisted graph digest, counts,
  source/mapping currentness, holds, and cutover/staging state;
- waits five seconds between counties;
- stops on the first error, inspects server state once, and **never retries**;
- never activates a graph, never activates global cutover, never publishes
  Google routes, and never starts the directions batch.

The 90-minute value is a maximum, not a target duration. It replaced the original
15-minute whole-builder statement limit after PA/WAS reached the late
membership-digest phase and rolled back at that outer limit. Current production
source scale also includes PA/ALL at roughly four times the PA/WAS source-segment
count, so repeatedly using the old limit would predictably create expensive
rollback work rather than a safe completion path.

A client disconnect or timeout is never treated as proof of success or rollback.
The fail-stop status check remains the source of truth before any later retry.

After the dark-build batch completes, stop production writes and perform one
checkpoint-wide independent read-only audit. Deep/pinned verification is a
release gate before activation, but it is not duplicated after every county
during the long build batch.

## Individual county recovery / deep verification

The original one-county command remains available for an intentionally isolated
recovery or regression:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh build PA WAS
```

That command runs the full shared-provenance verifier after the build. It is not
the preferred way to complete the remaining 35-county dark queue.

Read-only county verification can also be run separately:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh verify PA WAS
```

OHI retains its pinned Thrush regression:

```sh
./ops/issue97-computer-rollout/issue97-computer-rollout.sh verify-ohi
```

This kit intentionally contains no activation command. County activation remains
a separate reviewed production phase after the batch checkpoint is audited.

## Frozen/current and already completed graph state

- `OH/BEL`, `OH/JEF`, `OH/NOB` are frozen and cannot be rebuilt by this kit.
- `WV/OHI` is already active/current and is skipped automatically while that
  state remains current.
- Existing stale Ohio graph generations are not treated as current merely
  because their status says `active` or `validated`; the batch plan also checks
  their source-run vector and mapping snapshot against current production truth.

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

There is intentionally no graph-activation or cutover command in this directory.
