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
const brandingSource = fs.readFileSync(
  path.resolve(here, "../src/parts/02-pad-location-branding.js"),
  "utf8"
);
const padPageSource = fs.readFileSync(
  path.resolve(here, "../src/parts/11-pad-page.js"),
  "utf8"
);
const assistantShellSource = fs.readFileSync(
  path.resolve(here, "../src/parts/16-router-assistant-shell.js"),
  "utf8"
);
const assistantAnswersSource = fs.readFileSync(
  path.resolve(here, "../src/parts/17-assistant-answers.js"),
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
const shapePoint = (sequence, latitude, longitude, occurrenceId, shapeRole = "sample") => ({
  sequence,
  kind: "shape",
  latitude: String(latitude),
  longitude: String(longitude),
  occurrence_id: occurrenceId,
  shape_role: shapeRole,
  source_kind: "authoritative_clipped_geometry",
  source_segment_keys: [`OH:ODOT:SEGMENT:${sequence}`],
  source_digest: digest("c"),
  road_name: "Forbidden Road Name"
});
const ingressPoint = (sequence, latitude, longitude, occurrenceId) =>
  shapePoint(sequence, latitude, longitude, occurrenceId, "route_ingress");
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
  pad_name: "Forbidden Named Pad",
  points
});

// Cologie regression: the two Springdale Hill traversals are different saved
// occurrences and must never be collapsed by road name or canonical road ID.
const cologiePad = "e2b32e85-9e93-4388-8215-9d8167cbbeb8";
const cologiePoints = [
  ingressPoint(1, 40.2910001, -80.9510001, "us-250-occurrence"),
  graphPoint(2, "junction", 40.2851001, -80.9441001, "foxes-bottom-occurrence"),
  graphPoint(3, "junction", 40.2782002, -80.9322002, "springdale-occurrence-one"),
  graphPoint(4, "junction", 40.2703003, -80.9223003, "lamborn-occurrence"),
  graphPoint(5, "junction", 40.2654004, -80.9164004, "springdale-occurrence-two"),
  graphPoint(6, "junction", 40.2595005, -80.9125005, "unionvale-occurrence"),
  shapePoint(7, 40.2566006, -80.9130006, "unionvale-occurrence"),
  padPoint(8, "40.25403", "-80.913577", cologiePad)
];
const cologie = planner.buildPlan(manifest(cologiePad, cologiePoints));
assert.equal(cologie.points.length, 8);
assert.equal(cologie.points.filter(point => point.occurrence_id?.startsWith("springdale-occurrence")).length, 2);
assert.notEqual(cologie.points[2].occurrence_id, cologie.points[4].occurrence_id);
assert.equal(cologie.chunks.at(-1).destination, "40.25403,-80.913577");

// Shared sections must contribute both exact anchors in traversal order.
const sharedPad = "22222222-2222-4222-8222-222222222222";
const shared = planner.buildPlan(manifest(sharedPad, [
  ingressPoint(1, 40.0, -80.0, "shared-ingress"),
  graphPoint(2, "shared_entry", 40.1, -80.1, "shared-left", "shared-junction"),
  shapePoint(3, 40.15, -80.15, "shared-interior"),
  graphPoint(4, "shared_exit", 40.2, -80.2, "shared-right", "shared-junction"),
  padPoint(5, 40.3, -80.3, sharedPad)
]));
assert.deepEqual(Array.from(shared.points, point => point.kind),
  ["shape", "shared_entry", "shape", "shared_exit", "pad_destination"]);
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  ingressPoint(1, 40.0, -80.0, "shared-ingress"),
  graphPoint(2, "shared_entry", 40.1, -80.1, "shared-left", "shared-junction"),
  padPoint(3, 40.3, -80.3, sharedPad)
])), /shared (?:segment|section)/i);

// A shaping coordinate without clipped-source provenance is held, never guessed.
const unsafeShape = ingressPoint(1, 40.4, -80.4, "parallel-road-occurrence");
delete unsafeShape.source_segment_keys;
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  unsafeShape,
  padPoint(2, 40.5, -80.5, sharedPad)
])), /clipped authoritative geometry/i);

const coordinatePattern = /^-?[0-9]+(?:\.[0-9]+)?,-?[0-9]+(?:\.[0-9]+)?$/;
const routePoints = (count, padId) => {
  const points = [ingressPoint(1, "39.900001", "-80.900001", `occurrence-${count}-1`)];
  for (let sequence = 2; sequence < count; sequence += 1) {
    points.push(shapePoint(
      sequence,
      (39.9 + sequence / 10000).toFixed(6),
      (-80.9 - sequence / 10000).toFixed(6),
      `occurrence-${count}-${sequence}`
    ));
  }
  points.push(padPoint(count, (39.95 + count / 10000).toFixed(6), (-80.95 - count / 10000).toFixed(6), padId));
  return points;
};

