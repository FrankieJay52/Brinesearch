# BrineSearch V17.3.7 — Pad verification cleanup

## What changed

- Replaces the large six-button Pad updates needed block with a compact Pad checks card.
- Automatically clears only checks supported by existing trusted evidence.
- Shows why a check was auto-reviewed or why it still needs confirmation.
- Keeps manual confirmation available as a small inline action with explicit safety wording.
- Hides the card entirely once all six checks are complete and no field check is open.
- Invalidates relevant verification flags when GPS, directions, wells, API, property, or road-sequence data changes.

## Production evidence pass

The production migration `20260809004829_pad_verification_evidence_cleanup_v1737` created verification rows for all 1,173 records and reviewed only evidence-backed fields. Immediately after the pass:

- 279 GPS checks reviewed
- 527 direction checks reviewed
- 195 well-list checks reviewed
- 195 API checks reviewed
- 33 property-number checks reviewed
- 51 road-name checks reviewed
- 12 records fully complete across all six checks

The intentionally conservative counts are expected. Official pad/well coordinates are not treated as proof of the saved driver entrance point, and a known approach road is not treated as proof that every road name in a truck route has been verified.

## Safety

No pad coordinates, directions, well names, API numbers, property numbers, or road names are changed by this release. It only updates verification metadata and presentation.
