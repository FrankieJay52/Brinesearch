# Issue #97 — Ascent reviewed handoff batch 10 evidence (2026-08-28)

## Scope and authority boundary

This batch adds one exact-record, owner-reviewed Google Maps handoff for WINSTON SMITH. The link keeps the phone's current location as origin, uses three reviewed shaping points, and terminates at this record's existing saved pad reference.

This is a client-side reviewed handoff only. It does not add a graph release, approved public-Google row, verified lease geometry, or verified driver entrance. The final lease/GPS movement stays explicitly unapproved. Connectivity evidence comes from exact current-build road-identity memberships, never a distance threshold. Production database reads were read-only. Production writes, migrations, route cutover, embedded Google Maps, Google Maps JavaScript API use, and `VITE_GOOGLE_MAPS_API_KEY` use are all zero.

## WINSTON SMITH

Exact binding: UUID `0b7ed9a5-7748-4d92-992a-7f2cecf9dd08`; legacy `ascent--winston-smith`; revision `1786258360881449`; Ascent / Ohio / Noble / STOCK; saved pad reference `39.752765,-81.396584`.

Raw sequence: `I-77 → Exit 25 → OH-78 → Archer Ridge Rd → Hill Rd → Keep Left Onto Gurewicz Rd → Lease Road`.

Current Noble build `200d56dc-5b13-4f84-82cb-946b8ebeada2` contains exact active identities OH-78 `2eab7dfb-788a-1181-28e6-b643922b62be`, Archers Ridge / CR-2 `82f10f05-7192-22a8-d175-c669b918e98e`, Hill / TR-307 `04dc51fc-4d22-d7aa-287c-02c5f18693cd`, and Gurewicz / TR-303A `d5a0c5af-7ee0-028f-a5d9-20e3367ac593`. Exact current membership proves verified authoritative T-junctions OH-78/CR-2 `397e428e-0b05-d450-3ecf-56d48d826043`, CR-2/Hill `1fb86c08-dcac-c23c-d3a3-417a51db1090`, and Hill/Gurewicz `6406beb2-8701-fae3-f409-5a9fd24bfcce` at `39.7467071,-81.4070644`.

Controls: `39.774007303642,-81.451385717411` inside Archers Ridge after OH-78; `39.754750338267,-81.412456525463` inside Hill after Archers Ridge; `39.747281218039,-81.405362294553` inside Gurewicz after Hill.

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=39.752765%2C-81.396584&waypoints=39.774007303642%2C-81.451385717411%7C39.754750338267%2C-81.412456525463%7C39.747281218039%2C-81.405362294553`

Exact two-origin Google turn-list QA used the URL above with only a temporary test origin added:

- Cambridge: 40 minutes / 32.9 miles; I-77 south → Exit 25 → OH-78 east → right Archers Ridge. After the first control, Google stayed on Archers Ridge for 3.2 miles, continued straight onto Hill Road, traveled 0.7 mile toward Gurewicz, kept left onto Gurewicz, then continued 0.7 mile east on Gurewicz to the destination.
- Caldwell: 19 minutes / 10.6 miles; OH-821 south → OH-78 east → right Archers Ridge. Its local-road turn list was identical after the first control.

Both exact turn lists preserved OH-78 → Archers Ridge → Hill → Gurewicz without Hohman Road / Township Highway 87, a skipped road, shortcut, loop, or backtrack. The published candidate itself still omits `origin`; the temporary Cambridge and Caldwell origins were QA inputs only.

The older source occurrence parser did not resolve the action-prefixed Gurewicz token. As with LODESTAR's action-prefixed Hill token, the exact current road identities and independently verified junction membership prove the road-to-road connection for this reviewed handoff. This does not promote graph authority or repair the stored occurrence receipt.

The destination is 8.646 metres from exact Gurewicz geometry. That distance describes the final handoff only; it is not used as a connectivity test. The saved point is not relabeled as a verified entrance, and the final movement remains unapproved.

## Regression boundary

- Existing reviewed links and exact bindings are unchanged.
- WINSTON SMITH moves only from truthful GPS-only navigation to an exact-record reviewed Google handoff; graph/public-Google authority stays held.
- The link omits `origin`, so Google uses the phone's current location.
- The link is an ordinary external `https://www.google.com/maps/dir/?api=1...` handoff. No Google API key is read, embedded, logged, or required.
- Public Google remains at the existing COLOGIE baseline; cutover remains off.
- Production reads were read-only. Production writes and migrations were zero.
