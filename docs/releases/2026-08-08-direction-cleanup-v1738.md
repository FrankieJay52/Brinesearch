# BrineSearch V17.3.8 — Driver Direction Cleanup

V17.3.8 cleans the driver-facing direction cards and copied directions without rewriting the saved source directions in Supabase.

## What changes

- Removes transient landmark identifiers such as cemeteries, churches, schools, houses, stores, mailboxes, storage units, political yard signs, and similar visual landmarks from driver-facing directions when the road/turn itself remains identifiable.
- Keeps actual road names even when a road name contains words such as `Church` or `Cemetery`.
- Keeps mileage attached to the maneuver/road.
- Keeps truck restrictions, warnings, gates, CB/call-out instructions, narrow/one-lane bridge warnings, closures, and other safety-critical notes.
- Suppresses standalone landmark-only direction steps instead of turning them into fake road instructions.
- Applies the same cleanup to copied directions so sharing/copying does not reintroduce the hidden landmark text.

## Safety boundary

The production `directions_clear`, `written_directions`, `structured_road_sequence`, GPS coordinates, road records, and route-reference mileage are unchanged. This is a presentation cleanup only; source direction evidence remains available for owner/editor review.

## Audit context

Before this release, 88 of 534 Clear Directions records contained landmark-like terms, while 268 written-direction records contained them. The source records are retained; V17.3.8 cleans only what drivers see and copy.