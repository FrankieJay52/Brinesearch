# BrineSearch V17.3.5 — Driver Approach Reference

## Goal

Give drivers a useful, auditable starting-road reference without guessing ambiguous numbered roads or private-road mileage.

The displayed reference is the closest road or route point that BrineSearch can defend from saved haul directions, Road Manager evidence, or official OH/WV/PA road data. It is not simply the geographically closest highway.

## All-pad audit

The private audit and finalized safe public table cover all 1,173 BrineSearch pad/facility records.

- 1,173 total records
- 0 records left in review
- 678 publishable numeric driver distances
  - 546 verified/saved exact distances
  - 132 approximate saved/measured distances
- 3 saved mileage ranges preserved as ranges
- 7 records located directly on a verified road or at an explicit route marker
- 374 records where mileage could not be safely verified
- 61 records with insufficient route evidence
- 44 records with research-only nearest-highway references that are not allowed to become driver routes
- 6 records blocked because route/location evidence conflicts
- 0 private-reference leaks in the public table

The final road-alignment pass moved stale highway labels forward to the actual verified public road where official evidence supported it. Where the final local road could not be uniquely verified, the prior verified highway remains the anchor and the card stores the exact departure/reference point plus the complete downstream saved mileage. No numeric mileage is silently paired with the wrong road.

The private staging audit contains one additional intermediate numeric value for Gulfport Shannon, but it is deliberately not published because the saved 2.0 miles ends at another turn before the pad. The safe public table therefore contains 678 numeric driver distances.

No midpoint is invented for saved ranges. No straight-line distance is shown as road mileage. No private or lease-road mileage is inferred from a pad-center coordinate.

## Driver card

A new `Approach Reference` card appears immediately before Clear Directions on the selected pad page.

Typical examples:

- `FROM OH-800` / `4.5 mi` / `TO PAD / ACCESS`
- `FROM Barton Rd / CR-4` / `1.6 mi`
- `FROM Fulton Hill Rd / CR-42` / `0.3 mi`
- `FROM Chapel Dr / CR-20` / `On this road`
- `FROM CR-15` / `3.0–4.0 mi`
- `OH-151` / `at mile marker 9`

If a verified highway is the last defensible anchor before an unverified local road, the card also shows the departure/reference point so the mileage cannot be mistaken for mileage traveled along the highway.

If mileage cannot be verified, the card says `Mileage not verified` rather than generating a number.

Research-only nearest highways do not expose the straight-line measurement as a driving instruction. Route conflicts display a warning instead of a route.

## Data boundary

The browser reads only `public.brinesearch_driver_route_reference`, a deliberately small safe table. It contains the finalized driver-facing fields only:

- pad id / legacy id
- safe anchor name and road kind
- finalized distance or display text
- finalized status
- reference-point text
- generic evidence-source label

Private staging notes, candidate roads, raw official feature metadata, review evidence, and straight-line research distances remain in `private_verification` and are not published to the browser.

Post-migration security validation confirmed:

- all 1,173 safe rows are present
- anonymous users have SELECT only
- anonymous INSERT/UPDATE/DELETE are denied
- anonymous refresh-RPC execution is denied
- research-only, no-route, and blocked rows expose no private anchor name, numeric distance, or reference point

## Refresh system

`public.refresh_driver_route_reference()` is owner/service-only. It republishes the safe table from the finalized private mileage audit after future review work. Anonymous and ordinary authenticated users have read-only access to the safe table and no write access.

## Production migration

Supabase applied the rollout as:

`20260808202232_driver_route_reference_v1735`

The repository records the same versioned migration so future migration runners do not replay the already-applied schema change.

## Compatibility

V17.3.5 is based on the current V17.3.4 main branch, including the official public-data pad snapshot card. Clear Directions and the saved navigation point are unchanged.
