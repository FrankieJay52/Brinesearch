export type DirectorySourceState =
  | "live_current"
  | "live_stale"
  | "cached_live"
  | "cached_stale"
  | "packaged_fallback"
  | "unavailable";

export type CoordinateRole = "driver_entrance" | "legacy_saved" | "reference";

export type RouteState = "ready" | "written_only" | "held" | "stale" | "unavailable";
export type RouteSource = "exact_graph" | "reviewed_written" | "legacy_written" | "destination_only" | "none";
export type GraphState = "active_current" | "stale" | "held" | "unavailable";
export type PublicGoogleState = "ready" | "held" | "not_published" | "stale" | "unavailable";

export interface PadCoordinate {
  latitude: number;
  longitude: number;
  role: CoordinateRole;
}

export interface PadSummary {
  padId: string;
  canonicalId: string | null;
  legacyId: string | null;
  aliases: string[];
  recordNumber: number | null;
  recordRevision: string;
  recordType: "pad" | "disposal" | "other";
  company: string;
  padName: string;
  state: string;
  county: string;
  township: string;
  address: string;
  coordinate: PadCoordinate | null;
  wellNames: string[];
  apiNumbers: string[];
  propertyNumbers: string[];
  safeRoadTerms: string[];
  structuredRoadSequence: string;
  writtenDirections: string;
  verificationStatus: string;
  operatingStatus: string;
  updatedAt: string | null;
}

export interface PadWellIdentifierRow {
  wellName: string | null;
  apiNumber: string | null;
  propertyNumber: string | null;
}

export interface DirectorySnapshot {
  schemaVersion: 1;
  snapshotId: string;
  sourceRevision: string;
  sourceState: DirectorySourceState;
  generatedAt: string | null;
  fetchedAt: string;
  lastVerifiedAt: string | null;
  rows: PadSummary[];
  counts: {
    locations: number;
    pads: number;
    disposals: number;
    mapped: number;
  };
}

export type SharedRoadInstructionKind =
  | "turn"
  | "continue"
  | "name_change"
  | "shared_begin"
  | "shared_end";

export interface DriverRouteStep {
  order: number;
  kind: SharedRoadInstructionKind;
  displayName: string;
  verifiedDesignations: string[];
  instruction: string;
  distanceMiles: number | null;
}

export interface DriverRouteGeometry {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { stepOrder: number };
    geometry:
      | { type: "LineString"; coordinates: [number, number][] }
      | { type: "MultiLineString"; coordinates: [number, number][][] };
  }>;
}

export type CompanyRoadGeometry =
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "MultiLineString"; coordinates: [number, number][][] };

export interface CompanyRoadOverlayRow {
  ordinal: number;
  companyLabel: string | null;
  companies: string[];
  displayNames: string[];
  verifiedDesignations: string[];
  states: ("OH" | "PA" | "WV")[];
  counties: string[];
  geometry: CompanyRoadGeometry;
  lengthMiles: number;
}

export interface CompanyRoadOverlay {
  snapshotId: string;
  directorySnapshotId: string;
  sourceRevision: string;
  generatedAt: string;
  selection: "all" | string;
  availableCompanies: string[];
  rows: CompanyRoadOverlayRow[];
}

export interface DriverPadStatus {
  padId: string;
  recordRevision: string;
  dataState: "live" | "cached" | "stale" | "fallback";
  route: {
    state: RouteState;
    source: RouteSource;
    geometry: DriverRouteGeometry | null;
    safeReason: string | null;
    lastVerifiedAt: string | null;
    writtenDirections: string | null;
  };
  graph: {
    state: GraphState;
    county: string | null;
    publicSource: string | null;
    lastVerifiedAt: string | null;
  };
  google: {
    publicState: PublicGoogleState;
    routeUrl: string | null;
    safeReason: string | null;
  };
  destination: {
    available: boolean;
    latitude: number | null;
    longitude: number | null;
  };
  googleRouteChunks: { chunk: number; url: string }[];
  routeSteps: DriverRouteStep[];
}

export interface SearchFilters {
  type: "all" | "pad" | "disposal" | "road" | "company";
  route: "all" | "ready" | "held" | "written_only";
}
