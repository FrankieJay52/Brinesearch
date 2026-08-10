# V17.3.25 Route Backtrace

Owner Road Manager → Route Mapper adds a pad-first visual trace.

- Start at the selected pad's official coordinate when present, otherwise saved driver GPS.
- Read only the saved primary route sequence (stop at the first OR/alternate marker).
- Reverse that road sequence so review proceeds from the pad outward toward the highway.
- Prefer Road Manager `centerline_geojson`; use OpenStreetMap Overpass as a geometry fallback.
- Highlight only road geometry that matches the saved road identity and connects within the conservative trace thresholds.
- Keep access/lease roads, missing roads, and uncertain connections unhighlighted rather than drawing guessed connectors.
- Route trace mileage shown in the trace chips is map-geometry context only. It is not published to driver directions by the trace action.
- Existing Route Mapper review saving and explicit publish separation remain unchanged.
