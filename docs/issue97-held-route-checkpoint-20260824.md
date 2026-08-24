# Issue #97 held-route checkpoint — 2026-08-24

Status: **production writes stopped after the one permanent GUE attempt failed
before commit**. The corrected rollback rehearsal passed, but the permanent
installer's additional directory-digest assertion was nondeterministic. The
transaction was explicitly rolled back and the required persisted-state readback
proved zero delta. No permanent GUE/HAS migration, public Google publication, or
cutover occurred.

## Repository and deployed V18

- Current `main` and `origin/main`: `b75be46ee7d0e2f8e46bbb050e7a48e5f1077e48`.
- Current worktree branch: `fix/issue97-held-routes`, a local three-commit series
  atop `origin/main`; the first exact-evidence checkpoint is
  `f4a76d7284acd4317cb7c33c7899ac6ddd237e3d`.
- Current main already contains the fail-closed full-screen approved-road viewer
  (`3ac98f8`), Issue #108 endpoint display (`995e418`), and Issue #108 timeout
  correction (`095799e`).
- Live `https://brinesearch.com/` and a tested `/v17/...` URL both redirect to
  `/v18/`. The deployed `/v18/?view=roads` bundle is
  `/v18/assets/index-BpouKL4P.js`; it contains full-screen road mode, selected-pad
  route focus, and the no-inference route fallback, with no V17 loading chrome.
- A fresh live readback returned HTTP 200 from Netlify with HSTS and no-cache;
  the deployed bundle SHA-256 is
  `22cd13be31c8f10b2bd2fb94e00198e5b09292dd15dcfa52383e4ed64a754ff0`
  and contains the explicit full-screen control, approved-roads mode, exact
  selected-pad inbound-route message, fail-closed no-inference message, and Exit
  control. It contains neither the V17.3 marker nor old loading-directory chrome.
- Local production build emitted the same `index-BpouKL4P.js` asset and passed.

## Installed production baseline

- Performance-only index migration installed:
  `20260824120449_issue97_gue_has_endpoint_index_performance`.
- GUE active build:
  `44245144-3e39-45fe-907b-95e2b01b9c32`, graph digest
  `d7a43bacbf54794d4e92d9e8ceca2e28`, source revision digest
  `b0cc4e8e3aaa7121cc39cc7935189664`.
- HAS active build:
  `0870470a-11f8-4f33-8af3-08d6849d5f34`, graph digest
  `fc53a1492a3eecab78a524dbadcddfe8`, source revision digest
  `ece929162c9063ea35a6a276de59a940`.
- Active graphs: Ohio 19, West Virginia 1; staging 0.
- Occurrence receipts: 4,106.
- Current V18 directory: snapshot
  `1793f911-a0c2-4a8a-8a2f-195f2f375e09`, revision 3, 1,214 rows,
  1,214 searchable, SHA-256
  `52e12db47007d7ce2cbae17519809f0081b7be8d575f880a1a583b93f9ac4447`.
- Public Google rows: 0. Cutover: OFF. Google refresh queue: 0.
- Company-road overlay snapshots/rows: 0/0. Saved reconciliation runs: 0.

## Corrected GUE rollback rehearsal — failed and rolled back

- Started from the exact baseline at `2026-08-24T13:35:10.407493Z`.
- Rehearsed migration bytes SHA-256:
  `46905aa03dd52b7ba57ad30a80b33104d65ab95111c32467240022ab7ef09bc8`.
- One explicit transaction was used. No retry was issued.
- Failure after 660 seconds:
  `P0001 — Issue #97 GUE canonical/mapping postcondition failed`.
- PostgreSQL rollback succeeded.
- One persisted-state inspection completed at
  `2026-08-24T13:46:10.469593Z` and matched the before-state exactly:
  original GUE build/digests, 19/1 active graph counts, no staging build,
  4,106 receipts, directory revision 3 and exact digest, zero target roads,
  zero target mappings, zero target manifest, zero public Google rows, cutover
  OFF, zero queue/overlay/reconciliation rows, and unchanged pad authority,
  public directions, target step, and target receipt digests.

## Exact failure cause

The GUE ODOT identity `OH:ODOT:NLF:SGUESR00258**C` is current, public,
drivable, and has exact geometry, but its one canonical OH-258 family road
(`f230224c-b99a-4652-b672-3b80667ba81e`) was still a legacy placeholder:

