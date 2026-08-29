import type {
  OwnerGoogleVerifyPoint,
  OwnerGoogleVerifySectionMark,
} from "@/data/ownerGoogleVerifyDrafts";
import type { DriverPadStatus, DriverRouteGeometry, PadSummary } from "@/data/types";

export const maximumOwnerGoogleVerifyTurnPins = 5;

export interface OwnerGoogleVerifyPreviewSection {
  sectionId: string;
  ordinal: number;
  start: OwnerGoogleVerifyPoint;
  end: OwnerGoogleVerifyPoint;
  mark: OwnerGoogleVerifySectionMark | null;
}

export interface OwnerGoogleVerifyDestination extends OwnerGoogleVerifyPoint {
  source: "saved_pad_gps";
  label: string;
}

export type OwnerGoogleVerifyOutcome = {
  state: "review" | "success" | "off_approved_road";
  label: string;
  detail: string;
};

export type OwnerGoogleVerifyNamedRoadRoute = {
  geometry: DriverRouteGeometry;
  stepCount: number;
};

function usablePoint(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

/**
 * Keeps the verifier locked to an explicitly sourced pad destination. Legacy
 * packaged display points are deliberately excluded and no address/name is
 * geocoded as a substitute.
 */
export function ownerGoogleVerifyDestination(pad: PadSummary): OwnerGoogleVerifyDestination | null {
  if (pad.coordinate
    && usablePoint(pad.coordinate.latitude, pad.coordinate.longitude)
    && (pad.coordinate.role === "saved_pad_destination"
      || pad.coordinate.role === "driver_entrance")) {
    return {
      latitude: pad.coordinate.latitude,
      longitude: pad.coordinate.longitude,
      source: "saved_pad_gps",
      label: "Saved pad GPS",
    };
  }
  if (!pad.mapReference || !usablePoint(pad.mapReference.latitude, pad.mapReference.longitude)) return null;
  if (pad.mapReference.kind === "saved_pad_reference") return {
    latitude: pad.mapReference.latitude,
    longitude: pad.mapReference.longitude,
    source: "saved_pad_gps",
    label: "Saved pad GPS",
  };
  return null;
}

/**
 * Returns separately reviewed named-road display geometry for the selected pad.
 * Named approaches and valid pad-bound route projections do not need a
 * State-1 graph/public-Google stamp to render. Every supplied feature is
 * returned; missing geometry is never inferred from names or control points.
 */
export function ownerGoogleVerifyNamedRoadRoutes(
  status: DriverPadStatus | null,
): OwnerGoogleVerifyNamedRoadRoute[] {
  if (!status || status.dataState !== "live") return [];
  const namedApproaches = status.namedApproaches || [];
  if (namedApproaches.length) return namedApproaches.map((approach) => ({
    geometry: approach.geometry,
    stepCount: approach.steps.length,
  }));
  if (!status.route.geometry || !status.routeSteps.length) return [];
  return [{ geometry: status.route.geometry, stepCount: status.routeSteps.length }];
}

export function ownerGoogleVerifySectionId(
  ordinal: number,
  start: OwnerGoogleVerifyPoint,
  end: OwnerGoogleVerifyPoint,
) {
  return [ordinal, start.latitude, start.longitude, end.latitude, end.longitude].join(":");
}

export function buildOwnerGoogleVerifySections(
  anchor: OwnerGoogleVerifyPoint,
  turnPins: readonly OwnerGoogleVerifyPoint[],
  destination: OwnerGoogleVerifyPoint,
  marks: readonly OwnerGoogleVerifySectionMark[],
): OwnerGoogleVerifyPreviewSection[] {
  const boundaries = [anchor, ...turnPins, destination];
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const ordinal = index + 1;
    const sectionId = ownerGoogleVerifySectionId(ordinal, start, end);
    return {
      sectionId,
      ordinal,
      start,
      end,
      mark: marks.find((candidate) => candidate.sectionId === sectionId) || null,
    };
  });
}

export function addOwnerGoogleVerifyPoint(
  anchor: OwnerGoogleVerifyPoint | null,
  turnPins: readonly OwnerGoogleVerifyPoint[],
  point: OwnerGoogleVerifyPoint,
) {
  if (!anchor) return { anchor: point, turnPins: [...turnPins], notice: "Anchor set. Tap each required turn in order." };
  if (turnPins.length >= maximumOwnerGoogleVerifyTurnPins) return {
    anchor,
    turnPins: [...turnPins],
    notice: "Five turn pins is the limit. Use Undo or Clear before adding another.",
  };
  return {
    anchor,
    turnPins: [...turnPins, point],
    notice: `Turn pin ${turnPins.length + 1} added.`,
  };
}

export function ownerGoogleVerifyOutcome(
  sections: readonly OwnerGoogleVerifyPreviewSection[],
): OwnerGoogleVerifyOutcome {
  if (sections.some((section) => section.mark?.state === "not_approved")) return {
    state: "off_approved_road",
    label: "Wrong road",
    detail: "At least one reviewed section leaves the directed named-road sequence.",
  };
  if (!sections.length || sections.some((section) => section.mark === null)) return {
    state: "review",
    label: "Review route sections",
    detail: "Tap every post-anchor section and classify it before this draft can show a route result.",
  };

  let trailingLeaseStarted = false;
  let approvedCount = 0;
  for (const section of sections) {
    if (section.mark?.state === "lease_or_unnamed") {
      trailingLeaseStarted = true;
      continue;
    }
    if (section.mark?.state === "approved_named_road") {
      if (trailingLeaseStarted || !section.mark.roadName?.trim()) return {
        state: "off_approved_road",
        label: "Wrong road",
        detail: "The preview returns to a named road after an unnamed or lease section, or a directed section has no owner-entered road name.",
      };
      approvedCount += 1;
    }
  }
  if (!approvedCount) return {
    state: "off_approved_road",
    label: "Wrong road",
    detail: "No directed named-road section was recorded after the anchor.",
  };
  return trailingLeaseStarted ? {
    state: "success",
    label: "Named roads then saved pin",
    detail: "Directed named roads stay contiguous, followed only by a trailing unnamed or lease movement to the saved pad GPS.",
  } : {
    state: "success",
    label: "Named roads to saved pin",
    detail: "Every post-anchor section is marked as a directed named road.",
  };
}
