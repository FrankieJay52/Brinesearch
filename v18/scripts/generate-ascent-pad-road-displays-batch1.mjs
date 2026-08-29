import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const v18Directory = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(v18Directory, "..");
const outputPath = resolve(v18Directory, "src/features/map/ascentPadRoadDisplays.batch1.json");
const ledgerPath = resolve(repositoryRoot, "docs/batch0-ascent-six-county-navigation-ledger-20260827.csv");
const bannockDisplayPath = resolve(v18Directory, "src/features/map/bannockRoadDisplay.json");
const supabaseClientPath = resolve(v18Directory, "src/data/supabaseClient.ts");
const supabaseUrl = "https://wvxzqtoiwhrgovzddtvz.supabase.co";
const atomicStatusRpc = "brinesearch_v18_driver_pad_status_with_named_approaches";
const osrmBaseUrl = "https://router.project-osrm.org/route/v1/driving";
const directorySnapshotId = "68f1d076-fe03-4519-a5cd-c68f8a28b06c";
const directorySourceRevision = "8";

const cologieId = "e2b32e85-9e93-4388-8215-9d8167cbbeb8";
const lassoId = "518659d9-bca2-47b0-b294-3141ba679fc4";
const bannockId = "333598ca-37b3-4b44-9411-a490cc3da672";
const reviewedContractState = "reviewed_handoff_authority_held";

const atomicPrimaryDefinitions = new Map([
  ["b7526e45-0b33-4988-ae1c-0a4140971f8e", {
    kind: "primary_named_approach",
    variant: "frozen_oh519_named_approach",
    reviewedRoadSequence: "OH-9 → OH-519 / Stumptown Rd → saved GPS",
    reference: "supabase/migrations/20260827015800_issue97_banjo_oh519_named_core.sql",
  }],
  ["185d9eb6-58af-4009-bf53-fdd23113a572", {
    kind: "primary_named_approach",
    variant: "primary_via_freeport",
    reviewedRoadSequence: "OH-800 → OH-799 → Kennedy Ridge Rd → Douglas Turn Rd → saved GPS",
    reference: "supabase/migrations/20260826232154_issue97_harrison_named_approaches_batch1.sql",
  }],
  [cologieId, {
    kind: "exact_public_graph",
    variant: "exact_public_graph",
    reviewedRoadSequence: "US-250 → Foxes Bottom Rd / CR-15 → Springdale Hill Rd / TR-79 → Lamborn Rd / TR-72 → Springdale Hill Rd / TR-79 → Unionvale-Kenwood / CR-13 → saved GPS",
    reference: atomicStatusRpc,
  }],
  ["95dcbd15-afd0-4357-a521-e23bcd6b4118", {
    kind: "primary_named_approach",
    variant: "primary_via_freeport",
    reviewedRoadSequence: "OH-800 → OH-799 → Kennedy Ridge Rd → saved GPS",
    reference: "supabase/migrations/20260826232154_issue97_harrison_named_approaches_batch1.sql",
  }],
  ["61e21e3c-360b-40b0-8153-209b4fb3d5eb", {
    kind: "primary_named_approach",
    variant: "primary_via_freeport",
    reviewedRoadSequence: "OH-799 → Kennedy Ridge Rd → saved GPS",
    reference: "supabase/migrations/20260826232154_issue97_harrison_named_approaches_batch1.sql",
  }],
  ["b9a8e55c-3583-4019-85fc-54a03d420ace", {
    kind: "primary_named_approach",
    variant: "primary_via_freeport",
    reviewedRoadSequence: "OH-800 → OH-799 → Kennedy Ridge Rd → saved GPS",
    reference: "supabase/migrations/20260826232154_issue97_harrison_named_approaches_batch1.sql",
  }],
  [lassoId, {
    kind: "core_destination_release",
    variant: "frozen_exact_core_destination",
    reviewedRoadSequence: "US-250 → Foxes Bottom Rd / CR-15 → Springdale Hill Rd → saved GPS",
    reference: "supabase/migrations/20260826184037_issue97_lasso_exact_core_destination_handoff.sql",
  }],
  ["655a97d5-ffdf-4b13-bf66-3d22022239b4", {
    kind: "primary_named_approach",
    variant: "primary_via_freeport",
    reviewedRoadSequence: "OH-800 → OH-799 → Kennedy Ridge Rd → Blue Trail → Huff Run Rd → saved GPS",
    reference: "supabase/migrations/20260826232154_issue97_harrison_named_approaches_batch1.sql",
  }],
  ["f5a82acf-d7c0-4ce3-ad4e-0de810551450", {
    kind: "primary_named_approach",
    variant: "primary_via_freeport",
    reviewedRoadSequence: "OH-800 → OH-799 → Kennedy Ridge Rd → saved GPS",
    reference: "supabase/migrations/20260826232154_issue97_harrison_named_approaches_batch1.sql",
  }],
]);

// Exact-alias review accepted documented spelling/designation variants. These
// seven OSRM tails contain a missing or additional named identity and stay
// diagnostic/unapproved; none is promoted by this display artifact.
const strictNameOrderDivergences = new Map([
  ["BEETLE", "OSRM misses Sixteen Road and loops through Shortcreek Twp 90, High Street, Olive Branch, US-250, and Stumptown."],
  ["HASTINGS", "OSRM adds Jockey Hollow Road after the reviewed Chaney Road segment."],
  ["HOOP", "OSRM adds Hoop Lane after the reviewed Titus Road segment."],
  ["LODGE", "OSRM adds Cox Road, repeats Lodge Road, and adds McLaughlin Lane after the reviewed Lodge Road segment."],
  ["HAMILTON", "OSRM adds Twp 253 after the reviewed Kennedy Ridge Road segment."],
  ["LASSO", "OSRM adds Lamborn Road and returns to Springdale Hill Road after the frozen public-road handoff."],
  ["PETTAY", "OSRM inserts Twp 344 between the reviewed Blue Trail and Huff Run Road segments."],
]);

