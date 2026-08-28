# Issue #97 — DUKE reviewed current-location handoff

Date: 2026-08-27

This record documents a client-side, exact-record-bound Google Maps handoff for
DUKE. It does not create graph authority, a public Google release, or a cutover.

## Exact record binding

- Company: `Ascent`
- Pad: `DUKE`
- Pad UUID: `bb351070-6c94-45e5-942f-e155f9e86f7e`
- Legacy ID: `ascent--duke`
- County/state: `Harrison`, `Ohio`
- Record revision: `1786265812046205`
- Stored sequence: `US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd`
- Trusted destination: saved pad reference `40.214409, -80.891316`

Every field above must match the current directory record. Any identity,
revision, sequence, coordinate, or coordinate-source drift removes the reviewed
handoff and leaves the ordinary GPS-only destination action.

## Reviewed route

The production reviewed directions say to approach through Cadiz on US-250,
turn onto Foxes Bottom Road, turn onto Springdale Hill Road, then turn onto
Lamborn Road and continue to DUKE.

The mobile link omits origin so the phone starts from its current location. It
uses three exact after-turn controls already proved by COLOGIE's current route:

| Control | Latitude | Longitude |
| --- | ---: | ---: |
| Inside Foxes Bottom Road after US-250 | 40.2376772526251 | -80.9645933421097 |
| Inside Springdale Hill Road after Foxes Bottom | 40.2344651449313 | -80.9216048043883 |
| Inside Lamborn Road after Springdale Hill | 40.2438460898288 | -80.9156965297937 |
| DUKE saved pad destination | 40.214409 | -80.891316 |

Independent OSRM routing from the US-22/US-250 area through those controls
returned, in order, US-250/Cadiz-Harrisville Road, Foxes Bottom Road,
Springdale Hill Road, and Lamborn Road. The router's final network snap was
0.75 metres from the exact saved DUKE coordinate; the URL itself retains the
exact saved coordinate and does not substitute a nearby destination.

Google URL:

`https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.214409%2C-80.891316&waypoints=40.2376772526251%2C-80.9645933421097%7C40.2344651449313%2C-80.9216048043883%7C40.2438460898288%2C-80.9156965297937`

## Boundaries

- The action is labelled as an owner-reviewed Google route, not a public Google
  publication or exact graph release.
- Google visual QA is still required before this candidate is deployed.
- Public Google remains at the existing COLOGIE baseline.
- Cutover remains off.
- No route, graph, pad, direction, or coordinate data was written.
- CRICKET was not copied into this handoff. Its live wording says Lamborn then
  lease, but independent routing does not reach its saved pin on that path. It
  remains GPS-only until its exact Foxes Bottom lease gate is identified.
