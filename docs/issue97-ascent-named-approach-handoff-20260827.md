# Issue #97 — BEETLE reviewed-navigation correction (2026-08-27)

## Final decision

The proposed BEETLE named-approach database migration was rejected and is not
part of this branch.

It was unsafe for four independent reasons:

1. It selected the US-250 end of OH-519 and traveled west, while the reviewed
   public directions say to start at New Athens, travel east on OH-519, and
   turn at Sixteen Road.
2. It projected the pad GPS onto OH-519 and continued about 1,027 road-feet
   beyond the exact OH-519/Sixteen Road junction.
3. It labeled the saved pad GPS as verified even though production says
   gps_verified=false, roads_verified=false, and the current directory
   coordinate state is held.
4. Its only route-prep receipt describes Route 519 → Route 250 → Pad; it cannot
   honestly serve as the semantic receipt for the reviewed New Athens/Sixteen
   Road approach.

The rejected migration was never permanently applied. Production received no
write.

## Safe replacement

V18 uses its existing exact-record-bound reviewed-navigation contract for
BEETLE. This is an owner-reviewed Google handoff, not a graph release and not a
public-Google publication.

New Athens remains the reviewed rural reference anchor. The mobile URL does not
force every driver through it. The first mobile waypoint sits 20 metres inside
Sixteen Road from its exact OH-519 junction. It is designed to let the phone's
current location approach the turn along OH-519 from either the New Athens side
or the US-250 side. A waypoint placed directly in the intersection was rejected
because an independent router biased one approach and created a 4.89-kilometre
detour. The ordered inside-Sixteen points instead keep the local movement on
Sixteen after the state-route turn. Cadiz-style anchors remain valid for other
pads when their evidence supports one and the waypoint budget permits it.

The URL:

- omits origin, so Google starts from the phone's current location;
- uses a point 20 metres inside Sixteen Road from the exact verified junction,
  allowing either direction of OH-519 to make the turn without treating the
  intersection itself as a waypoint arrival;
- uses a shaping point about 200 metres inside Sixteen Road, forcing the
  post-junction movement south onto Sixteen Road;
- places one satellite-supported shaping point on the visible
  private lease road;
- ends at BEETLE's exact saved pad GPS;
- uses exactly three mobile waypoints.

Exact points:

| Role | Latitude | Longitude |
|---|---:|---:|
| Verified OH-519/Sixteen Road junction (evidence; not a mobile waypoint) | 40.1871547 | -80.9192191 |
| First mobile waypoint, 20 m inside Sixteen Road | 40.1869745925099 | -80.9192177275288 |
| Inside Sixteen Road after the OH-519 turn | 40.185340499 | -80.919294431 |
| Satellite-supported lease shaping point (unapproved) | 40.185025 | -80.920500 |
| Saved BEETLE pad GPS destination | 40.185403 | -80.922718 |

The final movement from Sixteen Road to the saved pad pin is still a
GPS-directed private-lease leg. Satellite imagery supports the visible track
and shaping point, but neither is represented as approved public-road geometry.

## Exact record binding

The reviewed handoff binds only when all of these current directory fields
match:

- pad/canonical ID: 0e6f23f1-3bfb-44b0-aa4e-f24dde611880
- legacy ID: ascent--beetle
- record revision: 1787459253071652
- company: Ascent
- pad: BEETLE
- state/county: Ohio / Harrison
- stored structured sequence: OH-519 → US-250 → Pad
- sourced destination: saved pad GPS 40.185403, -80.922718

Any identity, revision, company, county, name, sequence, destination, or
destination-source drift fails closed to the ordinary GPS-only action.

## Driver display consistency

When the exact BEETLE candidate is active, both the pad page and the main-map
card replace the stale stored token order with one reviewed display sequence:

> OH-519 → Sixteen Rd → lease approach → saved pad GPS

The visible button and route card also state that the final GPS leg is not
approved road geometry. The stored production sequence is not changed; it is
only prevented from contradicting the exact candidate on screen.

## Authority state intentionally unchanged

- BEETLE graph/route state remains held.
- No structured route steps or geometry were fabricated.
- No Supabase migration is part of this correction.
- Public Google remains at the existing COLOGIE baseline.
- Cutover remains OFF.
- PR #98 remains closed.
- No graph rebuild, road mapping, pad-coordinate edit, or production data
  repair is included.

## Correct read-only findings retained

- Junction matching must use authoritative identity fields such as
  route_system and route_number. road_name_at_junction contains local names
  such as STUMPTOWN RD; matching OH-519 against that field is wrong.
- structured_road_sequence ordering is inconsistent and cannot determine
  driving direction by itself.
- Distance is not connectivity. A verified junction membership is required;
  a close crossing can be an overpass.
- Tail length alone is not a release gate. The approved core must end at an
  exact reviewed turn. A saved GPS may remain a separately labeled
  unapproved destination.

## Google phone proof

The URL structure, exact record binding, and local-road waypoints are covered
by tests. A connected PC browser was unavailable, and the private lease track
is absent from the independent public routing graph used for a second check.
That independent check proved the ordered OH-519/Sixteen movement but could not
model the lease.

On 2026-08-27, the owner opened the original west-of-turn shaping version on a
phone and confirmed the Sixteen Road and lease approach followed correctly.
The owner then requested that the first control move to the turn so drivers can
arrive along OH-519 from either state-route direction. Independent routing
showed that an exact-intersection waypoint biased one approach, so the safe
candidate uses a point 20 metres inside Sixteen instead. That preserves the
confirmed post-turn points. The owner opened the revised exact URL on a phone
and confirmed the final Google rendering on 2026-08-27. It does
not change BEETLE's held graph, route, or public-Google authority state; the
lease/GPS leg remains explicitly unapproved geometry in the driver display.
