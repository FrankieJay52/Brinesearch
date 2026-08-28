# Issue #97 — PORTERFIELD GAS UNIT reviewed current-location handoff

Date: 2026-08-27

This record documents a client-side, exact-record-bound Google Maps handoff for
PORTERFIELD GAS UNIT. It does not create graph authority, a public Google
release, or a cutover.

## Exact record binding

- Company: `Ascent`
- Pad: `PORTERFIELD GAS UNIT`
- Pad UUID: `0b7105a0-1b36-4182-8d10-1f2e297c8bab`
- Legacy ID: `ascent--porterfield-gas-unit`
- County/state: `Belmont`, `Ohio`
- Record revision: `1786258360881449`
- Stored sequence: `I-70 → Exit 215 → US-40 → Vineyard Rd → OR → OH-331 → US-40 → Vineyard Rd`
- Trusted destination: saved pad reference `40.090431, -80.928503`

Every field above must match the current directory record. Any identity,
revision, sequence, coordinate, or coordinate-source drift removes the reviewed
handoff and leaves the ordinary GPS-only destination action.

## Reviewed route

The production reviewed directions say to leave I-70 at Exit 215, travel west
on US-40, turn right onto Vineyard Road / CR-56, continue 2.1 miles, and arrive
at PORTERFIELD GAS UNIT.

The mobile link omits origin so the phone starts from its current location.

| Control | Latitude | Longitude |
| --- | ---: | ---: |
| Inside Vineyard Road after US-40 | 40.073689 | -80.945041 |
| Vineyard Road name continuation | 40.088246 | -80.944086 |
| Final access turn | 40.090469 | -80.928294 |
| Saved pad destination | 40.090431 | -80.928503 |

Independent OSRM checks starting on both sides of the US-40 turn followed
US-40, Vineyard Road, and the unnamed final access in that order, without a
forced state-road backtrack. The final snap finished 8.1 metres (about 26 feet)
from the exact saved destination.

Google URL:

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.090431%2C-80.928503&waypoints=40.073689%2C-80.945041%7C40.088246%2C-80.944086%7C40.090469%2C-80.928294`

## Boundaries

- This is an owner-reviewed Google handoff, not a public Google publication or
  exact graph release.
- The saved coordinate remains a pad reference, not a claimed public-road
  entrance.
- Google visual QA is still required before this candidate is deployed.
- Public Google remains at the existing COLOGIE baseline.
- Cutover remains off.
- No route, graph, pad, direction, or coordinate data was written.
