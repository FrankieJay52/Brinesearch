# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: `bc6277059b68779930e1eaad4a3dd32bb413a507`
- Candidate implementation HEAD: `b32dde91b0e98a52b1398b12396a3e8a5309a3b8`
- Candidate content SHA-256: `e32cd200f9627345e1fc781a4a75ff1b403412f8e5f930ac7b99d691c4c28911`
- Uncommitted non-generated changes: **no**
- 247 / 59 DONE reviewed named-road handoffs / 188 GPS_ONLY
- Production writes zero

This candidate ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot `68f1d076-fe03-4519-a5cd-c68f8a28b06c` and source revision `8`. It describes candidate implementation content based on origin/main; it does not claim that unmerged work is already on main.

## Candidate implementation files

- `docs/V18_NAMED_ROAD_NAVIGATION_CONTRACT.md`
- `docs/issue97-owner-approved-directions-presentation-20260828.md`
- `v18/scripts/audit-batch0-ascent-navigation.mjs`
- `v18/scripts/audit-batch0-ascent-navigation.test.mjs`
- `v18/scripts/audit-v18-named-road-navigation-contract.mjs`
- `v18/scripts/verify-built-runtime.mjs`
- `v18/src/data/ascentBatch0NavigationLedger.test.ts`
- `v18/src/data/ascentExistingIdentityNavigationBatch1.test.ts`
- `v18/src/data/ascentExistingIdentityNavigationBatch1.ts`
- `v18/src/data/reviewedNavigationCandidates.ts`
- `v18/src/features/map/MapPage.test.ts`
- `v18/src/features/map/MapPage.tsx`
- `v18/src/features/map/ascentPadRedContinuations.test.ts`
- `v18/src/features/map/ascentPadRedContinuations.ts`
- `v18/src/features/map/ascentPadRoadLayers.test.ts`
- `v18/src/features/map/ascentPadRoadLayers.ts`
- `v18/src/features/map/carlosRedContinuation.json`

## Counts

- DONE — reviewed ordered named roads to the saved or frozen destination pin: **59**
- GPS_ONLY — no reviewed named-road sequence yet: **188**
- No trusted GPS: **0**
- Exactly one navigation action destination: **247**

| County | Pads | DONE | GPS_ONLY | No GPS |
| --- | ---: | ---: | ---: | ---: |
| Belmont | 77 | 20 | 57 | 0 |
| Guernsey | 44 | 15 | 29 | 0 |
| Harrison | 49 | 17 | 32 | 0 |
| Jefferson | 66 | 2 | 64 | 0 |
| Monroe | 1 | 0 | 1 | 0 |
| Noble | 10 | 5 | 5 | 0 |

## Parked promotion provenance

The retained `current_state` values are audit provenance only: State 1 **1**, State 2 **8**, legacy GPS state **188**, reviewed-handoff / graph-held **46**, and reviewed existing-identity hooks **4**. They are not everyday driver grades or Navigate blockers. The twenty State-1 gates stay parked unless a later owner instruction explicitly says `PROMOTE <PAD NAME> TO STATE 1`.

## GPS source accounting

The required `gps_source` column describes the coordinate used by the Navigate action: saved **230**, ODNR pad **12**, ODNR wellhead **5**, missing **0**. The separate `directory_gps_source` column preserves the canonical public-directory source: saved **231**, ODNR pad **11**, ODNR wellhead **5**, missing **0**.

BILINOVICH is the one deliberate distinction: its frozen PR #174 handoff navigates to the ODNR pad-surface destination `40.08738445, -81.30282620`; its current directory reference remains the saved lease-approach coordinate `40.08863, -81.304164`. Neither coordinate is called an entrance. The frozen URL and receipt remain unchanged, and Blaze Road remains excluded.

## Authority boundary

- The phone's current location is the origin. GPS_ONLY URLs contain no origin or waypoint.
- One everyday rule applies to every pad: if Google follows the reviewed directed named public roads in order to the saved pin, the pad is DONE. Cologie is the first working pad, not a higher grade.
- The 59 reviewed named-road handoffs are DONE for everyday navigation. Missing graph occurrence counts, survey geometry, junction receipts, private manifests, State-1 owner release, or exact-graph geometry do not withhold Navigate.
- The remaining 188 pads have no reviewed named-road sequence yet and therefore remain GPS_ONLY. This audit does not stamp a route onto any of them.
- After the last reviewed named public road, an unnamed lease or dirt tail may continue to the destination pin. The ledger does not name, approve, or invent that tail.
- The existing build-time Ascent display catalog remains bound to its 55 proved display routes: 46 immutable reviewed handoffs plus 9 existing database releases. The four new identity hooks grant Navigate only and do not fabricate teal. Solid teal shows only already-proved routable geometry; an optional thin solid neutral `unapproved_gps_tether` reaches the frozen GPS without a road name or approval. Browser routing at runtime, production writes, graph/public-Google promotion, and cutover remain zero.
- Red remains a non-highway road-after-last-pad reference, not approval or a closure: BANNOCK continues by Black Oak Road to OH-149, and CARLOS continues on the exact Airport Road / CR-82 topology to US-40. The separate CARLOS artifact does not color its GPS offset or change its GPS-only Navigate state.
- Named-road-to-pin driver rule: a reviewed handoff succeeds when Google stays on the directed state, US, county, or township roads in order and then reaches the exact trusted pin. A different road before those directed roads finish is a failure; add an exact turn control on the named road only when that failure is proven. Do not invent a pad-deck coordinate or name/approve lease geometry.
- SKULL FORK remains frozen at Cadiz Road / US-22 → Repik Lane / TR-9876 → its exact trusted pin. Owner live proof and current Google turn-list QA both followed that sequence. Its URL, destination, and control are unchanged.
- The reviewed-handoff scan found no current frozen link with evidence that Google leaves a required named road. Superseded or rejected failures remain excluded/GPS-only; working reviewed links remain unchanged.
- The legacy `reviewed_handoff_authority_held` token remains parked provenance for 46 record-bound handoffs. It does not hold everyday Navigate or make those working handoffs a lower grade.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is `1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45`.
- The generated CSV SHA-256 is `10f0ed8245c5822cc6ebb2675f990c4b3eb1868d24cadc1dd679416d2d85368b`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with `npm --prefix v18 run audit:batch0-navigation -- --write`. The audit performs one request per page/contract and has no retry path.
