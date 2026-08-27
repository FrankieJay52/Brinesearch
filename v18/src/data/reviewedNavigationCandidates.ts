import type { PadSummary } from "./types";

export interface ReviewedNavigationCandidate {
  padId: string;
  title: string;
  detail: string;
  routeUrl: string;
}

export const BILINOVICH_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&origin=Saint%20Clairsville%2C%20OH&destination=40.08738445%2C-81.30282620&waypoints=40.12303995%2C-81.35382341%7C40.112583770%2C-81.294937982%7C40.09955931%2C-81.29781917&travelmode=driving&dir_action=navigate";

const bilinovichContract = {
  padId: "59061829-1122-4aae-872d-cf5024310373",
  legacyId: "ascent--bilinovich",
  recordRevision: "1787794115232844",
  company: "Ascent",
  padName: "BILINOVICH",
  state: "Ohio",
  county: "Guernsey",
  structuredRoadSequence: "I-70 W → Exit 193 → OH-513 N → US-22 E → McCoy Rd → Blaze Rd → Logan Rd → Turkle Rd / lease access → BILINOVICH",
} as const;

/**
 * Returns a route only when the current directory record is the exact reviewed
 * record. This is intentionally separate from graph/public-Google authority:
 * it exposes the owner's reviewed mobile handoff without manufacturing route
 * steps, geometry, or a public Google release.
 */
export function reviewedNavigationCandidateForPad(
  pad: Pick<PadSummary, "padId" | "canonicalId" | "legacyId" | "recordRevision" | "company" | "padName" | "state" | "county" | "structuredRoadSequence">,
): ReviewedNavigationCandidate | null {
  if (pad.padId !== bilinovichContract.padId
    || pad.canonicalId !== bilinovichContract.padId
    || pad.legacyId !== bilinovichContract.legacyId
    || pad.recordRevision !== bilinovichContract.recordRevision
    || pad.company !== bilinovichContract.company
    || pad.padName !== bilinovichContract.padName
    || pad.state !== bilinovichContract.state
    || pad.county !== bilinovichContract.county
    || pad.structuredRoadSequence !== bilinovichContract.structuredRoadSequence) return null;

  return {
    padId: bilinovichContract.padId,
    title: "Navigate reviewed route",
    detail: "Owner-reviewed Google directions · graph status separate",
    routeUrl: BILINOVICH_REVIEWED_GOOGLE_URL,
  };
}
