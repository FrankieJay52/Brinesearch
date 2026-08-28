# Issue 97 — Ascent reviewed handoff batch 6 evidence

Date: 2026-08-28

## Scope and authority boundary

This batch adds exact-record, owner-reviewed Google Maps handoffs for four current Ascent Ohio pad records. Each URL omits `origin`, so the phone supplies the driver's current location. These links are navigation handoffs only: they do not publish public-Google route authority, approve new graph geometry, change cutover, or change any pad coordinate.

Every candidate is bound to the exact pad UUID, canonical ID, legacy ID, company, state, county, record revision, stored structured-road sequence, trusted coordinate source, and destination coordinate. Any drift fails closed to the existing trusted-GPS behavior.

Production database access during research and ledger generation was read-only. Production writes: **0**. The Netlify `VITE_GOOGLE_MAPS_API_KEY` was not read, used, or exposed; these are ordinary external Google Maps URLs.

## BAKOS — Belmont

- Pad ID: `d7898e8c-1bb6-48f8-b5e0-87bc1898420e`
- Legacy ID: `ascent--bakos`
- Record revision: `1787615581785257`
- Destination role: saved pad GPS, not a verified entrance
- Destination: `40.151125,-80.852968`
- Reviewed display sequence: state-road approach → US-250 → Holly View Dr / TR-452 → saved pad GPS
- Ordered shaping points:
  1. `40.1516769902779,-80.8451322878882`
  2. `40.1510618834494,-80.8504752159943`

Read-only production evidence showed the current exact private-dark BAKOS receipt: authoritative US-250/Holly View identity, exact geometry, a 0.446-mile route, and no nearest-road, fuzzy, or name-only matching. The shaping points are the receipt's ordered manifest controls. The stored Holly/Holy spelling conflict is preserved in the exact binding while the driver-facing name uses the verified Holly View identity.

Google turn-list checks from Cadiz and Bridgeport both remained on US-250, turned onto Holly View, and continued forward to the exact saved destination without a local-road loop or backtrack.

## BANNOCK — Belmont

- Pad ID: `333598ca-37b3-4b44-9411-a490cc3da672`
- Legacy ID: `ascent--bannock`
- Record revision: `1786744183028038`
- Destination role: verified driver entrance
- Destination: `40.111003,-81.002932`
- Reviewed display sequence: state-road approach → OH-331 → Lafferty-Bannock Rd / CR-10 → unapproved entrance handoff → verified driver entrance
- Shaping point inside the exact CR-10 identity: `40.10871301297529,-80.97829303262223`

The current directions provide two approaches that converge on OH-331 and Lafferty-Bannock Road. Read-only road evidence confirmed the exact OH-331 identity and the exact CR-10 identity, whose local aliases include Lafferty-Bannock/Bannock-Uniontown. The shaping control is on the authoritative CR-10 centerline after the OH-331 turn.

Google turn-list checks from St. Clairsville and Cadiz both used their expected state-road approaches, made the correct OH-331-to-Lafferty-Bannock turn, and continued forward to the verified entrance without a local-road loop or backtrack. The short final entrance movement remains explicitly unapproved.

## SADLER — Harrison

- Pad ID: `166c5d6c-3a8d-4481-b8bf-5d74b7605f0d`
- Legacy ID: `ascent--sadler`
- Record revision: `1786440150388625`
- Destination role: verified driver entrance
- Destination: `40.207568,-80.935841`
- Reviewed display sequence: state-road approach → US-250 → Jamison Rd / CR-86 → verified driver entrance
- Verified US-250/Jamison junction: `40.2186816,-80.9450079`
- Shaping point inside Jamison/CR-86: `40.218227603057535,-80.94472982304073`

Read-only road evidence confirmed the official CR-86 identity and driver-facing Jamison Road name at an exact authoritative junction with US-250. Google currently renders the road as Jameson; that spelling is display context only and is not promoted to a different identity.

Google turn-list checks from Cadiz and Bridgeport approached the same exact turn from opposite directions, then continued forward on the local road to the verified entrance with no loop or backtrack.

## TOWE — Harrison

- Pad ID: `800c877a-6b4f-4a87-a710-b1e00af63c62`
- Legacy ID: `ascent--towe`
- Record revision: `1786159709605865`
- Destination role: verified driver entrance
- Destination: `40.385998,-81.212569`
- Reviewed display sequence: state-road approach → US-250 → Willis Run Rd / TR-213 → Oak Hill Rd / TR-212 → verified driver entrance
- Verified US-250/Willis Run junction: `40.3595577,-81.2185084`
- Shaping point inside Willis Run: `40.36026193640823,-81.218134577079`
- Verified Willis Run/Oak Hill junction: `40.3792033,-81.2087512`
- Shaping point inside Oak Hill: `40.379819440170614,-81.20908591279908`

The current raw directions explicitly say to leave US-250 for Willis Run Road, turn left onto Oak Hill Road, and use the second left for the pad. Read-only road evidence confirmed exact US-250, Willis Run/TR-213, and Oak Hill/TR-212 identities and the two authoritative junctions. The shaping controls are on the official centerlines just after each turn.

Google turn-list checks from Cadiz and Uhrichsville approached US-250 from opposite directions, then followed Willis Run and Oak Hill in the reviewed order to the verified entrance without a loop or backtrack.

## Deliberately unchanged

- CRICKET remains GPS-only: testing the nearby DUKE controls produced a wrong local-road tail and loop rather than CRICKET's exact access.
- BEDWAY remains GPS-only: the official Pancoast identity did not match Google's road choice to the saved destination.
- COLEMAN and ROSS remain GPS-only: neither had a safe exact local-road control set for this batch.
- All previously finished reviewed and approved routes remain byte-for-byte unchanged.