- `verification_status = needs_review`
- `geometry_status = not_loaded`
- `centerline_geojson = null`
- `source_method = explicit_in_saved_directions`
- `source_record_id = null`

The GUE graph rebuild correctly ran the county-scoped exact-mapping refresh.
That refresh cannot retain a verified mapping to an unverified/no-geometry road,
so it retired the OH-258 mapping and the postcondition saw 2 verified mappings
instead of 3. This was an authority mismatch, not a timeout or lock failure.

Read-only evidence for a safe family adoption:

- Exactly one Ohio OH-258 canonical family row exists.
- Exactly five active OH-258 ODOT identities exist across GUE/HAS/TUS; all five
  are current, public, drivable, and have exact geometry.
- Aggregate source digest:
  `c0753bbe079862bc07f66cf52f779ff6`.
- Deterministic family geometry digest:
  `dfac6e146b3bdde0cba48c3c0de85e3f`.
- Deterministic stored JSONB geometry digest:
  `51e2d9edc4aa6ba818642ea82272ce4c`.
- No conflicting verified mapping exists.
- The legacy road has zero `brinesearch_pad_roads` references and zero private
  Google receipt references, so replacing the empty placeholder geometry does
  not invalidate a published exact route or a Google manifest.

## Second GUE rollback rehearsal — failed and rolled back

- Started from the exact unchanged baseline at
  `2026-08-24T14:15:37.929805Z`.
- Rehearsed migration bytes SHA-256:
  `d9b01535f3cfb49382bb7b638da6530e4bcc75ceb753f85d511192efcf2864a0`.
- One explicit transaction was used. No retry was issued.
- Failure after 657 seconds:
  `P0001 — Issue #97 GUE graph currentness/source generation failed`.
- PostgreSQL rollback succeeded.
- One persisted-state inspection completed at
  `2026-08-24T14:26:35.157740Z` and again proved the complete original state:
  GUE build/digests, 19/1 active graphs, no staging build, 4,106 receipts,
  directory revision 3 and exact digest, zero target roads/mappings/manifest,
  public Google 0, cutover OFF, zero queue/overlay/reconciliation rows, and the
  original pad, public-direction, target-step, and target-receipt digests.

The second failure was an evidence-assertion defect, not a graph build failure.
`brinesearch_issue97_rebuild_county_graph` includes the verified identity-
mapping digest in `source_revision_digest`. This migration adds three verified
exact mappings, so the rebuilt GUE source revision must differ from the old GUE
source revision. The postcondition incorrectly required equality. Both GUE and
HAS are now corrected locally to require a nonempty changed source revision and
to bind the new source revision plus graph digest to the exact immutable state-
manifest member.

## Third GUE rollback rehearsal — failed and rolled back

- Started from the exact unchanged baseline at
  `2026-08-24T14:42:52.616924Z`.
- Rehearsed migration bytes SHA-256:
  `fe64b9d07defa4f9fab986edf23089de11dc289748432e980500e4f03c7af7df`.
- One explicit transaction was used. No retry was issued.
- Failure after 664 seconds:
  `P0001 — Issue #97 GUE public Google/cutover/global authority changed`.
- PostgreSQL rollback succeeded.
- One persisted-state inspection completed at
  `2026-08-24T14:53:56.920216Z` and proved the complete original state again:
  GUE build/digests, directory revision 3 and exact digest, 19/1 active graphs,
  no staging build, 4,106 receipts, zero target roads/mappings/manifest, zero
  Google queue rows, public Google 0, cutover OFF, zero overlays/reconciliation
  runs, and the exact original pad, public-direction, target-step, and target-
  receipt digests.

The third failure exposed a deferred-trigger timing mismatch in the rehearsal,
not a route, graph, or Google authority change. Exact identity/mapping refreshes
normally queue dependent private-Google receipts. Constraint trigger
`private_verification.brinesearch_issue97_google_route_refresh_deferred` is
`DEFERRABLE INITIALLY DEFERRED`, so a permanent transaction drains that queue at
commit. A rollback-only rehearsal never reaches commit, but the migration
incorrectly asserted that the queue was already empty. Read-only recovery pinned
the exact current dependency sets: GUE affects BLAYNEY, JENNINGS, and SHUTWAY;
HAS affects BANJO, BESECE, BLAYNEY, COLOGIE, PICKENS, SCOUT, and SHUTWAY.