// Exact OSRM identity spellings/designations accepted by the reviewed static
// contracts. The groups are ordered. A solid reconstruction may remain in the
// current group or advance to a later group, but it stops forever at the first
// non-matching non-empty step. This is intentionally an exact allowlist: there
// is no fuzzy, nearest-road, or name-only inference beyond the documented
// aliases already called out by the owner-review receipts.
const staticSolidIdentityGroups = new Map([
  ["ALBATROSS", [["Brooks Road"]]],
  ["BAKOS", [["Hollyview Drive", "T-452"]]],
  ["CROWIE", [["Vineyard Road", "C-56"], ["Williams Road"]]],
  ["DUTTON", [["Dutton Drive"]]],
  ["HASTINGS", [["Chaney Road"]]],
  ["KUNGLE A", [["Potts Road", "T-506"]]],
  ["KUNGLE B", [["Potts Road", "T-506"]]],
  ["LORRAINE", [["Crescent Road"], ["Barton Crescent Road"], ["Blaine Barton Road", "C-10"]]],
  ["MALDON", [["Shannon Road"], ["Lowe Road"]]],
  ["MATUSEK", [["Shepherdstown Road"], ["Fairpoint Shepardstown Road"], ["Sloans Run Road"]]],
  ["PANG", [["Shepherdstown Road"]]],
  ["PORTERFIELD B", [["Vineyard Road", "C-56"]]],
  ["PORTERFIELD GAS UNIT", [["Vineyard Road", "C-56"]]],
  ["ROCK RIDGE", [["Shannon Road"], ["Lowe Road"], ["Fairview Road"], ["Douglas Road"], ["Pultney Ridge Road"]]],
  ["TRUCHAN NE", [["Shepherdstown Road"], ["Fairpoint Shepardstown Road"], ["Sloans Run Road"]]],
  ["TRUCHAN NW", [["Shepherdstown Road"], ["Fairpoint Shepardstown Road"]]],
  ["WHEELING VALLEY", [["Fairpoint Shepardstown Road"], ["Sloans Run Road"], ["Dunn Road"], ["Morgan Road"]]],
  ["WITHEY", [["Gobblers Knob Road"]]],
  ["BILINOVICH", [["Mc Coy Road", "McCoy Road"], ["Merry Road"], ["Penrose Road"], ["Logan Road"], ["Turkle Road"]]],
  ["CASTON", [["Mc Coy Road", "McCoy Road"], ["Jasper Road"], ["Caston Road"]]],
  ["CIRCLE-OAKS", [["Martha Road"], ["Titus Road", "C-878", "C-78; C-878"]]],
  ["GIL", [["Mc Coy Road", "McCoy Road"], ["Merry Road"], ["Penrose Road"], ["Logan Road"]]],
  ["GILCHER", [["Mc Coy Road", "McCoy Road"], ["Merry Road"], ["Penrose Road"]]],
  ["HOOP", [["Cadiz Road", "US 22"], ["Titus Road"]]],
  ["JACKALOPE", [["Martha Road"], ["Titus Road"], ["Lodge Road", "C-78"], ["Cox Road"], ["Lodge Road", "C-78"]]],
  ["LAKE", [["Mc Coy Road", "McCoy Road"], ["Tyson Mill Road", "Tysons Mill Road"], ["Pennyroyal Road"]]],
  ["LAWSON", [["Mc Coy Road", "McCoy Road"], ["Tyson Mill Road"], ["Millers Fork Road"]]],
  ["LODGE", [["Martha Road"], ["Titus Road", "C-878"], ["Lodge Road", "C-78"]]],
  ["SKULL FORK", [["Repik Lane"]]],
  ["THOMAS", [["Tyson Mill Road"]]],
  ["TROYER", [["Mc Coy Road", "McCoy Road"], ["Pennyroyal Road"], ["Penrose Road"], ["Jesse Lane"]]],
  ["BEETLE", [["Stumptown Road", "SR 519"], ["Sixteen Road"]]],
  ["BRAVO", [["Wheeling Street", "Stumptown Road", "SR 519"], ["Crazy Road"]]],
  ["DUKE", [["Foxes Bottom Road", "C-15"], ["Springdale Hill Road"], ["Lamborn Road"]]],
  ["ECHO", [["Crazy Road"], ["Jockey Hollow Road"]]],
  ["JEFFCO", [["Rose Valley Road", "C-14"], ["Beech Road"]]],
  ["PICKENS", [["Stumptown Road", "SR 519"]]],
  ["SADLER", [["Jameson Road"]]],
  ["TOWE", [["Willis Run Road"], ["Oak Hill Road"]]],
  ["ATHENA", [["Main Street", "SR 151"]]],
  ["RUTH", [["US 250"]]],
  ["LODESTAR", [["Archers Ridge Road"], ["Town Highway 307"]]],
  ["MOONSTONE", [["Town Highway 228"]]],
  ["NORTH STAR", [["Archers Ridge Road"]]],
  ["WINSTON SMITH", [["Archers Ridge Road"], ["Town Highway 307"], ["Township Highway 303A"]]],
]);

function fail(message) {
  throw new Error(`Ascent all-55 generation failed: ${message}`);
}

function parseCsv(text) {
  const table = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      if (row.some(Boolean)) table.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) fail("the navigation ledger has an unterminated quoted field");
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    if (row.some(Boolean)) table.push(row);
  }
  const [headers, ...values] = table;
  if (!headers?.length) fail("the navigation ledger is empty");
  return values.map((fields) => Object.fromEntries(
    headers.map((header, index) => [header, fields[index] ?? ""]),
  ));
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

function digestText(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function haversineMeters(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function destinationForLedgerRow(row) {
  const latitude = Number(row.destination_latitude);
  const longitude = Number(row.destination_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    fail(`${row.name} has no valid frozen destination`);
  }
  const role = row.gps_source === "ODNR pad"
    ? "official_pad_reference"
    : row.gps_source === "ODNR wellhead"
      ? "official_wellhead_reference"
      : row.directory_coordinate_role === "verified driver entrance"
        ? "driver_entrance"
        : "saved_pad_reference";
  return { role, latitude, longitude, gpsSource: row.gps_source };
}

function directoryCoordinateForLedgerRow(row) {
  const latitude = Number(row.directory_latitude);
  const longitude = Number(row.directory_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || !row.directory_coordinate_role) {
    fail(`${row.name} has no valid directory coordinate binding`);
  }
  return {
    latitude,
    longitude,
    role: row.directory_coordinate_role,
  };
}

function routeBinding(row, destination) {
  return {
    padId: row.record_id,
    canonicalId: row.record_id,
    legacyId: row.legacy_id,
    recordRevision: row.record_revision,
    padName: row.name,
    company: row.company,
    state: row.state,
    county: row.county,
    structuredRoadSequence: row.structured_road_sequence,
    structuredRoadSequenceSha256: digest(row.structured_road_sequence),
    directoryCoordinate: directoryCoordinateForLedgerRow(row),
    destination,
  };
}

function flattenExactFeatures(features, label) {
  const output = [];
  for (const [index, feature] of features.entries()) {
    if (feature?.type !== "Feature"
      || feature?.properties?.stepOrder !== index + 1
      || feature?.geometry?.type !== "LineString"
      || !Array.isArray(feature.geometry.coordinates)
      || feature.geometry.coordinates.length < 2
      || !feature.geometry.coordinates.every(coordinate)) {
      fail(`${label} exact geometry shape changed`);
    }
    const part = feature.geometry.coordinates;
    if (index > 0 && !sameCoordinate(output.at(-1), part[0])) {
      fail(`${label} exact geometry is no longer continuous`);
    }
    output.push(...(index === 0 ? part : part.slice(1)));
  }
  return output;
}

async function fetchJsonWithRetry(url, options, label, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) return response.json();
      if ((response.status !== 429 && response.status < 500) || attempt === attempts) {
        fail(`${label} returned HTTP ${response.status}`);
      }
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      await delay(Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : 400 * (2 ** (attempt - 1)));
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await delay(400 * (2 ** (attempt - 1)));
    }
  }
  fail(`${label} failed after ${attempts} attempts: ${String(lastError)}`);
}

