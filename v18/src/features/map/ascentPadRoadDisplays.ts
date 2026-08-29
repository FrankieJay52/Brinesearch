import type { PadSummary } from "@/data/types";
import { mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";
import artifactJson from "./ascentPadRoadDisplays.batch1.json";

export type AscentPadRoadCoordinate = [number, number];
export type AscentPadRoadColorRole = "teal" | "red";
export type RedContinuationRoadClass = "county" | "township" | "local";

export interface AscentPadRoadLineString<ColorRole extends AscentPadRoadColorRole = AscentPadRoadColorRole> {
  type: "LineString";
  colorRole: ColorRole;
  visibility: "main-map-all-and-ascent";
  label: string;
  coordinates: readonly AscentPadRoadCoordinate[];
}

export interface AscentPadRedContinuation extends AscentPadRoadLineString<"red"> {
  roadClass: RedContinuationRoadClass;
  exactRoadIdentity: string;
  geometrySha256: string;
  noDownstreamPadsProof: {
    directorySnapshotId: string;
    sourceRevision: string;
    lastPadId: string;
    lastPadSavedGps: AscentPadRoadCoordinate;
    exactRoadIdentity: string;
    redGeometrySha256: string;
  };
  nextHighway: {
    roadClass: "interstate" | "us" | "state";
    designation: string;
    junction: AscentPadRoadCoordinate;
  };
}

export interface AscentPadRoadDisplay {
  padId: string;
  padName: string;
  company: "Ascent";
  displayScope: "persistent-main-map-all-and-ascent";
  displayAuthority: string;
  savedPin: AscentPadRoadCoordinate;
  reviewedRoadSequence: string;
  arrival: AscentPadRoadLineString<"teal">;
  redContinuation: AscentPadRedContinuation | null;
  redDecision: {
    state: string;
    reason: string;
  };
}

interface ArtifactRoute {
  padId: string;
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  padName: string;
  company: string;
  state: string;
  county: string;
  destination: {
    role: string;
    longitude: number;
    latitude: number;
  };
  reviewedRoadSequence: string;
  arrival: {
    type: string;
    colorRole: string;
    visibility: string;
    label: string;
    pointCount: number;
    coordinates: unknown;
  };
  redContinuation: unknown;
  redDecision: {
    state: string;
    reason: string;
  };
  source: {
    geometrySha256?: string;
  };
}

interface BatchArtifact {
  schemaVersion: number;
  batchId: string;
  displayScope: string;
  displayAuthority: string;
  rules: {
    arrivalMustEndAtExactSavedGps: boolean;
    noSyntheticGpsConnector: boolean;
    redContinuationRequiresExactNoDownstreamPadProof: boolean;
    interstateUsAndStateRoutesNeverRed: boolean;
  };
  routes: ArtifactRoute[];
}

const artifact = artifactJson as unknown as BatchArtifact;

const sha256Constants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, count: number) {
  return (value >>> count) | (value << (32 - count));
}

