import artifact from "./ascentExistingIdentityNavigationBatch2.json";
import type { PadDestinationSource } from "./googleDestination";

export interface ExistingIdentityHookEntry {
  roadId: string;
  county: string;
  roadName: string;
  routeNumber: string;
}

export interface ExistingIdentityNavigationContract {
  padId: string;
  canonicalId: string;
  legacyId: string;
  recordRevision: string;
  company: string;
  padName: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  title: string;
  detail: string;
  routeUrl: string;
  reviewedRoadSequence: string;
  roadIdentityHook: readonly ExistingIdentityHookEntry[];
  identitySequence: readonly {
    writtenRoadName: string;
    roadId: string;
  }[];
  finalLegNotice: string;
  trustedDestination: {
    latitude: number;
    longitude: number;
    source: PadDestinationSource;
  };
  directoryDestination: {
    gpsSource: string;
    coordinateRole: string;
    latitude: number;
    longitude: number;
  };
  routeDestination: {
    latitude: number;
    longitude: number;
  };
  waypoints: readonly {
    latitude: number;
    longitude: number;
  }[];
}

export interface ExistingIdentityNavigationHold {
  padId: string;
  legacyId: string;
  recordRevision: string;
  company: string;
  padName: string;
  state: string;
  county: string;
  structuredRoadSequence: string;
  directoryDestination: {
    gpsSource: string;
    coordinateRole: string;
    latitude: number;
    longitude: number;
  };
  disposition: "GPS_ONLY";
  reason: string;
  evidenceSource: string;
}

// Generated from the frozen exact-master source fixture. The contracts are
// geometry-free and omit origin so the phone supplies current location.
export const ascentExistingIdentityNavigationBatch2 = artifact.records as readonly ExistingIdentityNavigationContract[];
export const ascentExistingIdentityNavigationBatch2Holds = artifact.holds as readonly ExistingIdentityNavigationHold[];

