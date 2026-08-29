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
public-Google publication, graph membership, or route-release authority.

A pad-bound arrival may remain visible on the main **All pads + all approved
roads** map and under its exact company filter only when the display artifact is
bound to that exact pad record and its final coordinate exactly equals that
record's current saved GPS. Selecting the pad brightens the same geometry.
Reviewed geometry that stops at a handoff or road projection remains
selection-only and must describe that shorter endpoint truthfully. Record drift,
an endpoint mismatch, or missing geometry fails closed to the pin; text,
waypoints, and nearby road shapes are not joined into a substitute connector.

After the final pad on a county, township, or other local named road, the
remaining road may be displayed in red only when exact corridor evidence proves
there is no farther pad on that road and exact geometry reaches the next
Interstate, U.S., or state-highway junction. Interstate, U.S., and state routes
are always teal and are never red. Missing road identity, missing downstream-pad
proof, or an imprecise junction means no red continuation. Red is field
orientation only; it is not a closure, restriction, route approval, or authority
to infer a road.

The first exact Ascent batch contains COLOGIE and DUKE. Both teal arrivals end
at their exact saved GPS. DUKE has no red continuation because CRICKET is farther
along the Lamborn Road corridor. COLOGIE has no red continuation because the
post-pad corridor order has not been separately proved. No other Ascent pad is
stamped by that batch. The persistent BANNOCK teal arrival and red exit described
below remain one separately scoped legacy field-orientation reference whose teal
leg ends at the proved road projection rather than inventing a connector to GPS.

Independently, the current exact released approved-road overlay remains teal in
every driver map view. The unified selector defaults to **All pads + all
approved roads** and may narrow both pads and the released approved-road overlay
to one exact company. That persistent network is an exact released road
reference, not a route attributed to the selected pad; selecting a pad adds its
brighter pad-bound display above the network.

The map also draws a thinner teal Interstate, U.S., and state highway reference
from the loaded OpenFreeMap Liberty vector source/layer, clipped to the 39
confirmed Ohio, West Virginia, and Pennsylvania pad counties already frozen in
the repository. Shared county borders are dissolved so a through-highway stays
connected across adjoining pad counties. It uses only the exact structured `network` identities
`us-interstate`, `us-highway`, and `us-state`; it does not match road names,
infer a company association, or become Navigate geometry. The presentation
clip uses the U.S. Census Bureau 2025 1:20m county boundaries. If Liberty's
expected source/layer contract is absent, this reference fails closed. Exact
released approved roads remain stronger teal above the reference, exact
GPS-reaching pad arrivals remain above that network, and the selected pad's
separately reviewed display remains brightest.

For the exact frozen BANNOCK record, the selected-pad field display uses two
direction colors. Teal shows the arrival from OH-331 along Lafferty-Bannock
Road / CR-10 to the road projection beside the saved BANNOCK GPS. Red shows the
exit reference from that same road projection along the remaining
Lafferty-Bannock / CR-10 chain and Black Oak Road to OH-149. Red is not a
restriction or closure. The entrance marker remains at the exact saved GPS and
no road-to-pin connector is inferred. Both the teal OH-331 arrival and red
OH-149 exit remain visible on the main **All pads + all approved roads** map
and on the Ascent-filtered map, so a driver can inspect the complete road
connection before opening the pad. The exact same two legs brighten when
BANNOCK is selected. Both hide under another company or disposal-only filter.
They share one dedicated smooth-moving native map source with data-bound color
roles; neither color is a generic road recolor. This field display changes
neither BANNOCK's byte-stable Google Navigate link, saved entrance, persistent
released approved-road overlay, graph state, nor public-Google authority.

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
