import type { PadSummary } from "@/data/types";
import bannockRoadDisplay from "./bannockRoadDisplay.json";

export type FieldDirectionCoordinate = [number, number];
export type FieldDirectionColorRole = "teal" | "red";

export interface SelectedPadFieldDirectionLineString<ColorRole extends FieldDirectionColorRole = FieldDirectionColorRole> {
  type: "LineString";
  colorRole: ColorRole;
  label: string;
  coordinates: readonly FieldDirectionCoordinate[];
}

export interface SelectedPadFieldDirectionTransition {
  role: string;
  coordinate: FieldDirectionCoordinate;
}

export interface SelectedPadFieldDirectionDisplay {
  padId: string;
  displayScope: "selected-pad-only";
  displayAuthority: string;
  savedPin: FieldDirectionCoordinate;
  projectedSeam: FieldDirectionCoordinate;
  noConnectorToGps: true;
  inbound: SelectedPadFieldDirectionLineString<"teal">;
  outbound: SelectedPadFieldDirectionLineString<"red">;
  transitions: readonly SelectedPadFieldDirectionTransition[];
}

export type SelectedPadFieldDirectionPad = Pick<
  PadSummary,
  "padId" | "canonicalId" | "legacyId" | "recordRevision" | "padName" | "company" | "state" | "county" | "coordinate"
>;

interface BannockRoadDisplayArtifact {
  schemaVersion: number;
  displayScope: string;
  displayAuthority: string;
  padId: string;
  legacyId: string;
  recordRevision: string;
  padName: string;
  company: string;
  destination: unknown;
  projectedSeam: unknown;
  noConnectorToGps: boolean;
  inbound: {
    colorRole: string;
    label: string;
    pointCount: number;
    coordinates: unknown;
  };
  outbound: {
    colorRole: string;
    label: string;
    pointCount: number;
    coordinates: unknown;
  };
  transitions: unknown;
  continuity: {
    inboundEndEqualsOutboundStart: boolean;
    sharedColorSeam: unknown;
    namedRoadTopologyHasGaps: boolean;
    gpsConnectorIncluded: boolean;
  };
}

const artifact = bannockRoadDisplay as unknown as BannockRoadDisplayArtifact;

const contract = {
  padId: "333598ca-37b3-4b44-9411-a490cc3da672",
  legacyId: "ascent--bannock",
  recordRevision: "1786744183028038",
  padName: "BANNOCK",
  company: "Ascent",
  state: "Ohio",
  county: "Belmont",
  latitude: 40.111003,
  longitude: -81.002932,
  inboundStart: [-80.977251, 40.108873] as FieldDirectionCoordinate,
  projectedSeam: [-81.0029984280781, 40.11094217212037] as FieldDirectionCoordinate,
  outboundEnd: [-81.055906, 40.149757] as FieldDirectionCoordinate,
  inboundPointCount: 95,
  outboundPointCount: 239,
};

function isCoordinate(value: unknown): value is FieldDirectionCoordinate {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [longitude, latitude] = value;
  return typeof longitude === "number"
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && typeof latitude === "number"
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90;
}

function isCoordinateLine(value: unknown, pointCount: number): value is FieldDirectionCoordinate[] {
  return Array.isArray(value) && value.length === pointCount && value.every(isCoordinate);
}

function coordinatesEqual(left: FieldDirectionCoordinate, right: FieldDirectionCoordinate) {
  return left[0] === right[0] && left[1] === right[1];
}

function isTransitionList(value: unknown): value is Array<{ role: string; coordinate: FieldDirectionCoordinate }> {
  return Array.isArray(value) && value.every((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const record = candidate as Record<string, unknown>;
    return typeof record.role === "string" && isCoordinate(record.coordinate);
  });
}

function artifactMatchesContract(): boolean {
  if (artifact.schemaVersion !== 1
    || artifact.displayScope !== "selected-pad-only"
    || artifact.padId !== contract.padId
    || artifact.legacyId !== contract.legacyId
    || artifact.recordRevision !== contract.recordRevision
    || artifact.padName !== contract.padName
    || artifact.company !== contract.company
    || artifact.noConnectorToGps !== true
    || artifact.inbound.colorRole !== "teal"
    || artifact.outbound.colorRole !== "red"
    || artifact.inbound.pointCount !== contract.inboundPointCount
    || artifact.outbound.pointCount !== contract.outboundPointCount
    || !isCoordinate(artifact.destination)
    || !isCoordinate(artifact.projectedSeam)
    || !isCoordinate(artifact.continuity.sharedColorSeam)
    || !isCoordinateLine(artifact.inbound.coordinates, contract.inboundPointCount)
    || !isCoordinateLine(artifact.outbound.coordinates, contract.outboundPointCount)
    || !isTransitionList(artifact.transitions)) return false;

  const inbound = artifact.inbound.coordinates;
  const outbound = artifact.outbound.coordinates;
  return coordinatesEqual(artifact.destination, [contract.longitude, contract.latitude])
    && coordinatesEqual(artifact.projectedSeam, contract.projectedSeam)
    && coordinatesEqual(artifact.continuity.sharedColorSeam, contract.projectedSeam)
    && coordinatesEqual(inbound[0], contract.inboundStart)
    && coordinatesEqual(inbound[inbound.length - 1], contract.projectedSeam)
    && coordinatesEqual(outbound[0], contract.projectedSeam)
    && coordinatesEqual(outbound[outbound.length - 1], contract.outboundEnd)
    && artifact.continuity.inboundEndEqualsOutboundStart === true
    && artifact.continuity.namedRoadTopologyHasGaps === false
    && artifact.continuity.gpsConnectorIncluded === false;
}

const display: SelectedPadFieldDirectionDisplay | null = artifactMatchesContract()
  ? {
      padId: contract.padId,
      displayScope: "selected-pad-only",
      displayAuthority: artifact.displayAuthority,
      savedPin: [contract.longitude, contract.latitude],
      projectedSeam: contract.projectedSeam,
      noConnectorToGps: true,
      inbound: {
        type: "LineString",
        colorRole: "teal",
        label: artifact.inbound.label,
        coordinates: artifact.inbound.coordinates as FieldDirectionCoordinate[],
      },
      outbound: {
        type: "LineString",
        colorRole: "red",
        label: artifact.outbound.label,
        coordinates: artifact.outbound.coordinates as FieldDirectionCoordinate[],
      },
      transitions: (artifact.transitions as Array<{ role: string; coordinate: FieldDirectionCoordinate }>).map(
        ({ role, coordinate }) => ({ role, coordinate }),
      ),
    }
  : null;

/**
 * Returns BANNOCK's selected-pad-only field display only for the exact frozen
 * directory record and entrance coordinate. This presentation never changes
 * the saved GPS or Google handoff and intentionally omits a GPS-to-road line.
 */
export function selectedPadFieldDirectionDisplayForPad(
  pad: SelectedPadFieldDirectionPad,
): SelectedPadFieldDirectionDisplay | null {
  if (!display
    || pad.padId !== contract.padId
    || pad.canonicalId !== contract.padId
    || pad.legacyId !== contract.legacyId
    || pad.recordRevision !== contract.recordRevision
    || pad.padName !== contract.padName
    || pad.company !== contract.company
    || pad.state !== contract.state
    || pad.county !== contract.county
    || pad.coordinate?.latitude !== contract.latitude
    || pad.coordinate.longitude !== contract.longitude
    || pad.coordinate.role !== "driver_entrance") return null;

  return display;
}