function assertExactChunkMapping(count) {
  const padId = `00000000-0000-4000-8000-${String(count).padStart(12, "0")}`;
  const points = routePoints(count, padId);
  const plan = planner.buildPublicPlan({
    pad_id: padId,
    route_revision: 7,
    manifest: manifest(padId, points)
  });
  assert.equal(plan.chunks.length, Math.ceil(count / 4), `N=${count} chunk count changed`);

  let consumed = 0;
  for (const [index, chunk] of plan.chunks.entries()) {
    const selected = points.slice(consumed, consumed + 4);
    const expectedOrigin = index === 0 ? null : planner.coordinate(points[consumed - 1]);
    const expectedDestination = planner.coordinate(selected.at(-1));
    const expectedWaypoints = selected.slice(0, -1).map(planner.coordinate);
    const expectedSequences = selected.map(point => point.sequence);
    assert.equal(chunk.origin, expectedOrigin, `N=${count} chunk ${index + 1} origin changed`);
    assert.equal(chunk.destination, expectedDestination, `N=${count} chunk ${index + 1} destination changed`);
    assert.deepEqual(Array.from(chunk.waypoints), expectedWaypoints,
      `N=${count} chunk ${index + 1} waypoint order changed`);
    assert.deepEqual(Array.from(chunk.point_sequences), expectedSequences,
      `N=${count} chunk ${index + 1} point mapping changed`);
    assert.ok(chunk.waypoints.length <= 3, "a chunk exceeded the mobile waypoint cap");
    assert.ok(chunk.url.length <= 2048, "a chunk exceeded the Maps URL limit");

    const parsed = new URL(chunk.url);
    const expectedKeys = ["api", "travelmode", "dir_action"];
    if (expectedOrigin) expectedKeys.push("origin");
    expectedKeys.push("destination");
    if (expectedWaypoints.length) expectedKeys.push("waypoints");
    assert.deepEqual(Array.from(parsed.searchParams.keys()), expectedKeys,
      "Google route URL gained a non-coordinate or unsupported parameter");
    assert.equal(parsed.searchParams.get("api"), "1");
    assert.equal(parsed.searchParams.get("travelmode"), "driving");
    assert.equal(parsed.searchParams.get("dir_action"), "navigate");
    assert.equal(parsed.searchParams.get("origin"), expectedOrigin);
    assert.equal(parsed.searchParams.get("destination"), expectedDestination);
    assert.deepEqual(
      (parsed.searchParams.get("waypoints") || "").split("|").filter(Boolean),
      expectedWaypoints,
      `N=${count} chunk ${index + 1} encoded waypoint order changed`
    );
    for (const coordinate of [expectedOrigin, expectedDestination, ...expectedWaypoints].filter(Boolean)) {
      assert.match(coordinate, coordinatePattern,
        "Google route URLs may contain only numeric coordinate controls");
    }
    assert.ok(!decodeURIComponent(chunk.url).includes("Forbidden Road Name"));
    assert.ok(!decodeURIComponent(chunk.url).includes("Forbidden Named Pad"));
    consumed += selected.length;
  }
  assert.equal(consumed, points.length, `N=${count} did not consume every manifest point`);
  assert.deepEqual(
    Array.from(plan.chunks.flatMap(chunk => Array.from(chunk.point_sequences))),
    points.map(point => point.sequence),
    `N=${count} chunking must preserve every manifest point exactly once`
  );
  return { plan, points };
}

for (const count of [2, 4, 5, 8, 9]) assertExactChunkMapping(count);

