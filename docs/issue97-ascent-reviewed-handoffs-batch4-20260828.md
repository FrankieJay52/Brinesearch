# Ascent reviewed handoffs — Batch 4

## PICKENS

- Exact pad: `75600d0c-17b8-488b-96c9-4b7b8ffc8b1b` / `ascent--pickens`
- Exact directory revision: `1787615581785257`
- Trusted destination: verified driver entrance `40.182544,-80.977135`
- Stored route wording: `OH-9 south → Turn left onto OH-519 east → Turn right onto Lease Road`
- Owner-confirmed turn: from OH-519 / Stumptown Road onto the access road shown in the 2026-08-28 field screenshot
- Google shaping point just inside that turn: `40.186260,-80.976470`
- Reviewed URL: `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.182544%2C-80.977135&waypoints=40.18626%2C-80.97647`

The URL intentionally omits an origin, allowing Google to use the phone's current location and approach the same turn from either state-route direction. A live Google turn-list check reached the shaping point and then the verified entrance without forcing an upstream fixed anchor or backtracking. The owner also confirmed the route on a phone and supplied the exact turn screenshot.

## Authority boundary

This is one exact-record owner-reviewed Google handoff. It does not approve the access road, create lease-road geometry, change the graph, publish a public Google route, or change cutover. The route text shown to drivers calls the segment after OH-519 an unapproved access-road handoff. PICKENS remains `reviewed_handoff_authority_held` for graph and public-Google authority.

Production database writes: **0**.
