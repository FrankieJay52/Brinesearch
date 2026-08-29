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

V18 may highlight the reviewed directed named roads so the map is useful to the
driver. Solid teal stops at the final routable named-road point or at the saved
GPS when the routable network reaches it. When the frozen GPS is beyond that
point, an optional thin neutral dashed segment with authority
`unapproved_gps_tether` may connect the routable endpoint to the GPS. That tether
does not claim a road, road name, lease shape, or approval. A label may list the
reviewed road names but must not call the display a State-1 graph release.

Every supplied, separately reviewed named-road geometry feature is highlighted
in teal, including when graph, State-1, or public-Google authority remains held.
The highlight is presentation only. It does not create an official road,
public-Google publication, graph membership, or route-release authority.

The exact current Ascent DONE set contains **55 pads**: **46 immutable reviewed
Google handoffs** plus **9 existing database releases**. One build-time display
catalog covers that whole set. It reuses existing exact public graph geometry
where present and uses offline routed reconstruction through the frozen action
destination and ordered controls for the remaining static contracts. It never
changes a Google URL, destination, or waypoint, and it never derives a road from
prose, fuzzy matching, a nearby line, or a whole-road name match.

For the current frozen batch, exact ordered road-step comparison leaves 31 of
the 45 reconstructed handoffs solid through their routable endpoint. Thirteen
stop solid teal at the first unreviewed or unnamed step and continue only as a
neutral dashed GPS tether. BEETLE's public router returned a different-road
loop before any reviewed step, so it fails closed with no visible teal and the
entire candidate movement remains dashed. These outcomes keep all 55 records
inspectable without coloring an unreviewed road teal.

All 55 catalog entries remain visible on the main **All pads + all approved
roads** map and under the **Ascent** company filter. Selecting one of those pads
brightens that same entry. Another company filter or disposal-only view hides
the Ascent catalog. Each entry is bound to its exact pad identity, record
revision, company, and frozen GPS. Record drift, an endpoint mismatch, a catalog
duplicate, or a missing display segment fails that entry closed without
changing the other 54.

The browser receives the completed catalog. It makes no route-service call,
performs no coordinate hashing, and does not rebuild the native source/layer
family during ordinary pan, zoom, selection, or company-filter changes. It
updates the existing source data and selection filter instead.

After the final pad on a county, township, or other local named road, the
remaining road may be displayed in red only when exact corridor evidence proves
there is no farther pad on that road and exact geometry reaches the next
Interstate, U.S., or state-highway junction. Interstate, U.S., and state routes
are always teal and are never red. Missing road identity, missing downstream-pad
proof, or an imprecise junction means no red continuation. Red is field
orientation only; it is not a closure, restriction, route approval, or authority
to infer a road.

BANNOCK's separately proved exit to Black Oak Road and OH-149 is the only red
continuation in this 55-pad catalog. Every other entry has no red continuation.
DUKE remains teal because CRICKET is farther along the Lamborn Road corridor.
Missing proof never turns another local road red.

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
reviewed Ascent route entries remain above that network, and the selected pad's
entry remains brightest.

For the exact frozen BANNOCK record, the field display uses two direction
colors. Solid teal shows the routable arrival from OH-331 along Lafferty-Bannock
Road / CR-10 to the road projection beside the saved BANNOCK GPS. Its optional
thin dashed `unapproved_gps_tether` reaches the frozen GPS without naming or
approving a road. Red shows the
exit reference from that same road projection along the remaining
Lafferty-Bannock / CR-10 chain and Black Oak Road to OH-149. Red is not a
restriction or closure. The destination marker remains at the exact saved GPS.
Both the teal OH-331 arrival and red
OH-149 exit remain visible on the main **All pads + all approved roads** map
and on the Ascent-filtered map, so a driver can inspect the complete road
connection before opening the pad. The exact same two legs brighten when
BANNOCK is selected. Both hide under another company or disposal-only filter.
The shared reviewed-Ascent catalog owns both BANNOCK's teal arrival and proved
red continuation in the same native source; the legacy frozen evidence is not
drawn again through a separate runtime source. Neither color is a generic road
recolor. This field display changes neither BANNOCK's byte-stable Google
Navigate link, saved destination, persistent released approved-road overlay,
graph state, nor public-Google authority.

If a pad is outside the 55-entry reviewed Ascent catalog and has no reviewed
named sequence, its pad-specific map content is limited to its trusted
destination marker. The independent approved-road overlay may remain visible
underneath, but it never supplies a missing pad route. Written text, whole-road
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
