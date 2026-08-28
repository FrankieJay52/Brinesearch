# Batch 0 Ascent six-county navigation ledger — 2026-08-27
- Base origin/main SHA: `7d60be2c3d0e85580e495b40ab067cbb7f869e9f`
- Candidate implementation HEAD: `334083e99fc8ea90beed7aa43fdffa8220398730`
- Candidate content SHA-256: `f3d1a0e781eb4d981b379619edb5614909b5054ec50f48478115dc7fc0cf2c84`
- Uncommitted non-generated changes: **no**
- 247 / 1 graph-approved / 8 approved-core+GPS / 192 GPS-only / 46 owner-approved handoffs with graph held
- Production writes zero
- ALBATROSS + ATHENA + BAKOS + BANNOCK + BEETLE + BILINOVICH + BRAVO + CASTON + CIRCLE-OAKS + CROWIE + DUKE + DUTTON + ECHO + GIL + GILCHER + HASTINGS + HOOP + JACKALOPE + JEFFCO + KUNGLE A + KUNGLE B + LAKE + LAWSON + LODESTAR + LODGE + LORRAINE + MALDON + MATUSEK + MOONSTONE + NORTH STAR + PANG + PICKENS + PORTERFIELD B + PORTERFIELD GAS UNIT + ROCK RIDGE + RUTH + SADLER + SKULL FORK + THOMAS + TOWE + TROYER + TRUCHAN NE + TRUCHAN NW + WHEELING VALLEY + WINSTON SMITH + WITHEY: `reviewed_handoff_authority_held`

This candidate ledger binds the 247 current Ascent pads in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties to production directory snapshot `68f1d076-fe03-4519-a5cd-c68f8a28b06c` and source revision `8`. It describes candidate implementation content based on origin/main; it does not claim that unmerged work is already on main.

## Candidate implementation files

- `supabase/migrations/20260828220318_v18_timberwolf_owner_verified_access_route.sql`
- `v18/src/data/googleDestination.ts`
- `v18/src/data/googleRoute.test.ts`
- `v18/src/data/googleRoute.ts`
- `v18/src/data/offlineRouteModel.test.ts`
- `v18/src/data/ownerVerifiedAccessFixture.ts`
- `v18/src/data/routeLineGroups.test.ts`
- `v18/src/data/routeLineGroups.ts`
- `v18/src/data/status.test.ts`
- `v18/src/data/status.ts`
- `v18/src/data/timberwolfOwnerAccessRouteMigration.test.ts`
- `v18/src/data/types.ts`
- `v18/src/features/map/MapPage.test.ts`
- `v18/src/features/map/MapPage.tsx`
- `v18/src/features/pad/PadMapPreview.tsx`
- `v18/src/features/pad/PadPage.test.ts`
- `v18/src/features/pad/PadPage.tsx`

## Counts

- State 1 — Reviewed approved route: **1**
- State 2 — Approved roads then GPS: **8**
- State 3 — GPS destination only: **192**
- Owner-approved directions with graph/public authority held: **46**
- No trusted GPS: **0**
- Exactly one navigation action destination: **247**

| County | Pads | State 1 | State 2 | State 3 | Owner-approved / graph-held | No GPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Belmont | 77 | 0 | 0 | 58 | 19 | 0 |
| Guernsey | 44 | 0 | 0 | 31 | 13 | 0 |
| Harrison | 49 | 1 | 8 | 32 | 8 | 0 |
| Jefferson | 66 | 0 | 0 | 64 | 2 | 0 |
| Monroe | 1 | 0 | 0 | 1 | 0 | 0 |
| Noble | 10 | 0 | 0 | 6 | 4 | 0 |

## GPS source accounting

The required `gps_source` column describes the coordinate used by the Navigate action: saved **230**, ODNR pad **12**, ODNR wellhead **5**, missing **0**. The separate `directory_gps_source` column preserves the canonical public-directory source: saved **231**, ODNR pad **11**, ODNR wellhead **5**, missing **0**.

BILINOVICH is the one deliberate distinction: its frozen PR #174 handoff navigates to the ODNR pad-surface destination `40.08738445, -81.30282620`; its current directory reference remains the saved lease-approach coordinate `40.08863, -81.304164`. Neither coordinate is called an entrance. The frozen URL and receipt remain unchanged, and Blaze Road remains excluded.

## Authority boundary

- The phone's current location is the origin. State 3 URLs contain no origin or waypoint.
- State 1 is limited to Cologie's exact clipped public route and reviewed Google handoff.
- State 2 draws approved public-road geometry only to its exact handoff. Its lease/pin leg is GPS-only.
- State 3 uses an exact saved or ODNR coordinate without approving Google's chosen roads.
- The owner explicitly approved the 46 exact-record Google direction handoffs on 2026-08-28. Twenty-eight have exact named-road identity evidence; eighteen retain validated Google-handoff evidence while their exact graph-line receipts are completed. This owner-approved presentation does not create graph geometry, a public-Google release, or an approved-road overlay.
- Named-road-to-pin driver rule: a reviewed handoff succeeds when Google stays on the directed state, US, county, or township roads in order and then reaches the exact trusted pin. A different road before those directed roads finish is a failure; add an exact turn control on the named road only when that failure is proven. Do not invent a pad-deck coordinate or name/approve lease geometry.
- SKULL FORK remains frozen at Cadiz Road / US-22 → Repik Lane / TR-9876 → its exact trusted pin. Owner live proof and current Google turn-list QA both followed that sequence. Its URL, destination, and control are unchanged.
- The reviewed-handoff scan found no current frozen link with evidence that Google leaves a required named road. Superseded or rejected failures remain excluded/GPS-only; working reviewed links remain unchanged.
- ALBATROSS, ATHENA, BAKOS, BANNOCK, BEETLE, BILINOVICH, BRAVO, CASTON, CIRCLE-OAKS, CROWIE, DUKE, DUTTON, ECHO, GIL, GILCHER, HASTINGS, HOOP, JACKALOPE, JEFFCO, KUNGLE A, KUNGLE B, LAKE, LAWSON, LODESTAR, LODGE, LORRAINE, MALDON, MATUSEK, MOONSTONE, NORTH STAR, PANG, PICKENS, PORTERFIELD B, PORTERFIELD GAS UNIT, ROCK RIDGE, RUTH, SADLER, SKULL FORK, THOMAS, TOWE, TROYER, TRUCHAN NE, TRUCHAN NW, WHEELING VALLEY, WINSTON SMITH, and WITHEY display owner-approved directions while retaining the fail-closed technical state `reviewed_handoff_authority_held`: their exact record-bound handoffs remain separate from graph/public-Google authority. That presentation approval does not promote graph geometry or public-Google authority.
- Written directions are not converted into geometry, and ODNR points are never labeled as entrances.
- The public reference projection SHA-256 is `1dfa303193d52cff7e6cefe358afca52d1e4406e9378d16ac993f1482e0f3e45`.
- The generated CSV SHA-256 is `e571e4081dc8996ca8648e817e00b9b7585bf2177c6b9750275f7bb7dbfa6136`.
- Production database writes for this ledger: **0**.

Regenerate from the current live public contracts with `npm --prefix v18 run audit:batch0-navigation -- --write`. The audit performs one request per page/contract and has no retry path.
