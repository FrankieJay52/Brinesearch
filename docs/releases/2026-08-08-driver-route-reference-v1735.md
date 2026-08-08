# BrineSearch V17.3.5 — Driver Approach Reference

## Goal

Give drivers a useful, auditable starting-road reference without guessing ambiguous numbered roads or private-road mileage.

The displayed reference is the closest road or route point that BrineSearch can defend from saved haul directions, Road Manager evidence, or official OH/WV/PA road data. It is not simply the geographically closest highway.

## All-pad audit

The private audit covers all 1,173 BrineSearch pad/facility records.

- 1,173 total records
- 0 records left in review
- 679 records with a numeric saved/measured distance
- 3 records with a saved mileage range preserved as a range
- 7 records located directly on a verified road or at an explicit route marker
- 44 records with research-only nearest-highway references that are not allowed to become driver routes
- 317 records where a safe road reference exists but the remaining mileage is not verified
- 61 records with insufficient route evidence
- 6 records blocked because route/location evidence conflicts

No midpoint is invented for saved ranges. No straight-line distance is shown as road mileage. No private or lease-road mileage is inferred from a pad-center coordinate.

## Driver card

A new `Approach Reference` card appears immediately before Clear Directions on the selected pad page.

Typical examples:

- `FROM OH-800` / `4.5 mi` / `TO PAD / ACCESS`
- `FROM Barton Rd / CR-4` / `1.6 mi`
- `FROM Chapel Dr / CR-20` / `On this road`
- `FROM CR-15` / `3.0–4.0 mi`
- `OH-151` / `at mile marker 9`

If the road is known but mileage is not verified, the card says `Mileage not verified` rather than generating a number.

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

## Refresh system

`public.refresh_driver_route_reference()` is owner/service-only. It republishes the safe table from the finalized private mileage audit after future review work. Anonymous and ordinary authenticated users have read-only access to the safe table and no write access.

## Compatibility

V17.3.5 is based on the current V17.3.4 main branch, including the official public-data pad snapshot card. Clear Directions and the saved navigation point are unchanged.
