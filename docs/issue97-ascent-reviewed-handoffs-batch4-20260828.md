# Ascent reviewed handoffs — Batch 4

## PICKENS

- Exact pad: `75600d0c-17b8-488b-96c9-4b7b8ffc8b1b` / `ascent--pickens`
- Exact directory revision: `1787615581785257`
- Trusted destination: verified driver entrance `40.182544,-80.977135`
- Stored route wording: `OH-9 south → Turn left onto OH-519 east → Turn right onto Lease Road`
- Owner-confirmed turn: from OH-519 / Stumptown Road onto the pad connector shown in the 2026-08-28 field screenshots
- Owner-confirmed Google shaping point at the exact OH-519 turn: `40.1868067,-80.9781928`
- Corrected reviewed URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.182544%2C-80.977135&waypoints=40.1868067%2C-80.9781928`

The URL intentionally omits an origin, allowing Google to use the phone's current location and approach the same turn from either state-route direction. The first shipped control, `40.186260,-80.976470`, sat on OH-519 east of the pad connector. A later draft control, `40.185875,-80.977980`, sat too far down the connector. The owner's 2026-08-28 phone screenshot identifies the physical junction itself as `40.1868067,-80.9781928`; that exact turn now controls the handoff. Both older points are retained here as superseded audit history and are not reused. Google currently labels this connector Georgetown Road, while field screenshots have shown other nearby labels; none of those renderer labels is promoted to an authoritative driver-facing road identity.

Google Maps was checked from both sides of the state-road approach on 2026-08-28. From Cadiz, the turn list used OH-9 south, then OH-519 east, then the exact shaping point before continuing south to the verified entrance. From Harrisville, the turn list used US-250 west, then OH-519 west, then the same shaping point before continuing south to the verified entrance. Neither check passed the connector and doubled back. These are route-rendering checks of the owner-reviewed handoff, not graph approval or public-Google publication.

## Authority boundary

This is one exact-record owner-reviewed Google handoff. It does not approve the access road, create lease-road geometry, change the graph, publish a public Google route, or change cutover. The route text shown to drivers calls the segment after OH-519 an unapproved access-road handoff. PICKENS remains `reviewed_handoff_authority_held` for graph and public-Google authority.

Production database writes: **0**.
