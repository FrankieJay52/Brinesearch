export type DirectorySourceState =
  | "live_current"
  | "live_stale"
  | "cached_live"
  | "cached_stale"
  | "packaged_fallback"
  | "unavailable";

export type CoordinateRole = "driver_entrance" | "saved_pad_destination" | "legacy_saved" | "reference";

export type RouteState = "ready" | "written_only" | "held" | "stale" | "unavailable";
export type RouteSource = "exact_graph" | "exact_graph_handoff" | "reviewed_written" | "legacy_written" | "destination_only" | "none";
export type WrittenDirectionsSource = "directions_clear" | "written_directions";
export type GraphState = "active_current" | "verified_release" | "stale" | "held" | "unavailable";
export type PublicGoogleState = "ready" | "held" | "not_published" | "stale" | "unavailable";

export interface PadCoordinate {
  latitude: number;
  longitude: number;
  role: CoordinateRole;
}

export type PadMapReferenceKind = "official_pad_reference" | "official_wellhead_reference" | "saved_pad_reference";

export interface PadMapReference extends PadCoordinate {
  role: "reference";
  kind: PadMapReferenceKind;
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
  mapReference?: PadMapReference | null;
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

export interface DriverRouteChoice {
  routeKey: string;
  routeGroup: "primary" | "alternate";
  variantIndex: number;
  label: string;
  steps: DriverRouteStep[];
  geometry: DriverRouteGeometry;
  lastVerifiedAt: string;
  statusRevision: string;
}

export type DriverNamedApproachFinalLegMode = "full_approved_route" | "google_to_saved_gps_unapproved";

export interface DriverNamedApproach {
  approachKey: string;
  approachLabel: string;
  routeGroup: "primary" | "alternate";
  variantIndex: number;
  releaseVersion: "v18-named-approach-v1";
  routeRevision: number;
  steps: DriverRouteStep[];
  geometry: DriverRouteGeometry;
  ingress: {
    role: "exact_approved_ingress";
    label: string;
    latitude: number;
    longitude: number;
  };
  coreEnd: {
    role: "exact_approved_handoff";
    label: string;
    latitude: number;
    longitude: number;
  };
  destination: {
    role: "driver_entrance" | "saved_pad_destination";
    label: string;
    latitude: number;
    longitude: number;
  };
  finalLegMode: DriverNamedApproachFinalLegMode;
  handoff: {
    originMode: "current_location_to_named_ingress";
    handoffMode: "full_geometry_endpoints" | "verified_compact";
    waypoints: Array<{ latitude: number; longitude: number }>;
  };
  lastVerifiedAt: string;
  statusRevision: string;
  releaseDigest: string;
  publishedAt: string;
  navigationUrl: string;
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
  loadProvenance?: "live_response" | "session_cache" | "device_cache" | "fallback";
  route: {
    state: RouteState;
    source: RouteSource;
    geometry: DriverRouteGeometry | null;
    safeReason: string | null;
    lastVerifiedAt: string | null;
    writtenDirections: string | null;
    writtenDirectionsSource?: WrittenDirectionsSource | null;
    writtenDirectionsSourceRevision?: string | null;
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
    role: "driver_entrance" | "saved_pad_destination" | null;
    latitude: number | null;
    longitude: number | null;
  };
  routeSteps: DriverRouteStep[];
  /**
   * Separately reviewed named approaches returned atomically with this pad
   * status. Their geometry may be shown as teal everyday display without a
   * State-1 stamp; it remains display only and cannot create road authority.
   * Older offline records omit this additive field.
   */
  namedApproaches?: DriverNamedApproach[];
}

export interface SearchFilters {
  type: "all" | "pad" | "disposal" | "road" | "company";
  route: "all" | "ready" | "held" | "written_only";
}
