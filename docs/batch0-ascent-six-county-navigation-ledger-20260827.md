# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: `bc6277059b68779930e1eaad4a3dd32bb413a507`
- Candidate implementation HEAD: `82268c6cebde7048361c8948aabf6095d218921c`
- Candidate content SHA-256: `0e27dc21ce37817297ff77e00a2a8ebc3fe50c8857acdb9056100e7d11546624`
- Uncommitted non-generated changes: **no**
- 247 / 80 DONE named-road handoffs / 167 GPS_ONLY
- Production writes zero

This candidate ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot `68f1d076-fe03-4519-a5cd-c68f8a28b06c` and source revision `8`. It describes candidate implementation content based on origin/main; it does not claim that unmerged work is already on main.

## Candidate implementation files

- `v18/package.json`
- `v18/scripts/audit-batch0-ascent-navigation.mjs`
- `v18/scripts/audit-batch0-ascent-navigation.test.mjs`
- `v18/scripts/generate-ascent-existing-identity-navigation-batch2.mjs`
- `v18/src/data/ascentBatch0NavigationLedger.test.ts`
- `v18/src/data/ascentExistingIdentityNavigationBatch2.json`
- `v18/src/data/ascentExistingIdentityNavigationBatch2.test.ts`
- `v18/src/data/ascentExistingIdentityNavigationBatch2.ts`
- `v18/src/data/reviewedNavigationCandidates.ts`

## Counts

- DONE — reviewed ordered named roads to the saved or frozen destination pin: **80**
- GPS_ONLY — no reviewed named-road sequence yet: **167**
- No trusted GPS: **0**
- Exactly one navigation action destination: **247**

| County | Pads | DONE | GPS_ONLY | No GPS |
| --- | ---: | ---: | ---: | ---: |
| Belmont | 77 | 27 | 50 | 0 |
| Guernsey | 44 | 19 | 25 | 0 |
| Harrison | 49 | 19 | 30 | 0 |
| Jefferson | 66 | 9 | 57 | 0 |
| Monroe | 1 | 0 | 1 | 0 |
| Noble | 10 | 6 | 4 | 0 |

## Parked promotion provenance

The retained `current_state` values are audit provenance only: State 1 **1**, State 2 **8**, legacy GPS state **167**, reviewed-handoff / graph-held **46**, and existing-identity driver hooks **25**. They are not everyday driver grades or Navigate blockers. The twenty State-1 gates stay parked unless a later owner instruction explicitly says `PROMOTE <PAD NAME> TO STATE 1`.

## GPS source accounting

The required `gps_source` column describes the coordinate used by the Navigate action: saved **230**, ODNR pad **12**, ODNR wellhead **5**, missing **0**. The separate `directory_gps_source` column preserves the canonical public-directory source: saved **231**, ODNR pad **11**, ODNR wellhead **5**, missing **0**.

BILINOVICH is the one deliberate distinction: its frozen PR #174 handoff navigates to the ODNR pad-surface destination `40.08738445, -81.30282620`; its current directory reference remains the saved lease-approach coordinate `40.08863, -81.304164`. Neither coordinate is called an entrance. The frozen URL and receipt remain unchanged, and Blaze Road remains excluded.

## Authority boundary

- The phone's current location is the origin. GPS_ONLY URLs contain no origin or waypoint.
- One everyday rule applies to every pad: if Google follows the reviewed directed named public roads in order to the saved pin, the pad is DONE. Cologie is the first working pad, not a higher grade.
- The 80 named-road handoffs are DONE for everyday navigation. Missing graph occurrence counts, survey geometry, junction receipts, private manifests, State-1 owner release, or exact-graph geometry do not withhold Navigate.
- The remaining 167 pads have no passing named-road handoff yet and therefore remain GPS_ONLY. This audit does not stamp a route onto any of them. VANNELLE remains in this group because its recorded Shepherdstown control backtracked to OH-9.
- After the last reviewed named public road, an unnamed lease or dirt tail may continue to the destination pin. The ledger does not name, approve, or invent that tail.
- The existing build-time Ascent display catalog remains scoped to its previously receipted 55 pads. These new existing-identity hooks add no geometry or teal; Navigate may exist without a display line. Solid teal remains governed only by already-receipted network geometry, and no GPS tether receives a road name or approval. BANNOCK's separately proved exit remains the only red continuation, and Interstate, US, and state routes are never red. Browser routing, coordinate hashing, production writes, graph/public-Google promotion, and cutover remain zero.
- Named-road-to-pin driver rule: a reviewed handoff succeeds when Google stays on the directed state, US, county, or township roads in order and then reaches the exact trusted pin. A different road before those directed roads finish is a failure; add an exact turn control on the named road only when that failure is proven. Do not invent a pad-deck coordinate or name/approve lease geometry.
- SKULL FORK remains frozen at Cadiz Road / US-22 → Repik Lane / TR-9876 → its exact trusted pin. Owner live proof and current Google turn-list QA both followed that sequence. Its URL, destination, and control are unchanged.
- The reviewed-handoff scan found no current frozen link with evidence that Google leaves a required named road. Superseded or rejected failures remain excluded/GPS-only; working reviewed links remain unchanged.
- The legacy `reviewed_handoff_authority_held` token remains parked provenance for 46 record-bound handoffs. It does not hold everyday Navigate or make those working handoffs a lower grade.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is `1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45`.
- The generated CSV SHA-256 is `2c7dacb8653ef777481ed7d67974460600292317c1e856682c01f2276eab125f`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with `npm --prefix v18 run audit:batch0-navigation -- --write`. The audit performs one request per page/contract and has no retry path.
