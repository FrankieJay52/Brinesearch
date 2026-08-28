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
const PORTERFIELD_B_ROUTE_DESTINATION = { latitude: 40.090438, longitude: -80.921210 } as const;
const PORTERFIELD_B_WAYPOINTS = [
  { latitude: 40.073689, longitude: -80.945041 },
  { latitude: 40.088246, longitude: -80.944086 },
  { latitude: 40.090469, longitude: -80.928294 },
] as const;
const BAKOS_ROUTE_DESTINATION = { latitude: 40.151125, longitude: -80.852968 } as const;
const BAKOS_WAYPOINTS = [
  { latitude: 40.1516769902779, longitude: -80.8451322878882 },
  { latitude: 40.1510618834494, longitude: -80.8504752159943 },
] as const;
const BANNOCK_ROUTE_DESTINATION = { latitude: 40.111003, longitude: -81.002932 } as const;
const BANNOCK_WAYPOINTS = [
  { latitude: 40.10871301297529, longitude: -80.97829303262223 },
] as const;
const ROCK_RIDGE_ROUTE_DESTINATION = { latitude: 39.998772, longitude: -81.224825 } as const;
const ROCK_RIDGE_WAYPOINTS = [
  { latitude: 40.007077099, longitude: -81.176502113 },
  { latitude: 40.007544767, longitude: -81.205526285 },
  { latitude: 39.997476604, longitude: -81.217520411 },
] as const;
const CROWIE_ROUTE_DESTINATION = { latitude: 40.0979, longitude: -80.9384 } as const;
const CROWIE_WAYPOINTS = [
  { latitude: 40.073689, longitude: -80.945041 },
  { latitude: 40.088246, longitude: -80.944086 },
] as const;
const CASTON_ROUTE_DESTINATION = { latitude: 40.130458, longitude: -81.328059 } as const;
const CASTON_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.113698669772, longitude: -81.314757942078 },
  { latitude: 40.127876178092, longitude: -81.316090497685 },
] as const;
const GIL_ROUTE_DESTINATION = { latitude: 40.09387, longitude: -81.29646 } as const;
const GIL_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.095922776519, longitude: -81.284173854530 },
  { latitude: 40.099552104984, longitude: -81.297815548031 },
] as const;
const GILCHER_ROUTE_DESTINATION = { latitude: 40.100079, longitude: -81.295657 } as const;
const GILCHER_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.105015636324, longitude: -81.279619885553 },
  { latitude: 40.095922776519, longitude: -81.284173854530 },
] as const;
const LAKE_ROUTE_DESTINATION = { latitude: 40.14776, longitude: -81.295527 } as const;
const LAKE_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.111840810550, longitude: -81.300972387724 },
  { latitude: 40.134573026404, longitude: -81.287284993921 },
] as const;
const THOMAS_ROUTE_DESTINATION = { latitude: 40.096986, longitude: -81.307667 } as const;
const THOMAS_WAYPOINTS = [
  { latitude: 40.087850494651, longitude: -81.320561551360 },
] as const;
const TROYER_ROUTE_DESTINATION = { latitude: 40.087025, longitude: -81.259818 } as const;
const TROYER_WAYPOINTS = [
  { latitude: 40.123106982, longitude: -81.353948693 },
  { latitude: 40.104665560, longitude: -81.273528365 },
  { latitude: 40.083490401, longitude: -81.263386973 },
] as const;
const CIRCLE_OAKS_ROUTE_DESTINATION = { latitude: 40.176413, longitude: -81.348770 } as const;
const CIRCLE_OAKS_WAYPOINTS = [
  { latitude: 40.211888715, longitude: -81.390778629 },
  { latitude: 40.204197138, longitude: -81.382414119 },
] as const;
const SADLER_ROUTE_DESTINATION = { latitude: 40.207568, longitude: -80.935841 } as const;
const SADLER_WAYPOINTS = [
  { latitude: 40.218227603057535, longitude: -80.94472982304073 },
] as const;
const TOWE_ROUTE_DESTINATION = { latitude: 40.385998, longitude: -81.212569 } as const;
const TOWE_WAYPOINTS = [
  { latitude: 40.36026193640823, longitude: -81.218134577079 },
  { latitude: 40.379819440170614, longitude: -81.20908591279908 },
] as const;
const DUTTON_ROUTE_DESTINATION = { latitude: 40.150027, longitude: -81.017133 } as const;
const DUTTON_WAYPOINTS = [
  { latitude: 40.143135410968, longitude: -81.033512001895 },
] as const;
const KUNGLE_B_ROUTE_DESTINATION = { latitude: 39.88678, longitude: -80.87008 } as const;
const KUNGLE_B_WAYPOINTS = [
  { latitude: 39.886820116283, longitude: -80.869735364419 },
] as const;
const TRUCHAN_NW_ROUTE_DESTINATION = { latitude: 40.147814, longitude: -80.935886 } as const;
const TRUCHAN_NW_WAYPOINTS = [
  { latitude: 40.151952334248, longitude: -80.961064815011 },
  { latitude: 40.15863093394, longitude: -80.943718975075 },
] as const;
const MOONSTONE_ROUTE_DESTINATION = { latitude: 39.83664, longitude: -81.379628 } as const;
const MOONSTONE_WAYPOINTS = [
  { latitude: 39.829803091222, longitude: -81.379580538853 },
] as const;
const JEFFCO_ROUTE_DESTINATION = { latitude: 40.292482, longitude: -80.896856 } as const;
const JEFFCO_WAYPOINTS = [
  { latitude: 40.3144086, longitude: -80.8963895 },
  { latitude: 40.2968376, longitude: -80.9022309 },
] as const;
const KUNGLE_A_ROUTE_DESTINATION = { latitude: 39.88507, longitude: -80.88258 } as const;
const KUNGLE_A_WAYPOINTS = [
  { latitude: 39.886820116283, longitude: -80.869735364419 },
] as const;
const TRUCHAN_NE_ROUTE_DESTINATION = { latitude: 40.146637, longitude: -80.931651 } as const;
const TRUCHAN_NE_WAYPOINTS = [
  { latitude: 40.151952334248, longitude: -80.961064815011 },
  { latitude: 40.15863093394, longitude: -80.943718975075 },
  { latitude: 40.146780343386, longitude: -80.934175287918 },
] as const;
const MATUSEK_ROUTE_DESTINATION = { latitude: 40.146555, longitude: -80.922785 } as const;
const MATUSEK_WAYPOINTS = [
  { latitude: 40.151952334248, longitude: -80.961064815011 },
  { latitude: 40.15863093394, longitude: -80.943718975075 },
  { latitude: 40.146780343386, longitude: -80.934175287918 },
] as const;
const LORRAINE_ROUTE_DESTINATION = { latitude: 40.09955, longitude: -80.840213 } as const;
const LORRAINE_WAYPOINTS = [
  { latitude: 40.149707596819, longitude: -80.842549734013 },
  { latitude: 40.116658061827, longitude: -80.859991873154 },
  { latitude: 40.101497884455, longitude: -80.841503024754 },
] as const;
const ALBATROSS_ROUTE_DESTINATION = { latitude: 40.079353, longitude: -81.224381 } as const;
const ALBATROSS_WAYPOINTS = [
  { latitude: 40.0817058, longitude: -81.2127365 },
] as const;
const MALDON_ROUTE_DESTINATION = { latitude: 40.010241, longitude: -81.197285 } as const;
const MALDON_WAYPOINTS = [
  { latitude: 40.0068106, longitude: -81.1762346 },
  { latitude: 40.0106308, longitude: -81.1957784 },
] as const;
const WITHEY_ROUTE_DESTINATION = { latitude: 39.962005, longitude: -81.216813 } as const;
const WITHEY_WAYPOINTS = [
  { latitude: 39.967149, longitude: -81.2055552 },
] as const;
const SKULL_FORK_ROUTE_DESTINATION = { latitude: 40.159734, longitude: -81.260675 } as const;
const SKULL_FORK_WAYPOINTS = [
  { latitude: 40.167610, longitude: -81.259685 },
] as const;
const HOOP_ROUTE_DESTINATION = { latitude: 40.166384, longitude: -81.325728 } as const;
const HOOP_WAYPOINTS = [
  { latitude: 40.053083897672, longitude: -81.551936547892 },
  { latitude: 40.1495834623593, longitude: -81.3150932898081 },
  { latitude: 40.1536867643988, longitude: -81.3127475000983 },
] as const;
const BRAVO_ROUTE_DESTINATION = { latitude: 40.178556, longitude: -81.015064 } as const;
const BRAVO_WAYPOINTS = [
  { latitude: 40.1849138, longitude: -80.9958138 },
] as const;
const RUTH_ROUTE_DESTINATION = { latitude: 40.173626, longitude: -80.879115 } as const;
const RUTH_WAYPOINTS = [
  { latitude: 40.1771191, longitude: -80.8806516 },
] as const;
const PICKENS_ROUTE_DESTINATION = { latitude: 40.182544, longitude: -80.977135 } as const;
const PICKENS_WAYPOINTS = [
  { latitude: 40.1868067, longitude: -80.9781928 },
] as const;
const ATHENA_ROUTE_DESTINATION = { latitude: 40.278613, longitude: -80.765988 } as const;
const ATHENA_WAYPOINTS = [
  { latitude: 40.2799914, longitude: -80.7619003 },
] as const;

