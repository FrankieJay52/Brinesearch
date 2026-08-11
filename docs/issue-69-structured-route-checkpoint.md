# GitHub #69 — Structured Route Geometry Recovery Checkpoint

This file is intentionally committed early so a ChatGPT Work/Codex/agent failure can resume from GitHub instead of relying on conversation history.

## Start state

- Base: `main` after #81 / V17.3.30 (`671bbf254ae6da14a74eb9ddb2768837cf635b79`).
- Issue: #69 only. #70 is supporting data work, not permission to broaden scope.
- No overlapping PR existed when this branch was created.
- Production Supabase project: Brine Search.

## Confirmed production state before #69 implementation

- `public.pads`: 1,173 rows.
- Pads with saved structured road sequence: 1,068.
- Pads with Clear Directions: 1,065.
- Pads with non-empty `structured_route_steps`: **0**.
- `public.brinesearch_pad_roads`: 19 rows across 7 pads.
- `brinesearch_pad_roads.geometry_version=1`: **0**.
- `brinesearch_pad_roads.step_geometry IS NOT NULL`: **0**.
- Route review segments with exact step geometry: **0**.
- Road Manager: 200 roads; 86 have `centerline_geojson`, 114 do not.
- Route-prep: 1,142 pad route preps / 4,899 prep steps; 1,950 prep steps have a Road Manager `road_id`, 2,949 do not.
- ODOT catalog: 53,196 rows; 4,804 geometry-loaded segments across 10 Ohio counties. Geometry exists for many OH state/county/township/US segments but is not yet normalized into every Road Manager road needed by routes.

## Root cause

The database already contains the correct V17.3.29 structured-route model and owner-only atomic publisher, but the browser never switched to it.

`public.brinesearch_publish_structured_route(...)` already validates and stores:

- one unique `route_step_id` per geographic occurrence,
- Road Manager `road_id`,
- exact start/end boundary coordinates,
- one clipped traveled LineString,
- geometry-derived mileage,
- aliases,
- outbound and reverse turns,
- route revision,
- cross-step continuity,
- Road Manager centerline support,
- shared Road Manager intersection nodes for different adjacent roads,
- separate same-road occurrences,
- public `structured_route_steps`, and
- regenerated driver directions/cards from the stored canonical route rows.

However the assembled V17.3.27/V17.3.28 editor still uses the legacy path:

1. `routeStepTraceRowV17328()` identifies the selected step by road-name similarity against backtrace rows.
2. `routeStepRoadManagerLineV17328()` can choose the Road Manager line nearest the pad when more than one geometry is available.
3. Route drafts store road/name/type + manual miles/turn/note only; no occurrence ID, boundaries, clipped geometry, aliases, reverse turn, or route revision.
4. Replace/insert/remove operations therefore mutate only the road list, not a geographic route topology.
5. `routeInteractiveRenderOverlayV17327()` draws full backtrace lines, then V17.3.28 adds another name-matched selected line on top.
6. `routeInteractivePublishV17327()` deletes/reinserts legacy `brinesearch_pad_roads` rows and PATCHes `pads` directly instead of calling `brinesearch_publish_structured_route`.

This is why the map can look plausible while selecting/highlighting the wrong road occurrence or too much of a road.

## Non-negotiable #69 architecture

Each live route step must be:

`step index -> route_step_id -> road_id -> exact start -> exact end -> clipped LineString -> geometry-derived miles -> outbound turn -> inbound/reverse turn -> aliases`

Rules:

- Step highlighting must use that occurrence's exact stored/draft clipped LineString only.
- No road-name similarity may choose an occurrence.
- No nearest-to-pad fallback may choose an occurrence.
- Repeated use of one `road_id` remains separate because `route_step_id` and boundaries differ.
- Adjacent different roads must share a Road Manager intersection node.
- Insert/remove/reorder/replace must invalidate or recompute affected boundaries instead of preserving stale geometry.
- Missing geometry is `unresolved`; never substitute an entire road centerline as if it were the traveled step.
- Publishing must be atomic through `brinesearch_publish_structured_route`.
- Driver cards/directions after publish come from canonical structured rows, not reparsed written directions.