async function readPublishableKey() {
  const source = await readFile(supabaseClientPath, "utf8");
  const key = source.match(/sb_publishable_[^"']+/)?.[0];
  if (!key) fail("the existing public browser key could not be read");
  return key;
}

async function loadReviewedContracts() {
  const vite = await createServer({
    root: v18Directory,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });
  try {
    const module = await vite.ssrLoadModule("/src/data/reviewedNavigationCandidates.ts");
    const receiptRows = module.ownerApprovalReceiptRowsForAudit();
    if (receiptRows.length !== 46 || receiptRows.some((row) => !row.matchesCurrentContent)) {
      fail("the 46 reviewed navigation receipts are incomplete or have content drift");
    }
    return receiptRows.map((row) => {
      const contract = module.ownerApprovalReceiptInputForAudit(row.padId);
      if (!contract) fail(`reviewed contract ${row.padId} is missing`);
      return contract;
    });
  } finally {
    await vite.close();
  }
}

async function fetchAtomicBundles(rows) {
  const key = await readPublishableKey();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const entries = await Promise.all(rows.map(async (row) => {
    const bundle = await fetchJsonWithRetry(
      `${supabaseUrl}/rest/v1/rpc/${atomicStatusRpc}`,
      { method: "POST", headers, body: JSON.stringify({ p_pad_id: row.record_id }) },
      `${row.name} atomic status read`,
    );
    if (bundle?.status?.padId !== row.record_id
      || bundle?.status?.recordRevision !== row.record_revision) {
      fail(`${row.name} atomic status no longer matches its ledger binding`);
    }
    return [row.record_id, bundle];
  }));
  return new Map(entries);
}

function validateContractBinding(contract, row) {
  const destination = destinationForLedgerRow(row);
  if (contract.padId !== row.record_id
    || contract.canonicalId !== row.record_id
    || contract.legacyId !== row.legacy_id
    || contract.recordRevision !== row.record_revision
    || contract.company !== row.company
    || contract.padName !== row.name
    || contract.state !== row.state
    || contract.county !== row.county
    || contract.routeDestination.latitude !== destination.latitude
    || contract.routeDestination.longitude !== destination.longitude) {
    fail(`${row.name} reviewed contract no longer matches the exact ledger record`);
  }
  const navigationUrl = new URL(contract.routeUrl);
  const urlDestination = navigationUrl.searchParams.get("destination")
    ?.split(",").map(Number);
  const urlControls = navigationUrl.searchParams.get("waypoints")
    ?.split("|").map((point) => point.split(",").map(Number));
  const contractControls = contract.waypoints
    .map((point) => [point.latitude, point.longitude]);
  if (navigationUrl.searchParams.has("origin")
    || urlDestination?.[0] !== destination.latitude
    || urlDestination?.[1] !== destination.longitude
    || JSON.stringify(urlControls) !== JSON.stringify(contractControls)) {
    fail(`${row.name} reviewed Google URL no longer preserves its frozen destination and controls`);
  }
  return destination;
}

function roadIdentitiesForRoute(route) {
  const output = [];
  for (const step of route.legs?.flatMap((leg) => leg.steps || []) || []) {
    if (!step.ref && !step.name) continue;
    const identity = { ref: step.ref || null, name: step.name || null };
    if (JSON.stringify(output.at(-1)) !== JSON.stringify(identity)) output.push(identity);
  }
  return output;
}

function orderedStepsForRoute(route, label) {
  const output = [];
  for (const [legIndex, leg] of (route.legs || []).entries()) {
    for (const [stepIndex, step] of (leg.steps || []).entries()) {
      const coordinates = step.geometry?.coordinates;
      if (step.geometry?.type !== "LineString"
        || !Array.isArray(coordinates)
        || !coordinates.length
        || !coordinates.every(coordinate)
        || !Number.isFinite(step.distance)) {
        fail(`${label} OSRM step geometry is incomplete at leg ${legIndex + 1}, step ${stepIndex + 1}`);
      }
      output.push({
        legIndex,
        stepIndex,
        ref: step.ref || null,
        name: step.name || null,
        distanceMeters: step.distance,
        maneuverType: step.maneuver?.type || null,
        coordinates,
      });
    }
  }
  if (!output.length) fail(`${label} OSRM response has no step geometry`);
  return output;
}

async function fetchOsrmRoute(specification) {
  const requestPoints = specification.points
    .map((point) => [point.longitude, point.latitude]);
  if (requestPoints.length < 2 || !requestPoints.every(coordinate)) {
    fail(`${specification.padName} has invalid OSRM points`);
  }
  const coordinateText = requestPoints
    .map(([longitude, latitude]) => `${longitude},${latitude}`)
    .join(";");
  const requestUrl = `${osrmBaseUrl}/${coordinateText}?alternatives=false&steps=true&geometries=geojson&overview=full&continue_straight=true`;
  const payload = await fetchJsonWithRetry(
    requestUrl,
    { headers: { "User-Agent": "BrineSearch-local-artifact-generator/1.0" } },
    `${specification.padName} OSRM ${specification.purpose}`,
  );
  const route = payload?.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  const waypointSnapMeters = payload?.waypoints?.map((waypoint) => waypoint.distance);
  if (payload?.code !== "Ok"
    || route?.geometry?.type !== "LineString"
    || !Array.isArray(coordinates)
    || coordinates.length < 2
    || !coordinates.every(coordinate)
    || !Array.isArray(waypointSnapMeters)
    || waypointSnapMeters.length !== requestPoints.length
    || waypointSnapMeters.some((distance) => !Number.isFinite(distance))
    || route.legs?.length !== requestPoints.length - 1) {
    fail(`${specification.padName} OSRM response is incomplete`);
  }
  const snappedStart = payload.waypoints[0]?.location;
  const snappedEndpoint = payload.waypoints.at(-1)?.location;
  if (!coordinate(snappedStart)
    || !coordinate(snappedEndpoint)
    || haversineMeters(coordinates[0], snappedStart) > 2
    || haversineMeters(coordinates.at(-1), snappedEndpoint) > 2) {
    fail(`${specification.padName} OSRM geometry does not match its reported network snaps`);
  }
  return {
    coordinates,
    snappedStart,
    snappedEndpoint,
    waypointSnapMeters,
    orderedSteps: orderedStepsForRoute(route, specification.padName),
    routedRoadIdentities: roadIdentitiesForRoute(route),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

async function routeOsrmBatch(specifications, concurrency = 4) {
  const output = new Array(specifications.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < specifications.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await fetchOsrmRoute(specifications[index]);
      await delay(75);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, specifications.length) },
    () => worker(),
  ));
  return output;
}

function nameOrderDiagnostic(padName, routedRoadIdentities, exactState = null) {
  const issue = strictNameOrderDivergences.get(padName);
  if (issue) {
    return {
      state: "diverged_strict_reviewed_order",
      issue,
      classification: "strict_reviewed_sequence_audit_20260829",
      routedIdentitySha256: digest(routedRoadIdentities),
    };
  }
  return {
    state: exactState || "matched_reviewed_order",
    issue: null,
    classification: "strict_reviewed_sequence_audit_20260829",
    routedIdentitySha256: digest(routedRoadIdentities),
  };
}

function redDecisionFor(row) {
  if (row.name === "DUKE") {
    return {
      state: "not_drawn_downstream_pad_present",
      reason: "CRICKET is recorded farther along the Lamborn corridor, so DUKE is not the last pad on that road.",
      downstreamPadId: "3a72c3df-f0a1-4639-a468-019989c78f43",
      downstreamPadName: "CRICKET",
    };
  }
  if (row.name === "BANNOCK") {
    return {
      state: "drawn_from_existing_frozen_bannock_proof",
      reason: "BANNOCK's one proven red outbound is copied verbatim from the frozen BANNOCK road display into this shared all-55 artifact.",
    };
  }
  return {
    state: "not_evaluated_in_arrival_batch",
    reason: "Red requires separate exact non-state-road, no-downstream-pad, and next-highway-junction proof.",
  };
}

function gpsLegCoordinates(exactStart, osrmCoordinates, exactDestination) {
  const output = [[...exactStart]];
  for (const point of osrmCoordinates || []) {
    if (!sameCoordinate(output.at(-1), point)) output.push([...point]);
  }
  if (!sameCoordinate(output.at(-1), exactDestination)) output.push([...exactDestination]);
  if (output.length < 2) output.push([...exactDestination]);
  return output;
}

function normalizedRoadIdentity(value) {
  return String(value || "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function stepMatchesIdentityGroup(step, group) {
  const actual = new Set([step.name, step.ref]
    .map(normalizedRoadIdentity)
    .filter(Boolean));
  return group.some((accepted) => actual.has(normalizedRoadIdentity(accepted)));
}

function appendLine(output, coordinates) {
  for (const point of coordinates) {
    if (!sameCoordinate(output.at(-1), point)) output.push([...point]);
  }
}

function splitStaticReviewedNetwork(specification, result) {
  const groups = staticSolidIdentityGroups.get(specification.row.name);
  if (!groups?.length) fail(`${specification.row.name} has no exact static solid-identity policy`);
  const solidCoordinates = [];
  const tailCoordinates = [];
  const solidSteps = [];
  const tailSteps = [];
  let currentGroupIndex = -1;
  let stopped = false;

  for (const step of result.orderedSteps) {
    const hasIdentity = Boolean(step.ref || step.name);
    const nontrivial = step.distanceMeters > 0.05;
    if (stopped) {
      appendLine(tailCoordinates, step.coordinates);
      tailSteps.push(step);
      continue;
    }
    if (!hasIdentity) {
      if (!nontrivial) {
        if (solidSteps.length) appendLine(solidCoordinates, step.coordinates);
        continue;
      }
      stopped = true;
      appendLine(tailCoordinates, step.coordinates);
      tailSteps.push(step);
      continue;
    }
    const firstCandidate = Math.max(0, currentGroupIndex);
    let matchedGroupIndex = -1;
    for (let index = firstCandidate; index < groups.length; index += 1) {
      if (stepMatchesIdentityGroup(step, groups[index])) {
        matchedGroupIndex = index;
        break;
      }
    }
    if (matchedGroupIndex < 0) {
      stopped = true;
      appendLine(tailCoordinates, step.coordinates);
      tailSteps.push(step);
      continue;
    }
    currentGroupIndex = matchedGroupIndex;
    appendLine(solidCoordinates, step.coordinates);
    solidSteps.push(step);
  }

  if (!solidSteps.length) {
    // Preserve the required 55-record shape without drawing a false road. A
    // duplicated snapped point has zero visible length; the complete candidate
    // route is kept neutral/dashed for inspection.
    return {
      state: "fail_closed_no_reviewed_step",
      solidCoordinates: [[...result.snappedStart], [...result.snappedStart]],
      tailCoordinates: result.coordinates.map((point) => [...point]),
      solidDistanceMeters: 0,
      tailDistanceMeters: result.distanceMeters,
      solidStepCount: 0,
      tailStepCount: result.orderedSteps.length,
      lastSolidIdentity: null,
      firstDashedIdentity: (() => {
        const step = result.orderedSteps.find((candidate) => candidate.ref || candidate.name);
        return step ? { ref: step.ref, name: step.name } : null;
      })(),
      matchedGroupCount: 0,
    };
  }

  if (solidCoordinates.length < 2) solidCoordinates.push([...solidCoordinates[0]]);
  if (haversineMeters(solidCoordinates[0], result.snappedStart) > 2) {
    fail(`${specification.row.name} first reviewed OSRM step no longer begins at the frozen-control snap`);
  }
  if (tailCoordinates.length
    && haversineMeters(tailCoordinates.at(-1), result.snappedEndpoint) > 2) {
    fail(`${specification.row.name} dashed OSRM tail no longer reaches the terminal network snap`);
  }
  return {
    state: tailSteps.length
      ? "split_at_first_unreviewed_step"
      : "matched_through_network_endpoint",
    solidCoordinates,
    tailCoordinates,
    solidDistanceMeters: solidSteps.reduce((sum, step) => sum + step.distanceMeters, 0),
    tailDistanceMeters: tailSteps.reduce((sum, step) => sum + step.distanceMeters, 0),
    solidStepCount: solidSteps.length,
    tailStepCount: tailSteps.length,
    lastSolidIdentity: solidSteps.length
      ? { ref: solidSteps.at(-1).ref, name: solidSteps.at(-1).name }
      : null,
    firstDashedIdentity: tailSteps.length
      ? { ref: tailSteps[0].ref, name: tailSteps[0].name }
      : null,
    matchedGroupCount: currentGroupIndex + 1,
  };
}

function exactCoreFromAtomic(row, bundle) {
  const definition = atomicPrimaryDefinitions.get(row.record_id);
  const destination = destinationForLedgerRow(row);
  const exactDestination = [destination.longitude, destination.latitude];
  if (definition.kind === "exact_public_graph") {
    const route = bundle.status?.route;
    const expectedRoads = [
      "FOXS BOTTOM RD",
      "SPRINGDALE HILL RD",
      "LAMBORN RD",
      "SPRINGDALE HILL RD",
      "BLAIRMONT RD",
    ];
    if (route?.state !== "ready"
      || route?.source !== "exact_graph"
      || bundle.status?.graph?.state !== "active_current"
      || bundle.status?.destination?.latitude !== destination.latitude
      || bundle.status?.destination?.longitude !== destination.longitude
      || JSON.stringify(route?.steps?.map((step) => step.displayName)) !== JSON.stringify(expectedRoads)
      || route?.geometry?.type !== "FeatureCollection") {
      fail("COLOGIE exact public route contract changed");
    }
    const coordinates = flattenExactFeatures(route.geometry.features, row.name);
    if (!sameCoordinate(coordinates.at(-1), exactDestination)) {
      fail("COLOGIE exact public graph no longer reaches its destination");
    }
    return {
      definition,
      destination,
      coordinates,
      coreEnd: exactDestination,
      controls: [],
      steps: expectedRoads,
      sourceStatus: {
        statusRevision: bundle.status.statusRevision,
        lastVerifiedAt: bundle.status.graph.lastVerifiedAt,
        releaseDigest: null,
      },
    };
  }
  if (definition.kind === "core_destination_release") {
    const release = bundle.coreDestinationRelease;
    const releasedDestination = release?.destination;
    const handoff = release?.handoff;
    if (release?.padId !== row.record_id
      || release?.recordRevision !== row.record_revision
      || releasedDestination?.latitude !== destination.latitude
      || releasedDestination?.longitude !== destination.longitude
      || release?.routeGeometry?.type !== "FeatureCollection"
      || handoff?.pad_id !== row.record_id
      || handoff?.destination?.latitude !== destination.latitude
      || handoff?.destination?.longitude !== destination.longitude) {
      fail("LASSO core-destination release changed");
    }
    const coordinates = flattenExactFeatures(release.routeGeometry.features, row.name);
    const coreEnd = [handoff.core_end.longitude, handoff.core_end.latitude];
    if (haversineMeters(coordinates.at(-1), coreEnd) > 0.05) {
      fail("LASSO exact core no longer ends at its frozen handoff");
    }
    return {
      definition,
      destination,
      coordinates,
      coreEnd: [...coordinates.at(-1)],
      controls: handoff.waypoints.map(({ latitude, longitude }) => ({ latitude, longitude })),
      steps: release.routeSteps.map((step) => step.displayName),
      sourceStatus: {
        statusRevision: bundle.status.statusRevision,
        lastVerifiedAt: release.graphLastVerifiedAt,
        releaseDigest: release.releaseDigest,
      },
    };
  }
  const primary = bundle.namedApproaches?.find((approach) => (
    approach.variantIndex === 1 && approach.routeGroup === "primary"
  ));
  if (!primary
    || primary.destination?.latitude !== destination.latitude
    || primary.destination?.longitude !== destination.longitude
    || primary.geometry?.type !== "FeatureCollection"
    || !Array.isArray(primary.handoff?.waypoints)
    || !primary.handoff.waypoints.length) {
    fail(`${row.name} primary named-approach release changed`);
  }
  const coordinates = flattenExactFeatures(primary.geometry.features, row.name);
  const coreEnd = [primary.coreEnd.longitude, primary.coreEnd.latitude];
  if (!sameCoordinate(coordinates.at(-1), coreEnd)) {
    fail(`${row.name} exact primary core no longer ends at its handoff`);
  }
  return {
    definition,
    destination,
    coordinates,
    coreEnd,
    controls: primary.handoff.waypoints.map(({ latitude, longitude }) => ({ latitude, longitude })),
    steps: primary.steps.map((step) => step.displayName),
    sourceStatus: {
      statusRevision: primary.statusRevision,
      lastVerifiedAt: primary.lastVerifiedAt,
      releaseDigest: primary.releaseDigest,
    },
  };
}

function staticOsrmArtifactRoute(specification, result) {
  const destination = destinationForLedgerRow(specification.row);
  const destinationCoordinate = [destination.longitude, destination.latitude];
  const split = splitStaticReviewedNetwork(specification, result);
  const networkEndpoint = [...split.solidCoordinates.at(-1)];
  const terminalNetworkEndpoint = [...result.coordinates.at(-1)];
  const tetherCoordinates = gpsLegCoordinates(
    networkEndpoint,
    split.tailCoordinates,
    destinationCoordinate,
  );
  return {
    ...routeBinding(specification.row, destination),
    reviewedRoadSequence: specification.reviewedRoadSequence,
    displayVariant: "owner_reviewed_primary",
    arrival: {
      type: "LineString",
      colorRole: "teal",
      lineRole: split.state === "fail_closed_no_reviewed_step"
        ? "fail_closed_reviewed_network_anchor"
        : "reviewed_named_road_arrival",
      pattern: "solid",
      visibility: "main-map-all-and-ascent",
      approvedRoad: false,
      label: split.state === "fail_closed_no_reviewed_step"
        ? `${specification.row.name} no proven solid network geometry`
        : `${specification.row.name} reviewed named-road line`,
      pointCount: split.solidCoordinates.length,
      coordinates: split.solidCoordinates,
    },
    gpsLeg: {
      type: "LineString",
      colorRole: "gps",
      lineRole: "unapproved_gps_tether",
      pattern: "solid",
      lineStyle: "solid",
      authority: "unapproved_gps_tether",
      visibility: "main-map-all-and-ascent",
      approvedRoad: false,
      navigationGeometry: false,
      label: `${specification.row.name} unapproved GPS tether`,
      pointCount: tetherCoordinates.length,
      distanceMeters: split.tailDistanceMeters
        + haversineMeters(terminalNetworkEndpoint, destinationCoordinate),
      coordinates: tetherCoordinates,
    },
    redContinuation: null,
    redDecision: redDecisionFor(specification.row),
    source: {
      kind: "reviewed_contract_osrm_reconstruction",
      reference: "v18/src/data/reviewedNavigationCandidates.ts",
      osrmProfile: "driving",
      requestedControls: specification.controls,
      requestedControlSha256: digest(specification.controls),
      navigationUrlSha256: digestText(specification.navigationUrl),
      networkGeometrySha256: digest(split.solidCoordinates),
      candidateNetworkGeometrySha256: digest(result.coordinates),
      networkDistanceMeters: split.solidDistanceMeters,
      candidateNetworkDistanceMeters: result.distanceMeters,
      networkDurationSeconds: result.durationSeconds,
      reviewedFinalLegNotice: specification.finalLegNotice,
    },
    diagnostics: {
      engineState: "routable",
      requestedControlCount: specification.controls.length,
      waypointSnapMeters: result.waypointSnapMeters,
      maximumControlSnapMeters: Math.max(...result.waypointSnapMeters.slice(0, -1)),
      terminalSnapMeters: result.waypointSnapMeters.at(-1),
      networkEndpoint,
      terminalNetworkEndpoint,
      exactDestination: destinationCoordinate,
      gpsGapMeters: split.tailDistanceMeters
        + haversineMeters(terminalNetworkEndpoint, destinationCoordinate),
      routedRoadIdentities: result.routedRoadIdentities,
      nameOrder: nameOrderDiagnostic(specification.row.name, result.routedRoadIdentities),
      solidSplit: {
        state: split.state,
        exactIdentityPolicy: "ordered_exact_allowlist_stop_at_first_unreviewed_step",
        acceptedIdentityGroups: staticSolidIdentityGroups.get(specification.row.name),
        solidStepCount: split.solidStepCount,
        dashedStepCount: split.tailStepCount,
        matchedGroupCount: split.matchedGroupCount,
        lastSolidIdentity: split.lastSolidIdentity,
        firstDashedIdentity: split.firstDashedIdentity,
        solidGeometrySha256: digest(split.solidCoordinates),
        dashedCandidateGeometrySha256: split.tailCoordinates.length
          ? digest(split.tailCoordinates)
          : null,
      },
    },
  };
}

function atomicExactCoreArtifactRoute(specification, result) {
  const { row, core } = specification;
  const destinationCoordinate = [core.destination.longitude, core.destination.latitude];
  const exactPublicGraph = row.record_id === cologieId;
  const routedRoadIdentities = core.steps.map((name) => ({ ref: null, name }));
  let gpsLeg = null;
  let tailDiagnostics = null;
  if (!exactPublicGraph) {
    const legCoordinates = gpsLegCoordinates(core.coreEnd, result.coordinates, destinationCoordinate);
    gpsLeg = {
      type: "LineString",
      colorRole: "gps",
      lineRole: "unapproved_gps_tether",
      pattern: "solid",
      lineStyle: "solid",
      authority: "unapproved_gps_tether",
      visibility: "main-map-all-and-ascent",
      approvedRoad: false,
      navigationGeometry: false,
      label: `${row.name} unapproved GPS tether`,
      pointCount: legCoordinates.length,
      distanceMeters: result.distanceMeters
        + haversineMeters(result.coordinates.at(-1), destinationCoordinate),
      coordinates: legCoordinates,
    };
    tailDiagnostics = {
      engineState: "routable_unapproved_tail",
      waypointSnapMeters: result.waypointSnapMeters,
      startSnapMeters: result.waypointSnapMeters[0],
      terminalSnapMeters: result.waypointSnapMeters.at(-1),
      routedRoadIdentities: result.routedRoadIdentities,
      networkGeometrySha256: digest(result.coordinates),
    };
  }
  return {
    ...routeBinding(row, core.destination),
    reviewedRoadSequence: core.definition.reviewedRoadSequence,
    displayVariant: core.definition.variant,
    arrival: {
      type: "LineString",
      colorRole: "teal",
      lineRole: exactPublicGraph
        ? "exact_public_graph_arrival"
        : "exact_reviewed_core_arrival",
      pattern: "solid",
      visibility: "main-map-all-and-ascent",
      approvedRoad: exactPublicGraph,
      label: `${row.name} exact reviewed road core`,
      pointCount: core.coordinates.length,
      coordinates: core.coordinates,
    },
    gpsLeg,
    redContinuation: null,
    redDecision: redDecisionFor(row),
    source: {
      kind: exactPublicGraph ? "public_exact_graph" : "atomic_exact_reviewed_core",
      reference: core.definition.reference,
      statusRevision: core.sourceStatus.statusRevision,
      lastVerifiedAt: core.sourceStatus.lastVerifiedAt,
      releaseDigest: core.sourceStatus.releaseDigest,
      requestedControls: core.controls,
      requestedControlSha256: digest(core.controls),
      networkGeometrySha256: digest(core.coordinates),
    },
    diagnostics: {
      engineState: exactPublicGraph ? "exact_public_graph" : "exact_atomic_core",
      requestedControlCount: core.controls.length,
      terminalSnapMeters: exactPublicGraph ? 0 : result.waypointSnapMeters.at(-1),
      networkEndpoint: [...core.coordinates.at(-1)],
      exactDestination: destinationCoordinate,
      gpsGapMeters: gpsLeg?.distanceMeters || 0,
      routedRoadIdentities,
      nameOrder: nameOrderDiagnostic(
        row.name,
        [...routedRoadIdentities, ...(result?.routedRoadIdentities || [])],
        exactPublicGraph ? "exact_public_graph" : "exact_atomic_core",
      ),
      gpsTail: tailDiagnostics,
    },
  };
}

function bannockArtifactRoute(row, contract, display) {
  const destination = validateContractBinding(contract, row);
  const destinationCoordinate = [destination.longitude, destination.latitude];
  if (display.padId !== row.record_id
    || display.legacyId !== row.legacy_id
    || display.recordRevision !== row.record_revision
    || display.padName !== row.name
    || !sameCoordinate(display.destination, destinationCoordinate)
    || !Array.isArray(display.inbound?.coordinates)
    || !display.inbound.coordinates.every(coordinate)
    || !sameCoordinate(display.inbound.coordinates.at(-1), display.projectedSeam)
    || display.outbound?.colorRole !== "red"
    || display.outbound?.visibility !== "main-map-all-and-ascent"
    || display.outbound?.pointCount !== display.outbound?.coordinates?.length
    || display.outbound.pointCount !== 239
    || !display.outbound.coordinates.every(coordinate)
    || !sameCoordinate(display.outbound.coordinates[0], display.projectedSeam)
    || !sameCoordinate(display.outbound.coordinates.at(-1), display.outbound.endJunction)
    || display.continuity?.inboundEndEqualsOutboundStart !== true
    || display.continuity?.namedRoadTopologyHasGaps !== false
    || display.continuity?.gpsConnectorIncluded !== false) {
    fail("BANNOCK frozen inbound display no longer matches its exact reviewed contract");
  }
  const tetherCoordinates = gpsLegCoordinates(
    display.projectedSeam,
    [],
    destinationCoordinate,
  );
  const exactRedRoadIdentity = "Lafferty-Bannock Road / CR-10 → Black Oak Road";
  const redGeometrySha256 = digest(display.outbound.coordinates);
  return {
    ...routeBinding(row, destination),
    reviewedRoadSequence: contract.reviewedRoadSequence,
    displayVariant: "existing_frozen_bannock_inbound",
    arrival: {
      type: "LineString",
      colorRole: "teal",
      lineRole: "existing_frozen_reviewed_arrival",
      pattern: "solid",
      visibility: "main-map-all-and-ascent",
      approvedRoad: false,
      label: display.inbound.label,
      pointCount: display.inbound.coordinates.length,
      coordinates: display.inbound.coordinates,
    },
    gpsLeg: {
      type: "LineString",
      colorRole: "gps",
      lineRole: "unapproved_gps_tether",
      pattern: "solid",
      lineStyle: "solid",
      authority: "unapproved_gps_tether",
      visibility: "main-map-all-and-ascent",
      approvedRoad: false,
      navigationGeometry: false,
      label: "BANNOCK unapproved GPS tether",
      pointCount: tetherCoordinates.length,
      distanceMeters: display.destinationOffsetMeters,
      coordinates: tetherCoordinates,
    },
    redContinuation: {
      type: "LineString",
      colorRole: "red",
      lineRole: "proven_red_outbound_reference",
      visibility: "main-map-all-and-ascent",
      approvedRoad: false,
      label: display.outbound.label,
      roadClass: "county",
      exactRoadIdentity: exactRedRoadIdentity,
      geometrySha256: redGeometrySha256,
      pointCount: display.outbound.pointCount,
      lengthMeters: display.outbound.lengthMeters,
      endJunction: display.outbound.endJunction,
      endNodeId: display.outbound.endNodeId,
      coordinates: display.outbound.coordinates,
      noDownstreamPadsProof: {
        directorySnapshotId,
        sourceRevision: directorySourceRevision,
        lastPadId: row.record_id,
        lastPadSavedGps: destinationCoordinate,
        exactRoadIdentity: exactRedRoadIdentity,
        redGeometrySha256,
      },
      nextHighway: {
        roadClass: "state",
        designation: "OH-149",
        junction: display.outbound.endJunction,
      },
      frozenProof: {
        sourceArtifact: "v18/src/features/map/bannockRoadDisplay.json",
        transitions: display.transitions,
        projection: display.projection,
        continuity: display.continuity,
        source: display.source,
      },
    },
    redDecision: redDecisionFor(row),
    source: {
      kind: "existing_frozen_bannock_inbound",
      reference: "v18/src/features/map/bannockRoadDisplay.json",
      requestedControls: contract.waypoints,
      requestedControlSha256: digest(contract.waypoints),
      navigationUrlSha256: digestText(contract.routeUrl),
      networkGeometrySha256: digest(display.inbound.coordinates),
    },
    diagnostics: {
      engineState: "existing_frozen_geometry",
      requestedControlCount: contract.waypoints.length,
      waypointSnapMeters: [],
      maximumControlSnapMeters: null,
      terminalSnapMeters: display.destinationOffsetMeters,
      networkEndpoint: [...display.projectedSeam],
      exactDestination: destinationCoordinate,
      gpsGapMeters: display.destinationOffsetMeters,
      routedRoadIdentities: [{ ref: "CR-10", name: "Lafferty-Bannock Road" }],
      nameOrder: nameOrderDiagnostic(row.name, [{ ref: "CR-10", name: "Lafferty-Bannock Road" }], "existing_frozen_geometry"),
    },
  };
}

function terminalSnapBins(routes) {
  const bins = {
    atMost1Meter: 0,
    over1Through5Meters: 0,
    over5Through20Meters: 0,
    over20Through50Meters: 0,
    over50Through100Meters: 0,
    over100Through250Meters: 0,
    over250Meters: 0,
  };
  for (const route of routes) {
    const distance = route.diagnostics.terminalSnapMeters;
    if (distance <= 1) bins.atMost1Meter += 1;
    else if (distance <= 5) bins.over1Through5Meters += 1;
    else if (distance <= 20) bins.over5Through20Meters += 1;
    else if (distance <= 50) bins.over20Through50Meters += 1;
    else if (distance <= 100) bins.over50Through100Meters += 1;
    else if (distance <= 250) bins.over100Through250Meters += 1;
    else bins.over250Meters += 1;
  }
  return bins;
}

const ledger = parseCsv(await readFile(ledgerPath, "utf8"));
const doneRows = ledger.filter((row) => row.driver_rule_status === "DONE");
const reviewedRows = doneRows.filter((row) => row.current_state === reviewedContractState);
const atomicRows = doneRows.filter((row) => row.current_state !== reviewedContractState);
if (ledger.length !== 247
  || doneRows.length !== 55
  || reviewedRows.length !== 46
  || atomicRows.length !== 9
  || new Set(doneRows.map((row) => row.record_id)).size !== 55
  || new Set(atomicRows.map((row) => row.record_id)).size !== atomicPrimaryDefinitions.size
  || atomicRows.some((row) => !atomicPrimaryDefinitions.has(row.record_id))) {
  fail("the ledger is no longer the exact 247 / 55 / 46 / 9 reviewed set");
}

const [contracts, atomicBundles, bannockDisplay] = await Promise.all([
  loadReviewedContracts(),
  fetchAtomicBundles(atomicRows),
  readFile(bannockDisplayPath, "utf8").then(JSON.parse),
]);
const contractByPadId = new Map(contracts.map((contract) => [contract.padId, contract]));
const rowByPadId = new Map(doneRows.map((row) => [row.record_id, row]));

const staticSpecifications = [];
for (const row of reviewedRows) {
  const contract = contractByPadId.get(row.record_id);
  if (!contract) fail(`${row.name} has no reviewed contract`);
  const destination = validateContractBinding(contract, row);
  if (row.record_id === bannockId) continue;
  staticSpecifications.push({
    purpose: "reviewed arrival",
    row,
    padName: row.name,
    controls: contract.waypoints.map((point) => ({ ...point })),
    points: [...contract.waypoints.map((point) => ({ ...point })), destination],
    reviewedRoadSequence: contract.reviewedRoadSequence,
    finalLegNotice: contract.finalLegNotice || null,
    navigationUrl: contract.routeUrl,
  });
}
if (staticSpecifications.length !== 45) {
  fail("the reviewed-contract OSRM batch does not contain exactly 45 routes");
}
if (staticSolidIdentityGroups.size !== 45
  || staticSpecifications.some((specification) => (
    !staticSolidIdentityGroups.has(specification.row.name)
    || typeof specification.finalLegNotice !== "string"
    || !specification.finalLegNotice.trim()
  ))) {
  fail("the exact static step-split policies no longer bind all 45 reviewed contracts");
}

const atomicCores = new Map(atomicRows.map((row) => [
  row.record_id,
  exactCoreFromAtomic(row, atomicBundles.get(row.record_id)),
]));
const atomicTailSpecifications = atomicRows
  .filter((row) => row.record_id !== cologieId)
  .map((row) => {
    const core = atomicCores.get(row.record_id);
    return {
      purpose: "unapproved GPS tail",
      row,
      padName: row.name,
      core,
      points: [
        { longitude: core.coreEnd[0], latitude: core.coreEnd[1] },
        core.destination,
      ],
    };
  });
if (atomicTailSpecifications.length !== 8) {
  fail("the atomic unapproved-tail OSRM batch does not contain exactly 8 routes");
}

const osrmSpecifications = [...staticSpecifications, ...atomicTailSpecifications];
const osrmResults = await routeOsrmBatch(osrmSpecifications);
const resultByPadAndPurpose = new Map(osrmSpecifications.map((specification, index) => [
  `${specification.row.record_id}:${specification.purpose}`,
  osrmResults[index],
]));

const routeByPadId = new Map();
for (const specification of staticSpecifications) {
  routeByPadId.set(
    specification.row.record_id,
    staticOsrmArtifactRoute(
      specification,
      resultByPadAndPurpose.get(`${specification.row.record_id}:${specification.purpose}`),
    ),
  );
}
routeByPadId.set(
  bannockId,
  bannockArtifactRoute(
    rowByPadId.get(bannockId),
    contractByPadId.get(bannockId),
    bannockDisplay,
  ),
);
for (const row of atomicRows) {
  routeByPadId.set(
    row.record_id,
    atomicExactCoreArtifactRoute(
      { row, core: atomicCores.get(row.record_id) },
      row.record_id === cologieId
        ? null
        : resultByPadAndPurpose.get(`${row.record_id}:unapproved GPS tail`),
    ),
  );
}

const routes = doneRows.map((row) => routeByPadId.get(row.record_id));
if (routes.length !== 55 || routes.some((route) => !route)) {
  fail("the generated artifact does not cover all 55 reviewed pads exactly once");
}
const osrmBackedRoutes = routes.filter((route) => (
  route.source.kind === "reviewed_contract_osrm_reconstruction"
  || route.diagnostics.gpsTail?.engineState === "routable_unapproved_tail"
));
const terminalSnaps = osrmBackedRoutes
  .map((route) => route.diagnostics.terminalSnapMeters)
  .sort((left, right) => left - right);
const artifact = {
  schemaVersion: 3,
  batchId: "ascent-gps-road-lines-20260829-all55",
  generatedAt: new Date().toISOString(),
  displayScope: "persistent-main-map-all-and-ascent",
  displayAuthority: "Reviewed field display only. Exact reviewed network geometry is solid teal. Every unreviewed remainder and straight GPS tether remains visible as solid neutral geometry and is not an approved road, lease, or navigation geometry.",
  rules: {
    exactFrozenDestinationBinding: true,
    frozenGoogleUrlsAndControlsRemainUnchanged: true,
    exactDatabaseCorePreferredOverReconstruction: true,
    existingBannockInboundPreferredOverReconstruction: true,
    arrivalContainsNetworkGeometryOnly: true,
    staticSolidGeometryUsesOrderedExactIdentityAllowlist: true,
    staticSolidGeometryStopsAtFirstUnreviewedStep: true,
    divergentStaticRouteFailsClosed: true,
    gpsLegIsSeparateSolidNeutralUnapprovedTether: true,
    noSyntheticRoadConnector: true,
    redContinuationRequiresExactNoDownstreamPadProof: true,
    interstateUsAndStateRoutesNeverRed: true,
  },
  summary: {
    ledgerPadCount: ledger.length,
    reviewedRouteCount: routes.length,
    reviewedContractCount: reviewedRows.length,
    atomicPrimaryCoreCount: atomicRows.length,
    exactPublicGraphCount: 1,
    exactAtomicReviewedCoreCount: 8,
    existingFrozenBannockCount: 1,
    osrmReviewedArrivalRecordCount: staticSpecifications.length,
    osrmSolidArrivalCount: routes.filter((route) => (
      route.source.kind === "reviewed_contract_osrm_reconstruction"
      && route.diagnostics.solidSplit?.state !== "fail_closed_no_reviewed_step"
    )).length,
    staticMatchedThroughNetworkEndpointCount: routes.filter((route) => (
      route.diagnostics.solidSplit?.state === "matched_through_network_endpoint"
    )).length,
    staticPostNamedTailSplitCount: routes.filter((route) => (
      route.diagnostics.solidSplit?.state === "split_at_first_unreviewed_step"
    )).length,
    staticFailClosedAnchorCount: routes.filter((route) => (
      route.diagnostics.solidSplit?.state === "fail_closed_no_reviewed_step"
    )).length,
    staticDashedCandidateRouteCount: routes.filter((route) => (
      route.source.kind === "reviewed_contract_osrm_reconstruction"
      && route.diagnostics.solidSplit?.state !== "matched_through_network_endpoint"
    )).length,
    osrmUnapprovedGpsTailCount: atomicTailSpecifications.length,
    osrmRequestCount: osrmSpecifications.length,
    osrmRoutableCount: osrmSpecifications.length,
    osrmFailureCount: 0,
    gpsLegCount: routes.filter((route) => route.gpsLeg).length,
    redContinuationCount: routes.filter((route) => route.redContinuation).length,
    strictNameOrderMatchedCount: routes.filter((route) => route.diagnostics.nameOrder.state !== "diverged_strict_reviewed_order").length,
    strictNameOrderDivergedCount: routes.filter((route) => route.diagnostics.nameOrder.state === "diverged_strict_reviewed_order").length,
    terminalSnapMeters: {
      minimum: terminalSnaps[0],
      median: terminalSnaps[Math.floor(terminalSnaps.length / 2)],
      maximum: terminalSnaps.at(-1),
      bins: terminalSnapBins(osrmBackedRoutes),
    },
    productionWrites: 0,
  },
  routes,
};

const staticSplitAccountingIsValid = artifact.summary.osrmSolidArrivalCount
    + artifact.summary.staticFailClosedAnchorCount === artifact.summary.osrmReviewedArrivalRecordCount
  && artifact.summary.staticMatchedThroughNetworkEndpointCount
    + artifact.summary.staticPostNamedTailSplitCount
    + artifact.summary.staticFailClosedAnchorCount === artifact.summary.osrmReviewedArrivalRecordCount
  && artifact.summary.staticDashedCandidateRouteCount
    === artifact.summary.staticPostNamedTailSplitCount + artifact.summary.staticFailClosedAnchorCount;
const generatedRouteByName = new Map(routes.map((route) => [route.padName, route]));
if (artifact.summary.reviewedRouteCount !== 55
  || artifact.summary.reviewedContractCount !== 46
  || artifact.summary.atomicPrimaryCoreCount !== 9
  || artifact.summary.osrmReviewedArrivalRecordCount !== 45
  || !staticSplitAccountingIsValid
  || generatedRouteByName.get("BEETLE")?.diagnostics.solidSplit?.state !== "fail_closed_no_reviewed_step"
  || ["HASTINGS", "HOOP", "LODGE"].some((name) => (
    generatedRouteByName.get(name)?.diagnostics.solidSplit?.state !== "split_at_first_unreviewed_step"
  ))
  || artifact.summary.osrmUnapprovedGpsTailCount !== 8
  || artifact.summary.osrmRequestCount !== 53
  || artifact.summary.gpsLegCount !== 54
  || artifact.summary.redContinuationCount !== 1
  || artifact.summary.strictNameOrderMatchedCount !== 48
  || artifact.summary.strictNameOrderDivergedCount !== 7) {
  fail("the generated all-55 accounting changed");
}

await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
const output = await stat(outputPath);
console.log(JSON.stringify({
  outputPath,
  artifactBytes: output.size,
  artifactSha256: digest(artifact),
  reviewedRoutes: artifact.summary.reviewedRouteCount,
  exactAtomicCores: artifact.summary.atomicPrimaryCoreCount,
  existingFrozenBannock: artifact.summary.existingFrozenBannockCount,
  staticSolidArrivals: artifact.summary.osrmSolidArrivalCount,
  staticPostNamedTailSplits: artifact.summary.staticPostNamedTailSplitCount,
  staticFailClosedAnchors: artifact.summary.staticFailClosedAnchorCount,
  osrmRequests: artifact.summary.osrmRequestCount,
  osrmRoutable: artifact.summary.osrmRoutableCount,
  gpsLegs: artifact.summary.gpsLegCount,
  redContinuations: artifact.summary.redContinuationCount,
  nameOrderMatched: artifact.summary.strictNameOrderMatchedCount,
  nameOrderDiverged: artifact.summary.strictNameOrderDivergedCount,
  terminalSnapMeters: artifact.summary.terminalSnapMeters,
  productionWrites: artifact.summary.productionWrites,
}, null, 2));
