# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: `313967a8014bfb358d796c415183e39d3ad31fbf`
- Candidate implementation HEAD: `9512fe08daf319ce61ae84945e87c17d2a3d7547`
- Candidate content SHA-256: `3dd72c0ba4b50da5ba01742f21f3bc30d486da20f442f078c496fd554d001321`
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
- `v18/src/data/ascentBatch0NavigationLedger.test.ts`
- `v18/src/data/ascentSavedDirectionExactMatchBatch1.test.ts`
- `v18/src/data/ascentSavedDirectionExactMatchBatch1.ts`
- `v18/src/data/reviewedNavigationCandidates.test.ts`
- `v18/src/data/reviewedNavigationCandidates.ts`
- `v18/src/features/map/MapApprovedRouteLink.test.ts`
- `v18/src/features/map/MapApprovedRouteLink.tsx`
- `v18/src/features/pad/PadPage.test.ts`
- `v18/src/features/pad/PadPage.tsx`

## Counts

- DONE — reviewed ordered named roads to the saved or frozen destination pin: **59**
- GPS_ONLY — no reviewed named-road sequence yet: **188**
- No trusted GPS: **0**
- Exactly one navigation action destination: **247**

| County | Pads | DONE | GPS_ONLY | No GPS |
| --- | ---: | ---: | ---: | ---: |
| Belmont | 77 | 21 | 56 | 0 |
| Guernsey | 44 | 15 | 29 | 0 |
| Harrison | 49 | 17 | 32 | 0 |
| Jefferson | 66 | 2 | 64 | 0 |
| Monroe | 1 | 0 | 1 | 0 |
| Noble | 10 | 4 | 6 | 0 |

## Parked promotion provenance

The retained `current_state` values are audit provenance only: State 1 **1**, State 2 **8**, legacy GPS state **188**, and reviewed-handoff / graph-held **50**. They are not everyday driver grades or Navigate blockers. The twenty State-1 gates stay parked unless a later owner instruction explicitly says `PROMOTE <PAD NAME> TO STATE 1`.

## GPS source accounting

The required `gps_source` column describes the coordinate used by the Navigate action: saved **230**, ODNR pad **12**, ODNR wellhead **5**, missing **0**. The separate `directory_gps_source` column preserves the canonical public-directory source: saved **231**, ODNR pad **11**, ODNR wellhead **5**, missing **0**.

BILINOVICH is the one deliberate distinction: its frozen PR #174 handoff navigates to the ODNR pad-surface destination `40.08738445, -81.30282620`; its current directory reference remains the saved lease-approach coordinate `40.08863, -81.304164`. Neither coordinate is called an entrance. The frozen URL and receipt remain unchanged, and Blaze Road remains excluded.

## Authority boundary

- The phone's current location is the origin. GPS_ONLY URLs contain no origin or waypoint.
- One everyday rule applies to every pad: if Google follows the reviewed directed named public roads in order to the saved pin, the pad is DONE. Cologie is the first working pad, not a higher grade.
- The 59 existing reviewed named-road handoffs are DONE for everyday navigation. Missing graph occurrence counts, survey geometry, junction receipts, private manifests, State-1 owner release, or exact-graph geometry do not withhold Navigate.
- The remaining 188 pads have no reviewed named-road sequence yet and therefore remain GPS_ONLY. This audit does not stamp a route onto any of them.
- After the last reviewed named public road, an unnamed lease or dirt tail may continue to the destination pin. The ledger does not name, approve, or invent that tail.
- The frozen build-time Ascent display catalog remains exactly 55 pads: 46 immutable owner-receipted reviewed handoffs plus 9 existing database releases. Four additional reviewed highway-direct handoffs remain linked to their existing records in the separate 192-record batch-2 approach catalog; that does not add them to or modify the 55-pad display catalog. The frozen catalog reuses exact public graph geometry where present and otherwise reconstructs the routable network offline through frozen controls without changing a Google URL or waypoint. Solid teal shows only that routable network; an optional thin solid neutral `unapproved_gps_tether` reaches the frozen GPS without a road name or approval. All 55 catalog entries persist on All/Ascent and brighten on selection; another-company and disposal-only filters hide them. BANNOCK's separately proved exit is the only red continuation, and Interstate, US, and state routes are never red. Browser routing, coordinate hashing, production writes, graph/public-Google promotion, and cutover remain zero.
- Named-road-to-pin driver rule: a reviewed handoff succeeds when Google stays on the directed state, US, county, or township roads in order and then reaches the exact trusted pin. A different road before those directed roads finish is a failure; add an exact turn control on the named road only when that failure is proven. Do not invent a pad-deck coordinate or name/approve lease geometry.
- SKULL FORK remains frozen at Cadiz Road / US-22 → Repik Lane / TR-9876 → its exact trusted pin. Owner live proof and current Google turn-list QA both followed that sequence. Its URL, destination, and control are unchanged.
- The reviewed-handoff scan found no current frozen link with evidence that Google leaves a required named road. Superseded or rejected failures remain excluded/GPS-only; working reviewed links remain unchanged.
- The legacy `reviewed_handoff_authority_held` token remains parked provenance for 50 record-bound handoffs: 46 immutable owner-receipted handoffs plus 4 reviewed highway-direct handoffs with no owner receipt. It does not hold everyday Navigate or make those working handoffs a lower grade.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is `1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45`.
- The generated CSV SHA-256 is `bc358ce2a307a008de485b14099e9485379aa202eb290bf7b51bc134629c7a42`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with `npm --prefix v18 run audit:batch0-navigation -- --write`. The audit performs one request per page/contract and has no retry path.
