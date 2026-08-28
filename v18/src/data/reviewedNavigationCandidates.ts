import { parseCoordinatePair } from "./coordinates";
import type { PadSummary } from "./types";
import { trustedPadDestination, type PadDestinationSource } from "./googleDestination";

export interface ReviewedNavigationCandidate {
  padId: string;
  title: string;
  detail: string;
  routeUrl: string;
  reviewedRoadSequence?: string;
  finalLegNotice?: string;
}

export interface ReviewedNavigationSafetyHold {
  padId: string;
  title: string;
  detail: string;
}

export interface ReviewedNavigationCoordinate {
  latitude: number;
  longitude: number;
}

function reviewedCoordinate(value: ReviewedNavigationCoordinate) {
  const parsed = parseCoordinatePair(value.latitude, value.longitude, "reference");
  if (!parsed.ok) throw new Error("Reviewed navigation contains an invalid coordinate");
  return `${parsed.value.latitude},${parsed.value.longitude}`;
}

/**
 * Builds the only supported client-reviewed Google handoff shape. The phone's
 * location remains the origin, and the three-point mobile waypoint budget is
 * enforced instead of silently dropping a reviewed turn.
 */
export function buildReviewedNavigationUrl(
  destination: ReviewedNavigationCoordinate,
  waypoints: readonly ReviewedNavigationCoordinate[],
) {
  if (!waypoints.length || waypoints.length > 3) {
    throw new Error("Reviewed navigation requires one to three shaping points");
  }
  const parameters = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    dir_action: "navigate",
    destination: reviewedCoordinate(destination),
    waypoints: waypoints.map(reviewedCoordinate).join("|"),
  });
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

export function reviewedNavigationUrlMatchesContract(
  value: string,
  destination: ReviewedNavigationCoordinate,
  waypoints: readonly ReviewedNavigationCoordinate[],
) {
  try {
    const routeUrl = new URL(value);
    const requiredParameters = ["api", "travelmode", "dir_action", "destination", "waypoints"] as const;
    const allowedParameters = new Set(requiredParameters);
    const routeDestination = routeUrl.searchParams.get("destination")?.split(",").map(Number) || [];
    const routeWaypoints = routeUrl.searchParams.get("waypoints")?.split("|").map((point) => point.split(",").map(Number)) || [];
    return routeUrl.origin === "https://www.google.com"
      && routeUrl.pathname === "/maps/dir/"
      && routeUrl.hash === ""
      && !routeUrl.searchParams.has("origin")
      && [...routeUrl.searchParams.keys()].every((key) => allowedParameters.has(key as typeof requiredParameters[number]))
      && requiredParameters.every((key) => routeUrl.searchParams.getAll(key).length === 1)
      && routeUrl.searchParams.get("api") === "1"
      && routeUrl.searchParams.get("travelmode") === "driving"
      && routeUrl.searchParams.get("dir_action") === "navigate"
      && routeDestination.length === 2
      && routeDestination.every(Number.isFinite)
      && Math.abs(routeDestination[0] - destination.latitude) <= 1e-9
      && Math.abs(routeDestination[1] - destination.longitude) <= 1e-9
      && routeWaypoints.length >= 1
      && routeWaypoints.length <= 3
      && routeWaypoints.length === waypoints.length
      && routeWaypoints.every((point, index) => point.length === 2
        && point.every(Number.isFinite)
        && Math.abs(point[0] - waypoints[index].latitude) <= 1e-9
        && Math.abs(point[1] - waypoints[index].longitude) <= 1e-9);
  } catch {
    return false;
  }
}

const LAWSON_ROUTE_DESTINATION = { latitude: 40.124991, longitude: -81.295913 } as const;
const LAWSON_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.111789555, longitude: -81.300978103 },
  { latitude: 40.124973191, longitude: -81.294865644 },
] as const;
const BILINOVICH_ROUTE_DESTINATION = { latitude: 40.08738445, longitude: -81.30282620 } as const;
const BILINOVICH_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.095894612, longitude: -81.283992781 },
  { latitude: 40.099684564, longitude: -81.297880136 },
] as const;
const BEETLE_ROUTE_DESTINATION = { latitude: 40.185403, longitude: -80.922718 } as const;
const BEETLE_WAYPOINTS = [
  { latitude: 40.1869745925099, longitude: -80.9192177275288 },
  { latitude: 40.185340499, longitude: -80.919294431 },
  { latitude: 40.185025, longitude: -80.920500 },
] as const;
const DUKE_ROUTE_DESTINATION = { latitude: 40.214409, longitude: -80.891316 } as const;
const DUKE_WAYPOINTS = [
  { latitude: 40.2376772526251, longitude: -80.9645933421097 },
  { latitude: 40.2344651449313, longitude: -80.9216048043883 },
  { latitude: 40.2438460898288, longitude: -80.9156965297937 },
] as const;
const PORTERFIELD_ROUTE_DESTINATION = { latitude: 40.090431, longitude: -80.928503 } as const;
const PORTERFIELD_WAYPOINTS = [
  { latitude: 40.073689, longitude: -80.945041 },
  { latitude: 40.088246, longitude: -80.944086 },
  { latitude: 40.090469, longitude: -80.928294 },
] as const;

