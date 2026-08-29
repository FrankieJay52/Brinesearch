# V18 named-road navigation contract

This is the current everyday driver rule for every V18 pad. **Working is done.**
Cologie is the first working example, not a higher grade and not a prerequisite
for another pad.

## Everyday driver rule

1. The origin is the phone's current location. A BrineSearch Google directions
   URL omits `origin`; Cadiz, another town, or any fixed coordinate is never a
   fallback origin.
2. The destination is the pad's saved GPS. An ODNR coordinate is used only when
   that destination is already frozen for that exact pad. A pin does not have to
   sit on the visible white pad deck.
3. A directed sequence contains only explicitly reviewed named public roads:
   interstate, U.S., state, county, and township roads. Fuzzy, nearest,
   proximity-only, and name-only road matching are not evidence.
4. Turns on those named roads are allowed and required when needed to preserve
   their order. The link succeeds when Google follows the directed named roads
   in order and then reaches the destination pin. It fails when Google takes a
   different road before the directed sequence is complete.
5. After the final named road, an unnamed lease or dirt movement may continue to
   the pin. BrineSearch does not invent a name for that movement or approve it
   as a public road.
6. Each pad has one driver **Navigate** action. An already-working destination,
   waypoint order, and Google URL remain byte-stable unless evidence proves the
   link uses the wrong road.
7. Written directions remain text. They do not become road geometry, turn
   geometry, or authority merely because they are displayed beside a working
   Navigate action.

Examples of this one rule include Cologie's existing working link, Skull Fork's
Cadiz Road / US-22 → Repik Lane / TR-9876 → pin sequence, and the existing
Banjo and Pickens named-road handoffs. Each passes or fails by the same test.

## Map display

V18 may highlight the verified directed named roads so the map is useful to the
driver. The highlight stops at the final named road or the destination pin; it
does not name or approve a trailing lease. A label may list the road names but
must not call the display a State-1 graph release.

Every supplied, separately reviewed named-road geometry feature is highlighted
in teal, including when graph, State-1, or public-Google authority remains held.
The highlight is presentation only. It does not create an official road,
public-Google publication, graph membership, or route-release authority. This
pad-bound highlight is drawn only while that exact pad is selected. Unselected
pads never project their route color onto the map.

Independently, the current exact released approved-road overlay remains teal in
every driver map view. It defaults to **All approved routes** and may be narrowed
to one exact company. That persistent network is an exact released road
reference, not a route attributed to the selected pad; selecting a pad adds
its brighter pad-bound display above the network. Interstate, U.S., state,
county, or township roads
are teal in this layer only when the released approved-road overlay supplies
their exact geometry. V18 does not recolor a basemap road class or infer a
company/route association.

If a pad has no verified named sequence, or its reviewed sequence has no
supplied pad-bound geometry yet, its pad-specific display is the trusted
destination pin only and draws no substitute teal line for that pad. The independent
approved-road overlay may remain visible underneath, but it never satisfies
that pad's missing geometry. Written text, shaping points, whole-road
centerlines, and nearest-road results are never joined into a replacement line.

## State-1 promotion is parked

Occurrence counts, survey-density requirements, junction and transition
receipts, Issue #97 private Google manifests, irrevocable owner releases,
manifest-derived compact waypoints, and exact-graph-only teal requirements are
not everyday Navigate or display gates. That machinery remains available for a
future single-pad promotion and is run only when an instruction explicitly says
`PROMOTE <PAD NAME> TO STATE 1`.

The explicit promotion audit is:

```text
npm --prefix v18 run verify:state1-promotion
```

Default V18 verification does not run that promotion audit.

## Authority boundary

- No graph rebuild is implied.
- No Issue #97 cutover is implied.
- No public Google route is published by this contract.
- No production database write is implied.
- No API key or other secret belongs in tracked source or documentation.