// Keep a shared pair exact even when the mobile cap puts entry at the end of
// one URL and exit at the beginning of the continuation URL.
const sharedBoundaryPoints = [
  ingressPoint(1, 40.01, -80.01, "shared-boundary-ingress"),
  shapePoint(2, 40.02, -80.02, "shared-boundary-approach"),
  graphPoint(3, "junction", 40.03, -80.03, "shared-boundary-junction"),
  graphPoint(4, "shared_entry", 40.04, -80.04, "shared-boundary-entry", "shared-boundary"),
  graphPoint(5, "shared_exit", 40.05, -80.05, "shared-boundary-exit", "shared-boundary"),
  padPoint(6, 40.06, -80.06, sharedPad)
];
const sharedBoundary = planner.buildPlan(manifest(sharedPad, sharedBoundaryPoints));
assert.equal(sharedBoundary.chunks.length, 2);
assert.equal(sharedBoundary.chunks[0].destination, planner.coordinate(sharedBoundaryPoints[3]));
assert.equal(sharedBoundary.chunks[1].origin, planner.coordinate(sharedBoundaryPoints[3]));
assert.deepEqual(Array.from(sharedBoundary.chunks[1].waypoints), [planner.coordinate(sharedBoundaryPoints[4])]);
assert.equal(sharedBoundary.chunks[1].destination, planner.coordinate(sharedBoundaryPoints[5]));
const sharedContinuationUrl = new URL(sharedBoundary.chunks[1].url);
assert.equal(sharedContinuationUrl.searchParams.get("origin"), planner.coordinate(sharedBoundaryPoints[3]));
assert.equal(sharedContinuationUrl.searchParams.get("waypoints"), planner.coordinate(sharedBoundaryPoints[4]));
assert.equal(sharedContinuationUrl.searchParams.get("destination"), planner.coordinate(sharedBoundaryPoints[5]));

// A ready receipt cannot degrade into a destination-only link or start at an
// unproven junction, and public projection columns must bind to the receipt.
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  padPoint(1, 40.5, -80.5, sharedPad)
])), /route ingress and pad destination/i);
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  graphPoint(1, "junction", 40.4, -80.4, "unproven-ingress"),
  padPoint(2, 40.5, -80.5, sharedPad)
])), /source-proven route ingress/i);
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  ingressPoint(1, 40.4, -80.4, "duplicate-ingress-one"),
  ingressPoint(2, 40.45, -80.45, "duplicate-ingress-two"),
  padPoint(3, 40.5, -80.5, sharedPad)
])), /only one route ingress/i);
assert.throws(() => planner.buildPlan(manifest(sharedPad, [
  ingressPoint(1, 40.4, -80.4, "wrong-destination-pad"),
  padPoint(2, 40.5, -80.5, cologiePad)
])), /destination pad does not match/i);

const boundManifest = manifest(sharedPad, [
  ingressPoint(1, 40.4, -80.4, "bound-row-ingress"),
  padPoint(2, 40.5, -80.5, sharedPad)
]);
assert.doesNotThrow(() => planner.buildPublicPlan({
  pad_id: sharedPad,
  route_revision: 7,
  manifest: boundManifest
}));
assert.throws(() => planner.buildPublicPlan({
  pad_id: cologiePad,
  route_revision: 7,
  manifest: boundManifest
}), /public row pad does not match/i);
assert.throws(() => planner.buildPublicPlan({
  pad_id: sharedPad,
  route_revision: 8,
  manifest: boundManifest
}), /public row revision does not match/i);

assert.throws(() => planner.buildPlan({
  ...manifest(sharedPad, [
    ingressPoint(1, 40.4, -80.4, "held-ingress"),
    padPoint(2, 40.5, -80.5, sharedPad)
  ]),
  route_ready: false,
  status: "held"
}), /not route-ready/i);

// Quick navigation may deep-link only a single URL. Multi-part plans must hand
// off to the pad page, while the typed assistant response renders every part.
for (const token of [
  "function googleMapsQuickNavigationIssue97(p)",
  "if (chunks.length === 1)",
  "if (chunks.length > 1)",
  'kind: "route_plan"',
  "const navigation = googleMapsQuickNavigationIssue97(p)",
  'navigation.external ? \' target="_blank" rel="noopener"\''
]) assert.ok(brandingSource.includes(token), `Issue #97 quick-navigation contract missing: ${token}`);
for (const token of [
  "googleRouteChunks.map((chunk, index)",
  'data-google-route-chunk="${index + 1}"',
  "`Google route ${index + 1} of ${googleRouteChunks.length}`"
]) assert.ok(padPageSource.includes(token), `Issue #97 pad route-plan action missing: ${token}`);
for (const token of [
  "const navigation = googleMapsQuickNavigationIssue97(p)",
  'navigation.kind === "route_plan"',
  "window.location.hash = navigation.href",
  'window.open(navigation.href, "_blank", "noopener")'
]) assert.ok(assistantShellSource.includes(token), `Issue #97 mobile quick-navigation guard missing: ${token}`);
for (const token of [
  "const googleChunks = googleMapsRouteChunks(target)",
  "googleChunks.map((chunk, index)",
  "`Open Google route ${index + 1} of ${googleChunks.length}`",
  "Open exact pad GPS (route not verified)"
]) assert.ok(assistantAnswersSource.includes(token), `Issue #97 assistant navigation response missing: ${token}`);

console.log(`Issue #97 Google route-plan regression passed (${cologie.chunks.length} Cologie chunks; exact N=2,4,5,8,9 mappings).`);
