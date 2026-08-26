# Ascent Ohio driver-destination coverage — 2026-08-26

This checkpoint covers the 247 current Ascent pad records in Belmont, Guernsey, Harrison, Jefferson, Monroe, and Noble counties.

## Current production evidence

- Directory snapshot: `098667bf-a39f-4e7b-86e1-0706c882943c`
- Source revision: `6`
- Ordered coverage SHA-256: `47fa21a12d45da7828fe04aaaf84a4b690a718da910df0877e2153355ad3001b`
- Target pads: `247`
- Exactly one trusted destination per target: `247`
- Missing destinations: `0`
- Duplicate destinations: `0`
- Invalid or out-of-area destinations: `0`
- Partial verified-entrance pairs: `0`

Source roles are deliberately separate:

- Verified driver entrance: `16`
- Saved pad GPS: `215`
- ODNR official pad GPS (not an entrance): `11`
- ODNR official wellhead GPS (not an entrance): `5`

Reviewed field directions and structured road sequences exist for `243` pads. EZEKIEL, SHUGERT DADDY, ABLE, and LASSO have no reviewed directions in the current directory contract; their destination remains independently usable without generated steps.

The companion CSV records each source role in a separate column so an entrance, pad point, or wellhead cannot be silently relabeled. Only current public directory coordinates and the exact public reference projection are included; packaged fallback coordinates are excluded from navigation.

## Authority boundary

- An exact reviewed handoff, when available, remains the primary action.
- All other eligible actions say GPS destination only and visibly name their source.
- ODNR pad and wellhead points explicitly say they are not entrances.
- GPS-only URLs omit origin and waypoints, allowing the phone's current location to be the origin while Google chooses the unapproved path.
- GPS-only points never create route steps, route geometry, graph authority, or public Google authority.
- The existing Cologie public Google route and handoff are preserved; no additional public Google row was created.
- Issue #97 cutover remains off.

Production database writes for this checkpoint: `0`.