## Fourth corrected GUE rollback rehearsal — passed and rolled back

- Started from the exact unchanged baseline at
  `2026-08-24T15:35:10.002529Z`.
- Rehearsed exact migration SHA-256:
  `b81fe6934e956aad4900a406207d48f42d3a3e4479a61329dfad046e433b4233`.
- Completed successfully in 695 seconds with one explicit transaction.
- Inside the transaction, the migration produced release-current GUE build
  `3f692445-d7b6-4d71-8fef-866045dc6196`, graph digest
  `b6c8618795fa8692427b8c47a473d551`, and source revision digest
  `082daf6c993fa38f1e8069bb5a20e9db`.
- It created exactly 2 canonical roads and 3 exact mappings, resolved exactly
  10 Cooper/Lorraine public occurrences, adopted the exact five-identity OH-258
  family, and refreshed the exact 3-pad dependent private-Google set.
- Cooper private access and the Titus/Sligo raw crossing remained held;
  Cooper/Lorraine Google remained `not_evaluated`; public Google remained 0;
  cutover remained OFF; queue/overlays/reconciliation remained 0.
- The rehearsal explicitly rolled back. The after-state at
  `2026-08-24T15:46:44.634018Z` matched the before-state exactly with
  `zeroPersistentDelta=true`.

## One permanent GUE attempt — installer gate failed and rolled back

- Fresh drift guards passed at `2026-08-24T15:52:23.755564Z`.
- The exact rehearsed migration completed all of its own assertions in about
  695 seconds. It produced candidate active build
  `79a5164e-564b-4760-b90e-bc15db96931d` with the same deterministic graph
  digest `b6c8618795fa8692427b8c47a473d551`, exactly 2 roads, 3 mappings,
  10 resolved public occurrences, held Cooper private authority, public Google
  0, and cutover OFF.
- Before commit, the installer's extra inside-verification gate failed with:
  `Directory digest diverged from rehearsal`.
- The rehearsal directory SHA was
  `56d2a1b2b120bb924f5ea8abb9fea333510ce6efa8b1c0d107cfd3fdcd1d4309`;
  the permanent transaction's valid revision-4 directory SHA was
  `7ca7c75b2c9a014c9152fca140eef8c9ae8cf22d7d56a1c2c20e48606d73d68b`.
  New build/manifest/snapshot IDs and generation timestamps make exact directory
  bytes nondeterministic across otherwise equivalent executions. The migration
  correctly requires current revision 4 and exact row counts, not a rehearsed
  content SHA.
- No `COMMIT` was attempted. The transaction, including its provisional migration
  ledger row, rolled back successfully.
- The single persisted-state inspection at
  `2026-08-24T16:03:59.484092Z` proved the original GUE build/digests, directory
  revision 3/digest, 19/1 active graphs, staging 0, target roads/mappings/manifest
  0, migration ledger 0, queue/public Google/overlays/reconciliation 0, cutover
  OFF, and all protected digests unchanged.
- Per fail-stop, no permanent retry, HAS action, merge, or deployment followed.

## Local correction prepared — permanent retry not authorized

Migration
`20260824122000_issue97_gue_held_route_exact_identity_receipts.sql` now:

1. Pins the exact legacy OH-258 placeholder state and the complete five-identity
   ODOT family evidence.
2. Adopts that one existing canonical family row with the deterministic full
   official ODOT geometry.
3. Uses exact source-record mapping for the one GUE identity.
4. Creates only the reviewed Martha Road and Tanglewood Lane canonical roads.
5. Rebuilds only GUE, binds the immutable 19-county Ohio manifest/cache, reruns
   Cooper/Lorraine plus the exact three-pad GUE private-Google dependency set,
   then explicitly executes the existing deferred constraint trigger so the
   rollback rehearsal exercises real commit-time behavior.
6. Requires the exact pre-drain queue and an empty post-drain queue, activation
   impact 0, held Cooper private access/Titus-Sligo crossing, no ready receipt
   for the three dependent held pads, public Google 0, and cutover OFF.

Prepared migration SHA-256:
`b81fe6934e956aad4900a406207d48f42d3a3e4479a61329dfad046e433b4233`.

The exact migration passed its corrected rollback rehearsal. It has not been
permanently installed. The local one-shot installer now verifies a newly issued
64-character directory SHA, revision 4, 1,214/1,214 rows, and a new snapshot
instead of requiring nondeterministic equality with the rehearsal SHA. The
fail-stop rule requires a new explicit post-failure authorization before one
new permanent GUE attempt. HAS/Scout remains serially gated behind a permanently
verified GUE migration.

