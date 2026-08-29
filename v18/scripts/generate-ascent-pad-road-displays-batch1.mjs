import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const v18Directory = resolve(scriptDirectory, "..");
const outputPath = resolve(v18Directory, "src/features/map/ascentPadRoadDisplays.batch1.json");
const supabaseClientPath = resolve(v18Directory, "src/data/supabaseClient.ts");
const supabaseUrl = "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const cologieId = "e2b32e85-9e93-4388-8215-9d8167cbbeb8";
const cologieDestination = [-80.913577, 40.25403];
const dukeDestination = [-80.891316, 40.214409];
const dukeControls = [
  [-80.9648236, 40.2376831],
  [-80.9645933421097, 40.2376772526251],
  [-80.9216048043883, 40.2344651449313],
  [-80.9156965297937, 40.2438460898288],
  dukeDestination,
];

function fail(message) {
  throw new Error(`Ascent Batch 1 generation failed: ${message}`);
}

function coordinate(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function sameCoordinate(left, right) {
  return coordinate(left)
    && coordinate(right)
    && left[0] === right[0]
    && left[1] === right[1];
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function flattenExactFeatures(features) {
  const output = [];
  for (const [index, feature] of features.entries()) {
    if (feature?.type !== "Feature"
      || feature?.properties?.stepOrder !== index + 1
      || feature?.geometry?.type !== "LineString"
      || !Array.isArray(feature.geometry.coordinates)
      || feature.geometry.coordinates.length < 2
      || !feature.geometry.coordinates.every(coordinate)) fail("COLOGIE geometry shape changed");
    const part = feature.geometry.coordinates;
    if (index > 0 && !sameCoordinate(output.at(-1), part[0])) fail("COLOGIE geometry is no longer continuous");
    output.push(...(index === 0 ? part : part.slice(1)));
  }
  return output;
}

async function readPublishableKey() {
  const source = await readFile(supabaseClientPath, "utf8");
  const key = source.match(/sb_publishable_[^"']+/)?.[0];
  if (!key) fail("the existing public browser key could not be read");
  return key;
}

async function fetchCologie() {
  const key = await readPublishableKey();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brinesearch_v18_driver_pad_status_with_named_approaches`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_pad_id: cologieId }),
  });
  if (!response.ok) fail(`COLOGIE public route read returned ${response.status}`);
  const bundle = await response.json();
  const status = bundle?.status;
  const route = status?.route;
  const expectedRoads = [
    "FOXS BOTTOM RD",
    "SPRINGDALE HILL RD",
    "LAMBORN RD",
    "SPRINGDALE HILL RD",
    "BLAIRMONT RD",
  ];
  if (status?.padId !== cologieId
    || status?.recordRevision !== "1787615581785257"
    || status?.statusRevision !== "2dc5f3400ea3a4b42d9c34c0f7c6d215"
    || route?.state !== "ready"
    || route?.source !== "exact_graph"
    || status?.graph?.state !== "active_current"
    || status?.destination?.role !== "driver_entrance"
    || status?.destination?.latitude !== cologieDestination[1]
    || status?.destination?.longitude !== cologieDestination[0]
    || JSON.stringify(route?.steps?.map((step) => step.displayName)) !== JSON.stringify(expectedRoads)
    || route?.geometry?.type !== "FeatureCollection"
    || route.geometry.features?.length !== expectedRoads.length) fail("COLOGIE exact public route contract changed");

  const coordinates = flattenExactFeatures(route.geometry.features);
  if (!sameCoordinate(coordinates.at(-1), cologieDestination)) fail("COLOGIE no longer reaches its exact GPS");
  return {
    coordinates,
    source: {
      kind: "public_exact_graph",
      reference: "brinesearch_v18_driver_pad_status_with_named_approaches",
      statusRevision: status.statusRevision,
      graphLastVerifiedAt: status.graph.lastVerifiedAt,
      geometrySha256: digest(coordinates),
    },
  };
}

async function fetchDuke() {
  const coordinatesParameter = dukeControls.map(([longitude, latitude]) => `${longitude},${latitude}`).join(";");
  const requestUrl = `https://router.project-osrm.org/route/v1/driving/${coordinatesParameter}?alternatives=false&steps=true&geometries=geojson&overview=full&continue_straight=true`;
  const response = await fetch(requestUrl);
  if (!response.ok) fail(`DUKE exact network read returned ${response.status}`);
  const payload = await response.json();
  const route = payload?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  const roadIdentities = [...new Map(
    route?.legs?.flatMap((leg) => leg.steps || []).filter((step) => step.name).map((step) => [
      `${step.ref || ""}|${step.name}`,
      { ref: step.ref || null, name: step.name },
    ]) || [],
  ).values()];
  const expectedRoadIdentities = [
    { ref: "US 250", name: "Cadiz-Harrisville Road" },
    { ref: "C-15", name: "Foxes Bottom Road" },
    { ref: null, name: "Springdale Hill Road" },
    { ref: null, name: "Lamborn Road" },
  ];
  const snapDistances = payload?.waypoints?.map((waypoint) => waypoint.distance);
  if (payload?.code !== "Ok"
    || route?.geometry?.type !== "LineString"
    || !Array.isArray(coordinates)
    || coordinates.length < 200
    || !coordinates.every(coordinate)
    || JSON.stringify(roadIdentities) !== JSON.stringify(expectedRoadIdentities)
    || !Array.isArray(snapDistances)
    || snapDistances.length !== dukeControls.length
    || snapDistances.some((distance) => typeof distance !== "number" || distance > 2)
    || snapDistances.at(-1) > 1) fail("DUKE reviewed named-road reconstruction changed");

  // The owner-reviewed evidence records a 0.75 m network snap at DUKE. Replace
  // that sub-metre rounded network endpoint with the exact frozen GPS so this
  // display terminates at the saved point without drawing a synthetic tail.
  const exactCoordinates = coordinates.map((point) => [...point]);
  exactCoordinates[exactCoordinates.length - 1] = [...dukeDestination];
  if (!sameCoordinate(exactCoordinates.at(-1), dukeDestination)) fail("DUKE does not reach its exact GPS");
  return {
    coordinates: exactCoordinates,
    source: {
      kind: "owner_verified_osrm_reconstruction",
      reference: "docs/issue97-duke-reviewed-handoff-20260827.md",
      routedRoadIdentities: expectedRoadIdentities,
      waypointSnapMeters: snapDistances,
      terminalSnapMeters: snapDistances.at(-1),
      geometrySha256: digest(exactCoordinates),
    },
  };
}

const [cologie, duke] = await Promise.all([fetchCologie(), fetchDuke()]);
const artifact = {
  schemaVersion: 1,
  batchId: "ascent-gps-road-lines-20260829-1",
  generatedAt: new Date().toISOString(),
  displayScope: "persistent-main-map-all-and-ascent",
  displayAuthority: "Exact record-bound field display only; not State-1, graph, road, or public-Google authority.",
  rules: {
    arrivalMustEndAtExactSavedGps: true,
    noSyntheticGpsConnector: true,
    redContinuationRequiresExactNoDownstreamPadProof: true,
    interstateUsAndStateRoutesNeverRed: true,
  },
  routes: [
    {
      padId: cologieId,
      canonicalId: cologieId,
      legacyId: "ascent--cologie",
      recordRevision: "1787615581785257",
      padName: "COLOGIE",
      company: "Ascent",
      state: "Ohio",
      county: "Harrison",
      destination: { role: "driver_entrance", longitude: cologieDestination[0], latitude: cologieDestination[1] },
      reviewedRoadSequence: "US-250 → Foxes Bottom Rd / CR-15 → Springdale Hill Rd / TR-79 → Lamborn Rd / TR-72 → Springdale Hill Rd / TR-79 → Unionvale-Kenwood / CR-13 → saved GPS",
      arrival: {
        type: "LineString",
        colorRole: "teal",
        visibility: "main-map-all-and-ascent",
        label: "COLOGIE named roads → exact saved GPS",
        pointCount: cologie.coordinates.length,
        coordinates: cologie.coordinates,
      },
      redContinuation: null,
      redDecision: {
        state: "not_drawn_corridor_order_unverified",
        reason: "No exact downstream-pad and next-highway-junction proof is frozen for COLOGIE's final local road.",
      },
      source: cologie.source,
    },
    {
      padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
      canonicalId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
      legacyId: "ascent--duke",
      recordRevision: "1786265812046205",
      padName: "DUKE",
      company: "Ascent",
      state: "Ohio",
      county: "Harrison",
      destination: { role: "saved_pad_reference", longitude: dukeDestination[0], latitude: dukeDestination[1] },
      reviewedRoadSequence: "US-250 → Foxes Bottom Rd / CR-15 → Springdale Hill Rd → Lamborn Rd → exact saved GPS",
      arrival: {
        type: "LineString",
        colorRole: "teal",
        visibility: "main-map-all-and-ascent",
        label: "DUKE named roads → exact saved GPS",
        pointCount: duke.coordinates.length,
        coordinates: duke.coordinates,
      },
      redContinuation: null,
      redDecision: {
        state: "not_drawn_downstream_pad_present",
        reason: "CRICKET is recorded farther along the Lamborn corridor, so DUKE is not treated as the last pad on that road.",
        downstreamPadId: "3a72c3df-f0a1-4639-a468-019989c78f43",
        downstreamPadName: "CRICKET",
      },
      source: duke.source,
    },
  ],
};

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(`Wrote ${artifact.routes.length} exact Ascent GPS-reaching lines to ${outputPath}`);