## Planned implementation slices

### Slice A — browser structured-route contract

- Load `brinesearch_get_structured_route_steps` first when an Owner opens a pad.
- Extend the in-memory/local draft step model with `routeStepId`, `startCoordinate`, `endCoordinate`, `clippedGeometry`, `aliases`, `inboundTurn`, `geometryStatus`, `geometryVersion`, `routeRevision`.
- Hydrate existing version-1 routes without rebuilding them from text.
- Exact selected-step overlay uses `clippedGeometry`; unresolved steps have no fake exact highlight.
- Publish through `brinesearch_publish_structured_route` with `p_expected_revision`.

### Slice B — topology/boundary tools

- Add owner-only server helpers to snap a tapped point to a Road Manager centerline, enumerate actual shared-node boundary candidates for adjacent road IDs, and clip one continuous road component between two confirmed boundaries.
- User chooses/affirms ambiguous intersections instead of the system guessing.
- Same-road consecutive occurrences require an explicit split point; do not collapse them.
- First/last route boundaries require an explicit route anchor/pad-access endpoint when they cannot be derived from adjacent roads.

### Slice C — edit operations

- Replacing a road clears/recomputes both affected boundaries.
- Inserting/removing/reordering invalidates the local topology window around the change.
- After every edit, continuity and geometry state are visibly reported.
- Mileage is read-only/derived once clipped geometry exists.

### Slice D — regression/release

Cover repeated road occurrences, dual-name roads, county/state/local aliases, same long road split into multiple occurrences, insert/remove/replace, ambiguous/missing intersection, stale route revision, reverse route, and exact selected-step geometry.

Run all existing route/map/direction/security verification plus new #69 tests, full build, mobile/desktop browser audit, production migration verification, deployment, live BrineSearch map/card checks, and production data readback before closing #69.

## Agent checkpoint protocol

Every agent/Work/Codex run must checkpoint before doing another large slice:

1. Commit coherent code to `map/issue-69-structured-route-foundation` (or the eventual #69 branch).
2. Push immediately.
3. Add a short #69 issue comment containing: commit SHA, what is complete, tests run/results, production changes (if any), and exact next step.
4. Never leave the only copy of meaningful work in an agent worktree/chat.
5. If a run approaches a long test/deploy phase, checkpoint first, then test from the pushed commit.
6. Never merge/close #69 until the final live verification gate passes.

## 2026-08-11 continuation review at `db7dd61`

The continuation inspected current `main`, draft PR #84, every #69 issue
checkpoint, this document, and current production before changing code.

- PR #84 was still at `db7dd61ef8573943c4d9c1a267984109d9951c42`, based on
  `671bbf254ae6da14a74eb9ddb2768837cf635b79`; no newer #69 head existed.
- Production still had 0 geometry-version-1 pad-road rows, 0 stored exact step
  geometries, and 0 non-empty structured route snapshots. Legacy pad-road rows
  had increased from 19 to 23, so all later rehearsals must use current live
  state rather than the original checkpoint counts.
- Road Manager still had 200 roads / 86 centerlines. Missing coverage remains a
  no-guess blocker, not permission to attach a whole road or invent a segment.
- 58 current Clear Directions rows matched the explicit driver-safety keyword
  inventory. The V17.3.29 publisher still replaces all of `directions_clear`, so
  #69 cannot ship until those facts are stored through a category-allowlisted,
  provenance-aware contract and regenerated separately from route truth.
- `routeIssue69AttachTappedGeometry` can replace a geometry-less Road Manager
  road with one tapped OSM way. A single way cannot prove full canonical-road
  coverage. #69 must leave that step unresolved and route geometry enrichment to
  #70 rather than writing partial geometry as a complete Road Manager centerline.
- The helper clip RPC currently picks the first continuous component when more
  than one component can support both boundaries. That ambiguity must be
  rejected explicitly instead of being silently resolved by ordering.

Production was read-only during this continuation checkpoint. The next slice is
the #81-safe driver-safety persistence/regeneration contract plus removal of the
partial OSM overwrite path, followed by independent read-only review lanes.