The HAS exact-source collision audit is also clean: each reviewed CR-36/36A
identity has one exact NLF record, is current/public/drivable with authoritative
geometry, has zero verified mappings, and no existing Harrison county road with
normalized route number 36 or 36A competes with either new canonical road.
The prepared HAS migration SHA-256 is
`c8b8f1bcd6c81af927bbcd3257dd29d6a378b59f2ec064d2a4f6ffd3aad44f76`.
It now reruns the exact seven-pad HAS dependency set, requires the exact deferred
queue, explicitly executes the existing commit-time constraint trigger, proves
COLOGIE remains privately ready, proves the other six remain non-ready, and
keeps public Google at 0.

## Issue #108 read-only production probe

The one authorized probe used unqualified `extract(epoch from ...)` and passed
at `2026-08-24T14:02:24.284377Z`:

- RPC: `public.owner_approved_routes_map_road_detail(uuid)`.
- `SECURITY DEFINER`, `search_path=""`, `statement_timeout=15s`,
  `work_mem=32MB`.
- Authenticated EXECUTE: yes. Anonymous EXECUTE: no.
- Bannock CR-10 identity returned exact current authoritative geometry,
  45 source segments, a current graph summary, and 90 physical junctions.
- Total measured probe time: 16,181 ms; the function completed successfully.
- Migration ledger discrepancy: version `20260823231000` is absent even though
  the intended function configuration is live. Per the explicit no-write/no-
  migration-retry instruction, this was recorded and not altered.

## Current private/public Google state

- Private receipt corpus: 2 ready, 8 held, 24 stale.
- Public Google rows: 0.
- Cutover: OFF.
- The nine scoped pads have no public Google row.
- SHUTWAY, SCOUT, PICKENS, BESECE, BANJO, BLAYNEY, and JENNINGS currently have
  stale pad state with a held receipt reason
  `transition_route_dependencies_not_current_or_exact`.
- Cooper and Lorraine remain `not_evaluated` with no Google receipt; the failed
  rehearsal left them unchanged.

Exact underlying blockers remain:

| Pad | Evidence-backed blocker |
| --- | --- |
| BANJO | 2/3 public occurrences resolved; terminal private access has no authoritative geometry. |
| BESECE | 2/3 resolved; terminal private access lacks authoritative geometry; field check remains required. |
| PICKENS | 2/3 resolved; terminal private access lacks authoritative geometry; field check remains required. |
| BLAYNEY | Saved primary sequence is incomplete and does not establish one exact complete inbound route; alternates do not manufacture authority. |
| JENNINGS | I-70/OH-285 has no verified shared junction; the raw crossing and terminal private geometry remain held. |
| SHUTWAY | I-70/OH-149 has no verified shared junction; the raw crossing and terminal private geometry remain held. |
| SCOUT | Five exact public occurrences are repairable in HAS, but the adjacent JEF/HAS US-250 same-road source boundary remains explicitly held, not a new maneuver. |
| COOPER | Six public occurrences are repairable in GUE; terminal private access and the Titus/Sligo raw crossing remain held. |
| LORRAINE | Four public occurrences are repairable in GUE; no migration forces Google ready. |

## Verification completed

- V18 tests: 24 files, 139 tests passed.
- TypeScript typecheck: passed.
- Owner approved-routes audit: passed.
- Publish-security tests: 5 passed.
- Full Netlify production build: passed.
- Built-runtime audit: passed; V18 native auth, reviewed directions, exact-road
  highlights, and per-pad endpoints are present without old-app bridges or
  private fields.
- Production assembly: 19 V18 files; every V17 page/runtime asset absent.
- Latest resource check: 1.50 GB RAM and 4.77 GB disk free.

## Remaining gates

1. One newly authorized permanent GUE attempt using the already-passed exact
   migration and corrected deterministic installer gates.
2. Exact persisted GUE readback after commit.
3. Separate HAS/Scout rehearsal and permanent apply only after GUE is installed.
4. Re-verify all target receipts/graphs/private Google holds; public Google stays
   0 and cutover stays OFF.
5. The user authorized merge and deployment after every database gate passes;
   the failed GUE gate means neither action is currently eligible.
