import type { PadSummary } from "@/data/types";
import { mapDisplayCoordinate } from "@/data/mapDisplayCoordinates";
import artifactJson from "./carlosRedContinuation.json";
import {
  ascentRedContinuationIsEligible,
  type AscentPadRedContinuation,
  type AscentPadRoadCoordinate,
} from "./ascentPadRoadDisplays";

export interface AscentPadPersistentRedDisplay {
  kind: "persistent-red-continuation";
  padId: string;
  company: "Ascent";
  lines: AscentPadRedContinuation[];
}

interface CarlosRedArtifact {
  schemaVersion: number;
  padId: string;
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  padName: string;
  company: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  destination: unknown;
  roadSeam: unknown;
  noConnectorToGps: unknown;
  source: unknown;
  redContinuation: unknown;
}

const artifact = artifactJson as unknown as CarlosRedArtifact;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function coordinate(value: unknown): value is AscentPadRoadCoordinate {
  return Array.isArray(value)
    && value.length === 2
    && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

function sameCoordinate(left: readonly number[], right: readonly number[]) {
  return left[0] === right[0] && left[1] === right[1];
}

function frozenLine(): AscentPadRedContinuation | null {
  if (artifact.schemaVersion !== 1
    || artifact.company !== "Ascent"
    || artifact.noConnectorToGps !== true
    || !coordinate(artifact.destination)
    || !coordinate(artifact.roadSeam)) return null;
  const source = object(artifact.source);
  const line = object(artifact.redContinuation);
  if (source.productionWrites !== 0
    || line.lineRole !== "proven_red_outbound_reference"
    || line.pointCount !== 182
    || !Array.isArray(line.coordinates)
    || line.coordinates.length !== line.pointCount
    || !sameCoordinate(line.coordinates[0] as number[], artifact.roadSeam)
    || !ascentRedContinuationIsEligible(
      artifact.redContinuation,
      artifact.padId,
      artifact.roadSeam,
      artifact.destination,
    )) return null;
  return artifact.redContinuation as AscentPadRedContinuation;
}

const line = frozenLine();

function exactDirectoryBinding(pad: PadSummary) {
  const displayCoordinate = mapDisplayCoordinate(pad);
  return line
    && coordinate(artifact.destination)
    && pad.padId === artifact.padId
    && pad.canonicalId === artifact.canonicalId
    && pad.legacyId === artifact.legacyId
    && pad.recordRevision === artifact.recordRevision
    && pad.padName === artifact.padName
    && pad.company === artifact.company
    && pad.state === artifact.state
    && pad.county === artifact.county
    && pad.structuredRoadSequence === artifact.structuredRoadSequence
    && displayCoordinate?.longitude === artifact.destination[0]
    && displayCoordinate.latitude === artifact.destination[1];
}

/**
 * Adds only the proved road-after-last-pad reference. It does not change
 * CARLOS navigation, name the GPS tether, or turn the red road into approval.
 */
export function ascentPadPersistentRedDisplaysForDirectory(pads: readonly PadSummary[]) {
  const matches = pads.filter((pad) => pad.padId === artifact.padId);
  if (matches.length !== 1 || !exactDirectoryBinding(matches[0])) return [];
  return [{
    kind: "persistent-red-continuation" as const,
    padId: artifact.padId,
    company: "Ascent" as const,
    lines: [line!],
  }];
}