// Existing phone-validated handoffs are intentionally byte-for-byte stable.
// Building them from JavaScript numbers can drop reviewed trailing zeroes even
// though the coordinates are numerically equivalent.
export const LAWSON_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.124991%2C-81.295913&waypoints=40.123106982%2C-81.353948693%7C40.111789555%2C-81.300978103%7C40.124973191%2C-81.294865644";
export const BILINOVICH_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620&waypoints=40.123106982%2C-81.353948693%7C40.095894612%2C-81.283992781%7C40.099684564%2C-81.297880136";
export const BEETLE_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.185403%2C-80.922718&waypoints=40.1869745925099%2C-80.9192177275288%7C40.185340499%2C-80.919294431%7C40.185025%2C-80.920500";
export const DUKE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(DUKE_ROUTE_DESTINATION, DUKE_WAYPOINTS);
export const PORTERFIELD_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PORTERFIELD_ROUTE_DESTINATION, PORTERFIELD_WAYPOINTS);

interface ReviewedNavigationContract extends ReviewedNavigationCandidate {
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  company: string;
  padName: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  trustedDestination: {
    latitude: number;
    longitude: number;
    source: PadDestinationSource;
  };
  routeDestination: ReviewedNavigationCoordinate;
  waypoints: readonly ReviewedNavigationCoordinate[];
}

const reviewedNavigationContracts: readonly ReviewedNavigationContract[] = [
  {
    padId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    canonicalId: "143f5268-33e4-4598-8101-40220b5cfdc4",
    legacyId: "ascent--lawson",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "LAWSON",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Millers Fork Rd",
    title: "Navigate reviewed route",
    detail: "Reviewed road core → saved GPS · graph status separate",
    routeUrl: LAWSON_REVIEWED_GOOGLE_URL,
    trustedDestination: {
      latitude: 40.124991,
      longitude: -81.295913,
      source: "saved_pad_gps",
    },
    routeDestination: LAWSON_ROUTE_DESTINATION,
    waypoints: LAWSON_WAYPOINTS,
  },
  {
    padId: "59061829-1122-4aae-872d-cf5024310373",
    canonicalId: "59061829-1122-4aae-872d-cf5024310373",
    legacyId: "ascent--bilinovich",
    recordRevision: "1787802711836476",
    company: "Ascent",
    padName: "BILINOVICH",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → Turkle Rd / TR-693 → trusted lease approach → BILINOVICH",
    title: "Navigate reviewed route",
    detail: "McCoy → Merry → Penrose → Logan → Turkle → pad GPS",
    routeUrl: BILINOVICH_REVIEWED_GOOGLE_URL,
    // The current record's saved reference is the reviewed lease approach.
    // The separately reviewed URL continues to the ODNR pad-surface point.
    trustedDestination: {
      latitude: 40.08863,
      longitude: -81.304164,
      source: "saved_pad_gps",
    },
    routeDestination: BILINOVICH_ROUTE_DESTINATION,
    waypoints: BILINOVICH_WAYPOINTS,
  },
  {
    // The first waypoint is 20 metres inside Sixteen Road from its verified
    // OH-519 junction. This avoids exact-intersection waypoint ambiguity and
    // is designed to accept either state-route direction at the turn.
    padId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    canonicalId: "0e6f23f1-3bfb-44b0-aa4e-f24dde611880",
    legacyId: "ascent--beetle",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "BEETLE",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-519 → US-250 → Pad",
    title: "Navigate reviewed route",
    detail: "OH-519 → Sixteen Rd → lease approach · GPS-only final leg",
    routeUrl: BEETLE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "OH-519 → Sixteen Rd → lease approach → saved pad GPS",
    finalLegNotice: "Sixteen Road is the reviewed local-road approach. The satellite-supported lease entrance, lease shaping point, and remaining leg to the saved pad GPS are not approved public-road geometry.",
    trustedDestination: {
      latitude: 40.185403,
      longitude: -80.922718,
      source: "saved_pad_gps",
    },
    routeDestination: BEETLE_ROUTE_DESTINATION,
    waypoints: BEETLE_WAYPOINTS,
  },
  {
    // DUKE reuses only COLOGIE's three independently proven local turn
    // controls. Its exact saved destination and record binding remain unique.
    padId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    canonicalId: "bb351070-6c94-45e5-942f-e155f9e86f7e",
    legacyId: "ascent--duke",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "DUKE",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd",
    title: "Navigate reviewed route",
    detail: "Foxes Bottom → Springdale Hill → Lamborn → saved GPS",
    routeUrl: DUKE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-250 → Foxes Bottom Rd → Springdale Hill Rd → Lamborn Rd → saved pad GPS",
    finalLegNotice: "The reviewed local-road handoff ends at DUKE's exact saved GPS on Lamborn Road. Exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.214409,
      longitude: -80.891316,
      source: "saved_pad_gps",
    },
    routeDestination: DUKE_ROUTE_DESTINATION,
    waypoints: DUKE_WAYPOINTS,
  },
  {
    padId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    canonicalId: "0b7105a0-1b36-4182-8d10-1f2e297c8bab",
    legacyId: "ascent--porterfield-gas-unit",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "PORTERFIELD GAS UNIT",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → OR → OH-331 → US-40 → Vineyard Rd",
    title: "Navigate reviewed route",
    detail: "US-40 → Vineyard Rd → saved GPS",
    routeUrl: PORTERFIELD_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "I-70 → Exit 215 → US-40 W → Vineyard Rd / CR-56 → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows US-40 to Vineyard Road and ends at PORTERFIELD GAS UNIT's exact saved GPS. Exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.090431,
      longitude: -80.928503,
      source: "saved_pad_gps",
    },
    routeDestination: PORTERFIELD_ROUTE_DESTINATION,
    waypoints: PORTERFIELD_WAYPOINTS,
  },
] as const;

