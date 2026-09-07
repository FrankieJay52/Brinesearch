# BRINESEARCH ISSUE #97 — INDEPENDENT READ-ONLY AUDIT
Auditor: Claude (read-only). Date: 2026-08-19.
Repo: FrankieJay52/Brinesearch. PR #98 @ e26e65194864253f5fa974ee60109151a58e148a.
No repository, GitHub, Supabase, or production state was modified.

## 1. VERDICT

**CHANGE PLAN — CORRECT THESE ITEMS FIRST**

There is one certain, code-proven blocker that will abort the rehearsal at the SECOND county (CAR), after burning a full BEL build. It is a latent defect in the live production graph builder that no real code path has ever exercised, and that no CI check can catch. The rest of the design — the transaction contract, the phase-aware SQL 34 fix, the Google deferred-trigger handling — audits as correct.

## 2. GITHUB ACCESS USED

- Repository path: /home/user/Brinesearch (remote https://github.com/FrankieJay52/Brinesearch)
- Working checkout HEAD: 4066834452e1f79ab5a6da967d2576127cada0a6 (tree 8b6099d4893c924f8ff32febe75fbcaa34af81ed), branch claude/issue-97-brinesearch-audit-4uub1t, worktree CLEAN (git status --porcelain empty). This checkout sits at main, not the PR head; all PR-head review was done against fetched git objects.
- origin/main: 4066834452e1f79ab5a6da967d2576127cada0a6 — MATCHES EXPECTED
- Audited PR head: e26e65194864253f5fa974ee60109151a58e148a — MATCHES EXPECTED
- Audited PR tree: 0501de43f24153747e416bd99c12883e1090a5d7 — MATCHES EXPECTED
- PR #98: open, draft=true, merged=false, mergeable_state=clean, head e26e651..., base main @ 4066834... — MATCHES EXPECTED (OPEN / DRAFT / UNMERGED)
- Issue #68: read in full (master backlog/workflow issue; one-writer rule, Grok/ChatGPT handoff cycle, definition-of-done).
- Issue #97: COMPLETE — all 229 comments enumerated across 3 pages; newest is 5337706353 @ 2026-08-19T04:55:34Z. All four named checkpoints read in full (5336784170, 5337361892, 5337611442, 5337706353). NO COMMENTS NEWER THAN 5337706353 EXIST.

Exact files reviewed at PR head (blob SHAs verified via git ls-tree):

| File | Blob | Lines |
|---|---|---|
| supabase/tests/issue97_frozen_exact_mapping_wave.sql | 6e7c0eba | 483 |
| supabase/migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql | 0173ec2f | 905 |
| ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql | 298ea15b | 755 |
| v17/scripts/audit-issue97-frozen-route-closure.mjs | 33542717 | 351 |
| v17/scripts/audit-issue97-frozen-exact-mapping-wave.mjs | 07d80c02 | 335 |
| v17/scripts/audit-route-corpus-reconciliation-issue97.mjs | 991bd538 | 156 |
| v17/scripts/audit-issue97-worker-proof.mjs | 84078d31 | 395 |
| supabase/tests/issue97_frozen_route_closure_preinstall.sql | 868b85be | 37 |

Also reviewed: 20260815090000 (final builder patch), 20260814161500 (OGRIP corroboration patch — THE DEFECT SOURCE), 20260811190000 (builder origin), ops/.../18-build-county-release.sql, issue97-release-install-final.sh, supabase/tests/issue97_road_junction_graph_synthetic.sql, .github/workflows/*.

Exact-head check runs (all non-failing): "Build, browser-test, and package V17.3" success; "build-and-static-checks" success; "browser-audit" success; "Build GitHub Pages site" success; Netlify "Header rules"/"Redirect rules" success; "Pages changed" neutral; "Deploy live site" skipped.

GitHub limitations: gh CLI is NOT INSTALLED in this environment; all GitHub reads used the GitHub MCP server instead. Workflow RUN NUMBERS (#1038, #1234, #926, #1011) could not be matched to the named runs through the check-runs API — I verified the exact-head check-run conclusions instead, which are all green.

## 3. PRODUCTION STATE VERIFIED

Project wvxzqtoiwhrgovzddtvz ("Brine Search", PG 17.6). All reads in BEGIN TRANSACTION READ ONLY with statement_timeout/lock_timeout set; every transaction ended in ROLLBACK. Zero writes.

| Item | Expected | Observed | OK |
|---|---|---|---|
| migration 20260817193212 rows | 0 | 0 | yes |
| frozen mapping rows | 0 | 0 | yes |
| Ohio active graphs | 19 | 19 | yes |
| staging graphs | 0 | 0 | yes |
| Ohio current source scopes | 38 | 38 | yes |
| active Ohio primary/alternate route receipts | 806 | 806 | yes |
| public Google routes | 0 | 0 | yes |
| global saved-road reconciliation runs | 0 | 0 | yes |
| Google refresh queue | 0 | 0 | yes |
| cutover | OFF | false | yes |
| active Issue #97 operational backends | 0 | 0 | yes |
| live builder pg_get_functiondef md5 | 06705f5b... | 06705f5b35a6d37151bb2c0dc5ade9bd | yes |

EIGHT PINNED OLD GRAPHS: all 8 matched on id + state_code='OH' + county_code + status='active' + exact graph_digest + activated_at='2026-08-16 11:08:18.355674+00' => pinned_build_count = 8. All eight UUID/digest pairs (BEL/CAR/COL/GUE/HAS/JEF/MOE/NOB) match the expected list exactly.

Additional state established (not in the expected list):
- Active release generation: exactly 1, issue97-release-20260815-r2.
- approved_haul_corridor_receipts table: ABSENT (to_regclass NULL) — required by future_layers_not_yet_present.
- 8 OH validated/unactivated candidate builds EXIST, all in the eight affected counties (BEL x3, CAR x2, COL x1, JEF x1, NOB x1). I verified EACH IS NON-RELEASE-CURRENT without re-invoking the expensive predicate: five fail brinesearch_issue97_graph_build_sources_current outright (BEL 5c2a529b, BEL 9e287daa, CAR 5420c208, CAR 544b6a79, COL 8e43ed38), and the remainder fail the fast path (release_builder_md5 mismatch or NULL generation key) with NO ACTIVE r2 QUALIFICATION ROW. Therefore unpinned_current_candidates = 0 in BOTH phases. This was the largest latent risk to all_ok; it is clear.
- brinesearch_issue97_graph_build_release_current('24ffa531...') (BEL pinned) = TRUE, confirming the preinstall branch's release_current = 8 requirement holds.

Limitations: I deliberately did NOT evaluate release-current for all eight pinned graphs — one call alone required a 240s statement timeout, and doing eight under a short timeout is exactly the already-resolved postflight failure. I verified one directly and derived the rest structurally. A final pg_locks / long-running-transaction sweep was not performed.

## 4. REHEARSAL TRANSACTION AUDIT

PROVABLY ROLLBACK-ONLY. YES.

- supabase/tests/issue97_frozen_exact_mapping_wave.sql: exactly ONE top-level "begin;" (line 6), exactly ONE "rollback;" (line 483), and ZERO COMMIT statements. Every "commit" token in all three tracked files is an ON COMMIT DROP temp-table clause — verified by inspection of each match.
- Both \ir-included files (20260817193212..., 34-...) contain NO transaction-control statements at all, and no SAVEPOINT.

Q2 — can any called function escape the transaction? No, and this is structural, not merely conventional:
- brinesearch_issue97_rebuild_county_graph is prokind='f' (a FUNCTION, plpgsql). A plpgsql FUNCTION cannot execute COMMIT/ROLLBACK at all; and even a PROCEDURE could not, because everything runs inside an explicit transaction block. There are NO CALL statements anywhere in the rehearsal.
- Builder body contains NO extensions.http_get/http_post/pg_net, NO pg_notify/NOTIFY/LISTEN, NO dblink/pg_background/pg_cron, and NO set_config. (HTTP-calling functions do exist elsewhere in the repo — the ingest lifecycle — but none is on the rebuild path.)
- The migration's only locks are pg_advisory_xact_lock (transaction-scoped, auto-released on rollback), not session-scoped.

Q11 — ON_ERROR_STOP + client exit: No persistent state. Empirically proven by checkpoint 5336784170: the first rehearsal died at SQL 34 line 711, psql exited without reaching the final ROLLBACK, and the independent postflight proved ZERO PERSISTENT DELTA — the backend rolls the transaction back on disconnect.

Only two persistent-table DML statements exist in the migration: update public.brinesearch_roads (guarded by an exact whole-row md5 precondition) and insert into public.brinesearch_road_identity_mappings (asserted to be exactly 46). Builder DML is confined to exactly four tables: brinesearch_road_graph_builds, _junctions, _junction_memberships, _junction_anchors — inserts/updates only, NO DELETES.

## 5. PHASE-AWARE FIX AUDIT

THE OLD-GRAPH QUARANTINE/CURRENTNESS CONTRACT IS CORRECT.

build_state joins replaced_graphs to live builds on id + state_code='OH' + county_code + status='active' + exact graph_digest + exact activated_at='2026-08-16 11:08:18.355674+00', then evaluates release_current per build via cross join lateral.

build_pins_ok requires pinned_build_count=8 AND pinned_unknown_currentness_count=0 AND exactly one of:

| Phase | migration_count | release-current | quarantined |
|---|---|---|---|
| PREINSTALL | 0 | 8 | 0 |
| POST-MAPPING / PRE-BUILD | 1 | 0 | 8 |

Verification against the required properties:
- Preserves exact old graph IDs/counties/digests/status/activation timestamp — YES, all five are join predicates; any drift drops pinned_build_count below 8 and fails.
- Mixed currentness fails closed — YES, e.g. 4/4 satisfies neither disjunct.
- Missing fails closed — YES, pinned_build_count < 8.
- Extra is structurally impossible — YES, replaced_graphs has 8 rows joined on the build primary key, so the count is bounded above by 8.
- NULL currentness fails closed — YES, pinned_unknown_currentness_count=0.
- Does not make stale old graphs route-authoritative — YES, SQL 34 performs NO WRITE OF ANY KIND; it is a single CTE SELECT. It only OBSERVES currentness; the quarantine itself is produced by the mapping install changing the live supplemental/name input digests.
- Preserves the preinstall test — YES, issue97_frozen_route_closure_preinstall.sql runs the identical file with migration_count=0, and I confirmed live that BEL is release-current and unpinned_current_candidates=0, so the preinstall branch holds today.
- Preserves the 412-route closure — YES, 46 target pairs and 412 frozen routes counted directly in the file; digests 492ff99.../e512c45.../0a0f29f.../final 711b1dd.../historical Leg-A 836c1f5... all pinned; BAKOS 86d86ac5..., COLOGIE dfb3f204..., WALKING TALL f03e1196... each individually asserted present.
- Preserves future candidate repository-pin requirements — YES, future_layers_not_yet_present requires the corridor table absent AND unpinned_current_candidates=0.
- Performs no write in SQL 34 — YES, confirmed: no DDL/DML/temp objects; fail-closed is 1/((all_ok is true)::integer), the division-by-zero seen in 5336784170.

Independently corroborated by checkpoint 5337611442, which recorded BOTH phases passing (preinstall PASS; post_mapping_quarantined: migration 1, mappings 46, pinned 8, release-current 0, quarantined 8, unknown 0).

Q6 — any other all_ok predicate likely to fail before BEL? NO. All ten conjuncts were live-verified or structurally derived above. The one that genuinely worried me — unpinned_current_candidates — is clear, because all 8 pre-existing OH candidates are non-release-current. The residual operational risk is safety_state_ok (see failure mode 4).

## 6. GRAPH-BUILD AUDIT

COUNTY ORDER: exactly BEL, CAR, COL, GUE, HAS, JEF, MOE, NOB — eight literal insert ... values (n,'XXX', rebuild_county_graph('OH','XXX')) statements, each with a hardcoded build_order. Serial by construction (separate top-level statements in one session). The order is re-asserted afterwards via array_agg(county_code order by build_order). NO LOOP, NO RETRY, NO OTHER STATE/COUNTY INPUT.

FUNCTION BEHAVIOR: writes only to the four graph tables; stamps status='validated', activated_at IS NULL; never activates (no activated_at assignment). The rehearsal further asserts no build outside the pre-existing set plus the 8 new ones, that every prior active build row and all its junction/membership/anchor children are byte-identical afterwards, and that no staging build exists.

ROLLBACK BEHAVIOR: all eight candidate builds and their children vanish on rollback.

### HIDDEN RISK — CONFIRMED BLOCKER

The builder is NOT RE-ENTRANT within a single transaction, and the rehearsal is the only caller that invokes it more than once per transaction.

The builder opens with a single cleanup block that drops its temp tables so it can be re-run:

    supabase/migrations/20260811190000_issue97_authoritative_road_junction_graph.sql:3735-3747
      drop table if exists pg_temp.tmp_issue97_target_segments;
      drop table if exists pg_temp.tmp_issue97_segments;
      ... (extended to 21 drops by later migrations)

Against the LIVE, PINNED function (md5 = 06705f5b35a6d37151bb2c0dc5ade9bd):
- "create temporary table" occurrences: 22
- "drop table if exists pg_temp...." occurrences: 21
- Set difference: tmp_issue97_point_corroboration — created, never dropped.

Introduced by supabase/migrations/20260814161500_issue97_ogrip_corroborated_source_vertex.sql, which splices a new block in immediately before "create temporary table tmp_issue97_point_nodes" WITHOUT extending the cleanup block:

    -- 20260814161500_issue97_ogrip_corroborated_source_vertex.sql:41
    create temporary table tmp_issue97_point_corroboration on commit drop as
    ...
    -- :145-146
    create unique index tmp_issue97_point_corroboration_key_idx
      on tmp_issue97_point_corroboration(candidate_key);

It is UNCONDITIONAL STRAIGHT-LINE CODE: in the original builder the region tmp_issue97_point_raw -> tmp_issue97_point_identity -> tmp_issue97_point_nodes (20260811190000 lines 4131-4165) contains no if/else/loop construct at all, and the patch anchors into exactly that region (the patch itself asserts the anchor occurs exactly once). There is no IF NOT EXISTS on the create.

CONSEQUENCE: BEL succeeds and leaves tmp_issue97_point_corroboration in pg_temp (it is ON COMMIT DROP, and the transaction never commits). The CAR call then re-executes the same CREATE TEMPORARY TABLE and raises:

    ERROR: 42P07 relation "tmp_issue97_point_corroboration" already exists

With ON_ERROR_STOP, psql aborts; the transaction rolls back cleanly — NO PERSISTENT DAMAGE, BUT THE REHEARSAL CANNOT COMPLETE, after paying for one full BEL build.

WHY THIS HAS NEVER SURFACED:
1. Every real path builds ONE COUNTY PER TRANSACTION — ops/issue97-computer-rollout/sql/18-build-county-release.sql is "begin;" (line 43) -> one rebuild_county_graph(...) (line 61) -> "commit;" (line 65). That is how all 19 active OH graphs were built.
2. The only other multi-build caller, supabase/tests/issue97_road_junction_graph_synthetic.sql, calls the builder THREE TIMES in one transaction (lines 20, 405, 836) — so it is ALSO broken by this defect, and has evidently not been executed since 2026-08-14. PR #98's own body concedes the tree "still needs the final ... executable database regression pass."
3. NO CI WORKFLOW EXECUTES SQL AGAINST ANY DATABASE — the four workflows (deploy-v17-pages, security-checks, v17-2-release, v17-browser-audit) contain no psql, no DATABASE_URL, no reference to supabase/tests. Green CI on the exact head says nothing about builder re-entrancy.
4. None of the four audit .mjs scripts inspects the live builder body; they validate the tracked SQL text (statement ordering, digests, the serial 8-county plan) only.
5. The first tracked rehearsal died at SQL 34 BEFORE ANY BUILD (candidate rows produced: 0), and the phase-aware proof invoked NO builder at all. So the second-build path has genuinely never run.

## 7. GOOGLE / ROUTE / CUTOVER AUDIT

EXECUTED:
- The migration's own Google INVALIDATION path, on exactly 3 pinned pads: their private receipts are driven to status='stale', hold_reason='road_identity_mapping_changed', manifest_digest/dependency_digest NULL, with the pad columns moved in lockstep. Pad-id set digest pinned to 5cd68da6e31fa7bf5b59bca9935f96f2.
- The ALREADY-PENDING deferred constraint-trigger events are forced to fire mid-transaction.
- SQL 34 (read-only) and the eight dark builds.

NOT EXECUTED — AND ASSERTED NOT TO HAVE OCCURRED:
- ACTIVATION — every new build asserted status='validated' and activated_at IS NULL; every prior active build asserted still status='active' with unchanged activated_at.
- ROUTE RECONCILIATION — the five receipt families (candidates, occurrences, routes, transitions, geometry) are md5-snapshotted before and re-compared after; saved_road_reconciliation_runs count must be unchanged.
- GOOGLE PUBLICATION — brinesearch_driver_google_routes_public asserted = 0 at preflight, post-migration, and post-build; the refresh queue asserted empty (not exists AND count = 0); all non-target receipts and non-target pad Google columns compared by md5 against a pre-snapshot.
- CUTOVER — brinesearch_issue97_cutover_active() asserted false at preflight, post-migration, and post-build.
- WV / PA — asserted no WV/PA build carries release_generation_key = 'issue97-release-20260815-r2'.

Q9 — could deferred triggers cause an unexpected commit-time operation before ROLLBACK? NO. After-triggers queued as deferred fire at COMMIT; this transaction only ever reaches ROLLBACK, which discards them. The design goes further and deliberately fires the ALREADY-PENDING events early so their effect is observable AND rollback-able.

Q10 — is forcing IMMEDIATE then restoring DEFERRED correct? YES. SET CONSTRAINTS is transaction-local, so neither statement mutates persistent schema. Forcing immediate (line 731) drains the pending events inside the transaction; the block then asserts the target stale state is byte-identical to the pre-fire snapshot, the queue drained to zero, and non-target Google state unchanged. Restoring deferred (line 865) returns the transaction to production semantics for the eight builds that follow, and line 867 re-asserts the trigger's catalog metadata is still exactly one row with tgenabled='O', tgdeferrable, tginitdeferred. The final rehearsal block re-checks that same catalog predicate. Any queue rows created later by the builds would leave pending events — but there is no commit, and the queue is asserted empty at the end.

## 8. EXECUTION-WRAPPER AUDIT

Q12 — is the lightweight before/after wrapper sufficient? YES. The tracked SQL performs far stronger IN-TRANSACTION verification than any external wrapper could (whole-family md5 comparisons of every protected receipt table, per-build child-row digests, semantic multiset topology comparison keyed by stable_junction_key). The external wrapper's only remaining job is to prove ZERO PERSISTENT DELTA, which is a small fixed set of counts. Checkpoint 5337706353 demonstrates this runs in 2.096 s and returns exactly one JSON row. The critical constraint — already learned the hard way and confirmed by my own 30 s timeout reproducing it precisely — is that the postflight MUST NOT call brinesearch_issue97_graph_build_release_current for all eight graphs. One call alone needed a 240 s timeout in my session.

Q13 — is the 14-hour ceiling appropriate? Arithmetically consistent: set local statement_timeout='90min' x 8 build statements = 12 h, plus the migration, SQL 34 (~3 min based on the 196 s proof) and the assertion blocks. So 14 h is a defensible CEILING.

But it is the wrong thing to optimize, and it carries its own hazard: this is a WRITE TRANSACTION HELD OPEN ON PRODUCTION FOR UP TO 12-14 HOURS. It has already written to brinesearch_roads and brinesearch_road_identity_mappings, holds five advisory locks and FOR UPDATE row locks, and pins the xmin horizon — blocking autovacuum across the graph tables for the whole window, accumulating bloat, and locking out every other Issue #97 operation. Any network blip, client crash, or idle-timeout mid-run discards the entire run. lock_timeout='2min' also means any concurrent lock holder aborts the whole 14-hour effort. The eight-in-one-transaction shape is what creates this exposure; production itself never does it.

## 9. BLOCKERS

BLOCKER 1 — Builder is not re-entrant in a single transaction; the rehearsal will abort at CAR.

- Evidence (repo): supabase/migrations/20260814161500_issue97_ogrip_corroborated_source_vertex.sql:41 adds "create temporary table tmp_issue97_point_corroboration on commit drop as" (and :145-146 its unique index) into the builder, while the builder's cleanup block at supabase/migrations/20260811190000_issue97_authoritative_road_junction_graph.sql:3735-3747 (extended by later migrations to 21 drops) is NEVER extended with "drop table if exists pg_temp.tmp_issue97_point_corroboration;".
- Evidence (live, pinned function 06705f5b35a6d37151bb2c0dc5ade9bd): 22 "create temporary table" vs 21 "drop table if exists"; set difference is exactly {tmp_issue97_point_corroboration}.
- Trigger site: supabase/tests/issue97_frozen_exact_mapping_wave.sql:211-212 (the CAR statement, build_order = 2).
- Failure: ERROR: 42P07 relation "tmp_issue97_point_corroboration" already exists, after a completed BEL build.
- Not caught by: CI (executes no SQL), the four audit .mjs scripts (text-only), or any prior rehearsal (which never reached a second build).

Non-blocking defect (same root cause): supabase/tests/issue97_road_junction_graph_synthetic.sql calls the builder 3x in one transaction (lines 20, 405, 836) and is therefore also currently broken.

## 10. TOP FIVE FAILURE MODES

1. DUPLICATE TEMP TABLE AT THE SECOND BUILD — CERTAINTY, NOT RISK. tmp_issue97_point_corroboration unguarded in the live builder; 42P07 at issue97_frozen_exact_mapping_wave.sql:211 (CAR). Costs one full BEL build, then aborts. (Blocker 1.)

2. FROZEN ROAD-ROW PRESTATE DRIFT, BEFORE ANY BUILD. 20260817193212...:445-464 updates each of the 37 target roads with "and pg_catalog.md5(pg_catalog.to_jsonb(road)::text)=v_road.expected_road_row_md5", raising 'Issue #97 frozen highway road prestate changed: %' on not found. Any change to ANY COLUMN of those rows since the digests were frozen — including an updated_at touched by unrelated activity — aborts the run inside the migration. This is a whole-row pin against live production and is the most drift-sensitive gate in the sequence.

3. A 12-14 HOUR OPEN WRITE TRANSACTION ON PRODUCTION. Blocks autovacuum on the graph tables, accumulates bloat, holds five advisory locks plus FOR UPDATE row locks, and makes the entire run hostage to one network blip or idle timeout. lock_timeout='2min' means one concurrent lock holder discards the whole effort. Nothing about the run is resumable — there is no retry by design.

4. safety_state_ok SELF-TRIP FROM THE OPERATOR'S OWN MONITORING SESSION. SQL 34's final conjunct fails if ANY backend other than the running one has application_name LIKE 'brinesearch-issue97-%' and state <> 'idle'. A second psql window opened to watch progress, or a still-draining prior connection, produces a fail-closed division-by-zero — the same symptom as 5336784170, with a completely different cause. It is also a live race, re-evaluated at SQL 34 time.

5. TOPOLOGY ASSERTION TRIPPED BY REFRESHES RUNNING INSIDE EACH BUILD. The builder calls brinesearch_issue97_refresh_oh_identities(v_county) and brinesearch_issue97_refresh_exact_mappings() on EVERY invocation (20260811190000...:3732-3733), before its cleanup block. If either introduces mapping/identity rows for non-target identities, the non-target membership comparison in issue97_frozen_exact_mapping_wave.sql:346-370 raises 'Issue #97 rebuilt graph changed source topology beyond exact mapping road IDs'. The 19 existing OH graphs suggest these refreshes are at a fixed point, but that has never been demonstrated with the 46 frozen mappings installed.

## 11. SMALLEST SAFE PLAN

DO NOT TOUCH THE PRODUCTION BUILDER. Fixing rebuild_county_graph properly would change pg_get_functiondef, which is pinned in at least three places (issue97_frozen_exact_mapping_wave.sql:16-18; the active r2 generation's builder_definition_md5; the new-candidate assertion details->>'release_builder_md5'='06705f5b...'). Rotating that md5 into a new generation would make ALL 19 ACTIVE OH GRAPHS fail the release_current fast path — collapsing the preinstall release_current = 8 contract. The blast radius is far larger than the defect.

The minimal correct fix is TEST-FILE-ONLY, leaving the pinned function byte-identical:

1. In supabase/tests/issue97_frozen_exact_mapping_wave.sql, insert before EACH of the eight build statements (lines 209-225):

       drop table if exists pg_temp.tmp_issue97_point_corroboration;

   This is semantically identical to the treatment the builder's own cleanup block already gives the other 21 temp tables — the table is rebuilt from scratch by "create ... as select" on every call and consumed within that call; dropping it also drops its unique index. The builder md5, the release generation, and every digest pin remain untouched.

2. Apply the same one-line guard between the three builder calls in supabase/tests/issue97_road_junction_graph_synthetic.sql (before lines 405 and 836), restoring that regression.

3. Re-run the four static audit .mjs scripts plus CI on the new head. Confirm audit-issue97-frozen-exact-mapping-wave.mjs:241 still validates the exact serial rebuild plan.

4. RUN A TWO-COUNTY CANARY FIRST — BEL + CAR ONLY, as a trimmed copy of the tracked rehearsal with the same migration, the same SQL 34, and the same final rollback. This is the whole point: it proves the COMPOSITION property (second-call re-entrancy, cross-county interference, the deferred-trigger restore holding across builds) at roughly one quarter of the time and exposure. It is the only claim the 8-county run makes that one-county-per-transaction production runs do not already prove.

5. Only if the canary is clean, and with a quiet window agreed (no second brinesearch-issue97-* connection, per failure mode 4), run the full eight.

6. Add a durable guard against recurrence: extend one static audit to parse pg_get_functiondef for the builder and assert count(create temporary table) == count(drop table if exists). This defect class is invisible to every check that exists today.

## 12. EXPLICIT ANSWERS

- Safe to launch now? NO
- Repository modification needed first? YES — test-file-only (supabase/tests/issue97_frozen_exact_mapping_wave.sql, plus issue97_road_junction_graph_synthetic.sql). No migration, no production function change.
- Production write authorized? NO
- Activation / reconciliation / Google / cutover / merge authorized? NO
- Another independent audit needed before rehearsal? NO, provided the change is exactly the minimal guard above, the static audits and CI pass on the new head, and the two-county canary runs first. A full external re-audit is not warranted for an eight-line test-file change; the canary is the stronger evidence.

Answers to the numbered audit questions:
- Q1: YES — one begin / one rollback / zero COMMIT.
- Q2: YES — no escape; plpgsql function, no CALL, no HTTP/NOTIFY/dblink/pg_cron, advisory locks transaction-scoped.
- Q3: YES — serial and exactly the eight counties.
- Q4: NO activation/reconciliation/Google publication/cutover/WV/PA.
- Q5: YES — correct in both phases.
- Q6: NO other predicate at risk (unpinned_current_candidates=0 verified live).
- Q7: YES — guaranteed by explicit assertions on status, activated_at, new graph_digest, new mapping_snapshot_digest, and the non-target topology multiset comparison.
- Q8: YES — "=1565" plus "road_id is distinct from mapping.road_id" must not exist, plus the non-target-identity membership digest equality.
- Q9: NO.
- Q10: YES, correct.
- Q11: NO persistent state (empirically proven).
- Q12: YES, sufficient.
- Q13: Defensible ceiling, but the 8-in-one-transaction shape is the real hazard.
- Q14: YES — the two-county canary.
- Q15: The wrapper is now right-sized; the residual over-engineering is running all eight counties in one transaction when production never does, which buys a 14-hour exposure window for a composition property a 2-county run establishes.
- Q16: See section 10.
- Q17: NO.
- Q18: NO.

## 13. STOP

Read-only throughout. No repository, GitHub, Supabase, or production state was modified: no commits, branches, pushes, comments, labels, or workflow triggers; every SQL statement was a SELECT/catalog read inside BEGIN TRANSACTION READ ONLY ending in ROLLBACK. The rehearsal was not run and public.brinesearch_issue97_rebuild_county_graph was never called. brinesearch_issue97_graph_build_release_current was invoked exactly ONCE, for a single build, with an adequate timeout — not repeatedly across all eight. No credentials or secrets were requested, displayed, or written anywhere.

One deviation to note: my final verification query was denied by permission prompt, so I resolved the remaining question (whether the corroboration create is conditional) from repository source instead, which settles it as unconditional straight-line code. No secondary attempt was made.
