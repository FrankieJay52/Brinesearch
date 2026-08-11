import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, "../src/parts/00ab-google-route-plan-issue97.js"),
  "utf8"
);
const context = { URLSearchParams, console };
vm.runInNewContext(source, context, { filename: "00ab-google-route-plan-issue97.js" });
const planner = context.BrinesearchGoogleRouteIssue97;

assert.equal(planner.maxWaypoints, 3, "Issue #97 must use the conservative iOS waypoint cap");
assert.equal(planner.maxUrlLength, 2048, "Issue #97 must enforce the Google Maps URL limit");

const digest = value => String(value).repeat(32).slice(0, 32);
const graphPoint = (sequence, kind, latitude, longitude, occurrenceId, junctionId = `junction-${sequence}`) => ({
  sequence,
  kind,
  latitude: String(latitude),
  longitude: String(longitude),
  occurrence_id: occurrenceId,
  source_kind: "authoritative_junction_anchor",
  anchor_id: `anchor-${sequence}`,
  junction_id: junctionId,
  graph_build_id: "11111111-1111-4111-8111-111111111111",
  graph_digest: digest("a"),
  anchor_digest: digest("b")
});
const shapePoint = (sequence, latitude, longitude, occurrenceId) => ({
  sequence,
  kind: "shape",
  latitude: String(latitude),
  longitude: String(longitude),
  occurrence_id: occurrenceId,
  source_kind: "authoritative_clipped_geometry",
  source_segment_key: `OH:ODOT:SEGMENT:${sequence}`,
  source_digest: digest("c")
});
const padPoint = (sequence, latitude, longitude, padId) => ({
  sequence,
  kind: "pad_destination",
  latitude: String(latitude),
  longitude: String(longitude),
  source_kind: "saved_pad_gps",
  pad_id: padId
});
const manifest = (padId, points) => ({
  manifest_version: "issue97-google-v1",
  manifest_digest: digest("d"),
  status: "ready",
  route_ready: true,
  pad_id: padId,
  route_revision: 7,
  points
});

// Cologie regression: the two Springdale Hill traversals are different saved
// occurrences and must never be collapsed by road name or canonical road ID.
const cologiePad = "e2b32e85-9e93-4388-8215-9d8167cbbeb8";
const cologiePoints = [
  graphPoint(1, "junction", 40.2851001, -80.9441001, "foxes-bottom-occurrence"),
  graphPoint(2, "junction", 40.2782002, -80.9322002, "springdale-occurrence-one"),
  graphPoint(3, "junction", 40.2703003, -80.9223003, "lamborn-occurrence"),
  graphPoint(4, "junction", 40.2654004, -80.9164004, "springdale-occurrence-two"),
  graphPoint(5, "junction", 40.2595005, -80.9125005, "unionvale-occurrence"),
  shapePoint(6, 40.2566006, -80.9130006, "unionvale-occurrence"),
  padPoint(7, "40.25403", "-80.913577", cologiePad)
];
const cologie = planner.buildPlan(manifest(cologiePad, cologiePoints));
assert.equal(cologie.points.length, 7);
assert.equal(cologie.points.filter(point => point.occurrence_id?.startsWith("springdale-occurrence")).length, 2);
assert.notEqual(cologie.points[1].occurrence_id, cologie.points[3].occurrence_id);
assert.equal(cologie.chunks.at(-1).destination, "40.25403,-80.913577");

// Shared sections must contribute both exact anchors in traversal order.
const sharedPad = "22222222-2222-4222-8222-222222222222";
const shared = planner.buildPlan(manifest(sharedPad, [
  graphPoint(1, "shared_entry", 40.1, -80.1, "shared-left", "shared-junction"),
  graphPoint(2, "shared_exit", 40.2, -80.2, "shared-right", "shared-junction"),
  padPoint(3, 40.3, -80.3, sharedPad)
]));
assert.deepEqual(Array.from(shared.points, point => point.kind), ["shared_entry", "shared_exit", "pad_destination"]);
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  graphPoint(1, "shared_entry", 40.1, -80.1, "shared-left", "shared-junction"),
  padPoint(2, 40.3, -80.3, sharedPad)
])), /shared segment/i);

// A shaping coordinate without clipped-source provenance is held, never guessed.
const unsafeShape = shapePoint(1, 40.4, -80.4, "parallel-road-occurrence");
delete unsafeShape.source_segment_key;
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  unsafeShape,
  padPoint(2, 40.5, -80.5, sharedPad)
])), /clipped authoritative geometry/i);

// Many-step routes split without reordering or dropping mandatory points. Each
// continuation starts at the exact preceding destination.
const manyPad = "33333333-3333-4333-8333-333333333333";
const manyPoints = Array.from({ length: 12 }, (_, index) =>
  shapePoint(index + 1, 39.9 + index / 1000, -80.9 - index / 1000, `occurrence-${index + 1}`)
);
manyPoints.push(padPoint(13, 39.95, -80.95, manyPad));
const many = planner.buildPlan(manifest(manyPad, manyPoints));
assert.ok(many.chunks.length > 1);
assert.deepEqual(
  Array.from(many.chunks.flatMap(chunk => Array.from(chunk.point_sequences))),
  manyPoints.map(point => point.sequence),
  "chunking must preserve every manifest point exactly once"
);

for (const [index, chunk] of many.chunks.entries()) {
  assert.ok(chunk.waypoints.length <= 3, "a chunk exceeded the mobile waypoint cap");
  assert.ok(chunk.url.length <= 2048, "a chunk exceeded the Maps URL limit");
  const parsed = new URL(chunk.url);
  assert.equal(parsed.searchParams.get("api"), "1");
  assert.equal(parsed.searchParams.get("travelmode"), "driving");
  assert.equal(parsed.searchParams.get("dir_action"), "navigate");
  if (index === 0) assert.equal(parsed.searchParams.get("origin"), null);
  else {
    assert.equal(chunk.origin, many.chunks[index - 1].destination);
    assert.equal(parsed.searchParams.get("origin"), many.chunks[index - 1].destination);
  }
  const coordinates = [
    parsed.searchParams.get("origin"),
    parsed.searchParams.get("destination"),
    ...(parsed.searchParams.get("waypoints") || "").split("|")
  ].filter(Boolean);
  for (const coordinate of coordinates) {
    assert.match(coordinate, /^-?[0-9]+(?:\.[0-9]+)?,-?[0-9]+(?:\.[0-9]+)?$/,
      "Google route URLs may contain only numeric coordinate controls");
  }
}

assert.throws(() => planner.buildPlan({
  ...manifest(manyPad, [padPoint(1, 39.95, -80.95, manyPad)]),
  route_ready: false,
  status: "held"
}), /not route-ready/i);

console.log(`Issue #97 Google route-plan regression passed (${cologie.chunks.length} Cologie chunks; ${many.chunks.length} many-point chunks).`);