// Existing phone-validated handoffs are intentionally byte-for-byte stable.
// Building them from JavaScript numbers can drop reviewed trailing zeroes even
// though the coordinates are numerically equivalent.
export const LAWSON_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.124991%2C-81.295913&waypoints=40.123106982%2C-81.353948693%7C40.111789555%2C-81.300978103%7C40.124973191%2C-81.294865644";
export const BILINOVICH_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.08738445%2C-81.30282620&waypoints=40.123106982%2C-81.353948693%7C40.095894612%2C-81.283992781%7C40.099684564%2C-81.297880136";
export const BEETLE_REVIEWED_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=40.185403%2C-80.922718&waypoints=40.1869745925099%2C-80.9192177275288%7C40.185340499%2C-80.919294431%7C40.185025%2C-80.920500";
export const DUKE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(DUKE_ROUTE_DESTINATION, DUKE_WAYPOINTS);
export const PORTERFIELD_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PORTERFIELD_ROUTE_DESTINATION, PORTERFIELD_WAYPOINTS);
export const PORTERFIELD_B_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PORTERFIELD_B_ROUTE_DESTINATION, PORTERFIELD_B_WAYPOINTS);
export const BAKOS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(BAKOS_ROUTE_DESTINATION, BAKOS_WAYPOINTS);
export const BANNOCK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(BANNOCK_ROUTE_DESTINATION, BANNOCK_WAYPOINTS);
export const ROCK_RIDGE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ROCK_RIDGE_ROUTE_DESTINATION, ROCK_RIDGE_WAYPOINTS);
export const CROWIE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CROWIE_ROUTE_DESTINATION, CROWIE_WAYPOINTS);
export const CASTON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CASTON_ROUTE_DESTINATION, CASTON_WAYPOINTS);
export const GIL_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(GIL_ROUTE_DESTINATION, GIL_WAYPOINTS);
export const GILCHER_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(GILCHER_ROUTE_DESTINATION, GILCHER_WAYPOINTS);
export const LAKE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(LAKE_ROUTE_DESTINATION, LAKE_WAYPOINTS);
export const THOMAS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(THOMAS_ROUTE_DESTINATION, THOMAS_WAYPOINTS);
export const TROYER_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TROYER_ROUTE_DESTINATION, TROYER_WAYPOINTS);
export const CIRCLE_OAKS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(CIRCLE_OAKS_ROUTE_DESTINATION, CIRCLE_OAKS_WAYPOINTS);
export const SADLER_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(SADLER_ROUTE_DESTINATION, SADLER_WAYPOINTS);
export const TOWE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TOWE_ROUTE_DESTINATION, TOWE_WAYPOINTS);
export const DUTTON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(DUTTON_ROUTE_DESTINATION, DUTTON_WAYPOINTS);
export const KUNGLE_B_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(KUNGLE_B_ROUTE_DESTINATION, KUNGLE_B_WAYPOINTS);
export const TRUCHAN_NW_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TRUCHAN_NW_ROUTE_DESTINATION, TRUCHAN_NW_WAYPOINTS);
export const MOONSTONE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MOONSTONE_ROUTE_DESTINATION, MOONSTONE_WAYPOINTS);
export const JEFFCO_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(JEFFCO_ROUTE_DESTINATION, JEFFCO_WAYPOINTS);
export const KUNGLE_A_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(KUNGLE_A_ROUTE_DESTINATION, KUNGLE_A_WAYPOINTS);
export const TRUCHAN_NE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(TRUCHAN_NE_ROUTE_DESTINATION, TRUCHAN_NE_WAYPOINTS);
export const MATUSEK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MATUSEK_ROUTE_DESTINATION, MATUSEK_WAYPOINTS);
export const LORRAINE_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(LORRAINE_ROUTE_DESTINATION, LORRAINE_WAYPOINTS);
export const ALBATROSS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ALBATROSS_ROUTE_DESTINATION, ALBATROSS_WAYPOINTS);
export const MALDON_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(MALDON_ROUTE_DESTINATION, MALDON_WAYPOINTS);
export const WITHEY_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(WITHEY_ROUTE_DESTINATION, WITHEY_WAYPOINTS);
export const SKULL_FORK_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(SKULL_FORK_ROUTE_DESTINATION, SKULL_FORK_WAYPOINTS);
export const HOOP_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(HOOP_ROUTE_DESTINATION, HOOP_WAYPOINTS);
export const BRAVO_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(BRAVO_ROUTE_DESTINATION, BRAVO_WAYPOINTS);
export const RUTH_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(RUTH_ROUTE_DESTINATION, RUTH_WAYPOINTS);
export const PICKENS_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(PICKENS_ROUTE_DESTINATION, PICKENS_WAYPOINTS);
export const ATHENA_REVIEWED_GOOGLE_URL = buildReviewedNavigationUrl(ATHENA_ROUTE_DESTINATION, ATHENA_WAYPOINTS);

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
  routeDestinationOverride?: "bilinovich_reviewed_odnr_pad_surface";
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
    routeDestinationOverride: "bilinovich_reviewed_odnr_pad_surface",
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
  {
    padId: "41f0bfc3-7be1-450f-abfc-96dce544547b",
    canonicalId: "41f0bfc3-7be1-450f-abfc-96dce544547b",
    legacyId: "ascent--porterfield-b",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "PORTERFIELD B",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 215 → US-40 → Vineyard Rd → Lease Road → OR → OH-331 → US-40 → Vineyard Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "US-40 → Vineyard Rd → saved GPS",
    routeUrl: PORTERFIELD_B_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → US-40 W → Vineyard Rd / CR-56 → saved pad GPS",
    finalLegNotice: "The reviewed handoff reuses the proven Vineyard Road turn controls but has PORTERFIELD B's own exact destination. Google remains on Vineyard Road for the final 0.4 mile and clips at the saved GPS; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.090438,
      longitude: -80.921210,
      source: "saved_pad_gps",
    },
    routeDestination: PORTERFIELD_B_ROUTE_DESTINATION,
    waypoints: PORTERFIELD_B_WAYPOINTS,
  },
  {
    padId: "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
    canonicalId: "19a4f7ef-4334-4b1c-8443-2c5ccb323d1d",
    legacyId: "ascent--rock-ridge",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "ROCK RIDGE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → 1st Cross Rd → Fairview Rd → Douglas/fairview Rd → Putney Ridge Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-800 → Shannon → Lowe → Fairview → Putney Ridge → entrance",
    routeUrl: ROCK_RIDGE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → I-70 Exit 202 → OH-800 S → Shannon Rd → Lowe Rd → Fairview Rd / first cross road → Douglas/Fairview Rd → Putney Ridge Rd → verified driver entrance",
    finalLegNotice: "The three shaping points sit inside official Shannon, Fairview, and Putney Ridge road identities and preserve the complete reviewed local-road order. The route clips at ROCK RIDGE's exact verified driver entrance; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.998772,
      longitude: -81.224825,
      source: "verified_driver_entrance",
    },
    routeDestination: ROCK_RIDGE_ROUTE_DESTINATION,
    waypoints: ROCK_RIDGE_WAYPOINTS,
  },
  {
    padId: "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
    canonicalId: "d7898e8c-1bb6-48f8-b5e0-87bc1898420e",
    legacyId: "ascent--bakos",
    recordRevision: "1787615581785257",
    company: "Ascent",
    padName: "BAKOS",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "US-250 → Right/west Onto Holly View Dr → OR → Holly View Dr → Pad → OR → US-250 → Left/west Onto Holy View Dr → No St Sign And Rd",
    title: "Navigate reviewed route",
    detail: "US-250 → Holly View Dr → saved GPS",
    routeUrl: BAKOS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → Holly View Dr / TR-452 → saved pad GPS",
    finalLegNotice: "The two shaping points come from BAKOS's exact current route receipt and preserve the turn from US-250 onto Holly View Drive. The route ends at BAKOS's exact saved GPS; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.151125,
      longitude: -80.852968,
      source: "saved_pad_gps",
    },
    routeDestination: BAKOS_ROUTE_DESTINATION,
    waypoints: BAKOS_WAYPOINTS,
  },
  {
    padId: "333598ca-37b3-4b44-9411-a490cc3da672",
    canonicalId: "333598ca-37b3-4b44-9411-a490cc3da672",
    legacyId: "ascent--bannock",
    recordRevision: "1786744183028038",
    company: "Ascent",
    padName: "BANNOCK",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → Lafferty-bannock Rd → Lease Road → OR → OH-9 → OH-149 → OH-331 → Lafferty-bannock Rd",
    title: "Navigate reviewed route",
    detail: "OH-331 → Lafferty-Bannock Rd / CR-10 → verified entrance",
    routeUrl: BANNOCK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-331 → Lafferty-Bannock Rd / CR-10 → unapproved entrance handoff → verified driver entrance",
    finalLegNotice: "The shaping point sits inside the exact Lafferty-Bannock Road / CR-10 identity and accepts either OH-331 approach direction without backtracking. Google's final short movement reaches BANNOCK's exact verified driver entrance but remains an unapproved entrance handoff; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.111003,
      longitude: -81.002932,
      source: "verified_driver_entrance",
    },
    routeDestination: BANNOCK_ROUTE_DESTINATION,
    waypoints: BANNOCK_WAYPOINTS,
  },
  {
    padId: "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
    canonicalId: "fba35b8e-ccc6-406b-b27c-ac9ce4eed29d",
    legacyId: "ascent--crowie",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "CROWIE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Exit 215 → US-40 → Vineyard Rd → Williams Rd → OR → Exit 213 → US-40",
    title: "Navigate reviewed route",
    detail: "US-40 → Vineyard Rd → Williams Rd → verified entrance",
    routeUrl: CROWIE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-40 → Vineyard Rd / CR-56 → Williams Rd → verified driver entrance",
    finalLegNotice: "The reviewed handoff follows US-40 and Vineyard Road, continues onto Williams Road, and ends at CROWIE's exact verified driver entrance. Exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.0979,
      longitude: -80.9384,
      source: "verified_driver_entrance",
    },
    routeDestination: CROWIE_ROUTE_DESTINATION,
    waypoints: CROWIE_WAYPOINTS,
  },
  {
    padId: "58c94af4-32b1-4f80-a278-a5f73688fa23",
    canonicalId: "58c94af4-32b1-4f80-a278-a5f73688fa23",
    legacyId: "ascent--caston",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "CASTON",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Jasper Rd → Caston Rd → OR → OH-513 → US-22 → Mc Coy Rd → Jasper Rd → Caston Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Jasper → Caston → saved GPS",
    routeUrl: CASTON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Jasper Rd / CR-93 → Caston Rd → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy Road, Jasper Road, and Caston Road to CASTON's exact saved GPS. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.130458,
      longitude: -81.328059,
      source: "saved_pad_gps",
    },
    routeDestination: CASTON_ROUTE_DESTINATION,
    waypoints: CASTON_WAYPOINTS,
  },
  {
    padId: "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
    canonicalId: "bd2e0e20-8aa8-4e05-a4c0-0af312234853",
    legacyId: "ascent--gil",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "GIL",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 / Mccoy Rd → Mccoy Rd → Merry Rd → Penrose Rd → Logan Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "McCoy → Merry → Penrose → Logan → saved GPS",
    routeUrl: GIL_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → Logan Rd / CR-964 → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Merry, Penrose, and Logan roads to GIL's exact saved GPS. The final saved point remains GPS destination evidence, not approved lease geometry.",
    trustedDestination: {
      latitude: 40.09387,
      longitude: -81.29646,
      source: "saved_pad_gps",
    },
    routeDestination: GIL_ROUTE_DESTINATION,
    waypoints: GIL_WAYPOINTS,
  },
  {
    padId: "71c9c874-5514-46a4-8d91-b105c6734799",
    canonicalId: "71c9c874-5514-46a4-8d91-b105c6734799",
    legacyId: "ascent--gilcher",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "GILCHER",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Merry Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Merry Rd → Penrose Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Merry → Penrose → saved GPS",
    routeUrl: GILCHER_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Merry Rd / TR-967 → Penrose Rd / CR-694 → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Merry, and Penrose roads to GILCHER's exact saved GPS. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.100079,
      longitude: -81.295657,
      source: "saved_pad_gps",
    },
    routeDestination: GILCHER_ROUTE_DESTINATION,
    waypoints: GILCHER_WAYPOINTS,
  },
  {
    padId: "ccf7415a-331b-440a-829d-28282a33cde1",
    canonicalId: "ccf7415a-331b-440a-829d-28282a33cde1",
    legacyId: "ascent--lake",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "LAKE",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → US-250 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd → OR → I-70 → Exit 193 → OH-513 → US-22 → Mc Coy Rd → Tyson Mill Rd → Pennyroyal Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Tyson Mill → Pennyroyal → saved GPS",
    routeUrl: LAKE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Tyson Mill Rd → Pennyroyal Rd → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Tyson Mill, and Pennyroyal roads, then ends at LAKE's exact saved GPS. Google's final unnamed turn is not approved lease geometry.",
    trustedDestination: {
      latitude: 40.14776,
      longitude: -81.295527,
      source: "saved_pad_gps",
    },
    routeDestination: LAKE_ROUTE_DESTINATION,
    waypoints: LAKE_WAYPOINTS,
  },
  {
    padId: "1e898176-672d-4174-8878-4aae0aee2128",
    canonicalId: "1e898176-672d-4174-8878-4aae0aee2128",
    legacyId: "ascent--thomas",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "THOMAS",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → Exit 193 → OH-513 → Tyson Mill Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-513 → Tyson Mill → saved GPS",
    routeUrl: THOMAS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "I-70 → Exit 193 → OH-513 N → Tyson Mill Rd → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows OH-513 to Tyson Mill Road and ends at THOMAS's exact saved GPS. Google's final unnamed turn remains an unapproved GPS handoff, not approved lease geometry.",
    trustedDestination: {
      latitude: 40.096986,
      longitude: -81.307667,
      source: "saved_pad_gps",
    },
    routeDestination: THOMAS_ROUTE_DESTINATION,
    waypoints: THOMAS_WAYPOINTS,
  },
  {
    padId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
    canonicalId: "6c93d03a-76e8-4c03-b47e-8b7011c81a1a",
    legacyId: "ascent--troyer",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "TROYER",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd → OR → OH-513 → US-22 → Mc Coy Rd → Pennyroyal Rd → Penrose Rd",
    title: "Navigate reviewed route",
    detail: "McCoy → Pennyroyal → Penrose → pad access → saved GPS",
    routeUrl: TROYER_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "US-22 E → McCoy Rd / CR-82 → Pennyroyal Rd / CR-95 → Penrose Rd / CR-694 → Jesse Ln / pad access → saved pad GPS",
    finalLegNotice: "The reviewed handoff follows McCoy, Pennyroyal, and Penrose roads. Google labels the final short movement Jesse Lane; that pad-access leg ends at TROYER's exact saved GPS and is not promoted to approved graph or public-Google authority.",
    trustedDestination: {
      latitude: 40.087025,
      longitude: -81.259818,
      source: "saved_pad_gps",
    },
    routeDestination: TROYER_ROUTE_DESTINATION,
    waypoints: TROYER_WAYPOINTS,
  },
  {
    padId: "b22c557a-950a-4ed7-a65a-f4730b9bc727",
    canonicalId: "b22c557a-950a-4ed7-a65a-f4730b9bc727",
    legacyId: "ascent--circle-oaks",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "CIRCLE-OAKS",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "OH-342 → OH-258 → Martha Rd → Titus Rd → Pad",
    title: "Navigate reviewed route",
    detail: "OH-258 → Martha → Titus → verified entrance",
    routeUrl: CIRCLE_OAKS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-258 → Martha Rd / CR-781 → Titus Rd / CR-878 → verified driver entrance",
    finalLegNotice: "The two shaping points sit inside official Martha and Titus road identities and accept either state-road approach direction without backtracking. Google briefly labels the first Martha segment Newtown Road; that renderer label is not promoted to a separate road identity. Exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.176413,
      longitude: -81.348770,
      source: "verified_driver_entrance",
    },
    routeDestination: CIRCLE_OAKS_ROUTE_DESTINATION,
    waypoints: CIRCLE_OAKS_WAYPOINTS,
  },
  {
    padId: "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
    canonicalId: "166c5d6c-3a8d-4481-b8bf-5d74b7605f0d",
    legacyId: "ascent--sadler",
    recordRevision: "1786440150388625",
    company: "Ascent",
    padName: "SADLER",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "US-250 → CR-86 / Jamison Rd → Pad",
    title: "Navigate reviewed route",
    detail: "US-250 → Jamison Rd / CR-86 → verified entrance",
    routeUrl: SADLER_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → Jamison Rd / CR-86 → verified driver entrance",
    finalLegNotice: "The shaping point sits inside the exact Jamison Road / CR-86 identity after its verified junction with US-250. Google currently spells the road Jameson; that renderer spelling is not promoted to a separate road identity. The route clips at SADLER's exact verified driver entrance; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.207568,
      longitude: -80.935841,
      source: "verified_driver_entrance",
    },
    routeDestination: SADLER_ROUTE_DESTINATION,
    waypoints: SADLER_WAYPOINTS,
  },
  {
    padId: "800c877a-6b4f-4a87-a710-b1e00af63c62",
    canonicalId: "800c877a-6b4f-4a87-a710-b1e00af63c62",
    legacyId: "ascent--towe",
    recordRevision: "1786159709605865",
    company: "Ascent",
    padName: "TOWE",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "Willis Run Rd → Oak Hill Rd → Pad",
    title: "Navigate reviewed route",
    detail: "US-250 → Willis Run Rd → Oak Hill Rd → verified entrance",
    routeUrl: TOWE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → Willis Run Rd / TR-213 → Oak Hill Rd / TR-212 → verified driver entrance",
    finalLegNotice: "The two shaping points sit inside the exact Willis Run and Oak Hill road identities after their verified junctions. They preserve the owner-reviewed road order from US-250 and accept either state-road approach direction without backtracking. The route clips at TOWE's exact verified driver entrance; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.385998,
      longitude: -81.212569,
      source: "verified_driver_entrance",
    },
    routeDestination: TOWE_ROUTE_DESTINATION,
    waypoints: TOWE_WAYPOINTS,
  },
  {
    padId: "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
    canonicalId: "fbdb5ee4-38d6-4801-81cc-8ad4abbb24e2",
    legacyId: "ascent--dutton",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "DUTTON",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 213 → OH-331 → Dutton Dr → OR → OH-9 → OH-149 → OH-331 → Dutton Dr → OR → OH-331 → Dutton Dr",
    title: "Navigate reviewed route",
    detail: "OH-331 → Dutton Dr / TR-1586 → unapproved GPS handoff",
    routeUrl: DUTTON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-331 → Dutton Dr / TR-1586 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside DUTTON's exact Dutton Drive / TR-1586 identity after its verified OH-331 junction and accepts the reviewed state-road approaches without backtracking. Movement from the last exact public-road geometry to DUTTON's saved pad GPS remains an unapproved access/GPS handoff; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.150027,
      longitude: -81.017133,
      source: "saved_pad_gps",
    },
    routeDestination: DUTTON_ROUTE_DESTINATION,
    waypoints: DUTTON_WAYPOINTS,
  },
  {
    padId: "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
    canonicalId: "ad5ef012-46f5-46ca-93c7-0f5b492cb201",
    legacyId: "ascent--kungle-b",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "KUNGLE B",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-2 → OH-872W → OH-7S → OH-148W → Potts Rd → OR → OH-556E → Clover Ridge Rd → OH-148E → Potts Rd → OR → OH-9 → OH-148E → Potts Rd",
    title: "Navigate reviewed route",
    detail: "OH-148 → Potts Rd / TR-506 → saved GPS",
    routeUrl: KUNGLE_B_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-148 → Potts Rd / TR-506 → unapproved entrance/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside KUNGLE B's exact Potts Road / TR-506 identity after its verified OH-148 junction and accepts either state-road approach direction without backtracking. The final short movement reaches the exact saved pad GPS but remains an unapproved entrance/GPS handoff; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.88678,
      longitude: -80.87008,
      source: "saved_pad_gps",
    },
    routeDestination: KUNGLE_B_ROUTE_DESTINATION,
    waypoints: KUNGLE_B_WAYPOINTS,
  },
  {
    padId: "c10e2066-d6b7-4117-aea9-137dd1237b3a",
    canonicalId: "c10e2066-d6b7-4117-aea9-137dd1237b3a",
    legacyId: "ascent--truchan-nw",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "TRUCHAN NW",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd",
    title: "Navigate reviewed route",
    detail: "OH-9 → Shepherdstown → Fairpoint-Shepherdstown → saved GPS",
    routeUrl: TRUCHAN_NW_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → unapproved entrance/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping points sit inside TRUCHAN NW's exact Shepherdstown Road / CR-64 and Fairpoint-Shepherdstown Road / TR-216 identities after their verified junctions. Google currently spells the terminal road Shepardstown; that renderer spelling is not promoted to a separate road identity. The final saved-GPS movement remains an unapproved entrance/GPS handoff, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.147814,
      longitude: -80.935886,
      source: "saved_pad_gps",
    },
    routeDestination: TRUCHAN_NW_ROUTE_DESTINATION,
    waypoints: TRUCHAN_NW_WAYPOINTS,
  },
  {
    padId: "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
    canonicalId: "ca1560b5-4ea6-4eb7-a82e-de2467937eb2",
    legacyId: "ascent--moonstone",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "MOONSTONE",
    state: "Ohio",
    county: "Noble",
    structuredRoadSequence: "OH-147 → OH-513 → OH-146 → Lew Marten Rd → Pad",
    title: "Navigate reviewed route",
    detail: "OH-146 → Lew Martin Rd / TR-228 → saved GPS",
    routeUrl: MOONSTONE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-146 → Lew Martin Rd / TR-228 → unapproved entrance/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside MOONSTONE's exact Lew Martin Road / TR-228 identity after its verified OH-146 junction and accepts either state-road approach direction without backtracking. The record spells the road Lew Marten; the exact official identity spells it Lew Martin. The terminal Pad occurrence and final saved-GPS movement remain held and unapproved; exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.83664,
      longitude: -81.379628,
      source: "saved_pad_gps",
    },
    routeDestination: MOONSTONE_ROUTE_DESTINATION,
    waypoints: MOONSTONE_WAYPOINTS,
  },
  {
    padId: "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
    canonicalId: "9aa065c0-8896-49e2-b02d-d4ca71acefc3",
    legacyId: "ascent--jeffco",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "JEFFCO",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-151 → Rose Valley Rd → Beech Rd → Pad",
    title: "Navigate reviewed route",
    detail: "OH-151 → Rose Valley Rd / CR-14 → Beech Rd / TR-64 → unapproved GPS handoff",
    routeUrl: JEFFCO_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-151 → Rose Valley Rd / CR-14 → Beech Rd / TR-64 → unapproved GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping points sit inside JEFFCO's exact Rose Valley Road / CR-14 and Beech Road / TR-64 identities after their verified junctions. Google reaches the exact saved pad GPS after about 0.4 mile on Beech Road from either OH-151 direction without backtracking. The terminal Pad occurrence and saved-GPS handoff remain unapproved; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.292482,
      longitude: -80.896856,
      source: "saved_pad_gps",
    },
    routeDestination: JEFFCO_ROUTE_DESTINATION,
    waypoints: JEFFCO_WAYPOINTS,
  },
  {
    padId: "47a0305e-c641-499b-990c-0f7fe83493b8",
    canonicalId: "47a0305e-c641-499b-990c-0f7fe83493b8",
    legacyId: "ascent--kungle-a",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "KUNGLE A",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "OH-2 → OH-872 → OH-7 → OH-148 → Potts Rd → OR → OH-556 → Clover Ridge Rd → OH-148 → Potts Rd → OR → OH-147 → OH-148 → Potts Rd",
    title: "Navigate reviewed route",
    detail: "OH-148 → Potts Rd / TR-506 → unapproved GPS handoff",
    routeUrl: KUNGLE_A_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-148 → Potts Rd / TR-506 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The shaping point sits inside KUNGLE A's exact Potts Road / TR-506 identity after its verified OH-148 junction and accepts either state-road approach direction without backtracking. Exact public-road geometry ends before the saved pad GPS; the remaining movement is an unapproved access/GPS handoff. The saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 39.88507,
      longitude: -80.88258,
      source: "saved_pad_gps",
    },
    routeDestination: KUNGLE_A_ROUTE_DESTINATION,
    waypoints: KUNGLE_A_WAYPOINTS,
  },
  {
    padId: "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
    canonicalId: "cd4f6dcc-b603-4155-84b2-30d7ee87bbc7",
    legacyId: "ascent--truchan-ne",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "TRUCHAN NE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 216 → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → OR → OH-9 → Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd",
    title: "Navigate reviewed route",
    detail: "OH-9 → Shepherdstown → Fairpoint-Shepherdstown → Sloans Run → unapproved GPS handoff",
    routeUrl: TRUCHAN_NE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The first two shaping points reuse the exact Shepherdstown Road / CR-64 and Fairpoint-Shepherdstown Road / TR-216 corridor receipts; the third sits inside the exact Sloans Run Road / TR-704 identity after its verified Fairpoint-Shepherdstown junction. Google reaches TRUCHAN NE from both reviewed origins without backtracking. Movement beyond the last exact public-road geometry to the saved pad GPS remains an unapproved access/GPS handoff; the saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.146637,
      longitude: -80.931651,
      source: "saved_pad_gps",
    },
    routeDestination: TRUCHAN_NE_ROUTE_DESTINATION,
    waypoints: TRUCHAN_NE_WAYPOINTS,
  },
  {
    padId: "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
    canonicalId: "d6d0a0fd-1cd3-48ae-8e41-90d744b9f8f6",
    legacyId: "ascent--matusek",
    recordRevision: "1786258360881449",
    company: "Ascent",
    padName: "MATUSEK",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → OH-9 / Shepherdstown Rd → Fairpoint Shepherdstown Rd → Sloans Run Rd → See Dunn Rd → Lease Road → OR → Dunn Rd",
    title: "Navigate reviewed route",
    detail: "OH-9 → Shepherdstown → Fairpoint-Shepherdstown → Sloans Run → unapproved GPS handoff",
    routeUrl: MATUSEK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → OH-9 → Shepherdstown Rd / CR-64 → Fairpoint-Shepherdstown Rd / TR-216 → Sloans Run Rd / TR-704 → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The first two shaping points reuse the exact Shepherdstown Road / CR-64 and Fairpoint-Shepherdstown Road / TR-216 corridor receipts; the third sits inside the exact Sloans Run Road / TR-704 identity after its verified Fairpoint-Shepherdstown junction. Google reaches MATUSEK from both reviewed origins without backtracking. Google may render the destination as Dunn Road, but that renderer label is not promoted to exact public-road identity; the post-Sloans movement to the saved pad GPS remains an unapproved access/GPS handoff, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.146555,
      longitude: -80.922785,
      source: "saved_pad_gps",
    },
    routeDestination: MATUSEK_ROUTE_DESTINATION,
    waypoints: MATUSEK_WAYPOINTS,
  },
  {
    padId: "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
    canonicalId: "a35f0ea7-13d7-45dd-8fe2-fe73e4964df2",
    legacyId: "ascent--lorraine",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "LORRAINE",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "US-250 → CR-5 / Crescent Rd → CR-10 → CR10 Barton Blaine Rd",
    title: "Navigate reviewed route",
    detail: "US-250 → Crescent Rd / CR-5 → Barton-Blaine Rd / CR-10 → unapproved GPS handoff",
    routeUrl: LORRAINE_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-road approach → US-250 → CR-5 / Crescent Rd → shared CR-5 / CR-10 pavement → CR-10 / Barton-Blaine Rd → unapproved access/GPS handoff → saved pad GPS",
    finalLegNotice: "The first shaping point sits inside CR-5 after its verified US-250 junction; the second sits inside CR-10 after the verified CR-5/CR-10 shared pavement, and the third keeps the route on CR-10 / Barton-Blaine Road near the final access. Shared pavement is not described as a separate physical turn. Google preserves the reviewed sequence from either US-250 direction without backtracking. Exact CR-10 public-road geometry ends before LORRAINE's saved pad GPS, so the remaining movement is an unapproved access/GPS handoff. The saved point is not relabeled as a verified entrance, and exact graph/public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.09955,
      longitude: -80.840213,
      source: "saved_pad_gps",
    },
    routeDestination: LORRAINE_ROUTE_DESTINATION,
    waypoints: LORRAINE_WAYPOINTS,
  },
  {
    padId: "48d810bf-e59f-4314-9efb-8103a818a3bd",
    canonicalId: "48d810bf-e59f-4314-9efb-8103a818a3bd",
    legacyId: "ascent--albatross",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "ALBATROSS",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Brooks Rd",
    title: "Navigate reviewed route",
    detail: "Brooks Rd → unapproved GPS handoff",
    routeUrl: ALBATROSS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → OH-800 near Brooks Rd → Brooks Rd → unapproved GPS handoff to saved pad GPS",
    finalLegNotice: "The reviewed local approach reaches Brooks Road. Movement from the last reviewed named road to ALBATROSS's exact saved GPS remains an unapproved GPS handoff. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.079353,
      longitude: -81.224381,
      source: "saved_pad_gps",
    },
    routeDestination: ALBATROSS_ROUTE_DESTINATION,
    waypoints: ALBATROSS_WAYPOINTS,
  },
  {
    padId: "8f616827-d7da-4b40-b9c2-49fd5e713822",
    canonicalId: "8f616827-d7da-4b40-b9c2-49fd5e713822",
    legacyId: "ascent--maldon",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "MALDON",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → Shannon Rd → Lowe Rd → Pad",
    title: "Navigate reviewed route",
    detail: "Shannon → Lowe → unapproved GPS handoff",
    routeUrl: MALDON_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Shannon Rd → Lowe Rd → unapproved GPS handoff to saved pad GPS",
    finalLegNotice: "The reviewed local approach follows Shannon Road and Lowe Road. Movement from the last reviewed named road to MALDON's exact saved GPS remains an unapproved GPS handoff. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.010241,
      longitude: -81.197285,
      source: "saved_pad_gps",
    },
    routeDestination: MALDON_ROUTE_DESTINATION,
    waypoints: MALDON_WAYPOINTS,
  },
  {
    padId: "f2df293f-13a2-401e-96b2-21e71ac63e6a",
    canonicalId: "f2df293f-13a2-401e-96b2-21e71ac63e6a",
    legacyId: "ascent--withey",
    recordRevision: "1786246617744175",
    company: "Ascent",
    padName: "WITHEY",
    state: "Ohio",
    county: "Belmont",
    structuredRoadSequence: "Exit 202 → I-70 → OH-800 → Gobblers Knob Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "Gobblers Knob Rd → verified entrance",
    routeUrl: WITHEY_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Gobblers Knob Rd → verified driver entrance",
    finalLegNotice: "The reviewed local approach follows Gobblers Knob Road to WITHEY's exact verified driver entrance. Google's upstream route remains origin-dependent; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 39.962005,
      longitude: -81.216813,
      source: "verified_driver_entrance",
    },
    routeDestination: WITHEY_ROUTE_DESTINATION,
    waypoints: WITHEY_WAYPOINTS,
  },
  {
    padId: "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
    canonicalId: "06ac93a2-3b46-44fd-9fa6-2fd29201858a",
    legacyId: "ascent--skull-fork",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "SKULL FORK",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-70 → Exit 202 → OH-800 → US-22 → Repik Ln → Pad",
    title: "Navigate reviewed route",
    detail: "Repik Ln → verified entrance",
    routeUrl: SKULL_FORK_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Repik Ln → verified driver entrance",
    finalLegNotice: "The reviewed local shaping point preserves Repik Lane to SKULL FORK's exact verified driver entrance. Google's upstream route remains origin-dependent; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.159734,
      longitude: -81.260675,
      source: "verified_driver_entrance",
    },
    routeDestination: SKULL_FORK_ROUTE_DESTINATION,
    waypoints: SKULL_FORK_WAYPOINTS,
  },
  {
    padId: "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
    canonicalId: "351b72fb-eb48-4355-b6fc-d8e9a867f79c",
    legacyId: "ascent--hoop",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "HOOP",
    state: "Ohio",
    county: "Guernsey",
    structuredRoadSequence: "I-77 → US-22 → Titus Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "US-22 E → Titus Rd → unapproved GPS/lease handoff",
    routeUrl: HOOP_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach to reviewed US-22 anchor → US-22 E → Titus Rd → unapproved GPS/lease handoff to saved pad GPS",
    finalLegNotice: "Three ordered shaping points preserve the reviewed US-22 east approach and turn onto Titus Road without the Pennyroyal Road shortcut. The reviewed named-road approach ends on Titus Road. Google may display Hoop Lane during the remaining movement to HOOP's exact saved GPS, but that label is not promoted to reviewed road authority. The entire post-Titus movement remains an unapproved GPS/lease handoff, not approved public-road geometry.",
    trustedDestination: {
      latitude: 40.166384,
      longitude: -81.325728,
      source: "saved_pad_gps",
    },
    routeDestination: HOOP_ROUTE_DESTINATION,
    waypoints: HOOP_WAYPOINTS,
  },
  {
    padId: "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
    canonicalId: "4c73e244-6132-4d40-83fc-3fe5e6e65bf6",
    legacyId: "ascent--bravo",
    recordRevision: "1786265812046205",
    company: "Ascent",
    padName: "BRAVO",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-519 → Hite Rd → Lease Road",
    title: "Navigate reviewed route",
    detail: "Hite Rd (Google: Crazy Rd) → unapproved GPS handoff",
    routeUrl: BRAVO_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → Hite Rd (displayed by Google as Crazy Rd) → unapproved GPS/lease handoff to saved pad GPS",
    finalLegNotice: "The stored reviewed sequence names Hite Road; Google displays the shaped segment as Crazy Road. Google's label is not treated as a new or approved road identity. The final short unnamed movement to BRAVO's exact saved GPS remains an unapproved GPS/lease handoff.",
    trustedDestination: {
      latitude: 40.178556,
      longitude: -81.015064,
      source: "saved_pad_gps",
    },
    routeDestination: BRAVO_ROUTE_DESTINATION,
    waypoints: BRAVO_WAYPOINTS,
  },
  {
    padId: "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
    canonicalId: "7dcd1f71-fa32-4edc-ae3d-aa9717d0c72c",
    legacyId: "ascent--ruth",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "RUTH",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "US-250 E → Lease Road",
    title: "Navigate reviewed route",
    detail: "US-250 → unapproved entrance turn → verified entrance",
    routeUrl: RUTH_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → US-250 near entrance → unapproved entrance movement → verified driver entrance",
    finalLegNotice: "The reviewed shaping point reaches US-250 near RUTH. The final turn and movement to RUTH's exact verified driver entrance remain an unapproved entrance handoff and are not promoted to approved public-road geometry.",
    trustedDestination: {
      latitude: 40.173626,
      longitude: -80.879115,
      source: "verified_driver_entrance",
    },
    routeDestination: RUTH_ROUTE_DESTINATION,
    waypoints: RUTH_WAYPOINTS,
  },
  {
    // The corrected owner-supplied field screenshot showed that the former
    // control was still on OH-519 east of the pad connector and could make an
    // approach from the other direction pass the turn and double back. This
    // control is the exact physical junction from the later owner screenshot.
    // Google currently labels the connector Georgetown Road, but that
    // renderer label is not promoted to an authoritative driver-facing road
    // identity. The phone remains the origin,
    // so Google can approach the same turn from either state-route direction.
    padId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
    canonicalId: "75600d0c-17b8-488b-96c9-4b7b8ffc8b1b",
    legacyId: "ascent--pickens",
    recordRevision: "1787615581785257",
    company: "Ascent",
    padName: "PICKENS",
    state: "Ohio",
    county: "Harrison",
    structuredRoadSequence: "OH-9 south → Turn left onto OH-519 east → Turn right onto Lease Road",
    title: "Navigate reviewed route",
    detail: "OH-519 / Stumptown Rd → unapproved access road → verified entrance",
    routeUrl: PICKENS_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected state-route approach → OH-519 / Stumptown Rd → unapproved access-road handoff → verified driver entrance",
    finalLegNotice: "The corrected shaping point is the owner-confirmed PICKENS pad-connector turn from OH-519 / Stumptown Road. Google currently labels that connector Georgetown Road, but the label is renderer context only. The access-road movement to the verified driver entrance is not approved public-road geometry; exact graph and public-Google authority remain separate.",
    trustedDestination: {
      latitude: 40.182544,
      longitude: -80.977135,
      source: "verified_driver_entrance",
    },
    routeDestination: PICKENS_ROUTE_DESTINATION,
    waypoints: PICKENS_WAYPOINTS,
  },
  {
    padId: "3850e94a-826f-4b6b-a54f-d21d482fca46",
    canonicalId: "3850e94a-826f-4b6b-a54f-d21d482fca46",
    legacyId: "ascent--athena",
    recordRevision: "1787459253071652",
    company: "Ascent",
    padName: "ATHENA",
    state: "Ohio",
    county: "Jefferson",
    structuredRoadSequence: "OH-151 → Pad",
    title: "Navigate reviewed route",
    detail: "OH-151 → unapproved GPS handoff",
    routeUrl: ATHENA_REVIEWED_GOOGLE_URL,
    reviewedRoadSequence: "Google-selected approach → OH-151 near pad → unapproved GPS handoff to saved pad GPS",
    finalLegNotice: "The reviewed shaping point reaches OH-151 near ATHENA. Movement to ATHENA's exact saved GPS remains an unapproved GPS handoff. The saved point is not relabeled as a verified entrance; exact graph and public Google authority remain separate.",
    trustedDestination: {
      latitude: 40.278613,
      longitude: -80.765988,
      source: "saved_pad_gps",
    },
    routeDestination: ATHENA_ROUTE_DESTINATION,
    waypoints: ATHENA_WAYPOINTS,
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

  const routeDestinationMatchesTrusted = Math.abs(
    contract.routeDestination.latitude - contract.trustedDestination.latitude,
  ) <= 1e-9 && Math.abs(
    contract.routeDestination.longitude - contract.trustedDestination.longitude,
  ) <= 1e-9;
  const isExactBilinovichPadSurfaceOverride = contract.padId === "59061829-1122-4aae-872d-cf5024310373"
    && contract.routeDestinationOverride === "bilinovich_reviewed_odnr_pad_surface";
  if (!routeDestinationMatchesTrusted && !isExactBilinovichPadSurfaceOverride) return null;

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
