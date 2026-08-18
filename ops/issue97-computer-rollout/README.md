# Issue #97 computer rollout kit

This kit is the controlled handoff for a computer with a genuine long-lived
PostgreSQL direct or Supavisor **session-mode** connection. Its rollout commands
are not a general detached job system and must not be run through the Supabase management
connector, SQL Editor, transaction-mode pooler, a phone browser, or an Edge Function. The
fixed five-second Windows worker proof documented below is the sole narrow exception.

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

## Fixed Windows worker proof (not a job runner)

The only detached process in this directory is the review-gated Windows
**worker proof**. It cannot accept a SQL file, command, migration, state, county,
connection URI, credential, or mode. Its production launcher can execute only

`BEGIN READ ONLY` → `pg_sleep(5)` → fixed PASS marker → `ROLLBACK`

from `sql/35-worker-proof-read-only.sql`. The SQL binds the immutable receipt
attempt ID into a transaction-local custom GUC, derives and acquires its unique
transaction advisory lock, and emits the exact PostgreSQL PID/backend-start
identity before sleeping. It also pins the BrineSearch production manifest/dark
state and takes the established release/pipeline/corpus/reconciliation/mapping
locks. The short launcher
atomically consumes one permanent `production.launch.json` claim and immediately
uses pinned Windows PowerShell `Start-Process -PassThru` for a fixed bootstrap.
The independently running bootstrap performs every slow hash, Git fetch, clean
head, and PostgreSQL-runtime check before it atomically creates the database
attempt and creates the long-lived worker through `Win32_Process.Create`. The
short launcher returns the bootstrap PID immediately; the status poller reports
the later worker PID/start-time. It never owns the Git or `psql` lifetime.

This Windows-only proof must run from an owner-protected standalone clone of the
exact pushed PR head. A linked worktree whose common Git metadata is writable by
another Windows principal fails closed. It requires the reviewed PostgreSQL
17.11 distribution copied (not junctioned) to
`.tools/postgresql17/bin/psql.exe`; the launcher/worker verify the client and the
complete local DLL set against `issue97-worker-proof-manifest.json`. The fixed
`psql --version` checks in bootstrap and worker do not connect; only the worker's
single fixed `System.Diagnostics.Process` instance can open the one authorized
sleep-proof database session. That process is drained, unquestionably exited,
refreshed, and sampled exactly once for its authoritative `ExitCode`; later
hashing and receipt work cannot replace the captured result.

Generation 4 uses the fixed private receipt root
`C:\Users\frank\.issue97-runs\issue97-worker-proof-v4`.
It is outside every repository, shared across local Issue #97 worktrees, and
must not be a junction/reparse point. Its DACL is protected from inheritance and
contains exactly three non-inherited full-control entries: the current Windows
owner, `NT AUTHORITY\SYSTEM`, and `BUILTIN\Administrators`. A group-writable or
inherited receipt directory fails closed before launch. Provision this exact
directory once with that reviewed DACL before invoking either launcher; the
launchers deliberately refuse to create or weaken it.

The failed generation-2 and generation-3 evidence remains permanently consumed
and immutable at `C:\Users\frank\.issue97-runs\issue97-worker-proof` and
`C:\Users\frank\.issue97-runs\issue97-worker-proof-v3`. Generation 4 pins both
directories' exact aggregate digests, critical receipt hashes, failed attempt
IDs, and fail-stop dispositions before any authorization or launch. The
aggregate uses ordinal filename ordering so Windows PowerShell 5 and PowerShell
Core derive identical bytes. The new namespace cannot delete, overwrite,
rename, or reuse either consumed generation.

After the repository-only checkpoint is committed and pushed, provision or
verify that fixed local root from the clean exact-head clone:

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-provision-log-root.ps1
```

Then atomically bind the owner-protected **local-only** authorization to that one
fetched, clean, exact PR SHA. The receipt authorizes only the harmless local
detachment proof; it explicitly excludes production, retry, and the mapping
rehearsal:

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-authorize.ps1
```

