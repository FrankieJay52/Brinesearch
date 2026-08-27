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

export const LAWSON_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.124991%2C-81.295913&waypoints=40.123106982%2C-81.353948693%7C40.111789555%2C-81.300978103%7C40.124973191%2C-81.294865644";
export const BILINOVICH_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620&waypoints=40.123106982%2C-81.353948693%7C40.095894612%2C-81.283992781%7C40.099684564%2C-81.297880136";
export const BEETLE_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.185403%2C-80.922718&waypoints=40.1869745925099%2C-80.9192177275288%7C40.185340499%2C-80.919294431%7C40.185025%2C-80.920500";

interface ReviewedNavigationContract extends ReviewedNavigationCandidate {
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  company: string;
  padName: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  destination?: {
    latitude: number;
    longitude: number;
    source: PadDestinationSource;
  };
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
  },
  {
    // The first waypoint is 20 metres inside Sixteen Road from its verified
    // OH-519 junction. This avoids Google's intersection-arrival bias while
    // allowing either state-route direction to make the turn.
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
    destination: {
      latitude: 40.185403,
      longitude: -80.922718,
      source: "saved_pad_gps",
    },
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

  if (contract.destination) {
    const destination = trustedPadDestination(pad);
    const routeDestination = new URL(contract.routeUrl).searchParams.get("destination")?.split(",").map(Number) || [];
    if (!destination
      || destination.source !== contract.destination.source
      || Math.abs(destination.latitude - contract.destination.latitude) > 1e-9
      || Math.abs(destination.longitude - contract.destination.longitude) > 1e-9
      || routeDestination.length !== 2
      || !routeDestination.every(Number.isFinite)
      || Math.abs(routeDestination[0] - destination.latitude) > 1e-9
      || Math.abs(routeDestination[1] - destination.longitude) > 1e-9) return null;
  }

  return {
    padId: contract.padId,
    title: contract.title,
    detail: contract.detail,
    routeUrl: contract.routeUrl,
    reviewedRoadSequence: contract.reviewedRoadSequence,
    finalLegNotice: contract.finalLegNotice,
  };
}