const bilinovichUnsafeBlazeContract = {
  padId: "59061829-1122-4aae-872d-cf5024310373",
  canonicalId: "59061829-1122-4aae-872d-cf5024310373",
  legacyId: "ascent--bilinovich",
  recordRevision: "1787794115232844",
  company: "Ascent",
  padName: "BILINOVICH",
  state: "Ohio",
  county: "Guernsey",
  structuredRoadSequence: "I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH",
} as const;

function matchesBoundPad(
  pad: Pick<PadSummary, "padId" | "canonicalId" | "legacyId" | "recordRevision" | "company" | "padName" | "state" | "county" | "structuredRoadSequence">,
  contract: typeof bilinovichUnsafeBlazeContract,
) {
  return pad.padId === contract.padId
    && pad.canonicalId === contract.canonicalId
    && pad.legacyId === contract.legacyId
    && pad.recordRevision === contract.recordRevision
    && pad.company === contract.company
    && pad.padName === contract.padName
    && pad.state === contract.state
    && pad.county === contract.county
    && pad.structuredRoadSequence === contract.structuredRoadSequence;
}

/** Withdraws a known-unsafe reviewed route without inventing its replacement. */
export function reviewedNavigationSafetyHoldForPad(
  pad: Pick<PadSummary, "padId" | "canonicalId" | "legacyId" | "recordRevision" | "company" | "padName" | "state" | "county" | "structuredRoadSequence">,
): ReviewedNavigationSafetyHold | null {
  if (!matchesBoundPad(pad, bilinovichUnsafeBlazeContract)) return null;
  return {
    padId: bilinovichUnsafeBlazeContract.padId,
    title: "Reviewed route withdrawn",
    detail: "Do not use Blaze Road · corrected route pending",
  };
}

/**
 * Returns a route only when the current directory record is the exact reviewed
 * record. This is intentionally separate from graph/public-Google authority:
 * it exposes the owner's reviewed mobile handoff without manufacturing route
 * steps, geometry, or a public Google release.
 */
export function reviewedNavigationCandidateForPad(
  pad: PadSummary,
): ReviewedNavigationCandidate | null {
  const contract = reviewedNavigationContracts.find((candidate) => candidate.padId === pad.padId);
  if (!contract
    || pad.canonicalId !== contract.canonicalId
    || pad.legacyId !== contract.legacyId
    || pad.recordRevision !== contract.recordRevision
    || pad.company !== contract.company
    || pad.padName !== contract.padName
    || pad.state !== contract.state
    || pad.county !== contract.county
    || pad.structuredRoadSequence !== contract.structuredRoadSequence) return null;

  const destination = trustedPadDestination(pad);
  if (!destination
    || destination.source !== contract.trustedDestination.source
    || Math.abs(destination.latitude - contract.trustedDestination.latitude) > 1e-9
    || Math.abs(destination.longitude - contract.trustedDestination.longitude) > 1e-9) return null;

  if (!reviewedNavigationUrlMatchesContract(
    contract.routeUrl,
    contract.routeDestination,
    contract.waypoints,
  )) return null;

  return {
    padId: contract.padId,
    title: contract.title,
    detail: contract.detail,
    routeUrl: contract.routeUrl,
    reviewedRoadSequence: contract.reviewedRoadSequence,
    finalLegNotice: contract.finalLegNotice,
  };
}