/** Browser-safe SHA-256 for checking the frozen coordinate JSON itself. */
function sha256Hex(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const state = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + sha256Constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

const contracts = [
  {
    padId: "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
    canonicalId: "e2b32e85-9e93-4388-8215-9d8167cbbeb8",
    legacyId: "ascent--cologie",
    recordRevision: "1787615581785257",
    padName: "COLOGIE",
    company: "Ascent",
    state: "Ohio",
    county: "Harrison",
    destination: [-80.913577, 40.25403] as AscentPadRoadCoordinate,
    first: [-80.9648236, 40.2376831] as AscentPadRoadCoordinate,
    pointCount: 277,
    arrivalLabel: "COLOGIE named roads → exact saved GPS",
    reviewedRoadSequence: "US-250 → Foxes Bottom Rd / CR-15 → Springdale Hill Rd / TR-79 → Lamborn Rd / TR-72 → Springdale Hill Rd / TR-79 → Unionvale-Kenwood / CR-13 → saved GPS",
    geometrySha256: "d892361582fabc06cd5ba3a3426d56bf063d50be72dcc8ea7fc0e6a30afe9392",
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
    destination: [-80.891316, 40.214409] as AscentPadRoadCoordinate,
    first: [-80.964819, 40.237684] as AscentPadRoadCoordinate,
    pointCount: 253,
    arrivalLabel: "DUKE named roads → exact saved GPS",
    reviewedRoadSequence: "US-250 → Foxes Bottom Rd / CR-15 → Springdale Hill Rd → Lamborn Rd → exact saved GPS",
    geometrySha256: "2708db887528c801b6f9df839337999baa77698365e6777933523702c6935d5c",
  },
] as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function coordinate(value: unknown): value is AscentPadRoadCoordinate {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && value[0] >= -83
    && value[0] <= -79
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
    && value[1] >= 38
    && value[1] <= 42;
}

function sameCoordinate(left: readonly number[], right: readonly number[]) {
  return left[0] === right[0] && left[1] === right[1];
}

function coordinateLine(value: unknown, pointCount: number): value is AscentPadRoadCoordinate[] {
  return Array.isArray(value)
    && value.length === pointCount
    && value.length >= 2
    && value.every(coordinate);
}

export function ascentRedContinuationIsEligible(
  value: unknown,
  expectedPadId: string,
  expectedSavedPin: AscentPadRoadCoordinate,
): value is AscentPadRedContinuation {
  const candidate = object(value);
  const proof = object(candidate.noDownstreamPadsProof);
  const nextHighway = object(candidate.nextHighway);
  const roadClass = candidate.roadClass;
  return candidate.type === "LineString"
    && candidate.colorRole === "red"
    && candidate.visibility === "main-map-all-and-ascent"
    && typeof candidate.label === "string"
    && candidate.label.length > 0
    && (roadClass === "county" || roadClass === "township" || roadClass === "local")
    && typeof candidate.exactRoadIdentity === "string"
    && candidate.exactRoadIdentity.trim().length > 0
    && typeof candidate.geometrySha256 === "string"
    && /^[0-9a-f]{64}$/.test(candidate.geometrySha256)
    && typeof proof.directorySnapshotId === "string"
    && proof.directorySnapshotId.trim().length > 0
    && typeof proof.sourceRevision === "string"
    && proof.sourceRevision.trim().length > 0
    && proof.lastPadId === expectedPadId
    && coordinate(proof.lastPadSavedGps)
    && sameCoordinate(proof.lastPadSavedGps, expectedSavedPin)
    && proof.exactRoadIdentity === candidate.exactRoadIdentity
    && proof.redGeometrySha256 === candidate.geometrySha256
    && (nextHighway.roadClass === "interstate" || nextHighway.roadClass === "us" || nextHighway.roadClass === "state")
    && typeof nextHighway.designation === "string"
    && nextHighway.designation.trim().length > 0
    && coordinate(nextHighway.junction)
    && Array.isArray(candidate.coordinates)
    && candidate.coordinates.length >= 2
    && candidate.coordinates.every(coordinate)
    && sameCoordinate(candidate.coordinates[0], expectedSavedPin)
    && sha256Hex(candidate.coordinates) === candidate.geometrySha256
    && sameCoordinate(candidate.coordinates.at(-1) as AscentPadRoadCoordinate, nextHighway.junction);
}

function batchHeaderIsValid() {
  return artifact.schemaVersion === 1
    && artifact.batchId === "ascent-gps-road-lines-20260829-1"
    && artifact.displayScope === "persistent-main-map-all-and-ascent"
    && artifact.rules?.arrivalMustEndAtExactSavedGps === true
    && artifact.rules.noSyntheticGpsConnector === true
    && artifact.rules.redContinuationRequiresExactNoDownstreamPadProof === true
    && artifact.rules.interstateUsAndStateRoutesNeverRed === true
    && Array.isArray(artifact.routes)
    && artifact.routes.length === contracts.length;
}

function buildDisplay(route: ArtifactRoute, contract: typeof contracts[number]): AscentPadRoadDisplay | null {
  const savedPin = [route.destination.longitude, route.destination.latitude] as AscentPadRoadCoordinate;
  if (route.padId !== contract.padId
    || route.canonicalId !== contract.canonicalId
    || route.legacyId !== contract.legacyId
    || route.recordRevision !== contract.recordRevision
    || route.padName !== contract.padName
    || route.company !== contract.company
    || route.state !== contract.state
    || route.county !== contract.county
    || !sameCoordinate(savedPin, contract.destination)
    || route.arrival.type !== "LineString"
    || route.arrival.colorRole !== "teal"
    || route.arrival.visibility !== "main-map-all-and-ascent"
    || typeof route.arrival.label !== "string"
    || route.arrival.label.length === 0
    || route.arrival.label !== contract.arrivalLabel
    || route.arrival.pointCount !== contract.pointCount
    || !coordinateLine(route.arrival.coordinates, contract.pointCount)
    || !sameCoordinate(route.arrival.coordinates[0], contract.first)
    || !sameCoordinate(route.arrival.coordinates.at(-1) as AscentPadRoadCoordinate, savedPin)
    || route.source.geometrySha256 !== contract.geometrySha256
    || sha256Hex(route.arrival.coordinates) !== contract.geometrySha256
    || route.reviewedRoadSequence !== contract.reviewedRoadSequence
    || typeof route.redDecision?.state !== "string"
    || typeof route.redDecision?.reason !== "string") return null;

  const redContinuation = route.redContinuation === null
    ? null
    : ascentRedContinuationIsEligible(route.redContinuation, route.padId, savedPin) ? route.redContinuation : null;
  if (route.redContinuation !== null && !redContinuation) return null;

  return {
    padId: contract.padId,
    padName: contract.padName,
    company: "Ascent",
    displayScope: "persistent-main-map-all-and-ascent",
    displayAuthority: artifact.displayAuthority,
    savedPin,
    reviewedRoadSequence: route.reviewedRoadSequence,
    arrival: {
      type: "LineString",
      colorRole: "teal",
      visibility: "main-map-all-and-ascent",
      label: route.arrival.label,
      coordinates: route.arrival.coordinates,
    },
    redContinuation,
    redDecision: {
      state: route.redDecision.state,
      reason: route.redDecision.reason,
    },
  };
}

const displays = batchHeaderIsValid()
  ? contracts.map((contract) => {
      const matches = artifact.routes.filter((route) => route.padId === contract.padId);
      return matches.length === 1 ? buildDisplay(matches[0], contract) : null;
    })
  : [];

const frozenDisplays = displays.length === contracts.length && displays.every(Boolean)
  ? displays as AscentPadRoadDisplay[]
  : [];

function exactDirectoryBinding(pad: PadSummary, contract: typeof contracts[number]) {
  const destination = mapDisplayCoordinate(pad);
  return pad.padId === contract.padId
    && pad.canonicalId === contract.canonicalId
    && pad.legacyId === contract.legacyId
    && pad.recordRevision === contract.recordRevision
    && pad.padName === contract.padName
    && pad.company === contract.company
    && pad.state === contract.state
    && pad.county === contract.county
    && destination?.longitude === contract.destination[0]
    && destination.latitude === contract.destination[1];
}

/** Returns a GPS-reaching line only for its exact frozen directory record. */
export function ascentPadRoadDisplayForPad(pad: PadSummary): AscentPadRoadDisplay | null {
  const index = contracts.findIndex((contract) => exactDirectoryBinding(pad, contract));
  return index >= 0 ? frozenDisplays[index] || null : null;
}

/**
 * Returns every independently valid exact-record Ascent line in this batch.
 * Missing, stale, and duplicate directory records fail closed independently.
 */
export function ascentPadRoadDisplaysForDirectory(pads: readonly PadSummary[]) {
  return contracts.flatMap((contract, index) => {
    const matches = pads.filter((pad) => exactDirectoryBinding(pad, contract));
    return matches.length === 1 && frozenDisplays[index] ? [frozenDisplays[index]] : [];
  });
}