Run the one-shot local-only detachment proof first. The launcher returns after
starting only the bootstrap; poll until the worker has outlived five seconds and
reaches `CLIENT_FINISHED_SUCCESS`:

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-local-launch.ps1
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-status.ps1
```

The production authorization is a second no-clobber receipt and separate
zero-argument command. A pushed SHA or completed local proof does not create it.
Run it only after the exact generation-4 SHA receives independent Grok and
ChatGPT review plus a separate explicit one-shot authorization:

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-authorize-production.ps1
```

Only after that separate production authorization and fresh protected-pin
verification may the one-shot production read-only proof be launched:

```powershell
$env:PGSERVICE = 'brinesearch_issue97_prod'
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-launch.ps1
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-status.ps1
```

The status command only reads the marker, PID/process identity, logs, atomic
client-completion receipt, and atomic final receipt. It requires the actual
child `ExitCode`, attempt/GUC/lock/PID-start identity, and log hashes to agree across all
receipts. It never launches, restarts, kills, deletes, or connects to the
database. `CLIENT_FINISHED_SUCCESS` proves only the client-side PASS/ROLLBACK
contract. After the worker has unquestionably exited, launch the fixed
zero-argument detached server inspector exactly once, then poll its separate
read-only status script:

```powershell
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-server-inspect.ps1
& 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ops\issue97-computer-rollout\issue97-worker-proof-server-inspect-status.ps1
```

The short inspector launcher never owns `psql`; it starts only a fixed bootstrap
which creates the long-lived inspector through `Win32_Process.Create`. The
detached fixed worker first requires the exact attempt-bound terminal bootstrap receipt and then requires
the production bootstrap, worker, and reviewed original `psql` client processes
to be absent. This prevents inspection from passing in the launch-claim to
bootstrap-spawn window. It then derives the receipt-bound attempt advisory-lock
key and uses a second fixed read-only/ROLLBACK SQL file to acquire that key. When
the proof emitted backend identity, the inspector also proves the exact
PID/backend-start pair is absent. It then verifies all protected production pins
remain unchanged. It can inspect using the protected launch claim when bootstrap fails
before creating a database-attempt receipt. A missing/malformed inspection
receipt or failed inspection remains `SERVER_INSPECTION_REQUIRED` and never
grants a retry. Any production failure, disappearance, malformed receipt, or
ambiguous process permanently consumes the fixed one-shot launch claim. Neither
a new SHA nor a new artifact set grants another attempt. Any worker-artifact
change is a new unaudited lane and requires a new explicit authorization. There
is no automatic retry. This proof does not authorize the frozen mapping
rehearsal or any other Issue #97 production operation.

### Pooler identity correction

The consumed generation-2 and generation-3 attempts proved that the
Supavisor-backed connection owns the server-side `application_name`; the server
reported `Supavisor` even when the client supplied an Issue #97 name. Generation
4 therefore never uses `application_name` to authorize, identify, accept, inspect,
or retry a proof. It records the observed value only as diagnostics. The exact
receipt attempt ID is instead written to transaction-local
`brinesearch.issue97_attempt_id`, hashed with the fixed `970035` seed into a
transaction advisory lock, and bound to the exact backend PID plus
`pg_stat_activity.backend_start`. The inspector derives the same lock key and
must acquire it before it can prove the target transaction is gone. ROLLBACK or
backend termination automatically releases both transaction-scoped identities.

The same failed attempt reached an ON_ERROR_STOP SQL error but generation 2
recorded exit code `0`. Its `Start-Process` result was sampled after the timed
wait without the parameterless drain/refresh sequence, so that receipt was not
authoritative. Generation 3 captures `ExitCode` immediately after a bounded
wait, parameterless `WaitForExit()`, and `Refresh()`, then binds it into a
separate atomic client-final receipt and the worker final receipt. PASS text,
empty stderr, or receipt existence can never override a nonzero process result.

The generation-2 inspector incorrectly schema-qualified the SQL `COALESCE`
syntax construct. Generation 3 uses `COALESCE(...)` while retaining
safe `pg_catalog` qualification on actual PostgreSQL functions. Both inspector
and proof SQL remain finite, read-only, explicitly rolled back, and commit-free.

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
