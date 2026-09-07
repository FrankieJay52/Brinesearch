// BLAYNEY-only reviewed Google handoff. Draft PR #215. Do not merge until
// this contract is wired into reviewedNavigationCandidates.ts on the same SHA.
// Bound record is fail-closed: exact padId + legacyId + revision + sequence.

export const BLAYNEY_PAD_ID = "f896d00c-da26-41b6-bf5b-e9d91afbdbc6" as const;
export const BLAYNEY_LEGACY_ID = "ascent--blayney" as const;
export const BLAYNEY_RECORD_REVISION = "1788117937351112" as const;
export const BLAYNEY_STRUCTURED_ROAD_SEQUENCE =
  "I-70 → Exit 213 → OH-331 → OR → OH-9 → OH-149 → OH-331" as const;

export const BLAYNEY_ROUTE_DESTINATION = {
  latitude: 40.115603,
  longitude: -80.992706,
} as const;

export const BLAYNEY_WAYPOINTS = [
  { latitude: 40.105927699, longitude: -80.975684341 },
  { latitude: 40.108586794, longitude: -80.978877279 },
] as const;

export const BLAYNEY_REVIEWED_GOOGLE_URL =
  "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.115603%2C-80.992706&waypoints=40.105927699%2C-80.975684341%7C40.108586794%2C-80.978877279";

export const BLAYNEY_REVIEWED_ROAD_SEQUENCE =
  "I-70 both ways → Exit 213 → OH-331 → Lafferty-Bannock Rd / CR-10 → unapproved lease/GPS handoff → saved pad GPS" as const;

export const BLAYNEY_DETAIL =
  "OH-331 → Lafferty-Bannock Rd / CR-10 → unapproved GPS handoff" as const;
